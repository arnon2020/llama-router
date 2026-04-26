#!/usr/bin/env python3
"""
llama-router Web Management UI
Flask backend for managing llama.cpp router models and config
"""

import os
import configparser
import requests
import docker
import shutil
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, jsonify, request, render_template, Response, stream_with_context
from urllib.parse import urlparse
from pathlib import Path
import lifecycle as lifecycle_mod
from datetime import datetime
from typing import Tuple, Optional
import threading
import queue
import json
import time

app = Flask(__name__)

# Initialize lifecycle management
lifecycle_mod.init()

# Persistent download progress tracking
DOWNLOADS_FILE = '/data/downloads.json'
downloads_lock = threading.Lock()

# Track active download threads for pause/stop/resume
active_downloads = {}  # download_id -> {'thread': thread, 'paused': bool, 'stopped': bool}

def load_downloads():
    """Load downloads from persistent storage"""
    try:
        if os.path.exists(DOWNLOADS_FILE):
            with open(DOWNLOADS_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        app.logger.error(f"Failed to load downloads: {e}")
    return {}

def save_downloads(downloads):
    """Save downloads to persistent storage"""
    try:
        os.makedirs(os.path.dirname(DOWNLOADS_FILE), exist_ok=True)
        with open(DOWNLOADS_FILE, 'w') as f:
            json.dump(downloads, f, indent=2)
    except Exception as e:
        app.logger.error(f"Failed to save downloads: {e}")

def update_download_status(download_id, status, **kwargs):
    """Update download status and persist to disk"""
    with downloads_lock:
        downloads = load_downloads()
        if download_id not in downloads:
            downloads[download_id] = {
                'id': download_id,
                'created_at': datetime.utcnow().isoformat()
            }
        downloads[download_id]['status'] = status
        downloads[download_id]['updated_at'] = datetime.utcnow().isoformat()
        downloads[download_id].update(kwargs)
        save_downloads(downloads)

def get_download_status(download_id):
    """Get download status"""
    with downloads_lock:
        downloads = load_downloads()
        return downloads.get(download_id)

def get_all_downloads():
    """Get all downloads, sorted by creation time (newest first)"""
    with downloads_lock:
        downloads = load_downloads()
        # Remove old completed downloads (older than 1 hour)
        now = time.time()
        active_downloads = {}
        for did, data in downloads.items():
            created_at = data.get('created_at', '')
            try:
                created_time = datetime.fromisoformat(created_at).timestamp()
                # Keep if active/paused, or if complete/error but less than 1 hour old
                # Stopped downloads are removed from list
                status = data.get('status')
                if status in ['starting', 'downloading', 'validating', 'paused']:
                    active_downloads[did] = data
                elif status == 'stopped':
                    # Don't show stopped downloads
                    pass
                elif now - created_time < 3600:  # 1 hour
                    active_downloads[did] = data
            except:
                if data.get('status') != 'stopped':
                    active_downloads[did] = data
        save_downloads(active_downloads)
        return active_downloads

# Security: Allowed hosts for model downloads (SSRF prevention)
ALLOWED_HOSTS = {
    'huggingface.co',
    'hf.co',
    'github.com',
    'cdn-lfs.huggingface.co',
    'huggingface.co'
}

def is_download_url_safe(url: str) -> Tuple[bool, Optional[str]]:
    """
    Validate URL for SSRF protection.
    Returns (is_safe, error_message)
    """
    try:
        parsed = urlparse(url)

        # Check scheme
        if parsed.scheme not in ('http', 'https'):
            return False, "Only HTTP/HTTPS URLs are allowed"

        # Check hostname against whitelist
        hostname = parsed.hostname or ''
        if not hostname:
            return False, "Invalid URL hostname"

        # Check if hostname or any parent domain is in ALLOWED_HOSTS
        hostname_parts = hostname.split('.')
        is_allowed = False
        for i in range(len(hostname_parts)):
            domain = '.'.join(hostname_parts[i:])
            if domain in ALLOWED_HOSTS:
                is_allowed = True
                break

        if not is_allowed:
            return False, f"Host '{hostname}' is not in the allowed list. Allowed: {', '.join(sorted(ALLOWED_HOSTS))}"

        return True, None
    except Exception as e:
        return False, f"URL parsing error: {str(e)}"

def validate_gguf_file(filepath: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that a file is a proper GGUF model file.
    Checks filename extension and magic bytes.
    Returns (is_valid, error_message)
    """
    # Check filename extension
    if not filepath.lower().endswith('.gguf'):
        return False, "Model filename must end with .gguf extension"

    # Check magic bytes
    try:
        with open(filepath, 'rb') as f:
            magic = f.read(4)
            if magic != b'GGUF':
                return False, "File is not a valid GGUF model (invalid magic bytes)"
    except Exception as e:
        return False, f"Failed to validate file: {str(e)}"

    return True, None

# Configure logging
log_dir = os.getenv('LOG_DIR', '/logs')
os.makedirs(log_dir, exist_ok=True)

log_handler = RotatingFileHandler(
    os.path.join(log_dir, 'web.log'),
    maxBytes=5*1024*1024,  # 5MB
    backupCount=3
)
log_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
app.logger.addHandler(log_handler)
app.logger.setLevel(logging.INFO)

# Configuration from environment variables
LLAMA_HOST = os.getenv('LLAMA_HOST', 'http://llama-router:8080')
CONFIG_PATH = os.getenv('CONFIG_PATH', '/config/config.ini')
MODELS_DIR = os.getenv('MODELS_DIR', '/models')

# Fallback to host.docker.internal for local development
if LLAMA_HOST == 'http://llama-router:8080':
    LLAMA_HOST_FALLBACK = 'http://host.docker.internal:8080'
else:
    LLAMA_HOST_FALLBACK = None

# Docker client
docker_client = docker.from_env()

def get_llama_status():
    """Check llama-server health status"""
    hosts = [LLAMA_HOST]
    if LLAMA_HOST_FALLBACK:
        hosts.append(LLAMA_HOST_FALLBACK)

    for host in hosts:
        try:
            response = requests.get(f'{host}/health', timeout=2)
            if response.status_code == 200:
                return True, host
        except requests.RequestException:
            continue

    return False, None

def get_loaded_models():
    """Get dict of model statuses from llama-server (returns {name: status} dict)"""
    online, host = get_llama_status()
    if not online:
        return {}

    try:
        response = requests.get(f'{host}/models', timeout=5)
        if response.status_code == 200:
            data = response.json()
            # Return dict with model names and their actual status values
            return {
                model['id']: model.get('status', {}).get('value', 'idle')
                for model in data.get('data', [])
            }
    except requests.RequestException:
        pass

    return {}

def read_config():
    """Parse config.ini and return as dict, deduplicated by model path"""
    config = configparser.ConfigParser()
    config.read(CONFIG_PATH)

    models = {}
    seen_paths = set()  # Track model paths to avoid duplicates

    for section in config.sections():
        settings = dict(config.items(section))
        model_path = settings.get('model', '')

        if model_path:
            # Deduplicate: skip if we've seen this path before
            if model_path in seen_paths:
                app.logger.warning(f"Duplicate model path in config: {section} -> {model_path} (skipping)")
                continue
            seen_paths.add(model_path)

        models[section] = settings

    return models

def write_config(models):
    """Write models dict to config.ini"""
    config = configparser.ConfigParser()

    for name, settings in models.items():
        config.add_section(name)
        for key, value in settings.items():
            config.set(name, key, value)

    with open(CONFIG_PATH, 'w') as f:
        config.write(f)

def restart_llama_router():
    """Restart llama-router container via Docker"""
    try:
        container = docker_client.containers.get('llama-router')
        container.restart()
        return True
    except Exception as e:
        print(f"Failed to restart container: {e}")
        return False

@app.route('/favicon.ico')
def favicon():
    """Serve favicon.ico"""
    from flask import send_from_directory
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/')
def index():
    """Serve main UI"""
    return render_template('base.html')


@app.route('/chat')
def chat_page():
    return render_template('base.html')

@app.route('/models')
def models_page():
    return render_template('base.html')

@app.route('/profiles')
def profiles_page():
    return render_template('base.html')

@app.route('/downloads')
def downloads_page():
    return render_template('base.html')

@app.route('/settings')
def settings_page():
    return render_template('base.html')

@app.route('/api/status')
def status():
    """Get server status"""
    online, active_host = get_llama_status()
    return jsonify({
        'online': online,
        'host': active_host
    })

def format_size(size_bytes):
    """Format bytes to human readable size"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"

def parse_model_info(name):
    """Parse model name to extract organization (by) and quantization type (quant)"""
    # Default values
    by = 'Unknown'
    quant = '-'

    # Try to extract from common patterns like "org-model-quant" or "model-quant"
    name_lower = name.lower()

    # Check for known quantization patterns
    quant_patterns = [
        'q8_0', 'q8', 'q7_k', 'q6_k', 'q5_k_m', 'q5_k_l', 'q5_k_s', 'q5_0', 'q5_1',
        'q4_k_m', 'q4_k_l', 'q4_k_s', 'q4_0', 'q4_1', 'q4', 'q3_k_m', 'q3_k_l', 'q3_k_s',
        'q2_k', 'q2_k_s', 'q2_k_l', 'iq2_xxs', 'iq2_xs', 'iq2_s', 'iq3_xxs', 'iq3_s',
        'iq4_nl', 'iq4_xs', 'f32', 'f16', 'bf16'
    ]

    for pattern in quant_patterns:
        if pattern in name_lower:
            # Format quantization type nicely (e.g., q4_k_m -> Q4_K_M)
            quant = pattern.upper().replace('_', '-')
            break

    # Try to extract organization from patterns like:
    # "smollm2-1.7b-instruct-q4_k_m" -> by = "HuggingFace" (default)
    # "qwen3-4b-it-q4_k_m" -> by = "Qwen"
    # "unsloth-qwen3-4b" -> by = "Unsloth"

    org_keywords = {
        'unsloth': 'Unsloth',
        'qwen': 'Qwen',
        'llama': 'Meta',
        'smollm': 'HuggingFace',
        'mistral': 'Mistral AI',
        'mixtral': 'Mistral AI',
        'gemma': 'Google',
        'phi': 'Microsoft',
        'deepseek': 'DeepSeek',
        'internlm': 'InternLM',
        'yi': '01.AI',
        'codegemma': 'Google',
        'replit': 'Replit',
        'stablelm': 'Stability AI',
    }

    for keyword, org in org_keywords.items():
        if keyword in name_lower:
            by = org
            break

    return by, quant


@app.route('/api/models')
def list_models():
    """Get all models from config with loaded status"""
    # Auto-scan and add missing models
    scan_and_add_missing_models()
    config_models = read_config()
    model_statuses = get_loaded_models()  # Now returns {name: status} dict

    result = []
    for name, settings in config_models.items():
        status = model_statuses.get(name, 'idle')  # Get actual status or 'idle'

        # Get file stats
        model_path = settings.get('model', '')
        size = '-'
        created = '-'

        if model_path.startswith('/models/'):
            full_path = os.path.join(MODELS_DIR, os.path.basename(model_path))
            if os.path.exists(full_path):
                stat_info = os.stat(full_path)
                size = format_size(stat_info.st_size)
                # Format created date
                created = datetime.fromtimestamp(stat_info.st_ctime).strftime('%Y-%m-%d %H:%M')

        # Parse model info
        by, quant = parse_model_info(name)

        result.append({
            'name': name,
            'model': settings.get('model', ''),
            'status': status,  # New field with actual status value
            'size': size,
            'created': created,
            'by': by,
            'quant': quant,
            # Keep backward compatibility for existing code
            'ctx-size': settings.get('ctx-size', ''),
            'n-gpu-layers': settings.get('n-gpu-layers', ''),
            'temp': settings.get('temp', ''),
            'loaded': status == 'loaded',
            'top-p': settings.get('top-p', ''),
            'min-p': settings.get('min-p', ''),
            'reasoning': settings.get('reasoning', 'off'),
            'flash-attn': settings.get('flash-attn', 'false'),
            'fa': settings.get('fa', 'false'),
            'mmproj': settings.get('mmproj', ''),
            'chat-template-file': settings.get('chat-template-file', ''),
            'cache-ram': settings.get('cache-ram', '0'),
            'np': settings.get('np', '1'),
            'port': settings.get('port', '8080'),
            'host': settings.get('host', os.getenv('LLAMA_HOST', '0.0.0.0'))
        })

    return jsonify(result)

@app.route('/api/models/<name>/load', methods=['POST'])
def load_model(name):
    """Load a model via llama-server"""
    online, host = get_llama_status()
    if not online:
        return jsonify({'error': 'Server offline'}), 503

    try:
        response = requests.post(
            f'{host}/models/load',
            json={'model': name},
            timeout=30  # Reduced from 60 to 30 seconds
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<name>/unload', methods=['POST'])
def unload_model(name):
    """Unload a model via llama-server"""
    online, host = get_llama_status()
    if not online:
        return jsonify({'error': 'Server offline'}), 503

    try:
        response = requests.post(
            f'{host}/models/unload',
            json={'model': name},
            timeout=30  # Reduced from 60 to 30 seconds
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<name>', methods=['DELETE'])
def remove_model(name):
    """Remove a model completely (unload, delete file, remove config)"""
    config_models = read_config()

    if name not in config_models:
        return jsonify({'error': 'Model not found in config'}), 404

    model_file = config_models[name].get('model', '')
    model_path = os.path.join(MODELS_DIR, os.path.basename(model_file))

    # Unload if currently loaded
    online, host = get_llama_status()
    if online:
        try:
            requests.post(f'{host}/models/unload', json={'model': name}, timeout=30)
        except requests.RequestException:
            pass

    # Delete model file
    try:
        if os.path.exists(model_path):
            os.remove(model_path)
    except Exception as e:
        return jsonify({'error': f'Failed to delete file: {e}'}), 500

    # Remove from config
    del config_models[name]
    write_config(config_models)

    # Restart container to apply config changes
    restart_success = restart_llama_router()

    return jsonify({
        'success': True,
        'restarted': restart_success
    })

def scan_and_add_missing_models():
    """Scan models directory and add missing GGUF files to config.ini"""
    try:
        config_models = read_config()
        configured_files = set()
        for name, settings in config_models.items():
            model_path = settings.get('model', '')
            if model_path.startswith('/models/'):
                configured_files.add(os.path.basename(model_path))

        # Scan for GGUF files
        added_count = 0
        if os.path.exists(MODELS_DIR):
            for filename in os.listdir(MODELS_DIR):
                if filename.endswith('.gguf') and filename not in configured_files:
                    # Create friendly name from filename
                    model_name = os.path.splitext(filename)[0]

                    # Add to config with default settings
                    config_models[model_name] = {
                        'model': f'/models/{filename}',
                        'ctx-size': '8192',
                        'n-gpu-layers': '99',
                        'temp': '0.7',
                        'top-p': '0.9',
                        'min-p': '0.05',
                        'flash-attn': 'true',
                        'reasoning': 'off'
                    }
                    added_count += 1
                    app.logger.info(f"Auto-added model to config: {model_name}")

        if added_count > 0:
            write_config(config_models)
            return True, added_count
        return False, 0
    except Exception as e:
        app.logger.error(f"Error scanning models: {e}")
        return False, 0

@app.route('/api/config')
def get_config():
    """Get full config.ini as JSON"""
    # Auto-scan and add missing models
    scan_and_add_missing_models()
    return jsonify(read_config())

@app.route('/api/config/<section>', methods=['PUT'])
def update_config_section(section):
    """Update a config section"""
    config_models = read_config()

    if section not in config_models:
        return jsonify({'error': 'Section not found'}), 404

    data = request.get_json()

    # Metadata fields that should not be written to llama.cpp config
    metadata_fields = {'description', 'name'}

    # Update provided fields, excluding metadata
    for key, value in data.items():
        if key not in metadata_fields:
            config_models[section][key] = value

    write_config(config_models)

    # Restart container to apply changes
    restart_success = restart_llama_router()

    return jsonify({
        'success': True,
        'restarted': restart_success
    })

@app.route('/api/download', methods=['POST'])
def download_model():
    """Download a new model and add to config"""
    data = request.get_json()

    name = data.get('name')
    url = data.get('url')
    filename = data.get('filename')

    if not all([name, url, filename]):
        app.logger.warning(f"Download request missing fields: {data}")
        return jsonify({'error': 'Missing required fields'}), 400

    # Security: Validate URL against SSRF
    is_safe, error_msg = is_download_url_safe(url)
    if not is_safe:
        app.logger.warning(f"Blocked download URL: {url} - {error_msg}")
        return jsonify({'error': f'Invalid URL: {error_msg}'}), 400

    # Security: Validate GGUF filename
    if not filename.lower().endswith('.gguf'):
        app.logger.warning(f"Invalid filename extension: {filename}")
        return jsonify({'error': 'Model filename must end with .gguf extension'}), 400

    model_path = os.path.join(MODELS_DIR, filename)

    # Download model with progress tracking
    download_id = f"{name}_{filename}"

    try:
        app.logger.info(f"Starting download: {name} from {url}")

        # Initialize progress tracking with persistent storage
        update_download_status(download_id, 'starting',
                                name=name,
                                filename=filename,
                                downloaded=0,
                                total=0,
                                percent=0,
                                error=None)

        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()

        # Get total file size if available
        total_size = int(response.headers.get('content-length', 0))
        update_download_status(download_id, 'downloading',
                                total=total_size,
                                downloaded=0,
                                percent=0)

        downloaded = 0
        last_update = 0
        chunk_size = 1024 * 1024  # 1MB chunks for better progress

        with open(model_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                f.write(chunk)
                downloaded += len(chunk)

                # Update progress every 1% or every chunk
                if total_size > 0:
                    percent = int((downloaded / total_size) * 100)
                    if percent - last_update >= 1 or downloaded == total_size:
                        update_download_status(download_id, 'downloading',
                                                downloaded=downloaded,
                                                percent=percent)
                        last_update = percent

        app.logger.info(f"Download complete: {name} ({downloaded} bytes)")

        # Mark as validating
        update_download_status(download_id, 'validating', percent=100)

        # Security: Validate GGUF magic bytes after download
        is_valid, validation_error = validate_gguf_file(model_path)
        if not is_valid:
            os.remove(model_path)  # Delete invalid file
            update_download_status(download_id, 'error', error=validation_error)
            app.logger.error(f"GGUF validation failed for {name}: {validation_error}")
            return jsonify({'error': f'File validation failed: {validation_error}'}), 400

        # Mark as complete
        update_download_status(download_id, 'complete')

    except Exception as e:
        app.logger.error(f"Download failed for {name}: {e}")
        # Clean up partial download
        if os.path.exists(model_path):
            try:
                os.remove(model_path)
            except OSError:
                pass

        update_download_status(download_id, 'error', error=str(e))
        return jsonify({'error': f'Download failed: {e}'}), 500

    # Add to config
    config_models = read_config()
    config_models[name] = {
        'model': f'/models/{filename}',
        'ctx-size': str(data.get('ctx-size', 4096)),
        'n-gpu-layers': str(data.get('n-gpu-layers', 99)),
        'temp': str(data.get('temp', 0.7)),
        'flash-attn': 'true' if data.get('flash-attn', True) else 'false'
    }

    if data.get('top-p'):
        config_models[name]['top-p'] = str(data['top-p'])
    if data.get('min-p'):
        config_models[name]['min-p'] = str(data['min-p'])
    if data.get('reasoning'):
        config_models[name]['reasoning'] = str(data['reasoning'])
    if data.get('mmproj'):
        config_models[name]['mmproj'] = str(data['mmproj'])
    if data.get('chat-template-file'):
        config_models[name]['chat-template-file'] = str(data['chat-template-file'])
    if data.get('cache-ram') is not None:
        config_models[name]['cache-ram'] = str(data['cache-ram'])
    if data.get('np') is not None:
        config_models[name]['np'] = str(data['np'])
    if data.get('port') is not None:
        config_models[name]['port'] = str(data['port'])
    if data.get('host'):
        config_models[name]['host'] = str(data['host'])

    write_config(config_models)

    # Restart container to apply changes
    restart_success = restart_llama_router()
    app.logger.info(f"Model {name} added, restart={'OK' if restart_success else 'FAILED'}")

    # Auto-unload the newly downloaded model so it stays in Idle state
    # This prevents llama.cpp from auto-loading models from config.ini
    if restart_success:
        time.sleep(5)  # Wait for llama-router to be ready
        try:
            loaded = get_loaded_models()
            # The API returns model IDs as filenames, so we need to match by filename
            # Extract filename from the model path stored in config
            model_path = config_models[name].get('model', '')
            model_filename = os.path.basename(model_path) if model_path else name
            # Check if model is loaded (status == 'ready')
            if loaded.get(model_filename) == 'loaded':
                app.logger.info(f"Auto-unloading newly downloaded model: {name} (filename: {model_filename})")
                # Use the filename (model ID) instead of config section name
                online, host = get_llama_status()
                if online:
                    requests.post(f'{host}/models/unload', json={'model': model_filename}, timeout=30)
                    app.logger.info(f"Successfully unloaded {model_filename}")
            else:
                app.logger.info(f"Model {name} (filename: {model_filename}) not loaded. Status: {loaded.get(model_filename, 'unknown')}")
        except Exception as e:
            app.logger.warning(f"Failed to auto-unload model {name}: {e}")

    return jsonify({
        'success': True,
        'restarted': restart_success
    })

@app.route('/api/download/start', methods=['POST'])
def start_download():
    """Start a download and return the download ID for progress tracking"""
    import uuid
    download_id = str(uuid.uuid4())[:8]

    # Store request data for background thread
    request_data = request.get_json()

    def download_in_background():
        data = request_data
        name = data.get('name')
        url = data.get('url')
        filename = data.get('filename')
        hf_token = data.get('hf_token', '')

        # Initialize control flags
        active_downloads[download_id] = {
            'thread': threading.current_thread(),
            'paused': False,
            'stopped': False
        }

        if not all([name, url, filename]):
            update_download_status(download_id, 'error',
                                    error='Missing required fields',
                                    name='Unknown',
                                    filename='unknown.gguf')
            active_downloads.pop(download_id, None)
            return

        # Security: Validate URL
        is_safe, error_msg = is_download_url_safe(url)
        if not is_safe:
            update_download_status(download_id, 'error',
                                    error=f'Invalid URL: {error_msg}',
                                    name=name,
                                    filename=filename)
            active_downloads.pop(download_id, None)
            return

        # Security: Validate GGUF filename
        if not filename.lower().endswith('.gguf'):
            update_download_status(download_id, 'error',
                                    error='Model filename must end with .gguf extension')
            active_downloads.pop(download_id, None)
            return

        model_path = os.path.join(MODELS_DIR, filename)
        temp_path = model_path + '.part'

        try:
            app.logger.info(f"Starting download: {name} from {url}")

            # Check for resume (existing partial file)
            resume_position = 0
            if os.path.exists(temp_path):
                resume_position = os.path.getsize(temp_path)
                app.logger.info(f"Resuming download from {resume_position} bytes")

            # Initialize download in persistent storage
            update_download_status(download_id, 'starting',
                                    name=name,
                                    filename=filename,
                                    url=url,
                                    downloaded=resume_position,
                                    total=0,
                                    percent=0,
                                    error=None)

            # Set Range header for resume
            headers = {}
            if resume_position > 0:
                headers['Range'] = f'bytes={resume_position}-'

            # Add HuggingFace authorization if token provided
            if hf_token:
                headers['Authorization'] = f'Bearer {hf_token}'

            response = requests.get(url, stream=True, timeout=300, headers=headers)
            response.raise_for_status()

            # Get total file size
            total_size = int(response.headers.get('content-length', 0))
            if resume_position > 0:
                # Handle Content-Range for resume
                content_range = response.headers.get('content-range', '')
                if content_range:
                    # Format: "bytes start-end/total"
                    parts = content_range.split('/')
                    if len(parts) > 1:
                        try:
                            total_size = int(parts[1])
                        except (ValueError, IndexError):
                            pass

            update_download_status(download_id, 'downloading',
                                    total=total_size,
                                    downloaded=resume_position,
                                    percent=int((resume_position / total_size * 100)) if total_size > 0 else 0)

            downloaded = resume_position
            last_update = 0
            chunk_size = 1024 * 1024

            # Open file in append mode for resume
            mode = 'ab' if resume_position > 0 else 'wb'
            with open(temp_path, mode) as f:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    # Check for stop signal
                    if active_downloads.get(download_id, {}).get('stopped'):
                        app.logger.info(f"Download stopped: {name}")
                        update_download_status(download_id, 'stopped')
                        active_downloads.pop(download_id, None)
                        # Clean up partial file
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        return

                    # Check for pause signal - wait while paused
                    while active_downloads.get(download_id, {}).get('paused'):
                        update_download_status(download_id, 'paused')
                        time.sleep(0.5)
                        if active_downloads.get(download_id, {}).get('stopped'):
                            app.logger.info(f"Download stopped while paused: {name}")
                            update_download_status(download_id, 'stopped')
                            active_downloads.pop(download_id, None)
                            if os.path.exists(temp_path):
                                os.remove(temp_path)
                            return

                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_size > 0:
                        percent = int((downloaded / total_size) * 100)
                        if percent - last_update >= 1 or downloaded == total_size:
                            update_download_status(download_id, 'downloading',
                                                    downloaded=downloaded,
                                                    percent=percent)
                            last_update = percent

            app.logger.info(f"Download complete: {name} ({downloaded} bytes)")

            update_download_status(download_id, 'validating', percent=100)

            # Rename temp file to final file
            if os.path.exists(temp_path):
                os.rename(temp_path, model_path)

            is_valid, validation_error = validate_gguf_file(model_path)
            if not is_valid:
                os.remove(model_path)
                update_download_status(download_id, 'error', error=validation_error)
                active_downloads.pop(download_id, None)
                return

            # Add to config
            config_models = read_config()
            config_models[name] = {
                'model': f'/models/{filename}',
                'ctx-size': str(data.get('ctx-size', 4096)),
                'n-gpu-layers': str(data.get('n-gpu-layers', 99)),
                'temp': str(data.get('temp', 0.7)),
                'flash-attn': 'true' if data.get('flash-attn', True) else 'false'
            }

            if data.get('top-p'):
                config_models[name]['top-p'] = str(data['top-p'])
            if data.get('min-p'):
                config_models[name]['min-p'] = str(data['min-p'])
            if data.get('reasoning'):
                config_models[name]['reasoning'] = str(data['reasoning'])
            if data.get('mmproj'):
                config_models[name]['mmproj'] = str(data['mmproj'])
            if data.get('chat-template-file'):
                config_models[name]['chat-template-file'] = str(data['chat-template-file'])
            if data.get('cache-ram') is not None:
                config_models[name]['cache-ram'] = str(data['cache-ram'])
            if data.get('np') is not None:
                config_models[name]['np'] = str(data['np'])
            if data.get('port') is not None:
                config_models[name]['port'] = str(data['port'])
            if data.get('host'):
                config_models[name]['host'] = str(data['host'])

            write_config(config_models)
            restart_success = restart_llama_router()

            # Auto-unload the newly downloaded model so it stays in Idle state
            # This prevents llama.cpp from auto-loading models from config.ini
            if restart_success:
                time.sleep(5)  # Wait for llama-router to be ready
                try:
                    loaded = get_loaded_models()
                    # The API returns model IDs as filenames, so we need to match by filename
                    # Extract filename from the model path stored in config
                    model_path = config_models[name].get('model', '')
                    model_filename = os.path.basename(model_path) if model_path else name
                    # Check if model is loaded (status == 'ready')
                    if loaded.get(model_filename) == 'loaded':
                        app.logger.info(f"Auto-unloading newly downloaded model: {name} (filename: {model_filename})")
                        # Use the filename (model ID) instead of config section name
                        online, host = get_llama_status()
                        if online:
                            requests.post(f'{host}/models/unload', json={'model': model_filename}, timeout=30)
                            app.logger.info(f"Successfully unloaded {model_filename}")
                    else:
                        app.logger.info(f"Model {name} (filename: {model_filename}) not loaded. Status: {loaded.get(model_filename, 'unknown')}")
                except Exception as e:
                    app.logger.warning(f"Failed to auto-unload model {name}: {e}")

            update_download_status(download_id, 'complete')
            active_downloads.pop(download_id, None)

        except Exception as e:
            app.logger.error(f"Download failed: {e}")
            # Clean up files
            for path in [model_path, temp_path]:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
            update_download_status(download_id, 'error', error=str(e))
            active_downloads.pop(download_id, None)

    thread = threading.Thread(target=download_in_background)
    thread.daemon = True
    thread.start()

    return jsonify({'download_id': download_id})

@app.route('/api/download/progress/<download_id>')
def download_progress_stream(download_id):
    """SSE endpoint for download progress updates"""
    def generate():
        import time
        while True:
            progress = get_download_status(download_id)

            if progress is None:
                yield f"data: {{'status': 'not_found'}}\n\n"
                break

            # Build JSON response
            json_str = f"{{'status': '{progress['status']}', 'percent': {progress.get('percent', 0)}, 'downloaded': {progress.get('downloaded', 0)}, 'total': {progress.get('total', 0)}"
            if progress.get('error'):
                json_str += f", 'error': '{progress['error']}'"
            json_str += "}"

            yield f"data: {json_str}\n\n"

            if progress['status'] in ['complete', 'error', 'not_found']:
                break

            time.sleep(0.5)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/downloads')
def list_downloads():
    """Get all downloads (active and recent)"""
    downloads = get_all_downloads()
    result = []
    for download_id, data in downloads.items():
        result.append({
            'id': download_id,
            'name': data.get('name', 'Unknown'),
            'filename': data.get('filename', ''),
            'status': data.get('status', 'unknown'),
            'percent': data.get('percent', 0),
            'downloaded': data.get('downloaded', 0),
            'total': data.get('total', 0),
            'error': data.get('error'),
            'created_at': data.get('created_at'),
            'updated_at': data.get('updated_at')
        })
    # Sort by created_at (newest first)
    result.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(result)

@app.route('/api/download/<download_id>/pause', methods=['POST'])
def pause_download(download_id):
    """Pause a download"""
    if download_id not in active_downloads:
        return jsonify({'error': 'Download not found or already completed'}), 404

    active_downloads[download_id]['paused'] = True
    return jsonify({'success': True})

@app.route('/api/download/<download_id>/resume', methods=['POST'])
def resume_download(download_id):
    """Resume a paused download"""
    if download_id not in active_downloads:
        # Download might be stopped, check if we can resume from file
        downloads = load_downloads()
        if download_id in downloads:
            data = downloads[download_id]
            if data.get('status') == 'paused' or data.get('status') == 'stopped':
                # Start a new download with resume capability
                url = data.get('url')
                filename = data.get('filename')
                name = data.get('name')

                if not all([url, filename, name]):
                    return jsonify({'error': 'Cannot resume: missing download info'}), 400

                # Start new download thread with resume
                request_data = {
                    'name': name,
                    'url': url,
                    'filename': filename,
                    'ctx-size': 4096,
                    'n-gpu-layers': 99,
                    'temp': 0.7,
                    'flash-attn': True,
                    'hf_token': data.get('hf_token', '')
                }

                # Reuse the download_in_background function with new ID
                import uuid
                new_download_id = str(uuid.uuid4())[:8]

                def resume_in_background():
                    # Copy the download_in_background logic but with new ID
                    active_downloads[new_download_id] = {
                        'thread': threading.current_thread(),
                        'paused': False,
                        'stopped': False
                    }

                    model_path = os.path.join(MODELS_DIR, filename)
                    temp_path = model_path + '.part'

                    try:
                        # Check for resume (existing partial file)
                        resume_position = 0
                        if os.path.exists(temp_path):
                            resume_position = os.path.getsize(temp_path)

                        if resume_position == 0:
                            update_download_status(new_download_id, 'error',
                                                    error='No partial file found to resume',
                                                    name=name,
                                                    filename=filename)
                            active_downloads.pop(new_download_id, None)
                            return

                        app.logger.info(f"Resuming download: {name} from {resume_position} bytes")

                        headers = {}
                        if resume_position > 0:
                            headers['Range'] = f'bytes={resume_position}-'

                        # Add HuggingFace authorization if token was stored
                        token = data.get('hf_token', '')
                        if token:
                            headers['Authorization'] = f'Bearer {token}'

                        response = requests.get(url, stream=True, timeout=300, headers=headers)
                        response.raise_for_status()

                        total_size = int(response.headers.get('content-length', 0))
                        content_range = response.headers.get('content-range', '')
                        if content_range and resume_position > 0:
                            parts = content_range.split('/')
                            if len(parts) > 1:
                                try:
                                    total_size = int(parts[1])
                                except (ValueError, IndexError):
                                    pass

                        update_download_status(new_download_id, 'downloading',
                                                name=name,
                                                filename=filename,
                                                url=url,
                                                total=total_size,
                                                downloaded=resume_position,
                                                percent=int((resume_position / total_size * 100)) if total_size > 0 else 0)

                        downloaded = resume_position
                        last_update = 0
                        chunk_size = 1024 * 1024

                        with open(temp_path, 'ab') as f:
                            for chunk in response.iter_content(chunk_size=chunk_size):
                                if active_downloads.get(new_download_id, {}).get('stopped'):
                                    update_download_status(new_download_id, 'stopped')
                                    active_downloads.pop(new_download_id, None)
                                    if os.path.exists(temp_path):
                                        os.remove(temp_path)
                                    return

                                while active_downloads.get(new_download_id, {}).get('paused'):
                                    update_download_status(new_download_id, 'paused')
                                    time.sleep(0.5)
                                    if active_downloads.get(new_download_id, {}).get('stopped'):
                                        update_download_status(new_download_id, 'stopped')
                                        active_downloads.pop(new_download_id, None)
                                        if os.path.exists(temp_path):
                                            os.remove(temp_path)
                                        return

                                f.write(chunk)
                                downloaded += len(chunk)

                                if total_size > 0:
                                    percent = int((downloaded / total_size) * 100)
                                    if percent - last_update >= 1:
                                        update_download_status(new_download_id, 'downloading',
                                                        downloaded=downloaded,
                                                        percent=percent)
                                        last_update = percent

                        # Complete download
                        if os.path.exists(temp_path):
                            os.rename(temp_path, model_path)

                        update_download_status(new_download_id, 'validating', percent=100)

                        is_valid, validation_error = validate_gguf_file(model_path)
                        if not is_valid:
                            os.remove(model_path)
                            update_download_status(new_download_id, 'error', error=validation_error)
                            active_downloads.pop(new_download_id, None)
                            return

                        # Add to config
                        config_models = read_config()
                        config_models[name] = {
                            'model': f'/models/{filename}',
                            'ctx-size': '4096',
                            'n-gpu-layers': '99',
                            'temp': '0.7',
                            'flash-attn': 'true'
                        }
                        write_config(config_models)
                        restart_llama_router()

                        update_download_status(new_download_id, 'complete')
                        active_downloads.pop(new_download_id, None)

                    except Exception as e:
                        app.logger.error(f"Resume download failed: {e}")
                        for path in [model_path, temp_path]:
                            if os.path.exists(path):
                                try:
                                    os.remove(path)
                                except OSError:
                                    pass
                        update_download_status(new_download_id, 'error', error=str(e))
                        active_downloads.pop(new_download_id, None)

                thread = threading.Thread(target=resume_in_background)
                thread.daemon = True
                thread.start()

                # Remove old paused/stopped entry
                downloads.pop(download_id, '')
                save_downloads(downloads)

                return jsonify({'success': True, 'download_id': new_download_id})

        return jsonify({'error': 'Download not found'}), 404

    active_downloads[download_id]['paused'] = False
    return jsonify({'success': True})

@app.route('/api/download/<download_id>/stop', methods=['POST'])
def stop_download(download_id):
    """Stop a download and remove it from queue"""
    # Stop active download
    if download_id in active_downloads:
        active_downloads[download_id]['stopped'] = True
        active_downloads[download_id]['paused'] = False  # Unpause so it can process the stop

    # Remove from persistent storage
    downloads = load_downloads()
    if download_id in downloads:
        data = downloads[download_id]
        filename = data.get('filename')
        # Clean up partial files
        if filename:
            for path in [
                os.path.join(MODELS_DIR, filename),
                os.path.join(MODELS_DIR, filename + '.part')
            ]:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                        app.logger.info(f"Removed partial file: {path}")
                    except OSError:
                        pass
        del downloads[download_id]
        save_downloads(downloads)

    return jsonify({'success': True})

@app.route('/api/download/<download_id>/clear', methods=['POST'])
def clear_download(download_id):
    """Clear a completed download from queue without deleting the model file"""
    downloads = load_downloads()
    if download_id in downloads:
        # Only remove from queue, do NOT delete the model file
        del downloads[download_id]
        save_downloads(downloads)
        app.logger.info(f"Cleared download {download_id} from queue (model file preserved)")

    return jsonify({'success': True})

@app.route('/api/metrics')
def metrics():
    """Get system metrics including model status and stats"""
    online, host = get_llama_status()
    config_models = read_config()
    loaded = get_loaded_models()

    # Calculate model file sizes
    model_sizes = {}
    for name, settings in config_models.items():
        model_file = settings.get('model', '')
        local_path = os.path.join(MODELS_DIR, os.path.basename(model_file))
        try:
            size = os.path.getsize(local_path) if os.path.exists(local_path) else 0
            model_sizes[name] = size
        except OSError:
            model_sizes[name] = 0

    # Get GPU info (nvidia-smi)
    gpu_info = {}
    try:
        # Try to get GPU stats from host
        container = docker_client.containers.get('llama-router')
        result = container.exec_run('nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader')
        if result.exit_code == 0:
            lines = result.output.decode('utf-8').strip().split('\n')
            for i, line in enumerate(lines):
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 5:
                    gpu_info[f'gpu-{i}'] = {
                        'name': parts[0],
                        'memory_total': parts[1],
                        'memory_used': parts[2],
                        'memory_free': parts[3],
                        'utilization': parts[4]
                    }
    except Exception as e:
        app.logger.debug(f"Could not get GPU info: {e}")

    # Count only models with 'ready' status
    ready_models = [name for name, status in loaded.items() if status == 'loaded']
    loaded_list = ready_models

    return jsonify({
        'timestamp': datetime.utcnow().isoformat(),
        'server': {
            'online': online,
            'host': host
        },
        'models': {
            'available': len(config_models),
            'loaded': len(ready_models),
            'loaded_list': loaded_list,
            'total_size_bytes': sum(model_sizes.values())
        },
        'model_details': [
            {
                'name': name,
                'loaded': loaded.get(name) == 'loaded',
                'status': loaded.get(name, 'idle'),
                'size_bytes': model_sizes.get(name, 0),
                'ctx_size': settings.get('ctx-size'),
                'n_gpu_layers': settings.get('n-gpu-layers')
            }
            for name, settings in config_models.items()
        ],
        'gpu': gpu_info
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    online, _ = get_llama_status()
    return jsonify({'status': 'healthy' if online else 'degraded'}), 200 if online else 503

# ==============================================================================
# PROFILE MANAGEMENT ENDPOINTS
# ==============================================================================

PROFILES_PATH = '/config/profiles.ini'

def read_profiles():
    """Read profiles from profiles.ini"""
    config = configparser.ConfigParser()
    config.read(PROFILES_PATH)

    profiles = {}
    for section in config.sections():
        profiles[section] = dict(config.items(section))
    return profiles

def write_profiles(profiles):
    """Write profiles to profiles.ini"""
    config = configparser.ConfigParser()

    for name, settings in profiles.items():
        config.add_section(name)
        for key, value in settings.items():
            config.set(name, key, str(value))

    with open(PROFILES_PATH, 'w') as f:
        config.write(f)

@app.route('/api/profiles')
def list_profiles():
    """Get all profiles"""
    profiles = read_profiles()
    # Get list of available models
    config_models = read_config()

    result = []
    for name, settings in profiles.items():
        result.append({
            'name': name,
            'model': settings.get('model', ''),
            'description': settings.get('description', ''),
            'settings': settings
        })

    return jsonify({
        'profiles': result,
        'available_models': list(config_models.keys())
    })

@app.route('/api/profiles/<name>', methods=['POST'])
def create_profile(name):
    """Create a new profile"""
    profiles = read_profiles()

    if name in profiles:
        return jsonify({'error': 'Profile already exists'}), 400

    data = request.get_json()

    # Validate required fields
    if not data.get('model'):
        return jsonify({'error': 'Model is required'}), 400

    # Flatten: model + description + settings.* into one flat dict
    flat = {}
    flat['model'] = data.get('model', '')
    flat['description'] = data.get('description', '')
    settings = data.get('settings', {})
    if isinstance(settings, dict):
        flat.update(settings)
    profiles[name] = flat
    write_profiles(profiles)

    return jsonify({'success': True, 'name': name})

@app.route('/api/profiles/<name>', methods=['PUT'])
def update_profile(name):
    """Update an existing profile"""
    profiles = read_profiles()

    if name not in profiles:
        return jsonify({'error': 'Profile not found'}), 404

    data = request.get_json()

    # Update fields (flatten settings sub-dict if present)
    for key, value in data.items():
        if key == 'settings' and isinstance(value, dict):
            for sk, sv in value.items():
                profiles[name][sk] = sv
        else:
            profiles[name][key] = value

    write_profiles(profiles)

    return jsonify({'success': True, 'name': name})

@app.route('/api/profiles/<name>', methods=['DELETE'])
def delete_profile(name):
    """Delete a profile"""
    profiles = read_profiles()

    if name not in profiles:
        return jsonify({'error': 'Profile not found'}), 404

    del profiles[name]
    write_profiles(profiles)

    return jsonify({'success': True})

@app.route('/api/profiles/schema')
def get_profile_schema():
    """Get the complete schema of available llama.cpp parameters with defaults"""
    schema = {
        # Required - marked with *
        "required": ["model"],

        # Important - marked with *
        "important": [
            "model", "ctx-size", "n-gpu-layers", "temp", "top-p",
            "top-k", "reasoning", "flash-attn"
        ],

        # Parameters by category
        "parameters": {
            # Basic/Required
            "model": {
                "type": "select",
                "default": "",
                "required": True,
                "important": True,
                "description": "Model name (from config)",
                "options": []  # Populated dynamically
            },
            "description": {
                "type": "text",
                "default": "",
                "required": False,
                "description": "Profile description"
            },

            # Context & Memory
            "ctx-size": {
                "type": "number",
                "default": 8192,
                "min": 512,
                "step": 512,
                "important": True,
                "description": "Size of the prompt context"
            },
            "n-predict": {
                "type": "number",
                "default": -1,
                "description": "Number of tokens to predict (-1 = infinity)"
            },
            "cache-ram": {
                "type": "number",
                "default": 0,
                "description": "Max cache size in MiB (-1=unlimited, 0=disable)"
            },
            "batch-size": {
                "type": "number",
                "default": 2048,
                "description": "Logical maximum batch size"
            },
            "ubatch-size": {
                "type": "number",
                "default": 512,
                "description": "Physical maximum batch size"
            },

            # GPU
            "n-gpu-layers": {
                "type": "text",
                "default": "auto",
                "important": True,
                "description": "Max layers in VRAM (auto/all/number)"
            },
            "split-mode": {
                "type": "select",
                "default": "layer",
                "options": ["none", "layer", "row", "tensor"],
                "description": "How to split model across GPUs"
            },
            "tensor-split": {
                "type": "text",
                "default": "",
                "description": "Fraction of model per GPU (e.g., '3,1')"
            },
            "main-gpu": {
                "type": "number",
                "default": 0,
                "description": "GPU to use for model"
            },
            "cache-type-k": {
                "type": "select",
                "default": "f16",
                "options": ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"],
                "description": "KV cache data type for K"
            },
            "cache-type-v": {
                "type": "select",
                "default": "f16",
                "options": ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"],
                "description": "KV cache data type for V"
            },
            "kv-offload": {
                "type": "select",
                "default": "true",
                "options": ["true", "false"],
                "description": "Enable KV cache offloading"
            },

            # CPU
            "threads": {
                "type": "number",
                "default": -1,
                "description": "Number of CPU threads (-1 = auto)"
            },
            "threads-batch": {
                "type": "number",
                "default": -1,
                "description": "Threads for batch processing"
            },
            "mlock": {
                "type": "select",
                "default": "false",
                "options": ["true", "false"],
                "description": "Force model to stay in RAM"
            },
            "mmap": {
                "type": "select",
                "default": "true",
                "options": ["true", "false"],
                "description": "Memory-map model"
            },

            # Sampling - Core
            "temp": {
                "type": "number",
                "default": 0.7,
                "min": 0,
                "max": 2,
                "step": 0.05,
                "important": True,
                "description": "Sampling temperature"
            },
            "top-p": {
                "type": "number",
                "default": 0.9,
                "min": 0,
                "max": 1,
                "step": 0.05,
                "important": True,
                "description": "Top-p sampling (nucleus)"
            },
            "min-p": {
                "type": "number",
                "default": 0.05,
                "min": 0,
                "max": 1,
                "step": 0.01,
                "description": "Min-p sampling"
            },
            "top-k": {
                "type": "number",
                "default": 40,
                "min": 0,
                "important": True,
                "description": "Top-k sampling (0 = disabled)"
            },

            # Sampling - Repetition
            "repeat-last-n": {
                "type": "number",
                "default": 64,
                "min": -1,
                "description": "Last n tokens to penalize (0=off, -1=ctx_size)"
            },
            "repeat-penalty": {
                "type": "number",
                "default": 1.0,
                "min": 0,
                "step": 0.05,
                "description": "Penalize repeat sequence (1.0 = off)"
            },
            "presence-penalty": {
                "type": "number",
                "default": 0.0,
                "min": 0,
                "step": 0.05,
                "description": "Repeat alpha presence penalty"
            },
            "frequency-penalty": {
                "type": "number",
                "default": 0.0,
                "min": 0,
                "step": 0.05,
                "description": "Repeat alpha frequency penalty"
            },

            # Sampling - Advanced
            "typical": {
                "type": "number",
                "default": 1.0,
                "min": 0,
                "max": 1,
                "step": 0.05,
                "description": "Locally typical sampling (1.0 = off)"
            },
            "dynatemp-range": {
                "type": "number",
                "default": 0.0,
                "min": 0,
                "step": 0.1,
                "description": "Dynamic temperature range (0 = off)"
            },
            "dynatemp-exp": {
                "type": "number",
                "default": 1.0,
                "step": 0.1,
                "description": "Dynamic temperature exponent"
            },
            "mirostat": {
                "type": "select",
                "default": "0",
                "options": ["0", "1", "2"],
                "description": "Mirostat sampling (0=off, 1=Mirostat, 2=Mirostat 2.0)"
            },
            "mirostat-lr": {
                "type": "number",
                "default": 0.1,
                "step": 0.01,
                "description": "Mirostat learning rate"
            },
            "mirostat-ent": {
                "type": "number",
                "default": 5.0,
                "step": 0.1,
                "description": "Mirostat target entropy"
            },
            "seed": {
                "type": "number",
                "default": -1,
                "description": "RNG seed (-1 = random)"
            },

            # DRY Sampling
            "dry-multiplier": {
                "type": "number",
                "default": 0.0,
                "min": 0,
                "step": 0.05,
                "description": "DRY sampling multiplier (0 = off)"
            },
            "dry-base": {
                "type": "number",
                "default": 1.75,
                "step": 0.05,
                "description": "DRY sampling base value"
            },
            "dry-allowed-length": {
                "type": "number",
                "default": 2,
                "min": 0,
                "description": "Allowed length for DRY sampling"
            },
            "dry-penalty-last-n": {
                "type": "number",
                "default": -1,
                "min": -1,
                "description": "DRY penalty for last n tokens"
            },
            "dry-sequence-breaker": {
                "type": "text",
                "default": "",
                "description": "DRY sequence breaker (comma-separated)"
            },

            # XTC
            "xtc-probability": {
                "type": "number",
                "default": 0.0,
                "min": 0,
                "max": 1,
                "step": 0.05,
                "description": "XTC probability (0 = off)"
            },
            "xtc-threshold": {
                "type": "number",
                "default": 0.1,
                "min": 0,
                "max": 1,
                "step": 0.01,
                "description": "XTC threshold"
            },

            # Adaptive
            "adaptive-target": {
                "type": "number",
                "default": -1.0,
                "min": -1,
                "max": 1,
                "step": 0.05,
                "description": "Adaptive-p target probability (-1 = off)"
            },
            "adaptive-decay": {
                "type": "number",
                "default": 0.9,
                "min": 0,
                "max": 0.99,
                "step": 0.01,
                "description": "Adaptive-p decay rate"
            },

            # RoPE Scaling
            "rope-scaling": {
                "type": "select",
                "default": "linear",
                "options": ["none", "linear", "yarn"],
                "description": "RoPE frequency scaling method"
            },
            "rope-scale": {
                "type": "number",
                "default": 1.0,
                "min": 0,
                "step": 0.1,
                "description": "RoPE context scaling factor"
            },
            "rope-freq-base": {
                "type": "number",
                "default": 0,
                "min": 0,
                "step": 100,
                "description": "RoPE base frequency (0 = from model)"
            },
            "rope-freq-scale": {
                "type": "number",
                "default": 1.0,
                "min": 0,
                "step": 0.1,
                "description": "RoPE frequency scaling factor"
            },

            # Reasoning
            "reasoning": {
                "type": "select",
                "default": "off",
                "options": ["on", "off", "auto"],
                "important": True,
                "description": "Use reasoning/thinking mode"
            },
            "reasoning-budget": {
                "type": "number",
                "default": -1,
                "min": -1,
                "description": "Token budget for thinking (-1=unlimited, 0=immediate)"
            },
            "reasoning-format": {
                "type": "select",
                "default": "auto",
                "options": ["auto", "none", "deepseek", "deepseek-legacy"],
                "description": "Format for thoughts"
            },

            # Flash Attention
            "flash-attn": {
                "type": "select",
                "default": "auto",
                "options": ["on", "off", "auto"],
                "important": True,
                "description": "Flash Attention mode"
            },

            # Chat Template
            "chat-template": {
                "type": "select",
                "default": "",
                "options": [
                    "", "llama2", "llama3", "llama4", "chatml", "alpaca",
                    "deepseek", "deepseek2", "deepseek3", "qwen2", "phi3",
                    "mistral", "gemma", "vicuna", "command-r", "zephyr"
                ],
                "description": "Built-in chat template"
            },
            "chat-template-file": {
                "type": "text",
                "default": "",
                "description": "Custom chat template file path"
            },

            # Server
            "host": {
                "type": "text",
                "default": "0.0.0.0",
                "description": "IP address to listen"
            },
            "port": {
                "type": "number",
                "default": 8080,
                "min": 1024,
                "max": 65535,
                "description": "Port to listen"
            },
            "np": {
                "type": "number",
                "default": 1,
                "min": 1,
                "max": 16,
                "description": "Number of server slots (parallel)"
            },
            "timeout": {
                "type": "number",
                "default": 600,
                "min": 10,
                "description": "Server timeout in seconds"
            },

            # Multimodal
            "mmproj": {
                "type": "text",
                "default": "",
                "description": "Multimodal projector file path"
            },
            "mmproj-offload": {
                "type": "select",
                "default": "true",
                "options": ["true", "false"],
                "description": "GPU offload for multimodal projector"
            },

            # Grammar/JSON
            "grammar": {
                "type": "text",
                "default": "",
                "description": "BNF-like grammar to constrain generations"
            },
            "grammar-file": {
                "type": "text",
                "default": "",
                "description": "Grammar file path"
            },
            "json-schema": {
                "type": "text",
                "default": "",
                "description": "JSON schema to constrain generations"
            }
        },

        # Categories for organizing the UI
        "categories": {
            "basic": {
                "name": "Basic Settings",
                "description": "Essential configuration options",
                "fields": ["model", "description", "ctx-size", "n-gpu-layers", "temp", "top-p", "top-k", "flash-attn", "reasoning"]
            },
            "sampling": {
                "name": "Sampling Parameters",
                "description": "Control text generation behavior",
                "fields": ["temp", "top-p", "top-k", "min-p", "typical", "seed"]
            },
            "repetition": {
                "name": "Repetition Control",
                "description": "Reduce repetitive output",
                "fields": ["repeat-last-n", "repeat-penalty", "presence-penalty", "frequency-penalty"]
            },
            "advanced_sampling": {
                "name": "Advanced Sampling",
                "description": "Expert sampling options",
                "fields": ["dynatemp-range", "dynatemp-exp", "mirostat", "mirostat-lr", "mirostat-ent"]
            },
            "dry": {
                "name": "DRY Sampling",
                "description": "Deduplicated Repetition Detection",
                "fields": ["dry-multiplier", "dry-base", "dry-allowed-length", "dry-penalty-last-n", "dry-sequence-breaker"]
            },
            "xtc": {
                "name": "XTC Sampling",
                "description": "Explicit Token Cancellation",
                "fields": ["xtc-probability", "xtc-threshold"]
            },
            "adaptive": {
                "name": "Adaptive Sampling",
                "description": "Adaptive probability targeting",
                "fields": ["adaptive-target", "adaptive-decay"]
            },
            "rope": {
                "name": "RoPE Scaling",
                "description": "Context extension settings",
                "fields": ["rope-scaling", "rope-scale", "rope-freq-base", "rope-freq-scale"]
            },
            "memory": {
                "name": "Memory & Cache",
                "description": "Memory management options",
                "fields": ["cache-ram", "batch-size", "ubatch-size", "n-predict"]
            },
            "gpu": {
                "name": "GPU Settings",
                "description": "GPU configuration",
                "fields": ["split-mode", "tensor-split", "main-gpu", "cache-type-k", "cache-type-v", "kv-offload"]
            },
            "cpu": {
                "name": "CPU Settings",
                "description": "CPU thread configuration",
                "fields": ["threads", "threads-batch", "mlock", "mmap"]
            },
            "reasoning_opts": {
                "name": "Reasoning Options",
                "description": "Thinking/reasoning mode settings",
                "fields": ["reasoning", "reasoning-budget", "reasoning-format"]
            },
            "chat": {
                "name": "Chat Template",
                "description": "Conversation formatting",
                "fields": ["chat-template", "chat-template-file"]
            },
            "server": {
                "name": "Server Settings",
                "description": "Network and server options",
                "fields": ["host", "port", "np", "timeout"]
            },
            "multimodal": {
                "name": "Multimodal",
                "description": "Vision/image support",
                "fields": ["mmproj", "mmproj-offload"]
            },
            "constraints": {
                "name": "Output Constraints",
                "description": "Grammar and JSON schema",
                "fields": ["grammar", "grammar-file", "json-schema"]
            }
        },

        # Preset profiles
        "presets": {
            "fast": {
                "name": "Fast",
                "description": "Quick responses, lower quality",
                "settings": {
                    "ctx-size": 4096,
                    "temp": 0.3,
                    "top-p": 0.8,
                    "top-k": 20,
                    "repeat-penalty": 1.0,
                    "flash-attn": "on"
                }
            },
            "balanced": {
                "name": "Balanced",
                "description": "Good balance of speed and quality",
                "settings": {
                    "ctx-size": 8192,
                    "temp": 0.7,
                    "top-p": 0.9,
                    "min-p": 0.05,
                    "flash-attn": "auto"
                }
            },
            "creative": {
                "name": "Creative",
                "description": "More diverse and creative outputs",
                "settings": {
                    "ctx-size": 8192,
                    "temp": 1.2,
                    "top-p": 0.95,
                    "min-p": 0.1,
                    "repeat-penalty": 1.0,
                    "presence-penalty": 0.1
                }
            },
            "reasoning": {
                "name": "Reasoning",
                "description": "Extended thinking for complex tasks",
                "settings": {
                    "ctx-size": 16384,
                    "temp": 0.7,
                    "top-p": 0.9,
                    "reasoning": "on",
                    "flash-attn": "on"
                }
            },
            "precise": {
                "name": "Precise",
                "description": "Focused, deterministic outputs",
                "settings": {
                    "ctx-size": 8192,
                    "temp": 0.1,
                    "top-p": 0.5,
                    "top-k": 10,
                    "repeat-penalty": 1.1
                }
            }
        }
    }

    # Populate available models dynamically
    config_models = read_config()
    schema["parameters"]["model"]["options"] = list(config_models.keys())

    return jsonify(schema)



@app.route('/api/chat', methods=['POST'])
def chat():
    """Chat completion endpoint with streaming support"""
    # Check if llama-server is online
    online, host = get_llama_status()
    if not online:
        return jsonify({'error': 'Server offline'}), 503
    
    # Get request data
    data = request.get_json()
    model = data.get('model')
    messages = data.get('messages', [])
    stream = data.get('stream', True)
    
    if not model:
        return jsonify({'error': 'Model name is required'}), 400
    
    if not messages:
        return jsonify({'error': 'Messages are required'}), 400
    
    # Touch lifecycle - model is being used
    lifecycle_mod.touch(model)
    
    # Prepare request to llama.cpp API
    llama_request = {
        'model': model,
        'messages': messages,
        'stream': stream,
        'temperature': float(data.get('temperature', 0.7)),
        'top_p': float(data.get('top_p', 0.9)),
        'max_tokens': int(data.get('max_tokens', -1)) if data.get('max_tokens') else -1
    }
    
    # Optional parameters
    if 'top_k' in data:
        llama_request['top_k'] = int(data['top_k'])
    if 'min_p' in data:
        llama_request['min_p'] = float(data['min_p'])
    if 'repeat_penalty' in data:
        llama_request['repeat_penalty'] = float(data['repeat_penalty'])
    if 'presence_penalty' in data:
        llama_request['presence_penalty'] = float(data['presence_penalty'])
    if 'frequency_penalty' in data:
        llama_request['frequency_penalty'] = float(data['frequency_penalty'])
    
    app.logger.info(f"Chat request: model={model}, messages={len(messages)}, stream={stream}")
    
    try:
        # Forward request to llama.cpp API with streaming
        response = requests.post(
            f'{host}/v1/chat/completions',
            json=llama_request,
            stream=True,
            timeout=(10, 300)  # 10s connect, 300s read
        )
        
        if response.status_code != 200:
            error_text = response.text[:500]
            app.logger.error(f"Llama.cpp API error: {response.status_code} - {error_text}")
            return jsonify({'error': f'Generation failed: {response.status_code}'}), response.status_code
        
        # Stream the response
        def generate():
            try:
                for line in response.iter_lines():
                    if line:
                        # Forward the SSE line directly to client
                        yield line.decode('utf-8') + '\n'
            except GeneratorExit:
                # Client disconnected
                app.logger.info("Chat stream disconnected by client")
                response.close()
            except Exception as e:
                app.logger.error(f"Error streaming response: {e}")
                yield f"data: {{'error': '{str(e)}'}}\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
        
    except requests.Timeout:
        app.logger.error("Chat request timeout")
        return jsonify({'error': 'Request timeout'}), 504
    except requests.RequestException as e:
        app.logger.error(f"Chat request error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/page/<page>')
def serve_page(page):
    """Serve page content fragments for AJAX navigation"""
    valid_pages = ['dashboard', 'chat', 'models', 'profiles', 'downloads', 'settings']
    if page not in valid_pages:
        return 'Page not found', 404
    try:
        return render_template(f'pages/{page}.html')
    except:
        return 'Page not found', 404


# ==============================================================================
# LIFECYCLE MANAGEMENT ENDPOINTS
# ==============================================================================

@app.route('/api/lifecycle')
def get_lifecycle():
    """Get lifecycle status for all models"""
    loaded = get_loaded_models()
    status = lifecycle_mod.get_all_status(loaded)
    return jsonify(status)

@app.route('/api/lifecycle/<name>', methods=['PUT'])
def update_lifecycle(name):
    """Update lifecycle settings for a model"""
    data = request.get_json()
    result = lifecycle_mod.update_settings(
        name,
        pin=data.get('pin'),
        preload=data.get('preload'),
        keep_alive=data.get('keep_alive')
    )
    return jsonify({'success': True, 'settings': result})

@app.route('/api/lifecycle/<name>/evict', methods=['POST'])
def evict_model(name):
    """Manually trigger LRU eviction for a specific model"""
    online, host = get_llama_status()
    if not online:
        return jsonify({'error': 'Server offline'}), 503
    
    try:
        response = requests.post(
            f'{host}/models/unload',
            json={'model': name},
            timeout=30
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # For Docker containers, 0.0.0.0 is required for external access
    # Set FLASK_HOST env var to override if needed for non-Docker deployments
    app.run(host=os.getenv('FLASK_HOST', '0.0.0.0'), port=3000, debug=False)

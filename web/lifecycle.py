#!/usr/bin/env python3
"""
Lifecycle Management for llama-router models.

Features:
- Keep-alive: Auto-unload models after idle timeout
- Pin: Prevent specific models from being auto-unloaded
- Preload: Load models automatically on startup
- LRU Eviction: Unload least-recently-used model when VRAM is needed
"""

import os
import json
import time
import threading
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

LIFECYCLE_PATH = os.getenv('LIFECYCLE_PATH', '/data/lifecycle.json')
DEFAULT_KEEP_ALIVE = 30  # minutes
CHECK_INTERVAL = 30      # seconds between monitor checks

_lock = threading.Lock()
_monitor_thread = None

def init():
    """Initialize lifecycle management. Start background monitor."""
    global _monitor_thread
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()
    logger.info("Lifecycle monitor started")

    # Schedule preload after server stabilizes
    def delayed_preload():
        time.sleep(15)
        preload_models()

    t = threading.Thread(target=delayed_preload, daemon=True)
    t.start()


def read_state():
    """Read lifecycle state from disk."""
    try:
        if os.path.exists(LIFECYCLE_PATH):
            with open(LIFECYCLE_PATH, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read lifecycle state: {e}")
    return {}


def write_state(state):
    """Write lifecycle state to disk."""
    try:
        os.makedirs(os.path.dirname(LIFECYCLE_PATH), exist_ok=True)
        with open(LIFECYCLE_PATH, 'w') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write lifecycle state: {e}")


def _default_entry():
    return {
        'pin': False,
        'preload': False,
        'keep_alive': DEFAULT_KEEP_ALIVE,
        'last_used': None
    }


def touch(name):
    """Update last_used timestamp for a model."""
    with _lock:
        state = read_state()
        if name not in state:
            state[name] = _default_entry()
        state[name]['last_used'] = datetime.utcnow().isoformat()
        write_state(state)


def get_settings(name):
    """Get lifecycle settings for a model."""
    state = read_state()
    return state.get(name, _default_entry())


def update_settings(name, pin=None, preload=None, keep_alive=None):
    """Update lifecycle settings for a model."""
    with _lock:
        state = read_state()
        if name not in state:
            state[name] = _default_entry()
        if pin is not None:
            state[name]['pin'] = bool(pin)
        if preload is not None:
            state[name]['preload'] = bool(preload)
        if keep_alive is not None:
            state[name]['keep_alive'] = int(keep_alive)
        write_state(state)
    return state.get(name, {})


def get_all_status(loaded_models):
    """Get lifecycle status for all models. Returns dict."""
    state = read_state()
    now = datetime.utcnow()

    result = {}
    all_names = set(list(state.keys()) + list(loaded_models.keys()))

    for name in all_names:
        entry = state.get(name, _default_entry())
        is_loaded = loaded_models.get(name) in ('loaded',)
        last_used = entry.get('last_used')
        keep_alive = entry.get('keep_alive', DEFAULT_KEEP_ALIVE)
        is_pinned = entry.get('pin', False)

        # Calculate remaining time
        remaining = None
        if is_loaded and last_used and keep_alive > 0 and not is_pinned:
            try:
                elapsed = (now - datetime.fromisoformat(last_used)).total_seconds() / 60
                remaining = max(0, round(keep_alive - elapsed, 1))
            except:
                remaining = None

        result[name] = {
            'pin': is_pinned,
            'preload': entry.get('preload', False),
            'keep_alive': keep_alive,
            'last_used': last_used,
            'loaded': is_loaded,
            'remaining_minutes': remaining
        }

    return result


def evict_lru():
    """Find and unload the least recently used unpinned model.
    Returns (evicted_model_name, True) on success, (None, False) otherwise."""
    state = read_state()
    loaded = _get_loaded()
    now = datetime.utcnow()

    candidates = []
    for name, status in loaded.items():
        if status != 'loaded':
            continue
        entry = state.get(name, {})
        if entry.get('pin', False):
            continue

        last_used = entry.get('last_used')
        if last_used:
            try:
                idle = (now - datetime.fromisoformat(last_used)).total_seconds() / 60
            except:
                idle = float('inf')
        else:
            idle = float('inf')

        candidates.append((name, idle))

    if not candidates:
        return None, False

    candidates.sort(key=lambda x: x[1], reverse=True)
    victim = candidates[0][0]

    host = _get_host()
    if host and _unload_model(victim, host):
        logger.info(f"LRU evicted '{victim}' (idle {candidates[0][1]:.0f}min)")
        return victim, True
    return None, False


def preload_models():
    """Load all models marked for preload."""
    state = read_state()
    host = _get_host()
    if not host:
        logger.warning("Cannot preload: server offline")
        return []

    loaded = []
    for name, entry in state.items():
        if entry.get('preload', False):
            logger.info(f"Preloading model: {name}")
            if _load_model(name, host):
                touch(name)
                loaded.append(name)
            else:
                logger.warning(f"Failed to preload: {name}")

    return loaded


def _monitor_loop():
    """Background loop: auto-unload expired models."""
    while True:
        try:
            time.sleep(CHECK_INTERVAL)
            state = read_state()
            loaded = _get_loaded()
            now = datetime.utcnow()
            host = _get_host()

            if not host:
                continue

            for name, status in loaded.items():
                if status != 'loaded':
                    continue

                entry = state.get(name, _default_entry())
                if entry.get('pin', False):
                    continue

                last_used = entry.get('last_used')
                if not last_used:
                    touch(name)
                    continue

                keep_alive = entry.get('keep_alive', DEFAULT_KEEP_ALIVE)
                if keep_alive <= 0:
                    continue  # 0 = never auto-unload

                try:
                    elapsed = (now - datetime.fromisoformat(last_used)).total_seconds() / 60
                except:
                    continue

                if elapsed >= keep_alive:
                    logger.info(f"Auto-unloading '{name}' (idle {elapsed:.0f}min, limit {keep_alive}min)")
                    _unload_model(name, host)
        except Exception as e:
            logger.error(f"Lifecycle monitor error: {e}")


def _get_host():
    """Get the active llama-server host."""
    LLAMA_HOST = os.getenv('LLAMA_HOST', 'http://llama-router:8080')
    hosts = [LLAMA_HOST]
    if LLAMA_HOST == 'http://llama-router:8080':
        hosts.append('http://host.docker.internal:8080')

    for host in hosts:
        try:
            resp = requests.get(f'{host}/health', timeout=2)
            if resp.status_code == 200:
                return host
        except:
            continue
    return None


def _get_loaded():
    """Get dict of loaded model statuses from llama-server."""
    host = _get_host()
    if not host:
        return {}

    try:
        resp = requests.get(f'{host}/models', timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                m['id']: m.get('status', {}).get('value', 'idle')
                for m in data.get('data', [])
            }
    except:
        pass
    return {}


def _load_model(name, host):
    """Load a model via llama-server API."""
    try:
        resp = requests.post(f'{host}/models/load', json={'model': name}, timeout=60)
        return resp.status_code == 200
    except:
        return False


def _unload_model(name, host):
    """Unload a model via llama-server API."""
    try:
        resp = requests.post(f'{host}/models/unload', json={'model': name}, timeout=30)
        return resp.status_code == 200
    except:
        return False

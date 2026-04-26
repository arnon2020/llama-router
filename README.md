# llama-router

Multi-model LLM router using llama.cpp in Docker with NVIDIA GPU support. Chat-first design with lifecycle management and named profiles.

## Features

- **Chat-First UI** — Start chatting immediately, models load on demand
- **Named Profiles** — Create profiles with custom settings per use case
- **Lifecycle Management** — Pin, preload, keep-alive timers, LRU eviction
- **Multi-model** — Run multiple models concurrently (up to 5)
- **GPU Accelerated** — NVIDIA CUDA via Docker
- **Smart Defaults** — Model-size aware defaults for context size, threads, etc.
- **OpenAI-Compatible API** — Drop-in replacement for OpenAI endpoints
- **Web UI** — Dashboard, Chat, Models, Profiles, Downloads, Settings pages

## Requirements

- Docker + Docker Compose
- NVIDIA GPU + NVIDIA Container Toolkit
- ~10GB disk space for models

## Quick Start

```bash
# 1. Download models
chmod +x download-models.sh
./download-models.sh

# 2. Start services (or use: make up)
docker compose up -d

# 3. Open Web UI
# Navigate to http://localhost:8580
```

## Web UI Pages

| Page | Description |
|------|-------------|
| **Dashboard** | System overview, GPU stats, loaded models |
| **Chat** | Start chatting with any loaded model |
| **Models** | View loaded models, lifecycle status badges, unload/remove |
| **Profiles** | Create named profiles with lifecycle + inference settings |
| **Downloads** | Download new GGUF models from HuggingFace |
| **Settings** | Global configuration, GPU info |

## Lifecycle Management

Each profile can configure lifecycle behavior:

| Setting | Description | Default |
|---------|-------------|---------|
| **📌 Pin** | Model stays loaded forever, never evicted | Off |
| **🚀 Preload** | Auto-load model on container startup | Off |
| **⏱ Keep-alive** | Auto-unload after idle timeout (5m/15m/30m/1h/∞) | 30m |
| **LRU Eviction** | When VRAM full, evict least-recently-used model | Enabled |

### How It Works

- **Background monitor** checks every 30 seconds
- Models with keep-alive timer expire → auto-unloaded
- Pinned models (📌) are protected from eviction
- Preloaded models (🚀) load automatically on startup

## Named Profiles

Profiles store reusable configurations:

```ini
[Test Chat]
model = SmolLM2 1.7B
pin = True
preload = True
keep_alive = 30
ctx-size = 8192
temp = 0.7
```

Create profiles via **Profiles page** or API.

## API Endpoints

### Health & Status

```bash
# Health check
curl http://localhost:8580/health

# Server status
curl http://localhost:8580/api/status

# System metrics + GPU stats
curl http://localhost:8580/api/metrics
```

### Model Management

```bash
# List all models (available + loaded)
curl http://localhost:8580/api/models

# Load a model
curl -X POST http://localhost:8580/api/models/SmolLM2%201.7B/load

# Unload a model (free VRAM)
curl -X POST http://localhost:8580/api/models/SmolLM2%201.7B/unload

# Remove a model from config
curl -X DELETE http://localhost:8580/api/models/SmolLM2%201.7B
```

### Lifecycle

```bash
# Get lifecycle status for all models
curl http://localhost:8580/api/lifecycle

# Set lifecycle for a model (pin + preload + 30min keep-alive)
curl -X PUT http://localhost:8580/api/lifecycle/SmolLM2%201.7B \
  -H "Content-Type: application/json" \
  -d '{"pin": true, "preload": true, "keep_alive": 30}'

# Evict a model immediately
curl -X POST http://localhost:8580/api/lifecycle/SmolLM2%201.7B/evict
```

### Profiles

```bash
# List all profiles
curl http://localhost:8580/api/profiles

# Create a profile
curl -X POST http://localhost:8580/api/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fast Chat",
    "model": "SmolLM2 1.7B",
    "pin": true,
    "preload": true,
    "keep_alive": 30,
    "settings": {
      "ctx-size": 8192,
      "temp": 0.7,
      "top-p": 0.9,
      "flash-attn": true
    }
  }'

# Update a profile
curl -X PUT http://localhost:8580/api/profiles/Fast%20Chat \
  -H "Content-Type: application/json" \
  -d '{"temp": 0.5, "keep_alive": 60}'

# Load model from profile (applies settings + lifecycle)
curl -X POST http://localhost:8580/api/profiles/Fast%20Chat/load

# Delete a profile
curl -X DELETE http://localhost:8580/api/profiles/Fast%20Chat
```

### Configuration

```bash
# Get full config
curl http://localhost:8580/api/config

# Update a config section
curl -X PUT http://localhost:8580/api/config/my-model \
  -H "Content-Type: application/json" \
  -d '{"temp": 0.8, "ctx-size": 4096}'
```

### Downloads

```bash
# Download a model from HuggingFace
curl -X POST http://localhost:8580/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf"}'
```

### Chat (OpenAI-compatible)

```bash
# Chat completion (port 8581)
curl http://localhost:8581/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "SmolLM2 1.7B",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'

# Streaming response
curl http://localhost:8581/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "SmolLM2 1.7B",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'

# List available models (OpenAI-compatible)
curl http://localhost:8581/v1/models
```

### Endpoint Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/status` | GET | Server status |
| `/api/metrics` | GET | System metrics & GPU stats |
| `/api/models` | GET | List all models |
| `/api/models/<name>/load` | POST | Load a model |
| `/api/models/<name>/unload` | POST | Unload a model |
| `/api/models/<name>` | DELETE | Remove a model |
| `/api/lifecycle` | GET | Lifecycle status for all models |
| `/api/lifecycle/<name>` | PUT | Set lifecycle settings |
| `/api/lifecycle/<name>/evict` | POST | Evict a model |
| `/api/profiles` | GET | List all profiles |
| `/api/profiles` | POST | Create a profile |
| `/api/profiles/<name>` | PUT | Update a profile |
| `/api/profiles/<name>` | DELETE | Delete a profile |
| `/api/profiles/<name>/load` | POST | Load model from profile |
| `/api/config` | GET | Get full config |
| `/api/config/<section>` | PUT | Update config section |
| `/api/download` | POST | Download new model |
| `/v1/chat/completions` | POST | Chat completion (port 8581) |
| `/v1/models` | GET | List models, OpenAI format (port 8581) |

## Makefile Commands

```bash
make up              # Start all services
make down            # Stop all services
make restart         # Restart services
make logs            # View logs
make status          # Check service health
make models-list     # List available models
make models-load MODEL=name     # Load a model
make models-unload MODEL=name   # Unload a model
make clean           # Remove containers and volumes
make help            # Show all commands
```

## Configuration

### Global Config (`config/config.ini`)

```ini
[global]
max_models = 5
default_ctx_size = 4096

[my-model]
model = /models/my-model.gguf
ctx-size = 4096
n-gpu-layers = 99
temp = 0.7
top-p = 0.9
flash-attn = true
```

### Profiles (`config/profiles.ini`)

Managed via Web UI or API. Persists across container rebuilds.

### Data Persistence

```yaml
# docker-compose.yml volumes
volumes:
  - ./config:/config     # config.ini + profiles.ini
  - ./models:/models     # GGUF model files
  - ./data:/data         # lifecycle state (JSON)
```

## Architecture

```
┌──────────────────────────────────────┐
│           Web UI (Flask)             │
│  ┌──────┐ ┌──────┐ ┌──────────────┐ │
│  │Chat  │ │Models│ │  Profiles    │ │
│  └──────┘ └──────┘ │📌🚀⏱ badges  │ │
│  ┌──────┐ ┌──────┐ └──────────────┘ │
│  │Dash  │ │Downld│ ┌──────────────┐ │
│  └──────┘ └──────┘ │  Settings    │ │
│                      └──────────────┘ │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│       Lifecycle Manager              │
│  pin | preload | keep-alive | LRU    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│       llama.cpp Router               │──▶ GPU (CUDA)
│       Port 8080                      │
└──────────────────────────────────────┘
               │
               ▼
          /models/*.gguf
```

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| llama-server API | 8581 | LLM inference API (OpenAI-compatible) |
| Web UI | 8580 | Management dashboard |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Container won't start | Check GPU: `nvidia-smi`, verify NVIDIA Container Toolkit |
| Models not loading | Check VRAM, unload unused models |
| Web UI offline | `docker compose restart web` |
| Out of memory | Reduce `MODELS_MAX` or unload models |
| Profiles disappeared | Check `./config/profiles.ini` exists on host |
| Lifecycle not working | Check `./data/lifecycle.json` permissions |

## References

- [llama.cpp Router Mode Blog](https://huggingface.co/blog/ggml-org/model-management-in-llamacpp)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [OpenAI API Compatibility](https://github.com/ggml-org/llama.cpp/blob/main/examples/server/README.md)

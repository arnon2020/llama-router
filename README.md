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

### Model Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/models` | GET | List all models |
| `/api/models/<name>/load` | POST | Load a model |
| `/api/models/<name>/unload` | POST | Unload a model |
| `/api/models/<name>` | DELETE | Remove a model |

### Lifecycle

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lifecycle` | GET | Get lifecycle status for all models |
| `/api/lifecycle/<name>` | PUT | Set lifecycle settings (pin, preload, keep_alive) |

### Profiles

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/profiles` | GET | List all profiles |
| `/api/profiles` | POST | Create a profile |
| `/api/profiles/<name>` | PUT | Update a profile |
| `/api/profiles/<name>` | DELETE | Delete a profile |
| `/api/profiles/<name>/load` | POST | Load model from profile |

### Other

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status |
| `/api/config` | GET | Get full config |
| `/api/config/<section>` | PUT | Update config section |
| `/api/download` | POST | Download new model |
| `/api/metrics` | GET | System metrics & GPU stats |
| `/health` | GET | Health check |

### Chat (OpenAI-compatible)

```bash
curl http://localhost:8581/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "SmolLM2 1.7B", "messages": [{"role": "user", "content": "hello"}]}'
```

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

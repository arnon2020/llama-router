# llama-router

Multi-model LLM router using llama.cpp in Docker with NVIDIA GPU support.

## Features

- **Router Mode** — Dynamic model load/unload without restarting
- **Multi-model** — Run multiple small models concurrently (up to 5)
- **GPU Accelerated** — NVIDIA CUDA via Docker
- **Per-model Config** — Temperature, context size, etc. per model
- **Continuous Batching** — Concurrent request handling
- **Web UI** — Management dashboard at `http://localhost:8580`
- **Metrics API** — System stats and GPU monitoring
- **Health Checks** — Automatic container health monitoring

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

# 3. Check status
make status

# 4. Open Web UI
# Navigate to http://localhost:8580
```

## Makefile Commands

```bash
make up              # Start all services
make down            # Stop all services
make restart         # Restart services
make logs            # View logs
make status          # Check service health
make models-list     # List available models
make models-load MODEL=qwen3-4b   # Load a model
make models-unload MODEL=qwen3-4b # Unload a model
make clean           # Remove containers and volumes
make help            # Show all commands
```

## Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
# Edit .env to change ports, memory limits, etc.
```

Key variables:
- `LLAMA_API_PORT` — API port (default: 8581)
- `WEB_UI_PORT` — Web UI port (default: 8580)
- `MODELS_MAX` — Max concurrent models (default: 5)
- `LLAMA_ROUTER_MEM_LIMIT` — Container memory limit

## API Usage

```bash
# Health check
curl http://localhost:8581/health

# List available/loaded models
curl http://localhost:8581/models

# Load a model
curl -X POST http://localhost:8581/models/load \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b"}'

# Chat completion (OpenAI-compatible)
curl http://localhost:8581/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b", "messages": [{"role": "user", "content": "hello"}]}'

# Unload to free VRAM
curl -X POST http://localhost:8581/models/unload \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b"}'
```

## Web UI Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main dashboard |
| `/api/status` | GET | Server status |
| `/api/models` | GET | List all models |
| `/api/models/<name>/load` | POST | Load a model |
| `/api/models/<name>/unload` | POST | Unload a model |
| `/api/models/<name>` | DELETE | Remove a model |
| `/api/config` | GET | Get full config |
| `/api/config/<section>` | PUT | Update config section |
| `/api/download` | POST | Download new model |
| `/api/metrics` | GET | System metrics & GPU stats |
| `/health` | GET | Health check |

## Configuration

Edit `config.ini` for per-model settings:

```ini
[my-model]
model = /models/my-model.gguf
ctx-size = 4096
n-gpu-layers = 99
temp = 0.7
top-p = 0.9
min-p = 0.05
flash-attn = true
reasoning = off
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Container won't start | Check GPU: `nvidia-smi`, verify NVIDIA Container Toolkit |
| Models not loading | Check VRAM: `curl localhost:8581/models`, unload unused models |
| Web UI offline | Restart: `docker compose restart web` |
| Out of memory | Reduce `MODELS_MAX` in `.env` or unload models |
| Port conflicts | Change `LLAMA_API_PORT` or `WEB_UI_PORT` in `.env` |
| Download fails | Check URLs in `download-models.sh`, verify HuggingFace access |

### Logs

```bash
# All services
make logs

# Specific service
docker compose logs llama-router
docker compose logs web

# Real-time with tail
docker compose logs -f llama-router
```

### Common Issues

**"Server offline" in Web UI**
```bash
# Check if router is running
docker compose ps

# Restart router
docker compose restart llama-router

# Check router logs
docker compose logs llama-router
```

**Models won't load**
```bash
# Check VRAM usage
nvidia-smi

# Unload all models
make models-unload-all

# Check model files exist
ls -lh models/
```

## VRAM Management

| Action | Command |
|--------|---------|
| List loaded models | `curl localhost:8581/models` |
| Unload one model | `make models-unload MODEL=name` |
| Unload all models | `make models-unload-all` |
| Check GPU usage | `nvidia-smi` |
| View metrics | `curl localhost:8580/api/metrics` |

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| llama-server API | 8581 | LLM inference API |
| Web UI | 8580 | Management dashboard |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Web UI        │────▶│  llama-router   │──▶ GPU
│   (Flask)       │     │  (llama.cpp)    │
│   Port 8580     │     │  Port 8080      │
└─────────────────┘     └─────────────────┘
                              │
                              ▼
                         /models/
                          *.gguf
```

## References

- [llama.cpp Router Mode Blog](https://huggingface.co/blog/ggml-org/model-management-in-llamacpp)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [OpenAI API Compatibility](https://github.com/ggml-org/llama.cpp/blob/main/examples/server/README.md)

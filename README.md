# llama-router

Multi-model LLM router using llama.cpp in Docker with NVIDIA GPU support.

## Features

- **Router Mode** — Dynamic model load/unload without restarting
- **Multi-model** — Run multiple small models concurrently (up to 5)
- **GPU Accelerated** — NVIDIA CUDA via Docker
- **Per-model Config** — Temperature, context size, etc. per model
- **Continuous Batching** — Concurrent request handling
- **LRU Eviction** — Auto-unloads least-used model when hitting limit

## Requirements

- Docker + Docker Compose
- NVIDIA GPU + NVIDIA Container Toolkit
- ~10GB disk space for models

## Quick Start

```bash
# 1. Download models
chmod +x download-models.sh
./download-models.sh

# 2. Start server
docker compose up -d

# 3. Check status
curl http://localhost:8080/models
```

## Usage

```bash
# Load a model
curl -X POST http://localhost:8080/models/load \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b"}'

# Chat
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b", "messages": [{"role": "user", "content": "hello"}]}'

# Unload to free VRAM
curl -X POST http://localhost:8080/models/unload \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b"}'

# Or unload all
./unload-idle.sh
```

## Configuration

Edit `config.ini` for per-model settings:

```ini
[my-model]
model = /models/my-model.gguf
ctx-size = 4096
n-gpu-layers = 99
temp = 0.7
```

## Add New Model

1. Place `.gguf` file in `models/`
2. Add section to `config.ini`
3. Restart: `docker compose restart`

## VRAM Management

| Action | Command |
|--------|---------|
| List loaded models | `curl localhost:8080/models` |
| Unload one | `./unload-idle.sh qwen3-4b` |
| Unload all | `./unload-idle.sh` |
| Limit concurrent | Change `--models-max` in docker-compose.yml |

## References

- [llama.cpp Router Mode Blog](https://huggingface.co/blog/ggml-org/model-management-in-llamacpp)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)

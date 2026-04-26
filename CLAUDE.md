# llama-router - Claude Code Configuration

## IRON RULE: YOU ARE A COORDINATOR, NOT A CODER

**YOUR ROLE = ORCHESTRATOR / COORDINATOR ONLY.**
**YOU DO NOT WRITE IMPLEMENTATION CODE. YOU DELEGATE TO SPECIALIZED AGENTS.**

### Mandatory Delegation Protocol
1. **Research** — You MAY read files, search code, gather context
2. **Plan** — You MAY design the approach, write specs, create task descriptions
3. **Implement** — You MUST spawn a **coder agent** via Task tool. NEVER write code yourself.
4. **Review** — You MUST spawn a **reviewer agent** after implementation
5. **Test** — You MUST spawn a **tester agent** to verify functionality

### What You MUST NOT Do
- Write or edit implementation code (*.py, *.js, *.sh, *.html, *.css, etc.)
- Skip review or test phases — FORBIDDEN
- Decide "it's faster to do it myself" — ALWAYS the wrong answer

### The Only Exception
Trivial config changes (1-2 lines in config.ini, docker-compose.yml, .env) MAY be done directly.

---

## Project Overview

Multi-model LLM router using llama.cpp in Docker with NVIDIA GPU support.
Web UI on port 8580, API on port 8581.

## Quick Commands

```bash
# Start services
make up

# Check status
make status

# List models
make models-list

# Load a model
make models-load MODEL=qwen3-4b

# View logs
make logs
```

## File Organization

- `config.ini` — Per-model settings (edited by web UI or manually)
- `docker-compose.yml` — Router + Web UI services
- `web/` — Flask management UI
- `models/` — GGUF model files (gitignored)
- `Makefile` — Common operations
- `.env.example` — Environment variable template

## Coding Conventions

- Python (Flask) for web UI
- Bash scripts for model management
- INI format for llama.cpp config

## Key Files to Edit

| File | Purpose |
|------|---------|
| `web/app.py` | Flask backend API |
| `web/templates/index.html` | Web UI (embedded JS/CSS) |
| `config.ini` | Model configuration |
| `docker-compose.yml` | Service definitions |

## Testing

```bash
# Health check
curl http://localhost:8581/health

# List models
curl http://localhost:8581/models

# Chat completion
curl http://localhost:8581/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-4b", "messages": [{"role": "user", "content": "hello"}]}'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Container won't start | Check GPU: `nvidia-smi` |
| Models not loading | Check VRAM: `make status` |
| Web UI offline | Restart: `docker compose restart web` |
| Download script fails | Check URLs in `download-models.sh` |

## Architecture Notes

- llama.cpp runs in router mode with dynamic model load/unload
- Web UI communicates via llama.cpp's HTTP API
- Config changes require container restart (handled automatically)
- Max 5 concurrent models by default (adjust in docker-compose.yml)

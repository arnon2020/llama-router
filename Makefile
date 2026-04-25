.PHONY: help up down restart logs status models-list models-load models-unload clean health

# Default target
help:
	@echo "llama-router - Makefile commands"
	@echo ""
	@echo "Service Management:"
	@echo "  make up          - Start all services (docker compose up -d)"
	@echo "  make down        - Stop all services (docker compose down)"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - Show logs from all services"
	@echo "  make logs-web    - Show web UI logs"
	@echo "  make logs-router - Show llama-router logs"
	@echo ""
	@echo "Status & Health:"
	@echo "  make status      - Check service status"
	@echo "  make health      - Health check for API"
	@echo ""
	@echo "Model Management:"
	@echo "  make models-list - List available and loaded models"
	@echo "  make models-load MODEL=name - Load a specific model"
	@echo "  make models-unload MODEL=name - Unload a specific model"
	@echo "  make models-unload-all - Unload all models"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean       - Remove all containers and volumes"
	@echo "  make rebuild     - Rebuild and restart containers"
	@echo "  make download    - Download models using download-models.sh"

# Service Management
up:
	@echo "Starting llama-router services..."
	docker compose up -d

down:
	@echo "Stopping llama-router services..."
	docker compose down

restart:
	@echo "Restarting services..."
	docker compose restart

logs:
	docker compose logs -f

logs-web:
	docker compose logs -f web

logs-router:
	docker compose logs -f llama-router

# Status & Health
status:
	@echo "=== Container Status ==="
	docker compose ps
	@echo ""
	@echo "=== API Health ==="
	@curl -s http://localhost:8581/health && echo " - OK" || echo " - OFFLINE"

health:
	@curl -s http://localhost:8581/health || echo "API is offline"

# Model Management
models-list:
	@./models.sh list

models-load:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make models-load MODEL=qwen3-4b"; \
		exit 1; \
	fi
	@./models.sh load $(MODEL)

models-unload:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make models-unload MODEL=qwen3-4b"; \
		exit 1; \
	fi
	@./models.sh unload $(MODEL)

models-unload-all:
	@./models.sh unload all

# Maintenance
clean:
	@echo "Stopping and removing containers..."
	docker compose down -v
	@echo "Done!"

rebuild:
	@echo "Rebuilding containers..."
	docker compose up -d --build

download:
	@chmod +x download-models.sh
	@./download-models.sh

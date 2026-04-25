# llama-router Web UI

A Flask-based web management interface for llama.cpp router.

## Features

- **Model Management**: Load, unload, and remove models
- **Config Editor**: Edit model settings directly in the browser
- **Model Downloader**: Add new models from URLs
- **Real-time Status**: Monitor server health and loaded models
- **Dark Theme**: Clean, minimal interface

## Usage

Start the services:

```bash
docker-compose up -d
```

Access the web UI at: **http://localhost:3000**

## API Endpoints

### Server Status
- `GET /api/status` - Check llama-server health

### Models
- `GET /api/models` - List all models with loaded status
- `POST /api/models/<name>/load` - Load a model
- `POST /api/models/<name>/unload` - Unload a model
- `DELETE /api/models/<name>` - Remove a model completely

### Configuration
- `GET /api/config` - Get full config.ini as JSON
- `PUT /api/config/<section>` - Update a config section

### Downloads
- `POST /api/download` - Download and add a new model

## Architecture

```
Browser → Web Container (Flask) → llama-server API
                      ↓
                 config.ini
                 models/
                 Docker Socket
```

The web container can restart the llama-router container via Docker socket after config changes.

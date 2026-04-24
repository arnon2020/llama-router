#!/bin/bash
# Model management commands for llama-router
# Usage: ./models.sh [list|load|unload|status]

HOST="http://localhost:8080"

cmd="${1:-list}"
model="$2"

case "$cmd" in
  list|ls)
    echo "Available models (from config.ini):"
    grep -E '^\[' config.ini | tr -d '[]' | while read -r name; do
      echo "  - $name"
    done
    echo ""
    echo "Currently loaded:"
    curl -s "$HOST/models" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    loaded = data.get('data', [])
    if loaded:
        for m in loaded:
            print(f'  * {m.get(\"id\", \"unknown\")}')
    else:
        print('  (none)')
except Exception as e:
    print(f'  Error: {e}')
" 2>/dev/null
    ;;

  load)
    if [ -z "$model" ]; then
      echo "Usage: ./models.sh load <model-name>"
      exit 1
    fi
    echo "Loading: $model"
    curl -s -X POST "$HOST/models/load" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\"}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f'  Status: {\"OK\" if data.get(\"load\") else json.dumps(data)}')
except: print('  Done')
" 2>/dev/null
    ;;

  unload)
    if [ -z "$model" ]; then
      echo "Usage: ./models.sh unload <model-name>"
      echo "       ./models.sh unload all"
      exit 1
    fi
    if [ "$model" = "all" ]; then
      exec ./unload-idle.sh
    fi
    echo "Unloading: $model"
    curl -s -X POST "$HOST/models/unload" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\"}"
    echo ""
    ;;

  status)
    curl -s "$HOST/health" 2>/dev/null && echo " - Server OK" || echo "Server not responding"
    echo ""
    curl -s "$HOST/models" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    loaded = data.get('data', [])
    print(f'Loaded: {len(loaded)} model(s)')
    for m in loaded:
        print(f'  - {m.get(\"id\", \"unknown\")}')
except: print('Cannot read model status')
" 2>/dev/null
    ;;

  *)
    echo "Usage: ./models.sh [command]"
    echo ""
    echo "Commands:"
    echo "  list              List available + loaded models"
    echo "  load <name>       Load a model"
    echo "  unload <name>     Unload a model (free VRAM)"
    echo "  unload all        Unload all models"
    echo "  status            Server health + loaded models"
    ;;
esac

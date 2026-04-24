#!/bin/bash
# Unload idle models to free VRAM
# Usage: ./unload-idle.sh [model-name]
#   No args = unload ALL loaded models
#   With model name = unload specific model

HOST="http://localhost:8080"

if [ -n "$1" ]; then
  echo "Unloading: $1"
  curl -s -X POST "$HOST/models/unload" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"$1\"}"
  echo ""
else
  echo "Unloading all loaded models..."
  MODELS=$(curl -s "$HOST/models" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('data', []):
        print(m.get('id', ''))
except: pass
" 2>/dev/null)

  for model in $MODELS; do
    echo "  Unloading: $model"
    curl -s -X POST "$HOST/models/unload" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\"}"
    echo ""
  done
fi

echo "Remaining models:"
curl -s "$HOST/models" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('data', []):
        print(f'  - {m.get(\"id\", \"unknown\")}')
    if not data.get('data'):
        print('  (none loaded)')
except: print('  (error reading response)')
" 2>/dev/null

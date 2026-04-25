#!/bin/bash
# Remove a model: delete .gguf + config section + restart container
# Usage: ./remove-model.sh <model-name>

set -e
cd "$(dirname "$0")"

HOST="http://localhost:8581"
model="$1"

if [ -z "$model" ]; then
  echo "Usage: ./remove-model.sh <model-name>"
  echo ""
  echo "Available models:"
  grep -E '^\[' config.ini | tr -d '[]' | sed 's/^/  - /'
  exit 1
fi

# Check section exists in config.ini
if ! grep -q "^\[$model\]" config.ini; then
  echo "Model '$model' not found in config.ini"
  echo "Available:"
  grep -E '^\[' config.ini | tr -d '[]' | sed 's/^/  - /'
  exit 1
fi

# Get model file path from config
model_path=$(grep -A10 "^\[$model\]" config.ini | grep '^model\s*=' | head -1 | sed 's/^model\s*=\s*//')

# Convert container path to local path (/models/foo.gguf → models/foo.gguf)
local_file="${model_path#/models/}"

echo "Removing: $model"
echo "  Config file: $local_file"

# 1. Unload if server is running and model is loaded
if curl -s "$HOST/health" >/dev/null 2>&1; then
  loaded=$(curl -s "$HOST/models" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('data', []):
        if m.get('id') == '$model':
            print('yes')
            break
except: pass
" 2>/dev/null)

  if [ "$loaded" = "yes" ]; then
    echo "  Unloading from server..."
    curl -s -X POST "$HOST/models/unload" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\"}" >/dev/null
  fi
fi

# 2. Delete .gguf file
if [ -f "$local_file" ]; then
  rm "$local_file"
  echo "  Deleted: $local_file"
else
  echo "  File not found: $local_file (already removed?)"
fi

# 3. Remove section from config.ini
python3 -c "
import re
with open('config.ini', 'r') as f:
    content = f.read()
# Remove section [model] until next [ or end of file
pattern = r'\[$model\][^\[]*'
# Also remove trailing newline if section was at end
content = re.sub(pattern, '', content)
# Clean up extra blank lines
content = re.sub(r'\n{3,}', '\n\n', content)
content = content.strip() + '\n'
with open('config.ini', 'w') as f:
    f.write(content)
print('  Removed config section: [$model]')
"

# 4. Restart container
if docker ps --format '{{.Names}}' | grep -q 'llama-router'; then
  echo "  Restarting container..."
  docker compose restart
  echo "  Container restarted"
fi

echo ""
echo "Done. Model '$model' removed."
echo ""
echo "Remaining models:"
grep -E '^\[' config.ini | tr -d '[]' | sed 's/^/  - /'

#!/bin/bash
# Download small models for llama.cpp router mode
# Run: chmod +x download-models.sh && ./download-models.sh

set -e
MODELS_DIR="$(dirname "$0")/models"
mkdir -p "$MODELS_DIR"

# Retry function for wget (3 attempts with exponential backoff)
wget_retry() {
    local url="$1"
    local output="$2"
    local max_attempts=3
    local attempt=1
    local wait_time=5

    while [ $attempt -le $max_attempts ]; do
        echo "  [Attempt $attempt/$max_attempts] Downloading..."
        if wget -c -O "$output" "$url"; then
            # Verify GGUF magic bytes after successful download
            if [ -f "$output" ]; then
                magic=$(head -c 4 "$output" | od -An -tx1 | tr -d ' \n')
                if [ "$magic" = "47475546" ]; then  # "GGUF" in hex
                    echo "  Verified GGUF magic bytes"
                    return 0
                else
                    echo "  ERROR: Invalid GGUF file (bad magic bytes)"
                    rm -f "$output"
                fi
            fi
        fi

        if [ $attempt -lt $max_attempts ]; then
            echo "  Download failed, waiting ${wait_time}s before retry..."
            sleep $wait_time
            wait_time=$((wait_time * 2))
        fi
        attempt=$((attempt + 1))
    done

    echo "  ERROR: Failed to download after $max_attempts attempts"
    return 1
}

echo "=== Downloading GGUF models to $MODELS_DIR ==="

# Qwen3-4B Instruct Q4_K_M (~2.5GB)
if [ ! -f "$MODELS_DIR/qwen3-4b-it-Q4_K_M.gguf" ]; then
  echo "[1/3] Downloading Qwen3-4B..."
  wget_retry \
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/qwen3-4b-it-q4_k_m.gguf" \
    "$MODELS_DIR/qwen3-4b-it-Q4_K_M.gguf"
else
  echo "[1/3] Qwen3-4B already exists, skipping"
fi

# Gemma-3-4B Instruct Q4_K_M (~3GB) - using regular GGUF (not .egguf encrypted)
if [ ! -f "$MODELS_DIR/gemma-3-4b-it-Q4_K_M.gguf" ]; then
  echo "[2/3] Downloading Gemma-3-4B..."
  wget_retry \
    "https://huggingface.co/google/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-q4_k_m.gguf" \
    "$MODELS_DIR/gemma-3-4b-it-Q4_K_M.gguf"
else
  echo "[2/3] Gemma-3-4B already exists, skipping"
fi

# SmolLM2-1.7B Q4_K_M (~1GB)
if [ ! -f "$MODELS_DIR/smollm2-1.7b-Q4_K_M.gguf" ]; then
  echo "[3/3] Downloading SmolLM2-1.7B..."
  wget_retry \
    "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf" \
    "$MODELS_DIR/smollm2-1.7b-Q4_K_M.gguf"
else
  echo "[3/3] SmolLM2-1.7B already exists, skipping"
fi

echo ""
echo "=== Done! Models in $MODELS_DIR ==="
ls -lh "$MODELS_DIR"/*.gguf 2>/dev/null
echo ""
echo "Run: docker compose up -d"

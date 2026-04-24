#!/bin/bash
# Download small models for llama.cpp router mode
# Run: chmod +x download-models.sh && ./download-models.sh

set -e
MODELS_DIR="$(dirname "$0")/models"
mkdir -p "$MODELS_DIR"

echo "=== Downloading GGUF models to $MODELS_DIR ==="

# Qwen3-4B Instruct Q4_K_M (~2.5GB)
if [ ! -f "$MODELS_DIR/qwen3-4b-it-Q4_K_M.gguf" ]; then
  echo "[1/3] Downloading Qwen3-4B..."
  wget -O "$MODELS_DIR/qwen3-4b-it-Q4_K_M.gguf" \
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/qwen3-4b-q4_k_m.gguf"
else
  echo "[1/3] Qwen3-4B already exists, skipping"
fi

# Gemma-3-4B Instruct Q4_K_M (~3GB)
if [ ! -f "$MODELS_DIR/gemma-3-4b-it-Q4_K_M.gguf" ]; then
  echo "[2/3] Downloading Gemma-3-4B..."
  wget -O "$MODELS_DIR/gemma-3-4b-it-Q4_K_M.gguf" \
    "https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf/resolve/main/gemma-3-4b-it-q4_0.egguf"
else
  echo "[2/3] Gemma-3-4B already exists, skipping"
fi

# SmolLM2-1.7B Q4_K_M (~1GB)
if [ ! -f "$MODELS_DIR/smollm2-1.7b-Q4_K_M.gguf" ]; then
  echo "[3/3] Downloading SmolLM2-1.7B..."
  wget -O "$MODELS_DIR/smollm2-1.7b-Q4_K_M.gguf" \
    "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf"
else
  echo "[3/3] SmolLM2-1.7B already exists, skipping"
fi

echo ""
echo "=== Done! Models in $MODELS_DIR ==="
ls -lh "$MODELS_DIR"/*.gguf 2>/dev/null
echo ""
echo "Run: docker compose up -d"

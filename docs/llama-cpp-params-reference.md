# llama.cpp Configuration Parameters Reference

Documentation of available llama.cpp configuration parameters vs. llama-router Web UI support.

## Current llama-router UI Parameters (Supported)

| Parameter | llama.cpp Flag | Type | Default | Description |
|-----------|---------------|------|---------|-------------|
| Context Size | `ctx-size` | int | 8192 | Size of the prompt context |
| GPU Layers | `n-gpu-layers` | int | 99 | Max number of layers to store in VRAM (auto/all/number) |
| Temperature | `temp` | float | 0.7 | Sampling temperature |
| Top-P | `top-p` | float | 0.9 | Top-p sampling (nucleus) |
| Min-P | `min-p` | float | 0.05 | Min-p sampling |
| Reasoning | `reasoning` | enum | off | Use reasoning/thinking (on/off/auto) |
| Flash Attention | `flash-attn` | bool | true | Flash Attention (on/off/auto) |
| Cache RAM | `cache-ram` | int | 0 | Max cache size in MiB (-1=unlimited, 0=disable) |
| Parallel (np) | `np` | int | 1 | Number of server slots |

---

## Available llama.cpp Parameters (Not in UI)

### Sampling Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Top-K | `top-k` | int | 40 | Top-k sampling (0 = disabled) |
| Seed | `seed` | int | -1 | RNG seed (-1 = random) |
| Sampler Sequence | `sampler-seq` | string | edskypmxt | Order of samplers to use |
| Samplers | `samplers` | string | - | Custom sampler sequence (semicolon-separated) |
| Ignore EOS | `ignore-eos` | bool | false | Ignore end of stream token |
| Top-N Sigma | `top-nsigma` | float | -1.0 | Top-n-sigma sampling (-1 = disabled) |
| XTC Probability | `xtc-probability` | float | 0.0 | XTC probability (0.0 = disabled) |
| XTC Threshold | `xtc-threshold` | float | 0.1 | XTC threshold |
| Typical | `typical` | float | 1.0 | Locally typical sampling, parameter p (1.0 = disabled) |
| Repeat Last N | `repeat-last-n` | int | 64 | Last n tokens to penalize (0 = disabled, -1 = ctx_size) |
| Repeat Penalty | `repeat-penalty` | float | 1.0 | Penalize repeat sequence of tokens (1.0 = disabled) |
| Presence Penalty | `presence-penalty` | float | 0.0 | Repeat alpha presence penalty (0.0 = disabled) |
| Frequency Penalty | `frequency-penalty` | float | 0.0 | Repeat alpha frequency penalty (0.0 = disabled) |
| DRY Multiplier | `dry-multiplier` | float | 0.0 | DRY sampling multiplier (0.0 = disabled) |
| DRY Base | `dry-base` | float | 1.75 | DRY sampling base value |
| DRY Allowed Length | `dry-allowed-length` | int | 2 | Allowed length for DRY sampling |
| DRY Penalty Last N | `dry-penalty-last-n` | int | -1 | DRY penalty for last n tokens |
| DRY Sequence Breaker | `dry-sequence-breaker` | string | - | Add sequence breaker for DRY sampling |
| Adaptive Target | `adaptive-target` | float | -1.0 | Adaptive-p target probability (-1 = disabled) |
| Adaptive Decay | `adaptive-decay` | float | 0.9 | Adaptive-p decay rate (0.0-0.99) |
| Dynatemp Range | `dynatemp-range` | float | 0.0 | Dynamic temperature range (0.0 = disabled) |
| Dynatemp Exp | `dynatemp-exp` | float | 1.0 | Dynamic temperature exponent |
| Mirostat | `mirostat` | int | 0 | Mirostat sampling (0=disabled, 1=Mirostat, 2=Mirostat 2.0) |
| Mirostat LR | `mirostat-lr` | float | 0.1 | Mirostat learning rate (eta) |
| Mirostat Ent | `mirostat-ent` | float | 5.0 | Mirostat target entropy (tau) |
| Logit Bias | `logit-bias` | string | - | Modify token likelihood (e.g., "15043+1") |
| Grammar | `grammar` | string | - | BNF-like grammar to constrain generations |
| Grammar File | `grammar-file` | path | - | File to read grammar from |
| JSON Schema | `json-schema` | string | - | JSON schema to constrain generations |
| JSON Schema File | `json-schema-file` | path | - | File containing JSON schema |

### Model Performance Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Threads | `threads` | int | -1 | Number of CPU threads to use during generation |
| Threads Batch | `threads-batch` | int | same | Threads for batch and prompt processing |
| Batch Size | `batch-size` | int | 2048 | Logical maximum batch size |
| Micro Batch Size | `ubatch-size` | int | 512 | Physical maximum batch size |
| N Predict | `n-predict` | int | -1 | Number of tokens to predict (-1 = infinity) |
| Keep | `keep` | int | 0 | Number of tokens to keep from initial prompt (-1 = all) |
| SWA Full | `swa-full` | bool | false | Use full-size SWA cache |
| Perf | `perf` | bool | false | Enable internal libllama performance timings |

### RoPE Scaling Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| RoPE Scaling | `rope-scaling` | enum | linear | RoPE frequency scaling method (none/linear/yarn) |
| RoPE Scale | `rope-scale` | float | - | RoPE context scaling factor |
| RoPE Freq Base | `rope-freq-base` | float | from model | RoPE base frequency for NTK-aware scaling |
| RoPE Freq Scale | `rope-freq-scale` | float | - | RoPE frequency scaling factor |
| YaRN Orig Ctx | `yarn-orig-ctx` | int | 0 | YaRN: original context size of model |
| YaRN Ext Factor | `yarn-ext-factor` | float | -1.0 | YaRN: extrapolation mix factor |
| YaRN Attn Factor | `yarn-attn-factor` | float | -1.0 | YaRN: scale sqrt(t) attention magnitude |
| YaRN Beta Slow | `yarn-beta-slow` | float | -1.0 | YaRN: high correction dim (alpha) |
| YaRN Beta Fast | `yarn-beta-fast` | float | -1.0 | YaRN: low correction dim (beta) |

### GPU/Memory Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Split Mode | `split-mode` | enum | layer | How to split model across GPUs (none/layer/row/tensor) |
| Tensor Split | `tensor-split` | list | - | Fraction of model to offload to each GPU (e.g., "3,1") |
| Main GPU | `main-gpu` | int | 0 | GPU to use for model (with split-mode=none) |
| KV Offload | `kv-offload` | bool | true | Enable KV cache offloading |
| No Host | `no-host` | bool | false | Bypass host buffer for extra buffers |
| Cache Type K | `cache-type-k` | enum | f16 | KV cache data type for K (f32/f16/bf16/q8_0/q4_0/q4_1/iq4_nl/q5_0/q5_1) |
| Cache Type V | `cache-type-v` | enum | f16 | KV cache data type for V (same types as K) |
| MLock | `mlock` | bool | false | Force system to keep model in RAM |
| MMap | `mmap` | bool | true | Memory-map model (slower load if disabled) |
| Direct IO | `direct-io` | bool | false | Use DirectIO if available |
| NUMA | `numa` | enum | - | NUMA optimization (distribute/isolate/numactl) |
| Device | `device` | list | - | Comma-separated list of devices for offloading |
| CPU MoE | `cpu-moe` | bool | false | Keep all MoE weights in CPU |
| N CPU MoE | `n-cpu-moe` | int | - | Keep first N layers of MoE weights in CPU |
| Repack | `repack` | bool | true | Enable weight repacking |
| Check Tensors | `check-tensors` | bool | false | Check model tensor data for invalid values |

### Fit/Memory Management

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Fit | `fit` | enum | on | Adjust unset arguments to fit in device memory (on/off) |
| Fit Target | `fit-target` | list | 1024 | Target margin per device for --fit (MiB) |
| Fit Ctx | `fit-ctx` | int | 4096 | Minimum ctx size that can be set by --fit |

### Reasoning Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Reasoning Format | `reasoning-format` | enum | auto | Format for thoughts (none/deepseek/deepseek-legacy) |
| Reasoning Budget | `reasoning-budget` | int | -1 | Token budget for thinking (-1=unlimited, 0=immediate end) |
| Reasoning Budget Message | `reasoning-budget-message` | string | - | Message injected before end-of-thinking tag |

### Chat Template Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Chat Template | `chat-template` | string | from model | Built-in chat template name |
| Chat Template File | `chat-template-file` | path | - | File containing custom jinja chat template |
| Jinja | `jinja` | bool | true | Use jinja template engine for chat |
| Skip Chat Parsing | `skip-chat-parsing` | bool | false | Force pure content parser (no template) |
| Prefill Assistant | `prefill-assistant` | bool | true | Prefill assistant's response if last message is assistant |

### Server/Router Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Host | `host` | string | 127.0.0.1 | IP address to listen |
| Port | `port` | int | 8080 | Port to listen |
| Alias | `alias` | string | - | Model name aliases (comma-separated) |
| Tags | `tags` | string | - | Model tags (comma-separated, informational) |
| Timeout | `timeout` | int | 600 | Server read/write timeout in seconds |
| Threads HTTP | `threads-http` | int | -1 | Threads to process HTTP requests |
| Cache Prompt | `cache-prompt` | bool | true | Enable prompt caching |
| Cache Reuse | `cache-reuse` | int | 0 | Min chunk size to reuse from cache via KV shifting |
| Metrics | `metrics` | bool | false | Enable Prometheus metrics endpoint |
| Props | `props` | bool | false | Enable changing global properties via POST /props |
| Slots Endpoint | `slots` | bool | true | Expose slots monitoring endpoint |
| Slot Save Path | `slot-save-path` | path | - | Path to save slot kv cache |
| Media Path | `media-path` | path | - | Directory for loading local media files |
| Models Dir | `models-dir` | path | - | Directory containing models for router server |
| Models Preset | `models-preset` | path | - | Path to INI file containing model presets |
| Models Max | `models-max` | int | 4 | Maximum number of models to load simultaneously (0=unlimited) |
| Models Autoload | `models-autoload` | bool | true | Automatically load models in router mode |

### Advanced/Lookup Decoding

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Lookup Cache Static | `lookup-cache-static` | path | - | Path to static lookup cache for lookup decoding |
| Lookup Cache Dynamic | `lookup-cache-dynamic` | path | - | Path to dynamic lookup cache for lookup decoding |
| Context Checkpoints | `ctx-checkpoints` | int | 32 | Max number of context checkpoints per slot |
| Checkpoint Every N Tokens | `checkpoint-every-n-tokens` | int | 8192 | Create checkpoint every n tokens during prefill |

### Speculative Decoding (Draft Model)

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Draft Max | `draft-max` | int | 16 | Number of tokens to draft for speculative decoding |
| Draft Min | `draft-min` | int | 0 | Minimum number of draft tokens to use |
| Draft P Min | `draft-p-min` | float | 0.75 | Minimum speculative decoding probability |
| Model Draft | `model-draft` | path | - | Draft model for speculative decoding |
| Ctx Size Draft | `ctx-size-draft` | int | 0 | Context size for draft model |
| Device Draft | `device-draft` | list | - | Devices for offloading draft model |
| GPU Layers Draft | `gpu-layers-draft` | int | auto | Max draft model layers in VRAM |
| Threads Draft | `threads-draft` | int | same | Threads for draft model |
| Spec Type | `spec-type` | enum | none | Speculative decoding type without draft model |
| Spec Replace | `spec-replace` | string | - | Translate string between target and draft models |

### LoRA / Control Vector

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| LoRA | `lora` | path | - | Path to LoRA adapter (comma-separated for multiple) |
| LoRA Scaled | `lora-scaled` | list | - | LoRA adapter with scaling (FNAME:SCALE) |
| Control Vector | `control-vector` | path | - | Add a control vector |
| Control Vector Scaled | `control-vector-scaled` | list | - | Control vector with scaling (FNAME:SCALE) |
| Control Vector Layer Range | `control-vector-layer-range` | int,int | - | Layer range for control vector (START END) |

### Multimodal / Vision

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| MMProj | `mmproj` | path | - | Path to multimodal projector file |
| MMProj URL | `mmproj-url` | url | - | URL to multimodal projector file |
| MMProj Auto | `mmproj-auto` | bool | true | Use multimodal projector if available |
| MMProj Offload | `mmproj-offload` | bool | true | Enable GPU offloading for multimodal projector |
| Image Min Tokens | `image-min-tokens` | int | from model | Min tokens per image (dynamic resolution) |
| Image Max Tokens | `image-max-tokens` | int | from model | Max tokens per image (dynamic resolution) |

### Other Parameters

| Parameter | Flag | Type | Default | Description |
|-----------|------|------|---------|-------------|
| Model | `model` | path | - | Model path to load |
| Model URL | `model-url` | url | - | Model download url |
| HF Repo | `hf-repo` | string | - | Hugging Face model repository (user/model:quant) |
| HF Token | `hf-token` | string | - | Hugging Face access token |
| Override KV | `override-kv` | string | - | Override model metadata by key (TYPE:VALUE) |
| Override Tensor | `override-tensor` | list | - | Override tensor buffer type |
| KV Unified | `kv-unified` | bool | auto | Use single unified KV buffer across all sequences |
| Cache Idle Slots | `cache-idle-slots` | bool | true | Save and clear idle slots on new task |
| Context Shift | `context-shift` | bool | false | Use context shift on infinite text generation |
| Reverse Prompt | `reverse-prompt` | string | - | Halt generation at PROMPT (interactive) |
| Special | `special` | bool | false | Special tokens output enabled |
| Warmup | `warmup` | bool | true | Perform warmup with empty run |
| Pooling | `pooling` | enum | from model | Pooling type for embeddings (none/mean/cls/last/rank) |
| API Key | `api-key` | string | - | API key for authentication (comma-separated list) |
| SSL Key File | `ssl-key-file` | path | - | PEM-encoded SSL private key |
| SSL Cert File | `ssl-cert-file` | path | - | PEM-encoded SSL certificate |

---

## Built-in Chat Templates

Available templates for `chat-template` parameter:

- `bailing`, `bailing-think`, `bailing2`
- `chatglm3`, `chatglm4`, `chatml`
- `command-r`
- `deepseek`, `deepseek-ocr`, `deepseek2`, `deepseek3`
- `exaone-moe`, `exaone3`, `exaone4`
- `falcon3`
- `gemma`
- `gigachat`
- `glmedge`
- `gpt-oss`
- `granite`, `granite-4.0`
- `grok-2`
- `hunyuan-dense`, `hunyuan-moe`, `hunyuan-ocr`
- `kimi-k2`
- `llama2`, `llama2-sys`, `llama2-sys-bos`, `llama2-sys-strip`
- `llama3`, `llama4`
- `megrez`
- `minicpm`
- `mistral-v1`, `mistral-v3`, `mistral-v3-tekken`, `mistral-v7`, `mistral-v7-tekken`
- `monarch`
- `openchat`
- `orion`
- `pangu-embedded`
- `phi3`, `phi4`
- `rwkv-world`
- `seed_oss`
- `smolvlm`
- `solar-open`
- `vicuna`, `vicuna-orca`
- `yandex`
- `zephyr`

---

## Environment Variables

Some parameters can be set via environment variables:

| Env Var | Corresponding Flag |
|---------|-------------------|
| `LLAMA_ARG_THREADS` | `--threads` |
| `LLAMA_ARG_CTX_SIZE` | `--ctx-size` |
| `LLAMA_ARG_N_PREDICT` | `--n-predict` |
| `LLAMA_ARG_BATCH` | `--batch-size` |
| `LLAMA_ARG_UBATCH` | `--ubatch-size` |
| `LLAMA_ARG_FLASH_ATTN` | `--flash-attn` |
| `LLAMA_ARG_TOP_K` | `--top-k` |
| `LLAMA_ARG_ROPE_SCALE` | `--rope-scale` |
| `LLAMA_ARG_N_GPU_LAYERS` | `--n-gpu-layers` |
| `LLAMA_ARG_MODEL` | `--model` |
| `LLAMA_ARG_HOST` | `--host` |
| `LLAMA_ARG_PORT` | `--port` |
| `LLAMA_API_KEY` | `--api-key` |
| `HF_TOKEN` | `--hf-token` |
| `LLAMA_LOG_FILE` | `--log-file` |

---

## Source Information

- **llama.cpp Version**: Based on llama.cpp:full-cuda Docker image
- **Documentation Date**: 2026-04-25
- **Source**: `docker exec llama-router /app/llama-server --help`

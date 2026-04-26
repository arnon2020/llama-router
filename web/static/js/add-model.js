// Add Model logic - extracted from index.html

// Quick models data for Add Model tab
// Only models that can be downloaded directly (no gated/auth required)
const quickModels = [
    // Small models (< 4GB)
    {
        name: 'SmolLM2 1.7B',
        filename: 'smollm2-1.7b-instruct-q4_k_m.gguf',
        url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
        provider: 'HuggingFaceTB',
        size: 'small',
        sizeGB: '~1GB',
        gated: false
    },
    {
        name: 'Qwen3 4B',
        filename: 'Qwen3-4B-Q4_K_M.gguf',
        url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
        provider: 'Qwen',
        size: 'small',
        sizeGB: '~2.5GB',
        gated: false
    },
    // Medium models (4-8GB)
    {
        name: 'Qwen2.5 7B',
        filename: 'qwen2.5-7b-instruct-q3_k_m.gguf',
        url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q3_k_m.gguf',
        provider: 'Qwen',
        size: 'medium',
        sizeGB: '~3.8GB',
        gated: false
    },
    {
        name: 'Phi-3.5 Mini',
        filename: 'phi-3.5-mini-instruct-q4_k_m.gguf',
        url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-GGUF/resolve/main/phi-3.5-mini-instruct-q4_k_m.gguf',
        provider: 'Microsoft',
        size: 'medium',
        sizeGB: '~2.5GB',
        gated: false
    },
    {
        name: 'Mistral 7B',
        filename: 'mistral-7b-instruct-v0.3-q4_k_m.gguf',
        url: 'https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/mistral-7b-instruct-v0.3-q4_k_m.gguf',
        provider: 'MistralAI',
        size: 'medium',
        sizeGB: '~4.5GB',
        gated: false
    },
    {
        name: 'DeepSeek R1 7B',
        filename: 'deepseek-r1-distill-qwen-7b-q4_k_m.gguf',
        url: 'https://huggingface.co/DeepSeek-Qwen/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/deepseek-r1-distill-qwen-7b-q4_k_m.gguf',
        provider: 'DeepSeek',
        size: 'medium',
        sizeGB: '~5GB',
        gated: false
    },
    // Large models (> 8GB)
    {
        name: 'Mistral Nemo 12B',
        filename: 'mistral-nemo-instruct-2407-q4_k_m.gguf',
        url: 'https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407-GGUF/resolve/main/mistral-nemo-instruct-2407-q4_k_m.gguf',
        provider: 'MistralAI',
        size: 'large',
        sizeGB: '~8GB',
        gated: false
    },
    {
        name: 'DeepSeek R1 14B',
        filename: 'deepseek-r1-distill-qwen-14b-q4_k_m.gguf',
        url: 'https://huggingface.co/DeepSeek-Qwen/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/deepseek-r1-distill-qwen-14b-q4_k_m.gguf',
        provider: 'DeepSeek',
        size: 'large',
        sizeGB: '~9GB',
        gated: false
    }
];

// Populate quick models grid
function loadQuickModels() {
    const grid = document.getElementById('quick-models-grid');
    if (!grid) return;

    // Render all models initially
    renderQuickModels(quickModels);
}

// Render models to the grid
function renderQuickModels(models) {
    const grid = document.getElementById('quick-models-grid');
    if (!grid) return;

    if (models.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 2rem;">No models found in this category</div>';
        return;
    }

    grid.innerHTML = models.map(model => `
        <div class="quick-model-card" data-size="${model.size}" data-category="${model.size}"
             onclick="downloadQuickModel('${escapeHtml(model.name)}', '${escapeHtml(model.url)}', '${escapeHtml(model.filename)}', ${model.gated})">
            <div class="quick-model-header">
                <span class="quick-model-name">${escapeHtml(model.name)}</span>
                <span class="quick-model-badge ${model.size}">${model.size}</span>
            </div>
            <div class="quick-model-filename">${escapeHtml(model.filename)}</div>
            <div class="quick-model-info">
                <span class="quick-model-provider">${escapeHtml(model.provider)}</span>
                <span>${model.sizeGB}</span>
            </div>
            ${model.gated ? '<div class="quick-model-gated" style="margin-top: 0.5rem;">Gated Model</div>' : ''}
            <div class="quick-model-download-hint" style="margin-top: 0.75rem; font-size: 0.75rem;">
                Click to download
            </div>
        </div>
    `).join('');
}

// Filter models by category (renamed from filterModels to filterQuickModels)
function filterQuickModels(category) {
    // Update active tab
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.category === category) {
            tab.classList.add('active');
        }
    });

    // Filter models
    const filtered = category === 'all'
        ? quickModels
        : quickModels.filter(m => m.size === category);

    renderQuickModels(filtered);
}

// Download a quick model
async function downloadQuickModel(name, url, filename, gated) {
    // Check if gated and prompt for token
    let hfToken = '';

    if (gated) {
        hfToken = prompt(`🔒 "${name}" is a gated model.\n\nEnter your HuggingFace Token (leave empty if you have access):\n\nGet your token from: https://huggingface.co/settings/tokens`);
        if (hfToken === null) {
            // User cancelled
            return;
        }
    }

    const data = {
        name: name,
        url: url,
        filename: filename,
        hf_token: hfToken || null,
        // Default settings
        'ctx-size': 8192,
        'n-gpu-layers': 99,
        'temp': 0.7,
        'top-p': 0.9,
        'min-p': 0.05,
        'reasoning': 'off',
        'flash-attn': true,
        'mmproj': '',
        'chat-template-file': '',
        'cache-ram': 0,
        'np': 1,
        'port': 8080,
        'host': '0.0.0.0'
    };

    try {
        showAlert(`Starting download for ${name}...`, 'success');

        // Start download
        const startResponse = await fetch('/api/download/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!startResponse.ok) {
            throw new Error('Failed to start download');
        }

        const { download_id } = await startResponse.json();

        // Show progress modal
        showDownloadModal(data.name, download_id, () => {
            showAlert(`Model "${name}" downloaded and added successfully`, 'success');
            // Switch to models tab
            document.querySelector('.tab[data-tab="models"]').click();
            setTimeout(() => loadModels(), 2000);
            setTimeout(() => loadModels(), 5000);
            setTimeout(() => loadConfig(), 3000);
        }, () => {
            showAlert(`Download failed for ${name}`, 'error');
        });

    } catch (error) {
        showAlert('Failed to download model: ' + error.message, 'error');
    }
}

// Suggest HuggingFace URL based on model name/filename
function suggestHuggingFaceUrl(input) {
    const patterns = [
        // Qwen models
        { regex: /qwen[-_]?2[-_]?5[-_]?(\d+[\._]?\d*)b[-_].*?([a-z0-9]+[-_][a-z0-9]+[-_]?)?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/Qwen/Qwen2.5-${m[1]}B-Instruct-GGUF/resolve/main/${m[0]}` },
        { regex: /qwen[-_]?3[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/Qwen/Qwen3-${m[1]}B-GGUF/resolve/main/${m[0]}` },
        { regex: /qwen[-_]?(\d[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/Qwen/Qwen-${m[1]}B-Instruct-GGUF/resolve/main/${m[0]}` },

        // Gemma models
        { regex: /gemma[-_]?3[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/google/gemma-3-${m[1]}b-it-GGUF/resolve/main/${m[0]}` },
        { regex: /gemma[-_]?2[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/google/gemma-2-${m[1]}b-it-GGUF/resolve/main/${m[0]}` },

        // Llama models
        { regex: /llama[-_]?3[-_]?[\._]?(\d+)[-_](\d+)[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/meta-llama/Llama-3.${m[1]}-${m[2]}B-Instruct-GGUF/resolve/main/${m[0]}` },
        { regex: /llama[-_]?3[-_]?(\d+)[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/meta-llama/Llama-3.${m[1]}B-Instruct-GGUF/resolve/main/${m[0]}` },

        // SmolLM models
        { regex: /smollm[-_]?2[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/HuggingFaceTB/SmolLM2-${m[1]}B-Instruct-GGUF/resolve/main/${m[0]}` },
        { regex: /smollm[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/HuggingFaceTB/SmolLM-${m[1]}B-Instruct-GGUF/resolve/main/${m[0]}` },

        // Phi models
        { regex: /phi[-_]?(\d+)[-_](\d+)[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/microsoft/Phi-${m[1]}-${m[2]}B-Instruct-GGUF/resolve/main/${m[0]}` },
        { regex: /phi[-_]?3[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-GGUF/resolve/main/${m[0]}` },

        // Mistral models
        { regex: /mistral[-_]?(\d+[\._]?\d*)b[-_].*?q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/mistralai/Mistral-${m[1]}B-Instruct-v0.3-GGUF/resolve/main/${m[0]}` },

        // Generic fallback - try common organization patterns
        { regex: /([a-z0-9]+)[-_](\d+[\._]?\d*)b[-_](.*)q4[_-]?k[_-]?m\.gguf/i,
          url: (m) => `https://huggingface.co/${m[1]}/${m[1]}-${m[2]}b-${m[3]}-GGUF/resolve/main/${m[0]}` }
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern.regex);
        if (match) {
            return pattern.url(match);
        }
    }
    return null;
}

// Auto-fill defaults based on model name/filename
function autoFillDefaults() {
    const name = document.getElementById('model-name').value.trim();
    const filename = document.getElementById('model-filename').value.trim();
    const urlInput = document.getElementById('model-url');
    const urlPreview = document.getElementById('url-preview');

    // Only suggest if URL field is empty
    if (urlInput.value) return;

    if (filename) {
        // Try to detect from filename
        const suggestedUrl = suggestHuggingFaceUrl(filename);
        if (suggestedUrl) {
            urlPreview.textContent = `Will use: ${suggestedUrl}`;
            urlPreview.style.display = 'block';
        } else {
            urlPreview.style.display = 'none';
        }
    } else if (name) {
        // Try to detect from model name
        const suggestedUrl = suggestHuggingFaceUrl(name);
        if (suggestedUrl) {
            urlPreview.textContent = `Will use: ${suggestedUrl}`;
            urlPreview.style.display = 'block';
        } else {
            urlPreview.style.display = 'none';
        }
    } else {
        urlPreview.style.display = 'none';
    }
}

// Setup add-model form listeners (called on page init)
function setupAddModelListeners() {
    const form = document.getElementById('add-model-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        let url = formData.get('url');

        // If URL is empty, try to auto-detect from filename or model name
        if (!url || !url.trim()) {
            const filename = formData.get('filename');
            const name = formData.get('name');
            const detectedUrl = suggestHuggingFaceUrl(filename || name);

            if (detectedUrl) {
                url = detectedUrl;
                showAlert(`Auto-detected download URL for ${filename}`, 'success');
            } else {
                showAlert('No download URL provided and could not auto-detect. Please provide a URL.', 'error');
                return;
            }
        }

        const data = {
            name: formData.get('name'),
            url: url,
            filename: formData.get('filename'),
            hf_token: formData.get('hf_token'),
            // Use default settings - can be edited in Configuration page
            'ctx-size': 8192,
            'n-gpu-layers': 99,
            'temp': 0.7,
            'top-p': 0.9,
            'min-p': 0.05,
            'reasoning': 'off',
            'flash-attn': true,
            'mmproj': '',
            'chat-template-file': '',
            'cache-ram': 0,
            'np': 1,
            'port': 8080,
            'host': '0.0.0.0'
        };

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Starting...';

        try {
            // Start download and get download ID
            const startResponse = await fetch('/api/download/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!startResponse.ok) {
                throw new Error('Failed to start download');
            }

            const { download_id } = await startResponse.json();

            // Show progress modal
            showDownloadModal(data.name, download_id, () => {
                // On complete callback
                showAlert(`Model "${data.name}" downloaded and added successfully`, 'success');
                e.target.reset();
                document.getElementById('url-preview').style.display = 'none';
                // Switch to models tab and load models
                document.querySelector('.tab[data-tab="models"]').click();
                // Wait for llama-router restart and refresh models
                setTimeout(() => loadModels(), 2000);
                setTimeout(() => loadModels(), 5000);
                // Also refresh configuration
                setTimeout(() => loadConfig(), 3000);
            }, () => {
                // On error callback
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            });

        } catch (error) {
            showAlert('Failed to download model: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

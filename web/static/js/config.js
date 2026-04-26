// Config tab logic - extracted from index.html

// Load config
async function loadConfig() {
    const container = document.getElementById('config-container');
    if (!container) return;

    try {
        const response = await fetch('/api/config');
        const config = await response.json();

        const sections = Object.entries(config);

        if (sections.length === 0) {
            container.innerHTML = '<div class="empty-state">No configuration found</div>';
            return;
        }

        container.innerHTML = sections.map(([name, settings]) => `
            <div class="config-section">
                <h3>${escapeHtml(name)}</h3>
                <p style="color: #888; font-size: 0.85rem; margin-bottom: 1rem;">Model file: ${escapeHtml(settings.model || '')}</p>

                <div class="form-row">
                    ${Object.entries(settings).filter(([key]) => key !== 'model').map(([key, value]) => {
                        // Special handling for different field types
                        if (key === 'ctx-size') {
                            return `
                                <div class="form-group">
                                    <label>Context Size</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="512" step="512" placeholder="8192">
                                </div>`;
                        } else if (key === 'n-gpu-layers') {
                            return `
                                <div class="form-group">
                                    <label>GPU Layers</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="0" max="999" placeholder="99">
                                </div>`;
                        } else if (key === 'temp') {
                            return `
                                <div class="form-group">
                                    <label>Temperature</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="0" max="2" step="0.05" placeholder="0.7">
                                </div>`;
                        } else if (key === 'top-p') {
                            return `
                                <div class="form-group">
                                    <label>Top-P</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="0" max="1" step="0.05" placeholder="0.9">
                                </div>`;
                        } else if (key === 'min-p') {
                            return `
                                <div class="form-group">
                                    <label>Min-P</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="0" max="1" step="0.01" placeholder="0.05">
                                </div>`;
                        } else if (key === 'reasoning') {
                            return `
                                <div class="form-group">
                                    <label>Reasoning Mode</label>
                                    <select data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}">
                                        <option value="off" ${value === 'off' ? 'selected' : ''}>Off</option>
                                        <option value="on" ${value === 'on' ? 'selected' : ''}>On</option>
                                    </select>
                                </div>`;
                        } else if (key === 'flash-attn' || key === 'fa') {
                            return `
                                <div class="form-group">
                                    <label>Flash Attention</label>
                                    <select data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}">
                                        <option value="true" ${value === 'true' ? 'selected' : ''}>On</option>
                                        <option value="false" ${value === 'false' ? 'selected' : ''}>Off</option>
                                    </select>
                                </div>`;
                        } else if (key === 'cache-ram') {
                            return `
                                <div class="form-group">
                                    <label>Cache RAM (bytes)</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="0" step="1" placeholder="0">
                                </div>`;
                        } else if (key === 'np') {
                            return `
                                <div class="form-group">
                                    <label>Parallel (np)</label>
                                    <input type="number" value="${value}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}"
                                        min="1" max="16" step="1" placeholder="1">
                                </div>`;
                        } else {
                            // Default text input for other fields
                            return `
                                <div class="form-group">
                                    <label>${escapeHtml(key)}</label>
                                    <input type="text" value="${escapeHtml(value)}" data-key="${escapeHtml(key)}" data-section="${escapeHtml(name)}">
                                </div>`;
                        }
                    }).join('')}
                </div>
                <button class="btn btn-primary" data-action="save-config" data-section="${escapeHtml(name)}">Save Changes</button>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<div class="empty-state">Failed to load configuration</div>';
        showAlert('Failed to load config: ' + error.message, 'error');
    }
}

// Save config section
async function saveConfig(section) {
    const inputs = document.querySelectorAll(`input[data-section="${section}"]`);
    const selects = document.querySelectorAll(`select[data-section="${section}"]`);
    const data = {};

    inputs.forEach(input => {
        const key = input.dataset.key;
        const value = input.type === 'number' ? parseFloat(input.value) : input.value;
        data[key] = value;
    });

    selects.forEach(select => {
        data[select.dataset.key] = select.value;
    });

    try {
        const response = await fetch(`/api/config/${encodeURIComponent(section)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showAlert('Configuration saved successfully', 'success');
            // Refresh models list after config change
            setTimeout(() => loadModels(), 2000);
        } else {
            const error = await response.json();
            showAlert('Failed to save config: ' + error.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to save config: ' + error.message, 'error');
    }
}

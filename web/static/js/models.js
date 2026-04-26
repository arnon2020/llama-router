// Models tab logic - Simplified (Lifecycle managed via Profiles)
// Shows lifecycle status as read-only badges, no edit buttons

let allModelsData = [];
let lifecycleData = {};
let lifecycleRefreshTimer = null;

// Load models with lifecycle data
async function loadModels() {
    const tbody = document.getElementById('models-body');
    const searchInput = document.getElementById('models-search');
    const filterBy = document.getElementById('models-filter-by');

    try {
        const [modelsResp, lifecycleResp] = await Promise.all([
            fetch('/api/models'),
            fetch('/api/lifecycle').catch(() => null)
        ]);

        const models = await modelsResp.json();
        allModelsData = models;

        if (lifecycleResp && lifecycleResp.ok) {
            lifecycleData = await lifecycleResp.json();
        } else {
            lifecycleData = {};
        }

        if (models.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No models configured</td></tr>';
            return;
        }

        populateByFilter(models);
        renderModelsTable(models);
        startLifecycleRefresh();

    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load models</td></tr>';
        showAlert('Failed to load models: ' + error.message, 'error');
    }
}

function startLifecycleRefresh() {
    if (lifecycleRefreshTimer) clearInterval(lifecycleRefreshTimer);
    lifecycleRefreshTimer = setInterval(async () => {
        try {
            const resp = await fetch('/api/lifecycle');
            if (resp.ok) {
                lifecycleData = await resp.json();
                renderModelsTable(allModelsData);
            }
        } catch (e) { /* ignore */ }
    }, 15000);
}

function populateByFilter(models) {
    const filterBy = document.getElementById('models-filter-by');
    const byValues = [...new Set(models.map(m => m.by || 'Unknown'))].sort();
    filterBy.innerHTML = '<option value="">All By</option>' +
        byValues.map(by => `<option value="${escapeHtml(by)}">${escapeHtml(by)}</option>`).join('');
}

function filterModels() {
    const searchTerm = document.getElementById('models-search').value.toLowerCase();
    const byFilter = document.getElementById('models-filter-by').value;
    const filtered = allModelsData.filter(model => {
        const matchesSearch = model.name.toLowerCase().includes(searchTerm);
        const matchesBy = !byFilter || model.by === byFilter;
        return matchesSearch && matchesBy;
    });
    renderModelsTable(filtered);
}

function renderModelsTable(models) {
    const tbody = document.getElementById('models-body');

    if (models.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No models match your filters</td></tr>';
        return;
    }

    const newModels = getNewlyDownloadedModels();

    tbody.innerHTML = models.map(model => {
        const isNew = !model.loaded && newModels.includes(model.name);
        const status = model.status || 'idle';
        const lc = lifecycleData[model.name] || {};
        const isPinned = lc.pin || false;
        const isPreload = lc.preload || false;
        const remaining = lc.remaining_minutes;

        // Model name with badges
        let nameHtml = escapeHtml(model.name);
        if (isNew) nameHtml += ' <span class="badge new">New</span>';
        if (isPinned) nameHtml += ' <span class="lc-badge lc-pin" title="Pinned (via Profile)">📌</span>';
        if (isPreload) nameHtml += ' <span class="lc-badge lc-preload" title="Preload on startup (via Profile)">🚀</span>';

        // Status badge with lifecycle timer
        let statusHtml = '';
        if (status === 'loaded') {
            let timerHtml = '';
            if (remaining !== null && remaining !== undefined) {
                const mins = Math.floor(remaining);
                const color = remaining < 5 ? 'lc-timer-danger' : remaining < 15 ? 'lc-timer-warn' : '';
                timerHtml = ` <span class="lc-timer ${color}" title="Auto-unload in ${remaining}min">${mins}m</span>`;
            } else if (isPinned) {
                timerHtml = ' <span class="lc-timer lc-timer-pinned" title="Pinned">∞</span>';
            }
            statusHtml = `<span class="badge running">RUNNING</span>${timerHtml}`;
        } else if (status === 'loading') {
            statusHtml = '<span class="badge loading">Loading...</span>';
        } else {
            statusHtml = '<span class="badge idle">IDLE</span>';
        }

        // Actions: Load/Unload + Remove only (no lifecycle buttons)
        let actionsHtml = '';
        if (status === 'loaded') {
            actionsHtml = `<button class="btn-sm btn-action" data-action="unload" data-model="${escapeHtml(model.name)}" title="Unload">⏏</button>`;
        } else if (status !== 'loading') {
            actionsHtml = `<button class="btn-sm btn-action" data-action="load" data-model="${escapeHtml(model.name)}" title="Load">▶</button>`;
        }
        actionsHtml += ` <button class="btn-remove-icon" data-action="remove" data-model="${escapeHtml(model.name)}" title="Delete model">×</button>`;

        return `
            <tr class="${status === 'loaded' ? 'model-loaded' : status === 'loading' ? 'model-loading' : 'model-row-clickable'}" data-model="${escapeHtml(model.name)}">
                <td class="model-name-cell">${nameHtml}</td>
                <td>${escapeHtml(model.by || '-')}</td>
                <td>${escapeHtml(model.quant || '-')}</td>
                <td>${statusHtml}</td>
                <td>${escapeHtml(model.size || '-')}</td>
                <td class="model-actions">${actionsHtml}</td>
            </tr>
        `;
    }).join('');

    // Click to load
    document.querySelectorAll('.model-row-clickable').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                loadModelByName(row.dataset.model);
            }
        });
    });

    // Button handlers
    tbody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const model = btn.dataset.model;
            if (action === 'load') loadModelByName(model);
            else if (action === 'unload') unloadModel(model);
            else if (action === 'remove') removeModel(model);
        });
    });
}

// Load model
async function loadModelByName(name) {
    showAlert(`Loading model: ${name}...`, 'info');
    try {
        const response = await fetch(`/api/models/${encodeURIComponent(name)}/load`, { method: 'POST' });
        if (response.ok) {
            removeNewlyDownloadedModel(name);
            showAlert(`Model "${name}" loaded successfully`, 'success');
            setTimeout(() => loadModels(), 2000);
        } else {
            const error = await response.json();
            showAlert(`Failed to load: ${error.error || 'Unknown error'}`, 'error');
            setTimeout(() => loadModels(), 2000);
        }
    } catch (error) {
        showAlert(`Failed to load model: ${error.message}`, 'error');
        setTimeout(() => loadModels(), 2000);
    }
}

async function loadModel(name) { return loadModelByName(name); }

// Unload model
async function unloadModel(name) {
    try {
        const response = await fetch(`/api/models/${encodeURIComponent(name)}/unload`, { method: 'POST' });
        if (response.ok) {
            showAlert(`Unloaded: ${name}`, 'success');
            setTimeout(() => loadModels(), 1000);
        } else {
            const error = await response.json();
            showAlert('Failed to unload: ' + error.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to unload: ' + error.message, 'error');
    }
}

// Remove model
async function removeModel(name) {
    if (!confirm(`Remove "${name}"?\n\nThis will unload, delete file, and remove from config.`)) return;
    try {
        const response = await fetch(`/api/models/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (response.ok) {
            showAlert(`Removed: ${name}`, 'success');
            setTimeout(() => loadModels(), 1000);
        } else {
            const error = await response.json();
            showAlert('Failed: ' + error.error, 'error');
        }
    } catch (error) {
        showAlert('Failed: ' + error.message, 'error');
    }
}

// Setup listeners
function setupModelsListeners() {
    const searchInput = document.getElementById('models-search');
    const filterBy = document.getElementById('models-filter-by');
    if (searchInput) searchInput.addEventListener('input', filterModels);
    if (filterBy) filterBy.addEventListener('change', filterModels);
}

// Cleanup on page change
function cleanupModels() {
    if (lifecycleRefreshTimer) {
        clearInterval(lifecycleRefreshTimer);
        lifecycleRefreshTimer = null;
    }
}

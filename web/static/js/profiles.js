// Profiles logic - Essential-first + Collapsible Advanced + Lifecycle

let profileSchema = null;
let currentProfileData = {};

// Essential params shown by default
const ESSENTIAL_PARAMS = ['ctx-size', 'n-gpu-layers', 'temp', 'top-p', 'top-k', 'flash-attn', 'reasoning'];
const HEADER_PARAMS = ['model', 'description'];

// Lifecycle defaults
const LIFECYCLE_OPTIONS = [
    { label: 'Never', value: 0 },
    { label: '5m', value: 5 },
    { label: '10m', value: 10 },
    { label: '15m', value: 15 },
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '2h', value: 120 },
    { label: '8h', value: 480 },
];

// Load profiles when tab is activated
async function loadProfiles() {
    const container = document.getElementById('profiles-container');

    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load profiles');
        }

        const profiles = data.profiles || [];

        if (profiles.length === 0) {
            container.innerHTML = `
                <div class="empty-profiles">
                    <div class="empty-profiles-icon">📋</div>
                    <p>No profiles yet</p>
                    <p style="font-size: 0.85rem; margin-top: 0.5rem;">
                        Create a profile to save your favorite model configurations
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="profiles-grid">
                ${profiles.map(profile => {
                    const name = profile.name || 'Unnamed';
                    const modelName = profile.model || 'No model';
                    const description = profile.description || '';
                    const settings = profile.settings || {};
                    const params = [];

                    if (settings['ctx-size']) params.push(`Ctx: ${settings['ctx-size']}`);
                    if (settings.temp) params.push(`Temp: ${settings.temp}`);
                    if (settings['top-p']) params.push(`Top-P: ${settings['top-p']}`);
                    if (settings['flash-attn']) params.push(`Flash: ${settings['flash-attn']}`);
                    if (settings.reasoning) params.push(`Reasoning: ${settings.reasoning}`);

                    // Lifecycle badges
                    const lcBadges = [];
                    if (String(settings.pin).toLowerCase() === "true") lcBadges.push('📌 Pinned');
                    if (String(settings.preload).toLowerCase() === "true") lcBadges.push('🚀 Preload');
                    const ka = parseInt(settings.keep_alive) || 0;
                    if (ka > 0) lcBadges.push(`⏱ ${formatKeepAlive(ka)}`);

                    return `
                        <div class="profile-card" data-profile="${escapeHtml(name)}">
                            <div class="profile-card-header">
                                <span class="profile-name">${escapeHtml(name)}</span>
                                ${lcBadges.length ? `<div class="lifecycle-badges">${lcBadges.map(b => `<span class="lc-badge">${b}</span>`).join('')}</div>` : ''}
                            </div>
                            <div class="profile-model">Model: ${escapeHtml(modelName)}</div>
                            ${description ? `<div class="profile-description">${escapeHtml(description)}</div>` : ''}
                            <div class="profile-params">
                                ${params.map(p => `<span class="profile-param">${p}</span>`).join('')}
                            </div>
                            <div class="profile-actions">
                                <button class="btn-profile btn-profile-load" onclick="loadProfile('${escapeHtml(name)}')">Load</button>
                                <button class="btn-profile btn-profile-edit" onclick="editProfile('${escapeHtml(name)}')">Edit</button>
                                <button class="btn-profile btn-profile-delete" onclick="deleteProfile('${escapeHtml(name)}')">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<div class="empty-state">Failed to load profiles</div>';
        console.error('Failed to load profiles:', error);
    }
}

function formatKeepAlive(minutes) {
    if (minutes <= 0) return 'Never';
    if (minutes < 60) return minutes + 'm';
    if (minutes % 60 === 0) return (minutes / 60) + 'h';
    return minutes + 'm';
}

// Get profile schema
async function getProfileSchema() {
    if (profileSchema) return profileSchema;
    try {
        const response = await fetch('/api/profiles/schema');
        const schema = await response.json();
        profileSchema = schema;
        return schema;
    } catch (error) {
        console.error('Failed to load profile schema:', error);
        return null;
    }
}

// Open profile modal
async function openProfileModal(profileName = null) {
    const schema = await getProfileSchema();
    if (!schema) {
        showToast('Failed to load profile schema', 'error');
        return;
    }

    let profileData = {};
    if (profileName) {
        try {
            const response = await fetch('/api/profiles');
            const data = await response.json();
            const profileArray = data.profiles || [];
            const profile = profileArray.find(p => p.name === profileName);
            profileData = profile ? { ...profile.settings, model: profile.model, description: profile.description } : {};
        } catch (error) {
            console.error('Failed to load profile data:', error);
        }
    }

    currentProfileData = { ...profileData };
    const isEdit = !!profileName;

    // Lifecycle values
    const isPinned = profileData.pin === 'true' || profileData.pin === true;
    const isPreload = profileData.preload === 'true' || profileData.preload === true;
    const keepAlive = parseInt(profileData.keep_alive) || 30;

    // Build essential params
    const essentialHtml = ESSENTIAL_PARAMS.map(fieldId => {
        const param = schema.parameters[fieldId];
        if (!param) return '';
        const value = profileData[fieldId] !== undefined ? profileData[fieldId] : param.default;
        const isRequired = schema.required?.includes(fieldId);
        return renderParamField(fieldId, param, value, isRequired, false);
    }).join('');

    // Build advanced sections
    const advancedSections = Object.entries(schema.categories || {})
        .filter(([catId]) => catId !== 'basic')
        .map(([catId, category]) => {
            const advFields = category.fields.filter(f => !ESSENTIAL_PARAMS.includes(f) && !HEADER_PARAMS.includes(f));
            if (advFields.length === 0) return '';
            return `
                <div class="adv-section">
                    <div class="adv-section-header" onclick="this.parentElement.classList.toggle('expanded')">
                        <span>${escapeHtml(category.name)}</span>
                        <span class="adv-toggle">▸</span>
                    </div>
                    <div class="adv-section-body">
                        <div class="param-grid">
                            ${advFields.map(fieldId => {
                                const param = schema.parameters[fieldId];
                                if (!param) return '';
                                const value = profileData[fieldId] !== undefined ? profileData[fieldId] : param.default;
                                return renderParamField(fieldId, param, value, false, false);
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    // Lifecycle section HTML
    const lifecycleHtml = `
        <div class="lifecycle-section">
            <div class="lifecycle-title">🔄 Lifecycle</div>
            <div class="lifecycle-grid">
                <div class="lc-control">
                    <label class="lc-label">📌 Pin model</label>
                    <div class="lc-toggle-row">
                        <label class="lc-switch">
                            <input type="checkbox" id="lc-pin" data-lc="pin" ${isPinned ? 'checked' : ''}>
                            <span class="lc-slider"></span>
                        </label>
                        <span class="lc-hint">Prevent auto-unload</span>
                    </div>
                </div>
                <div class="lc-control">
                    <label class="lc-label">🚀 Preload on startup</label>
                    <div class="lc-toggle-row">
                        <label class="lc-switch">
                            <input type="checkbox" id="lc-preload" data-lc="preload" ${isPreload ? 'checked' : ''}>
                            <span class="lc-slider"></span>
                        </label>
                        <span class="lc-hint">Load automatically on server start</span>
                    </div>
                </div>
                <div class="lc-control">
                    <label class="lc-label">⏱ Keep-alive</label>
                    <div class="lc-timer-row">
                        <div class="lc-timer-options">
                            ${LIFECYCLE_OPTIONS.map(opt =>
                                `<button type="button" class="lc-timer-btn ${keepAlive === opt.value ? 'active' : ''}" data-ka="${opt.value}" onclick="selectKeepAlive(${opt.value}, this)">${opt.label}</button>`
                            ).join('')}
                        </div>
                        <div class="lc-custom-timer">
                            <input type="number" id="lc-keep-alive-custom" class="param-input" min="0" max="9999" placeholder="Custom (min)" value="${!LIFECYCLE_OPTIONS.some(o => o.value === keepAlive) ? keepAlive : ''}">
                            <span class="lc-hint">minutes (0 = never unload)</span>
                        </div>
                        <input type="hidden" id="lc-keep-alive" data-lc="keep_alive" value="${keepAlive}">
                    </div>
                </div>
            </div>
        </div>
    `;

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'profile-modal';

    overlay.innerHTML = `
        <div class="modal profile-modal-content">
            <div class="modal-header">
                <div class="modal-title">${isEdit ? 'Edit Profile' : 'Create New Profile'}</div>
                <button class="modal-close" onclick="closeProfileModal()">&times;</button>
            </div>
            <div class="profile-modal-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>Profile Name <span class="required">*</span></label>
                        <input type="text" class="param-input" id="profile-name-input"
                            value="${escapeHtml(profileName || '')}"
                            ${isEdit ? 'readonly' : ''}
                            placeholder="e.g. My Coding Assistant"
                            required>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <input type="text" class="param-input" id="profile-description-input"
                            value="${escapeHtml(profileData.description || '')}"
                            placeholder="Optional description">
                    </div>
                </div>

                <div class="form-group">
                    <label>Model <span class="required">*</span></label>
                    <select class="param-select" id="profile-model-select" ${isEdit ? 'disabled' : ''} required>
                        <option value="">Select a model...</option>
                        ${(schema.parameters.model?.options || []).map(model =>
                            `<option value="${escapeHtml(model)}" ${profileData.model === model ? 'selected' : ''}>${escapeHtml(model)}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="presets-row">
                    <span class="presets-label">Presets</span>
                    <div class="preset-buttons">
                        <button type="button" class="preset-btn" data-preset="fast" onclick="applyPreset('fast')">⚡ Fast</button>
                        <button type="button" class="preset-btn" data-preset="balanced" onclick="applyPreset('balanced')">⚖️ Balanced</button>
                        <button type="button" class="preset-btn" data-preset="creative" onclick="applyPreset('creative')">🎨 Creative</button>
                        <button type="button" class="preset-btn" data-preset="reasoning" onclick="applyPreset('reasoning')">🧠 Reasoning</button>
                        <button type="button" class="preset-btn" data-preset="precise" onclick="applyPreset('precise')">🎯 Precise</button>
                    </div>
                </div>

                <div class="essential-section">
                    <div class="essential-title">Settings</div>
                    <div class="param-grid">
                        ${essentialHtml}
                    </div>
                </div>

                ${lifecycleHtml}

                <div class="advanced-toggle" onclick="toggleAdvanced(this)">
                    <span>⚙️ Advanced Settings</span>
                    <span class="adv-arrow">▸</span>
                </div>
                <div class="advanced-body" id="advanced-body">
                    ${advancedSections}
                </div>
            </div>

            <div class="modal-footer">
                <button class="modal-btn modal-btn-secondary" onclick="closeProfileModal()">Cancel</button>
                <button class="modal-btn modal-btn-primary" onclick="saveProfile('${escapeHtml(profileName || '')}')">
                    ${isEdit ? 'Save Changes' : 'Create Profile'}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProfileModal();
    });
}

// Select keep-alive timer button
function selectKeepAlive(value, btn) {
    document.querySelectorAll('.lc-timer-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('lc-keep-alive').value = value;
    document.getElementById('lc-keep-alive-custom').value = '';
}

// Toggle advanced
function toggleAdvanced(el) {
    const body = document.getElementById('advanced-body');
    const arrow = el.querySelector('.adv-arrow');
    body.classList.toggle('open');
    arrow.textContent = body.classList.contains('open') ? '▾' : '▸';
}

// Render parameter field
function renderParamField(fieldId, param, value, isRequired, isImportant) {
    const requiredMarker = isRequired ? '<span class="required">*</span>' : '';
    const label = fieldId;

    if (param.type === 'select') {
        return `
            <div class="param-group">
                <label class="param-label">${escapeHtml(label)}${requiredMarker}</label>
                <select class="param-select" data-param="${fieldId}" data-default="${param.default}">
                    ${(param.options || []).map(opt =>
                        `<option value="${opt}" ${String(value) === String(opt) ? 'selected' : ''}>${opt}</option>`
                    ).join('')}
                </select>
                ${param.description ? `<div class="param-hint">${escapeHtml(param.description)}</div>` : ''}
            </div>
        `;
    } else if (param.type === 'number') {
        return `
            <div class="param-group">
                <label class="param-label">${escapeHtml(label)}${requiredMarker}</label>
                <input type="number" class="param-input" data-param="${fieldId}" data-default="${param.default}"
                    value="${value}" ${param.min !== undefined ? `min="${param.min}"` : ''}
                    ${param.max !== undefined ? `max="${param.max}"` : ''}
                    ${param.step !== undefined ? `step="${param.step}"` : ''}>
                ${param.description ? `<div class="param-hint">${escapeHtml(param.description)}</div>` : ''}
            </div>
        `;
    } else {
        return `
            <div class="param-group">
                <label class="param-label">${escapeHtml(label)}${requiredMarker}</label>
                <input type="text" class="param-input" data-param="${fieldId}" data-default="${param.default}"
                    value="${escapeHtml(String(value))}" placeholder="${escapeHtml(String(param.default))}">
                ${param.description ? `<div class="param-hint">${escapeHtml(param.description)}</div>` : ''}
            </div>
        `;
    }
}

// Apply preset
function applyPreset(presetName) {
    const schema = profileSchema;
    if (!schema || !schema.presets[presetName]) return;

    const preset = schema.presets[presetName];
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetName);
    });

    Object.entries(preset.settings || {}).forEach(([key, value]) => {
        const input = document.querySelector(`[data-param="${key}"]`);
        if (input) input.value = value;
    });
}

// Close modal
function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.remove();
}

// Save profile — includes lifecycle fields
async function saveProfile(originalName) {
    const nameInput = document.getElementById('profile-name-input');
    const descInput = document.getElementById('profile-description-input');
    const modelSelect = document.getElementById('profile-model-select');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const model = modelSelect.value;

    if (!name) { showToast('Profile name is required', 'error'); return; }
    if (!model) { showToast('Please select a model', 'error'); return; }

    const data = { description, model };

    // Collect all param fields
    document.querySelectorAll('[data-param]').forEach(input => {
        const param = input.dataset.param;
        if (input.tagName === 'SELECT') {
            data[param] = input.value;
        } else if (input.type === 'number') {
            const numValue = parseFloat(input.value);
            if (!isNaN(numValue)) data[param] = numValue;
        } else {
            const textValue = input.value.trim();
            if (textValue) data[param] = textValue;
        }
    });

    // Collect lifecycle fields
    const pinEl = document.getElementById('lc-pin');
    const preloadEl = document.getElementById('lc-preload');
    const keepAliveEl = document.getElementById('lc-keep-alive');
    const customKeepAliveEl = document.getElementById('lc-keep-alive-custom');

    data.pin = pinEl ? pinEl.checked : false;
    data.preload = preloadEl ? preloadEl.checked : false;

    // Custom keep-alive overrides preset buttons
    let ka = parseInt(keepAliveEl?.value) || 30;
    if (customKeepAliveEl && customKeepAliveEl.value.trim()) {
        const customKa = parseInt(customKeepAliveEl.value);
        if (!isNaN(customKa) && customKa >= 0) ka = customKa;
    }
    data.keep_alive = ka;

    try {
        const isEdit = !!originalName;
        const endpoint = isEdit ? `/api/profiles/${encodeURIComponent(originalName)}` : `/api/profiles/${encodeURIComponent(name)}`;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save profile');
        }

        showToast(isEdit ? `Profile "${name}" updated` : `Profile "${name}" created`, 'success');
        closeProfileModal();
        loadProfiles();
    } catch (error) {
        showToast('Failed to save profile: ' + error.message, 'error');
    }
}

// Edit profile
function editProfile(name) {
    openProfileModal(name);
}

// Delete profile
async function deleteProfile(name) {
    if (!confirm(`Delete profile "${name}"?`)) return;

    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete');
        }
        showToast(`Profile "${name}" deleted`, 'success');
        loadProfiles();
    } catch (error) {
        showToast('Failed: ' + error.message, 'error');
    }
}

// Load profile — apply settings + lifecycle to model
async function loadProfile(name) {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();
        const profileArray = data.profiles || [];
        const profile = profileArray.find(p => p.name === name);

        if (!profile) { showToast('Profile not found', 'error'); return; }

        const modelName = profile.model;
        if (!modelName) { showToast('Profile has no model', 'error'); return; }

        const settings = profile.settings || {};

        // 1. Apply llama.cpp settings
        const metadataFields = ['description', 'model', 'name', 'pin', 'preload', 'keep_alive'];
        const llamaSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            if (!metadataFields.includes(key)) llamaSettings[key] = value;
        }

        const configResponse = await fetch(`/api/config/${encodeURIComponent(modelName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(llamaSettings)
        });

        if (!configResponse.ok) {
            const error = await configResponse.json();
            showToast('Failed to apply settings: ' + (error.error || ''), 'error');
            return;
        }

        // 2. Apply lifecycle settings
        const pin = String(settings.pin).toLowerCase() === "true";
        const preload = String(settings.preload).toLowerCase() === "true";
        const keepAlive = parseInt(settings.keep_alive) || 30;

        await fetch(`/api/lifecycle/${encodeURIComponent(modelName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin, preload, keep_alive: keepAlive })
        });

        // 3. Load the model
        showToast('Loading profile...', 'info');
        await new Promise(resolve => setTimeout(resolve, 8000));

        const loadResponse = await fetch(`/api/models/${encodeURIComponent(modelName)}/load`, { method: 'POST' });
        if (!loadResponse.ok) {
            const error = await loadResponse.json();
            throw new Error(error.error || 'Failed to load model');
        }

        showToast(`Profile "${name}" loaded with ${modelName}`, 'success');
        setTimeout(() => { if (typeof loadModels === 'function') loadModels(); }, 1000);

    } catch (error) {
        showToast('Failed: ' + error.message, 'error');
    }
}

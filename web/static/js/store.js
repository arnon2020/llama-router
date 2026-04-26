// Shared state store with pub/sub pattern
const Store = {
    _state: {
        models: [],
        profiles: [],
        downloads: [],
        config: {},
        serverOnline: false,
        activeTab: 'dashboard'
    },
    _listeners: {},

    get(key) { return this._state[key]; },
    set(key, value) {
        this._state[key] = value;
        this._emit(key, value);
    },
    on(key, callback) {
        if (!this._listeners[key]) this._listeners[key] = [];
        this._listeners[key].push(callback);
    },
    off(key, callback) {
        if (!this._listeners[key]) return;
        this._listeners[key] = this._listeners[key].filter(cb => cb !== callback);
    },
    _emit(key, value) {
        if (!this._listeners[key]) return;
        this._listeners[key].forEach(cb => cb(value));
    }
};

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    if (!container) return;
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showToast(message, type) {
    showAlert(message, type);
}

// New models tracking
const NEW_MODELS_STORAGE_KEY = 'llama_router_new_models';

function storeNewlyDownloadedModel(modelName) {
    const newModels = getNewlyDownloadedModels();
    if (!newModels.includes(modelName)) {
        newModels.push(modelName);
        localStorage.setItem(NEW_MODELS_STORAGE_KEY, JSON.stringify(newModels));
        console.log('Marked as new:', modelName);
    }
}

function getNewlyDownloadedModels() {
    try {
        const stored = localStorage.getItem(NEW_MODELS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error reading new models from localStorage:', e);
        return [];
    }
}

function removeNewlyDownloadedModel(modelName) {
    const newModels = getNewlyDownloadedModels();
    const filtered = newModels.filter(name => name !== modelName);
    if (filtered.length !== newModels.length) {
        localStorage.setItem(NEW_MODELS_STORAGE_KEY, JSON.stringify(filtered));
        console.log('Removed from new models:', modelName);
    }
}

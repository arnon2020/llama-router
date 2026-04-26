// Core navigation and status
async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        const statusEl = document.getElementById('status');
        const statusText = document.getElementById('status-text');
        if (data.online) {
            statusEl.classList.remove('offline');
            statusEl.classList.add('online');
            statusText.textContent = 'Online';
            Store.set('serverOnline', true);
        } else {
            statusEl.classList.remove('online');
            statusEl.classList.add('offline');
            statusText.textContent = 'Offline';
            Store.set('serverOnline', false);
        }
        return data.online;
    } catch (error) {
        console.error('Status check failed:', error);
        Store.set('serverOnline', false);
        return false;
    }
}

// Tab navigation
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update URL without reload
    history.pushState({ page }, '', `/${page === 'dashboard' ? '' : page}`);

    // Load page content
    loadPage(page);
    Store.set('activeTab', page);
}

async function loadPage(page) {
    const content = document.getElementById('page-content');
    try {
        const response = await fetch(`/page/${page}`);
        if (response.ok) {
            content.innerHTML = await response.text();
            // Execute inline scripts (innerHTML does not execute <script> tags)
            content.querySelectorAll('script').forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
            // Initialize page-specific JS
            if (typeof initPage === 'function') initPage(page);
        } else {
            content.innerHTML = '<div class="empty-state">Page not found</div>';
        }
    } catch (error) {
        content.innerHTML = '<div class="empty-state">Failed to load page</div>';
    }
}

// Browser back/forward
window.addEventListener('popstate', (e) => {
    const page = e.state?.page || 'dashboard';
    loadPage(page);
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');
});

// Page initialization router
function initPage(page) {
    switch (page) {
        case 'models':
            loadModels();
            setupModelsListeners();
            break;
        case 'config':
            loadConfig();
            break;
        case 'downloads':
            loadDownloads();
            break;
        case 'metrics':
            loadMetrics();
            break;
        case 'profiles':
            loadProfiles();
            break;
        case 'chat':
            // ChatManager auto-initializes via inline script in chat.html
            // Only create if not already initialized (e.g. direct page load)
            if (typeof chatManager === 'undefined' || !chatManager) {
                if (typeof ChatManager !== 'undefined') {
                    chatManager = new ChatManager();
                }
            }
            break;
        case 'settings':
            loadMetrics();
            loadConfig();
            loadQuickModels();
            setupAddModelListeners();
            break;
        case 'dashboard':
            // Dashboard has its own inline script
            break;
    }
}

let chatManager;

// Global event delegation for dynamic buttons
document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    switch (action) {
        case 'load':
            loadModel(e.target.closest('[data-model]').dataset.model);
            break;
        case 'unload':
            unloadModel(e.target.closest('[data-model]').dataset.model);
            break;
        case 'remove':
            removeModel(e.target.closest('[data-model]').dataset.model);
            break;
        case 'save-config':
            saveConfig(e.target.closest('[data-section]').dataset.section);
            break;
    }
});

// Init
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    checkStatus();
    setInterval(checkStatus, 10000);

    // Auto-refresh downloads every 2 seconds when active
    setInterval(() => {
        const active = Store.get('activeTab');
        if (active === 'downloads') loadDownloads();
    }, 2000);

    // Auto-refresh models every 5 seconds when active
    setInterval(() => {
        const active = Store.get('activeTab');
        if (active === 'models') loadModels();
    }, 5000);
    // Load initial page
    const path = window.location.pathname.slice(1) || 'dashboard';
    loadPage(path);
});

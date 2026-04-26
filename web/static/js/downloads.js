// Downloads logic - extracted from index.html

// Show download progress modal
function showDownloadModal(modelName, downloadId, onComplete, onError) {
    // Remove any existing download modal
    const existingModal = document.querySelector('.download-progress-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay download-progress-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title">Downloading Model</div>
            </div>
            <div class="download-progress-container">
                <div class="download-model-name">${escapeHtml(modelName)}</div>
                <div class="download-status" id="download-status-${downloadId}">
                    <span class="spinner-inline"></span>
                    <span id="status-text-${downloadId}">Starting download...</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" id="progress-bar-${downloadId}" style="width: 0%"></div>
                </div>
                <div class="progress-text" id="progress-text-${downloadId}">0%</div>
                <div class="progress-details" id="progress-details-${downloadId}">Preparing...</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Connect to SSE for progress updates
    const eventSource = new EventSource(`/api/download/progress/${downloadId}`);

    const statusText = document.getElementById(`status-text-${downloadId}`);
    const progressBar = document.getElementById(`progress-bar-${downloadId}`);
    const progressText = document.getElementById(`progress-text-${downloadId}`);
    const progressDetails = document.getElementById(`progress-details-${downloadId}`);

    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data.replace(/'/g, '"'));
            const status = data.status;
            const percent = data.percent || 0;
            const downloaded = data.downloaded || 0;
            const total = data.total || 0;

            // Update progress bar
            progressBar.style.width = percent + '%';

            // Update status text
            if (status === 'starting') {
                statusText.textContent = 'Starting download...';
                progressDetails.textContent = 'Connecting to server...';
            } else if (status === 'downloading') {
                progressBar.classList.remove('validating');
                statusText.textContent = 'Downloading...';
                const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
                const totalMB = (total / (1024 * 1024)).toFixed(1);
                progressText.textContent = percent + '%';
                progressDetails.textContent = `${downloadedMB} MB / ${totalMB} MB`;
            } else if (status === 'validating') {
                progressBar.classList.add('validating');
                statusText.textContent = 'Validating file...';
                progressText.textContent = '99%';
                progressDetails.textContent = 'Checking GGUF format...';
            } else if (status === 'complete') {
                progressBar.classList.add('complete');
                statusText.innerHTML = '✓ Download complete!';
                progressText.textContent = '100%';
                progressDetails.textContent = 'Model added to config';

                eventSource.close();
                setTimeout(() => {
                    overlay.remove();
                    // Store as newly downloaded model
                    storeNewlyDownloadedModel(modelName);
                    onComplete();
                    // Refresh downloads queue to show completed item in history
                    loadDownloads();
                }, 1500);
            } else if (status === 'error') {
                progressBar.classList.add('error');
                statusText.textContent = '✗ Download failed';
                progressText.textContent = 'Error';
                progressDetails.textContent = data.error || 'Unknown error';

                eventSource.close();
                setTimeout(() => {
                    overlay.remove();
                    showAlert('Download failed: ' + (data.error || 'Unknown error'), 'error');
                    onError();
                }, 3000);
            } else if (status === 'not_found') {
                eventSource.close();
                overlay.remove();
                showAlert('Download progress not found. Please try again.', 'error');
                onError();
            }
        } catch (e) {
            console.error('Error parsing SSE data:', e);
        }
    };

    eventSource.onerror = function() {
        eventSource.close();
        statusText.textContent = 'Connection lost';
        progressBar.classList.add('error');
        setTimeout(() => {
            overlay.remove();
            onError();
        }, 2000);
    };

    // Store eventSource on overlay for cleanup
    overlay._eventSource = eventSource;
}

// Pause download
async function pauseDownload(downloadId) {
    try {
        const response = await fetch(`/api/download/${downloadId}/pause`, { method: 'POST' });
        if (response.ok) {
            loadDownloads();
        }
    } catch (error) {
        console.error('Failed to pause download:', error);
    }
}

// Resume download
async function resumeDownload(downloadId) {
    try {
        const response = await fetch(`/api/download/${downloadId}/resume`, { method: 'POST' });
        if (response.ok) {
            loadDownloads();
        }
    } catch (error) {
        console.error('Failed to resume download:', error);
    }
}

// Stop download
async function stopDownload(downloadId) {
    if (!confirm('Are you sure you want to stop this download?')) {
        return;
    }
    try {
        const response = await fetch(`/api/download/${downloadId}/stop`, { method: 'POST' });
        if (response.ok) {
            loadDownloads();
        }
    } catch (error) {
        console.error('Failed to stop download:', error);
    }
}

// Delete download (for failed downloads - deletes partial files)
async function deleteDownload(downloadId) {
    try {
        const response = await fetch(`/api/download/${downloadId}/stop`, { method: 'POST' });
        if (response.ok) {
            loadDownloads();
        }
    } catch (error) {
        console.error('Failed to delete download:', error);
    }
}

// Clear download (for completed downloads - only removes from queue, preserves model file)
async function clearDownload(downloadId) {
    try {
        const response = await fetch(`/api/download/${downloadId}/clear`, { method: 'POST' });
        if (response.ok) {
            loadDownloads();
        }
    } catch (error) {
        console.error('Failed to clear download:', error);
    }
}

// Load downloads queue
async function loadDownloads() {
    const container = document.getElementById('downloads-container');

    try {
        const response = await fetch('/api/downloads');
        const downloads = await response.json();

        if (downloads.length === 0) {
            container.innerHTML = '<div class="empty-downloads">No downloads in queue</div>';
            updateDownloadBadge(0);
            return;
        }

        // Count active downloads
        const activeCount = downloads.filter(d => d.status === 'starting' || d.status === 'downloading' || d.status === 'validating' || d.status === 'paused').length;
        updateDownloadBadge(activeCount);

        // Separate active downloads from history (completed/error)
        const activeDownloads = downloads.filter(d => d.status === 'starting' || d.status === 'downloading' || d.status === 'validating' || d.status === 'paused');
        const historyDownloads = downloads.filter(d => d.status === 'complete' || d.status === 'error');

        let html = '';

        // Render active downloads
        for (const download of activeDownloads) {
            const status = download.status;
            const percent = download.percent || 0;
            const downloaded = download.downloaded || 0;
            const total = download.total || 0;
            const error = download.error;
            const name = download.name || 'Unknown';
            const filename = download.filename || 'Unknown file';
            const downloadId = download.id;

            let statusText = status;
            let statusClass = status;

            // Format file sizes
            let sizeText = '';
            if (total > 0) {
                const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
                const totalMB = (total / (1024 * 1024)).toFixed(1);
                sizeText = `${downloadedMB} MB / ${totalMB} MB`;
            }

            // Control buttons based on status
            let controlButtons = '';
            if (status === 'downloading' || status === 'starting') {
                controlButtons = `
                    <div class="download-controls">
                        <button class="btn btn-pause" onclick="pauseDownload('${downloadId}')">⏸ Pause</button>
                        <button class="btn btn-stop" onclick="stopDownload('${downloadId}')">⏹ Stop</button>
                    </div>
                `;
            } else if (status === 'paused') {
                controlButtons = `
                    <div class="download-controls">
                        <button class="btn btn-resume" onclick="resumeDownload('${downloadId}')">▶ Resume</button>
                        <button class="btn btn-stop" onclick="stopDownload('${downloadId}')">⏹ Stop</button>
                    </div>
                `;
            } else if (status === 'error') {
                controlButtons = `
                    <div class="download-controls">
                        <button class="btn btn-stop" onclick="deleteDownload('${downloadId}')">🗑 Delete</button>
                    </div>
                `;
            } else if (status === 'complete') {
                controlButtons = `
                    <div class="download-controls">
                        <button class="btn btn-stop" onclick="clearDownload('${downloadId}')">🗑 Delete from History</button>
                    </div>
                `;
            }

            html += `
                <div class="download-item ${statusClass}" data-id="${downloadId}">
                    <div class="download-item-header">
                        <span class="download-name">${escapeHtml(name)}</span>
                        <span class="download-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    ${status === 'downloading' || status === 'validating' || status === 'paused' ? `
                        <div class="download-progress-bar">
                            <div class="download-progress-fill ${statusClass}" style="width: ${percent}%"></div>
                        </div>
                    ` : ''}
                    <div class="download-details">
                        <span>${escapeHtml(filename)}</span>
                        <span>${sizeText || (percent > 0 ? percent + '%' : '')}</span>
                    </div>
                    ${error ? `<div class="download-error">${escapeHtml(error)}</div>` : ''}
                    ${controlButtons}
                </div>
            `;
        }

        // Add history section if there are completed/error downloads
        if (historyDownloads.length > 0) {
            html += `
                <div class="download-history-section">
                    <div class="download-history-header">📚 Download History</div>
            `;
            for (const download of historyDownloads) {
                const status = download.status;
                const percent = download.percent || 0;
                const downloaded = download.downloaded || 0;
                const total = download.total || 0;
                const error = download.error;
                const name = download.name || 'Unknown';
                const filename = download.filename || 'Unknown file';
                const downloadId = download.id;

                let statusText = status;
                let statusClass = status;

                // Format file sizes
                let sizeText = '';
                if (total > 0) {
                    const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
                    const totalMB = (total / (1024 * 1024)).toFixed(1);
                    sizeText = `${downloadedMB} MB / ${totalMB} MB`;
                } else if (downloaded > 0) {
                    const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
                    sizeText = `${downloadedMB} MB`;
                }

                // Control buttons based on status
                let controlButtons = '';
                if (status === 'error') {
                    controlButtons = `
                        <div class="download-controls">
                            <button class="btn btn-stop" onclick="deleteDownload('${downloadId}')">🗑 Delete</button>
                        </div>
                    `;
                } else if (status === 'complete') {
                    controlButtons = `
                        <div class="download-controls">
                            <button class="btn btn-stop" onclick="clearDownload('${downloadId}')">🗑 Delete from History</button>
                        </div>
                    `;
                }

                html += `
                    <div class="download-item ${statusClass}" data-id="${downloadId}">
                        <div class="download-item-header">
                            <span class="download-name">${escapeHtml(name)}</span>
                            <span class="download-status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="download-details">
                            <span>${escapeHtml(filename)}</span>
                            <span>${sizeText || (percent > 0 ? percent + '%' : '')}</span>
                        </div>
                        ${error ? `<div class="download-error">${escapeHtml(error)}</div>` : ''}
                        ${controlButtons}
                    </div>
                `;
            }
            html += `</div>`;
        }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="empty-downloads">Failed to load downloads</div>';
        console.error('Failed to load downloads:', error);
    }
}

// Update download badge count
function updateDownloadBadge(count) {
    const badge = document.getElementById('download-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// Auto-refresh downloads every 2 seconds
let downloadsInterval = setInterval(() => {
    // Only refresh if downloads tab is active
    const downloadsTab = document.querySelector('.tab[data-tab="downloads"]');
    if (downloadsTab && downloadsTab.classList.contains('active')) {
        loadDownloads();
    }
}, 2000);

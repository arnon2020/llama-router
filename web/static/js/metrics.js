// Metrics logic - extracted from index.html

// Load metrics
async function loadMetrics() {
    const container = document.getElementById('metrics-container');

    try {
        const response = await fetch('/api/metrics');
        const data = await response.json();

        // Calculate totals
        const totalSize = data.models.total_size_bytes;
        const totalSizeGB = (totalSize / (1024**3)).toFixed(2);

        // Metrics cards
        let html = `
            <div class="metrics-grid">
                <div class="metric-card ${data.server.online ? 'success' : 'error'}">
                    <div class="metric-label">Server Status</div>
                    <div class="metric-value">${data.server.online ? 'Online' : 'Offline'}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Loaded Models</div>
                    <div class="metric-value">${data.models.loaded}<span class="metric-unit"> / ${data.models.available}</span></div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Storage</div>
                    <div class="metric-value">${totalSizeGB}<span class="metric-unit"> GB</span></div>
                </div>
            </div>
        `;

        // GPU info
        if (Object.keys(data.gpu).length > 0) {
            html += '<h3 style="color: #888; margin-bottom: 1rem;">GPU Status</h3>';
            for (const [gpuId, gpu] of Object.entries(data.gpu)) {
                const memPercent = (parseInt(gpu.memory_used) / parseInt(gpu.memory_total)) * 100;
                html += `
                    <div class="gpu-card">
                        <div class="gpu-header">
                            <span class="gpu-name">${gpu.name}</span>
                            <span style="color: #888;">${gpu.utilization}</span>
                        </div>
                        <div style="font-size: 0.875rem; color: #888;">
                            VRAM: ${gpu.memory_used} / ${gpu.memory_total}
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${memPercent}%;"></div>
                        </div>
                    </div>
                `;
            }
        } else {
            html += '<div class="empty-state">GPU information not available</div>';
        }

        // Model details
        html += '<h3 style="color: #888; margin: 1.5rem 0 1rem;">Model Details</h3>';
        html += '<table><thead><tr><th>Name</th><th>Size</th><th>Context</th><th>GPU Layers</th><th>Status</th></tr></thead><tbody>';
        for (const model of data.model_details) {
            const sizeMB = (model.size_bytes / (1024**2)).toFixed(0);
            html += `
                <tr>
                    <td>${escapeHtml(model.name)}</td>
                    <td>${sizeMB} MB</td>
                    <td>${model.ctx_size}</td>
                    <td>${model.n_gpu_layers}</td>
                    <td>
                        <span class="badge ${model.loaded ? 'loaded' : 'unloaded'}">
                            ${model.loaded ? 'Loaded' : 'Idle'}
                        </span>
                    </td>
                </tr>
            `;
        }
        html += '</tbody></table>';

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="empty-state">Failed to load metrics</div>';
        showAlert('Failed to load metrics: ' + error.message, 'error');
    }
}

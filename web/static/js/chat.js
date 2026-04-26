// Chat Page JavaScript
class ChatManager {
    constructor() {
        this.messages = [];
        this.isGenerating = false;
        this.currentModel = null;
        this.abortController = null;
        this.startTime = null;
        this.tokenCount = 0;
        
        this.initElements();
        this.initEventListeners();
        this.loadModels();
    }

    initElements() {
        this.chatContainer = document.getElementById("chat-container");
        this.chatMessages = document.getElementById("chat-messages");
        this.chatInput = document.getElementById("chat-input");
        this.chatModelSelect = document.getElementById("chat-model-select");
        this.currentModelDisplay = document.getElementById("current-model");
        this.sendButton = document.getElementById("send-message");
        this.stopButton = document.getElementById("stop-generation");
        this.clearButton = document.getElementById("clear-chat");
        this.goToModelsButton = document.getElementById("go-to-models");
        this.tokenCountDisplay = document.getElementById("token-count");
        this.generationSpeedDisplay = document.getElementById("generation-speed");
    }

    initEventListeners() {
        this.sendButton.addEventListener("click", () => this.sendMessage());
        this.stopButton.addEventListener("click", () => this.stopGeneration());
        this.clearButton.addEventListener("click", () => this.clearChat());
        
        this.goToModelsButton.addEventListener("click", () => {
            if (typeof navigateTo === 'function') {
                navigateTo('models');
            }
        });
        
        this.chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.chatInput.addEventListener("input", () => {
            this.chatInput.style.height = "auto";
            this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + "px";
            this.updateUI();
        });
        
        this.chatModelSelect.addEventListener("change", () => {
            this.currentModel = this.chatModelSelect.value;
            this.currentModelDisplay.textContent = this.currentModel || "No model selected";
            this.updateUI();
        });
    }

    async loadModels() {
        try {
            const response = await fetch("/api/models");
            const data = await response.json();
            
            this.chatModelSelect.innerHTML = '<option value="">Select a model...</option>';
            
            data.forEach(model => {
                const option = document.createElement("option");
                option.value = model.name;
                option.textContent = model.name + (model.status === 'loaded' ? ' ✓' : '');
                this.chatModelSelect.appendChild(option);

                // Auto-select the loaded model on first load
                if (model.status === 'loaded' && !this.currentModel) {
                    this.currentModel = model.name;
                }
            });

            if (this.currentModel) {
                this.chatModelSelect.value = this.currentModel;
                this.currentModelDisplay.textContent = this.currentModel;
                this.updateUI();
            }
        } catch (error) {
            console.error("Failed to load models:", error);
            showToast("Failed to load models", "error");
        }
    }

    updateUI() {
        const hasModel = this.currentModel && this.currentModel !== "";
        const hasMessages = this.messages.length > 0;
        const hasInput = this.chatInput.value.trim().length > 0;
        
        const emptyChat = this.chatMessages.querySelector(".empty-chat");
        if (emptyChat) {
            if (hasModel) {
                emptyChat.querySelector("p").textContent = "Type a message below to start chatting";
                this.goToModelsButton.style.display = "none";
            } else {
                emptyChat.querySelector("p").textContent = "Select a model from the Models tab to begin chatting";
                this.goToModelsButton.style.display = "inline-block";
            }
        }
        
        this.sendButton.disabled = !hasModel || !hasInput || this.isGenerating;
        
        const modelSelectWrapper = document.getElementById("model-select-wrapper");
        if (modelSelectWrapper) {
            modelSelectWrapper.style.display = hasMessages ? "none" : "block";
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || !this.currentModel || this.isGenerating) return;
        
        const emptyChat = this.chatMessages.querySelector(".empty-chat");
        if (emptyChat) {
            emptyChat.remove();
        }
        
        this.addMessage("user", message);
        this.chatInput.value = "";
        this.chatInput.style.height = "auto";
        
        this.tokenCount = 0;
        this.startTime = Date.now();
        
        const assistantMessageId = this.addMessage("assistant", "");
        
        this.isGenerating = true;
        this.stopButton.style.display = "inline-flex";
        this.sendButton.disabled = true;
        this.updateUI();
        
        try {
            this.abortController = new AbortController();
            
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    messages: this.getMessagesForAPI(),
                    stream: true
                }),
                signal: this.abortController.signal
            });
            
            if (!response.ok) {
                throw new Error("Generation failed");
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = "";
            let lineBuffer = "";
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                lineBuffer += decoder.decode(value, { stream: true });
                const lines = lineBuffer.split("\n");
                // Keep the last incomplete line in the buffer
                lineBuffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices && parsed.choices[0]) {
                                const content = parsed.choices[0].delta.content || "";
                                assistantMessage += content;
                                this.updateMessage(assistantMessageId, assistantMessage);
                                
                                this.tokenCount++;
                                this.updateTokenDisplay();
                            }
                        } catch (e) {
                        }
                    }
                }
            }
            
            this.messages.push({
                role: "assistant",
                content: assistantMessage
            });
            
        } catch (error) {
            if (error.name === "AbortError") {
                this.updateMessage(assistantMessageId, this.getMessageContent(assistantMessageId) + "\n\n*[Generation stopped]*");
            } else {
                console.error("Generation error:", error);
                this.updateMessage(assistantMessageId, this.getMessageContent(assistantMessageId) + "\n\n*Error: " + error.message + "*");
                showToast("Failed to generate response", "error");
            }
        } finally {
            this.isGenerating = false;
            this.abortController = null;
            this.stopButton.style.display = "none";
            this.updateUI();
            
            this.scrollToBottom();
        }
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    addMessage(role, content) {
        const messageId = "message-" + Date.now();
        const messageDiv = document.createElement("div");
        messageDiv.className = "message " + role;
        messageDiv.id = messageId;
        
        const avatar = role === "user" ? "👤" : "🤖";
        
        const streamingSpan = role === "assistant" ? '<span class="streaming-text"></span>' : '';
        
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-text">${this.formatMessage(content)}${streamingSpan}</div>
                <div class="message-meta">
                    <span class="message-tokens">${role === "assistant" ? "Generating..." : ""}</span>
                    <span class="message-time">${this.formatTime(new Date())}</span>
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        
        if (role === "user") {
            this.messages.push({ role, content });
        }
        
        return messageId;
    }

    updateMessage(messageId, content) {
        const messageDiv = document.getElementById(messageId);
        if (messageDiv) {
            const textDiv = messageDiv.querySelector(".message-text");
            if (textDiv) {
                textDiv.innerHTML = this.formatMessage(content) + '<span class="streaming-text"></span>';
            }
            
            const tokensSpan = messageDiv.querySelector(".message-tokens");
            if (tokensSpan) {
                tokensSpan.textContent = this.tokenCount + " tokens";
            }
            
            this.scrollToBottom();
        }
    }

    getMessageContent(messageId) {
        const messageDiv = document.getElementById(messageId);
        if (messageDiv) {
            const textDiv = messageDiv.querySelector(".message-text");
            return textDiv ? textDiv.textContent : "";
        }
        return "";
    }

    formatMessage(content) {
        if (!content) return '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        
        let formatted = content
            .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
        
        return formatted;
    }

    formatTime(date) {
        return date.toLocaleTimeString("en-US", { 
            hour: "2-digit", 
            minute: "2-digit" 
        });
    }

    updateTokenDisplay() {
        this.tokenCountDisplay.textContent = this.tokenCount + " tokens";
        
        if (this.startTime && this.tokenCount > 0) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            const speed = (this.tokenCount / elapsed).toFixed(1);
            this.generationSpeedDisplay.textContent = speed + " tokens/s";
        }
    }

    getMessagesForAPI() {
        return this.messages.slice(-10);
    }

    clearChat() {
        if (confirm("Are you sure you want to clear the chat history?")) {
            this.messages = [];
            this.chatMessages.innerHTML = `
                <div class="empty-chat">
                    <div class="empty-chat-icon">💬</div>
                    <h3>Start a conversation</h3>
                    <p>${this.currentModel ? "Type a message below to start chatting" : "Select a model from the Models tab to begin chatting"}</p>
                    <button class="btn btn-primary" id="go-to-models" style="${this.currentModel ? "display: none;" : ""}">
                        Go to Models
                    </button>
                </div>
            `;
            
            const goToModelsBtn = document.getElementById("go-to-models");
            if (goToModelsBtn) {
                goToModelsBtn.addEventListener("click", () => {
                    if (typeof navigateTo === 'function') {
                        navigateTo('models');
                    }
                });
            }
            
            this.tokenCount = 0;
            this.tokenCountDisplay.textContent = "0 tokens";
            this.generationSpeedDisplay.textContent = "";
            this.updateUI();
        }
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
}

// ChatManager is initialized by main.js initPage() when the chat tab is loaded

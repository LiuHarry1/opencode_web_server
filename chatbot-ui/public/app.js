// ============================================
// OpenCode Chatbot UI — Frontend Application
// ============================================

class OpenCodeChatbot {
  constructor() {
    this.currentSessionId = null;
    this.sessions = [];
    this.isStreaming = false;

    // DOM elements
    this.messagesEl = document.getElementById("messages");
    this.messagesContainer = document.getElementById("messagesContainer");
    this.messageInput = document.getElementById("messageInput");
    this.sendBtn = document.getElementById("sendBtn");
    this.newChatBtn = document.getElementById("newChatBtn");
    this.sessionList = document.getElementById("sessionList");
    this.chatTitle = document.getElementById("chatTitle");
    this.welcomeScreen = document.getElementById("welcomeScreen");
    this.serverStatus = document.getElementById("serverStatus");
    this.sidebarToggle = document.getElementById("sidebarToggle");
    this.sidebar = document.getElementById("sidebar");
    this.themeToggle = document.getElementById("themeToggle");

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadTheme();
    this.checkHealth();
    this.loadSessions();

    // Auto-resize textarea
    this.messageInput.addEventListener("input", () => this.autoResize());
  }

  // -----------------------------------------------
  // Event Bindings
  // -----------------------------------------------
  bindEvents() {
    // Send message
    this.sendBtn.addEventListener("click", () => this.sendMessage());

    this.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Input state
    this.messageInput.addEventListener("input", () => {
      this.sendBtn.disabled =
        !this.messageInput.value.trim() || this.isStreaming;
    });

    // New chat
    this.newChatBtn.addEventListener("click", () => this.createNewSession());

    // Sidebar toggle
    this.sidebarToggle.addEventListener("click", () => this.toggleSidebar());

    // Theme toggle
    this.themeToggle.addEventListener("click", () => this.toggleTheme());

    // Quick actions
    document.querySelectorAll(".quick-action").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        this.messageInput.value = prompt;
        this.sendBtn.disabled = false;
        this.messageInput.focus();
      });
    });
  }

  // -----------------------------------------------
  // API Calls
  // -----------------------------------------------
  async checkHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      const dot = this.serverStatus.querySelector(".status-dot");
      const text = this.serverStatus.querySelector(".status-text");

      if (data.status === "ok") {
        dot.classList.add("online");
        text.textContent = "Server Online";
      } else {
        dot.classList.remove("online");
        text.textContent = "Server Offline";
      }
    } catch {
      const dot = this.serverStatus.querySelector(".status-dot");
      const text = this.serverStatus.querySelector(".status-text");
      dot.classList.remove("online");
      text.textContent = "Server Offline";
    }
  }

  async loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        // Ensure sessions is always an array
        this.sessions = Array.isArray(data) ? data : (data.sessions || data.data || []);
        this.renderSessionList();
      }
    } catch (err) {
      // Server not available yet, that's ok
      console.warn("Failed to load sessions:", err);
      this.sessions = []; // Ensure it's always an array
    }
  }

  async createNewSession() {
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || errorData.message || `HTTP ${res.status}`);
      }
      
      const session = await res.json();
      
      // Ensure sessions is an array before using array methods
      if (!Array.isArray(this.sessions)) {
        this.sessions = [];
      }
      
      // Extract session ID from various possible formats
      const sessionId = session.id || session.sessionID || session.session_id;
      if (!sessionId) {
        throw new Error("Session created but no ID returned");
      }
      
      this.currentSessionId = sessionId;
      this.sessions.unshift(session);
      this.renderSessionList();
      this.clearMessages();
      this.chatTitle.textContent = "New Conversation";
      this.showWelcome(false);
    } catch (err) {
      console.error("Failed to create session:", err);
      this.showError("Failed to create session: " + err.message);
    }
  }

  async sendMessage() {
    const content = this.messageInput.value.trim();
    if (!content || this.isStreaming) return;

    // Create session if needed
    if (!this.currentSessionId) {
      await this.createNewSession();
    }

    // Hide welcome screen
    this.showWelcome(false);

    // Add user message to UI
    this.addMessage("user", content);

    // Clear input
    this.messageInput.value = "";
    this.autoResize();
    this.sendBtn.disabled = true;
    this.isStreaming = true;

    // Add assistant message placeholder with typing indicator
    const assistantMsgEl = this.addMessage("assistant", "", true);

    try {
      // Stream the response via SSE
      const response = await fetch(
        `/api/sessions/${this.currentSessionId}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "done" || event.type === "timeout") {
              break;
            }

            if (event.type === "error") {
              this.showErrorInMessage(assistantMsgEl, event.message);
              break;
            }

            // Extract text content from various event types
            const text = this.extractTextFromEvent(event);
            if (text) {
              fullText += text;
              this.updateMessageContent(assistantMsgEl, fullText);
            }
          } catch {
            // Ignore JSON parse errors for partial data
          }
        }
      }

      // Final render with full markdown
      if (fullText) {
        this.updateMessageContent(assistantMsgEl, fullText, true);
      }

      // Update session title based on first message
      this.updateSessionTitle(content);
    } catch (err) {
      this.showErrorInMessage(
        assistantMsgEl,
        "Failed to get response: " + err.message
      );
    } finally {
      this.isStreaming = false;
      this.sendBtn.disabled = !this.messageInput.value.trim();
      this.removeTypingIndicator(assistantMsgEl);
    }
  }

  // -----------------------------------------------
  // Event Text Extraction
  // -----------------------------------------------
  extractTextFromEvent(event) {
    // OpenCode API event types:
    // - "message.part.updated" with properties.delta (incremental text)
    // - "message.part.updated" with properties.part (full part data)

    if (event.type === "message.part.updated") {
      // Delta contains the incremental text chunk
      if (event.properties?.delta) {
        return event.properties.delta;
      }
    }

    return "";
  }

  // -----------------------------------------------
  // UI Rendering
  // -----------------------------------------------
  addMessage(role, content, isStreaming = false) {
    const messageEl = document.createElement("div");
    messageEl.className = `message ${role}`;

    const avatarText = role === "user" ? "U" : "AI";
    const roleLabel = role === "user" ? "You" : "OpenCode";

    messageEl.innerHTML = `
      <div class="message-avatar">${avatarText}</div>
      <div class="message-content">
        <div class="message-role">${roleLabel}</div>
        <div class="message-body">${
          content
            ? this.renderMarkdown(content)
            : isStreaming
              ? '<div class="typing-indicator"><span></span><span></span><span></span></div>'
              : ""
        }</div>
      </div>
    `;

    this.messagesEl.appendChild(messageEl);
    this.scrollToBottom();

    return messageEl;
  }

  updateMessageContent(messageEl, content, isFinal = false) {
    const bodyEl = messageEl.querySelector(".message-body");

    // Remove typing indicator if present
    const typingEl = bodyEl.querySelector(".typing-indicator");
    if (typingEl) typingEl.remove();

    bodyEl.innerHTML = this.renderMarkdown(content);

    if (isFinal) {
      this.highlightCode(bodyEl);
      this.addCopyButtons(bodyEl);
    }

    this.scrollToBottom();
  }

  removeTypingIndicator(messageEl) {
    const bodyEl = messageEl.querySelector(".message-body");
    const typingEl = bodyEl?.querySelector(".typing-indicator");
    if (typingEl) typingEl.remove();
  }

  showErrorInMessage(messageEl, errorMsg) {
    const bodyEl = messageEl.querySelector(".message-body");
    const typingEl = bodyEl.querySelector(".typing-indicator");
    if (typingEl) typingEl.remove();

    bodyEl.innerHTML = `<div class="error-message">${this.escapeHtml(errorMsg)}</div>`;
    this.scrollToBottom();
  }

  showError(msg) {
    const errorEl = document.createElement("div");
    errorEl.className = "message assistant";
    errorEl.innerHTML = `
      <div class="message-avatar">!</div>
      <div class="message-content">
        <div class="message-body">
          <div class="error-message">${this.escapeHtml(msg)}</div>
        </div>
      </div>
    `;
    this.messagesEl.appendChild(errorEl);
    this.scrollToBottom();
  }

  clearMessages() {
    this.messagesEl.innerHTML = "";
  }

  showWelcome(show) {
    if (show) {
      if (!document.getElementById("welcomeScreen")) {
        // Re-add welcome screen
        this.messagesEl.innerHTML = document.getElementById("welcomeScreen")?.outerHTML || "";
      }
    } else {
      const ws = this.messagesEl.querySelector(".welcome-screen");
      if (ws) ws.remove();
    }
  }

  renderSessionList() {
    this.sessionList.innerHTML = "";

    for (const session of this.sessions) {
      const el = document.createElement("div");
      el.className = `session-item${session.id === this.currentSessionId ? " active" : ""}`;
      el.textContent = session.title || session.id?.slice(0, 8) || "Chat";
      el.addEventListener("click", () => this.switchSession(session.id));
      this.sessionList.appendChild(el);
    }
  }

  async switchSession(sessionId) {
    this.currentSessionId = sessionId;
    this.renderSessionList();
    this.clearMessages();
    this.showWelcome(false);

    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const session = await res.json();
      this.chatTitle.textContent = session.title || "Conversation";

      // Render existing messages
      if (session.messages) {
        for (const msg of session.messages) {
          const role = msg.role === "user" ? "user" : "assistant";
          const content =
            typeof msg.content === "string"
              ? msg.content
              : msg.parts
                  ?.filter((p) => p.type === "text")
                  .map((p) => p.content || p.text)
                  .join("\n") || "";
          if (content) {
            const el = this.addMessage(role, content);
            this.highlightCode(el.querySelector(".message-body"));
            this.addCopyButtons(el.querySelector(".message-body"));
          }
        }
      }
    } catch (err) {
      this.showError("Failed to load session: " + err.message);
    }
  }

  updateSessionTitle(firstMessage) {
    const title =
      firstMessage.length > 40
        ? firstMessage.slice(0, 40) + "..."
        : firstMessage;
    this.chatTitle.textContent = title;

    // Update sidebar
    const activeItem = this.sessionList.querySelector(".session-item.active");
    if (activeItem) {
      activeItem.textContent = title;
    }

    // Update session object
    const session = this.sessions.find(
      (s) => s.id === this.currentSessionId
    );
    if (session) session.title = title;
  }

  // -----------------------------------------------
  // Markdown Rendering
  // -----------------------------------------------
  renderMarkdown(text) {
    if (!text) return "";

    try {
      // Configure marked
      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      const rawHtml = marked.parse(text);

      // Sanitize to prevent XSS — allow code/pre blocks and common formatting
      if (typeof DOMPurify !== "undefined") {
        return DOMPurify.sanitize(rawHtml, {
          ADD_TAGS: ["pre", "code"],
          ADD_ATTR: ["class"],
        });
      }

      return rawHtml;
    } catch {
      return this.escapeHtml(text).replace(/\n/g, "<br>");
    }
  }

  highlightCode(container) {
    if (!container) return;
    container.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  addCopyButtons(container) {
    if (!container) return;
    container.querySelectorAll("pre").forEach((pre) => {
      if (pre.parentElement?.classList.contains("code-block-wrapper")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent || pre.textContent;
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
        });
      });
      wrapper.appendChild(copyBtn);
    });
  }

  // -----------------------------------------------
  // UI Helpers
  // -----------------------------------------------
  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop =
        this.messagesContainer.scrollHeight;
    });
  }

  autoResize() {
    this.messageInput.style.height = "auto";
    this.messageInput.style.height =
      Math.min(this.messageInput.scrollHeight, 200) + "px";
  }

  toggleSidebar() {
    this.sidebar.classList.toggle("collapsed");
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  loadTheme() {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// -----------------------------------------------
// Initialize
// -----------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  window.chatbot = new OpenCodeChatbot();
});

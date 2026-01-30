// OpenCode Extension - Main App Logic

class OpenCodeApp {
  constructor() {
    this.serverUrl = 'http://localhost:4096'
    this.sessionId = null
    this.isLoading = false
    this.messages = []
    this.isConnected = false
    this.serverVersion = ''
    this.obsidianVault = ''
    this.obsidianFolder = 'Inbox'
    this.abortController = null  // 用于取消请求
    
    this.init()
  }

  async init() {
    // Load saved settings
    await this.loadSettings()
    
    // Apply theme
    this.applyTheme()
    
    // Bind events
    this.bindEvents()
    
    // Check connection
    await this.checkConnection()
    
    // Auto-resize textarea
    this.setupTextarea()
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'serverUrl', 'theme', 'sessionId', 'obsidianVault', 'obsidianFolder'
      ])
      if (result.serverUrl) this.serverUrl = result.serverUrl
      if (result.sessionId) this.sessionId = result.sessionId
      if (result.obsidianVault) this.obsidianVault = result.obsidianVault
      if (result.obsidianFolder) this.obsidianFolder = result.obsidianFolder
      
      document.getElementById('server-url').value = this.serverUrl
      document.getElementById('theme-select').value = result.theme || 'auto'
      document.getElementById('obsidian-vault').value = this.obsidianVault
      document.getElementById('obsidian-folder').value = this.obsidianFolder
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        serverUrl: this.serverUrl,
        theme: document.getElementById('theme-select').value,
        sessionId: this.sessionId,
        obsidianVault: this.obsidianVault,
        obsidianFolder: this.obsidianFolder
      })
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  applyTheme() {
    const theme = document.getElementById('theme-select').value
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  bindEvents() {
    // Header buttons
    document.getElementById('btn-new-session').addEventListener('click', () => this.startNewSession())
    document.getElementById('btn-sidebar').addEventListener('click', () => this.openSidebar())
    document.getElementById('btn-settings').addEventListener('click', () => this.showSettings())
    document.getElementById('btn-back').addEventListener('click', () => this.hideSettings())
    
    // Send message / Stop
    document.getElementById('btn-send').addEventListener('click', () => this.handleSendClick())
    document.getElementById('input-message').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSendClick()
      }
    })

    // Plugin dock toggle
    document.getElementById('plugin-header').addEventListener('click', () => {
      document.querySelector('.plugin-dock').classList.toggle('collapsed')
    })

    // Plugin items
    document.querySelectorAll('.plugin-item[data-plugin]').forEach(item => {
      item.addEventListener('click', () => this.showPluginPanel(item.dataset.plugin))
    })
    document.getElementById('btn-plugin-back').addEventListener('click', () => this.hidePluginPanel())

    // Settings
    document.getElementById('server-url').addEventListener('change', (e) => {
      this.serverUrl = e.target.value
      this.saveSettings()
      this.checkConnection()
    })
    document.getElementById('theme-select').addEventListener('change', () => {
      this.applyTheme()
      this.saveSettings()
    })
    document.getElementById('obsidian-vault').addEventListener('change', (e) => {
      this.obsidianVault = e.target.value
      this.saveSettings()
    })
    document.getElementById('obsidian-folder').addEventListener('change', (e) => {
      this.obsidianFolder = e.target.value
      this.saveSettings()
    })
  }

  setupTextarea() {
    const textarea = document.getElementById('input-message')
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    })
  }

  // 处理发送/停止按钮点击
  handleSendClick() {
    if (this.isLoading) {
      this.abortRequest()
    } else {
      this.sendMessage()
    }
  }

  // 中止当前请求
  async abortRequest() {
    // 取消 fetch 请求
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    
    // 调用 OpenCode 的 abort API
    if (this.sessionId) {
      try {
        await fetch(`${this.serverUrl}/session/${this.sessionId}/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      } catch (e) {
        console.error('Failed to abort session:', e)
      }
    }
    
    this.isLoading = false
    this.removeLoadingMessage()
    this.addMessage('assistant', '⏹ 已停止')
    this.setStatus('connected', `${this.serverUrl.replace('http://', '')}`)
    this.updateSendButton()
  }

  async openSidebar() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        // 直接在 popup 中调用 sidePanel.open (用户手势上下文)
        await chrome.sidePanel.open({ tabId: tab.id })
        // 关闭当前 popup
        window.close()
      }
    } catch (e) {
      console.error('Failed to open sidebar:', e)
    }
  }

  showSettings() {
    document.getElementById('settings-panel').classList.remove('hidden')
    // 同步显示当前连接状态
    this.updateSettingsStatus(this.isConnected, this.serverVersion)
  }

  hideSettings() {
    document.getElementById('settings-panel').classList.add('hidden')
  }

  async startNewSession() {
    // Clear session ID
    this.sessionId = null
    this.messages = []
    
    // Clear chat area and restore welcome message
    const chatArea = document.getElementById('chat-area')
    chatArea.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">👋</div>
        <div class="welcome-text">有什么可以帮你的？</div>
        <div class="welcome-hints">
          <p>我可以帮你：</p>
          <ul>
            <li>分析当前页面</li>
            <li>执行自定义指令</li>
            <li>使用下方插件能力</li>
          </ul>
        </div>
      </div>
    `
    
    // Save settings (with null sessionId)
    await this.saveSettings()
  }

  showPluginPanel(pluginId) {
    const panel = document.getElementById('plugin-panel')
    const title = document.getElementById('plugin-panel-title')
    const content = document.getElementById('plugin-panel-content')
    
    if (pluginId === 'obsidian') {
      title.textContent = '🗒️ Obsidian'
      content.innerHTML = `
        <div class="plugin-actions">
          <button class="plugin-action-btn" data-action="save-page">
            <span class="icon">📥</span>
            <span>保存当前页面</span>
          </button>
          <button class="plugin-action-btn" data-action="save-summary">
            <span class="icon">📝</span>
            <span>保存并总结</span>
          </button>
          <button class="plugin-action-btn" data-action="save-selection">
            <span class="icon">🔖</span>
            <span>保存选中内容</span>
          </button>
        </div>
        <div class="plugin-settings-link">
          <span>⚙️</span>
          <span>插件设置</span>
        </div>
      `
      
      // Bind plugin actions
      content.querySelectorAll('.plugin-action-btn').forEach(btn => {
        btn.addEventListener('click', () => this.executePluginAction('obsidian', btn.dataset.action))
      })
    }
    
    panel.classList.remove('hidden')
  }

  hidePluginPanel() {
    document.getElementById('plugin-panel').classList.add('hidden')
  }

  async executePluginAction(plugin, action) {
    this.hidePluginPanel()
    
    let prompt = ''
    
    if (plugin === 'obsidian') {
      const vaultPath = this.obsidianVault
      const folderPath = this.obsidianFolder || 'Inbox'
      
      if (!vaultPath) {
        this.addMessage('assistant', '❌ 请先在设置中配置 Obsidian Vault 路径')
        return
      }
      
      // Get page content to extract title for filename
      const pageContent = await this.getPageContent()
      const pageTitle = pageContent?.title || 'Untitled'
      const pageUrl = pageContent?.url || ''
      const sanitizedTitle = this.sanitizeFilename(pageTitle)
      const filename = `${sanitizedTitle}.md`
      const fullPath = this.buildFilePath(vaultPath, folderPath, filename)
      const today = new Date().toISOString().split('T')[0]
      
      switch (action) {
        case 'save-page':
          prompt = `请使用 Write 工具将以下网页内容保存为 Markdown 文件。

**文件路径**: ${fullPath}

**文件内容要求**:
1. 开头添加 YAML frontmatter：
\`\`\`
---
title: "${pageTitle}"
source: "${pageUrl}"
date: ${today}
tags: [web-clip]
---
\`\`\`
2. 然后是正文内容（保持 Markdown 格式）

请直接执行 Write 工具写入文件，不要询问确认。`
          break
        case 'save-summary':
          prompt = `请总结以下网页内容，并使用 Write 工具保存为 Markdown 文件。

**文件路径**: ${fullPath}

**文件内容要求**:
1. 开头添加 YAML frontmatter：
\`\`\`
---
title: "${pageTitle}"
source: "${pageUrl}"
date: ${today}
tags: [web-clip, summary]
---
\`\`\`
2. 然后是你的总结（使用清晰的标题和要点）

请直接执行 Write 工具写入文件，不要询问确认。`
          break
        case 'save-selection':
          prompt = `请使用 Write 工具将用户选中的内容保存为 Markdown 文件。

**文件路径**: ${fullPath}

**文件内容要求**:
1. 开头添加 YAML frontmatter：
\`\`\`
---
title: "${pageTitle} - 摘录"
source: "${pageUrl}"
date: ${today}
tags: [web-clip, excerpt]
---
\`\`\`
2. 然后是选中的内容（保持格式）

请直接执行 Write 工具写入文件，不要询问确认。`
          break
      }
    }
    
    if (prompt) {
      document.getElementById('input-message').value = prompt
      document.getElementById('include-page').checked = true
      await this.sendMessage()
    }
  }

  async sendMessage() {
    const input = document.getElementById('input-message')
    const message = input.value.trim()
    
    if (!message || this.isLoading) return
    
    const includePage = document.getElementById('include-page').checked
    
    // Clear input
    input.value = ''
    input.style.height = 'auto'
    
    // Add user message to UI
    let pageContent = null
    if (includePage) {
      pageContent = await this.getPageContent()
    }
    this.addMessage('user', message, pageContent)
    
    // Send to OpenCode
    await this.sendToOpenCode(message, pageContent)
  }

  async getPageContent() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' })
      return response
    } catch (e) {
      console.error('Failed to get page content:', e)
      return null
    }
  }

  addMessage(role, content, attachment = null) {
    const chatArea = document.getElementById('chat-area')
    
    // Remove welcome message if present
    const welcome = chatArea.querySelector('.welcome-message')
    if (welcome) welcome.remove()
    
    const messageEl = document.createElement('div')
    messageEl.className = `message message-${role}`
    
    const avatar = role === 'user' ? '🧑' : '🤖'
    
    let attachmentHtml = ''
    if (attachment && attachment.url) {
      const domain = new URL(attachment.url).hostname
      attachmentHtml = `
        <div class="message-attachment">
          <span>📎</span>
          <span>${domain}</span>
        </div>
      `
    }
    
    messageEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        ${this.escapeHtml(content)}
        ${attachmentHtml}
      </div>
    `
    
    chatArea.appendChild(messageEl)
    chatArea.scrollTop = chatArea.scrollHeight
    
    this.messages.push({ role, content, attachment })
    
    return messageEl
  }

  addLoadingMessage() {
    const chatArea = document.getElementById('chat-area')
    
    const messageEl = document.createElement('div')
    messageEl.className = 'message message-assistant'
    messageEl.id = 'loading-message'
    
    messageEl.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `
    
    chatArea.appendChild(messageEl)
    chatArea.scrollTop = chatArea.scrollHeight
    
    return messageEl
  }

  removeLoadingMessage() {
    const loading = document.getElementById('loading-message')
    if (loading) loading.remove()
  }

  async sendToOpenCode(message, pageContent) {
    this.isLoading = true
    this.abortController = new AbortController()
    this.updateSendButton()
    this.addLoadingMessage()
    this.setStatus('loading', '处理中...')

    try {
      // Create session if needed
      if (!this.sessionId) {
        const session = await this.apiCall('POST', '/session', { title: 'Browser Extension' })
        this.sessionId = session.id
        this.saveSettings()
      }

      // Build prompt with page context
      let fullPrompt = message
      if (pageContent && pageContent.content) {
        fullPrompt = `${message}\n\n---\n页面信息:\n标题: ${pageContent.title}\n来源: ${pageContent.url}\n\n内容:\n${pageContent.content}`
      }

      // Send message using the correct API format
      // POST /session/:id/message with body: { parts: [...] }
      const result = await this.apiCall('POST', `/session/${this.sessionId}/message`, {
        parts: [{ type: 'text', text: fullPrompt }]
      })

      this.removeLoadingMessage()

      // Extract response text from result
      // Response format: { info: Message, parts: Part[] }
      let responseText = ''
      if (result.parts) {
        for (const part of result.parts) {
          if (part.type === 'text') {
            responseText += part.text
          }
        }
      }

      this.addMessage('assistant', responseText || '完成')
      this.setStatus('connected', this.serverUrl.replace('http://', ''))

    } catch (e) {
      if (e.name === 'AbortError') {
        // 请求被用户取消，不显示错误
        return
      }
      console.error('Failed to send to OpenCode:', e)
      this.removeLoadingMessage()
      this.addMessage('assistant', `❌ 错误: ${e.message}`)
      this.setStatus('error', '请求失败')
    } finally {
      this.isLoading = false
      this.abortController = null
      this.updateSendButton()
    }
  }

  async apiCall(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    }
    if (body) options.body = JSON.stringify(body)
    if (this.abortController) options.signal = this.abortController.signal

    const response = await fetch(`${this.serverUrl}${path}`, options)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    // 处理 204 No Content
    if (response.status === 204) {
      return {}
    }
    
    return response.json()
  }

  async checkConnection() {
    this.setStatus('loading', '正在连接...')
    
    try {
      const health = await this.apiCall('GET', '/global/health')
      this.isConnected = true
      this.serverVersion = health.version
      this.setStatus('connected', `${this.serverUrl.replace('http://', '')} · v${health.version}`)
      this.updateSettingsStatus(true, health.version)
    } catch (e) {
      this.isConnected = false
      this.serverVersion = ''
      this.setStatus('error', '无法连接到 OpenCode')
      this.updateSettingsStatus(false)
    }
  }

  setStatus(state, text) {
    const dot = document.getElementById('status-dot')
    const textEl = document.getElementById('status-text')
    
    dot.className = 'status-dot ' + state
    textEl.textContent = text
  }

  updateSettingsStatus(connected = false, version = '') {
    const dot = document.getElementById('settings-status-dot')
    const text = document.getElementById('settings-status-text')
    
    if (dot && text) {
      dot.className = 'status-dot ' + (connected ? 'connected' : 'error')
      text.textContent = connected ? `已连接 · v${version}` : '未连接'
    }
  }

  updateSendButton() {
    const btn = document.getElementById('btn-send')
    if (this.isLoading) {
      btn.classList.add('stop')
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      `
    } else {
      btn.classList.remove('stop')
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      `
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML.replace(/\n/g, '<br>')
  }

  // Detect operating system
  getOS() {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('win')) return 'windows'
    if (platform.includes('mac')) return 'macos'
    return 'linux'
  }

  // Build file path based on OS
  buildFilePath(basePath, folder, filename) {
    const os = this.getOS()
    const sep = os === 'windows' ? '\\' : '/'
    
    // Normalize the base path separators
    let normalizedBase = basePath.replace(/[/\\]+/g, sep)
    let normalizedFolder = folder.replace(/[/\\]+/g, sep)
    
    // Remove trailing separator from base
    normalizedBase = normalizedBase.replace(new RegExp(`[${sep.replace('\\', '\\\\')}]+$`), '')
    // Remove leading/trailing separator from folder
    normalizedFolder = normalizedFolder.replace(new RegExp(`^[${sep.replace('\\', '\\\\')}]+|[${sep.replace('\\', '\\\\')}]+$`, 'g'), '')
    
    return `${normalizedBase}${sep}${normalizedFolder}${sep}${filename}`
  }

  // Sanitize filename (remove invalid characters)
  sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
      .replace(/\s+/g, ' ')          // Normalize spaces
      .trim()
      .slice(0, 100)                 // Limit length
      || 'Untitled'
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new OpenCodeApp()
})

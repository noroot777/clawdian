// OpenCode Extension - Injected Sidebar
// 注入式侧边栏，不依赖 Chrome Side Panel API

(function() {
  // 防止重复注入
  if (window.__opencode_sidebar_injected) return
  window.__opencode_sidebar_injected = true

  // ==================== 配置 ====================
  const DEFAULT_WIDTH = 380
  const MIN_WIDTH = 300
  const MAX_WIDTH = 600
  const STORAGE_KEY = 'opencode_sidebar_width'

  // ==================== 状态 ====================
  let isOpen = false
  let sidebarWidth = DEFAULT_WIDTH
  let serverUrl = 'http://localhost:4096'
  let sessionId = null
  let isLoading = false
  let isConnected = false
  let serverVersion = ''
  let abortController = null
  let messages = []

  // ==================== DOM 元素 ====================
  let overlay = null
  let sidebar = null
  let chatArea = null
  let inputMessage = null
  let sendBtn = null
  let statusDot = null
  let statusText = null
  let includePageCheckbox = null

  // ==================== 初始化 ====================
  async function init() {
    // 加载保存的宽度
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, 'serverUrl', 'sessionId'])
      if (result[STORAGE_KEY]) sidebarWidth = result[STORAGE_KEY]
      if (result.serverUrl) serverUrl = result.serverUrl
      if (result.sessionId) sessionId = result.sessionId
    } catch (e) {
      console.error('[OpenCode] Failed to load settings:', e)
    }

    // 创建 DOM
    createSidebar()
    
    // 检查连接
    await checkConnection()
    
    console.log('[OpenCode] Sidebar initialized')
  }

  // ==================== 创建侧边栏 DOM ====================
  function createSidebar() {
    // 创建遮罩层
    overlay = document.createElement('div')
    overlay.id = 'opencode-sidebar-overlay'
    overlay.addEventListener('click', closeSidebar)
    document.body.appendChild(overlay)

    // 创建侧边栏容器
    sidebar = document.createElement('div')
    sidebar.id = 'opencode-sidebar'
    sidebar.style.width = sidebarWidth + 'px'
    sidebar.innerHTML = getSidebarHTML()
    document.body.appendChild(sidebar)

    // 获取 DOM 引用
    chatArea = sidebar.querySelector('.chat-area')
    inputMessage = sidebar.querySelector('.input-message')
    sendBtn = sidebar.querySelector('.send-btn')
    statusDot = sidebar.querySelector('.status-dot')
    statusText = sidebar.querySelector('.status-text')
    includePageCheckbox = sidebar.querySelector('#opencode-include-page')

    // 绑定事件
    bindEvents()
  }

  function getSidebarHTML() {
    return `
      <div class="resize-handle"></div>
      <div class="sidebar-container">
        <!-- Header -->
        <div class="sidebar-header">
          <div class="header-left">
            <span class="logo">⚡</span>
            <span class="title">OpenCode</span>
          </div>
          <div class="header-right">
            <button class="icon-btn btn-new-session" title="新建会话">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="icon-btn btn-close" title="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Chat Area -->
        <div class="chat-area">
          <div class="welcome-message">
            <div class="welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5">
                <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.3"/>
              </svg>
            </div>
            <div class="welcome-text">有什么可以帮你的？</div>
            <div class="welcome-hints">
              <p>我可以帮你：</p>
              <ul>
                <li>分析当前页面</li>
                <li>回答问题</li>
                <li>执行任务</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="input-area">
          <div class="input-wrapper">
            <textarea 
              class="input-message" 
              placeholder="输入指令或问题..." 
              rows="1"
            ></textarea>
            <button class="send-btn" title="发送">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <label class="context-toggle">
            <input type="checkbox" id="opencode-include-page" checked>
            <span>附带当前页面内容</span>
          </label>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
          <span class="status-dot"></span>
          <span class="status-text">正在连接...</span>
        </div>
      </div>
    `
  }

  // ==================== 事件绑定 ====================
  function bindEvents() {
    // 关闭按钮
    sidebar.querySelector('.btn-close').addEventListener('click', closeSidebar)
    
    // 新建会话
    sidebar.querySelector('.btn-new-session').addEventListener('click', startNewSession)
    
    // 发送消息
    sendBtn.addEventListener('click', handleSendClick)
    inputMessage.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendClick()
      }
    })
    
    // 自动调整输入框高度
    inputMessage.addEventListener('input', () => {
      inputMessage.style.height = 'auto'
      inputMessage.style.height = Math.min(inputMessage.scrollHeight, 120) + 'px'
    })
    
    // 拖动调整宽度
    const resizeHandle = sidebar.querySelector('.resize-handle')
    let isResizing = false
    let startX = 0
    let startWidth = 0

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = sidebarWidth
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return
      const delta = startX - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
      sidebarWidth = newWidth
      sidebar.style.width = newWidth + 'px'
    })

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        // 保存宽度
        chrome.storage.local.set({ [STORAGE_KEY]: sidebarWidth }).catch(() => {})
      }
    })
  }

  // ==================== 侧边栏开关 ====================
  function openSidebar() {
    if (isOpen) return
    isOpen = true
    sidebar.classList.add('open')
    overlay.classList.add('open')
    inputMessage.focus()
  }

  function closeSidebar() {
    if (!isOpen) return
    isOpen = false
    sidebar.classList.remove('open')
    overlay.classList.remove('open')
  }

  function toggleSidebar() {
    if (isOpen) {
      closeSidebar()
    } else {
      openSidebar()
    }
  }

  // ==================== 会话管理 ====================
  function startNewSession() {
    sessionId = null
    messages = []
    chatArea.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5">
            <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.3"/>
          </svg>
        </div>
        <div class="welcome-text">有什么可以帮你的？</div>
        <div class="welcome-hints">
          <p>我可以帮你：</p>
          <ul>
            <li>分析当前页面</li>
            <li>回答问题</li>
            <li>执行任务</li>
          </ul>
        </div>
      </div>
    `
    chrome.storage.local.set({ sessionId: null }).catch(() => {})
  }

  // ==================== 消息处理 ====================
  function handleSendClick() {
    if (isLoading) {
      abortRequest()
    } else {
      sendMessage()
    }
  }

  async function sendMessage() {
    const message = inputMessage.value.trim()
    if (!message || isLoading) return

    const includePage = includePageCheckbox.checked

    // 清空输入
    inputMessage.value = ''
    inputMessage.style.height = 'auto'

    // 获取页面内容
    let pageContent = null
    if (includePage) {
      pageContent = getPageContent()
    }

    // 添加用户消息
    addMessage('user', message, pageContent)

    // 发送到 OpenCode
    await sendToOpenCode(message, pageContent)
  }

  function getPageContent() {
    if (window.__opencode_extractContent) {
      return window.__opencode_extractContent()
    }
    return null
  }

  function getSelectedText() {
    if (window.__opencode_getSelection) {
      return window.__opencode_getSelection()
    }
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      return {
        text: selection.toString(),
        url: window.location.href,
        title: document.title
      }
    }
    return null
  }

  function addMessage(role, content, attachment = null) {
    // 移除欢迎消息
    const welcome = chatArea.querySelector('.welcome-message')
    if (welcome) welcome.remove()

    const messageEl = document.createElement('div')
    messageEl.className = `message message-${role}`

    const avatar = role === 'user' ? '🧑' : '🤖'

    let attachmentHtml = ''
    if (attachment && attachment.url) {
      try {
        const domain = new URL(attachment.url).hostname
        attachmentHtml = `
          <div class="message-attachment">
            <span>📎</span>
            <span>${domain}</span>
          </div>
        `
      } catch (e) {}
    }

    messageEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        ${escapeHtml(content)}
        ${attachmentHtml}
      </div>
    `

    chatArea.appendChild(messageEl)
    chatArea.scrollTop = chatArea.scrollHeight

    messages.push({ role, content, attachment })
    return messageEl
  }

  function addLoadingMessage() {
    const messageEl = document.createElement('div')
    messageEl.className = 'message message-assistant'
    messageEl.id = 'opencode-loading-message'
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

  function removeLoadingMessage() {
    const loading = sidebar.querySelector('#opencode-loading-message')
    if (loading) loading.remove()
  }

  // ==================== API 调用 ====================
  async function sendToOpenCode(message, pageContent) {
    isLoading = true
    abortController = new AbortController()
    updateSendButton()
    addLoadingMessage()
    setStatus('loading', '处理中...')

    try {
      // 创建会话
      if (!sessionId) {
        const session = await apiCall('POST', '/session', { title: 'Browser Sidebar' })
        sessionId = session.id
        chrome.storage.local.set({ sessionId }).catch(() => {})
      }

      // 构建完整提示
      let fullPrompt = message
      if (pageContent && pageContent.content) {
        fullPrompt = `${message}\n\n---\n页面信息:\n标题: ${pageContent.title}\n来源: ${pageContent.url}\n\n内容:\n${pageContent.content}`
      }

      // 发送消息
      const result = await apiCall('POST', `/session/${sessionId}/message`, {
        parts: [{ type: 'text', text: fullPrompt }]
      })

      removeLoadingMessage()

      // 检查错误
      if (result.info?.error) {
        const error = result.info.error
        const errorName = error.name || 'Error'
        const errorMessage = error.data?.message || JSON.stringify(error.data) || '未知错误'
        addMessage('assistant', `❌ ${errorName}: ${errorMessage}`)
        setStatus('error', '请求失败')
        return
      }

      // 提取响应文本
      let responseText = ''
      if (result.parts) {
        for (const part of result.parts) {
          if (part.type === 'text') {
            responseText += part.text
          }
        }
      }

      if (!responseText) {
        addMessage('assistant', '⚠️ 服务器返回空响应')
        setStatus('connected', serverUrl.replace('http://', ''))
        return
      }

      addMessage('assistant', responseText)
      setStatus('connected', serverUrl.replace('http://', ''))

    } catch (e) {
      if (e.name === 'AbortError') return
      console.error('[OpenCode] Failed to send:', e)
      removeLoadingMessage()
      addMessage('assistant', `❌ 错误: ${e.message}`)
      setStatus('error', '请求失败')
    } finally {
      isLoading = false
      abortController = null
      updateSendButton()
    }
  }

  async function abortRequest() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }

    if (sessionId) {
      try {
        await fetch(`${serverUrl}/session/${sessionId}/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      } catch (e) {}
    }

    isLoading = false
    removeLoadingMessage()
    addMessage('assistant', '⏹ 已停止')
    setStatus('connected', serverUrl.replace('http://', ''))
    updateSendButton()
  }

  async function apiCall(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    }
    if (body) options.body = JSON.stringify(body)
    if (abortController) options.signal = abortController.signal

    const response = await fetch(`${serverUrl}${path}`, options)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    if (response.status === 204) return {}
    return response.json()
  }

  async function checkConnection() {
    setStatus('loading', '正在连接...')

    try {
      const health = await apiCall('GET', '/global/health')
      isConnected = true
      serverVersion = health.version
      setStatus('connected', `${serverUrl.replace('http://', '')} · v${health.version}`)
    } catch (e) {
      isConnected = false
      serverVersion = ''
      setStatus('error', '无法连接到 OpenCode')
    }
  }

  // ==================== UI 更新 ====================
  function setStatus(state, text) {
    if (statusDot) statusDot.className = 'status-dot ' + state
    if (statusText) statusText.textContent = text
  }

  function updateSendButton() {
    if (!sendBtn) return
    if (isLoading) {
      sendBtn.classList.add('stop')
      sendBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      `
    } else {
      sendBtn.classList.remove('stop')
      sendBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      `
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML.replace(/\n/g, '<br>')
  }

  // ==================== 消息监听 ====================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_SIDEBAR') {
      toggleSidebar()
      sendResponse({ success: true, isOpen })
    } else if (message.type === 'OPEN_SIDEBAR') {
      openSidebar()
      sendResponse({ success: true })
    } else if (message.type === 'CLOSE_SIDEBAR') {
      closeSidebar()
      sendResponse({ success: true })
    } else if (message.type === 'GET_SIDEBAR_STATE') {
      sendResponse({ isOpen })
    }
    return true
  })

  // ==================== 导出函数 ====================
  window.__opencode_toggleSidebar = toggleSidebar
  window.__opencode_openSidebar = openSidebar
  window.__opencode_closeSidebar = closeSidebar

  // ==================== 启动 ====================
  init()
})()

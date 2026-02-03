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
  let messages = []
  let obsidianVault = ''
  let obsidianFolder = 'Inbox'

  // ==================== DOM 元素 ====================
  let overlay = null
  let sidebar = null
  let chatArea = null
  let inputMessage = null
  let sendBtn = null
  let statusDot = null
  let statusText = null

  // ==================== 初始化 ====================
  async function init() {
    // 加载保存的宽度
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, 'serverUrl', 'sessionId', 'obsidianVault', 'obsidianFolder'])
      if (result[STORAGE_KEY]) sidebarWidth = result[STORAGE_KEY]
      if (result.serverUrl) serverUrl = result.serverUrl
      if (result.sessionId) sessionId = result.sessionId
      if (result.obsidianVault) obsidianVault = result.obsidianVault
      if (result.obsidianFolder) obsidianFolder = result.obsidianFolder
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
            <span class="title">OpenCode</span>
          </div>
          <div class="header-right">
            <button class="icon-btn btn-new-session" title="新建会话">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="icon-btn btn-settings" title="设置">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
          <!-- Plugin Dock - below input -->
          <div class="plugin-dock">
            <div class="plugin-header">
              <span>插件</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="plugin-grid">
              <button class="plugin-item" data-plugin="obsidian" title="Obsidian">
                <span class="plugin-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </span>
                <span class="plugin-name">Obsidian</span>
              </button>
              <button class="plugin-item" data-plugin="twitter-sync" title="推特书签同步">
                <span class="plugin-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
                  </svg>
                </span>
                <span class="plugin-name">书签同步</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
          <span class="status-dot"></span>
          <span class="status-text">正在连接...</span>
        </div>

        <!-- Settings Panel (hidden by default) -->
        <div class="settings-panel hidden">
          <div class="settings-header">
            <button class="icon-btn btn-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="settings-title">设置</span>
          </div>
          <div class="settings-content">
            <div class="settings-section">
              <label class="settings-label">服务器地址</label>
              <input type="text" class="settings-input server-url-input" placeholder="http://localhost:4096">
              <div class="settings-status">
                <span class="status-dot settings-status-dot"></span>
                <span class="settings-status-text">未连接</span>
              </div>
            </div>
            <div class="settings-section">
              <label class="settings-label">Obsidian Vault 路径</label>
              <input type="text" class="settings-input obsidian-vault-input" placeholder="C:\\Users\\...\\MyVault">
            </div>
            <div class="settings-section">
              <label class="settings-label">Obsidian 保存文件夹</label>
              <input type="text" class="settings-input obsidian-folder-input" placeholder="Inbox">
            </div>
          </div>
        </div>

        <!-- Plugin Panel (hidden by default) -->
        <div class="plugin-panel hidden">
          <div class="plugin-panel-header">
            <button class="icon-btn btn-plugin-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="plugin-panel-title">插件</span>
          </div>
          <div class="plugin-panel-content"></div>
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
    
    // 设置按钮
    sidebar.querySelector('.btn-settings').addEventListener('click', showSettings)
    sidebar.querySelector('.btn-back').addEventListener('click', hideSettings)
    
    // 设置输入
    const serverUrlInput = sidebar.querySelector('.server-url-input')
    const obsidianVaultInput = sidebar.querySelector('.obsidian-vault-input')
    const obsidianFolderInput = sidebar.querySelector('.obsidian-folder-input')
    
    serverUrlInput.value = serverUrl
    obsidianVaultInput.value = obsidianVault
    obsidianFolderInput.value = obsidianFolder
    
    serverUrlInput.addEventListener('change', (e) => {
      serverUrl = e.target.value
      saveSettings()
      checkConnection()
    })
    obsidianVaultInput.addEventListener('change', (e) => {
      obsidianVault = e.target.value
      saveSettings()
    })
    obsidianFolderInput.addEventListener('change', (e) => {
      obsidianFolder = e.target.value
      saveSettings()
    })
    
    // 插件 Dock 折叠
    sidebar.querySelector('.plugin-header').addEventListener('click', () => {
      sidebar.querySelector('.plugin-dock').classList.toggle('collapsed')
    })
    
    // 插件项点击
    sidebar.querySelectorAll('.plugin-item[data-plugin]').forEach(item => {
      item.addEventListener('click', () => showPluginPanel(item.dataset.plugin))
    })
    sidebar.querySelector('.btn-plugin-back').addEventListener('click', hidePluginPanel)
    
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
  
  // ==================== 设置面板 ====================
  function showSettings() {
    const panel = sidebar.querySelector('.settings-panel')
    panel.classList.remove('hidden')
    panel.offsetHeight // 强制重排
    panel.classList.add('visible')
    updateSettingsStatus()
  }
  
  function hideSettings() {
    const panel = sidebar.querySelector('.settings-panel')
    panel.classList.remove('visible')
    setTimeout(() => {
      if (!panel.classList.contains('visible')) {
        panel.classList.add('hidden')
      }
    }, 300)
  }
  
  function updateSettingsStatus() {
    const dot = sidebar.querySelector('.settings-status-dot')
    const text = sidebar.querySelector('.settings-status-text')
    if (dot && text) {
      dot.className = 'status-dot settings-status-dot ' + (isConnected ? 'connected' : 'error')
      text.textContent = isConnected ? `已连接 · v${serverVersion}` : '未连接'
    }
  }
  
  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        serverUrl,
        sessionId,
        obsidianVault,
        obsidianFolder
      })
    } catch (e) {
      console.error('[OpenCode] Failed to save settings:', e)
    }
  }
  
  // ==================== 插件面板 ====================
  async function showPluginPanel(pluginId) {
    const panel = sidebar.querySelector('.plugin-panel')
    const title = sidebar.querySelector('.plugin-panel-title')
    const content = sidebar.querySelector('.plugin-panel-content')
    
    if (pluginId === 'obsidian') {
      title.textContent = 'Obsidian'
      content.innerHTML = `
        <div class="plugin-actions">
          <button class="plugin-action-btn" data-action="save-page">
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </span>
            <span>保存当前页面</span>
          </button>
          <button class="plugin-action-btn" data-action="save-summary">
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </span>
            <span>保存并总结</span>
          </button>
          <button class="plugin-action-btn" data-action="save-selection">
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </span>
            <span>保存选中内容</span>
          </button>
        </div>
      `
      
      // 绑定插件操作
      content.querySelectorAll('.plugin-action-btn').forEach(btn => {
        btn.addEventListener('click', () => executePluginAction('obsidian', btn.dataset.action))
      })
    }
    
    if (pluginId === 'twitter-sync') {
      title.textContent = '书签同步'
      
      // Get sync status
      let lastId = '无记录'
      try {
        const storage = await chrome.storage.local.get(['twitter_last_synced_id'])
        lastId = storage.twitter_last_synced_id || '无记录'
      } catch (e) {}
      
      content.innerHTML = `
        <div class="plugin-section">
          <div class="sync-status-card">
            <div class="label">上次同步断点 (Tweet ID)</div>
            <div class="value">${lastId}</div>
          </div>
          
          <div class="sync-options">
            <label class="radio-option">
              <input type="radio" name="sync-mode" value="resume" checked>
              <div class="option-text">
                <span class="title">增量同步 (推荐)</span>
                <span class="desc">从上次断点处继续，只抓取新书签</span>
              </div>
            </label>
            
            <label class="radio-option">
              <input type="radio" name="sync-mode" value="full">
              <div class="option-text">
                <span class="title">全量同步</span>
                <span class="desc">重新扫描所有书签 (耗时较长)</span>
              </div>
            </label>

            <div class="input-group">
              <label>保存文件夹</label>
              <input type="text" id="sync-folder" value="X书签" placeholder="例如: X书签">
            </div>

            <div class="input-group">
              <label>指定起始 ID (可选)</label>
              <input type="text" id="sync-target-id" placeholder="如果不填，则使用上次断点">
            </div>
          </div>

          <button class="plugin-action-btn primary" id="btn-start-sync">
            <span class="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </span>
            <span>开始同步</span>
          </button>
        </div>
      `
      
      // Bind events
      const btnStart = content.querySelector('#btn-start-sync')
      btnStart.addEventListener('click', async () => {
        const mode = content.querySelector('input[name="sync-mode"]:checked').value
        const folder = content.querySelector('#sync-folder').value
        const manualTargetId = content.querySelector('#sync-target-id').value.trim()
        
        let targetId = null
        if (mode === 'resume') {
          targetId = manualTargetId || (lastId !== '无记录' ? lastId : null)
        }

        // Check if we are on Twitter Bookmarks page
        const currentUrl = window.location.href
        
        if (!currentUrl.includes('twitter.com/i/bookmarks') && !currentUrl.includes('x.com/i/bookmarks')) {
           // Navigate to bookmarks
           addMessage('assistant', '⚠️ 正在跳转到推特书签页，请在页面加载完成后再次点击"开始同步"')
           window.location.href = 'https://twitter.com/i/bookmarks'
           return
        }

        // Send command to content script (self)
        try {
          if (window.__opencode_startSync) {
            window.__opencode_startSync({
              mode,
              targetId,
              folderName: folder
            })
          } else {
            // Fallback: send message
            chrome.runtime.sendMessage({
              type: 'START_SYNC',
              options: {
                mode,
                targetId,
                folderName: folder
              }
            })
          }
          hidePluginPanel()
          addMessage('assistant', '✅ 同步已启动，请保持页面打开')
        } catch (e) {
          addMessage('assistant', '❌ 启动失败: 请刷新推特页面后重试')
          console.error(e)
        }
      })
    }
    
    panel.classList.remove('hidden')
    panel.offsetHeight
    panel.classList.add('visible')
  }
  
  function hidePluginPanel() {
    const panel = sidebar.querySelector('.plugin-panel')
    panel.classList.remove('visible')
    setTimeout(() => {
      if (!panel.classList.contains('visible')) {
        panel.classList.add('hidden')
      }
    }, 300)
  }
  
  async function executePluginAction(plugin, action) {
    hidePluginPanel()
    
    let prompt = ''
    
    if (plugin === 'obsidian') {
      if (!obsidianVault) {
        addMessage('assistant', '❌ 请先在设置中配置 Obsidian Vault 路径')
        return
      }
      
      const pageContent = getPageContent()
      const pageTitle = pageContent?.title || 'Untitled'
      const pageUrl = pageContent?.url || window.location.href
      const sanitizedTitle = sanitizeFilename(pageTitle)
      const filename = `${sanitizedTitle}.md`
      const fullPath = buildFilePath(obsidianVault, obsidianFolder, filename)
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
      inputMessage.value = prompt
      await sendMessage()
    }
  }
  
  // ==================== 工具函数 ====================
  function getOS() {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('win')) return 'windows'
    if (platform.includes('mac')) return 'macos'
    return 'linux'
  }
  
  function buildFilePath(basePath, folder, filename) {
    const os = getOS()
    const sep = os === 'windows' ? '\\' : '/'
    let normalizedBase = basePath.replace(/[/\\]+/g, sep)
    let normalizedFolder = folder.replace(/[/\\]+/g, sep)
    normalizedBase = normalizedBase.replace(new RegExp(`[${sep.replace('\\', '\\\\')}]+$`), '')
    normalizedFolder = normalizedFolder.replace(new RegExp(`^[${sep.replace('\\', '\\\\')}]+|[${sep.replace('\\', '\\\\')}]+$`, 'g'), '')
    return `${normalizedBase}${sep}${normalizedFolder}${sep}${filename}`
  }
  
  function sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100)
      || 'Untitled'
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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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

    // 清空输入
    inputMessage.value = ''
    inputMessage.style.height = 'auto'

    // Always include page content
    const pageContent = getPageContent()

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

    const avatar = role === 'user' ? 'U' : 'AI'

    let attachmentHtml = ''
    if (attachment && attachment.url) {
      try {
        const domain = new URL(attachment.url).hostname
        attachmentHtml = `
          <div class="message-attachment">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
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
      <div class="message-avatar">AI</div>
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
      console.error('[OpenCode] Failed to send:', e)
      removeLoadingMessage()
      addMessage('assistant', `❌ 错误: ${e.message}`)
      setStatus('error', '请求失败')
    } finally {
      isLoading = false
      updateSendButton()
    }
  }

  async function abortRequest() {
    // Note: We can't abort the background fetch, but we can call the abort API
    isLoading = false
    
    if (sessionId) {
      try {
        await apiCall('POST', `/session/${sessionId}/abort`)
      } catch (e) {
        console.error('[OpenCode] Failed to abort:', e)
      }
    }

    removeLoadingMessage()
    addMessage('assistant', '⏹ 已停止')
    setStatus('connected', serverUrl.replace('http://', ''))
    updateSendButton()
  }

  async function apiCall(method, path, body = null) {
    // Route API calls through background script to avoid CORS issues
    const url = `${serverUrl}${path}`
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      method,
      url,
      body
    })

    if (response.error) {
      throw new Error(response.error)
    }

    return response.data
  }

  async function checkConnection() {
    setStatus('loading', '正在连接...')
    console.log('[OpenCode] Checking connection to:', serverUrl)

    try {
      const health = await apiCall('GET', '/global/health')
      isConnected = true
      serverVersion = health.version
      setStatus('connected', `${serverUrl.replace('http://', '')} · v${health.version}`)
      updateSettingsStatus()
      console.log('[OpenCode] Connected successfully:', health.version)
    } catch (e) {
      isConnected = false
      serverVersion = ''
      setStatus('error', '无法连接到 OpenCode')
      updateSettingsStatus()
      console.error('[OpenCode] Connection failed:', e.message)
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

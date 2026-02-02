// OpenCode Extension - Background Service Worker

// 使用 default_popup，不需要 onClicked 监听器
// Popup 会自动作为悬浮面板打开

let popupWindowId = null

// 处理来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 统一的异步处理包装器，确保始终发送响应
  const handleAsync = (promise) => {
    promise
      .then(response => {
        try {
          sendResponse(response)
        } catch (e) {
          console.error('Failed to send response:', e)
        }
      })
      .catch(e => {
        console.error('Async handler failed:', e)
        try {
          sendResponse({ error: e.message || 'Unknown error' })
        } catch (err) {
          console.error('Failed to send error response:', err)
        }
      })
    return true // 保持消息通道开放
  }

  if (message.type === 'OPEN_SIDEPANEL') {
    handleOpenSidePanel(message.tabId)
    sendResponse({ success: true })
    return false
  } else if (message.type === 'TOGGLE_SIDEBAR') {
    // Toggle injected sidebar in content script
    return handleAsync(handleToggleSidebar(message.tabId))
  } else if (message.type === 'GET_PAGE_CONTENT') {
    return handleAsync(handleGetPageContent(message.tabId))
  } else if (message.type === 'API_REQUEST') {
    // Proxy API requests to avoid CORS issues in content scripts
    return handleAsync(handleApiRequest(message.method, message.url, message.body))
  }
})

// 打开侧边栏
async function handleOpenSidePanel(tabId) {
  try {
    // 关闭 popup 窗口
    if (popupWindowId) {
      await chrome.windows.remove(popupWindowId)
      popupWindowId = null
    }
    
    // 打开侧边栏
    if (tabId) {
      await chrome.sidePanel.open({ tabId })
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id })
      }
    }
  } catch (e) {
    console.error('Failed to open side panel:', e)
  }
}

// 切换注入的侧边栏
async function handleToggleSidebar(tabId) {
  try {
    let targetTabId = tabId
    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      targetTabId = tab?.id
    }
    
    if (!targetTabId) {
      return { error: 'No active tab found' }
    }

    // Check if we can inject on this page
    const tab = await chrome.tabs.get(targetTabId)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return { error: '无法在此页面打开侧边栏' }
    }

    // Try to send message first
    try {
      await chrome.tabs.sendMessage(targetTabId, { type: 'TOGGLE_SIDEBAR' })
      return { success: true }
    } catch (e) {
      // Content script not loaded, inject it
      console.log('[OpenCode] Content script not loaded, injecting...')
      
      // Inject CSS first
      await chrome.scripting.insertCSS({
        target: { tabId: targetTabId },
        files: ['content/sidebar.css']
      })
      
      // Inject JS files in order
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ['lib/readability.min.js', 'lib/turndown.min.js', 'content/extractor.js', 'content/sidebar.js']
      })
      
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Now send the toggle message
      await chrome.tabs.sendMessage(targetTabId, { type: 'TOGGLE_SIDEBAR' })
      return { success: true }
    }
  } catch (e) {
    console.error('Failed to toggle sidebar:', e)
    return { error: e.message }
  }
}

// 获取页面内容
async function handleGetPageContent(tabId) {
  try {
    let targetTabId = tabId
    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      targetTabId = tab?.id
    }
    
    if (!targetTabId) {
      return { error: 'No active tab found' }
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        // 这个函数在页面上下文执行
        if (window.__opencode_extractContent) {
          return window.__opencode_extractContent()
        }
        return { error: 'Extractor not loaded' }
      }
    })

    return results[0]?.result || { error: 'Failed to extract content' }
  } catch (e) {
    console.error('Failed to get page content:', e)
    return { error: e.message }
  }
}

// 代理 API 请求 (避免 CORS 问题)
async function handleApiRequest(method, url, body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    }
    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return { error: `HTTP ${response.status}: ${errorText}` }
    }

    if (response.status === 204) {
      return { data: {} }
    }

    const data = await response.json()
    return { data }
  } catch (e) {
    console.error('API request failed:', e)
    return { error: e.message }
  }
}

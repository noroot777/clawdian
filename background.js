// OpenCode Extension - Background Service Worker

// 使用 default_popup，不需要 onClicked 监听器
// Popup 会自动作为悬浮面板打开

// 处理来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    handleOpenSidePanel(message.tabId)
    sendResponse({ success: true })
  } else if (message.type === 'GET_PAGE_CONTENT') {
    handleGetPageContent(message.tabId).then(sendResponse)
    return true // 保持消息通道开放
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

// OpenCode Extension - Twitter Bookmark Sync
// 负责：滚动抓取、断点检测、队列导出

(function() {
  // 防止重复加载
  if (window.__opencode_twitter_sync_loaded) return
  window.__opencode_twitter_sync_loaded = true

  console.log('[OpenCode] Twitter Sync module loaded')

  class TwitterSync {
    constructor() {
      this.isSyncing = false
      this.stopRequested = false
      this.scannedTweets = new Map() // ID -> TweetData
      this.lastSyncedId = null
      this.obsidianFolder = 'X书签' // 默认文件夹
    }

    // --- 核心方法：启动同步 ---
    async start(options = {}) {
      if (this.isSyncing) return { error: 'Sync already in progress' }
      
      this.isSyncing = true
      this.stopRequested = false
      this.scannedTweets.clear()
      
      const { mode, targetId, vaultName, folderName } = options
      this.obsidianFolder = folderName || 'X书签'

      console.log(`[Sync] Starting in mode: ${mode}, target: ${targetId || 'None'}`)

      // 1. 显示 UI 覆盖层
      this.createOverlay()

      try {
        // 2. 滚动抓取阶段
        this.updateStatus('正在扫描书签...', 'scanning')
        const newTweets = await this.scrollAndScan(mode, targetId)
        
        if (this.stopRequested) {
          this.updateStatus('同步已取消', 'idle')
          setTimeout(() => this.removeOverlay(), 2000)
          return
        }

        if (newTweets.length === 0) {
          this.updateStatus('没有发现新推文', 'success')
          setTimeout(() => this.removeOverlay(), 3000)
          return
        }

        // 3. 写入阶段 (倒序：旧 -> 新)
        // scrollAndScan 返回的是 [新 -> 旧] (页面顺序)，所以需要 reverse
        const tweetsToSync = newTweets.reverse()
        
        this.updateStatus(`准备导入 ${tweetsToSync.length} 条推文...`, 'importing')
        
        // 保存最新的 ID 作为断点 (数组最后一个是原本的最上面那条，即最新的)
        // reverse 后，数组最后一个是原本列表的最上面（最新）
        // 原始列表：[Newest, ..., Oldest]
        // reversed: [Oldest, ..., Newest]
        const newestTweetId = tweetsToSync[tweetsToSync.length - 1].id

        await this.processQueue(tweetsToSync)
        
        // 4. 更新断点
        await chrome.storage.local.set({ 'twitter_last_synced_id': newestTweetId })
        console.log(`[Sync] Updated checkpoint to ${newestTweetId}`)

        this.updateStatus('✅ 同步完成！', 'success')
        setTimeout(() => this.removeOverlay(), 3000)

      } catch (e) {
        console.error('[Sync] Error:', e)
        this.updateStatus(`❌ 错误: ${e.message}`, 'error')
      } finally {
        this.isSyncing = false
      }
    }

    stop() {
      this.stopRequested = true
      this.updateStatus('正在停止...', 'idle')
    }

    // --- 滚动与扫描 ---
    async scrollAndScan(mode, targetId) {
      let foundBreakpoint = false
      let reachedBottom = false
      let noNewContentCount = 0
      let lastHeight = 0
      const collected = []

      // 如果是全量模式，忽略 targetId
      const actualTargetId = mode === 'full' ? null : targetId

      while (!this.stopRequested && !foundBreakpoint && !reachedBottom) {
        // 1. 解析当前视图
        const visibleTweets = this.parseVisibleTweets()
        
        // 2. 检查是否有新内容
        let hasNewInView = false
        for (const tweet of visibleTweets) {
          if (!this.scannedTweets.has(tweet.id)) {
            // 检查是否遇到断点
            if (actualTargetId && tweet.id === actualTargetId) {
              console.log(`[Sync] Hit breakpoint: ${tweet.id}`)
              foundBreakpoint = true
              break // 跳出 for 循环，之后也会跳出 while
            }
            
            this.scannedTweets.set(tweet.id, tweet)
            collected.push(tweet)
            hasNewInView = true
          }
        }

        this.updateStatus(`已扫描 ${collected.length} 条推文...`, 'scanning')

        if (foundBreakpoint) break

        // 3. 滚动逻辑
        const currentHeight = document.documentElement.scrollHeight
        if (currentHeight === lastHeight) {
          noNewContentCount++
          if (noNewContentCount > 5) { // 连续 5 次高度不变，认为到底了
            reachedBottom = true
            console.log('[Sync] Reached bottom')
          }
        } else {
          noNewContentCount = 0
          lastHeight = currentHeight
        }

        if (!reachedBottom) {
          window.scrollBy(0, window.innerHeight * 0.8) // 滚动一屏
          await this.sleep(1500) // 等待加载，Twitter 比较慢
        }
      }

      return collected
    }

    // --- DOM 解析 ---
    parseVisibleTweets() {
      const articles = document.querySelectorAll('article[data-testid="tweet"]')
      const results = []

      articles.forEach(article => {
        try {
          // 获取 ID (从 status 链接中提取)
          const link = article.querySelector('a[href*="/status/"]')
          if (!link) return
          
          const url = link.href
          const idMatch = url.match(/\/status\/(\d+)/)
          if (!idMatch) return
          const id = idMatch[1]

          // 提取文本
          const textNode = article.querySelector('[data-testid="tweetText"]')
          const content = textNode ? textNode.innerText : ''

          // 提取作者
          const userNode = article.querySelector('[data-testid="User-Name"]')
          const authorRaw = userNode ? userNode.innerText.split('\n') : ['Unknown', '']
          const authorName = authorRaw[0]

          // 提取图片 (高清)
          const images = []
          article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
            let src = img.src
            if (src.includes('name=')) src = src.replace(/name=[a-zA-Z0-9_]+/, 'name=large')
            images.push(src)
          })

          // 提取视频封面
          const videoPoster = article.querySelector('[data-testid="videoPlayer"] video')?.poster

          results.push({
            id,
            url,
            content,
            authorName,
            images,
            videoPoster,
            date: new Date().toISOString() // 暂用当前时间，DOM 里解析精确时间较复杂
          })
        } catch (e) {
          console.warn('[Sync] Failed to parse tweet', e)
        }
      })
      
      return results
    }

    // --- 队列写入 ---
    async processQueue(tweets) {
      const total = tweets.length
      
      for (let i = 0; i < total; i++) {
        if (this.stopRequested) break

        const tweet = tweets[i]
        this.updateStatus(`正在导入: ${i + 1} / ${total}`, 'importing')
        
        // 生成 Obsidian URI
        this.openObsidianUri(tweet)

        // 延迟，防止浏览器拦截
        await this.sleep(1200) 
      }
    }

    openObsidianUri(tweet) {
      const fileName = `Tweet - ${tweet.authorName} - ${tweet.id}`
      
      let mediaMd = ''
      tweet.images.forEach((img, idx) => {
        mediaMd += `\n![image-${idx}](${img})\n`
      })
      if (tweet.videoPoster) {
        mediaMd += `\n![video](${tweet.videoPoster})\n> [包含视频]\n`
      }

      const markdown = `---
created: ${tweet.date}
source: ${tweet.url}
author: ${tweet.authorName}
tweet_id: ${tweet.id}
tags: [tweet, bookmark]
---

${tweet.content}

${mediaMd}

> [原推文](${tweet.url})
`
      
      // 注意：文件夹路径不应包含 Vault 名称，Obsidian URI 是相对于 Vault 根目录的
      // file 参数格式：文件夹/文件名
      const filePath = `${this.obsidianFolder}/${fileName}`
      
      const uri = `obsidian://new?file=${encodeURIComponent(filePath)}&content=${encodeURIComponent(markdown)}`
      
      // 使用 iframe 方式触发，比 window.open 更温和，不容易被拦截
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = uri
      document.body.appendChild(iframe)
      
      // 清理 iframe
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }

    // --- UI 辅助 ---
    createOverlay() {
      if (document.getElementById('opencode-sync-overlay')) return

      const div = document.createElement('div')
      div.id = 'opencode-sync-overlay'
      div.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; background: #1da1f2; color: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999; font-family: sans-serif; min-width: 200px;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">🔄 同步推文到 Obsidian</h3>
          <div id="opencode-sync-status" style="font-size: 14px; margin-bottom: 10px;">准备中...</div>
          <button id="opencode-sync-stop" style="background: white; color: #1da1f2; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">停止</button>
        </div>
      `
      document.body.appendChild(div)

      document.getElementById('opencode-sync-stop').onclick = () => this.stop()
    }

    removeOverlay() {
      const el = document.getElementById('opencode-sync-overlay')
      if (el) el.remove()
    }

    updateStatus(text, state) {
      const el = document.getElementById('opencode-sync-status')
      if (el) el.innerText = text
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    }
  }

  // 监听来自 Popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_SYNC') {
      const syncer = new TwitterSync()
      syncer.start(request.options)
      sendResponse({ success: true })
    }
    return true
  })

})()

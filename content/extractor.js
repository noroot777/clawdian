// OpenCode Extension - Content Extractor
// 使用 Readability 和 Turndown 提取页面内容

(function() {
  // 提取页面内容的主函数
  window.__opencode_extractContent = function() {
    try {
      const url = window.location.href
      const title = document.title

      // 克隆文档以避免修改原始 DOM
      const documentClone = document.cloneNode(true)
      
      let content = ''
      let excerpt = ''

      // 尝试使用 Readability 提取正文
      // 特殊处理 Twitter/X
      if (window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com')) {
        const twitterData = extractTwitterContent()
        if (twitterData) {
          return twitterData
        }
      }

      if (typeof Readability !== 'undefined') {
        try {
          const reader = new Readability(documentClone)
          const article = reader.parse()
          
          if (article) {
            // 使用 Turndown 转换为 Markdown
            if (typeof TurndownService !== 'undefined') {
              const turndown = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                bulletListMarker: '-'
              })
              
              // 添加规则处理代码块
              turndown.addRule('pre', {
                filter: 'pre',
                replacement: function(content, node) {
                  const lang = node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || ''
                  return '\n```' + lang + '\n' + content.trim() + '\n```\n'
                }
              })
              
              content = turndown.turndown(article.content)
            } else {
              // 降级：使用纯文本
              const div = document.createElement('div')
              div.innerHTML = article.content
              content = div.textContent || div.innerText
            }
            
            excerpt = article.excerpt || ''
          }
        } catch (e) {
          console.error('Readability failed:', e)
        }
      }

      // 降级方案：如果 Readability 失败，提取基本内容
      if (!content) {
        // 尝试获取 article 或 main 元素
        const mainContent = document.querySelector('article, main, [role="main"], .content, .post, .article')
        
        if (mainContent) {
          content = mainContent.textContent || mainContent.innerText
        } else {
          // 最后降级：获取 body 文本
          content = document.body.textContent || document.body.innerText
        }
        
        // 清理多余空白
        content = content.replace(/\s+/g, ' ').trim()
      }

      // 获取元信息
      const meta = {
        description: document.querySelector('meta[name="description"]')?.content || '',
        author: document.querySelector('meta[name="author"]')?.content || '',
        publishedTime: document.querySelector('meta[property="article:published_time"]')?.content || '',
        siteName: document.querySelector('meta[property="og:site_name"]')?.content || ''
      }

      return {
        url,
        title,
        content,
        excerpt,
        meta,
        wordCount: content.length,
        extractedAt: new Date().toISOString()
      }
    } catch (e) {
      console.error('Content extraction failed:', e)
      return {
        error: e.message,
        url: window.location.href,
        title: document.title
      }
    }
  }

  // Twitter 专用提取逻辑
  function extractTwitterContent() {
    try {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]')
      if (tweets.length === 0) return null

      const tweet = tweets[0]
      
      // 提取文本
      const textNode = tweet.querySelector('[data-testid="tweetText"]')
      const text = textNode ? textNode.innerText : ''
      
      // 提取作者
      const userNode = tweet.querySelector('[data-testid="User-Name"]')
      const authorRaw = userNode ? userNode.innerText.split('\n') : ['Unknown', '']
      const authorName = authorRaw[0]
      const authorHandle = authorRaw[1]
      
      // 提取图片和视频封面
      let mediaMarkdown = ''
      
      // 图片 - 获取高清图
      const photos = tweet.querySelectorAll('[data-testid="tweetPhoto"] img')
      photos.forEach((img, index) => {
        let src = img.src
        if (src.includes('name=')) {
          src = src.replace(/name=[a-zA-Z0-9_]+/, 'name=large')
        }
        mediaMarkdown += `\n![image-${index + 1}](${src})\n`
      })

      // 视频
      const video = tweet.querySelector('[data-testid="videoPlayer"] video')
      if (video && video.poster) {
        mediaMarkdown += `\n![video-poster](${video.poster})\n> [包含视频/GIF]`
      }
      
      // 链接和时间
      const timeNode = tweet.querySelector('time')
      const publishedTime = timeNode ? timeNode.getAttribute('datetime') : new Date().toISOString()
      const statusLink = tweet.querySelector('a[href*="/status/"]')
      const url = statusLink ? statusLink.href : window.location.href

      // 组装 Markdown
      const content = `${text}\n\n${mediaMarkdown}`.trim()
      
      return {
        url,
        title: `Tweet from ${authorName} (${authorHandle})`,
        content, // 直接返回 Markdown
        excerpt: text.substring(0, 100),
        meta: {
          author: authorName,
          publishedTime,
          siteName: 'Twitter'
        },
        isTweet: true, // 标记为推文
        tweetData: {
          authorName,
          authorHandle,
          publishedTime
        },
        wordCount: content.length,
        extractedAt: new Date().toISOString()
      }
    } catch (e) {
      console.error('Twitter extraction failed:', e)
      return null
    }
  }

  // 获取选中文本
  window.__opencode_getSelection = function() {
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

  console.log('[OpenCode] Content extractor loaded')
})()

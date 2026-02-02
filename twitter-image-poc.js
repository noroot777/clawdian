// 改进版：支持图片提取的 Twitter 抓取验证脚本
(function verifyTwitterWithImages() {
    // 1. 查找推文
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (tweets.length === 0) {
        console.error("❌ 未找到推文");
        return;
    }

    const tweet = tweets[0];
    console.log("正在解析推文...");

    // 2. 基础信息提取
    const textNode = tweet.querySelector('[data-testid="tweetText"]');
    const content = textNode ? textNode.innerText : "";
    
    const userNode = tweet.querySelector('[data-testid="User-Name"]');
    const authorRaw = userNode ? userNode.innerText.split('\n') : ["Unknown"];
    const authorName = authorRaw[0];

    // 3. --- 图片/媒体提取逻辑 ---
    let mediaMarkdown = "";
    
    // A. 查找静态图片 (通常在 tweetPhoto 容器中)
    const photos = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
    if (photos.length > 0) {
        console.log(`📷 发现 ${photos.length} 张图片`);
        photos.forEach((img, index) => {
            // 获取最高质量图片链接 (替换 name=xxx 为 name=large)
            let src = img.src;
            if (src.includes('name=')) {
                src = src.replace(/name=[a-zA-Z0-9_]+/, 'name=large');
            }
            mediaMarkdown += `\n![image-${index + 1}](${src})\n`;
        });
    }

    // B. 查找视频封面 (如果需要)
    const video = tweet.querySelector('[data-testid="videoPlayer"] video');
    if (video && video.poster) {
        console.log(`🎥 发现视频封面`);
        mediaMarkdown += `\n![video-poster](${video.poster})\n> [包含视频]`;
    }

    // 4. 组装 Markdown
    const statusLink = tweet.querySelector('a[href*="/status/"]');
    const url = statusLink ? statusLink.href : window.location.href;

    const fullMarkdown = `---
created: ${new Date().toISOString()}
source: ${url}
author: ${authorName}
---

${content}

${mediaMarkdown}

> [原推文](${url})
`;

    // 5. 生成 Obsidian URI
    const fileName = `Tweet - ${authorName} - ${Date.now()}`;
    // 注意：URI 长度有限制，如果图片太多或文本太长，浏览器可能会截断
    const obsidianUrl = `obsidian://new?name=${encodeURIComponent(fileName)}&content=${encodeURIComponent(fullMarkdown)}`;

    console.log("--- 最终 Markdown ---");
    console.log(fullMarkdown);
    console.log("----------------");
    console.log("%c 点击测试导入 (带图片) -> ", "color: #00bcd4; font-size: 14px; font-weight: bold;", obsidianUrl);

})();

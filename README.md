# OpenCode Browser Extension

OpenCode 浏览器客户端 - 在浏览器中与 OpenCode AI 对话，支持网页内容提取和插件系统。

## 功能特性

- **AI 对话** - 连接本地 OpenCode 服务器，进行对话式交互
- **网页提取** - 自动提取当前页面内容（使用 Readability + Turndown 转换为 Markdown）
- **会话管理** - 支持会话持久化和一键新建会话
- **插件系统** - 可扩展的插件架构，内置 Obsidian 插件
- **跨平台** - 自动适配 Windows/macOS/Linux 文件路径
- **主题切换** - 自动跟随系统亮色/暗色主题

## 快速开始

### 1. 启动 OpenCode 服务器

```bash
opencode serve --port 4097 --cors "*"
```

> 生产环境建议使用具体的扩展 ID：`--cors chrome-extension://<YOUR_EXTENSION_ID>`

### 2. 安装扩展

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `opencode-extension` 文件夹

### 3. 配置

1. 点击扩展图标，打开 Popup
2. 点击右上角设置按钮 ⚙️
3. 配置 OpenCode 服务器地址（默认 `http://localhost:4096`）
4. 配置 Obsidian Vault 路径（如需使用 Obsidian 插件）

## 使用方法

### 基础对话

1. 点击浏览器工具栏的 OpenCode 图标
2. 输入问题或指令
3. 勾选「附带当前页面内容」可将网页内容一并发送给 AI

### 会话管理

- **继续对话** - 默认复用上次会话，保持上下文连续
- **新建会话** - 点击右上角 `+` 按钮开始新对话

### Obsidian 插件

将网页内容保存到 Obsidian vault：

1. 在设置中配置 Vault 路径和保存文件夹
2. 点击插件栏的 Obsidian 图标
3. 选择操作：
   - **保存当前页面** - 完整保存页面内容
   - **保存并总结** - AI 总结后保存
   - **保存选中内容** - 仅保存选中部分

保存的文件包含 YAML frontmatter：

```yaml
---
title: "页面标题"
source: "https://example.com/article"
date: 2024-01-15
tags: [web-clip]
---
```

## 项目结构

```
opencode-extension/
├── manifest.json          # Chrome Manifest V3 配置
├── background.js          # Service Worker (页面内容提取代理)
├── popup/
│   ├── index.html         # 主界面
│   ├── styles.css         # 样式 (380x520px, 支持亮/暗主题)
│   └── app.js             # 应用逻辑
├── content/
│   └── extractor.js       # 页面内容提取脚本
├── lib/
│   ├── readability.min.js # Mozilla Readability (正文提取)
│   └── turndown.min.js    # HTML to Markdown 转换
└── icons/
    ├── icon.svg           # 图标源文件
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## API 依赖

扩展通过 HTTP 与 OpenCode 服务器通信：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/global/health` | GET | 健康检查，获取版本信息 |
| `/session` | POST | 创建新会话 |
| `/session/:id/message` | POST | 发送消息 |
| `/session/:id/abort` | POST | 中止当前请求 |

## 开发

扩展使用纯 JavaScript，无需构建步骤。

```bash
# 修改代码后，在 chrome://extensions/ 点击刷新按钮即可
```

### 添加新插件

1. 在 `popup/index.html` 的 `.plugin-grid` 中添加插件按钮
2. 在 `popup/app.js` 的 `showPluginPanel()` 中添加插件面板内容
3. 在 `executePluginAction()` 中实现插件逻辑

### 图标生成

如需重新生成图标：

```bash
# 使用 ImageMagick
cd icons
magick convert -background none icon.svg -resize 16x16 icon-16.png
magick convert -background none icon.svg -resize 32x32 icon-32.png
magick convert -background none icon.svg -resize 48x48 icon-48.png
magick convert -background none icon.svg -resize 128x128 icon-128.png
```

## 技术栈

- **Chrome Extension Manifest V3**
- **Mozilla Readability** - 网页正文提取
- **Turndown** - HTML 转 Markdown
- **OpenCode HTTP API** - AI 后端

## License

MIT

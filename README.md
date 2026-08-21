# TagHit

多源内容标记与管理系统：将本地媒体文件、网页剪藏、书签与笔记碎片统一纳入一套标签体系，通过搜索实现跨来源的内容发现。

> 📖 架构与设计文档见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 功能

- **工作区**：多个工作区，各自独立管理目录集合与标签体系
- **标签体系**：全局标签池 + 工作区声明机制、层级标签
- **扫描与索引**：增量扫描、内容哈希去重、目录/文件增删自动同步、可逆脱离
- **虚拟化网格**：瀑布流 / 网格 / 列表三种布局，万级条目流畅滚动
- **缩略图**：懒生成（图片缩放 / 视频抓帧），不直出原图
- **全局搜索**：跨工作区关键词 + `@标签` + `type:` 过滤
- **条目详情**：原始分辨率预览（超出自动缩小）、媒体信息、标签挂载
- **浏览器式外壳**：多标签页（主页 / 工作区 / 条目 / 设置）+ 左右活动栏
- **插件**：`resources/plugins` 目录即放即用（示例：hello）

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 33 |
| 主进程 | Node.js + TypeScript |
| 前端 | Vue 3 + Pinia + Vue Router + Tailwind CSS |
| 数据库 | better-sqlite3（WAL 双连接） |
| 构建 | electron-vite + electron-builder |

## 快速开始

```bash
npm install
npm run dev         # 开发模式
npm run typecheck   # 类型检查
npm run build       # 构建
npm run build:win   # 打包 Windows 安装包
```

> 国内网络下载 Electron 二进制前可先设镜像：`$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`

## 数据

- 数据库：`{userData}/taghit.db`（SQLite，WAL）
- 缩略图：`{userData}/thumbnails/`
- 配置：`{userData}/config.json`

## 许可

[MIT](LICENSE)

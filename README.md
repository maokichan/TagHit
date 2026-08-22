# TagHit

多源内容标记与管理系统：将本地媒体文件、网页剪藏、书签与笔记碎片统一纳入一套标签体系，通过搜索实现跨来源的内容发现。

> 📖 文档索引：
> - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与进展
> - [docs/PLUGIN-ARCH.md](docs/PLUGIN-ARCH.md) — 插件系统架构演进 RFC
> - [docs/API.md](docs/API.md) — 领域服务 API 索引
> - [docs/USAGE.md](docs/USAGE.md) — 用户使用指南
> - [docs/DECISIONS.md](docs/DECISIONS.md) — 决策记录

## 功能

- **工作区**：多个工作区，各自独立管理目录集合与标签体系
- **标签体系**：全局标签池 + 工作区声明机制、层级标签、**标签筛选**（左侧标签面板点击即筛，多标签交集）
- **扫描与索引**：增量扫描、内容哈希去重、目录/文件增删自动同步、可逆脱离、缺失标记
- **虚拟化网格**：瀑布流 / 网格 / 列表三种布局，万级条目流畅滚动
- **缩略图**：懒生成（图片缩放 / 视频抓帧），不直出原图
- **搜索**：工作区过滤（关键词 + 标签 + 媒体类型）+ 开始界面全局搜索 DSL（`@标签` `type:` 日期范围）
- **条目详情**：原始分辨率预览（超出自动缩小，靠左自适应）、媒体信息、标签挂载、**文本内联预览**（≤2MB）、**系统应用打开**兜底（专业格式）
- **浏览器式外壳**：多标签页（主页 / 工作区 / 条目 / 设置，主页单例，侧键返回不误入主页）+ 左右活动栏 + 状态栏
- **功能组件框架**：显示面板 / 设置页按注册表渲染（每个功能组件独立声明 + 实现 + 配置 schema，配置单一来源）
- **日志**：分级日志落盘（`{userData}/logs/taghit.log`，1MB 滚动）
- **插件**：`resources/plugins` 目录即放即用（示例：hello）

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 33 |
| 主进程 | Node.js + TypeScript（领域服务层：ItemService / WorkspaceService / TagService / SearchService） |
| 前端 | Vue 3 + Pinia + Vue Router + Tailwind CSS |
| 数据库 | better-sqlite3（WAL 双连接） |
| 构建 | electron-vite + electron-builder |

## 快速开始

```bash
npm install
npm run dev         # 开发模式
npm run typecheck   # 类型检查
npm run build       # 构建
npm run release:win # Windows Release 一键打包（国内镜像 + 跳过资源编辑，普通终端可用）
```

> - `npm run release:win:full`：完整打包（需**管理员终端**，可含自定义图标/版本信息，需先在 `electron-builder.yml` 配置 `win.icon`）
> - 国内网络下载 Electron 二进制前可先设镜像：`$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`

## 数据

- 数据库：`{userData}/taghit.db`（SQLite，WAL）
- 缩略图：`{userData}/thumbnails/`
- 配置：`{userData}/config.json`
- 日志：`{userData}/logs/taghit.log`

## 许可

[MIT](LICENSE)

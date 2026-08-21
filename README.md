# TagHit（Electron 重构版）

> 多源内容标记与管理系统（"第二大脑"）：把本地媒体文件、网页剪藏、书签、笔记碎片统一纳入一套标签体系，通过搜索与 AI 辅助做跨来源的内容发现。
> 本仓库是 **Electron + Node.js** 重构版，取代旧 Tauri 2 + Vue3 + Rust 实现（已冻结于 `../freeze/TagHit`，仅作参考）。

> 📖 **架构与代码思路详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**（架构图、模块思路、关键决策、坑与教训、功能状态、下一步）。

## 为什么从 Tauri 迁到 Electron

- TagHit 是**生态敏感、非性能敏感**的应用；插件系统（未来核心）本质需要 Node 运行时与 JS 生态。
- 旧方案"薄后端 + 插件压前端 + Rust 中间翻译层 + 独立 node sidecar"是自造的三层壳；Electron 天生就是 `main(Node) + preload + renderer(Chromium)`，少一层、白送双生态。
- 详见 `../freeze/TagHit/docs/TAGHIT.md` 与 `../freeze/TagHit/新建 文本文档.md` 的讨论。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 33（跨平台 Win/macOS/Linux） |
| 主进程 | Node.js + TypeScript（全部业务逻辑，承接原 Rust `crates/core`） |
| 前端 | Vue 3 + Pinia + Vue Router + Tailwind v3（重写） |
| 数据库 | better-sqlite3（WAL 双连接，沿用已验证 schema） |
| 哈希 | hash-wasm（xxHash64，前 64KB） |
| 元数据 | image-size（图片）+ ffprobe 子进程（音视频） |
| 构建 | electron-vite + electron-builder |
| 本地预览 | 自定义 `taghit-file://` 协议（路径白名单，替代 file://） |

## 目录结构

```
src/
├── main/                  # Electron 主进程（Node.js）
│   ├── index.ts           # 入口：窗口、生命周期
│   ├── protocol.ts        # taghit-file:// 协议（路径白名单）
│   ├── events.ts          # 事件总线（扫描进度等广播）
│   ├── services/context.ts# 依赖容器
│   ├── db/                # schema.sql + 双连接 + 版本化迁移
│   ├── core/              # 业务域：tag / item / workspace(scan) / search / metadata / thumbnail
│   ├── plugins/           # 插件宿主（registry/runtime/host）
│   └── ipc/               # 类型安全 IPC 注册（通道名来自 @shared/ipc）
├── preload/               # contextBridge：window.api（类型来自 @shared/api）
├── renderer/              # Vue 3 前端（浏览器式标签页 + 缩略图网格）
│   └── src/{views,components,stores,router,styles}
└── shared/                # 三端共享：IPC 通道 / 领域类型 / api 契约 / metadata-schema
resources/plugins/         # 内置示例插件（hello）
```

## 快速开始

```bash
# 首次安装（本机有 better-sqlite3 ClangCL 编译陷阱，走三步）
npm install --ignore-scripts
npx electron-builder install-app-deps   # 为 Electron 重建 better-sqlite3
node node_modules/electron/install.js   # 下载 Electron 二进制（国内网络设镜像，见下）

# 开发
npm run dev

# 类型检查 / 构建 / 打包
npm run typecheck
npm run build
npm run build:win   # electron-builder 打 NSIS 安装包
```

国内网络下载 Electron 二进制前先设镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
```

## 功能状态（骨架已跑通，链路：工作区 → 扫描 → 列表 → 打标 → 搜索 → 插件）

- [x] 工作区 CRUD + 多目录配置 + 扫描（分块异步、事务批量、进度事件、缺失标记）
- [x] 标签 CRUD + 多父级层级（BFS 防环）+ 批量打标
- [x] 统一搜索 DSL（`@tag` / `type:` / `>date` / `<date` / `keyword`）
- [x] 媒体预览（图片/视频/音频，经 taghit-file://）+ 元数据 EAV
- [x] 插件宿主：manifest 权限清单 + Node API 注入 + 示例插件
- [x] 配置系统（theme/layout/ffmpeg/排除规则/格式映射）
- [x] 视频缩略图（Chromium 抓帧）、全文搜索（后续）、导入导出、AI 标签
- [ ] 拖出文件（webContents.startDrag）、右键菜单两层设计、自定义标题栏
- [ ] 打包分发验证（electron-builder）

## 产品原则

离线优先 · 键盘即速度 · 静默智能 · 来源透明 · 归档意识 · 插件生态是长期核心

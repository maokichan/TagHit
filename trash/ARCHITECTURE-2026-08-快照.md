# TagHit（Electron 重构版）— 项目进展与架构文档

> 记录时间：2026-08-22
> 本文档描述 `<仓库根>`（TagHit）的现状、代码思路与设计决策，供继续开发前对齐认知使用。

---

## 一、项目定位

TagHit 是一个**多源内容标记与管理系统**（"第二大脑"）：把本地媒体文件、网页剪藏、书签、笔记碎片统一纳入一套标签体系，通过搜索与 AI 辅助实现跨来源的内容发现。

目标用户：媒体从业者（管理海量素材）与个人知识管理用户。核心原则：**离线优先、键盘即速度、来源透明、归档意识、插件生态是长期核心**。

---

## 二、为什么从 Tauri 重构到 Electron

（决策依据，来自旧项目 `Managment/TagHit` 的文档与复盘）

旧项目：Tauri 2 + Vue 3 + Rust。其致命矛盾：

1. **插件系统本质需要 Node 运行时**。旧方案 v2 是 `Vue → Rust → stdio JSON-RPC → Node 宿主(node.exe sidecar) → JS 插件`：两端都是 JS，中间夹一个 Rust 翻译层纯属多余，且已准备捆绑 node.exe（+40MB）——这本身就是半个 Electron。
2. **"薄后端 + 插件压前端"在 Tauri 里无法自洽**。webview 里的 JS 不是沙箱，第三方插件放前端等于裸奔；要安全就得把插件挪到原生侧，又需要一个 JS/Node 运行时，两头堵。
3. **远期形态就是 Electron**。前端是 JS、插件是 JS（要 Node 的 fs/网络/子进程）、插件宿主是 Node → 主进程天然该是 Node.js，这正是 Electron 的 `main + preload + renderer` 架构，少一层、白送双生态。
4. **TagHit 非性能敏感**，Rust 高性能没有用武之地；UI 表现力与生态才是它真正需要的。

结论：远期必然 Electron，所以现在就重构。

---

## 三、技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 33（跨平台 Win/macOS/Linux） |
| 主进程 | Node.js + TypeScript（全部业务逻辑，承接原 Rust `crates/core`） |
| 前端 | Vue 3 + Pinia + Vue Router + Tailwind v3（重写） |
| 数据库 | better-sqlite3（WAL 双连接，沿用已验证 schema） |
| 哈希 | hash-wasm（xxHash64，只读文件前 64KB） |
| 元数据 | image-size（图片，纯 JS）+ ffprobe 子进程（音视频） |
| 构建 | electron-vite + electron-builder |
| 本地预览 | 自定义 `taghit-file://` 协议（路径白名单） |

---

## 四、目录结构

```
TagHit/
├── package.json                  # type:module；main=out/main/index.js
├── electron.vite.config.ts       # main/preload/renderer 三段构建 + @shared 别名
├── electron-builder.yml          # 打包配置（asarUnpack better-sqlite3 + resources）
├── tsconfig.json / .node.json / .web.json
├── tailwind.config.js / postcss.config.js
├── scripts/protocol-selftest.mjs # taghit-file 协议自测（真实 Electron + 隐藏窗口 + <img>）
├── resources/plugins/hello/      # 示例插件（plugin.json + index.cjs）
└── src/
    ├── shared/                   # 三端共享
    │   ├── ipc.ts                #   IPC 通道常量（唯一事实来源）+ 事件通道
    │   ├── api.ts                #   window.api 形状（preload 实现、渲染层消费）
    │   ├── url.ts                #   taghit-file:// URL 构造
    │   ├── metadata-schema.json  #   格式→字段 路由表（图片/视频/音频/文档）
    │   └── types/                #   config/item/tag/workspace/search/plugin
    ├── main/                     # Electron 主进程（Node.js）
    │   ├── index.ts              #   入口：窗口、生命周期
    │   ├── protocol.ts           #   taghit-file:// 协议（opaque 形态 + 路径白名单）
    │   ├── events.ts             #   事件总线（扫描进度等广播到渲染层）
    │   ├── env.d.ts              #   Vite `?raw` 导入类型声明
    │   ├── services/context.ts   #   依赖容器（db/config/tagService/searchService/...）
    │   ├── db/                   #   schema.sql + connection(双连接) + migrations
    │   ├── core/                 #   业务域
    │   │   ├── config.ts         #     config.json 读写（首启自建默认值）
    │   │   ├── hash.ts           #     xxHash64（前 64KB）
    │   │   ├── tag/              #     tag.dao + tag.service（声明机制 + BFS 防环）
    │   │   ├── item/             #     item.dao（列表/全局搜索/元数据/打标）
    │   │   ├── workspace/        #     workspace.dao + scan（分块异步扫描）
    │   │   ├── search/           #     parser（DSL）+ search.service
    │   │   ├── metadata/         #     extractor（image-size / ffprobe）
    │   │   └── thumbnail/        #     thumbnail.service（骨架，视频抽帧待接）
    │   ├── plugins/              #   插件宿主（registry/runtime/host）
    │   └── ipc/                  #   类型安全 IPC 注册（每域一个文件 + util）
    ├── preload/index.ts          # contextBridge 暴露 window.api（ESM -> index.mjs）
    └── renderer/                 # Vue 3 前端
        ├── index.html            # 含 CSP（img-src 含 taghit-file:）
        └── src/
            ├── main.ts           # bootstrap：pinia/router/ui.init
            ├── App.vue           # 外壳：顶部标签栏 + 主区 + 状态栏（侧栏在重构中）
            ├── router/index.ts   # /(主页) /workspace/:id /settings /item/:id
            ├── stores/           # ui / workspace / tab / item / tag
            ├── views/            # StartScreen / WorkspaceTab / Settings / ItemDetail
            └── components/       # layout / workspace / item / search / common
```

---

## 五、架构分层

```
┌────────────────────────────────────────────────────────────┐
│ Renderer (Vue 3) —— 浏览器式外壳                              │
│   顶部标签栏（主页/工作区标签） + 主内容 + 状态栏               │
│   开始界面 · 工作区标签页 · 设置 · 条目详情                    │
│        │ contextBridge（window.api，类型来自 @shared/api）     │
│        ▼                                                     │
│ Preload (index.mjs) —— 类型安全 IPC 桥                        │
│        │ ipcRenderer.invoke / on                             │
│        ▼                                                     │
│ Main (Node.js)                                               │
│   ├─ db        better-sqlite3 WAL 双连接 + 版本化迁移          │
│   ├─ core      tag/item/workspace(scan)/search/metadata/thumb │
│   ├─ plugins   插件宿主（manifest 权限 + Node API 注入）        │
│   ├─ protocol  taghit-file://（opaque + 白名单）               │
│   └─ ipc       通道常量来自 @shared/ipc（三端单一事实来源）      │
│        │                                                     │
│        ▼                                                     │
│ SQLite · 文件系统 · ffmpeg/ffprobe(子进程) · Node 插件         │
└────────────────────────────────────────────────────────────┘
```

---

## 六、各模块代码思路

### 6.1 shared —— 三端单一事实来源

- **`ipc.ts`**：所有 IPC 通道名集中定义（`IPC.workspace.scan` 等），main 的 `ipcMain.handle`、preload 的 `invoke`、渲染层的事件订阅都从这里取，杜绝"魔法字符串"漂移。
- **`api.ts`**：定义 `TaghitApi` 接口（`window.api` 的形状），preload 实现它，渲染层 `declare global { interface Window { api: TaghitApi } }` 获得全类型提示。
- **`types/`**：领域模型（Item/Tag/Workspace/...），跨 main/preload/renderer 三端共用。
- **`metadata-schema.json`**：`格式类别 → 字段定义` 的路由表，前端据此动态渲染详情面板（JSON 是"解释层"，不做建表/逻辑）。

### 6.2 main/db —— 数据层

- **双连接**：`AppDb { write, read }`，WAL 模式下扫描持有写锁时读不阻塞（吸取旧版"扫描卡死 UI"教训）。
- **版本化迁移**：`MIGRATIONS[]` 按版本顺序执行，`schema_version` 表跟踪。V1 = schema.sql（内联 `?raw`，避免运行时缺文件）；V2 = 新增 `workspace_tag` 声明表 + 全量回填。
- **schema 要点**：`item` 全局独立实体（无 workspace_id）+ `workspace_item` 关联；`item_tag` 关联**按工作区隔离**（正倒排双索引）；`item_metadata` EAV 长尾表；标签定义全局唯一。

### 6.3 标签作用域模型（2026-08-22 与用户确认）

- **标签定义全局唯一**（`tag` 表不变）。
- **新增 `workspace_tag(workspace_id, tag_id)` 声明表**：某工作区"声明"某全局标签后，该标签才在此工作区**可见/可搜索/可挂载**；声明只改变可见性，取消声明**不删除**已有 `item_tag`（重新声明即恢复）。
- **创建工作区标签 = 创建全局标签 + 自动声明到该工作区**（所以"工作区定义了某 tag → 它天然是全局的"）。
- **挂载校验**：`item.updateTags` 对 add 的每个标签校验 `isDeclared`，未声明拒绝。
- **搜索限定**：工作区内 `@标签` 只匹配已声明标签（存在但未声明 → 空结果）。
- **统一管理在设置页**（分组展示 + 每工作区声明/取消）；**工作区标签页左侧栏管理本工作区已声明标签**。

### 6.4 扫描引擎（core/workspace/scan.ts）

- 迭代式目录遍历（显式栈，防深目录栈溢出）。
- **分块异步 + 短事务**：每 500 条一批，先异步 stat/哈希收集数据，再同步短事务写入（不跨 await 持锁），每批让出事件循环（`setImmediate`），**不阻塞 Electron 主进程**。
- 哈希只读文件前 64KB（xxHash64，`hash-wasm` 纯 WASM，无原生依赖）。
- 增量模式按"大小 + mtime"跳过未变文件；结束对"此前 active、本次未见"的条目标记缺失。
- 进度经 `AppEventBus` 广播（`event:scanProgress`）→ 渲染层状态栏展示。

### 6.5 本地文件协议（protocol.ts）—— 关键坑

- 目标：渲染层 `<img>/<video>` 安全加载本地文件，替代 `file://`（受 CSP 与路径白名单约束）。
- **实测结论：不能设 `standard: true`**。standard + 空 host 的 URL（`taghit-file:///C%3A/...`）不会被路由到 `protocol.handle`，`<img>` 必失败。
- 正确形态：**opaque（非 standard）scheme**，URL 仍是 `taghit-file:///C%3A/...`（编码盘符），handler 从 `request.url` 原始字符串抠路径（去 scheme、去前导斜杠、decodeURIComponent、normalize）、白名单校验（仅工作区路径 + userData）、`net.fetch(file://)` 返回。
- 已用 `scripts/protocol-selftest.mjs`（真实 Electron + 隐藏窗口 + `<img>`）验证加载成功。

### 6.6 搜索（core/search/）

- DSL：`@tag1 @tag2 type:image >2024-01-01 <2024-12-31 workspace:1 keyword`（支持引号词组）。
- 工作区搜索：标签**倒排交集**（走 `idx_item_tag_tag`）→ 其余条件（类别/日期/关键词 LIKE）→ 分页；**未声明标签 → 空结果**。
- 全局搜索（开始界面）：跨工作区，标签命中 = 条目在任一工作区拥有该标签（`itemDao.listGlobal`），结果附带 `workspaceIds` 供详情页带上下文。

### 6.7 插件宿主（plugins/）

- **VSCode/Obsidian 式扩展架构**：单一 Node 宿主（就是主进程）加载插件，Node API 按 `plugin.json` 的 `permissions`（fs/network/shell）注入受限 `ctx`。
- 插件统一 **CommonJS（.cjs）**——项目 `type:module` 下 `.js` 会被当 ESM，`require()` 失败（示例 `resources/plugins/hello/index.cjs`）。
- 能力分级：`JSON 声明（最安全）→ JS-in-host（Node API）→ 沙箱（未来）`；数据与代码分管道。

### 6.8 IPC 与 preload

- `ipc/util.ts` 提供 `handle<TArgs,TResult>(channel, fn)` 类型安全注册。
- preload 暴露 `window.api`：workspace/item/tag/search/config/plugin/dialog 域 + `on(event)` 订阅扫描进度。
- **原生目录选择**走 `dialog:pickFolder`（Electron 原生 dialog，替代旧版依赖插件的做法）。

### 6.9 渲染层（浏览器式外壳，重写）

- **路由**：`/`(主页/开始界面) · `/workspace/:id`(工作区标签页) · `/settings`(设置全屏) · `/item/:id`(条目详情)。
- **tab store**：主页是显式标签页（`key='home'`，不可关闭、置首）；工作区标签可拖拽排序、可关闭；`"+"` 新建标签页 = 返回/创建主页标签；全部工作区标签关闭回主页。
- **开始界面**：全局搜索栏置顶（仅搜索栏）→ 未搜索时显示工作区瀑布流卡片（含"新建工作区"卡片，**唯一创建入口**）。
- **工作区标签页**：主区 = 顶部搜索栏（过滤当前工作区）+ 缩略图网格（瀑布流/网格/列表三模式，CSS columns/grid）。
- **设置页**：外观（主题/布局）· 媒体（ffmpeg/缩略图参数/排除规则）· 工作区管理（重命名/删除/路径）· 统一标签管理（全局池 + 声明 + 层级）。
- **守卫坑**：`App.vue` 曾 watch `route.params.id`，误伤 `/item/:id`（条目路由也用 `:id`）导致点开条目被重定向回主页；**必须限定 `route.name === 'workspace'` 才触发守卫**。
- **条目详情**：图片/视频/音频经 `taghit-file://` 预览；标签挂载只列当前工作区已声明标签；工作区上下文优先取 `route.query.workspace`（全局搜索结果），否则用当前活动工作区标签。

### 6.10 状态栏

- 展示扫描进度 / 最近一次扫描结果 / 插件数量；主题切换已收敛到设置页（不散落）。

---

## 七、关键坑与教训

| 坑 | 原因 | 解法 |
|---|---|---|
| better-sqlite3 源码编译失败 | 本机 node-gyp 选了 ClangCL 工具集而 VS 没装（根因未完全定位，node-gyp 9.4.1 源码无 ClangCL） | 安装用三步：`npm i --ignore-scripts` → `npx electron-builder install-app-deps`（走 Electron 预编译）→ `node node_modules/electron/install.js` |
| Electron 二进制下载卡死 | GitHub 网络不通 | `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'` |
| preload 产物为 `index.mjs` | `type:module` 项目 | main 里引用 `../preload/index.mjs` |
| 插件 `.js` 被当 ESM | `type:module` 作用域 | 插件统一 `.cjs` |
| `taghit-file://` 图片加载失败 | `standard: true` 空 host 不路由到 handler | opaque scheme（见 §6.5） |
| 点开条目被重定向回主页 | 守卫 watch `route.params.id` 误伤条目路由 | 限定 `route.name==='workspace'` |

---

## 八、当前功能状态

✅ 已打通（骨架到可运行）：
- 工作区 CRUD + 多目录配置 + 扫描（异步分块、事务批处理、进度事件、缺失标记）
- 标签：全局池 + 工作区声明机制（`workspace_tag`）、BFS 防环、批量打标、挂载校验
- 搜索：工作区 DSL（声明限定）+ 开始界面跨工作区全局搜索
- 媒体预览（图片/视频/音频，经 taghit-file://）+ 元数据 EAV（image-size / ffprobe）
- 插件宿主：manifest 权限 + Node API 注入 + hello 示例
- 配置系统（theme/layout/ffmpeg/排除规则/格式映射）
- 浏览器式外壳：主页标签 + 可拖拽工作区标签 + 设置页 + 开始界面 + 条目详情
- 类型检查、electron-vite 构建、dev 启动全部通过

⬜ 未完成 / 待办：
- **VSCode 式活动栏重构（进行中，被本次"停止"打断）**：左/右活动栏（竖向图标条，收回状态也显示工具与未来插件图标）；"路径"与"标签"拆为两个独立工具，各自占据整个侧栏面板；点击活动栏图标开/关对应面板
- 视频缩略图（ffmpeg 抽帧，`ThumbnailService` 已留接口）
- 拖出文件到其他程序（`webContents.startDrag`）
- 打包分发验证（`npm run build:win`）
- better-sqlite3 升级到 13.x 以消除本机三步安装的别扭
- 网页剪藏 / AI 自动标签 / 全文搜索 / 导入导出（旧 P1/P2）
- **i18n 骨架已落地（D50/D51）**：vue-i18n 接入（zh-CN 底 + en，回落中文）+ 插件文案映射契约；存量文案抽取与错误码按语言取句待批次

---

## 九、下一步建议顺序

1. 完成 VSCode 式活动栏重构（路径/标签拆工具 + 活动栏图标 + 插件图标位）
2. 视频缩略图（ffmpeg 抽帧）
3. 拖出文件（webContents.startDrag）
4. 打包验证 + better-sqlite3 升级
5. i18n 存量文案抽取（骨架与插件契约已落地，D50/D51）
6. P1/P2 功能逐项推进（剪藏 / AI / 全文搜索 / 导入导出）

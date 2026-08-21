# TagHit（Electron 重构版）— 项目进展与架构文档

> 记录时间：2026-08-23
> 本文档描述 `d:\PROJECT\TagHit` 的现状、代码思路与设计决策，供继续开发前对齐认知使用。

---

## 一、项目定位

TagHit 是一个**多源内容标记与管理系统**：把本地媒体文件、网页剪藏、书签、笔记碎片统一纳入一套标签体系，通过搜索与 AI 辅助实现跨来源的内容发现。

目标用户：媒体从业者（管理海量素材）与个人知识管理用户。核心原则：**离线优先、键盘即速度、来源透明、归档意识、插件生态是长期核心**。

---

## 二、为什么从 Tauri 重构到 Electron

（决策依据，来自已冻结的旧项目 `../freeze/TagHit` 的文档与复盘）

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
    │   │   └── thumbnail/        #     thumbnail.service（缩略图目录/落盘/判存；抓帧在渲染层缩略图管线）
    │   ├── plugins/              #   插件宿主（registry/runtime/host）
    │   └── ipc/                  #   类型安全 IPC 注册（每域一个文件 + util）
    ├── preload/index.ts          # contextBridge 暴露 window.api（ESM -> index.mjs）
    └── renderer/                 # Vue 3 前端
        ├── index.html            # 含 CSP（img-src 含 taghit-file:）
        └── src/
            ├── main.ts           # bootstrap：pinia/router/ui.init
            ├── App.vue           # 外壳：TabBar + 左/右活动栏 + 工具面板 + 主区 + StatusBar
            ├── router/index.ts   # /(主页) /workspace/:id /settings /item/:id
            ├── stores/           # ui / workspace / tab / item / tag
            ├── views/            # StartScreen / WorkspaceTab / Settings / ItemDetail
            └── components/       # layout(ActivityBar/InfoPanel/PluginsPanel/TabBar/StatusBar)
                                  # workspace(PathsPanel/TagsPanel) / item / search / common
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
- **版本化迁移**：`MIGRATIONS[]` 按版本顺序执行，`schema_version` 表跟踪。V1 = schema.sql（内联 `?raw`，避免运行时缺文件）；V2 = 新增 `workspace_tag` 声明表 + 全量回填；V3 = `workspace.cover_path`（工作区封面，见 §八）。
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
- 增量模式按"大小 + mtime"跳过未变文件。
- **缺失语义（2026-08-22 修订）**：扫描收尾 `finalizeScanStatus` 按现实状态处理未出现条目——已不在任何配置路径下（路径被移除/收窄）→ 从工作区脱离（保留全局条目/标签/元数据，可重加路径恢复）；在路径内但文件未出现：所在目录还在 → 标缺失，目录也消失 → 脱离。目录存在性按父目录批量缓存判存。
- **路径移除（2026-08-22）**：UI 原生确认框（`dialog:confirm`）确认后，`removePath` 同步把该路径下条目从工作区脱离，不再标缺失。
- **元数据提取接入（2026-08-22）**：扫描时对"新增或内容哈希变化"的条目提取元数据（图片 image-size / 音视频 ffprobe），并回填缺失宽高的图片条目（image-size 快，视频 ffprobe 慢仅随变更）。`item_metadata` 从此有数据，宽高随列表查询附带（`ItemWithTags.width/height`），供比例瀑布流与信息面板使用。
- **自动扫描（2026-08-22）**：路径面板添加/移除目录后自动触发扫描；扫描按钮并入搜索栏（右侧），工作区标题从主区移除（标签页已有）。
- 进度经 `AppEventBus` 广播（`event:scanProgress`）→ 渲染层状态栏展示；扫描结果含 `filesDetached` 脱离数（仅数据层统计，不展示状态）。
- **孤儿条目自动清理（2026-08-22）**：脱离策略为"保留全局条目可逆恢复"，但每次扫描检查孤儿（无任何工作区关联的条目），**超过 2000 条阈值时批量删除**（FK 级联清理标签/元数据/关联），防止十万级规模下库膨胀；阈值内保留以支持"重加路径即恢复"。

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

### 6.9 渲染层（浏览器式外壳 + VSCode 式活动栏）

- **路由**：`/`(主页/开始界面) · `/workspace/:id`(工作区标签页) · `/settings`(设置全屏) · `/item/:id`(条目详情)。
- **tab store（2026-08-23 修订）**：主页标签**可多开**（`key='home:N'`，可关闭），`"+"` 每次新建标签页都进入一个全新的首页；**点击首页工作区卡片 = 当前标签直接变成该工作区**（不新增标签，`openWorkspace` 原位替换；若该工作区已存在于其他标签则关闭当前标签激活已有，避免重复）；**条目标签页**（`kind='item'`）：工作区双击 / 首页全局搜索结果 / 信息面板"打开详情"均**新开条目标签**（`openItem`，当前标签不受影响，同条目已有标签则激活并更新上下文）；工作区标签可拖拽排序、可关闭；关闭最后一个标签自动新建主页标签（标签栏始终非空）。
- **VSCode 式活动栏（2026-08-22 重构完成）**：左右两条竖向图标条（`ActivityBar.vue`，永久可见，宽 44px）；左 = 路径/标签两个独立工具面板（`PathsPanel`/`TagsPanel`，替代原合并侧栏），右 = 媒体信息（`InfoPanel`）/插件（`PluginsPanel`）；**每侧同时只开一个面板**（点当前图标关闭，点其他图标切换，互斥单开）；面板宽 256px 固定。
- **条目选中联动**：工作区网格中单击卡片 = 选中（高亮 + 右侧信息面板展示元数据，`itemStore.select` 异步补全 EAV），双击或信息面板"打开详情"按钮进入详情页；主页全局搜索结果保持单击打开详情。
- **开始界面（2026-08-23）**：居中三元素（搜索框 → `TagHit` 标题 → 工作区栏）；工作区栏右侧"新建"按钮点击展开内联输入行（输入名称 + 创建/取消，Enter 创建）；工作区卡片带封面（内部自动取图/用户自选，可全局关闭）。
- **工作区标签页**：主区 = 顶部搜索栏（过滤当前工作区）+ 虚拟化缩略图网格（瀑布流 JS 列分配 / 网格 / 列表，见 §八 虚拟化）。
- **设置页**：外观（主题/布局）· 媒体（ffmpeg/缩略图参数/排除规则）· 工作区管理（重命名/删除/路径）· 统一标签管理（全局池 + 声明 + 层级）。
- **守卫坑**：`App.vue` 曾 watch `route.params.id`，误伤 `/item/:id`（条目路由也用 `:id`）导致点开条目被重定向回主页；**必须限定 `route.name === 'workspace'` 才触发守卫**。
- **条目详情（2026-08-23 重构）**：整体左中右三区——**左**：媒体内容按**原始分辨率**显示（超出可视区自动等比缩小，无滚动条）；**中**（内容页内固定列）：**媒体信息**（原右侧边栏的"媒体信息"工具移入此处）+ **标签挂载**；**右**：右侧活动栏保留（仅**插件**工具，媒体信息不再作为边栏工具出现在详情页）。"返回"= 关闭当前条目标签回到活动标签。媒体经 `taghit-file://` 预览；标签挂载只列当前工作区已声明标签；工作区上下文优先取 `route.query.workspace`（全局搜索结果），否则用当前活动工作区标签。
- **主题（2026-08-23）**：`dark / light / system` 三档；`system` 通过 `prefers-color-scheme` 实时解析并监听系统主题变化（`ui.ts: matchMedia`）。

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
| 瀑布流卡片全部整行占满（"每图一行一列"） | `ItemCard` 根自带 `relative`，父级再传 `absolute` → Tailwind 中 `relative` 后声明胜出，绝对定位失效回退文档流 | 瀑布流外包一层绝对定位容器，卡片不再接收定位类 |
| 网格卡顿/内存暴涨 | 网格直接加载**原图**（无缩略图），视口内多张全分辨率图同时解码 | 懒缩略图管线（见 §八 懒缩略图）；`loading="lazy"` 只省流量不解码内存 |
| 视频缩略图 canvas 污染 | opaque scheme 无 CORS → drawImage 后 toBlob 抛 SecurityError | 协议加 `corsEnabled` + `Access-Control-Allow-Origin: *`，媒体元素 `crossOrigin='anonymous'` |
| 视频 seek 慢/整文件下载 | 协议不处理 Range | handler 解析 `Range` 头返回 206 切片 + `Accept-Ranges` |
| 缩略图缓存目录无效 | `process.env.TAGHIT_DATA_DIR` 从未设置，`join('', 'thumbnails')` 写错位置 | 改用 `app.getPath('userData')/thumbnails` |
| 删除确认框"未点确认即删除" | `defaultId: 1`（确定）在 Windows 上回车即触发 | `defaultId: 0`（取消为默认焦点），回车/Esc 均取消 |

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
- **VSCode 式活动栏**：左（路径/标签/**显示**）/右（媒体信息/插件）竖向图标条 + 互斥单开面板；网格单击选中条目 → 右侧信息面板展示元数据
- **显示面板（2026-08-22）**：左活动栏第三个工具"显示"——媒体类型筛选（自搜索栏移入）、排序（最近更新/名称/大小/修改时间/添加时间/类型 × 升降序，后端白名单 ORDER BY）、布局（瀑布流/网格/列表）、卡片标题显隐（同步设置页，持久化到 config.showTitles）
- **比例瀑布流（2026-08-22）**：图片卡片按真实宽高比渲染（元数据 width/height，钳制 [1/2.2, 2.2] 防止极端横幅/竖幅撑开），视频/音频/文档保持固定比例
- **虚拟化（2026-08-22）**：网格只渲染视口内 ±800px 的卡片——瀑布流用 JS 列分配 + 绝对定位（追加新页不动旧卡片，解决加载跳动），网格/列表用均匀行切片；卡片信息区固定高度保证布局高度精确。**滚动容器测量须 watch `scrollEl` 出现（条目异步加载后才渲染），仅 onMounted 测量会致首屏空渲染**
- **工作区封面（2026-08-22，迁移 V3）**：`workspace.cover_path` 列；开始界面卡片显示封面——用户指定优先（设置页选择图片/恢复自动，白名单外图片自动复制进 `{userData}/covers`），否则自动取工作区内第一张图（缩略图 → 原图）；路径文字不再展示；`config.showWorkspaceCovers` 可全局关闭
- **懒缩略图（2026-08-22）**：网格**永不直出原图**（扫描 previewUri=null；列表查询过滤非缩略图路径）。卡片进入视口时经并发队列（上限 3）懒生成——图片 fetch→createImageBitmap→canvas 缩放；视频 `<video crossOrigin=anonymous>` 经协议 Range seek 抓关键帧；生成后经 `thumbnail:save` IPC 落盘（`{userData}/thumbnails/{hash}.jpg`）并回写 preview_uri。规避 ffmpeg 许可与原生依赖
- **协议增强（2026-08-22）**：`taghit-file://` 增加 Range 206 切片（音视频 seek 不再整文件传输）+ `Access-Control-Allow-Origin` 头（canvas 抓帧不被污染）+ `corsEnabled` 特权；CSP 放行 `blob:` 与 `connect-src taghit-file:`
- **设置作为标签页**（2026-08-22）：设置图标开/关设置标签，可关闭、可退出
- **网格分页加载**（2026-08-22）：每页 120 条，滚动触底自动加载 + "加载更多"按钮（修复大库"内容在库但显示不下"）
- **拖拽优化**（2026-08-22）：标签栏与活动栏拖拽均有插入指示线视觉反馈；活动栏图标顺序可拖拽调整并持久化（localStorage）
- **路径移除确认 + 缺失语义**（2026-08-22）：原生确认框；移除路径即脱离条目；仅"目录在、文件没"才标缺失
- **详情页与主页重构**（2026-08-23）：条目详情左中右三区——左：媒体**自然尺寸**预览（超出可视区自动等比缩小，无滚动条）；中：媒体信息 + 标签挂载（原边栏"媒体信息"工具移入内容页）；右：右侧活动栏保留（仅插件）。**进入详情 = 新开条目标签**（工作区双击 / 全局搜索点击 / 信息面板打开详情，`openItem`，不占用当前标签）。主页居中三元素（搜索框 → TagHit 标题 → 工作区栏），"新建"按钮内联输入，**点击工作区 = 当前标签变为该工作区**，`"+"` 每次新开一个干净首页；主题新增 **system**（`prefers-color-scheme` 实时解析并监听系统切换，`ui.ts: matchMedia`）
- 类型检查、electron-vite 构建、dev 启动全部通过

⬜ 未完成 / 待办：
- 拖出文件到其他程序（`webContents.startDrag`）
- 打包分发验证（`npm run build:win`）
- better-sqlite3 升级到 13.x 以消除本机三步安装的别扭
- 活动栏细节打磨：面板宽度拖拽、快捷键开合、插件图标随注册动态出现
- 排序进阶：日期范围筛选、多标签组合筛选 UI、全局搜索也接排序
- 网页剪藏 / AI 自动标签 / 全文搜索 / 导入导出（旧 P1/P2）
- **i18n 国际化**（与用户待讨论）

---

## 九、下一步建议顺序

1. 拖出文件（webContents.startDrag）
2. 打包验证 + better-sqlite3 升级
3. 活动栏细节打磨（宽度拖拽 / 快捷键 / 插件图标动态注册）
4. 排序与筛选进阶（日期范围 / 多标签组合 / 全局搜索排序）
5. i18n 讨论与落地
6. P1/P2 功能逐项推进（剪藏 / AI / 全文搜索 / 导入导出）

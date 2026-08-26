# TagHit（Electron 重构版）— 架构文档

> 记录时间：2026-08-23
> 本文档描述 `d:\PROJECT\TagHit` 的架构、代码思路与设计决策，供继续开发前对齐认知使用。
> 文档索引：插件 RFC [PLUGIN-ARCH.md](PLUGIN-ARCH.md) · API 索引 [API.md](API.md) · 使用指南 [USAGE.md](USAGE.md) · 交接 [CONTEXT.md](CONTEXT.md) · **待办见 `../todo`**（Bug / v0.2.0 / 远期，唯一事实来源）

---

## 一、架构分层

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

## 二、目录结构

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
    │   └── types/                #   config/item/tag/workspace/search/plugin/feature
    ├── main/                     # Electron 主进程（Node.js）
    │   ├── index.ts              #   入口：窗口、生命周期
    │   ├── protocol.ts           #   taghit-file:// 协议（opaque 形态 + 路径白名单）
    │   ├── events.ts             #   事件总线 + 领域事件类型（DomainEventName / EmitFn）
    │   ├── env.d.ts              #   Vite `?raw` 导入类型声明
    │   ├── services/context.ts   #   依赖容器（db/config/各 Service/pluginHost，共享实例）
    │   ├── db/                   #   schema.sql + connection(双连接) + migrations
    │   ├── core/                 #   业务域（领域服务层 + DAO，规则唯一归属，P0.5 收拢）
    │   │   ├── config.ts         #     ConfigService（config.json 读写合并）
    │   │   ├── logger.ts         #     Logger（分级日志：控制台 + {userData}/logs，1MB 滚动）
    │   │   ├── path-util.ts      #     路径工具（normPath / isUnderPath，消除 DAO 交叉依赖）
    │   │   ├── hash.ts           #     xxHash64（前 64KB）
    │   │   ├── tag/              #     tag.service（声明机制 + BFS 防环）+ tag.dao
    │   │   ├── item/             #     item.service（排序白名单 SortKeyRegistry/声明校验/格式映射/原图策略/readText/openWithSystem）+ item.dao
    │   │   ├── workspace/        #     workspace.service（扫描入口/缺失语义/封面策略/脱离决策）+ workspace.dao + scan
    │   │   ├── search/           #     parser（DSL）+ search.service（解释/组装；倒排交集下沉 DAO）
    │   │   ├── metadata/         #     extractor（image-size / ffprobe）
    │   │   └── thumbnail/        #     thumbnail.service（缩略图目录/落盘/判存）
    │   ├── plugins/              #   插件宿主（registry/runtime/host）
    │   └── ipc/                  #   类型安全 IPC 注册（每域一个文件 + util，薄传输层无业务逻辑）
    ├── preload/index.ts          # contextBridge 暴露 window.api（ESM -> index.mjs）
    └── renderer/                 # Vue 3 前端
        ├── index.html            # 含 CSP（img-src 含 taghit-file:）
        └── src/
            ├── main.ts           # bootstrap：pinia/router/ui.init + 功能组件注册/行为钩子
            ├── App.vue           # 外壳：TabBar + 左/右活动栏 + 工具面板 + 主区 + StatusBar + 路由守卫
            ├── router/index.ts   # /(主页) /workspace/:id /settings /item/:id
            ├── stores/           # ui / workspace / tab / item / tag
            ├── features/         # 功能组件（registry + display/·keyboardMouse· 独立目录 + lib/format）
            ├── views/            # StartScreen / WorkspaceTab / Settings / ItemDetail
            └── components/       # layout(ActivityBar/InfoPanel/PluginsPanel/TabBar/StatusBar)
                                  # workspace(PathsPanel/TagsPanel/DisplayPanel) / item / search
                                  # common / settings(SchemaControl)
```

---

## 三、各模块代码思路

### 3.1 shared —— 三端单一事实来源

- **`ipc.ts`**：所有 IPC 通道名集中定义（`IPC.workspace.scan` 等），main 的 `ipcMain.handle`、preload 的 `invoke`、渲染层的事件订阅都从这里取，杜绝"魔法字符串"漂移。
- **`api.ts`**：定义 `TaghitApi` 接口（`window.api` 的形状），preload 实现它，渲染层 `declare global { interface Window { api: TaghitApi } }` 获得全类型提示。
- **`types/`**：领域模型（Item/Tag/Workspace/Feature...），跨 main/preload/renderer 三端共用。
- **`metadata-schema.json`**：`格式类别 → 字段定义` 的路由表，前端据此动态渲染详情面板（JSON 是"解释层"，不做建表/逻辑）。

### 3.2 main/db —— 数据层

- **双连接**：`AppDb { write, read }`，WAL 模式下扫描持有写锁时读不阻塞（吸取旧版"扫描卡死 UI"教训）。
- **版本化迁移**：`MIGRATIONS[]` 按版本顺序执行，`schema_version` 表跟踪。V1 = schema.sql（内联 `?raw`，避免运行时缺文件）；V2 = 新增 `workspace_tag` 声明表 + 全量回填；V3 = `workspace.cover_path`（工作区封面，见 §六）。
- **schema 要点**：`item` 全局独立实体（无 workspace_id）+ `workspace_item` 关联；`item_tag` 关联**按工作区隔离**（正倒排双索引）；`item_metadata` EAV 长尾表；标签定义全局唯一。

### 3.3 标签作用域模型（2026-08-22 与用户确认）

- **标签定义全局唯一**（`tag` 表不变）。
- **新增 `workspace_tag(workspace_id, tag_id)` 声明表**：某工作区"声明"某全局标签后，该标签才在此工作区**可见/可搜索/可挂载**；声明只改变可见性，取消声明**不删除**已有 `item_tag`（重新声明即恢复）。
- **创建工作区标签 = 创建全局标签 + 自动声明到该工作区**（所以"工作区定义了某 tag → 它天然是全局的"）。
- **挂载校验**：`item.updateTags` 对 add 的每个标签校验 `isDeclared`，未声明拒绝。
- **搜索限定**：工作区内 `@标签` 只匹配已声明标签（存在但未声明 → 空结果）。
- **统一管理在设置页**（分组展示 + 每工作区声明/取消）；**工作区标签页左侧栏管理本工作区已声明标签**。

### 3.4 扫描引擎（core/workspace/scan.ts）

- 迭代式目录遍历（显式栈，防深目录栈溢出）。
- **分块异步 + 短事务**：每 500 条一批，先异步 stat/哈希收集数据，再同步短事务写入（不跨 await 持锁），每批让出事件循环（`setImmediate`），**不阻塞 Electron 主进程**。
- 哈希只读文件前 64KB（xxHash64，`hash-wasm` 纯 WASM，无原生依赖）。
- 增量模式按"大小 + mtime"跳过未变文件。
- **缺失语义（2026-08-23 修订）**：扫描收尾 `WorkspaceService.finalizeScan`（P0.5 起，原 item.dao.finalizeScanStatus 移入）按现实状态处理未出现条目——已不在任何配置路径下（路径被移除/收窄）→ 从工作区脱离（保留全局条目/标签/元数据，可重加路径恢复）；在路径内但文件未出现：所在目录还在 → 标缺失，目录也消失 → 脱离。目录存在性按父目录批量缓存判存（existsSync 判定在 service 层，DAO 只做批量 markMissing/detach）。
- **路径移除（2026-08-22）**：UI 原生确认框（`dialog:confirm`）确认后，`removePath` 同步把该路径下条目从工作区脱离，不再标缺失。
- **元数据提取接入（2026-08-22）**：扫描时对"新增或内容哈希变化"的条目提取元数据（图片 image-size / 音视频 ffprobe），并回填缺失宽高的图片条目（image-size 快，视频 ffprobe 慢仅随变更）。`item_metadata` 从此有数据，宽高随列表查询附带（`ItemWithTags.width/height`），供比例瀑布流与信息面板使用。
- **自动扫描（2026-08-22）**：路径面板添加/移除目录后自动触发扫描；扫描按钮并入搜索栏（右侧），工作区标题从主区移除（标签页已有）。
- 进度经 `AppEventBus` 广播（`event:scanProgress`）→ 渲染层状态栏展示；扫描结果含 `filesDetached` 脱离数（仅数据层统计，不展示状态）。
- **孤儿条目自动清理（2026-08-22）**：脱离策略为"保留全局条目可逆恢复"，但每次扫描检查孤儿（无任何工作区关联的条目），**超过 2000 条阈值时批量删除**（FK 级联清理标签/元数据/关联），防止十万级规模下库膨胀；阈值内保留以支持"重加路径即恢复"。

### 3.5 本地文件协议（protocol.ts）—— 关键坑

- 目标：渲染层 `<img>/<video>` 安全加载本地文件，替代 `file://`（受 CSP 与路径白名单约束）。
- **实测结论：不能设 `standard: true`**。standard + 空 host 的 URL（`taghit-file:///C%3A/...`）不会被路由到 `protocol.handle`，`<img>` 必失败。
- 正确形态：**opaque（非 standard）scheme**，URL 仍是 `taghit-file:///C%3A/...`（编码盘符），handler 从 `request.url` 原始字符串抠路径（去 scheme、去前导斜杠、decodeURIComponent、normalize）、白名单校验（仅工作区路径 + userData）、`net.fetch(file://)` 返回。
- 已用 `scripts/protocol-selftest.mjs`（真实 Electron + 隐藏窗口 + `<img>`）验证加载成功。

### 3.6 搜索（core/search/）

- DSL：`@tag1 @tag2 type:image >2024-01-01 <2024-12-31 workspace:1 keyword`（支持引号词组）。
- 工作区搜索：标签**倒排交集**（走 `idx_item_tag_tag`）→ 其余条件（类别/日期/关键词 LIKE）→ 分页；**未声明标签 → 空结果**。
- 全局搜索（开始界面）：跨工作区，标签命中 = 条目在任一工作区拥有该标签（`itemDao.listGlobal`），结果附带 `workspaceIds` 供详情页带上下文。

### 3.7 插件宿主（plugins/）

- **VSCode/Obsidian 式扩展架构**：单一 Node 宿主（就是主进程）加载插件，Node API 按 `plugin.json` 的 `permissions`（fs/network/shell）注入受限 `ctx`。
- 插件统一 **CommonJS（.cjs）**——项目 `type:module` 下 `.js` 会被当 ESM，`require()` 失败（示例 `resources/plugins/hello/index.cjs`）。
- 能力分级：`JSON 声明（最安全）→ JS-in-host（Node API）→ 沙箱（未来）`；数据与代码分管道。

### 3.8 IPC 与 preload

- `ipc/util.ts` 提供 `handle<TArgs,TResult>(channel, fn)` 类型安全注册。
- preload 暴露 `window.api`：workspace/item/tag/search/config/plugin/dialog 域 + `on(event)` 订阅扫描进度。
- **原生目录选择**走 `dialog:pickFolder`（Electron 原生 dialog，替代旧版依赖插件的做法）。

### 3.9 渲染层（浏览器式外壳 + VSCode 式活动栏）

- **路由**：`/`(主页/开始界面) · `/workspace/:id`(工作区标签页) · `/settings`(设置全屏) · `/item/:id`(条目详情)。
- **tab store（2026-08-23 修订 v2）**：主页标签**单例**（用户决策，v0.1.2 落地）——`"+"` 激活已有主页标签，没有才新建；主页只在"无多余标签页"或"新建标签页"时出现；App.vue 守卫拦截 `/` 越权路由（鼠标侧键后退不进入主页）。**点击首页工作区卡片 = 当前标签直接变成该工作区**（不新增标签，`openWorkspace` 原位替换；若该工作区已存在于其他标签则关闭当前标签激活已有，避免重复）；**条目标签页**（`kind='item'`）：工作区双击 / 首页全局搜索结果 / 信息面板"打开详情"均**新开条目标签**（`openItem`，当前标签不受影响，同条目已有标签则激活并更新上下文）；工作区标签可拖拽排序、可关闭；关闭最后一个标签自动新建主页标签（标签栏始终非空）。
- **VSCode 式活动栏（2026-08-22 重构完成）**：左右两条竖向图标条（`ActivityBar.vue`，永久可见，宽 44px）；左 = 路径/标签/显示三个独立工具面板（`PathsPanel`/`TagsPanel`/`DisplayPanel`），右 = 媒体信息（`InfoPanel`）/插件（`PluginsPanel`）；**每侧同时只开一个面板**（点当前图标关闭，点其他图标切换，互斥单开）；面板宽 256px 固定。
- **条目选中联动**：工作区网格中单击卡片 = 选中（高亮 + 右侧信息面板展示元数据，`itemStore.select` 异步补全 EAV），双击或信息面板"打开详情"按钮进入详情页；主页全局搜索结果保持单击打开详情。
- **开始界面（2026-08-23）**：居中三元素（搜索框 → `TagHit` 标题 → 工作区栏）；工作区栏右侧"新建"按钮点击展开内联输入行（输入名称 + 创建/取消，Enter 创建）；工作区卡片带封面（内部自动取图/用户自选，可全局关闭）。
- **工作区标签页**：主区 = 顶部搜索栏（过滤当前工作区）+ 虚拟化缩略图网格（瀑布流 JS 列分配 / 网格 / 列表，见 §六）。
- **设置页**：外观（主题/界面缩放/工作区封面）· 功能组件分区（布局/卡片标题/键鼠交互，按注册表渲染）· 媒体（ffmpeg/缩略图参数/排除规则）· 工作区管理（重命名/删除/路径）· 统一标签管理（全局池 + 声明 + 层级）。
- **守卫坑**：`App.vue` 曾 watch `route.params.id`，误伤 `/item/:id`（条目路由也用 `:id`）导致点开条目被重定向回主页；**必须限定 `route.name === 'workspace'` 才触发守卫**。
- **条目详情（2026-08-23 重构）**：整体左中右三区——**左**：媒体内容按**原始分辨率**显示（超出可视区自动等比缩小，无滚动条）；**中**（内容页内固定列）：**媒体信息**（原右侧边栏的"媒体信息"工具移入此处）+ **标签挂载**；**右**：右侧活动栏保留（仅**插件**工具，媒体信息不再作为边栏工具出现在详情页）。"返回"= 关闭当前条目标签回到活动标签。媒体经 `taghit-file://` 预览；标签挂载只列当前工作区已声明标签；工作区上下文优先取 `route.query.workspace`（全局搜索结果），否则用当前活动工作区标签。
- **主题（2026-08-23）**：`dark / light / system` 三档；`system` 通过 `prefers-color-scheme` 实时解析并监听系统主题变化（`ui.ts: matchMedia`）。

### 3.10 状态栏

- 展示扫描进度 / 最近一次扫描结果 / 插件数量；主题切换已收敛到设置页（不散落）。

---

## 四、关键坑与教训

| 坑 | 原因 | 解法 |
|---|---|---|
| better-sqlite3 源码编译失败 | 本机 node-gyp 选了 ClangCL 工具集而 VS 没装（根因未完全定位，node-gyp 9.4.1 源码无 ClangCL） | 安装用三步：`npm i --ignore-scripts` → `npx electron-builder install-app-deps`（走 Electron 预编译）→ `node node_modules/electron/install.js` |
| Electron 二进制下载卡死 | GitHub 网络不通 | `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'` |
| preload 产物为 `index.mjs` | `type:module` 项目 | main 里引用 `../preload/index.mjs` |
| 插件 `.js` 被当 ESM | `type:module` 作用域 | 插件统一 `.cjs` |
| `taghit-file://` 图片加载失败 | `standard: true` 空 host 不路由到 handler | opaque scheme（见 §3.5） |
| 点开条目被重定向回主页 | 守卫 watch `route.params.id` 误伤条目路由 | 限定 `route.name==='workspace'` |
| 瀑布流卡片全部整行占满（"每图一行一列"） | `ItemCard` 根自带 `relative`，父级再传 `absolute` → Tailwind 中 `relative` 后声明胜出，绝对定位失效回退文档流 | 瀑布流外包一层绝对定位容器，卡片不再接收定位类 |
| 网格卡顿/内存暴涨 | 网格直接加载**原图**（无缩略图），视口内多张全分辨率图同时解码 | 懒缩略图管线（见 §六）；`loading="lazy"` 只省流量不解码内存 |
| 视频缩略图 canvas 污染 | opaque scheme 无 CORS → drawImage 后 toBlob 抛 SecurityError | 协议加 `corsEnabled` + `Access-Control-Allow-Origin: *`，媒体元素 `crossOrigin='anonymous'` |
| 视频 seek 慢/整文件下载 | 协议不处理 Range | handler 解析 `Range` 头返回 206 切片 + `Accept-Ranges` |
| 缩略图缓存目录无效 | `process.env.TAGHIT_DATA_DIR` 从未设置，`join('', 'thumbnails')` 写错位置 | 改用 `app.getPath('userData')/thumbnails` |
| 删除确认框"未点确认即删除" | `defaultId: 1`（确定）在 Windows 上回车即触发 | `defaultId: 0`（取消为默认焦点），回车/Esc 均取消 |

---

## 五、设计决策

> 原独立文档 DECISIONS.md 已并入本节（2026-08-23）；遗留待办并入 `../todo`。

### 5.1 功能组件标准化（核心决策）

**概念：功能组件 = 自包含单元**——一个功能组件负责一个明确的用户功能，内部聚合四样东西，**对外只暴露声明**：

```
状态（自己的数据）· 逻辑（自己的行为）· 配置（用户可调项 schema）· 渲染（自己的 UI）
        │
        ▼ 对外只暴露 manifest：
{ id, title, mounts, settings: SettingSchema[], dataSource? }
```

**组织形态：每个组件一个目录**（`src/renderer/src/features/<featureId>/`，manifest.ts 声明 / index.vue 面板 UI / types.ts 组件自身类型）。宿主（活动栏 / 显示面板 / 设置页）**不 import 具体组件**，只查询注册表：`registry.list(mount)` → 按声明渲染。官方组件代码注册；未来插件经贡献点注册走同一条路。

**独立 vs 混合**：组件之间**绝不互相 import**，通信只经宿主协调或共享 store 切片（如 `uiStore.layoutMode`）。好处：改一个功能不动其他；删功能不牵连；新功能 = 新目录 + 注册一行。反例（已消灭）：原 `DisplayPanel.vue` 把媒体类型/排序/布局/标题四个区块写在一个文件里。

**可配置性：设置页 = 功能组件的配置渲染视图**——组件声明 `settings: SettingSchema[]`（key 对应 config 字段），设置页遍历注册表**按组件分组自动生成分区**（标题 = 组件 title），不再手写表单集。**配置单一来源**：同一组件的面板实例与设置页实例读写**同一份值**（收敛在 store → config），两处天然一致（证据：`showTitles`/`layoutMode` 原在两处手写编辑）。

**挂载点模型**：

```
type MountPoint = 'activityBar:left' | 'activityBar:right' | 'displayPanel' | 'settings' | 'statusBar' | 'grid'
```

同一组件可挂多处（如 `layout` 挂 `displayPanel + settings`）。**"卡片标题不出现在活动栏"**：`showTitles` 仅挂 `settings`（用户决策）。

### 5.2 已实施（v0.1.2）

**框架落地**：

| 文件 | 内容 |
|---|---|
| `src/shared/types/feature.ts` | `FeatureManifest` / `SettingSchema` / `MountPoint`（三端共享） |
| `src/renderer/src/features/registry.ts` | `registerFeature` / `listFeatures(mount)` / `registerBuiltinFeatures()`（main.ts 启动注册）+ `setupFeatureBehaviors()` |
| `src/renderer/src/components/settings/SchemaControl.vue` | 通用设置控件（boolean → 开关 / enum → 按钮组） |

**功能组件清单**：

| 组件 id | 挂载点 | 说明 |
|---|---|---|
| `mediaTypeFilter` 媒体类型 | displayPanel | 独立面板组件（类别列表 v1 固定五类；`dataSource: 'fileFormatMap'` 预留） |
| `sort` 排序 | displayPanel | 排序键从 `ItemService.listSortKeys` 驱动式查询 |
| `layout` 布局 | displayPanel + settings | 声明 `layoutMode` 枚举 schema，两处共享 |
| `showTitles` 卡片标题 | **仅 settings** | 按用户决策移出活动栏 |
| `keyboardMouse` 键鼠交互 | settings | 仅设置页（无面板 UI）；Ctrl+F/Cmd+F 聚焦搜索框（可开关）；其余快捷键/鼠标手势远期扩展 |

**框架扩展**：`FeatureDefinition` 增加可选 `setup?: () => void` **行为钩子**——无 UI 组件的功能组件也能注册行为（应用启动时 `setupFeatureBehaviors()` 统一执行，组件内部保证幂等）。这是"对外只暴露声明"之外的第二个对外面（行为），插件贡献点未来同路。

**宿主改造**：`DisplayPanel.vue` → 注册表容器（不再内联实现）；`Settings.vue` → 设置分区按组件 title 分组渲染（"布局" / "卡片标题" / "键鼠交互" 各一个 panel，与面板共享同一份配置）。

### 5.3 关联决策（同期的其他设计）

- **插件系统**：生态定位 = 官方/半可信插件；插件契约基座 = 领域服务层（P0.5 已落地）；详见 [PLUGIN-ARCH.md](PLUGIN-ARCH.md)。
- **领域服务层（P0.5 已落地）**：业务规则唯一归属 service（ItemService/WorkspaceService），DAO 纯数据访问；排序白名单 SortKeyRegistry 单源；Logger 日志服务；事件源注入（`EmitFn`）。
- **来源抽象与预览分级**：渲染层只认 uri；预览能力 L0-L3；三级插件体系（内建/官方扩展包/社区）。
- **标签筛选入口**（v0.1.2 已落地）：TagsPanel 标签点击 = 筛选该标签条目（此前无入口，是"打标后搜不到"的根源）；SearchBar 展示筛选状态。
- **详情页返回按钮删除**（v0.1.2 已落地）：右侧信息栏顶部返回按钮移除，退出详情走标签栏关闭。
- **主页单例**（v0.1.2 已落地）：`+` 激活已有主页；侧键后退不进入主页（App.vue 守卫拦截）。
- **活动标签高亮增强**（v0.1.2 已落地）：accent 色系 + 顶部指示条。
- **全局 UI 缩放（2026-08-23）**：采用 **CSS `zoom` 连续缩放**（`config.uiScale`，0.8–1.5，设置页滑块实时生效）——零成本满足"图标/字号偏小、可动态调整"；整页等比缩放（含媒体预览），虚拟化靠 ResizeObserver 自动重算。**备选方案**（尺寸 token 变量化 + 档位切换，如 compact/standard/comfortable）可实现"只缩字号/间距、不动媒体"的精细控制，但需把全项目散落的 px 收敛为 CSS 变量，成本高——留待 UI 密度档位化需求明确时再演进。

---

## 六、当前功能状态

✅ 已打通（精炼；实现细节见 §三 对应小节）：

- **工作区**：CRUD + 多目录 + 增量扫描（异步分块/事务批处理/进度事件/缺失语义/可逆脱离/孤儿自动清理）
- **标签**：全局池 + 工作区声明（`workspace_tag`）+ 层级（BFS 防环）+ 批量打标 + 挂载校验 + **标签筛选**（TagsPanel 点击交集）
- **搜索**：工作区 DSL（声明限定）+ 开始界面全局搜索（跨工作区，结果带 `workspaceIds`）
- **预览与元数据**：`taghit-file://`（图片/视频/音频/文本≤2MB 内联）+ EAV 元数据（image-size / ffprobe）+ L0/L1 系统打开兜底
- **缩略图**：懒生成（图片 canvas / 视频 Range 抓帧，并发 3），网格永不直出原图
- **网格**：瀑布流（JS 列分配 + 真实比例钳制 [1/2.2, 2.2]）/ 网格 / **列表（文件管理器行样式，单列虚拟化）** 三布局 + 视口虚拟化（±800px）+ 分页加载（120/页）
- **工作区封面**：自动取图 / 用户自选（白名单外复制进 `{userData}/covers`）/ 全局开关
- **浏览器式外壳**：多标签（主页单例/侧键守卫/条目标签/拖拽排序）+ 左右活动栏（互斥面板/顺序持久化）+ 状态栏 + 设置标签页
- **条目详情**：左中右三区（原始分辨率预览 + 媒体信息/标签挂载 + 右栏仅插件）；主题 `dark/light/system`
- **功能组件框架**：注册表 + setup 行为钩子；display 组件已拆分；`keyboardMouse` 占位；设置页按组件分组渲染
- **键鼠交互**：Ctrl+F / Cmd+F 聚焦搜索框（`config.enableSearchShortcut` 可开关）
- **界面缩放**：`config.uiScale`（0.8–1.5）CSS `zoom` 连续缩放，设置页滑块实时生效
- **插件宿主（MVPH）**：manifest 权限 + Node API 注入 + hello 示例
- **配置系统**：theme / layoutMode / uiScale / showTitles / showWorkspaceCovers / ffmpeg / 排除规则 / 格式映射 / 快捷键开关
- **领域服务层（P0.5）**：Item/Workspace/Tag/Search service 规则唯一归属 + SortKeyRegistry 单源 + Logger 日志
- 类型检查 / electron-vite 构建 / dev 启动通过

⬜ 未完成 / 待办：**统一见 `../todo`**（Bug 近期项 / v0.2.0 / 远期；原 DECISIONS 遗留与"下一步建议"均已并入）。

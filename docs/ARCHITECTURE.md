# TagHit 架构与宿主（ARCHITECTURE）

> 架构活体文档：讲"东西放哪、为什么"。本文件不含状态；能力事实住各能力文档（渲染层见
> [frontend/AGENTS.md](../frontend/AGENTS.md) 的文档地图，插件见 [plugins/AGENTS.md](../plugins/AGENTS.md)），裁决论证见 [.agents/notes/](../.agents/notes)。
> §一 是后端核心，§二 渲染层与宿主；插件机制与开发规范独居 [mechanism.md](../plugins/mechanism.md)，
> 不在本文件混杂。

## 一、后端核心（核心对渲染层/插件一无所知）

```
应用层 —— 用例编排（打标/浏览+投影/检索/维护/删除级联/扫描/来源根生命周期/内容读取），无状态
   │  调领域规则与端口
领域层 —— 实体与关系类型 · 纯规则（含路径规则）· 错误码；零依赖
端口   —— 契约第一公民 = 流动类型；动词薄按用例反推；查询下沉条件对象
适配器 —— memory（Store + 假文件系统，校准替身）· sqlite（驱动注入）· node（真文件系统）
```

- 依赖只向内。行为在应用层；存储/IO 实现位于领域层之外；核心对渲染层/插件无知。
- 存储契约全局约定：异步；实体写严格（NOT_FOUND/CONFLICT/INVALID）；关系写幂等；读宽松；
  事务 = 边界原子性（不支持嵌套）、一致性编排在用例。取回条目返回其全部标签。
  端口与查询条件的形状事实（生成器托管）：
<!-- codefact:begin store -->

<!-- 生成物（codefact:store）：勿手改 · 源 = src/ports/store.ts · 语义与约束读源码注释 · 重生成 npm run gen:codefact -->
- `interface TagsQuery`（查询条件对象）：
  - `ids?: Id[]`
  - `nameContains?: string`
- `interface ItemsQuery`（查询条件对象）：
  - `ids?: Id[]`
  - `kinds?: Item['kind'][]`
  - `status?: ItemStatus`
  - `titleContains?: string`
  - `underDirPath?: string`
  - `notUnderAnyDir?: string[]`
  - `underAnyDir?: string[]`
  - `extensions?: string[]`
  - `directNodeStateIn?: { workspaceId: Id; state: NodeState }`
  - `contentHash?: string`
  - `withAnyTag?: Id[]`
  - `withAllTags?: Id[]`
  - `withoutAnyTag?: Id[]`
  - `withoutTags?: boolean`
  - `order?: ItemOrderField`
  - `orderDir?: 'asc' | 'desc'`
  - `limit?: number`
  - `offset?: number`
- `interface ItemWindowQuery`（查询条件对象）：
  - `scope: ItemsQuery`
  - `anchorId: Id`
  - `radius: number`
- `interface NewTag`：
  - `id: Id`
  - `name: string`
  - `description?: string | null`
  - `createdAt: string`
- `interface NewWorkspace`：
  - `id: Id`
  - `name: string`
  - `createdAt: string`
- `interface NewCollection`：
  - `id: Id`
  - `name: string`
  - `anchorItemId: Id`
  - `createdAt: string`
- `interface NewGroup`：
  - `id: Id`
  - `name: string`
  - `createdAt: string`
- `interface Store`（端口动词清单；全局约定 = 异步、实体写严格/关系写幂等/读宽松、事务不嵌套）：
  - `transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>`
  - `createTag(input: NewTag): Promise<Tag>`
  - `updateTag(id: Id, patch: { description?: string | null }): Promise<void>`
  - `deleteTag(id: Id): Promise<void>`
  - `getTag(id: Id): Promise<Tag | null>`
  - `queryTags(q?: TagsQuery): Promise<Tag[]>`
  - `tagStats(): Promise<TagStat[]>`
  - `tagPairStats(q: { workspaceId: Id; kind: 'cooccur' | 'mutex'; limit: number }): Promise<TagPairStat[]>`
  - `getTagProfile(id: Id): Promise<TagProfile | null>`
  - `setTagProfile(id: Id, profile: TagProfile | null): Promise<void>`
  - `createItem(item: Item): Promise<Item>`
  - `updateItem( id: Id, patch: { title?: string status?: ItemStatus sourceUri?: string contentHash?: string | null size?: number | null fileModifiedAt?: string | null width?: number | null height?: number | null previewUri?: string | null } ): Promise<void>`
  - `deleteItem(id: Id): Promise<void>`
  - `getItem(id: Id): Promise<Item | null>`
  - `queryItems(q: ItemsQuery): Promise<ItemHit[]>`
  - `countItems(q: ItemsQuery): Promise<number>`
  - `itemWindow(q: ItemWindowQuery): Promise<ItemWindow>`
  - `attachTag(itemId: Id, tagId: Id): Promise<void>`
  - `detachTag(itemId: Id, tagId: Id): Promise<void>`
  - `listAttachments(opts?: { itemId?: Id; tagId?: Id }): Promise<ItemAttach[]>`
  - `linkTag(fromId: Id, toId: Id): Promise<void>`
  - `unlinkTag(fromId: Id, toId: Id): Promise<void>`
  - `listTagLinks(opts?: { from?: Id; to?: Id }): Promise<TagLink[]>`
  - `declareTag(workspaceId: Id, tagId: Id): Promise<void>`
  - `undeclareTag(workspaceId: Id, tagId: Id): Promise<void>`
  - `listDeclarations(opts?: { workspaceId?: Id; tagId?: Id }): Promise<Declaration[]>`
  - `createWorkspace(input: NewWorkspace): Promise<Workspace>`
  - `deleteWorkspace(id: Id): Promise<void>`
  - `getWorkspace(id: Id): Promise<Workspace | null>`
  - `listWorkspaces(): Promise<Workspace[]>`
  - `addWorkspaceRoot(workspaceId: Id, path: string): Promise<void>`
  - `removeWorkspaceRoot(workspaceId: Id, path: string): Promise<void>`
  - `listWorkspaceRoots(workspaceId: Id): Promise<WorkspaceRoot[]>`
  - `ensurePathNode(workspaceId: Id, dirPath: string, state?: NodeState): Promise<void>`
  - `deletePathNode(workspaceId: Id, dirPath: string): Promise<void>`
  - `setPathNodeState(workspaceId: Id, dirPath: string, state: NodeState): Promise<void>`
  - `listPathNodes(opts?: { workspaceId?: Id; dirPrefix?: string }): Promise<PathNode[]>`
  - `addRetiredRoot(row: RetiredRoot): Promise<void>`
  - `listRetiredRoots(opts?: { workspaceId?: Id }): Promise<RetiredRoot[]>`
  - `removeRetiredRoot(workspaceId: Id, path: string): Promise<void>`
  - `createCollection(input: NewCollection): Promise<Collection>`
  - `renameCollection(id: Id, name: string): Promise<void>`
  - `deleteCollection(id: Id): Promise<void>`
  - `getCollection(id: Id): Promise<Collection | null>`
  - `listCollections(): Promise<Collection[]>`
  - `appendCollectionMember(collectionId: Id, itemId: Id): Promise<void>`
  - `removeCollectionMember(collectionId: Id, itemId: Id): Promise<void>`
  - `reorderCollectionMembers(collectionId: Id, orderedItemIds: Id[]): Promise<void>`
  - `listCollectionMemberships(opts?: { collectionId?: Id; itemId?: Id }): Promise<CollectionMember[]>`
  - `createGroup(input: NewGroup): Promise<Group>`
  - `renameGroup(id: Id, name: string): Promise<void>`
  - `deleteGroup(id: Id): Promise<void>`
  - `getGroup(id: Id): Promise<Group | null>`
  - `listGroups(): Promise<Group[]>`
  - `addGroupMember(groupId: Id, tagId: Id): Promise<void>`
  - `removeGroupMember(groupId: Id, tagId: Id): Promise<void>`
  - `listGroupMemberships(opts?: { groupId?: Id; tagId?: Id }): Promise<GroupMember[]>`

<!-- codefact:end -->
  领域实体形状（生成器托管）：
<!-- codefact:begin entities -->

<!-- 生成物（codefact:entities）：勿手改 · 源 = src/domain/errors.ts , src/domain/types.ts · 语义与约束读源码注释 · 重生成 npm run gen:codefact -->
- `export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID'`
- `export type Id = string`
- `export type ItemStatus = 'active' | 'missing'`
- `export type Item = FileItem | AnchorItem`
- `interface Workspace`：
  - `id: Id`
  - `name: string`
  - `createdAt: string`
- `interface Tag`：
  - `id: Id`
  - `name: string`
  - `description: string | null`
  - `createdAt: string`
- `interface Collection`：
  - `id: Id`
  - `name: string`
  - `anchorItemId: Id`
  - `createdAt: string`
- `interface Group`：
  - `id: Id`
  - `name: string`
  - `createdAt: string`
- `interface PathNode`：
  - `workspaceId: Id`
  - `dirPath: string`
  - `state: NodeState`

<!-- codefact:end -->
- 校准文化：无测试设施（code-first 校准理解）；memory 与 sqlite 跑同一场景，契约一致才绿。
- **存储与领域规格**（词的定义见 [GLOSSARY](GLOSSARY.md)，行的行为规格在此）：
  - 跨工作区去重是扫描行为（同内容签名认领，见下）；组内的标签可多属（一个标签挂多个组）；
  - 重叠挂载：条目全局共享一份，路径节点按工作区各建一份；
  - SQLite 外键会暴露删除次序依赖：删作品先删 collection 行、再删锚条目——适配器内的操作次序即契约；
  - 摘要并集计数：「根下总数」用 `underAnyDir` 一次计数、不逐根求和——来源根嵌套/重叠时
    逐根求和会把重叠条目重复计入（nodeMissing 虚高）；
  - 批量读的绑定参数按块收敛（大库全量读不撞参数上限）；
  - 路径归一化只在边界执行：反斜杠→正斜杠、去尾分隔符、解析 `.`/`..`——
    用户输入与原生选择器的混合分隔符不得产生双身份节点。
- **扫描认领（应用外移动收敛）**：新路径与既有缺失条目同内容签名、且旧路径确已消失 →
  原条目改写来源并恢复，id 与标签/作品成员随行——应用外的移动/改名经重扫收敛不丢标签。
- 工作区 ↔ 条目模型（来源根 → 路径节点 → 归属派生）与两阶段扫描已落地；扫描消失策略
  keep/discard 可配；内容签名 sha256 于头/中/尾三采样点，同内容必同签名（三段全同的两个不同
  文件会被当作同一内容——移动认领可能错位、缩略图串用，这是对全文件哈希成本的已知折中）；
  图片固有尺寸扫描时从文件头零依赖解析（PNG/JPEG/GIF/WebP/BMP），落 items.width/height。
- **扫描容错**：遍历遇到不可读路径不抛错，而是产出一条错误条目——扫描跳过其子树继续，
  并在摘要里报数；**文件级同规则**（单文件 `stat`/`hash`/`readHead` 失败只跳过该文件，
  计入 `filesUnreadable`）。**不可读的目录子树与文件一律退出消失判定**：读不到 ≠ 已消失，
  否则会误删节点行（连带条目退出视图）或把条目标为缺失。用户排除过的节点行在目录消失后
  保留（代价：被排除又已消失的目录在来源根树里留一个空节点行——保留用户意图换来的）。

## 二、渲染层与宿主（已落地）

### 官方功能组件名录（术语单点）

**命名规则**：功能组件的名字 = 它管的**领域对象**（词见 [GLOSSARY](GLOSSARY.md)），**不另造别名**；
词表未定义的自造词不得出现在组件名与文档里（引用未定义词本身违纪），与既有组件名相撞的别名
（如「文件路径管理」撞**文件管理**）禁用。

| id | 名称 | 职责 | 呈现面 |
|---|---|---|---|
| `paths` | **来源根** | 来源根挂载/卸载、路径节点可见性、退役根与脱根条目去留 | 停靠面板（左）+ **全页** |
| `tags` | 标签 | 标签池与声明管理（按标签筛选的入口在搜索框：输入即出候选） | 停靠面板（左）+ **全页** |
| `display` | 显示 | 显示面板块的容器（媒体类型/排序/布局/工作区信息） | 停靠面板（左） |
| `files` | 文件管理 | 对多选集做真实文件改名/移动/删除（应用内操作直改库：移动/改名保 id 保标签，删除连条目记录一并清除；不重扫） | 停靠面板（左） |
| `info` | 媒体信息 | 当前选中条目的属性 | 停靠面板（左）（右活动栏已裁撤） |
| `plugins` | 插件 | 插件的管理面：已安装清单（启停/贡献面/声明制设置）+ 插件自开页入口 | 停靠面板（左）+ **全页**（管理页） |
| `globalSearch` | 全局搜索 | 跨工作区条目检索 | **全页** |
| `mediaTypeFilter` / `untagged` / `sort` / `layout` / `workspaceInfo` | 显示面板块 | 显示面板内的区块（**格式筛选**（类别=展示推导、扩展名下推、映射可配置）/ **无标签筛选** / 排序 / 布局 / 工作区信息） | `displayPanel` 块 |
| `showTitles` / `keyboardMouse` | 设置项与行为 | 标题开关（显示面板区块 + 设置分区共享配置）；键鼠行为注册 | `displayPanel` 块 + `settings` |

**呈现面分工**：窄面板只做**就地轻量操作**（浏览、逐节点切换、只看某节点）；
**批量与去留处置归全页**（一键恢复全部可见、退役根与脱根条目的清理/恢复、扫描与结果概览）。
理由：窄面板空间有限且常驻，批量误触代价高。

### 分层与落点

```
frontend/src/renderer/src/   渲染 UI（Vue3 + Pinia + router + Tailwind；经 typed 窄桥取数）
src/host/   主进程装配：SQLite 存储 + 真时钟/UUID + 逐端点注册用例 + 媒体字节协议；隔离窗口
契约单一事实源 = src/host/ipc.ts（渲染层仅 type-only 再导出，零运行时依赖）。
  端点清单形状事实（生成器托管）：
<!-- codefact:begin ipc -->

<!-- 生成物（codefact:ipc）：勿手改 · 源 = src/host/ipc.ts · 语义与约束读源码注释 · 重生成 npm run gen:codefact -->
- 请求/响应端点（`kind ← args → result`；信封 = `Result<T>` = Ok | Err）：
  - `ping` ← ([]) → `{ version: string }`
  - `'tags.search'` ← ([text: string]) → `Tag[]`
  - `'tags.create'` ← ([input: { name: string; description?: string | null }]) → `Tag`
  - `'tags.delete'` ← ([tagId: Id]) → `null`
  - `'tags.declare'` ← ([{ workspaceId: Id; tagId: Id }]) → `null`
  - `'tags.undeclare'` ← ([{ workspaceId: Id; tagId: Id }]) → `null`
  - `'tags.update'` ← ([tagId: Id, patch: { description?: string | null }]) → `null`
  - `'tags.getProfile'` ← ([tagId: Id]) → `TagProfile | null`
  - `'tags.setProfile'` ← ([tagId: Id, profile: TagProfile | null]) → `null`
  - `'tags.stats'` ← ([]) → `TagStat[]`
  - `'tags.pairStats'` ← (?) → `TagPairStat[]`
  - `'items.query'` ← ([query: ItemsQuery]) → `ItemHit[]`
  - `'item.window'` ← ([{ anchorId: Id; context: ItemContext }]) → `ItemWindowResult`
  - `'item.tag'` ← ([{ itemId: Id; tagIds: Id[] }]) → `null`
  - `'item.untag'` ← ([{ itemId: Id; tagIds: Id[] }]) → `null`
  - `'items.tag'` ← ([{ itemIds: Id[]; tagIds: Id[] }]) → `null`
  - `'items.untag'` ← ([{ itemIds: Id[]; tagIds: Id[] }]) → `null`
  - `'items.delete'` ← ([itemId: Id]) → `null`
  - `'item.readText'` ← ([itemId: Id, maxBytes?: number]) → `{ text: string; truncated: boolean } | null`
  - `'item.readAudioMeta'` ← (?) → `{ tags: { title: string | null; artist: string | null; album: string | null } previewUri: string | null lyrics: string | null } | null`
  - `'thumbnail.save'` ← (?) → `{ previewUri: string }`
  - `'nodes.list'` ← ([workspaceId: Id]) → `PathNode[]`
  - `'node.setState'` ← ([{ workspaceId: Id; dirPath: string; state: NodeState }]) → `null`
  - `'node.setSubtreeState'` ← ([{ workspaceId: Id; dirPath: string; state: NodeState }]) → `null`
  - `'fs.move'` ← (?) → `{ to: string }`
  - `'fs.trash'` ← ([{ workspaceId: Id; path: string }]) → `null`
  - `'dialog.pickDirectory'` ← ([]) → `string | null`
  - `'dialog.pickZip'` ← ([]) → `string | null`
  - `'plugins.list'` ← ([]) → `{ installs: PluginInstallEntry[] }`
  - `'plugins.peek'` ← ([zipPath: string]) → `{ manifest: PluginManifestFile; conflict: boolean }`
  - `'plugins.install'` ← ([zipPath: string]) → `{ manifest: PluginManifestFile; replaced: boolean }`
  - `'plugins.uninstall'` ← ([id: string]) → `null`
  - `'workspace.create'` ← ([name: string]) → `Workspace`
  - `'workspace.list'` ← ([]) → `Workspace[]`
  - `'workspace.get'` ← ([workspaceId: Id]) → `Workspace | null`
  - `'workspace.browse'` ← ([workspaceId: Id, query?: ItemsQuery]) → `BrowseResult`
  - `'workspace.visibility'` ← ([workspaceId: Id]) → `VisibilitySummary`
  - `'workspace.declaredTags'` ← ([workspaceId: Id]) → `Id[]`
  - `'workspace.mountRoot'` ← ([{ workspaceId: Id; path: string }]) → `null`
  - `'workspace.unmountRoot'` ← ([{ workspaceId: Id; path: string }]) → `null`
  - `'workspace.listRoots'` ← ([workspaceId: Id]) → `WorkspaceRoot[]`
  - `'workspace.delete'` ← ([workspaceId: Id]) → `null`
  - `'workspace.rootManagement'` ← ([workspaceId: Id]) → `RootManagementView`
  - `'workspace.cleanupDetached'` ← (?) → `{ deleted: number }`
  - `'scan.run'` ← ([workspaceId: Id, options?: ScanOptions]) → `ScanSummary`
  - `'collection.create'` ← ([name: string]) → `Collection`
  - `'collection.rename'` ← ([{ collectionId: Id; name: string }]) → `null`
  - `'collection.appendMember'` ← ([{ collectionId: Id; itemId: Id }]) → `null`
  - `'collection.removeMember'` ← ([{ collectionId: Id; itemId: Id }]) → `null`
  - `'collection.reorderMembers'` ← ([{ collectionId: Id; orderedItemIds: Id[] }]) → `null`
  - `'collection.delete'` ← ([collectionId: Id]) → `null`
  - `'group.create'` ← ([name: string]) → `Group`
  - `'group.rename'` ← ([{ groupId: Id; name: string }]) → `null`
  - `'group.addMember'` ← ([{ groupId: Id; tagId: Id }]) → `null`
  - `'group.removeMember'` ← ([{ groupId: Id; tagId: Id }]) → `null`
  - `'group.delete'` ← ([groupId: Id]) → `null`
  - `'group.list'` ← ([]) → `Group[]`
  - `'group.members'` ← ([]) → `GroupMember[]`
  - `'window.control'` ← ([action: WindowAction]) → `null`
  - `'window.isMaximized'` ← ([]) → `boolean`
- 单向端点（无回程，调用前渲染层预检）：
  - `'drag.start'` ← (?)

<!-- codefact:end -->
```

- **边界纪律**：渲染层只认 uri，拿不到存储与裸 Node——一切走窄桥用例。错误信封：宿主出
  code + 产生侧 message，文案由应用层用例/适配器产出、领域只出 code，渲染层按 code 取当前
  语言短句、message 作细节附后。**过桥入参必须是纯数据**：store/`reactive` 里的值是 Proxy，
  结构化克隆会抛 `DataCloneError`，故 [frontend/src/shared/api.ts](../frontend/src/shared/api.ts) 的门面统一把入参转纯
  （`bridge()` 包装），调用点不必各自记得。
- **SQLite 驱动注入**：适配层只认最小同步接口（`SyncSqlite`，接口与 ABI 恢复配方见 [src/AGENTS.md](../src/AGENTS.md)）；
  校准用 Node 内置驱动（node:sqlite，仅 Node ≥ 23.4），Electron 主进程注入 better-sqlite3
  （ABI 匹配），内置驱动不进打包产物。
- **字节闸门**：媒体字节不进 IPC——经特权协议直取（白名单 = 各工作区来源根 + userData，
  路径段匹配，支持 Range/MIME）；文本走窄桥读端点（扩展名白名单 + 2MiB 上限）。
  **缩略图是派生小图**：渲染层采集（视频抓帧 / 图片缩放，同一通道）与宿主解析（音频内嵌封面，
  `item.readAudioMeta`）三种生产者 → 宿主落盘 → 按内容哈希回写，同内容共享一份；
  网格与胶片条一律优先小图，详情页主图取原图；已知小图（扫描尺寸 ≤ 采集上限 480px）不再派生缓存。
  readAudioMeta 闸门 = 扩展名集合（对齐渲染层默认音频表；类别映射是渲染层可配置项、宿主不可见
  ——双表人工同步，漂移只影响提取覆盖面）∩ 解析成功（mp4 视频在表外天然排除）；
  音频标签（title/artist/album）只在端点响应瞬态返回，**不进领域 schema**。
  瀑布流比例**只取实测值**并钳制 [1/2.2, 2.2]，缺失给中性 4:3 占位（内容哈希派生的是假比例，
  会让视频先按错比例出框再被裁切），媒体元素 `object-contain` 宁留边不裁画面。
  音频歌词走同端点交付原文（.lrc 伴生优先、内嵌次之——解析呈现归插件，不进文本白名单）。
  **白名单只有一份实现**（[src/host/pathGate.ts](../src/host/pathGate.ts)）：字节读取与**拖出交付**共用，不各写一份。
- **拖出应用（术语）**：「**拖出**」= 把条目的**真实文件路径**交给系统拖放（区别于网页把
  `<img>` 当图片拖的默认行为）。由主进程 `webContents.startDrag` 发起，渲染层只表达意图——
  故契约里有**两类通道**：请求/响应（信封，绝大多数端点）与**单向**（`ipcRenderer.send`/
  `ipcMain.on`，仅"手势内必须同步发起"这一类）；单向没有回程，用户可感知的失败因此**在调用前
  预检并提示**，而不是等一个不会到来的错误。「**框选**」= 在空白处按下拖出矩形以成批选择条目，
  坐标用视口坐标（不重算布局），意图在按下瞬间定型。
- **宿主诊断面（术语「诊断快照」）**：渲染层没加载时宿主是唯一活着的部分——自诊断事实归宿主。
  快照（纯模块 [src/host/diagnostics.ts](../src/host/diagnostics.ts) 可直验）= 版本/平台/打包态/路径族（含 rendererTarget
  及其存在性）/加载状态机/事件环形缓冲（≤50 条：app-ready、load-ok/fail、renderer-gone、
  child-process-gone、渲染层 warning 以上 console），**只含路径与状态、不含用户内容**；
  落盘 `userData/diagnostics.json`（事件触发 + 节流覆盖写）。`--diagnose` argv 分支在单实例锁
  **之前**判定（运行中/锁被占也可用）：打印快照即退。首次主帧加载失败弹原生错误框（原因 +
  快照路径）——黑屏不是可接受的终态。渲染进程崩溃自恢复：记日志 + 重载，上限 3 次防循环
  （用尽后停黑屏，错误页是待办）。这是面向使用者机器上 agent 的**反馈机制**入口（用法见 `README.md`）。
- **无边框窗口（术语标准）**：窗口形态称「**无边框窗口**」。标签栏兼任「**标题栏**」（空白处
  拖动/双击最大化，交互元素不拖拽），右上三键正式名「**窗口控制键**」。一词一义：「壳」专指
  插件语境的容器与展示层（定义见 [plugins/mechanism.md](../plugins/mechanism.md)），窗口语境不用「壳」。
- **版式词汇（术语标准）**：窗口 = 一张**底板**（`--bg`，最深平面；顶栏与状态栏直接坐在底板上）；
  浮在底板上的 `--bg-elev` 面统称**卡片**（左卡 = 活动栏 + 弹出面板、工作台槽位卡、条目卡）。
  区域分层 = **明度差 + 距离**，不画区域接缝；**全直角**（圆角词汇不存在，见 [STYLE](STYLE.md) §3）。
  **版心** = 全页内容的居中限宽容器。详情页工作台的槽位/底板是同一模型在页面内的应用。
- 数据流约定：渲染层持**视图状态**（工作区/勾选标签/排序/范围）；任何改动 = 改意图 →
  窄桥调一次用例 → 失效重查；**不本地排序/过滤**（分页语义由存储一次完成）。
- **相册式详情页与顺序上下文**：打标的主战场是**详情页**——打开那一刻把来处的视图条件固化成
  **顺序上下文**（工作区 + 排序 + 筛选 + 范围），翻页沿它走（`itemWindow` 定位锚条目、取前后各
  N 条，与网格同一序列）。三条纪律：**上下文以标签项为准**（路由 query 只是它的携带形态，守卫
  对 `/item/:id` 只比路径）；**翻页不新开标签**（一个浏览会话一个标签页，路由 replace）；
  **打标不打断浏览**（当前页不跳、标签池在打开瞬间固化）。
- **详情页工作台**：详情页 = **骨架 + 工作台**两层——骨架（顺序上下文、翻页、DetailNav 命令桥）
  是**会话事实**，不可分配；版面归工作台：布局 = **分割树**（叶 = 槽：视图栈 + tab 栈；
  枝 = row/col 分割 + 弹性权重），**任意槽可向上下左右分割出新槽**（拖 tab 到槽缘 / 回添菜单四向），
  **槽位 = 附在更深底板（--bg）上的卡片（--bg-elev）**（即全窗版式模型），卡片间缝隙即底板透出
  （不画缝线；缝隙里的拖柄管拖宽/拖高），**视图填满槽位**（槽界即卡片界，插件的预览器经
  detailPreview 认领后落在卡片上）；空叶保留空间可关闭（摘叶兄弟 absorbs）；**认领定内容、
  偏好建议位置、用户分配定终局**（树持久化于 config，坏数据守门 = 形状递归验证/未知与重复视图
  剔除/单子枝折叠/权重归一，v1 四槽格式自动迁移，`detail.layoutReset` 重建默认树；槽条"+"菜单
  回添视图）。工作台容器是**新实体**（与 SurfaceHost 同哲学不同职能：后者管按挂载点的壳级外壳，
  前者管详情页内的槽位与分配）；视图（detailView 面）是"条目的一个侧面"，声明常驻不按条目认领，
  经工作台上下文取事实与动作（机制同构 FeatureContext）。已知边界：注册表在挂载期解析一次，
  插件动态装卸不即时反映（三方分发未接入前无消费方）。
- **标签与导航语义**：**路由是标签的投影**——标签是唯一事实源。**激活已有标签用 replace，
  打开一个视图用 push**；标签切换若也写历史，所有切换会被串进同一条全局历史，侧键返回就变成
  在"标签访问日志"上乱退。守卫只在**路由没有对应标签**时回落活动标签，**绝不跳进另一个标签**。
  已知边界：标签尚无独立历史栈与多实例（真正的并行访问未支撑，见 `TODO.md` 的 2.0 级议题）。
- **键位表是注册表的视图**：唯一事实源是快捷键绑定表（`features/keyboardMouse/shortcuts.ts`），
  设置页「键鼠交互」分区用只读设置块现取渲染（组合键/功能/生效范围/命令 id；绑定指向未注册
  命令时如实标出）——**不写手写键位文档**（手写必然漂移）。

### 壳级渲染与调用机制（官方与插件同一通道）

- **注册表 = 声明表 + 标准容器**：可序列化声明 + 实现绑定（官方/三方同表），壳只查表渲染、
  不 import 具体组件——所有功能组件的唯一渲染通道：槽查询 → 按呈现面选实现 → 惰性解析 →
  **壳级外壳**（停靠面板外壳 / 全页外壳 / 无外壳）→ 错误隔离 → 上下文注入。
  活动栏面板、显示面板块、内容区标签页共用。
  **容器归壳**：宽度/边框/滚动/角标归壳，功能组件只出内容——停靠面板外壳施加统一宽度变量，
  全页外壳给页头 + **居中的版心容器**（功能组件不自建侧栏，否则就是各自造窄边栏），且全页
  **不套窄面板**（功能组件按自己的功能各写全页；未绑定全页实现时给明确占位）。
  **全页入口唯一 = 面板右下角角标**。
  **两个呈现面共用一份数据与动作**：来源根组件给出的范式——状态与动作放一处（注入给子块），
  窄面板与全页面只差布局；跨实例动作广播失效重查。
- **错误隔离双线**：注册期（setup 抛错只废掉自己）+ 渲染期（槽级边界捕获）；官方组件走同一道
  边界。生命周期按条目配对（setup/dispose）。
- **命令注册表**：菜单项 = 命令 + 摆放元数据；when 是壳可求值的最小谓词（不加载实现即可过滤）；
  分组/排序/危险区沉底是壳的装配规则；菜单自绘，组件只声明"这块 DOM 是上下文目标"，
  事件拦截权归壳。**快捷键是同一张表的视图**：绑定只声明"组合键 → 命令 id"（可带设置项闸门与
  是否允许输入态触发），执行器把按键变成与右键菜单**同形**的调用上下文——因此"能绑什么" =
  "能注册什么命令"，权限清单不另立一套。
- **四个调用面视图**：**右键菜单**在拦截点就近取目标（`data-ctx-*`，目标可自带工作区上下文：
  功能标签页的活动工作区是空的，靠运行时推断会拿错）；**命令面板**由键盘唤起（无 DOM 目标），
  故壳现场构造**候选上下文集合**（shell 恒在、有目标条目时补 item），命令在任一候选下可执行
  即为可用、执行用那个候选——与菜单"按 when 过滤"的差别是面板**如实列出不可用的行**
  （灰显沉底）而不是隐藏它们；**拖拽**（拖出交付、框选起手判空白）与菜单共用**同一份 DOM 契约**
  与**同一条"目标已在多选集则整集带出"的投影规则**；**调用上下文里可携带壳填充的"现场事实"**
  （如 `detailNav` = 详情页翻页此刻是否可用），命令用 `fieldEquals` 读它——"生效范围"由此可求值，
  不会退化成"能按但什么都不发生"。**失败不静默**：节点行可能已被重扫清掉，命令失败经壳的
  轻通知服务报错，不只写控制台。
- **选择交互模型**：修饰键 → 选择意图的映射是壳级唯一实现（Shift = 区间 / Ctrl·Cmd = 切换 /
  裸点击 = 单选；**框选用两态**：裸拖 = 替换、Ctrl·Cmd+拖 = 并入），状态变更收口在条目 store；
  组件只转发原始事件，不自写修饰键分支。**点空白 = 未命中上下文目标**——与右键菜单、拖拽起手
  共用同一份 DOM 契约，各处判定永不漂移。
- **服务面**：确认框/提示由壳统一渲染（组件不自起弹层）；manifest 的 surfaces 声明位就绪。
- **配置仓**：按「功能组件 id + 键」持有并持久化（现为 localStorage，迁移宿主后键形状不变）；
  设置页直接读声明里的默认值。
- **全局播放引擎**：播放是"能力"归壳（渲染层应用级单例，[frontend/src/renderer/src/features/playback/](../frontend/src/renderer/src/features/playback)）——
  唯一 HTMLAudioElement 不入 DOM，keyed router-view 整树卸载（切标签页/翻页/返回网格）不停播；
  页面组件只是遥控器，翻页与播放解耦（翻页改"看什么"、播放改"听什么"）。链路一次成型：
  audio → EQ 8 段（默认平坦，机制口）→ AnalyserNode（频谱机制口）→ destination；
  插件经 HostApi.playback（快照回调订阅式）取状态。播放器插件内部页签自组织（黑胶 | 歌词）。
- **注册时序**：注册必须先于应用挂载——挂载时读表，顺序错了活动栏就是空轨。
  （同构验收：官方组件改运行期装载后壳行为不变，已有验收桩——插件规范见
  [plugins/mechanism.md](../plugins/mechanism.md)）

# TagHit 插件系统架构演进 RFC

> 状态：**草案（Draft）** — 待评审（评审中已定：生态定位 = 官方/半可信插件，见 §11-1；来源抽象与预览分级方向已定，见 §六）
> 记录时间：2026-08-23（随项目日期）
> 目标读者：TagHit 核心开发者 / 未来插件作者
> 相关文档：[ARCHITECTURE.md](ARCHITECTURE.md)（§6.7 插件宿主现状）

---

## 一、背景与动机

TagHit 的核心原则之一是**插件生态是长期核心**。当前插件宿主是"最小可行实现"（MVPH）：单一 Node 宿主 + manifest 权限声明 + `tools` RPC，能跑通 hello 示例，但**不足以承载生态**。

对照 VSCode / Obsidian 插件系统，本 RFC 识别出六大结构性缺口（详见 §二），并给出契约层的完整设计（§七~§九）与分阶段实施路线图（§十）。

同时，评审过程中确认了一个**更底层的结构问题**：TagHit 官方功能自身的业务逻辑与底层代码缠结（规则散落在 DAO / IPC / 渲染层），插件契约必须以重构后的"领域服务层"为基座（§五），否则契约冻结在散乱代码上毫无意义。这构成"官方功能 = 第一批插件式消费者"（dogfooding）原则的落点。

**本 RFC 的定位**：它不是实现文档，而是**契约冻结前的设计基线**。插件系统一旦放出第一批第三方插件，契约就要冻结（§十），因此本 RFC 的所有 API 形状都应当被视作"可以评审、修改"而非"可以事后随意推翻"。

---

## 二、现状盘点

### 2.1 已有抽象（保留，不推倒重来）

| 抽象 | 位置 | 状态 |
|---|---|---|
| manifest 清单（name/version/entry/permissions） | `src/shared/types/plugin.ts` | ✅ 理念正确 |
| 目录约定：`resources/plugins`（内置）+ `userData/plugins`（用户，同名覆盖） | `src/main/plugins/registry.ts` | ✅ 简洁务实 |
| 单一 Node 宿主（主进程即宿主，无 sidecar） | `src/main/plugins/host.ts` | ✅ 正确的架构决策 |
| 入口路径防目录穿越 | `registry.ts: resolveEntry` | ✅ 保留 |
| `tools` RPC 模型（`activate(ctx) → { tools }`） | `host.ts: call` | ✅ 作为最底层机制保留 |
| 声明式权限注入（fs 只读 / fetch / 限时 execFile） | `src/main/plugins/runtime.ts` | ⚠️ 保留但需演进（见 §8.2） |

### 2.2 六大结构性缺口

1. **没有 Contribution Points（贡献点）** — 插件无法声明命令、菜单项、设置项、面板，无法融入 UI。VSCode 的 `contributes.*`、Obsidian 的 `addCommand/addRibbonIcon/addSettingTab` 都是同一抽象：**插件只声明"贡献什么"，宿主负责渲染**。
2. **没有领域 API（App API）** — 插件只能碰 Node（fs/网络/shell），碰不到 TagHit 的数据与能力（搜索、标签、条目、工作区）。"AI 自动打标"类插件现在只能绕过 TagHit 自己扫文件。
3. **事件系统未接线** — `PluginExports.onEvent` 已定义但宿主从不调用；`event:plugin` 通道已声明但主进程从未广播（死代码）。插件既订阅不到领域事件，也推不动 UI。
4. **权限是引导式而非强制式** — `ctx` 不放 fs API 只是"不给糖"；插件运行在主进程，`require('fs')`/`process` 随手可用，对不可信插件无效。当前模型只适合官方/半可信插件。
5. **生命周期不完整** — 无 `deactivate` 钩子、无热重载、无插件级配置持久化、无插件间调用。
6. **没有类型 SDK** — `PluginContext` 类型只存在于主进程 TS，插件作者（.cjs）无类型提示。

### 2.3 官方功能自身的结构问题（评审新增）

除插件缺口外，TagHit 官方功能存在**业务规则错位**：规则没有唯一归属，被压进离它最近的"能跑"的位置（详见 §五）。这是插件契约基座问题的根源，必须在插件 API 冻结前收拢。

---

## 三、设计目标与原则

1. **契约优先**：`apiVersion` + 领域 API + 贡献点 + 事件表构成稳定契约；契约一旦随首个第三方插件发布即冻结（§十）。
2. **声明式优于命令式**：UI 能力走 manifest `contributes` 声明，宿主渲染；插件代码只做逻辑。
3. **数据与代码分离**：JSON 永远是数据，JS 永远是代码；权限声明决定代码能做什么。
4. **领域 API 是生态核心**：`ctx.app.*` 是插件与 TagHit 数据交互的唯一通道，形状对齐重构后的领域服务层（§五、§7.5 映射表）。
5. **官方功能 = 第一批插件式消费者**：官方 IPC handler 与插件桥调用**同一批领域服务实例**，规则天然一致、无特权旁路；API 质量被官方内部使用反复锤炼（VSCode 内置 Git/Markdown 扩展同款做法）。
6. **核心内建，长尾可插拔**：核心来源（本地文件）与核心渲染（图片/音视频/文本）内建最优路径，绝不经过插件；长尾来源与解析器通过插件扩展（§六）。
7. **渐进安全**：v1 信任模型（官方/半可信）→ v2 隔离执行；安全边界在文档中明示，不假装安全。
8. **最小充分**：v1 只做生态成立的最小集（领域 API + 事件 + 贡献点 v1 + 生命周期），不做大而全。

---

## 四、总体架构

```
┌────────────────────────────────────────────────────────────┐
│ Renderer (Vue)                                              │
│   插件 UI：PluginsPanel（现状）+ 贡献点渲染区（命令菜单/      │
│   设置分区，v1 起）+ 自定义视图（v2，待决策）                  │
│   预览：只认 uri（taghit-file:// 等），不问内容提供者是谁     │
│        │ window.api.plugin.*（list/call 保留）+ 事件订阅       │
│        ▼                                                     │
│ Preload                                                     │
│        │ ipcRenderer.invoke / on                             │
│        ▼                                                     │
│ Main ── PluginHost（单一 Node 宿主，本 RFC 的扩展对象）        │
│   ├─ registry     扫描/校验 manifest（扩展：apiVersion/       │
│   │                contributes 校验）                        │
│   ├─ runtime      构造 ctx（三层：app/node/ui）               │
│   ├─ lifecycle    activate / deactivate / 热重载（v1.5）      │
│   ├─ bridge       ctx.app.* → 领域服务层（§五）               │
│   └─ events       领域事件 → 插件 onEvent；插件 → 渲染层       │
│        │                                                     │
│        ▼                                                     │
│ 领域服务层（规则唯一归属）                                    │
│   ├─ ItemService / WorkspaceService / TagService /           │
│   │   SearchService / ConfigService                          │
│   ├─ Provider（内容来源：本地内建；远程可插拔）                │
│   └─ Extractor（元数据解析：内建 + 插件贡献）                  │
│        │                                                     │
│        ▼                                                     │
│ DAO（纯数据访问） · SQLite · Node API（按权限） · 文件系统     │
└────────────────────────────────────────────────────────────┘
```

关键决策：**插件仍运行在主进程（单一宿主）**，不引入独立扩展宿主进程。理由：当前规模下主进程即 Node，插件需要直接访问领域服务与数据库，隔离进程会引入 IPC 往返与序列化成本；安全通过"信任模型 + 权限声明"（v1）与"worker 隔离"（v2，§8.3）分层解决。

---

## 五、领域服务层（分层收拢）—— 插件契约的基座

### 5.1 现状：规则错位（用代码指认）

> ✅ **P0.5 已收拢（2026-08-23）**：下表所列错位已按 §5.2 边界归位（`ItemService`/`WorkspaceService` 建立、`SortKeyRegistry` 单源、`path-util` 抽离、DAO 不再接收 config），表格保留作为分层收拢的历史依据。

TagHit 当前业务规则没有唯一归属，散落在三层（这是"实现业务代码与底层功能代码缠在一起"的具体事实）：

| 错位位置 | 内容 | 问题 |
|---|---|---|
| `item.dao.ts:49-65` | 排序白名单 + 默认排序 + ORDER BY 构造 | 产品规则写进数据访问层 |
| `item.dao.ts:153-161, 44-47` | fileFormatMap 格式映射在 SQL 构造中执行 | 业务映射混入 DAO 签名（`list(db, filter, config)`） |
| `item.dao.ts:209` | `isThumbPath` 原图过滤 | "网格永不直出原图"策略埋在查询里 |
| `item.dao.ts:460-465` | `existsSync` 缺失判定 | 数据访问层直接摸文件系统 |
| `ipc/item.ts:17-26` | 声明校验（`tagDao.isDeclared`） | **业务规则写在传输层**，只有 IPC 这一入口生效 |
| `workspace.dao.ts:42-69` | `resolveCoverUri` 封面策略（指定优先→缩略图→原图） | 业务策略在 DAO，`imageExts` 参数泄漏进 `list()` 签名 |
| `workspace.dao.ts:150-168` | `detachItemsUnderPath` "移除路径→脱离" | 产品语义在 DAO |
| `search.service.ts:37-42, 81-84` | 直接 `db.read.prepare` 做倒排交集 | service 混入 SQL |
| `item.dao.ts:7` ← `workspace.dao.ts` | `isUnderPath` 交叉 import | DAO 之间互相引用，边界模糊 |
| `ItemDetail.vue:148` | 渲染层预判"仅已声明标签可挂载" | 领域判断散落到前端 |

### 5.2 分层边界判定标准（单一判据）

判断一条逻辑该放哪层，问一个问题：

> **它是因为"产品需求变化"而变，还是因为"存储/传输机制变化"而变？**

| 触发变化的原因 | 归属层 |
|---|---|
| 产品需求变（排序规则、缺失语义、封面策略、校验规则、格式映射、原图策略） | **领域服务（service）** |
| 存储机制变（SQL 优化、加索引、迁移、事务边界） | **DAO** |
| 传输方式变（IPC 通道、序列化、权限校验、错误包装） | **ipc 层** |

规则跟着"为什么改它"走。`tag.service.ts` 是现成范本：防环、重名校验、创建即声明等产品规则全在 service，`tag.dao` 只做 CRUD。

### 5.3 各域边界（归属修正）

| 域 | 现状 | 收拢目标 |
|---|---|---|
| **item** | 无 service；规则寄居 DAO + IPC | 新建 `ItemService`：声明校验、排序白名单解析、格式映射、原图策略、`updateTags`（校验+写库+发事件） |
| **workspace** | 无 service；scan.ts 是游离函数 + DAO 夹带策略 | 新建 `WorkspaceService`：`scan()`（收拢 scan.ts）、`removePath()`（脱离决策）、`finalizeScan()`（缺失语义 + existsSync 移入）、`setCover()`（封面策略） |
| **search** | service 混入 SQL | `itemDao.listByTagIntersection()` 下沉 SQL；service 只做 DSL 解释 + 参数组装 + 结果组装 |
| **tag** | ✅ 已符合（范本） | 保持不变 |
| **交叉依赖** | `item.dao` ← `workspace.dao` | `normPath`/`isUnderPath` 抽到独立 `src/main/core/path-util.ts`，消除 DAO 间引用 |

### 5.4 DAO 接口收窄方向

收窄后 DAO 签名更"原始"但职责纯粹：

```ts
// 收窄前（现状）
itemDao.list(db, filter, config)          // 接收 config → 内部做业务映射

// 收窄后
itemDao.list(db, {
  workspaceId, tagIds, extList,           // service 已把 mediaType 换算成 exts
  keyword, dateFrom, dateTo, status,
  orderBy: SortColumn | null, orderDir,   // service 已把 sortBy 解析成白名单枚举
  limit, offset
})                                        // 返回原始行；service 负责组装 ItemWithTags
```

### 5.5 service 依赖设计

- **事件注入**：service 构造函数注入 `emit: (event, payload) => void` 回调（显式依赖、可单测），而非直接调 `AppEventBus.get()` 全局单例。
- **共享实例**：`AppContext` 构造一次，官方 IPC handler 与插件桥（§7.5）共享同一批 service 实例——规则一致、事件同源。

### 5.6 实施策略（P0.5）

- **纯重构，行为不变**：只搬运规则（IPC→service、DAO→service），不新增功能、不改变 IPC 契约。
- 验收：`npm run typecheck` 通过 + 现有功能回归（扫描/搜索/打标/排序行为与重构前一致）。
- **日志功能随 P0.5 一并落地**（官方功能基础设施，见 §5.9）。

### 5.7 排序策略

排序不是"一段逻辑"，而是**三种执行机制**，按排序键的"性质"选择：

```
排序键类型              执行层           数据来源
─────────────────────────────────────────────────────────────
A. item 真实列          SQL ORDER BY      item 表（更新/名称/大小/修改/添加/类型）
B. 元信息键（EAV）       SQL + 物化列       item_metadata 或提升为专用列
C. 计算值               service/插件      运行时计算或预计算缓存
```

**性能顺序（不可破坏）**：倒排交集 → 过滤 → 排序 → 分页。排序永远作用于"交集之后"的候选集（几百/几千条），**不作用于全库**——倒排索引的查询路径一行不改，排序开销 ∝ 候选集大小。

**三种机制的开销与对策**：

| 机制 | 开销 | 对策 |
|---|---|---|
| A 真实列 | SQLite 原生 ORDER BY，几乎无感 | 走索引或候选集排序 |
| B EAV 键 | value 是字符串，JOIN+CAST 索引用不上 | **物化**（写时更新为列，读时 SQL 排序） |
| C 计算值 | 代价在"计算"不在"排序" | 计算一次、缓存多次（预计算落库或内存缓存） |

**物化两分法**（回答"排序值是否写库"）：按"值变化频率 vs 查询频率"决定——

| 场景 | 策略 | 例子 |
|---|---|---|
| 低频变化、高频查询 | **物化落库**：写时更新，读时 SQL 排序 | 手动评分 rating → 物化列，service 写操作时同步 |
| 高频变化/纯派生 | **不落库**：service 内存计算，候选集已缩小 | 与关键词的相关度 → 每次查询只对候选集算 |
| 计算昂贵、高频查询 | **预计算缓存**：异步批量算好存库，事件驱动刷新 | AI 向量相似度 → 索引管道算好，查询只读 |

**物化逻辑在 service，物化存储（列/表）在 DAO**——再次印证分层。

**注册机制（"如何加载排序逻辑"）**：

```
v1（P0.5 收拢后）：
  ItemService 持有 SortKeyRegistry（排序键 → SQL 列名枚举，单一事实来源）
  DAO 只收枚举；渲染层排序下拉从 ItemService 查询可用键，驱动式渲染，不再硬编码
  → 改排序 = 改 service 一处（现状要同时改前端 sortOptions + 后端 SORT_COLUMNS 两处）

v2（待决策）：
  SortProvider 接口（name / sort(items, ctx) / 是否物化 / 物化维护钩子）
  插件可注册自定义排序（如"按 AI 评分"）
  执行层：候选集缩小后，service 分派给 SQL 或内存排序
```

### 5.8 新功能 = service API 组合（示例：tagGroup）

官方新功能的实现路径：**service API 的组合调用 + 纯 UI 概念，不触底层**。示例——"标签组"（把最常见的标签一次性绑定到条目）：

```
① 前端新增"标签组"UI（预设如"工作素材" = [素材✓, 授权✓, 已导出✓]）
② 用户点击应用 → window.api.item.updateTags(wsId, itemId, [3,7,12], [])
③ ItemService.updateTags：声明校验每个 tagId → 写库 → 发 item:tagsChanged
```

**不需要动 DAO / 数据库 / 底层任何代码**——现有 `updateTags` 的 `add` 参数本就是数组。若标签组要可共享/可引用，那才涉及新概念与新 schema（功能设计层面），但仍落 service。

### 5.9 日志功能（P0.5 基础设施）

- **Logger 服务**（主进程）：分级 `debug/info/warn/error`；输出控制台 + 文件 `{userData}/logs/taghit.log`（按大小滚动，保留最近 N 份）。
- 接入点：扫描流程（阶段/结果）、元数据提取失败、插件加载/调用、未捕获错误、service 关键写操作。
- 插件侧 `ctx.log` 后续接入同一 Logger（v1 先保留现状 `console.log`，P1 迁移）。
- 渲染层错误经 IPC 回传日志（v1 从简：渲染层捕获后 `console.error`，不设日志通道）。

---

## 六、来源抽象与预览能力分级

### 6.1 Source Provider 原则（已定）

**渲染层只认 uri 字符串，从不关心内容提供者是谁。**

```
渲染层（消费者）← provider（生产者）← service/DAO（仲裁+记录）
```

- 渲染层永远拿 `taghit-file://...` 这样的 uri，问"怎么显示"，不问"文件从哪来"。
- **provider 真正把 uri 变成字节流**：本地场景 = `taghit-file://` 协议 handler（主进程，已内建）；远程/协作场景 = 插件 provider（长尾可插拔）。
- service/DAO 是仲裁者与记录者：存 uri、决定"该问谁要内容"，**不亲自生产字节**。
- **核心来源（本地文件）内建最优路径，绝不经过插件**；长尾来源（网页剪藏、远程服务器）通过插件扩展。核心功能不能被外部因素（插件未装/加载失败/API 不兼容）绑架。
- v1 落点：DAO/service/搜索对 `sourceUri` **不做"本地路径"假设**（它是字符串字段）；不新增 `sourceProvider` 列（v2 迁移）。

### 6.2 预览能力分级

文件类型有限，TagHit 不必预览一切——按能力分级，组织能力（索引/搜索/打标）与预览能力（渲染）**解耦**：

| 级别 | 能力 | 示例 | 兜底 |
|---|---|---|---|
| **L0 未识别** | 图标 + 元数据（可索引/搜索/打标） | 3D 建模（obj/fbx）、Adobe 工程（psd/ai/prproj）、CAD | 双击 `shell.openPath` 系统关联应用打开——**组织归 TagHit，打开归系统** |
| **L1 元数据可提取** | 无内联预览，但可解析元数据入 EAV | epub（作者/页数/封面）、漫画 cbz | 同上 |
| **L2 静态预览** | 内联渲染静态内容 | 图片（canvas 缩略图）✅、文本 txt/md/code、PDF | — |
| **L3 动态预览** | 内联渲染动态内容 | 音视频（播放器 + 抓帧缩略图）✅ | — |

现状事实：`fileFormatMap` 默认仅认 19 种扩展名；pdf 仅 L1（详情页显示"无可预览内容"）；**文本/电子书完全缺失**。

### 6.3 三级插件体系

| 级别 | 例子 | 分发方式 | 与插件 API 的关系 |
|---|---|---|---|
| **核心内建** | 图片/音视频渲染、扫描、搜索、provider(本地) | 随应用分发，零依赖 | 不经过插件（核心路径不被外部绑架） |
| **官方扩展包** | epub、漫画、3D 预览 | 官方维护，可选启用 | **走插件 API**（dogfooding 第一批消费者，锤炼契约） |
| **社区插件** | 第三方贡献 | 用户安装 | 走插件 API |

官方扩展包的特殊地位：验证契约是否真的可用——官方自己的扩展都不能绕过 API 走特权路径。

### 6.4 v1 落地清单（官方功能，随 P0.5 一并做）

1. ✅ **文本格式进内建**（v0.1.2 落地）：`fileFormatMap` 文本 18 种 → `document`；详情页文本内联预览（≤2MB，`item:readText`）。
2. ✅ **系统打开兜底**（v0.1.2 落地）：`item:openWithSystem` IPC（`shell.openPath`）——L0/L1 格式双击外部打开。
3. **epub 列为官方扩展包 P1.5 候选**（未动）：解析 `content.opf` 提取作者/页数/封面（纯主进程能力，零渲染层改动）。

### 6.5 待决策：预览器贡献点的渲染层机制

主进程插件模型与"预览器必须在渲染层运行"（DOM/WebGL/canvas）存在天然矛盾。三条路线，v1 不做，RFC 记录：

1. **webview 容器**：插件提供独立网页 + 桥（隔离好，重）
2. **渲染层插件桥**：插件代码转发到渲染层沙箱执行（轻，但要沙箱）
3. **官方扩展包专属捷径**：官方预览组件直接编进渲染层 bundle + feature flag（最简单，仅官方可用）

v1 务实策略：内建预览器（图片/音视频/文本）覆盖核心；官方扩展包先做 **L1 元数据提取器贡献点**（纯主进程，零渲染层改动）；L2/L3 预览器贡献点等渲染层机制成熟（随 §11-2 views 决策一并评估）。

---

## 七、契约层设计（v1）

### 7.1 apiVersion 与兼容策略

```jsonc
// plugin.json 必填
{
  "apiVersion": "1"
}
```

- 宿主加载时校验：`apiVersion` 缺失或大于宿主支持的最大版本 → **拒绝加载**，`PluginInfo.error` 报告"需要 TagHit API vX"。
- 兼容策略：**同 major 向后兼容**（宿主可加载所有 ≤ 最大支持版本的同 major 插件）；major 升级提供迁移指南（见 §十）。
- 宿主导出自身版本：`PluginInfo` 增加 `hostApiVersion: number` 字段，供面板展示与插件自查。

### 7.2 manifest 扩展（完整 v1 schema）

```jsonc
{
  "name": "my-plugin",                    // 必填，全局唯一（内置/用户同名覆盖沿用）
  "version": "1.0.0",                     // 必填，semver
  "apiVersion": "1",                      // 必填（新增）
  "description": "...",
  "entry": "index.cjs",                   // 必填，CJS；ESM 支持 v2 再议
  "permissions": {                        // 新增 fs.read / fs.write 分离（§8.2）
    "fs": { "read": true, "write": false },
    "network": false,
    "shell": false
  },
  "contributes": {                        // 新增：贡献点声明（§7.7）
    "commands": [
      { "id": "my-plugin.hello", "title": "打个招呼", "icon": "wave" }
    ],
    "menus": {
      "itemContext": ["my-plugin.hello"], // 条目卡片/详情右键菜单
      "commandPalette": ["my-plugin.hello"]
    },
    "settings": {                          // 插件设置 schema，渲染到设置页
      "properties": {
        "myPlugin.apiKey": { "type": "string", "title": "API Key" }
      }
    }
  }
}
```

### 7.3 生命周期协议

```ts
// 插件入口（CJS）
module.exports = {
  activate(ctx) {
    // 返回 v1 能力对象；全部可选
    return {
      tools: { /* 保留现有 RPC，作为"无 UI 的后台工具"通道 */ },
      onEvent(event, payload) { /* 领域事件订阅，§7.6 */ },
      async deactivate() { /* 卸载清理：定时器/订阅/句柄 */ }
    }
  }
}
```

- `activate` 失败：记录 `error`，`loaded=false`，不阻塞其他插件（沿用现状）。
- `deactivate`：v1 在"插件被用户禁用/移除/宿主关闭"时调用；宿主捕获异常不中断流程。
- 热重载（v1.5 起）：监听 `userData/plugins` 变化，自动 `deactivate` 旧实例 → 重新加载 → `activate`。

### 7.4 ctx 三层 API（注入面）

| 层 | 内容 | 对应现状 |
|---|---|---|
| `ctx.app` | **领域 API**：items / tags / search / workspaces / config / storage / events（§7.5） | 新增 |
| `ctx.node` | 受限 Node API：fs（read/write 分离）/ fetch / execFile | 由现有 `ctx.fs/ctx.fetch/ctx.execFile` 收窄迁移 |
| `ctx.ui` | UI 能力：`notify()`（v1 最小集）；statusBar/视图 v2 | 新增（v1 仅 notify） |

**向后兼容**：v1 过渡期保留 `ctx.fs`/`ctx.fetch`/`ctx.execFile` 顶层快捷方式并标记 deprecated，v2 移除；`apiVersion` 不 bump 不破坏既有插件。

### 7.5 领域 API 详细形状（ctx.app.*）

> 映射表：**API 方法 → 领域服务层（§五）**。插件桥与官方 IPC **共享同一批 service 实例**——校验一致、事件同源，插件无特权旁路。

```ts
interface AppApi {
  items: {
    list(filter: ItemFilter): Promise<{ items: ItemWithTags[]; total: number }>
      // → ItemService.list（工作区过滤 + 排序白名单 + 格式映射 + 原图策略）
    get(id: number, workspaceId: number): Promise<ItemWithTags | null>
      // → ItemService.get
    getMetadata(itemId: number): Promise<ItemMetadata[]>
      // → itemDao.listMetadata
    updateTags(workspaceId: number, itemId: number,
               add: number[], remove: number[]): Promise<void>
      // → ItemService.updateTags（声明校验 + 写库 + 发 item:tagsChanged）
  }
  tags: {
    list(): Promise<Tag[]>                                  // → tagService.list
    listForWorkspace(workspaceId: number): Promise<Tag[]>   // → tagService.listForWorkspace
    listWithRelations(): Promise<TagNode[]>                 // → tagService.listWithRelations
    create(req: CreateTagRequest): Promise<Tag>             // → tagService.create
    update(id: number, patch: { name?: string; description?: string }): Promise<Tag>
                                                            // → tagService.update
    remove(id: number): Promise<void>                       // → tagService.delete
    declare(req: DeclareTagRequest): Promise<void>          // → tagService.declare
    undeclare(req: DeclareTagRequest): Promise<void>        // → tagService.undeclare
  }
  search: {
    query(req: SearchRequest): Promise<SearchResult>        // → searchService.query
    global(req: SearchRequest): Promise<SearchResult>       // → searchService.globalQuery
  }
  workspaces: {
    list(): Promise<WorkspaceWithPaths[]>                   // → WorkspaceService.list
    scan(id: number): Promise<ScanResult>                   // → WorkspaceService.scan（进度走事件）
  }
  config: {
    get(): Promise<AppConfig>                               // → ConfigService.get
    update(patch: Partial<AppConfig>): Promise<AppConfig>   // → ConfigService.update
  }
  storage: {
    get(key: string): Promise<unknown>                      // 插件私有数据（Obsidian loadData 模式）
    set(key: string, value: unknown): Promise<void>
    // 落盘：userData/plugins/<name>/data.json
  }
  events: {
    on(event: DomainEventName, cb: (payload: unknown) => void): () => void
      // 订阅领域事件（§7.6 表），返回取消函数
  }
}
```

设计要点：

- **全部方法返回 Promise**（与 IPC 边界一致），插件侧不感知同步/异步差异。
- **校验沿用宿主规则**：`updateTags` 的声明校验、`declare` 的可见性语义等由领域服务实现，插件无特权旁路。
- **只读默认**：v1 领域 API 默认只读（items/tags/search/workspaces 查询 + config.get）；写操作（updateTags / create / remove / config.update）需要 manifest 声明 `"app": { "write": true }` 权限（§8.2 一并设计）。

### 7.6 事件模型（三向打通）

```
TagHit 领域事件 ──→ 插件 onEvent(event, payload)     [host 分发]
插件 ──→ 渲染层（经 ctx.ui.notify / 自定义广播）        [event:plugin 通道]
渲染层 ──→ 插件（命令执行、插件 UI 交互）               [plugin.call 保留]
```

**A. 领域事件表（v1）** — **事件从领域服务层发出**（写操作成功 → service 调注入的 `emit` 回调），而非 IPC 层拦截：

| 事件名 | 载荷 | 触发点 |
|---|---|---|
| `scan:progress` | `ScanProgress` | WorkspaceService.scan 分块上报 |
| `scan:completed` | `ScanResult` | 扫描收尾 |
| `item:created` | `Item` | ItemService 入库 / 扫描 |
| `item:tagsChanged` | `{ itemId, workspaceId }` | ItemService.updateTags 成功后 |
| `tag:created` / `tag:deleted` | `Tag` / `{ id }` | tagService |
| `tag:declared` / `tag:undeclared` | `DeclareTagRequest` | tagService |
| `workspace:created` / `workspace:deleted` | `Workspace` / `{ id }` | WorkspaceService |
| `workspace:pathAdded` / `pathRemoved` | `{ workspaceId, path }` | WorkspaceService |
| `config:changed` | `AppConfig` | ConfigService.update |

实现策略：service 注入的 `emit` 回调串联 `AppEventBus.broadcast`（→ 渲染层）与 `PluginHost.dispatchDomainEvent`（→ 插件），**一个事件源，两端消费**。

**B. 插件 → 渲染层**：`ctx.ui.notify({ type: 'info'|'error', message })` → host 转发 `IPC.event.plugin`（通道已存在，补接线）；自定义结构化广播 v2 再议。

### 7.7 贡献点（contributes）v1

| 贡献点 | 渲染位置 | v1 范围 |
|---|---|---|
| `commands` | 条目右键菜单 / 命令面板（未来）/ 插件面板"执行"按钮 | ✅ |
| `menus.itemContext` | 条目卡片右键、详情页操作区 | ✅ |
| `settings` | 设置页新增"插件"分区，按 schema 渲染表单 | ✅ |
| `views` | 自定义工具面板（Obsidian `registerView` 等价物） | ⬜ v2 待决策（§11） |
| `extractor`（元数据提取器） | 扫描管线内调用（§6.5） | ⬜ v1.5 候选（官方扩展包先行） |

执行路径：命令/菜单点击 → 渲染层 `window.api.plugin.call({ plugin, tool: '__command__', args: { commandId, itemId, workspaceId } })` → 宿主解析为插件 `onCommand(commandId, context)`（v1 在 `activate` 返回对象中增加 `onCommand`）。**宿主传递上下文**（itemId/workspaceId），插件凭 `ctx.app.items.get` 取数据——贡献点声明与数据访问分离，符合"声明式优于命令式"。

### 7.8 插件数据持久化

- `ctx.app.storage.get/set` → `userData/plugins/<name>/data.json`（原子写：临时文件 + rename）。
- 与 `contributes.settings` 的差异：settings 是**用户可编辑**的声明式配置（存 `userData/config.json` 的 `plugins.<name>` 段），storage 是**插件私有**数据（apiKey 缓存、上次游标等）。
- 配额与上限 v1 从简（单文件 ≤ 1MB 告警），v2 加严格配额。

### 7.9 类型 SDK

- 从 `src/shared/types/` + `src/shared/api.ts` 生成/维护 `@taghit/api` 类型包（d.ts），声明 `PluginContext`/`AppApi`/`DomainEventMap`/manifest 类型。
- 插件可用 TypeScript 开发，编译为 `.cjs`（沿用 CJS 约束）。
- v1 交付：类型包源码入库 `types/`（仓库内发布目录），npm 发布 v2 再议。

---

## 八、安全模型

### 8.1 现状边界（必须明示）

插件运行在主进程，`require` 可加载任意模块。**当前权限声明是引导式，不是强制式**。v1 信任模型：**只允许官方/半可信插件**（用户亲手放入目录并知悉来源）。文档与 UI 必须向用户说明此边界。

### 8.2 v1 权限细化（低成本加固）

| 权限 | v1 形态 | 说明 |
|---|---|---|
| `fs.read` | `readFile/readdir`（现状） | 与现状等价 |
| `fs.write` | `writeFile/mkdir/rm`（新增，需实现） | 现状无写能力，补上但默认关闭 |
| `app.write` | 领域写操作开关（§7.5） | 新增；`updateTags` 等默认拒绝 |
| `network` / `shell` | 现状（shell 保持 10s 超时） | 保留 |

### 8.3 v2 隔离路线（不纳入 v1 交付）

1. **worker_threads 执行**：插件脚本在 worker 内运行，宿主通过 `postMessage` 桥接 `ctx.*`；能力令牌（capability tokens）替代对象注入，实现强制式权限。
2. 或独立进程 + stdio RPC（旧 Tauri 方案的教训：不要中间翻译层——若走此路，直接用 worker/子进程直连 IPC）。
3. 候选先做：`vm` 沙箱不适合（插件需真实异步 I/O），worker_threads 为默认候选。
4. **决策点**：生态定位已定"半可信插件"（§11-1），v2 无限期搁置；若开放第三方市场，v2 是硬前提。

---

## 九、分阶段实施路线图

| Phase | 内容 | 验收标准 | 依赖 |
|---|---|---|---|
| **P0.5 领域服务层收拢**（✅ 已完成 2026-08-23） | 新建 `ItemService`/`WorkspaceService`；声明校验/排序（SortKeyRegistry 单源，§5.7）/格式映射/原图策略/缺失语义/封面策略从 DAO+IPC 搬入；`isUnderPath` 抽离；**Logger 日志服务**（§5.9）；**官方功能补强**：文本格式进 fileFormatMap + code viewer（L2）、`item:openWithSystem` IPC（L0/L1 兜底）；API 索引表落档（[API.md](API.md)） | 纯重构行为不变：typecheck 通过 + 扫描/搜索/打标/排序回归一致；文本可预览、未知格式双击系统打开；日志落盘可查 | 本 RFC §五/§六 |
| **P0 契约落地** | manifest `apiVersion`/`contributes` schema 校验（拒绝加载不合规） | 不合规插件加载报错清晰；hello 示例带 apiVersion | P0.5 |
| **P1 领域 API + 事件** | `ctx.app.*` 接线到**领域服务层**（§7.5 映射表）；service 事件 emit → host 分发 + `event:plugin` 补接线；`app.write`/`fs.write` 权限 | 用 hello 插件演示：`ctx.app.search.global` 查库 + 订阅 `scan:completed` | P0 |
| **P1.5 官方扩展包起步（候选）** | epub 元数据提取器作为**第一个官方扩展包**（走插件 API，L1） | epub 条目可索引/搜索/打标，详情显示作者/页数 | P1 |
| **P2 贡献点 v1** | `commands`/`menus.itemContext`/`settings` 渲染与执行路径（`onCommand`） | 示例插件：条目右键菜单"复制路径"；设置页插件分区可编辑 | P1 |
| **P3 生命周期与存储** | `deactivate` 接线、`ctx.app.storage`、热重载（v1.5） | 移除插件目录 → 自动卸载且无泄漏；storage 持久化往返 | P1 |
| **P4 类型 SDK + 示例重写** | `@taghit/api` d.ts；hello 示例升级为 TS 双示范（后台工具 + 贡献点） | 插件作者按 d.ts 开发有完整类型提示 | P2/P3 |
| **P5 隔离（已搁置）** | worker_threads 执行 + 能力令牌（§8.3） | 生态定位若从"半可信"变更（开放第三方市场）时启动 | 生态定位决策（已定：半可信） |

建议节奏：P0.5 单独提交（纯重构，先立契约基座）；P0–P1 一次提交（契约最小闭环，风险可控）；P1.5 视精力；P2 单独提交；P3–P4 视精力；P5 挂起。

---

## 十、契约冻结与演进流程

1. **冻结条件**：首个第三方插件（非 hello 示例）发布之日，v1 契约冻结。
2. **冻结后变更分级**：
   - **兼容增补**（新命令、新事件、新可选字段）：小版本，直接加。
   - **破坏性变更**（API 签名变化、字段删除、语义变化）：必须 bump `apiVersion` major，宿主支持双版本并行加载（manifest 声明各自 apiVersion），并提供官方迁移指南。
3. **RFC 驱动**：任何破坏性变更先更新本 RFC 再实施；本 RFC 即契约的"单一事实来源"。

---

## 十一、风险与待决策

| # | 待决策项 | 影响 | 建议 |
|---|---|---|---|
| 1 | **生态定位**：官方/半可信 vs 开放第三方市场 | 决定 P5 隔离是否硬前提 | ✅ **已决策（2026-08-23）：官方/半可信插件**。v1 引导式权限够用；P5 隔离降级为"按需"，无限期搁置，直至生态定位变更 |
| 2 | 自定义视图（`views` 贡献点）的技术路线 | 决定 UI 生态上限 | v1 不做；v2 候选：受限 DOM 挂载点 / webview / 声明式表单（倾向声明式表单先行） |
| 3 | **预览器贡献点的渲染层机制**（§6.5） | 决定 L2/L3 插件预览能力 | v1 不做；webview / 渲染层插件桥 / 官方扩展包专属捷径三路线，随 §11-2 一并评估 |
| 4 | 插件参与索引管线（元数据提取器/缩略图生成器贡献点） | TagHit 特色：AI 提取、自定义解析器可插拔 | 官方扩展包先行（P1.5 epub），随 AI 功能一并设计 |
| 5 | ESM 插件支持 | `.cjs` 约束限制现代插件开发体验 | v2；先以 TS→CJS 编译缓解 |
| 6 | 插件市场/包格式（.taghit 压缩包 + 校验和 + 版本依赖） | 分发渠道 | 生态定位确认后再设计（已定半可信 → 暂缓） |

---

## 十二、附：与现有代码的对应关系

> 领域服务 API 索引表见独立文档 **[API.md](API.md)**（权威仍是 TS 类型，表格用于导航）。

| 本 RFC 概念 | 现有代码 |
|---|---|
| 宿主 | `src/main/plugins/host.ts`（`PluginHost`） |
| 清单加载/入口校验 | `src/main/plugins/registry.ts` |
| ctx 注入 | `src/main/plugins/runtime.ts`（`createPluginContext`） |
| 领域服务层（§五，P0.5 新建/收拢） | 现有：`core/tag/tag.service.ts`、`core/search/search.service.ts`、`core/config.ts`；收拢目标：`core/item/item.service.ts`、`core/workspace/workspace.service.ts`；DAO：`item.dao.ts`、`workspace.dao.ts` |
| 内容来源 provider | 现有：`src/main/protocol.ts`（`taghit-file://` 本地协议）；未来：插件 provider 贡献点 |
| 元数据提取器 | `src/main/core/metadata/extractor.ts`（image-size / ffprobe）；未来：插件 extractor 贡献点 |
| 事件通道 | `src/shared/ipc.ts`（`IPC.event.plugin`）、`src/main/events.ts`（`AppEventBus`） |
| 渲染层消费 | `src/shared/api.ts`（`window.api.plugin.*`）、`src/renderer/src/components/layout/PluginsPanel.vue` |
| IPC 注册 | `src/main/ipc/plugin.ts` |
| 示例插件 | `resources/plugins/hello/` |

---

*本文档为设计基线；实施时若发现与代码现实冲突，以"更新本 RFC + 在实现 commit 中说明"为准，不静默偏离。*

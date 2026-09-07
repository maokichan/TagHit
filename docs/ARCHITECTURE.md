# TagHit 架构与宿主（ARCHITECTURE）

> 架构活体文档：讲"东西放哪、为什么"。进度与下一步**只在 CONTEXT §三**跟踪，本文件不含状态。
> 渲染/宿主话题自 §三 起，与后端核心分节独立，读后端时可跳过。

## 一、后端核心（核心对渲染层/插件一无所知）

```
应用层 src/application  —— 用例编排（打标/浏览+投影/检索/维护/删除级联/扫描/内容读取），无状态
   │  调领域规则与端口
领域层 src/domain       —— types（实体+关系行）· rules（纯规则）· errors；零依赖
端口 src/ports          —— 契约第一公民 = 流动类型；动词薄按用例反推；查询下沉条件对象
适配器 src/adapters     —— memory（Store+假FS）· sqlite（SqliteStore，驱动注入）· node（NodeFileSystem）
```

- 存储契约全局约定：异步；实体写严格（NOT_FOUND/CONFLICT/INVALID）；关系写幂等；读宽松；事务 = 边界原子性、一致性编排在用例。详见 DECISIONS 与 `src/ports/store.ts` 头部。
- 校准文化：无测试设施（code-first 校准理解）；memory 与 sqlite 跑同一场景，契约一致才绿。
- 工作区 ↔ 条目模型（来源根 → 路径节点 → 归属派生）与两阶段扫描已落地；扫描 missing 策略 keep/discard 可配；内容签名三采样点；图片固有尺寸扫描时从文件头解析（application/mediaMeta.ts，零依赖，见 D15）。

## 二、渲染层与宿主（已落地）

### 分层与落点

```
frontend/   渲染 UI（Vue3 + Pinia + router + Tailwind；已接窄桥）
   │  window.taghit（typed 窄桥 + 信封 {ok,data}|{ok:false,error}；stores 经 shared/api 门面解包）
src/host/   主进程装配：openSqlite(better-sqlite3) → SqliteStore + 真时钟/UUID + 逐端点注册用例 + taghit-file 协议；隔离窗口
契约单一事实源 = src/host/ipc.ts（已裁决，2026-09-06）；frontend/src/shared/contract.ts
             仅 type-only 再导出（tsconfig alias @host/*），渲染层零运行时依赖
```

- **边界纪律**：渲染层只认 uri；渲染层拿不到 Store/裸 Node——一切走窄桥用例；D9 错误按信封 code 转文案（frontend/shared/api.ts）。
- **SQLite 驱动注入（D14）**：适配层只认最小接口 `SyncSqlite`；node:sqlite 在 nodeDriver.ts（Node ≥22 校准用），Electron 主进程注入 better-sqlite3（ABI 匹配 Electron，根 node_modules）。node:sqlite 不进 Electron 打包产物。
- **字节闸门（D15）**：媒体经 `host/protocol.ts` 的 taghit-file:// 特权协议（白名单 = 各工作区来源根 + userData，从 Store 端口查；Range/MIME/ACAO）；文本经 `item.readText` 窄桥（application/content.ts：TEXT_EXTS 白名单 + 2MiB 上限）。
- **打包与真机运行**：esbuild 打 src/host → build/main.cjs + preload.cjs（external: electron/better-sqlite3）；`npm run bundle:host` / `dev:renderer` / `start:host`（命令细节见 CONTEXT §五）。
- 数据流约定：渲染层持**视图状态**（工作区/勾选 tag/排序/页码）；任何改动 = 改意图 → 窄桥调用一次用例 → 失效并重查；**不本地排序/过滤**（分页语义依赖适配器一次完成）。

### 渲染层功能组件（贡献点 v0）

- `frontend/src/renderer/src/features/registry.ts` + `shared/types/feature.ts`：**注册表 = 声明表**——可序列化 FeatureManifest（槽位/settings）+ 按来源分层的实现绑定 FeatureImpl（official 构建期直连 / contributed 运行期 loader，类型先行未接线）；壳经 `listFeatures(mount)` 查表渲染，不 import 具体组件。错误隔离两条线：setup 调用处 try/catch（registry）+ 槽渲染 FeatureBoundary（onErrorCaptured）；生命周期 per-entry（setup/dispose 配对 + unregisterFeature，三方启停/卸载的承载）。同构验收：任一官方组件的 impl 换成 load 形态后壳行为不变。
- **注册必须先于 app.mount**（App.vue 挂载时读注册表——顺序错了活动栏就是空轨，踩过）。
- freeze 0.1 `main/plugins/*` + `shared/types/plugin.ts`：0.1 的两套未统一插件雏形（UI 功能 vs 主进程工具），0.2 在此统一。

## 三、前端与插件方向（已共识）

- **插件 = 提供程序所没有的能力**：UI 增强（面板/展示/命令）→ 渲染层贡献点；复杂运算/程序外能力（OCR、哈希、转码、扫描等）→ **主进程能力工具** + manifest 声明式权限。两层都经统一 **HostApi 门面**（= 冻结的应用层用例 + 事件），核心保持对插件无知。
- **壳 = 插件容器与展示层**（不只 UI）：布局、标签页、面板拖拽/显隐都是壳/官方功能的行为。
- **贡献点 v0**：`activityBar:left/right` · 内容区标签页 · `displayPanel` 块（排序/显隐）· `settings`。**不做任意跨区停靠（完整 dock）**。
- 官方功能组件：居**左活动栏**（工具间切换/显隐）。三方插件：**左、右活动栏均可**，displayPanel 内可贡献块。
- 官方与三方插件：**注册机制同构**、信任/生命周期分层（官方静态可信；三方走动态加载、错误隔离、权限门、卸载清理）。性能用**惰性加载（激活条件 → 用时才 import）+ 事件仅推活跃订阅者**控制，同构不引入固定开销。
- **契约优先**：贡献点 + HostApi + 生命周期先立为稳定面（对插件作者是 API 契约）；先用**垂直切片**证明机制，再批量改造。

### 3.1 贡献点机制：选型理由与两个概念（2026-09-06 定稿）

**为什么是贡献点，而不是别的扩展方式**——三条既有裁决把选项收敛到唯一：

- 扩展方式候选与否决理由：
  - *自由 API 式*（暴露全局对象随便调/随便渲染）：插件绕开"改动 → 窄桥 → 失效重查"的数据流单通道，投影语义（声明裁剪/hiddenCount）会出现第二份实现。否。
  - *钩子/拦截式*（插件插进查询/扫描等核心流程）：让插件进入核心**控制流**；行为归属被稀释（流程在应用层、事务边界在用例），插件 bug 从"一块面板坏了"升级成"一次扫描/删除坏了"，还要定义顺序/await/抛错语义。否。
  - *中间件/管道式*：钩子变体，主流程（浏览/打标/扫描）不是管道形状。否。
  - *贡献点式*（VS Code 模型）：**壳声明槽位，插件只声明填充物**，壳按声明渲染，核心 import 图里永远没有插件。控制权反转，上述三条裁决全部保住。
- 贡献点的三个对应价值：① 服务"壳 = 插件容器与展示层"裁决——布局/标签页/显隐是壳的权力，插件只能往槽里放东西；② 数据流不破——贡献物拿数据走 HostApi 门面，与官方 UI 同一条窄桥；③ 信任可分层——声明式注册使官方静态/三方动态共用一张表，差异只收敛在"从哪来、信多少、何时加载"。
- 性能裁决（惰性加载 + 事件仅推活跃订阅者）的着力点就是声明式 manifest：壳先读声明，激活条件满足才 import 实现。

**两个概念是同一机制的两面**，不是两套系统：

- **贡献点** = 壳侧的**槽**：`activityBar:left/right`、内容区标签页、`displayPanel` 块、`settings` 分区。回答"哪里可以插、插进来壳按什么规则渲染/排序/显隐"。槽是壳的权力清单（v0 不做任意 dock 就是这条清单的红线）。
- **功能组件** = 贡献侧的**插头**：`FeatureManifest`（id/title/source/mounts/settings）+ 组件实现 + setup 钩子。回答"我声明自己是什么、挂哪些槽、有哪些配置项"。
- **官方组件没有任何特权路径**：与三方走同一注册表（`features/registry.ts`），ActivityBar/DisplayPanel/SettingsPage 只问注册表"这个槽里有什么"，不 import 具体组件。官方组件是机制的持续测试桩。
- 真正的设计差异在三个**分层**维度（不在机制上）：
  1. 注册来源：官方 = 静态 import + 代码注册；三方 = 目录发现 + manifest 文件 + 惰性 import；
  2. 信任与权限：官方全信；三方要权限门（0.1 PluginManifest 的 fs/network/shell 声明届时并入）+ 每贡献块错误隔离；
  3. 生命周期：官方与版本同生共死；三方有安装/启停/卸载，事件订阅可退订、状态可丢弃。
- **同构验收标准**：把任一官方功能组件改成动态加载后，壳行为完全不变。做不到即同构失效。
- **注册表形状**（2026-09-07 落地）：注册表只存「可序列化声明 + 实现绑定」，两者分离是惰性加载与同构验收的类型前提——manifest（`shared/types/feature.ts`）是三方磁盘 JSON 的形状，实现绑定（`FeatureImpl`）按来源分层：official 直连、contributed loader。错误隔离与生命周期是机制层而非官方特权：setup try/catch + 槽渲染 FeatureBoundary（onErrorCaptured）两条隔离线，官方组件同边界通过；setup/dispose 按 per-entry 配对，unregisterFeature 承载三方卸载。

**应用层不驻插件**（选型推论，单向铁律）：

- 三方代码不进主进程核心。"插件跑进应用层"技术上可行，但会同时击穿：信任边界（主进程直接摸 Store/fs）、事务语义（用例 = 单事务边界）、行为归属（删插件不应改变业务行为）、内部 API 冻结（用例签名是演进面，HostApi 才是冻结面）。
- 重运算（OCR/转码/哈希）= **主进程能力工具**：宿主调用、结果返回、不持有 Store、不进事务，经 manifest 权限闸门。
- 预留：未来若需"插件提供扫描期文件解析器/哈希器"，走**窄领域端口 + 独立进程**（Electron utilityProcess）实现，宿主拉起并注册，用例照常调端口——依赖仍只向内，插件 crash 不带崩宿主。不做流程钩子。

### 3.2 呈现面三分类与右键菜单标准化（2026-09-07 定稿）

插件 UI 落在壳里的方式收敛为**三类呈现面**，装配模型各不相同：

| 类别 | 例子 | 装配模型 |
|---|---|---|
| 停靠面 docked | 活动栏工具面板、显示面板块、设置分区 | 一块槽一个贡献者，经声明表静态装配 |
| 服务面 service | 弹窗/确认/通知 | 壳提供的受控服务（经 FeatureContext 注入），调用时临时起；**不是插槽** |
| 调用面 invoked | 右键菜单、（未来）命令面板/快捷键 | **多贡献者，调用瞬间按上下文现场聚合** |

右键菜单是调用面的样板，也是贡献点机制里第一个要求"声明式条件"的槽（停靠槽常驻，无"何时出现"语义）。标准化四要件：

1. **原子 = 命令**：菜单项不是容器成员，是命令 + 摆放元数据；命令面板/快捷键都是命令注册表的视图——一套注册表，不做三套平行系统。`run(ctx)` 只经 HostApi 门面（改意图 → 窄桥 → 失效重查），数据流单通道不破；命令注册表同时是三方插件"可做的事"的权限清单底座。
2. **声明可序列化 + when 谓词**：命令 = 声明面（id/title/when/group/order，manifest 形状，三方为磁盘 JSON）+ 执行（handler 在实现侧），与 FeatureManifest/impl 分离同构。壳必须**不加载实现即可过滤菜单**，故 when 是壳可求值的最小谓词（targetIs/fieldEquals/all）；底线 = 相等/合取，不做表达式引擎。
3. **上下文目标注册**：组件不挂 contextmenu 监听，只声明"这块 DOM 是 context target"（data-ctx-*）；壳根部统一拦截、就近取 target、构造 MenuContext（target + workspaceId，未来加 selection 多选集）。事件拦截权归壳。
4. **装配规则归壳**：分组（nav/modify/danger）、分隔线、组内排序、溢出折叠全是壳的策略，插件只有 group/order 两个建议字段；危险动作壳强制沉底 + 警示。菜单**自绘**（主题一致、可注入插件项、Esc/失焦关闭），不用原生。

落地顺序：① 命令注册表 + 自绘 Menu + 官方命令做测试桩 → ② context target + 根部拦截 + 条目卡闭环 → ③ manifest 开放菜单贡献 + 权限（与 HostApi 冻结面裁决耦合，见 CONTEXT §三）。容器标准化（SurfaceHost 收拢停靠渲染 + dialog/toast 服务替换 window.confirm）平行推进。

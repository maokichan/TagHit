# TagHit 架构与宿主（ARCHITECTURE）

> 活体架构说明 + 当前状态。与 DECISIONS（裁决）互补：本文件讲"东西放哪、为什么、做到哪"。
> 渲染/宿主相关内容与后端核心**分节独立**（三、四节起全部是渲染层/宿主/插件话题，读后端时可跳过）。
> 版本：0.2.2 快照。

## 一、当前状态

- 后端核心已完成并通过校准：领域层 → 端口 → 应用层（首批用例 + 两阶段扫描）→ memory/sqlite/node 适配器；三份校准（s32/s33 × memory/sqlite）全绿。
- 宿主骨架已入库：typed IPC 窄桥 + 结果信封 + 装配（`src/host/`）；旧版 Vue 前端整体迁入 `frontend/`（依赖未装，待改造）。
- 产品方向已明确：**插件生态**（VSCode/Obsidian 式）。下一步主线 = 前端壳 + 宿主契约（见三、四）。
- 沙箱/真机事实：沙箱无网、无 GUI——不能 `npm i electron`/起窗口；freeze 里现成 `electron@33.4.11`（内嵌 **Node 20.18 < 23.4 → node:sqlite 不可用**，宿主 Store 需换 better-sqlite3 或升级 Electron，见 DECISIONS D13）；本机 node v24 直跑 TS 做校准。
- git：本地提交与 tag（v0.2.1、v0.2.2）已就绪，**push 由真人执行**（含 tag）。

## 二、后端核心（核心对渲染层/插件一无所知）

```
应用层 src/application  —— 用例编排（打标/浏览+投影/检索/维护/删除级联/扫描），无状态
   │  调领域规则与端口
领域层 src/domain       —— types（实体+关系行）· rules（纯规则）· errors；零依赖
端口 src/ports          —— 契约第一公民 = 流动类型；动词薄按用例反推；查询下沉条件对象
适配器 src/adapters     —— memory（Store+假FS）· sqlite（SqliteStore）· node（NodeFileSystem）
```

- 存储契约全局约定：异步；实体写严格（NOT_FOUND/CONFLICT/INVALID）；关系写幂等；读宽松；事务 = 边界原子性、一致性编排在用例。详见 DECISIONS 与 `src/ports/store.ts` 头部。
- 校准文化：无测试设施（code-first 校准理解）；memory 与 sqlite 跑同一场景，契约一致才绿。
- 工作区 ↔ 条目模型（来源根 → 路径节点 → 归属派生）与两阶段扫描已落地；扫描 missing 策略 keep/discard 可配；内容签名三采样点。

## 三、渲染层与宿主（前端壳 + Electron）

### 分层与落点

```
frontend/   渲染 UI（Vue3 + Pinia + router + Tailwind；已改造到新窄桥）
   │  window.taghit（typed 窄桥 + 信封 {ok,data}|{ok:false,error}；stores 经 shared/api 门面解包）
src/host/   主进程装配：SqliteStore(库文件) + 真时钟/UUID + 逐端点注册用例；隔离窗口
契约单一事实源 = src/host/ipc.ts（已裁决，2026-09-06）；frontend/src/shared/contract.ts
             仅 type-only 再导出（tsconfig alias @host/*），渲染层零运行时依赖
```

- **边界纪律**：渲染层只认 uri，字节经主进程闸门；渲染层拿不到 Store/裸 Node——一切走窄桥用例；D9 错误按信封 code 转文案（frontend/shared/api.ts ApiError 已做）。
- Electron 接线要点：宿主 Store 用 better-sqlite3（Electron 33 无 node:sqlite）；开发 = dev URL → 打包 = loadFile；preload 只暴露 `window.taghit`（contextIsolation）。
- 数据流约定：渲染层持**视图状态**（工作区/勾选 tag/排序/页码）；任何改动 = 改意图 → 窄桥调用一次用例 → 失效并重查；**不本地排序/过滤**（分页语义依赖适配器一次完成）。

### 旧版前端与 0.1 插件雏形（参考，不照抄）

- `frontend/src/renderer/src/features/registry.ts` + `shared/types/feature.ts`：FeatureManifest + MountPoint（activityBar:left/right、displayPanel、settings；statusBar/grid 预留）——官方组件注册、宿主按声明渲染。
- freeze 0.1 `main/plugins/*` + `shared/types/plugin.ts`：PluginManifest + 声明式权限（fs/network/shell）+ 工具调用模型。
- 0.1 是**两套未统一**的插件雏形（UI 功能 vs 主进程工具）；0.2 在此统一。

## 四、前端与插件方向（已共识）

- **插件 = 提供程序所没有的能力**：UI 增强（面板/展示/命令）→ 渲染层贡献点；复杂运算/程序外能力（OCR、哈希、转码、扫描等）→ **主进程能力工具** + manifest 声明式权限。两层都经统一 **HostApi 门面**（= 冻结的应用层用例 + 事件），核心保持对插件无知。
- **壳 = 插件容器与展示层**（不只 UI）：布局、标签页、面板拖拽/显隐都是壳/官方功能的行为。
- **贡献点 v0**：`activityBar:left/right` · 内容区标签页 · `displayPanel` 块（排序/显隐）· `settings`。**不做任意跨区停靠（完整 dock）**。
- 官方功能组件：居**左活动栏**（工具间切换/显隐）。三方插件：**左、右活动栏均可**，displayPanel 内可贡献块。
- 官方与三方插件：**注册机制同构**、信任/生命周期分层（官方静态可信；三方走动态加载、错误隔离、权限门、卸载清理）。性能用**惰性加载（激活条件 → 用时才 import）+ 事件仅推活跃订阅者**控制，同构不引入固定开销。
- **契约优先**：贡献点 + HostApi + 生命周期先立为稳定面（对插件作者是 API 契约）；先用一条**垂直切片**（一个官方 feature：Store → 用例 → HostApi → manifest → 壳内渲染全链路）证明机制，再批量把旧 UI 组件改造成官方 feature。

### 4.1 贡献点机制：选型理由与两个概念（2026-09-06 定稿）

**为什么是贡献点，而不是别的扩展方式**——三条既有裁决把选项收敛到唯一：

- 扩展方式候选与否决理由：
  - *自由 API 式*（暴露全局对象随便调/随便渲染）：插件绕开"改动 → 窄桥 → 失效重查"的数据流单通道，投影语义（声明裁剪/hiddenCount）会出现第二份实现。否。
  - *钩子/拦截式*（插件插进查询/扫描等核心流程）：让插件进入核心**控制流**；行为归属被稀释（流程在应用层、事务边界在用例），插件 bug 从"一块面板坏了"升级成"一次扫描/删除坏了"，还要定义顺序/await/抛错语义。否。
  - *中间件/管道式*：钩子变体，主流程（浏览/打标/扫描）不是管道形状。否。
  - *贡献点式*（VS Code 模型）：**宿主声明槽位，插件只声明填充物**，宿主按声明渲染，核心 import 图里永远没有插件。控制权反转，上述三条裁决全部保住。
- 贡献点的三个对应价值：① 服务"壳 = 插件容器与展示层"裁决——布局/标签页/显隐是壳的权力，插件只能往槽里放东西；② 数据流不破——贡献物拿数据走 HostApi 门面，与官方 UI 同一条窄桥；③ 信任可分层——声明式注册使官方静态/三方动态共用一张表，差异只收敛在"从哪来、信多少、何时加载"。
- 性能裁决（惰性加载 + 事件仅推活跃订阅者）的着力点就是声明式 manifest：宿主先读声明，激活条件满足才 import 实现。

**两个概念是同一机制的两面**，不是两套系统：

- **贡献点** = 宿主侧的**槽**：`activityBar:left/right`、内容区标签页、`displayPanel` 块、`settings` 分区。回答"哪里可以插、插进来宿主按什么规则渲染/排序/显隐"。槽是壳的权力清单（v0 不做任意 dock 就是这条清单的红线）。
- **功能组件** = 贡献侧的**插头**：`FeatureManifest`（id/title/source/mounts/settings）+ 组件实现 + setup 钩子。回答"我声明自己是什么、挂哪些槽、有哪些配置项"。
- **官方组件没有任何特权路径**：与三方走同一注册表（`features/registry.ts`），ActivityBar/DisplayPanel/SettingsPage 只问注册表"这个槽里有什么"，不 import 具体组件。官方组件是机制的持续测试桩。
- 真正的设计差异在三个**分层**维度（不在机制上）：
  1. 注册来源：官方 = 静态 import + 代码注册；三方 = 目录发现 + manifest 文件 + 惰性 import；
  2. 信任与权限：官方全信；三方要权限门（0.1 PluginManifest 的 fs/network/shell 声明届时并入）+ 每贡献块错误隔离；
  3. 生命周期：官方与版本同生共死；三方有安装/启停/卸载，事件订阅可退订、状态可丢弃。
- **同构验收标准**：把任一官方功能组件改成动态加载后，宿主行为完全不变。做不到即同构失效。

**应用层不驻插件**（选型推论，单向铁律）：

- 三方代码不进主进程核心。"插件跑进应用层"技术上可行，但会同时击穿：信任边界（主进程直接摸 Store/fs）、事务语义（用例 = 单事务边界）、行为归属（删插件不应改变业务行为）、内部 API 冻结（用例签名是演进面，HostApi 才是冻结面）。
- 重运算（OCR/转码/哈希）= **主进程能力工具**：宿主调用、结果返回、不持有 Store、不进事务，经 manifest 权限闸门。
- 预留：未来若需"插件提供扫描期文件解析器/哈希器"，走**窄领域端口 + 独立进程**（Electron utilityProcess）实现，宿主拉起并注册，用例照常调端口——依赖仍只向内，插件 crash 不带崩宿主。不做流程钩子。

## 五、下一步与 backlog

1. ✅ 宿主契约 v0（2026-09-06）：IpcContracts 32 端点（标签/条目/工作区/扫描/作品/组）+ 统一信封；薄用例补 createTag/declare/undeclare 与 workspace create/list/get/listRoots。
2. ✅ 旧 UI 吸收（2026-09-06）：frontend 全量换轨 window.taghit（shared/api 门面 + D9 文案；stores/视图/组件改字符串 id）；降级项：config 持久化、原生 dialog、缩略图/媒体预览（字节闸门）、插件面板、标签层级、媒体类型筛选。扫描进度事件随 D6 落地。
3. ✅ 贡献点 v0 类型化（2026-09-06）：FeatureManifest 加 source 信任层；setup 可退订（Disposer）；活动栏左右槽由注册表驱动（壳不再硬编码面板组件）；垂直切片 = workspaceInfo 官方组件消费 HostApi（listRoots/declaredTags）。contentTab 槽未实现（壳标签页仍为固定四类）。
4. 真机接线：electron + better-sqlite3 驱动、dev/打包；缩略图/uri 字节闸门（预览/缩略图恢复）。
5. 后端沿切片补能力：节点开关薄用例、标签语义带出、EAV 元数据建模、事件（D6）。
6. 收尾：LICENSE、CI/脚本入口、批量未 push 提交与 tag。

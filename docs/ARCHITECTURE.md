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
frontend/   渲染 UI（Vue3 + Pinia + router + Tailwind，迁自 0.1，待改造到新窄桥）
   │  window.taghit（typed 窄桥，src/host/ipc.ts 契约 + 信封 {ok,data}|{ok:false,error}）
src/host/   主进程装配：SqliteStore(库文件) + 真时钟/UUID + 逐端点注册用例；隔离窗口
src/shared-契约 → 计划移入 frontend/src/shared 或 src/host（单一事实源待定）
```

- **边界纪律**：渲染层只认 uri，字节经主进程闸门；渲染层拿不到 Store/裸 Node——一切走窄桥用例；D9 错误按信封 code 转文案（待 UI 侧做）。
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

## 五、下一步与 backlog

1. 宿主契约 v0（贡献点/HostApi/生命周期类型草案；与 `src/host` 窄桥对齐）。
2. 垂直切片（官方 feature 全链路）→ 前端逐步改造（按用户思路）。
3. 真机接线：electron + better-sqlite3 驱动、dev/打包；D9 UI 文案；缩略图/uri 字节闸门。
4. 后端沿切片补能力：声明/节点开关薄用例、标签语义带出、EAV 元数据建模、事件（D6）。
5. 收尾：LICENSE、CI/脚本入口、批量未 push 提交与 tag。

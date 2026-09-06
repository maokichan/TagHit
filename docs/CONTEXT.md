# TagHit 开发交接（CONTEXT）

> 记录：2026-09-05。目的：**跨 session 交接点**——新 session 的 AI 先读本文件即可接上"项目是什么、进行到哪、下一步做什么、有什么纪律"。
> 必读顺序：**README.md → 本文件 → docs/GLOSSARY.md → docs/DECISIONS.md → src/domain/ → src/ports/ → src/application/**。

## 一、项目与状态（一句话）

TagHit 是多源内容标记与检索管理器，正在做 **0.2 领域先行重写**：领域层、端口、内存/SQLite 双适配器、应用层首批用例与两阶段扫描均已落地（三种校准全绿）；下一步是前端复用改造与真实 node:fs 宿主接线。旧资产（Tauri 原型、Electron 0.1.x 全量含 git 历史）在 `../freeze/`。

## 二、架构与关键裁决（详见 GLOSSARY / DECISIONS）

- 六边形分层：渲染层 → 应用层（首批用例 + 收录扫描已落地 `src/application`；事件规划中）→ 领域层 `src/domain` → 端口 `src/ports`（接口，已落地）→ 适配器 `src/adapters`（memory + sqlite 均已落地）。依赖只向内。
- 实体：条目 item（素材 / 空条目·锚）、工作区（索引容器，不拥有条目）、标签、作品（有序容器 + 锚条目承载标签）、组、路径节点（扫描产物）。
- 挂载 = 条目 × 标签（条目级）；声明 = 工作区 × 标签（**读取端投影**：取条目返回全部标签，未声明者不交付该工作区）。
- 标签关联 = 有向 tag → tag，**领域不解义**；语义词一律不许写进领域层。
- 条目去重、mediaType 等一概不在领域层建模（去重是扫描行为；mediaType 只是元信息键）。
- **工作区 ↔ 条目**：可见性为**派生**——工作区拥有**来源根**（配置行）→ 扫描在其下创建/维护**路径节点**（含根节点，带 included/excluded 状态）→ 条目的直接节点**不落库**，浏览时以 sourceUri 父目录 == 节点 dirPath 派生；节点 excluded 只隐藏其直接条目，不级联。**已落地**：`scanWorkspace` 维护节点与条目（消失策略 keep/discard 可配）、`browseWorkspace` 做成员派生 + 声明投影。
- **存储**：单体 Store + 事务（`src/ports/store.ts`）；查询下沉到存储，复杂查询用可扩展条件对象。端口契约以**流动类型**为第一公民、动词按用例收窄；实体与关系行记录（含成员行）全在 `domain/types.ts`。事务 = 边界暴露的原子性（ACID）、不支持嵌套；一致性边界在应用层用例（删除级联、扫描均单事务编排）。全局约定：异步边界、实体写严格（NOT_FOUND/CONFLICT/INVALID）、关系写幂等、读宽松。
- **适配器一致性**：memory 与 sqlite 跑同一份场景验证契约（scripts/s32-scenario.ts 44 断言；scripts/s33-scan-scenario.ts 15 断言）。SQLite 外键会暴露内存适配器检查不到的排序依赖（如删作品须先删 collection 行再级联删锚条目）。

## 三、已完成

- 旧版归档（`freeze/TagHit-Electron-0.1.2`，含审计文档与 git）；git 历史已继承到本仓库。
- 文档精简：GLOSSARY / DECISIONS / 本文件；README 是项目说明（定位、架构、原因）。
- 领域层：`types.ts`（实体 + 全部关系行记录，含 `CollectionMember`(带 position)、`GroupMember`，及工作区-来源路径模型 `WorkspaceRoot`/`PathNode`/`NodeState`）、`rules.ts`（纯规则）、`errors.ts`。
- 端口：`src/ports/system.ts`（Clock/IdGen）· `filesystem.ts`（walk/stat/readHead/hash 三采样签名）· `store.ts`（单体 Store + 事务 + ItemsQuery/TagsQuery 条件对象 + 来源根/路径节点动词）。
- 内存适配器：`src/adapters/memory/store.ts`（`MemoryStore`，clone-on-write 事务）· `fs.ts`（`MemoryFileSystem`，确定性假 FS）。
- SQLite 适配器：`src/adapters/sqlite/store.ts`（`SqliteStore`，node:sqlite 内置驱动、外键、事务；v1 schema 内嵌）。
- 应用层：首批用例（tagging/browse/search/collection/group/cascade）+ `scan.ts`（两阶段扫描、挂载/卸载来源根、missing 策略）+ `paths.ts`（父目录/文件名派生）+ `services.ts`。
- 校准：`s32-scenario.ts`（首批六用例 + 节点排除，44 断言）双跑（calibrate / calibrate:sqlite）；`s33-scan-scenario.ts`（扫描场景，15 断言）双跑（calibrate:scan）。node v24 直接执行 TS。
- 宿主骨架：`src/adapters/node/fs.ts`（`NodeFileSystem`，真实 fs，与假 FS 同采样签名）· `src/host/`（`ipc.ts` 类型化窄桥契约 + 结果信封；`main.ts` 装配 SqliteStore/真时钟/UUID 并注册端点；`preload.ts` 暴露 `window.taghit`）。**不含 electron 依赖**：渲染端仍需引入并在真实机接线。
- 五个 tsconfig（domain / ports / adapters / application / host）逐层覆盖依赖；**无测试设施**（按用户要求先出代码校准理解）。

## 四、下一步（前端 → 真实机宿主接线）

1. 前端（渲染层）复用改造：沿用 freeze 旧版界面，UI 只调 `window.taghit`（typed IPC 窄桥）与 uri/字节闸门；D9 错误转译按信封 code 落地。
2. 真实机接线（沙箱外）：`npm i -D electron`（+ 前端构建链）；验证内嵌 Node ≥ 23.4（否则宿主层换 better-sqlite3 实现同一 Store，见 D13）；dev URL / 打包 loadFile。
3. 补扫描/浏览类 IPC 端点（NodeFileSystem 注入 scanWorkspace）；事件机制（D6）、后台增量扫描 / 子树整体排除（parked）。

## 五、纪律（防止新 session 跑偏；都踩过坑）

1. **层纪律**：领域层只有类型与纯规则，绝不持有存储、不做 IO；流程进应用层；存储实现放适配器。不要造"实体 + 存储 + CRUD"一锅端的类。端口只声明"流动类型 + 薄动词"的契约，不做业务判定。
2. **术语纪律**：只用 GLOSSARY 里的词。**不要自行引入**未收录的术语或关系语义（如"is-a/继承/修饰/上溯"曾被单方面引入造成幻觉，已全部清除）；语义预设词禁止写入领域层。
3. **文档纪律**：文档已精简，禁止加轮次记录/自指声明/冗余解释；只维护 GLOSSARY / DECISIONS / CONTEXT 三份。
4. **不预建模**：parked 项（C-S、作品嵌套/多归属、子树整体排除、增量扫描等）不进代码不进决策。
5. 提交前所改层的 `tsc -p tsconfig.<domain|ports|adapters|application>.json` 必须通过；同一语义变更同步更新对应文档行（改动即同步，不留到下次）。改适配器/端口契约后 calibrate、calibrate:sqlite、（涉及扫描则 calibrate:scan）都要跑。

## 六、环境与 git

- 本仓库无 node_modules：类型检查用存档的 tsc（五个配置：domain / ports / adapters / application / host）：
  `& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.domain.json`
  （或先 `npm install --no-audit --no-fund` 后 `npm run typecheck:domain|ports|adapters|application|host`。）
- 本机 node v24：直接 `node 脚本.ts` 跑 TS（内置 node:sqlite / node:crypto，零第三方依赖）。
- 校准：`npm run calibrate`（s32 memory）· `calibrate:sqlite`（s32 sqlite）· `calibrate:scan`（s33 memory + sqlite）。
- git：本地提交可做；**push 由真人执行**（沙箱无凭据，见 `../NETWORK.md`）。提交身份已配置（Maokichan）。

## 七、文件地图

```
TagHit/
├── README.md · package.json · tsconfig.{domain,ports,adapters,application,host}.json · .gitignore
├── docs/          CONTEXT.md（本文件）· GLOSSARY.md（词汇）· DECISIONS.md（分层/裁决/范围）
├── src/domain/    types.ts · rules.ts · errors.ts · index.ts
├── src/ports/     system.ts（Clock/IdGen）· filesystem.ts（walk/stat/readHead/hash）· store.ts · index.ts
├── src/adapters/  memory/store.ts（MemoryStore）· memory/fs.ts（MemoryFileSystem）
│                  sqlite/store.ts（SqliteStore）· sqlite/index.ts · sqlite/sqlite.d.ts
│                  node/fs.ts（NodeFileSystem）· sample-hash.ts · node-builtins.d.ts
├── src/application/  services.ts · paths.ts · tagging.ts · browse.ts · search.ts · collection.ts
│                  group.ts · cascade.ts · scan.ts · index.ts
├── src/host/      main.ts（装配+IPC 注册）· preload.ts（window.taghit）· ipc.ts（窄桥契约）· env.d.ts
└── scripts/       s32-scenario.ts · s32-calibrate.ts · s32-calibrate-sqlite.ts
                   s33-scan-scenario.ts · s33-scan-calibrate.ts
```

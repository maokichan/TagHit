# TagHit 开发交接（CONTEXT）

> 记录：2026-09-05。目的：**跨 session 交接点**——新 session 的 AI 先读本文件即可接上"项目是什么、进行到哪、下一步做什么、有什么纪律"。
> 必读顺序：**README.md → 本文件 → docs/GLOSSARY.md → docs/DECISIONS.md → src/domain/ → src/ports/**。

## 一、项目与状态（一句话）

TagHit 是多源内容标记与检索管理器，正在做 **0.2 领域先行重写**：领域层、端口接口与内存 Store 适配器已落地（纯 TS，无运行时依赖）；下一步是应用层首批用例与 SQLite 适配器，旧版界面待复用改造。旧资产（Tauri 原型、Electron 0.1.x 全量含 git 历史）在 `../freeze/`。

## 二、架构与关键裁决（详见 GLOSSARY / DECISIONS）

- 六边形分层：渲染层 → 应用层（用例编排，规划中）→ 领域层 `src/domain` → 端口 `src/ports`（接口，已落地）→ 适配器 `src/adapters`（内存先行，SQLite 规划中）。依赖只向内。
- 实体：条目 item（素材 / 空条目·锚）、工作区（索引容器，不拥有条目）、标签、作品（有序容器 + 锚条目承载标签）、组。
- 挂载 = 条目 × 标签（条目级）；声明 = 工作区 × 标签（**读取端投影**：取条目返回全部标签，未声明者不交付该工作区）。
- 标签关联 = 有向 tag → tag，**领域不解义**；语义词一律不许写进领域层。
- 条目去重、mediaType 等一概不在领域层建模（去重是扫描行为；mediaType 只是元信息键）。
- **存储**：单体 Store + 事务（`src/ports/store.ts`）；查询下沉到存储，复杂查询用可扩展条件对象。端口契约以**流动类型**为第一公民、动词按用例收窄；实体与关系行记录（含成员行）全在 `domain/types.ts`。事务 = 边界暴露的原子性（ACID）、不支持嵌套；一致性边界在应用层用例。全局约定：异步边界、实体写严格（NOT_FOUND/CONFLICT/INVALID）、关系写幂等、读宽松。

## 三、已完成

- 旧版归档（`freeze/TagHit-Electron-0.1.2`，含审计文档与 git）；git 历史已继承到本仓库。
- 文档精简：GLOSSARY / DECISIONS / 本文件；README 是项目说明（定位、架构、原因）。
- 领域层：`types.ts`（实体 + 全部关系行记录，含 `CollectionMember`(带 position) 与 `GroupMember`）、`rules.ts`（纯规则：标签名唯一、自环、同向重复判定）、`errors.ts`。
- 端口：`src/ports/system.ts`（Clock/IdGen）· `filesystem.ts`（walk/stat/readHead）· `store.ts`（单体 Store + 事务 + ItemsQuery/TagsQuery 条件对象）。
- 内存适配器：`src/adapters/memory/store.ts`（`MemoryStore`，clone-on-write 模拟事务回滚；严格/幂等/宽松按端口全局约定）。
- 三个 tsconfig（domain / ports / adapters）逐层覆盖依赖；**无测试设施**（按用户要求先出代码校准理解）。

## 四、下一步（应用层首批用例 → SQLite）

1. **应用层用例**（`src/application/`，规划中）：跑通首批六用例——打标/卸标、浏览 + 声明投影、检索、组与作品维护、删除级联。用例调 domain 规则 + Store 端口，复合写在用例内开 `transaction`。内存 Store 已可直跑；本机 node v24 可直接执行 TS 脚本做校准。
2. SQLite v1 schema + `SqliteStore` 适配器（同一 Store 接口）。
3. 两阶段扫描（路径遍历 + 条目级）、前端复用改造。

## 五、纪律（防止新 session 跑偏；都踩过坑）

1. **层纪律**：领域层只有类型与纯规则，绝不持有存储、不做 IO；流程进应用层；存储实现放适配器。不要造"实体 + 存储 + CRUD"一锅端的类。端口只声明"流动类型 + 薄动词"的契约，不做业务判定。
2. **术语纪律**：只用 GLOSSARY 里的词。**不要自行引入**未收录的术语或关系语义（如"is-a/继承/修饰/上溯"曾被单方面引入造成幻觉，已全部清除）；语义预设词禁止写入领域层。
3. **文档纪律**：文档已精简，禁止加轮次记录/自指声明/冗余解释；只维护 GLOSSARY / DECISIONS / CONTEXT 三份。
4. **不预建模**：parked 项（C-S、作品嵌套/多归属等）不进代码不进决策。
5. 提交前所改层的 `tsc -p tsconfig.<domain|ports|adapters>.json` 必须通过；同一语义变更同步更新对应文档行。

## 六、环境与 git

- 本仓库无 node_modules：类型检查用存档的 tsc（三个配置：domain / ports / adapters）：
  `& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.domain.json`
  （或先 `npm install --no-audit --no-fund` 后 `npm run typecheck:domain|ports|adapters`。）
- 本机 node v24，可直接 `node 脚本.ts` 跑无运行时依赖的 TS（开发校准用）。
- git：本地提交可做；**push 由真人执行**（沙箱无凭据，见 `../NETWORK.md`）。提交身份已配置（Maokichan）。

## 七、文件地图

```
TagHit/
├── README.md · package.json · tsconfig.{domain,ports,adapters}.json · .gitignore
├── docs/         CONTEXT.md（本文件）· GLOSSARY.md（词汇）· DECISIONS.md（分层/裁决/范围）
├── src/domain/   types.ts · rules.ts · errors.ts · index.ts
├── src/ports/    system.ts（Clock/IdGen）· filesystem.ts · store.ts · index.ts
└── src/adapters/ memory/store.ts（MemoryStore）· memory/index.ts（createMemoryStore）
```

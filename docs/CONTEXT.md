# TagHit 开发交接（CONTEXT）

> 记录：2026-09-05（上午会话收尾）。目的：**跨 session 交接点**——新 session 的 AI 先读本文件即可接上"项目是什么、进行到哪、下一步做什么、有什么纪律"。
> 必读顺序：**README.md → 本文件 → docs/GLOSSARY.md → docs/DECISIONS.md → src/domain/**。

## 一、项目与状态（一句话）

TagHit 是多源内容标记与检索管理器，正在做 **0.2 领域先行重写**：目前只有领域层初版（纯 TS，无存储无 IO），应用层/端口/适配器规划中，旧版界面待复用改造。旧资产（Tauri 原型、Electron 0.1.x 全量含 git 历史）在 `../freeze/`。

## 二、架构与关键裁决（详见 GLOSSARY / DECISIONS）

- 六边形分层：渲染层 → 应用层（用例编排，规划中）→ 领域层 `src/domain` → 端口/适配器（规划中）。依赖只向内。
- 实体：条目 item（素材 / 空条目·锚）、工作区（索引容器，不拥有条目）、标签、作品（有序容器 + 锚条目承载标签）、组。
- 挂载 = 条目 × 标签（条目级）；声明 = 工作区 × 标签（**读取端投影**：取条目返回全部标签，未声明者不交付该工作区）。
- 标签关联 = 有向 tag → tag，**领域不解义**；语义词一律不许写进领域层。
- 条目去重、mediaType 等一概不在领域层建模（去重是扫描行为；mediaType 只是元信息键）。
- **上午已定**：存储端口 = **单体 Store + 事务**；**查询全部下沉到存储**，复杂查询用可扩展条件对象（不为每界面预造方法，不预造通用查询引擎）。

## 三、已完成

- 旧版归档（`freeze/TagHit-Electron-0.1.2`，含审计文档与 git）；git 历史已继承到本仓库。
- 文档精简：GLOSSARY / DECISIONS / 本文件；README 是项目说明（定位、架构、原因）。
- 领域层：`types.ts`（实体/关系记录）、`rules.ts`（纯规则：标签名唯一、自环、同向重复判定）、`errors.ts`。**无测试设施**（按用户要求先出代码校准理解）。

## 四、下一步（S3：端口 + 应用层）

1. 定义端口：`Store`（单体 + 事务；标签/条目/关联/声明/组/作品的读写 + 下沉查询条件对象）、`FileSystem`（walk/stat/readHead）、`Clock`/`IdGen`（注入）。
2. 内存适配 Store，跑通首批应用用例：打标/卸标、浏览 + 声明投影、检索、组与作品维护、删除级联。
3. 之后：SQLite v1 schema、两阶段扫描（路径遍历 + 条目级）、前端复用改造。

## 五、纪律（防止新 session 跑偏；都踩过坑）

1. **层纪律**：领域层只有类型与纯规则，绝不持有存储、不做 IO；流程进应用层；存储实现放适配器。不要造"实体 + 存储 + CRUD"一锅端的类。
2. **术语纪律**：只用 GLOSSARY 里的词。**不要自行引入**未收录的术语或关系语义（如"is-a/继承/修饰/上溯"曾被单方面引入造成幻觉，已全部清除）；语义预设词禁止写入领域层。
3. **文档纪律**：文档已精简，禁止加轮次记录/自指声明/冗余解释；只维护 GLOSSARY / DECISIONS / CONTEXT 三份。
4. **不预建模**：parked 项（C-S、作品嵌套/多归属等）不进代码不进决策。
5. 提交前 `npm run typecheck:domain` 必须通过；改动为同一语义变更时同步更新对应文档行。

## 六、环境与 git

- 本仓库无 node_modules：类型检查用存档的 tsc：
  `& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.domain.json`
  （或先 `npm install --no-audit --no-fund` 后 `npm run typecheck:domain`。）
- git：本地提交可做；**push 由真人执行**（沙箱无凭据，见 `../NETWORK.md`）。提交身份已配置（Maokichan）。
- 当前 HEAD 应为 0.2 基线提交之后若干 docs/refactor 提交，工作区 clean。

## 七、文件地图

```
TagHit/
├── README.md · package.json · tsconfig.domain.json · .gitignore
├── docs/   CONTEXT.md（本文件）· GLOSSARY.md（词汇）· DECISIONS.md（分层/裁决/范围）
└── src/domain/   types.ts · rules.ts · errors.ts · index.ts
```

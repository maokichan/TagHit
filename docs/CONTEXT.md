# TagHit 开发交接（CONTEXT）

> 用途：跨 session 交接点。新 session 先读 README → 本文件 → GLOSSARY → DECISIONS → src/{domain,ports,application}。
> 版本：0.2.1（本地 tag v0.2.1）。

## 一、状态（一句话）

0.2 领域先行重写：领域层、端口、memory/sqlite 双适配器、应用层首批用例与两阶段扫描均已落地（三份校准全绿）；宿主骨架（typed IPC + 装配）与旧版 Vue 前端（`frontend/`，待改造）已入库；下一步是前端改造与真机 Electron 接线。

## 二、架构与裁决（细节看 DECISIONS / GLOSSARY）

- 六边形：渲染层/宿主 → 应用层 `src/application`（已落地）→ 领域层 `src/domain` → 端口 `src/ports` → 适配器 `src/adapters`（memory/sqlite/node）。依赖只向内；宿主 `src/host` 是唯一碰 node/electron 的地方。
- 端口契约：以**流动类型**为第一公民，动词薄、按用例反推；查询下沉用可扩展条件对象；全局约定（异步、实体写严格 NOT_FOUND/CONFLICT/INVALID、关系写幂等、读宽松）。事务 = 边界原子性；一致性编排在用例。
- 工作区 ↔ 条目：来源根（配置行）→ 路径节点（扫描维护，included/excluded 只作用直接条目）→ 归属按 sourceUri 父目录派生，不落库；浏览=成员派生+声明投影。
- 宿主（D13）：Electron。**Electron 33 内嵌 Node 20.18 < 23.4 → node:sqlite 不可用**；真机宿主需换 better-sqlite3 实现同一 Store，或升级 Electron。

## 三、已完成（代码即细节，这里只给索引）

- 旧版归档于 `../freeze/TagHit-Electron-0.1.2`（git 历史已继承）；其 Vue 前端已拷入 `frontend/`（依赖未装，留真机）。
- 核心：domain/types·rules·errors；ports（store/filesystem/system）；adapters（memory+sqlite 双实现 Store、node 真 fs、共享三采样签名）。
- 应用层：tagging/browse/search/collection/group/cascade/scan（+paths）；删除级联与扫描均单事务。
- 宿主骨架：`src/host/{main,preload,ipc,env}`——typed 窄桥 + 结果信封 + 隔离窗口。
- 五个 tsconfig（domain/ports/adapters/application/host）；校准：`npm run calibrate|calibrate:sqlite|calibrate:scan`（memory/sqlite 同场景，node v24 直跑 TS）。

## 四、下一步

1. **前端改造**（以你的思路为准，逐步进行）：`frontend/` 旧 Vue（Pinia/路由/Tailwind）从旧 IPC 面改到 `window.taghit` typed 窄桥；D9 错误按信封 code 转文案；UI 只持视图状态、不本地排序/过滤。
2. **真机接线**：`npm i -D electron`（或复用 freeze 的 33.4.11）；宿主 Store 换 better-sqlite3 实现（node:sqlite 不适用于 Electron 33 的 Node 20.18）；渲染 dev URL → 打包 loadFile。
3. 事件机制（D6）、后台增量扫描/子树整体排除（parked）。

## 五、纪律

1. 层纪律：领域层纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只做装配与边界。端口不做业务判定。
2. 术语纪律：只用 GLOSSARY 词；禁自行引入语义词（历史教训：is-a/修饰等曾造成幻觉）。
3. 文档纪律：只维护 GLOSSARY/DECISIONS/CONTEXT + README；不留轮次记录。
4. 不预建模：parked 项不进代码。
5. 提交前所改层 `tsc -p tsconfig.<domain|ports|adapters|application|host>.json` 通过；同一语义变更即同步文档；动契约/适配器后三份校准都要跑。

## 六、环境与 git

- 无 node_modules：用存档 tsc：`& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.<layer>.json`。
- node v24 直跑 TS（node:sqlite/node:crypto 内置）。校准三条 npm 脚本见上。
- git：本地提交/tag 可做；**push 由真人执行**。

## 七、文件地图（要点）

```
src/domain/    types · rules · errors            （纯，零依赖）
src/ports/     store（单体+事务+条件对象） · filesystem（walk/stat/readHead/hash） · system（Clock/IdGen）
src/adapters/  memory（MemoryStore+MemoryFileSystem） · sqlite（SqliteStore） · node（NodeFileSystem） · sample-hash · node-builtins.d.ts
src/application/  tagging · browse · search · collection · group · cascade · scan · paths · services
src/host/      main（装配+IPC 注册） · preload（window.taghit） · ipc（typed 窄桥契约） · env.d.ts
frontend/      旧版 Vue 前端（Vue3+Pinia+router+Tailwind；依赖待装，待改造到新窄桥）
scripts/       s32（六用例）· s33（扫描）——各自 memory/sqlite 入口
docs/          GLOSSARY · DECISIONS · 本文件
```

# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的快速交接。**架构见 ARCHITECTURE · 词汇 GLOSSARY · 裁决 DECISIONS · 待办 TODO.md（唯一清单）**。
> 版本：0.2.13。

## 一、一句话

0.2 领域先行重写已完成（后端核心 + 宿主契约 + 渲染层 + 插件机制 + 桌面壳全部落地），当前在 0.2.x 收口：这一批做了**浏览正确性**、**来源根生命周期**、**历史数据修复**、**容器归壳与全页呈现面**、**键鼠框架**、**导航语义**、**源码设计评审回填**（裁决 D19–D28 与 git log 是唯一细节来源）。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → `src/{domain,ports,application}`；`frontend/` 是渲染层。

## 三、进度与下一步

**已完成**（只列名下能力，细节不在此重复）：契约 v0 · 旧 UI 吸收 · 插件生态机制（贡献点/命令/服务面/呈现面三分类）· 真机运行 · 字节闸门 · 桌面壳（无边框窗口 + 主色）· 来源根树与文件管理 · 浏览正确性 · 来源根生命周期与历史数据修复 · 容器归壳与全页呈现面 · 键鼠框架 · 扫描容错 · 术语统一 · 导航语义与版心 · 源码设计评审回填（2026-09-30，D27/D28：扫描文件级容错、摘要并集计数、排除意图保留、标签名口径、领域判定收口、字节闸门白名单缓存、schema 版本位）· 相册式详情页连续打标（2026-09-30，D29：顺序上下文固化 + 翻页 + 前后预览条 + 位置进度 + 标签搜索打标）· 渲染层断言与设置页键位表（2026-10-01，D30/D31：Vitest 覆盖桥包装/入参纯化/顺序上下文/窗口内定位/路由命中 + 键位表随注册表生成）。

**下一步**（详述见 TODO.md）：
1. 键鼠框架的下一批行为：节点右键可见性、命令面板
2. 浏览页大升级：左右切换条目、滚动打标工作流、详情页移左/右侧留给插件
3. 待裁决：哪些功能需要全页；是否做**真并行访问**（每标签独立历史 + 条目多实例；用户定性为 2.0 级）

**常规**：push（含 tag）由真人执行。

## 四、纪律

1. **层纪律**：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. **术语纪律**：只用 GLOSSARY（领域词）/ ARCHITECTURE（架构与渲染层词）已定义的词；**禁自造语义词**，**一词一义**；跨层含义冲突优先改词消除。组件名取领域对象名（ARCHITECTURE 名录是单点）。
3. **文档纪律**：维护 GLOSSARY / DECISIONS / ARCHITECTURE / 本文件 + README + TODO.md；不留轮次记录；**进度只记本文件 §三（只列名下能力，不复述细节）**，待办只记 TODO.md；文档不写可推断的内部标识符与文件清单。
4. **不预建模**：parked 项不进代码（清单见 DECISIONS 末尾），待办细化进 TODO.md。
5. **提交前**：所改层 `tsc -p tsconfig.<层>.json` 通过；动契约/适配器跑**七份校准**（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口；除 s32 分两个入口外均 memory/sqlite 双跑）；动过模板结构跑前端**模板解析检查**（vue-tsc 会漏报标签不闭合）；语义变更即同步文档。
6. **git**：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，**升版本必打 tag**（随升随打，不必再确认）；非版本类 tag 打前确认；push（含 tag）由真人执行；纯文档变更不打版本。

## 五、环境与运行

- **层 typecheck**：`node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json`（根无 node_modules；freeze 路径已失效）；node v24 可直跑 TS。
- **渲染层**：node_modules 已装（electron 33.4.11）；校验 = `npx vue-tsc --noEmit -p tsconfig.web.json --composite false` **加** `npm --prefix frontend run check:templates`（后者才是模板语法防线）；**渲染层断言** = `npm --prefix frontend run test`（Vitest：标签↔路由映射、顺序上下文解析、窄桥包装与入参纯化——不需要 DOM，跑一次几百毫秒）。
- **校准**：`npm run calibrate | calibrate:sqlite`（s32 契约，memory / sqlite 各一个入口）· `calibrate:scan | calibrate:boundary | calibrate:view | calibrate:roots | calibrate:window`（各自跑同一场景于 memory 与 sqlite）——scene 定义在 `scripts/s3x-*-scenario.ts`，入口是 `*-calibrate.ts`。
- **真机运行**：`npm run dev`（一键：打包宿主 → vite dev（端口自适应回退）→ Electron；开发库 `build/taghit-dev.db`）；手动分步见 README。开发态 userData 按库隔离，同库双开由单实例锁拒绝。
- **宿主产物**：esbuild 打包 `src/host` → `build/main.cjs` + `preload.cjs`（宿主代码改动必须重新打包并重启应用；渲染层改动只需刷新窗口）。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（Electron ABI，**勿让 node v24 直接加载**）。

## 六、目录（要点）

```
src/domain      实体与关系类型 · 纯规则 · 路径规则 · 错误码（零依赖）
src/ports       端口契约（流动类型第一公民：条件对象/写输入/结果）
src/adapters    memory（校准替身：Store + 假 FS）· sqlite（驱动注入）· node（真文件系统）
src/application 用例编排（打标/浏览与投影/检索/扫描/来源根生命周期/内容读取/级联删除/数据修复）
src/host        主进程装配 · typed IPC 契约（单一事实源）· taghit-file 字节闸门 · 窗口壳
frontend/       渲染层：shared（契约 type-only 桥 + api 门面）· renderer（features / components / stores / views）
scripts/        校准场景与入口（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口）· dev 一键脚本
docs/           GLOSSARY · DECISIONS · ARCHITECTURE · 本文件；根目录 README.md 与 TODO.md
build/          esbuild 产物 + 真机开发库（gitignore）
```

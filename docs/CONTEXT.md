# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的快速交接。**架构见 ARCHITECTURE · 词汇 GLOSSARY · 裁决 DECISIONS · 待办 TODO.md（唯一清单）**。
> 版本：0.2.14。

## 一、一句话

0.2 领域先行重写已完成（后端核心 + 宿主契约 + 渲染层 + 插件机制 + 桌面壳），当前在 0.2.x 收口：浏览正确性、来源根生命周期、容器归壳与全页呈现面、键鼠框架、导航语义均已落地；裁决细节唯一来源是 DECISIONS 与 git log。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → `src/{domain,ports,application}`；`frontend/` 是渲染层。

## 三、进度与下一步

**已完成**（名下能力；细节归 DECISIONS 与 git log）：契约 v0 与 typed 窄桥 · 插件生态机制（贡献点/命令/服务面/呈现面三分类）· 桌面壳（无边框窗口 + 主色）· 来源根树与文件管理 · 浏览正确性 · 来源根生命周期与历史数据修复 · 容器归壳与全页呈现面 · 键鼠框架 · 扫描容错 · 术语统一 · 导航语义与版心 · 相册式详情页连续打标 · 渲染层断言与键位表 · 节点右键可见性操作与命令面板 · 拖出应用与框选 · 失败可见性与维护性修复收口。

**下一步**（详述见 TODO.md）：
1. 浏览与连续打标：数字键直达常用标签（需用户自己 pin）、从作品进入的相册顺序、大库窗口成本（keyset）
2. 左侧功能组件扩充：标签全页（池/组/批量；窄面板保持轻量）、文件管理小补丁（移动目标接原生目录选择、新建文件/目录）
3. 三方插件发现/分发；来源根与全页呈现面的收尾项
4. 待裁决：哪些功能需要全页（判据拟稿见 TODO）；是否做**真并行访问**（每标签独立历史 + 条目多实例；用户定性为 2.0 级）

**常规**：push（含 tag）由真人执行。

## 四、纪律

1. **层纪律**：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. **术语纪律**：只用 GLOSSARY（领域词）/ ARCHITECTURE（架构与渲染层词）已定义的词；**禁自造语义词**，**一词一义**；跨层含义冲突优先改词消除。组件名取领域对象名（ARCHITECTURE 名录是单点）。
3. **文档纪律**：维护 GLOSSARY / DECISIONS / ARCHITECTURE / 本文件 + README + TODO.md；不留轮次记录；**进度只记本文件 §三（只列名下能力，不复述细节）**，待办只记 TODO.md；文档不写可推断的内部标识符与文件清单；**文档不带历史内容**——演进与回溯由版本管理承担，文档只陈述现状与规则，不写"此前/曾/已修"式叙事，不写日期。
4. **界面文案纪律**：优秀的交互不需要引导赘文——交互自身可理解的，不加说明文字；说明性文案（教学式段落、括号内的"怎么用"解说）取最少必要，能删则删。
5. **不预建模**：parked 项不进代码（清单见 DECISIONS 末尾），待办细化进 TODO.md。
6. **提交前**：所改层 `tsc -p tsconfig.<层>.json` 通过；动契约/适配器跑**八份校准**（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口 · s38 文件操作；除 s32 分两个入口外均 memory/sqlite 双跑）；动过模板结构跑前端**模板解析检查**（vue-tsc 会漏报标签不闭合）；语义变更即同步文档。
7. **git**：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，**升版本必打 tag**（随升随打，不必再确认）；非版本类 tag 打前确认；push（含 tag）由真人执行；纯文档变更不打版本。

## 五、环境与运行

- **层 typecheck**：`node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json`（根无 node_modules；freeze 路径已失效）；node v24 可直跑 TS。
- **渲染层**：node_modules 已装（electron 33.4.11）；校验 = `npx vue-tsc --noEmit -p tsconfig.web.json --composite false` **加** `npm --prefix frontend run check:templates`（后者才是模板语法防线）；**渲染层断言** = `npm --prefix frontend run test`（Vitest：标签↔路由映射、顺序上下文解析、窄桥包装与入参纯化——不需要 DOM，跑一次几百毫秒）。
- **校准**：`npm run calibrate | calibrate:sqlite`（s32 契约，memory / sqlite 各一个入口）· `calibrate:scan | calibrate:boundary | calibrate:view | calibrate:roots | calibrate:window | calibrate:fileops`（各自跑同一场景于 memory 与 sqlite）——scene 定义在 `scripts/s3x-*-scenario.ts`，入口是 `*-calibrate.ts`。
- **真机运行**：`npm run dev`（一键：打包宿主 → vite dev（端口自适应回退）→ Electron；开发库 `build/taghit-dev.db`）；手动分步见 README。开发态 userData 按库隔离，同库双开由单实例锁拒绝。
- **宿主产物**：esbuild 打包 `src/host` → `build/main.cjs` + `preload.cjs`（宿主代码改动必须重新打包并重启应用；渲染层改动只需刷新窗口）。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（Electron ABI，**勿让 node v24 直接加载**）。
- **工作区文件权限（Windows ACL）**：
  - 症状：会话内所有 shell 命令启动即失败（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\PROJECT)`），随后工作区内写入被拒（`EPERM`，连 `.git/index.lock` 都建不了）；读操作与 `write`/`edit` 工具不受影响。`D:\PROJECT` 本身可写而**只有子目录级被拒**时，根因是该目录缺 `WRITE_OWNER`——沙箱无法为自己发放工作区授权。
  - 处置：跑内置 ACL 诊断脚本（`diagnose-windows-sandbox-acl`）：一次调用即**先取证、再给当前用户补一条完全控制项、随后复核**；该脚本不能在受限态跑（受限态会把自己的限制误报成缺权限），须放行一次。复核通过后**重复原操作**确认恢复。
  - 报告与**回滚脚本**：`D:\PROJECT\dsh-acl-report\`（文件内容与所有者未改，回滚命令由脚本打印）。
  - 这不是应用问题：TagHit 的代码与数据都无关。**再遇按专题修**（先取证再改权限，别手工编辑 ACL）。
- **受限沙箱的已知边界**：`npm test`（Vitest）在受限模式下必失败——esbuild 要 spawn 子进程并用管道收集输出，沙箱直接拒（`spawn EPERM`）。放行一次即可跑通，属环境边界而非代码问题。

## 六、目录（要点）

```
src/domain      实体与关系类型 · 纯规则 · 路径规则 · 错误码（零依赖）
src/ports       端口契约（流动类型第一公民：条件对象/写输入/结果）
src/adapters    memory（校准替身：Store + 假 FS）· sqlite（驱动注入）· node（真文件系统）
src/application 用例编排（打标/浏览与投影/检索/扫描/来源根生命周期/内容读取/级联删除/数据修复）
src/host        主进程装配 · typed IPC 契约（单一事实源）· taghit-file 字节闸门 · 窗口壳
frontend/       渲染层：shared（契约 type-only 桥 + api 门面）· renderer（features / components / stores / views）
scripts/        校准场景与入口（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口 · s38 文件操作）· dev 一键脚本
docs/           GLOSSARY · DECISIONS · ARCHITECTURE · 本文件；根目录 README.md 与 TODO.md
build/          esbuild 产物 + 真机开发库（gitignore）
```

# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的**快速交接**。完整架构/状态/渲染-核心分离见 **docs/ARCHITECTURE.md**；词汇 GLOSSARY；裁决 DECISIONS。
> 版本：0.2.2（本地 tag v0.2.2）。

## 一、一句话

0.2 领域先行重写：后端核心（领域/端口/双适配器/应用层+扫描）已完成并通过校准；宿主骨架（typed IPC）与旧 Vue 前端（`frontend/`）已入库；方向 = 插件生态（见 ARCHITECTURE §3/4）；下一步 = 前端壳 + 宿主契约，真机 Electron 接线。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → src/{domain,ports,application}；`frontend/` 是渲染层（旧 Vue，待改造）。

## 三、下一步

1. 前端：宿主契约 v0 → 垂直切片 → 逐步改造旧 UI（按用户思路，见 ARCHITECTURE §4）。
2. 真机：electron（freeze 有 33.4.11）+ **宿主 Store 换 better-sqlite3**（Node20.18 无 node:sqlite）；dev/打包。
3. Backlog：事件（D6）、EAV 建模、标签语义带出、LICENSE、CI —— 见 ARCHITECTURE §5。

## 四、纪律

1. 层纪律：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. 术语纪律：只用 GLOSSARY 词；禁自造语义词（历史：is-a/修饰曾致幻觉）。
3. 文档纪律：维护 GLOSSARY / DECISIONS / CONTEXT / **ARCHITECTURE** + README；不留轮次记录。
4. 不预建模：parked 项不进代码。
5. 提交前所改层 `tsc -p tsconfig.<domain|ports|adapters|application|host>.json` 通过；语义变更即同步文档；动契约/适配器后跑三份校准。

## 五、环境与 git

- 无 node_modules：存档 tsc `& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.<layer>.json`；node v24 直跑 TS。
- 校准：`npm run calibrate | calibrate:sqlite | calibrate:scan`。
- git：本地提交/tag 可做；**push（含 tag）由真人执行**。

## 六、文件地图（要点）

```
src/domain/ · src/ports/ · src/adapters/ · src/application/   ← 后端核心（ARCHITECTURE §2）
src/host/      main（装配+IPC）· preload（window.taghit）· ipc（typed 契约）· env.d.ts
frontend/      旧版 Vue 前端（renderer/shared/preload；依赖未装，待改造）
scripts/       s32（六用例）· s33（扫描）—— memory/sqlite 各入口
docs/          GLOSSARY（词）· DECISIONS（裁决）· ARCHITECTURE（架构/状态）· 本文件（交接）
```

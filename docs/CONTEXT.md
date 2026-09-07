# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的**快速交接**：一句话状态、读序、下一步（唯一进度跟踪点）、纪律、环境。
> 架构细节见 ARCHITECTURE；词汇 GLOSSARY；裁决 DECISIONS。
> 版本：0.2.5。

## 一、一句话

0.2 领域先行重写：后端核心全部完成并通过校准；宿主契约 v0（33 端点 + 信封，单一事实源 src/host/ipc.ts）与旧 UI 吸收完成；贡献点 v0 类型化（选型理由固化在 ARCHITECTURE §3.1）；**真机运行已打通**（Electron 33 + better-sqlite3 + esbuild 打包，D14）；**字节闸门已落地**（taghit-file:// 媒体协议 + item.readText 文本窄桥 + 图片固有尺寸扫描落库，D15）；界面已按老版观感补齐（瀑布流用真实宽高比）。方向 = 插件生态（ARCHITECTURE §三）。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → src/{domain,ports,application}；`frontend/` 是渲染层。

## 三、下一步（唯一进度跟踪点）

已完成（细节见 DECISIONS D13–D15 与 git log）：契约 v0 ✅ 旧 UI 吸收 ✅ 贡献点 v0 ✅ 真机接线 ✅ 字节闸门 ✅ 界面美化 ✅ 图片尺寸落库 ✅ 注册表 v0.1（声明/实现分离 + 错误隔离 + per-entry 生命周期，2026-09-07）✅。

1. **视频缩略图**：帧抓取管线（taghit-file 协议已就绪，缺 canvas 抓帧/封面提取/落盘通道；旧版 lib/thumbnailer.ts 思路可参考）；视频尺寸同理待 ffprobe/元数据。
2. **贡献点待裁决**（接三方前定并写入 DECISIONS）：settings 命名空间与存储归属（key 语义改组件内、存储键 `featureId:key`、壳统一持有）；HostApi 冻结面与 33 端点窄桥的关系（建议冻结子集视图 + 版本号，权限闸门在宿主进程）；contributed 重复 id 的拒绝+报告装载策略。
3. **contentTab 贡献点槽**（壳标签页仍为固定四类；接槽前先裁决插件标签页的状态归属——它是唯一一个壳须替插件持有状态的槽）。
4. Backlog：事件（D6，扫描进度）、EAV 元数据建模、标签语义带出、config 持久化、LICENSE、CI。
5. 常规：push（含 tag）由真人执行。

## 四、纪律

1. 层纪律：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. 术语纪律：只用 GLOSSARY / ARCHITECTURE 已定义词；禁自造语义词（历史：is-a/修饰曾致幻觉）；**一词一义**——领域词定义于 GLOSSARY、架构/渲染层词定义于 ARCHITECTURE，跨层含义冲突优先改词消除（先例：插件语境"宿主"→「壳」；「宿主/宿主进程」只指 src/host 主进程）。
3. 文档纪律：维护 GLOSSARY / DECISIONS / CONTEXT / **ARCHITECTURE** + README；不留轮次记录；**进度只记本文件 §三**。
4. 不预建模：parked 项不进代码。
5. 提交前所改层 `tsc -p tsconfig.<domain|ports|adapters|application|host>.json` 通过；语义变更即同步文档；动契约/适配器后跑三份校准。
6. git：本地提交可做；**打 tag 前先向用户确认一次再打**；push（含 tag）由真人执行；版本迭代只对应代码/功能变更，纯文档变更不打版本。

## 五、环境与运行

- 层 typecheck：`'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.<layer>.json`（根无 node_modules）；node v24 直跑 TS。
- frontend：node_modules 已装（electron 33.4.11 含 exe）；`npx vue-tsc --noEmit -p tsconfig.web.json --composite false`；契约类型经 @host/* alias type-only 引用根 src/host/ipc.ts。
- 校准：`npm run calibrate | calibrate:sqlite | calibrate:scan`。
- 真机运行：终端 A `npm run dev:renderer`（vite@5173）；终端 B `npm run bundle:host` 后 `TAGHIT_RENDERER_URL=http://localhost:5173 TAGHIT_DB=<db路径> npm run start:host`。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（复制自 freeze，Electron ABI；**勿让 node v24 直接加载**）。better-sqlite3 版本须与 electron 匹配（D13/D14）。

## 六、文件地图（要点）

```
src/domain/ · src/ports/ · src/adapters/ · src/application/   ← 后端核心（ARCHITECTURE §一）
src/host/      main（装配+IPC）· preload · ipc（typed 契约）· protocol（taghit-file）· sqliteDriver
frontend/      渲染层（shared/contract=契约桥 · shared/api=门面+D9 文案 · lib/{viewModel,media}=视图/媒体适配）
scripts/       s32（六用例）· s33（扫描）—— memory/sqlite 各入口
docs/          GLOSSARY · DECISIONS · ARCHITECTURE · 本文件
build/         esbuild 产物 + 真机 dev 库（gitignore）
```

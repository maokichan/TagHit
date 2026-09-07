# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的**快速交接**：一句话状态、读序、下一步（唯一进度跟踪点）、纪律、环境。
> 架构细节见 ARCHITECTURE；词汇 GLOSSARY；裁决 DECISIONS。
> 版本：0.2.9。

## 一、一句话

0.2 领域先行重写：后端核心全部完成并通过校准；宿主契约 v0（33 端点 + 信封，单一事实源 src/host/ipc.ts）与旧 UI 吸收完成；**真机运行已打通**（Electron 33 + better-sqlite3 + esbuild 打包，D14）；**字节闸门已落地**（taghit-file:// 媒体协议 + item.readText 文本窄桥 + 图片固有尺寸扫描落库，D15）；界面已按老版观感补齐（瀑布流用真实宽高比）。**插件生态机制全部就位**（贡献点/命令/右键菜单/三类呈现面/HostApi 冻结面，ARCHITECTURE §三）。**视频缩略图与多选批量已落地（0.2.9，D16）**：视频 canvas 抓帧 → 宿主落盘 + 按哈希回写尺寸/缩略图（同内容共享）；Ctrl/Cmd 多选 + 右键/操作条批量打标。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → src/{domain,ports,application}；`frontend/` 是渲染层。

## 三、下一步（唯一进度跟踪点）

已完成（细节见 DECISIONS 与 git log）：契约 v0 ✅ 旧 UI 吸收 ✅ 贡献点 v0 ✅ 真机接线 ✅ 字节闸门 ✅ 界面美化 ✅ 图片尺寸落库 ✅ 注册表 v0.1 ✅ 命令注册表 + 右键菜单闭环 ✅ 插件生态主线（SurfaceHost 标准容器 + 服务面 dialog/toast + config 仓 featureId:key + contentTab 槽 + HostApi 冻结面 + contributed 装载器，2026-09-07）✅ **视频缩略图 + 多选批量（D16，2026-09-07）** ✅。

1. **三方插件发现/分发**：机制（声明/装载/隔离/权限面）已就绪；目录扫描、安装、启停管理待分发形态裁决。
2. Backlog：事件（D6，扫描进度→进度 UI）、EAV 元数据建模、标签语义带出、config 持久化迁宿主（存储键形状不变）、TEXT_EXTS 双表收敛（若白名单频繁变动则契约加拉取端点）、StartScreen 内联搜索收敛到 globalSearch 功能组件、多选进阶（Shift 区间选择/拖拽）、封面提取（缩略图落库已就绪，可升级为自动截取首帧之外的封面）、LICENSE、CI。
3. 常规：push（含 tag）由真人执行。

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
- 真机运行：一键 `npm run dev`（scripts/dev.mjs：bundle:host → 并行 dev:renderer@5173 + start:host，TAGHIT_DB 缺省 build/taghit-dev.db，环境变量透传）；或手动：终端 A `npm run dev:renderer`（vite@5173），终端 B `npm run bundle:host` 后 `TAGHIT_RENDERER_URL=http://localhost:5173 TAGHIT_DB=<db路径> npm run start:host`。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（复制自 freeze，Electron ABI；**勿让 node v24 直接加载**）。better-sqlite3 版本须与 electron 匹配（D13/D14）。

## 六、文件地图（要点）

```
src/domain/ · src/ports/ · src/adapters/ · src/application/   ← 后端核心（ARCHITECTURE §一）
src/host/      main（装配+IPC）· preload · ipc（typed 契约）· protocol（taghit-file）· sqliteDriver
frontend/      渲染层
  shared/      contract（契约 type-only 桥）· api（门面+D9 文案）· types/{feature,command}
  renderer/    lib/{viewModel,media,format} · stores/{item,tab,ui,workspace,tag,config}
               features/（registry·commands·hostApi·SurfaceHost·contextMenu·services·context）
               components/（item 网格卡片 · workspace 面板 · layout 壳）· views/（含 FeatureTabView）
scripts/       s32（六用例）· s33（扫描）—— memory/sqlite 各入口
docs/          GLOSSARY · DECISIONS · ARCHITECTURE · 本文件
build/         esbuild 产物 + 真机 dev 库（gitignore）
```

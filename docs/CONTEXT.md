# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的**快速交接**：一句话状态、读序、进度（唯一进度跟踪点）、待办（TODO.md）、纪律、环境。
> 架构细节见 ARCHITECTURE；词汇 GLOSSARY；裁决 DECISIONS；**待办唯一清单 = 根目录 TODO.md**。
> 版本：0.2.12。

## 一、一句话

0.2 领域先行重写：后端核心全部完成并通过校准；宿主契约 v0（42 端点 + 信封，单一事实源 src/host/ipc.ts）与旧 UI 吸收完成；**真机运行已打通**（Electron 33 + better-sqlite3 + esbuild 打包，D14）；**字节闸门已落地**（taghit-file:// 媒体协议 + item.readText 文本窄桥 + 图片固有尺寸扫描落库，D15）；界面已按老版观感补齐（瀑布流用真实宽高比）。**插件生态机制全部就位**（贡献点/命令/右键菜单/三类呈现面/HostApi 冻结面，ARCHITECTURE §三）。**视频缩略图与多选批量（0.2.9，D16）**：canvas 抓帧 → 宿主落盘 + 按哈希回写（同内容共享）；Ctrl/Cmd 多选 + 批量打标。**无边框窗口（0.2.10，D17）**：默认菜单移除，TabBar 兼任标题栏（拖拽区 + 窗口控制键）；暗/亮主色琥珀（--accent 单点）；术语见 ARCHITECTURE §二。**来源根树 + 文件管理（D18）**：来源根面板 = 每根一个目录树容器（分割线分离；节点可见性含根、不级联、Shift=子树批量）；「文件管理」组件对多选集做真实文件改名/移动/删除进回收站（路径闸门=来源根）；扫描 contentHash 认领——移动后条目 id 与标签原样保留；挂载走原生目录选择器（dialog.pickDirectory）。停靠面板角标 → 功能组件内容标签页（暂全页复用窄面板）。**输入边界专项（s34）**：名称归一闸（trim/空判/限长）、normalizePath 词汇解析 `..`（堵文本前缀穿透）。**多实例根治**：开发态 userData 按库隔离 + 同库单实例锁（缓存锁冲突黑屏）+ dev 端口自适应回退；渲染层控制台转发主进程 + render-process-gone 自恢复。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → src/{domain,ports,application}；`frontend/` 是渲染层。

## 三、进度（唯一进度跟踪点；待办唯一清单 = 根目录 TODO.md）

已完成（细节见 DECISIONS 与 git log）：契约 v0 ✅ 旧 UI 吸收 ✅ 贡献点 v0 ✅ 真机接线 ✅ 字节闸门 ✅ 界面美化 ✅ 图片尺寸落库 ✅ 注册表 v0.1 ✅ 命令注册表 + 右键菜单闭环 ✅ 插件生态主线（2026-09-07）✅ 视频缩略图 + 多选批量（D16）✅ 无边框窗口 + 窗口控制键 + 主色琥珀（D17）✅ **来源根树容器 + 文件管理组件 + contentHash 认领 + 停靠面板角标 + dialog.pickDirectory（D18）** ✅ **输入边界校准 s34 + 名称归一闸 + 路径 `..` 词汇解析** ✅ **多实例根治（userData 按库隔离 + 同库单实例锁 + dev 端口回退 + 渲染层控制台转发/崩溃自恢复）** ✅。

下一步主线（详述与依赖见 TODO.md）：
1. 标准功能组件与详情界面翻新（剩余：浏览网格 / tag 面板 / 条目详情 / 专属全页内容页）
2. 三方插件发现/分发（待分发形态裁决）

常规：push（含 tag）由真人执行。

## 四、纪律

1. 层纪律：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. 术语纪律：只用 GLOSSARY / ARCHITECTURE 已定义词；禁自造语义词（历史：is-a/修饰曾致幻觉）；**一词一义**——领域词定义于 GLOSSARY、架构/渲染层词定义于 ARCHITECTURE，跨层含义冲突优先改词消除（先例：插件语境"宿主"→「壳」；「宿主/宿主进程」只指 src/host 主进程）。
3. 文档纪律：维护 GLOSSARY / DECISIONS / CONTEXT / **ARCHITECTURE** + README + **TODO.md**；不留轮次记录；**进度只记本文件 §三，待办只记 TODO.md**。
4. 不预建模：parked 项不进代码（parked 清单见 DECISIONS 末尾，待办细化见 TODO.md）。
5. 提交前所改层 `tsc -p tsconfig.<domain|ports|adapters|application|host>.json` 通过；语义变更即同步文档；动契约/适配器后跑全部校准（memory / sqlite / scan / **boundary 输入边界**）。
6. git：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，**升版本必打 tag**（随升随打，不必再确认）；非版本类 tag 打前向用户确认一次；push（含 tag）由真人执行；版本迭代只对应代码/功能变更，纯文档变更不打版本。（2026-09-12 修订）

## 五、环境与运行

- 层 typecheck：`node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json`（根无 node_modules；全局 tsc 亦可；freeze 路径已失效）；node v24 直跑 TS。
- frontend：node_modules 已装（electron 33.4.11 含 exe）；`npx vue-tsc --noEmit -p tsconfig.web.json --composite false`；契约类型经 @host/* alias type-only 引用根 src/host/ipc.ts。
- 校准：`npm run calibrate | calibrate:sqlite | calibrate:scan | calibrate:boundary`（boundary = 对外暴露面的输入合法性专项，s34，memory/sqlite 双跑）。
- 真机运行：一键 `npm run dev`（scripts/dev.mjs：bundle:host → vite 直启（端口自适应回退）+ start:host，TAGHIT_DB 缺省 build/taghit-dev.db，环境变量透传；开发态 userData 按库隔离，同库双开单实例锁退出）；或手动：终端 A `npm --prefix frontend run dev:renderer`（vite），终端 B `npm run bundle:host` 后 `TAGHIT_RENDERER_URL=http://localhost:5173 TAGHIT_DB=<db路径> npm run start:host`。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（复制自 freeze，Electron ABI；**勿让 node v24 直接加载**）。better-sqlite3 版本须与 electron 匹配（D13/D14）。

## 六、文件地图（要点）

```
src/domain/ · src/ports/ · src/adapters/ · src/application/   ← 后端核心（ARCHITECTURE §一）
src/host/      main（装配+IPC+窗口壳）· preload · ipc（typed 契约）· protocol（taghit-file）· sqliteDriver
frontend/      渲染层
  shared/      contract（契约 type-only 桥）· api（门面+D9 文案）· types/{feature,command}
  renderer/    lib/{viewModel,media,format,thumbnailer} · stores/{item,tab,ui,workspace,tag,config}
               features/（registry·commands·officialCommands·hostApi·SurfaceHost·FeatureBoundary
                         ·ContextMenuHost·contextMenu·context·services/{dialog,toast,batchTag}
                         ·display/{layout,sort,mediaType,workspaceInfo}·content/globalSearch
                         ·files/FilesPanel·keyboardMouse）
               components/（item 网格卡片 · workspace/{Paths,Tags,Display}Panel · search
                          · layout/{TabBar,WindowControls,ActivityBar,Info,Plugins}）· views/（含 FeatureTabView）
scripts/       dev.mjs（一键+树收场+端口回退）· s32（六用例）· s33（扫描）· s34（边界输入）—— memory/sqlite 各入口
docs/          GLOSSARY · DECISIONS · ARCHITECTURE · 本文件；根目录 TODO.md（待办唯一清单）
build/         esbuild 产物 + 真机 dev 库（gitignore）
```

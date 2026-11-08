# AGENTS — TagHit 开发上下文（强制入口）

> AI 会话与开发者的第一入口：本文件只放**每次会话都必须知道的事**（纪律红线、命令、文档地图），
> 细节按 §四 地图**按需深入**——不在本文件复制专项文档的内容（渐进披露：本文件 → 专项文档 → 源码）。

## 一、项目一句话

面向素材与收藏的本地内容标记与检索管理器：标签替代层级、数据全本地、单一数据库文件。
架构 = **领域先行 + 六边形分层**（业务规则全在纯 TS 的领域/应用层，存储与文件系统在适配器后可替换，
Electron 宿主只做装配与安全边界），正朝**插件生态**演进。

## 二、纪律红线（违反即返工）

1. **层纪律**：领域纯类型+规则（零依赖）；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. **术语纪律**：只用 `docs/GLOSSARY.md`（领域词）/ `docs/ARCHITECTURE.md`（架构与渲染层词）已定义的词；**禁自造语义词**、**一词一义**；组件名取领域对象名（ARCHITECTURE 名录是单点）。
3. **文档纪律**：维护 GLOSSARY / DECISIONS / ARCHITECTURE / STYLE / CONTEXT / 本文件 / README.md / TODO.md；**不留轮次记录、不带历史叙事与日期**；**进度只记 `docs/CONTEXT.md` §三**（只列名下能力）；**待办只记 TODO.md**（完成即删条目）；**影响项目的决定写决策笔记**（`.agents/notes/`，三态生命周期，写前先查旧笔记；表与状态文件只记事实，理由与放弃项进笔记）；文档不写可推断的内部标识符与文件清单。
4. **界面文案纪律**：交互自身可理解的不加说明文字；说明性文案取最少必要；说明进 hover，死路才给最短行动句。
5. **不预建模**：`docs/DECISIONS.md` 末尾 parked 项不进代码；待办细化进 TODO.md。
6. **提交前**：所改层 `tsc -p tsconfig.<层>.json` 通过；动契约/适配器跑**八份校准**；动过模板结构跑 check:templates（vue-tsc 漏报标签不闭合）；动过 `frontend/src/renderer/src/styles/globals.css` 必跑 check:build；语义变更即同步文档。**文档门控链**（pre-commit 三守卫，ops/）提交时自动跑，拦截按报错自带修法处理。
7. **git**：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，升版本必打 tag；非版本类 tag 打前确认；**push（含 tag）由真人执行**。

## 三、命令（跨域速查；域内命令的唯一描述在各子树入口）

```bash
npm run ci                 # 全链 CI 门：五层 typecheck + 八份校准 + 渲染层全链 + doctor（pre-push 同链）
npm run dev                # 真机：bundle:host → vite dev → Electron（开发库 build/taghit-dev.db）
npm run calibrate          # 八份校准（s32–s38；memory+sqlite 双跑，场景形状见 scripts/AGENTS.md）
npm run pack               # 便携 zip 装配（产物 release/，gitignore；版本归口根 package.json）
node ops/scripts/docIndex.mjs check     # 治理守卫体检（repoGuard/docGuard 用 --report；pre-commit 自动跑，口径见 ops/AGENTS.md）
```

## 四、文档地图（渐进披露，按需读）

| 文档 | 什么时候读 |
|---|---|
| 本文件 | 每次会话开始（红线 + 地图） |
| [`frontend/AGENTS.md`](frontend/AGENTS.md) · [`src/AGENTS.md`](src/AGENTS.md) · [`scripts/AGENTS.md`](scripts/AGENTS.md) | 进入对应子系统工作之前（子树入口：域地图 + 增量红线） |
| [`docs/AGENTS.md`](docs/AGENTS.md) | 写或改任何文档之前（维护法：事实住址、结构规则、洗与 slop 清单） |
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | 接手进度、下一步、环境与运行细节（ABI 坑、沙箱边界） |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 动架构、贡献点、渲染层词汇、字节闸门 |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | 命名、新概念入册 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 裁决唯一来源；parked 清单在文末 |
| [`.agents/notes/README.md`](.agents/notes/README.md) | 写决策笔记之前（机制、生命周期、supersession 检查） |
| [`docs/STYLE.md`](docs/STYLE.md) | 渲染层动任何样式之前 |
| [`TODO.md`](TODO.md) | 排活（唯一待办清单） |
| [`plugins/AGENTS.md`](plugins/AGENTS.md) | 写或改任何插件之前（插件上下文唯一入口） |
| `plugins/<dir>/TODO.md` | 该插件的自持待办（如 [`plugins/audio-cover-player/`](plugins/audio-cover-player/)） |
| [`ops/AGENTS.md`](ops/AGENTS.md) | 改治理守卫、新增入口文档、看路径/行数口径之前 |

## 五、目录要点

```
src/            后端核心五层 domain/ports/adapters/application/host（地图见 src/AGENTS.md）
frontend/       渲染层：shared（契约 type-only 桥 + api 门面）+ renderer（地图见 frontend/AGENTS.md）
scripts/        校准与开发工具（地图见 scripts/AGENTS.md）
plugins/        三方插件独立目录（磁盘 manifest.json + activate(ctx)；入口 plugins/AGENTS.md）
docs/           五件套（见 §四）· build/ 为产物与真机开发库（gitignore）
```

## 六、环境红线速记

- 根 node_modules = Electron ABI 陷阱（**勿让 node v24 直接加载**；`npm install` 必带 `--ignore-scripts`）；
  恢复配方与 ambient 声明策略见 `src/AGENTS.md` 与 CONTEXT §五；根 `.npmrc` 勿删。
- 受限沙箱已知边界：Vitest 的 esbuild spawn 会失败（环境问题非代码）；Windows ACL 异常按 CONTEXT §五处置（先取证再改权限）。
- 渲染层验证形态、校准场景形状、开发库位置：`frontend/AGENTS.md`、`scripts/AGENTS.md`、CONTEXT §五，不在此复制。

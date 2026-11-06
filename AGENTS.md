# AGENTS — TagHit 开发上下文（强制入口）

> AI 会话与开发者的第一入口：本文件只放**每次会话都必须知道的事**（纪律红线、命令、文档地图），
> 细节按 §四 地图**按需深入**——不在本文件复制专项文档的内容（渐进披露：本文件 → 专项文档 → 源码）。

## 一、项目一句话

面向素材与收藏的本地内容标记与检索管理器：标签替代层级、数据全本地、单一数据库文件。
架构 = **领域先行 + 六边形分层**（业务规则全在纯 TS 的领域/应用层，存储与文件系统在适配器后可替换，
Electron 宿主只做装配与安全边界），正朝**插件生态**演进。

## 二、纪律红线（违反即返工）

1. **层纪律**：领域纯类型+规则（零依赖）；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. **术语纪律**：只用 GLOSSARY（领域词）/ ARCHITECTURE（架构与渲染层词）已定义的词；**禁自造语义词**、**一词一义**；组件名取领域对象名（ARCHITECTURE 名录是单点）。
3. **文档纪律**：维护 GLOSSARY / DECISIONS / ARCHITECTURE / STYLE / CONTEXT / 本文件 / README / TODO.md；**不留轮次记录、不带历史叙事与日期**；**进度只记 CONTEXT §三**（只列名下能力）；**待办只记 TODO.md**（完成即删条目）；**影响项目的决定写决策笔记**（`.agents/notes/`，三态生命周期，写前先查旧笔记；表与状态文件只记事实，理由与放弃项进笔记）；文档不写可推断的内部标识符与文件清单。
4. **界面文案纪律**：交互自身可理解的不加说明文字；说明性文案取最少必要；说明进 hover，死路才给最短行动句。
5. **不预建模**：DECISIONS 末尾 parked 项不进代码；待办细化进 TODO.md。
6. **提交前**：所改层 `tsc -p tsconfig.<层>.json` 通过；动契约/适配器跑**八份校准**；动过模板结构跑 check:templates（vue-tsc 漏报标签不闭合）；动过 globals.css 必跑 check:build；语义变更即同步文档。**文档门控链**（pre-commit 三守卫，ops/）提交时自动跑，拦截按报错自带修法处理。
7. **git**：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，升版本必打 tag；非版本类 tag 打前确认；**push（含 tag）由真人执行**。

## 三、命令（唯一描述在此）

```bash
npm run ci                 # 全链 CI 门：五层 typecheck + 八份校准 + 渲染层全链 + doctor（pre-push 同链）
npm run typecheck:domain   # 分层类型检查（ports/adapters/application/host 同款）
npm run calibrate          # 八份校准（s32–s38：契约/扫描/边界/浏览窗口/来源根/顺序窗口/文件操作；memory+sqlite 双跑）
npm --prefix frontend run test        # 渲染层 Vitest 断言
npm --prefix frontend run check:templates   # 模板解析（vue-tsc 漏报标签不闭合）
npm --prefix frontend run check:style      # 样式禁区机检（docs/STYLE.md §6）
npm --prefix frontend run check:build      # CSS 编译门（vite 生产构建）
npm run dev                # 真机：bundle:host → vite dev → Electron（开发库 build/taghit-dev.db）
npm run bundle:host        # esbuild 打包 src/host → build/（宿主改动必须重新打包并重启；渲染层改动刷新窗口即可）
npm run pack               # 便携 zip：bundle:host → vite 构建 → renderer-dist 归置 → electron-builder（产物 release/，gitignore；cwd=根，版本归口根 package.json）
node scripts/pack-plugin.mjs <目录名>   # 插件 zip 打包（plugins/<目录> → build/plugins/<id>-<version>.zip；D48 参考实现）
node ops/scripts/docIndex.mjs check     # 治理守卫体检（repoGuard/docGuard 用 --report；pre-commit 自动跑，口径见 ops/AGENTS.md）
```

## 四、文档地图（渐进披露，按需读）

| 文档 | 什么时候读 |
|---|---|
| 本文件 | 每次会话开始（红线 + 地图） |
| `docs/CONTEXT.md` | 接手进度、下一步、环境与运行细节（ABI 坑、沙箱边界） |
| `docs/ARCHITECTURE.md` | 动架构、贡献点、渲染层词汇、字节闸门 |
| `docs/GLOSSARY.md` | 命名、新概念入册 |
| `docs/DECISIONS.md` | 裁决唯一来源；parked 清单在文末 |
| `docs/STYLE.md` | 渲染层动任何样式之前 |
| `TODO.md` | 排活（唯一待办清单） |
| `plugins/AGENTS.md` | 写或改任何插件之前（插件上下文唯一入口） |
| `plugins/<dir>/TODO.md` | 该插件的自持待办（如 audio-cover-player） |
| `ops/AGENTS.md` | 改治理守卫、新增入口文档、看路径/行数口径之前 |

## 五、目录要点

```
src/domain      实体与关系类型 · 纯规则 · 路径规则 · 错误码（零依赖）
src/ports       端口契约（流动类型第一公民：条件对象/写输入/结果）
src/adapters    memory（校准替身）· sqlite（驱动注入）· node（真文件系统）
src/application 用例编排（打标/浏览投影/检索/扫描/来源根生命周期/内容读取/级联删除）
src/host        主进程装配 · typed IPC 契约（单一事实源）· taghit-file 字节闸门 · 窗口壳
frontend/       渲染层：shared（契约 type-only 桥 + api 门面）· renderer（features/components/stores/views）
plugins/        三方插件独立目录（磁盘 manifest.json + activate(ctx)；dev 装载，分发未接入）
scripts/        校准场景与入口 · dev 一键脚本 · 夹具生成
docs/           六件套（见 §四）· build/ 为产物与真机开发库（gitignore）
```

## 六、环境红线速记

- 根 node_modules = ABI 依赖（better-sqlite3/bindings/file-uri-to-path，**勿让 node v24 直接加载**）+ 打包进宿主 bundle 的纯 JS 依赖（music-metadata、extract-zip——插件 zip 安装用，D48）。任何 `npm install/rebuild` 会打回 Node ABI（**install 必带 `--ignore-scripts`**），恢复法见 CONTEXT §五；根 `.npmrc` 的 `omit=optional` 挡的是 @types 链（@types/node 会劫持 `node:` 前缀解析、打破零依赖 ambient 声明策略），勿删。
- 受限沙箱已知边界：Vitest 的 esbuild spawn 会失败（环境问题非代码）；Windows ACL 异常按 CONTEXT §五处置（先取证再改权限）。
- 渲染层校验命令的准确形态（vue-tsc 的 tsconfig/参数）、开发库位置等细节在 CONTEXT §五，不在此复制。

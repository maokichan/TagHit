# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的快速交接。**架构见 ARCHITECTURE · 词汇 GLOSSARY · 裁决 DECISIONS · 风格基线 STYLE · 待办 TODO.md（唯一清单）**。
> 版本：0.2.18。

## 一、一句话

0.2 领域先行重写已完成（后端核心 + 宿主契约 + 渲染层 + 插件机制 + 桌面壳），当前在 0.2.x 收口：浏览正确性、来源根生命周期、容器归壳与全页呈现面、键鼠框架、导航语义均已落地；裁决细节唯一来源是 DECISIONS 与 git log。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → `src/{domain,ports,application}`；`frontend/` 是渲染层（**渲染层动样式先读 docs/STYLE.md**）。

## 三、进度与下一步

**已完成**（名下能力；细节归 DECISIONS 与 git log）：契约 v0 与 typed 窄桥 · 插件生态机制（贡献点六类槽/命令注册表/服务面/HostApi 冻结面）· 桌面壳（无边框窗口/主色/容器归壳与全页呈现面/版心/单左活动栏：插件与媒体信息并入）· 来源根（树/可见性/生命周期/退役根与脱根处置）· 文件管理（真实文件操作直改库）· 浏览正确性（派生条件下沉/计数可信）· 扫描容错与历史数据修复 · 相册式详情页连续打标（顺序上下文/翻页/预览条/图片缩放/标签搜索/数字键速打）· 标签能力（声明投影/搜索框筛选入口/全页：池总表·描述·组·批量·共现互斥统计）· 无标签筛选与格式筛选（类别映射可配置）· 缩略图通道（视频抓帧 + 图片缩放，按 contentHash 共享）· 键鼠框架（选择模型/框选/拖出交付/壳菜单与 Ctrl+A）· 命令面板与菜单装配（注册表的三视图/可用性如实标注）· 失败可见性与界面文案收敛 · 渲染层风格基线（docs/STYLE.md、字号圆角三级制、层级语法 P6 与 npm run style 样式基线页、check:style/check:build 机检）· 渲染层断言（Vitest）与键位表 · 浏览手感（Ctrl+框选翻转、详情页解码后换图不闪白、返回工作区保滚动位置与分页深度、Ctrl+Tab 循环切换标签页）· 详细页预览贡献点（detailPreview 槽：内置四类为默认提供方，按条目认领、后注册覆盖，D37）· 检索与建议（-标签 排除语法贯通契约/适配器/搜索词法；打标候选按共现相关性排序）· 标签全页工艺重做（页内新建/批选就地切换/内联描述/组卡/速打/统计分段与条带）· 详情页编辑模式（Ctrl+E 双向切换：阅读态标签区静态防误触，修改类动作只在编辑模式，生效范围事实入命令面板与键位表，D38）· 标签主页（TagProfile 有类型文档贯通五层+s32；词条式阅读页：左栏事实条/工作区口径共现邻居/Markdown 正文与 `[[标签名]]` 站内链接/外链转系统浏览器/就地编辑；入口 = 详情页 chip 双击，D38）· 详情页版式样板（P6 层级语法第一批：信息栏折叠节/阅读态去框词元）· 详情页工作台（D39/D41：详情页 = 骨架 + 工作台两层；版面 = 卡片在底板上的分割树——任意槽四缘分割新槽、卡片间缝隙即底板透出、缝隙拖柄调宽高、视图填满槽位、空叶可关闭、v1 四槽自动迁移；detailView 贡献点面 + 独立视图注册表，与 detailPreview 认领制正交）· CI 门（`npm run ci` 全链 + pre-push 钩子）· 插件生态首批实战（D42：音频封面+播放器三方首插件——独立目录 + 磁盘 manifest + dev 装载与启动期激活、ContributionContext 激活契约、HostApi 0.2.0；封面提取归宿主原生能力 `item.readAudioMeta`，封面缩略图走既有通道回写 previewUri——数据层产物跟宿主能力走、呈现层产物跟插件走；真机封面提取已收口，失败可见性已补）· 播放全局化与音频呈现面（D43：全局播放引擎归壳 = 渲染层应用级单例——切标签页/翻页/返回网格不停播，页面组件只是遥控器，翻页与播放解耦；EQ/频谱机制口随链路一次成型；HostApi 0.2.1 additive（readAudioMeta +lyrics、新域 playback 快照订阅式）；黑胶播放器 = 单条目 detailPreview、内容集中一页自组织（黑胶|歌词内部页签）——整个盘含封面圆是旋转体、转动 = 引擎有声、角速度缓动、reduced-motion 恒停；歌词只读文件事实（.lrc 伴生优先/内嵌次之）、活动行同步高亮；**插件能力管理**：默认启用 + 插件面板卡片（能力清单/启停开关），停用即贡献摘除内置预览兜底——插件不能悄悄接管；views 槽随独立歌词视图撤回，曲目表等 Collection 落地）。

**下一步**（详述见 TODO.md）：
1. 浏览与连续打标：从作品进入的相册顺序、大库窗口成本（keyset）
2. 功能组件扩充：文件管理小补丁（原生目录选择、新建文件/目录）；标签改名与组索引待定
3. **打包分发**：便携 zip（要点见 TODO 工程化）；三方插件发现/分发（首批实战已验证机制面并经 D43 扩展，D42/D43）；来源根全页按使用实际重做（先对齐痛点）
4. 待裁决：全局搜索的入口归属；扫描提供插件预解析服务（注册表，D43 parked）；是否做**真并行访问**（每标签独立历史 + 条目多实例，2.0 级）

**常规**：push（含 tag）由真人执行。

## 四、纪律

1. **层纪律**：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. **术语纪律**：只用 GLOSSARY（领域词）/ ARCHITECTURE（架构与渲染层词）已定义的词；**禁自造语义词**，**一词一义**；跨层含义冲突优先改词消除。组件名取领域对象名（ARCHITECTURE 名录是单点）。
3. **文档纪律**：维护 GLOSSARY / DECISIONS / ARCHITECTURE / STYLE / 本文件 + README + TODO.md；不留轮次记录；**进度只记本文件 §三（只列名下能力，不复述细节）**，待办只记 TODO.md；文档不写可推断的内部标识符与文件清单；**文档不带历史内容**——演进与回溯由版本管理承担，文档只陈述现状与规则，不写"此前/曾/已修"式叙事，不写日期。
4. **界面文案纪律**：优秀的交互不需要引导赘文——交互自身可理解的，不加说明文字；说明性文案（教学式段落、括号内的"怎么用"解说）取最少必要，能删则删。
5. **不预建模**：parked 项不进代码（清单见 DECISIONS 末尾），待办细化进 TODO.md。
6. **提交前**：所改层 `tsc -p tsconfig.<层>.json` 通过；动契约/适配器跑**八份校准**（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口 · s38 文件操作；除 s32 分两个入口外均 memory/sqlite 双跑）；动过模板结构跑前端**模板解析检查**（vue-tsc 会漏报标签不闭合）；语义变更即同步文档。
7. **git**：本地提交积极做；**版本号只在开发者明示时升（AI 不得自升）**，**升版本必打 tag**（随升随打，不必再确认）；非版本类 tag 打前确认；push（含 tag）由真人执行；纯文档变更不打版本。

## 五、环境与运行

- **CI 门**：`npm run ci` = 五层 typecheck + 八份校准 + 渲染层全链（typecheck:web/模板/样式机检/Vitest/CSS 编译门）+ doctor，一链到底全绿才算过；`.git/hooks/pre-push` 挂了同一链条——push 由真人执行，链不过不出门（绕过 = `git push --no-verify`）。钩子不入版本管理：重建 = 在 `.git/hooks/pre-push` 写入 `npm run ci`（sh 脚本）。远端 CI（GitHub Actions）待仓库有远端再接（TODO 工程化）。

- **层 typecheck**：`node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json`（根无 node_modules；freeze 路径已失效）；node v24 可直跑 TS。
- **渲染层**：node_modules 已装（electron 33.4.11）；校验 = `npx vue-tsc --noEmit -p tsconfig.web.json --composite false` **加** `npm --prefix frontend run check:templates`（后者才是模板语法防线）；**渲染层断言** = `npm --prefix frontend run test`（Vitest：标签↔路由映射、顺序上下文解析、窄桥包装与入参纯化——不需要 DOM，跑一次几百毫秒）；**样式基线机检** = `npm --prefix frontend run check:style`（STYLE §6 禁区：写死颜色/10px/uppercase/内联样式等，组件里零命中才绿）；**CSS 编译门** = `npm --prefix frontend run check:build`（vite 生产构建——check:style/vue-tsc 都不经过 PostCSS/Tailwind 编译，`@apply` 里的非法类只有它抓得住；动过 globals.css 必跑）。
- **校准**：`npm run calibrate | calibrate:sqlite`（s32 契约，memory / sqlite 各一个入口）· `calibrate:scan | calibrate:boundary | calibrate:view | calibrate:roots | calibrate:window | calibrate:fileops`（各自跑同一场景于 memory 与 sqlite）——scene 定义在 `scripts/s3x-*-scenario.ts`，入口是 `*-calibrate.ts`。
- **真机运行**：`npm run dev`（一键：打包宿主 → vite dev（端口自适应回退）→ Electron；开发库 `build/taghit-dev.db`）；手动分步见 README。开发态 userData 按库隔离，同库双开由单实例锁拒绝。
- **宿主产物**：esbuild 打包 `src/host` → `build/main.cjs` + `preload.cjs`（宿主代码改动必须重新打包并重启应用；渲染层改动只需刷新窗口）。
- 根 node_modules 仅 better-sqlite3/bindings/file-uri-to-path（Electron ABI，**勿让 node v24 直接加载**）。根 dependencies 已声明（better-sqlite3 ^11 + music-metadata，D42）——**任何 npm install/rebuild 都会把 better-sqlite3 变回 Node ABI**（宿主启动报 NODE_MODULE_VERSION 不匹配）：在 `node_modules/better-sqlite3` 内跑 `npx prebuild-install --runtime=electron --target=<electron 版本>` 恢复（prebuild 缓存通常命中），再重启应用。
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
plugins/        三方插件独立目录（磁盘 manifest.json + 入口模块 activate(ctx)；dev 装载，发现/分发未接入，D42）
scripts/        校准场景与入口（s32 用例 · s33 扫描 · s34 边界 · s35 浏览窗口 · s36 来源根 · s37 顺序窗口 · s38 文件操作）· dev 一键脚本 · 夹具生成
docs/           GLOSSARY · DECISIONS · ARCHITECTURE · 本文件；根目录 README.md 与 TODO.md
build/          esbuild 产物 + 真机开发库（gitignore）
```

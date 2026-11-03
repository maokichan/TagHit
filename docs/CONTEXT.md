# TagHit 开发交接（CONTEXT）

> 强制入口 = 根 **AGENTS.md**（纪律红线 / 命令 / 文档地图）；本文件 = **进度与环境的活页**。
> 架构见 ARCHITECTURE · 词汇 GLOSSARY · 裁决 DECISIONS · 风格基线 STYLE · 待办 TODO.md（唯一清单）。
> 版本：0.3.1。

## 一、一句话

0.2 领域先行重写已完成（后端核心 + 宿主契约 + 渲染层 + 插件机制 + 桌面壳）；0.3 完成壳版式换代（底板 + 卡片 · 全直角，D44）与扫描移动认领收敛，插件生态机制经音频播放器三方首插件实战验证（D42/D43）；**插件分发 v1 已全链落地（D48：本地 zip 导入 + 宿主插件协议运行时装载 + vue 同实例 vendor 机制，DEV_PLUGINS 退役）**，界面走查与打包态复验收尾中。裁决细节唯一来源是 DECISIONS 与 git log。

## 二、读序

**AGENTS.md（红线与命令）** → 本文件（进度与环境）→ **ARCHITECTURE** → GLOSSARY → DECISIONS → `src/{domain,ports,application}`；渲染层动样式先读 docs/STYLE.md；**写插件先读 plugins/AGENTS.md**。

## 三、进度与下一步

**已完成**（名下能力；细节归 DECISIONS 与 git log）：契约 v0 与 typed 窄桥 · 插件生态机制（贡献点六类槽/命令注册表/服务面/HostApi 冻结面）· 桌面壳（无边框窗口/主色/容器归壳与全页呈现面/版心/单左活动栏：插件与媒体信息并入）· 来源根（树/可见性/生命周期/退役根与脱根处置）· 文件管理（真实文件操作直改库）· 浏览正确性（派生条件下沉/计数可信）· 扫描容错与历史数据修复 · 相册式详情页连续打标（顺序上下文/翻页/预览条/图片缩放/标签搜索/数字键速打）· 标签能力（声明投影/搜索框筛选入口/全页：池总表·描述·组·批量·共现互斥统计）· 无标签筛选与格式筛选（类别映射可配置）· 缩略图通道（视频抓帧 + 图片缩放，按 contentHash 共享）· 键鼠框架（选择模型/框选/拖出交付/壳菜单与 Ctrl+A）· 命令面板与菜单装配（注册表的三视图/可用性如实标注）· 失败可见性与界面文案收敛 · 渲染层风格基线（docs/STYLE.md、字号圆角三级制、层级语法 P6 与 npm run style 样式基线页、check:style/check:build 机检）· 渲染层断言（Vitest）与键位表 · 浏览手感（Ctrl+框选翻转、详情页解码后换图不闪白、返回工作区保滚动位置与分页深度、Ctrl+Tab 循环切换标签页）· 详细页预览贡献点（detailPreview 槽：内置四类为默认提供方，按条目认领、后注册覆盖，D37）· 检索与建议（-标签 排除语法贯通契约/适配器/搜索词法；打标候选按共现相关性排序）· 标签全页工艺重做（页内新建/批选就地切换/内联描述/组卡/速打/统计分段与条带）· 详情页编辑模式（Ctrl+E 双向切换：阅读态标签区静态防误触，修改类动作只在编辑模式，生效范围事实入命令面板与键位表，D38）· 标签主页（TagProfile 有类型文档贯通五层+s32；词条式阅读页：左栏事实条/工作区口径共现邻居/Markdown 正文与 `[[标签名]]` 站内链接/外链转系统浏览器/就地编辑；入口 = 详情页 chip 双击，D38）· 详情页版式样板（P6 层级语法第一批：信息栏折叠节/阅读态去框词元）· 详情页工作台（D39/D41：详情页 = 骨架 + 工作台两层；版面 = 卡片在底板上的分割树——任意槽四缘分割新槽、卡片间缝隙即底板透出、缝隙拖柄调宽高、视图填满槽位、空叶可关闭、v1 四槽自动迁移；detailView 贡献点面 + 独立视图注册表，与 detailPreview 认领制正交）· CI 门（`npm run ci` 全链 + pre-push 钩子）· 插件生态首批实战（D42：音频封面+播放器三方首插件——独立目录 + 磁盘 manifest + dev 装载与启动期激活、ContributionContext 激活契约、HostApi 0.2.0；封面提取归宿主原生能力 `item.readAudioMeta`，封面缩略图走既有通道回写 previewUri——数据层产物跟宿主能力走、呈现层产物跟插件走；真机封面提取已收口，失败可见性已补）· 播放全局化与音频呈现面（D43：全局播放引擎归壳 = 渲染层应用级单例——切标签页/翻页/返回网格不停播，页面组件只是遥控器，翻页与播放解耦；EQ/频谱机制口随链路一次成型；HostApi 0.2.1 additive（readAudioMeta +lyrics、新域 playback 快照订阅式）；黑胶播放器 = 单条目 detailPreview、内容集中一页自组织（单页左右分区：左黑胶+控制、右歌词，container query 窄槽堆叠）——整个盘含封面圆是旋转体、转动 = 引擎有声、角速度缓动、reduced-motion 恒停、盘尺寸 [180,420]px clamp；歌词只读文件事实（.lrc 伴生优先/内嵌次之）、活动行同步高亮、无词右列给正在播放排版；播放生命周期（标签页与资源挂钩）：切标签页/返回网格不停播，翻页换资源或关闭正播条目的标签 = 停播；**插件能力管理**：默认启用 + 插件面板卡片（能力清单/启停开关），停用即贡献摘除内置预览兜底——插件不能悄悄接管；views 槽随独立歌词视图撤回，曲目表等 Collection 落地）· 壳版式底板模型（D44：窗口 = 底板 + 卡片，顶栏/状态栏坐底板，左卡 = 活动栏 + 弹出面板合一，搜索弹出面板可拖拽 + 扫描图标钮上顶栏、计数迁状态栏、内容四周留白、详情页工作台专属版心 96rem，全直角清扫 44 处 + rounded-* 入机检；走查跟进：搜索输入建议——标签词元补全 + 标题命中、预览条容器查询自适应——竖容器竖排/每格钳制伸缩、面板开合宽度过渡、暗色中性阶换暖灰——近中性微暖档、设置页归属清理——标签池归「标签」全页/工作区删除归起始页工作区卡/新增「关于」页·版本自根 package.json 构建注入）· 扫描移动认领单次扫描收敛（候选池收全部带内容签名条目、认领时验旧路径已亡，s33 补场景③c）· 便携 zip 装配线（`npm run pack` + electron-builder：宿主打包态 loadFile 分支、双身份收敛随行——frontend 死脚本与 version/license 字段撤除，归口根）· 宿主诊断面（D45：诊断快照 `userData/diagnostics.json`——版本/路径族/加载状态机/事件环形缓冲，**只含路径与状态不含用户内容**，事件触发节流落盘；`--diagnose` CLI 在单实例锁前判定、运行中也可用；首次主帧加载失败弹原生错误框并指明快照位置——真机首例打包态黑屏的反馈机制入口）· 插件管理面与命令槽（D46/D47：插件面板卡片只留名称+启停开关、id/简介进 hover；**管理页** = 插件功能组件全页——每插件的身份/贡献面清单/启停/manifest.settings 经 SchemaControl 宿主渲染【即便插件没有自开页，这套宿主呈现必要存在】；**自开页** = 插件 manifest 声明 contentTab + 入口具名导出 `page` 组件，从管理页点开即新标签页——复用 contentTab 机制（壳持标签项/单实例/错误隔离），内容与交互完全归插件、壳只提供容器，入口由管理页显形插件不自行弹页，D46 的宿主词条页随之撤除；可配置项**声明制**——manifest `settings` + `description`，值落 config 仓、**插件永不自绘设置 UI**；HostApi 0.2.4 additive——config 只读域（value 快照 + ref 响应式）、`items.open`、`items.get`；`commands` 贡献槽——插件命令进命令面板、id 强制 `<插件id>.` 前缀、停用按 owner 清扫，右键菜单保持官方策展；audio-cover-player 四面首个消费方：预览槽 + 命令「转到正在播放的条目」+ 设置「歌词字号」+ 自开页「正在播放」）· **插件分发 v1（D48）**：宿主装载事实权威（`src/host/plugins.ts` 纯逻辑——zip 解包校验【yauzl 预检拒路径穿越/64MiB 上限】、`{userData}/plugins/<id>` 安装位、同 id 覆盖、manifest 必填 version+apiVersion、apiVersion 超版拒装）+ `taghit-plugin://` standard 特权协议（ES 模块动态 import 只认标准 scheme，opaque 实测 Failed to fetch；id 在 host 位，白名单复用 pathGate）+ **vue 同实例 vendor 机制**（插件 bundle 构建时 vue import 重写到 `taghit-plugin://__vendor/vue`，dev 经 vite 编译产物代理【相对说明符重定绝对 dev origin】、打包态 `vue-vendor` 确定性 chunk 直出）+ 渲染层装载器端点驱动化（DEV_PLUGINS 退役，reloadPlugins 单管线：清单→注册→启用者激活；dev-source 走 vite /@fs/ 源码编译保留刷新即生效手感；重装=同 id 先完整摘除含 unregisterFeature；loadErrors 失败可见）+ 管理页安装/卸载（peek 预检→待安装卡→确认落位；危险确认卸载；dev-source 标「开发目录」）+ 贡献面 owner 记账清扫补 previews 缺口 + `scripts/pack-plugin.mjs` zip 打包参考实现（首包 audioPlayer-0.3.0.zip 真包过链）——dev 自动化链路验证过（bundle 经协议+vendor 全链激活，零网络错误），界面人工走查与打包态复验归 TODO 主线 1

**下一步**（详述见 TODO.md）：
1. **插件分发 v1 走查收尾**（D48 全链已落地——装载/协议/vue 同实例/安装卸载/管理页/zip 打包；dev 自动化链路验证过，界面人工走查与打包态复验见 TODO 主线 1）
2. 浏览与连续打标：从作品进入的相册顺序、大库窗口成本（keyset）
3. 功能组件扩充：文件管理小补丁（原生目录选择、新建文件/目录）；标签改名与组索引待定
4. 来源根全页按使用实际重做（先对齐痛点）
5. 待裁决：全局搜索的**作用域口径**（入口已定顶栏，D44）；扫描提供插件预解析服务（注册表，D43 parked）；是否做**真并行访问**（每标签独立历史 + 条目多实例，2.0 级）

**常规**：push（含 tag）由真人执行。

## 四、纪律

> 纪律红线（层 / 术语 / 文档 / 界面文案 / 不预建模 / 提交前校验 / git）的**唯一文本 = 根 AGENTS.md §二**——本文件不再复制，防双份漂移。

## 五、环境与运行

> 命令清单的唯一描述 = AGENTS.md §三；本节只留命令背后的**准确形态、环境细节与已知边界**。

- **CI 门**：链条构成见 AGENTS §三；`.git/hooks/pre-push` 挂同一链条——push 由真人执行，链不过不出门（绕过 = `git push --no-verify`）。钩子不入版本管理：重建 = 在 `.git/hooks/pre-push` 写入 `npm run ci`（sh 脚本）。远端 CI（GitHub Actions）待仓库有远端再接（TODO 工程化）。

- **层 typecheck**：`node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json`（freeze 路径已失效）；node v24 可直跑 TS。
- **渲染层**：node_modules 已装（electron 33.4.11）；校验 = `npx vue-tsc --noEmit -p tsconfig.web.json --composite false` **加** `npm --prefix frontend run check:templates`（后者才是模板语法防线）；**渲染层断言** = `npm --prefix frontend run test`（Vitest：标签↔路由映射、顺序上下文解析、窄桥包装与入参纯化——不需要 DOM，跑一次几百毫秒）；**样式基线机检** = `npm --prefix frontend run check:style`（STYLE §6 禁区：写死颜色/10px/uppercase/内联样式等，组件里零命中才绿）；**CSS 编译门** = `npm --prefix frontend run check:build`（vite 生产构建——check:style/vue-tsc 都不经过 PostCSS/Tailwind 编译，`@apply` 里的非法类只有它抓得住；动过 globals.css 必跑）。
- **校准**：`npm run calibrate | calibrate:sqlite`（s32 契约，memory / sqlite 各一个入口）· `calibrate:scan | calibrate:boundary | calibrate:view | calibrate:roots | calibrate:window | calibrate:fileops`（各自跑同一场景于 memory 与 sqlite）——scene 定义在 `scripts/s3x-*-scenario.ts`，入口是 `*-calibrate.ts`。**宿主纯模块直验**（不进 CI 链）：`node scripts/plugins-selfcheck.ts`（插件安装位全链，D48）· `node scripts/diagnostics-selfcheck.ts`（诊断快照）。
- **真机运行**：`npm run dev`（一键：打包宿主 → vite dev（端口自适应回退）→ Electron；开发库 `build/taghit-dev.db`）；手动分步见 README。开发态 userData 按库隔离，同库双开由单实例锁拒绝。
- **宿主产物**：esbuild 打包 `src/host` → `build/main.cjs` + `preload.cjs`（宿主代码改动必须重新打包并重启应用；渲染层改动只需刷新窗口）。
- 根 node_modules = Electron ABI（better-sqlite3/bindings/file-uri-to-path，**勿让 node v24 直接加载**）+ 打包进宿主 bundle 的纯 JS 依赖（music-metadata，D42；extract-zip，D48 插件 zip 安装）。根 dependencies 已声明（better-sqlite3 ^11 + music-metadata + extract-zip）——**任何 npm install/rebuild 都会把 better-sqlite3 变回 Node ABI**（install 必带 `--ignore-scripts`；宿主启动报 NODE_MODULE_VERSION 不匹配时）：在 `node_modules/better-sqlite3` 内跑 `npx prebuild-install --runtime=electron --target=<electron 版本>` 恢复（prebuild 缓存通常命中），再重启应用。host/adapters 层的 node 内置模块类型走自维护 ambient 声明（`src/host/nodeGlobals.d.ts` + `src/adapters/node-builtins.d.ts`）——根目录若混入 @types/node（extract-zip 的 optional 依赖链），`node:` 前缀解析会被劫持而大面积报错：根 `.npmrc` 已 `omit=optional` 挡住，勿删。
- **工作区文件权限（Windows ACL）**：
  - 症状：会话内所有 shell 命令启动即失败（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\PROJECT)`），随后工作区内写入被拒（`EPERM`，连 `.git/index.lock` 都建不了）；读操作与 `write`/`edit` 工具不受影响。`D:\PROJECT` 本身可写而**只有子目录级被拒**时，根因是该目录缺 `WRITE_OWNER`——沙箱无法为自己发放工作区授权。
  - 处置：跑内置 ACL 诊断脚本（`diagnose-windows-sandbox-acl`）：一次调用即**先取证、再给当前用户补一条完全控制项、随后复核**；该脚本不能在受限态跑（受限态会把自己的限制误报成缺权限），须放行一次。复核通过后**重复原操作**确认恢复。
  - 报告与**回滚脚本**：`D:\PROJECT\dsh-acl-report\`（文件内容与所有者未改，回滚命令由脚本打印）。
  - 这不是应用问题：TagHit 的代码与数据都无关。**再遇按专题修**（先取证再改权限，别手工编辑 ACL）。
- **受限沙箱的已知边界**：`npm test`（Vitest）在受限模式下必失败——esbuild 要 spawn 子进程并用管道收集输出，沙箱直接拒（`spawn EPERM`）。放行一次即可跑通，属环境边界而非代码问题。


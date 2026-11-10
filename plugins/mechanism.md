# 插件机制与规范（mechanism）

> 插件机制的唯一详述。三层分工：**代码 = 唯一事实**（契约的形状事实由生成器从 AST 抽取进
> `codefact` 块，块头标注源文件——语义与约束读源码注释）；**本文件 = 判定与意图**（为什么这样
> 设计、插件侧的义务边界）；**红线与速查 = [AGENTS.md](AGENTS.md)**。论证与放弃项在
> [.agents/notes/](../.agents/notes)。形状与本文冲突时以生成块/代码为准并报给开发者。

## 一、壳与插件的分工

- **壳 = 插件的容器与展示层**（不只 UI）：布局、标签页、面板拖拽/显隐都是壳/官方功能的行为；
  窗口语境不用「壳」（一词一义，见架构活体文档版式词汇条）。
- **插件 = 提供程序所没有的能力**：UI 增强（面板/展示/命令）→ 渲染层贡献点；复杂运算/程序外
  能力（OCR、哈希、转码、扫描等）→ **主进程能力工具** + manifest 声明式权限。两层都经统一
  **HostApi 门面**，核心保持对插件无知。
- **官方功能组件与三方插件注册机制同构**，差异只收敛在信任/生命周期分层：官方静态全信
  （与版本同生共死）；三方动态装载、权限门、每贡献块错误隔离、启停卸载（事件订阅可退订、
  状态可丢弃）。**同构验收标准**：任一官方功能组件改成动态加载后壳行为完全不变
  （已有一个官方组件作验收桩）。
- 性能：**惰性加载**（激活条件 → 用时才 import）+ **事件仅推活跃订阅者**——同构不引入固定开销。
- **契约优先**：贡献点 + HostApi + 生命周期先立为稳定面（对插件作者是 API 契约）；先用
  **垂直切片**证明机制，再批量改造。

## 二、贡献点：槽与插头

**两个概念是同一机制的两面**，不是两套系统：

- **贡献点** = 壳侧的**槽**：活动栏（左）· 内容区标签页（contentTab）· 显示面板块（displayPanel）·
  设置分区（settings）· 详细页预览（detailPreview，按条目认领渲染）· 详情页工作台视图
  （detailView，声明常驻）· 命令（commands，进命令面板）。回答"哪里可以插、插进来壳按什么
  规则渲染/排序/显隐"。槽是壳的权力清单——**不做任意跨区停靠（完整 dock）**就是这条清单的红线。
  挂载点的合法取值以 `MountPoint` 类型为准（下方 manifest 事实块）；statusBar / grid 是 v2 预留。
- **功能组件** = 贡献侧的**插头**：可序列化声明 + 实现绑定（可分别绑停靠面与全页面）。
  回答"我声明自己是什么、挂哪些槽、有哪些配置项"。**声明的形状 = `FeatureManifest` /
  `SettingSchema`（生成块）**——字段语义与约束读源码注释；三方磁盘 manifest.json 即此形状
  去 `source`（装载方打 contributed）。
- **官方组件没有任何特权路径**：与三方走同一注册表，槽只问注册表"这里有什么"，不 import 具体
  组件。真正的设计差异在三个**分层**维度（不在机制上）：注册来源（官方 = 构建期直连 + 代码注册；
  三方 = 目录发现 + 磁盘声明 + 运行期装载）；信任与权限（官方全信；三方要权限门）；生命周期
  （官方与版本同生共死；三方有安装/启停/卸载）。

manifest 契约形状（生成器托管，源 = [frontend/src/shared/types/feature.ts](../frontend/src/shared/types/feature.ts)）：

<!-- codefact:begin manifest -->

<!-- 生成物（codefact:manifest）：勿手改 · 源 = frontend/src/shared/types/feature.ts · 语义与约束读源码注释 · 重生成 npm run gen:codefact -->
- `export type MountPoint = | 'activityBar:left' // 左活动栏工具（一个工具 = 一个面板；右活动栏已裁撤，D40） | 'displayPanel' // 显示面板内的区块 | 'settings' // 设置页分区（按功能组件分类渲染） | 'contentTab' // 内容区标签页（壳持标签项，组件自持内容状态，DECISIONS 2026-09-07） | 'detailView' // 详情页工作台视图（"条目的一个侧面"，D39：声明常驻不按条目认领，认领是 detailPreview 的事） | 'statusBar' // v2 预留 | 'grid'`
- `export type FeatureSource = 'official' | 'contributed'`
- `interface SettingOption`：
  - `value: string`
  - `label: string`
- `interface SettingSchema`：
  - `key: string`
  - `type: 'boolean' | 'enum' | 'string' | 'number' | 'shortcuts'`
  - `label: string`
  - `options?: SettingOption[]`
  - `default?: unknown`
- `interface FeatureManifest`：
  - `id: string`
  - `title: string`
  - `description?: string`
  - `source: FeatureSource`
  - `mounts: MountPoint[]`
  - `settings?: SettingSchema[]`
  - `surfaces?: Array<'dialog' | 'toast'>`
  - `dataSource?: 'fileFormatMap' | 'metadataSchema' | 'sortKeys' | null`
  - `version?: string`
  - `author?: string`
  - `apiVersion?: string`

<!-- codefact:end -->

**注册表 = 声明表**：可序列化声明 + 实现绑定（构建期直连或运行期 loader，**与来源正交**）。
壳只查表渲染，不 import 具体组件。重复 id：官方抛错（开发期暴露），contributed 拒绝并报告，
**不炸注册表**。

**错误隔离双线 + 生命周期**：注册期（setup 抛错只废掉自己）+ 渲染期（槽级边界捕获）；
官方组件走同一道边界。生命周期按条目配对（setup/dispose）。

## 三、呈现面三分类

插件 UI 落在壳里的方式收敛为**三类呈现面**，装配模型各不相同：

| 类别 | 例子 | 装配模型 |
|---|---|---|
| 停靠面 docked | 活动栏工具面板、显示面板块、设置分区 | 一块槽一个贡献者，经声明表静态装配 |
| 服务面 service | 弹窗/确认/通知 | 壳提供的受控服务（注入给组件），调用时临时起；**不是插槽** |
| 调用面 invoked | 右键菜单、命令面板、快捷键、拖拽 | **多贡献者，调用瞬间按上下文现场聚合** |

**插件侧义务**（壳级机制的详述在架构活体文档 §二「命令注册表」「四个调用面视图」）：

- **命令原子**：菜单项不是容器成员，是命令 + 摆放元数据；命令面板/快捷键都是命令注册表的视图
  ——一套注册表，不做三套平行系统。命令注册表同时是三方"可做的事"的**权限清单底座**。
- **执行只经 HostApi 门面**（改意图 → 窄桥 → 失效重查），数据流单通道不破。
- **when 是壳可求值的最小谓词**（目标种类/字段相等/合取）——壳不加载实现即可过滤；底线 =
  相等与合取，不做表达式引擎。
- **上下文目标注册**：组件不挂菜单监听，只声明"这块 DOM 是上下文目标"；事件拦截权归壳。
- **装配建议只有分组与顺序两个字段**：分组（导航/修改/危险）、分隔线、组内排序、溢出折叠全是
  壳的策略；危险动作壳强制沉底 + 警示。菜单自绘，不用原生。
- **服务面**：确认框/提示由壳统一渲染，组件不自起弹层；manifest 的 surfaces 声明所需服务
  （v0 只声明不校验——执行层是远期项）。

## 四、HostApi：冻结面与激活上下文

- HostApi = 窄桥的**冻结子集视图** + 独立版本号（additive 演进同样升版本号，破坏性变更升
  major）；官方可用全量窄桥（同版本发布），contributed **只经 HostApi**；命令与权限清单以此为底座。
- **域清单与方法签名的形状事实托管于 [AGENTS.md](AGENTS.md) §三的 `codefact` 块**
  （源 = [frontend/src/renderer/src/features/hostApi.ts](../frontend/src/renderer/src/features/hostApi.ts)）——
  转发成员的请求/响应形状由端点表承载（架构活体文档 §一的 `codefact:ipc` 块）。
- **激活上下文**：`activate(ctx)` 收到的 `ContributionContext` = hostApi + 贡献注册面
  （previews / commands）；`ctx` 按插件独立创建，commands 槽 id 强制 `<featureId>.` 前缀 +
  owner 记账（停用按 owner 清扫——"不能悄悄接管"）。形状事实同在 [AGENTS.md](AGENTS.md) §三
  （源 = [frontend/src/renderer/src/features/contribution.ts](../frontend/src/renderer/src/features/contribution.ts)）。

## 五、应用层不驻插件（单向铁律）

- 三方代码不进主进程核心。"插件跑进应用层"技术上可行，但会同时击穿：信任边界（主进程直接摸
  Store/fs）、事务语义（用例 = 单事务边界）、行为归属（删插件不应改变业务行为）、内部 API 冻结
  （用例签名是演进面，HostApi 才是冻结面）。
- 重运算（OCR/转码/哈希）= **主进程能力工具**：宿主调用、结果返回、不持有 Store、不进事务，
  经 manifest 权限闸门。
- 预留：未来若需"插件提供扫描期文件解析器/哈希器"，走**窄领域端口 + 独立进程**
  （Electron utilityProcess）实现，宿主拉起并注册，用例照常调端口——依赖仍只向内，
  插件 crash 不带崩宿主。不做流程钩子。

## 六、为什么是贡献点（选型理由）

三条既有裁决把扩展方式的选项收敛到唯一：

- *自由 API 式*（暴露全局对象随便调/随便渲染）：插件绕开"改动 → 窄桥 → 失效重查"的数据流
  单通道，投影语义（声明裁剪/hiddenCount）会出现第二份实现。否。
- *钩子/拦截式*（插件插进查询/扫描等核心流程）：让插件进入核心**控制流**；行为归属被稀释
  （流程在应用层、事务边界在用例），插件 bug 从"一块面板坏了"升级成"一次扫描/删除坏了"，
  还要定义顺序/await/抛错语义。否。
- *中间件/管道式*：钩子变体，主流程（浏览/打标/扫描）不是管道形状。否。
- *贡献点式*（VS Code 模型）：**壳声明槽位，插件只声明填充物**，壳按声明渲染——核心 import 图里
  永远没有插件，控制权反转。三个对应价值：① 服务"壳 = 容器与展示层"裁决——布局/标签页/显隐
  是壳的权力，插件只能往槽里放东西；② 数据流不破——贡献物经 HostApi 门面，与官方 UI 同一条
  窄桥；③ 信任可分层——声明式注册使官方静态/三方动态共用一张表，差异只收敛在"从哪来、信多少、
  何时加载"，声明式 manifest 正是惰性加载的着力点。

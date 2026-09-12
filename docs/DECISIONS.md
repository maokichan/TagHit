# TagHit 决策基线（DECISIONS）

分层、裁决与范围。概念见 GLOSSARY；架构/状态/渲染-核心分离见 ARCHITECTURE。

## 分层

```
渲染层/宿主（Electron：渲染 UI，主进程装配）   ← src/host + frontend/
   │
应用层（用例编排，调领域规则与端口）          ← src/application（已落地）
   │
领域层（类型 + 纯规则，无存储、无 IO）        ← src/domain
   │
端口（接口）──── 适配器（实现）              ← src/ports · src/adapters
```

依赖只向内。行为在应用层；存储/IO 实现位于领域层之外；核心对渲染层/插件无知。

## 裁决

- 条目 item：全局唯一，不属任何工作区；跨工作区去重是扫描行为
- 挂载：条目 × 标签（条目级）；取回条目返回全部标签
- 声明：工作区 × 标签，读取端投影事实；投影行为在应用层
- 标签关联：有向 tag→tag，领域不解义；语义由使用方组织
- 作品：独立实体 + 有序成员 + 空条目标签锚点；组：扁平容器、标签可多属
- 成员：作品→条目（有序，position）；组→标签（无序）；行记录属领域类型
- 工作区 ↔ 条目：来源根（配置行，workspace 拥有根、不拥有条目）→ 路径节点（扫描产物，workspace × 目录路径，根=来源根；included/excluded 只作用该节点直接条目，不级联；扫描不覆盖既有 excluded）→ 归属（不落库，sourceUri 父目录 == 节点 dirPath 派生）
- 重叠挂载：条目全局共享；节点按工作区各建一份
- 扫描消失策略：keep（标 missing，默认）/ discard（删条目及关联），按扫描调用配置
- 内容签名：sha256 于头/中/尾三采样点；同内容必同签名
- 元数据：核心事实 + EAV 长尾；渲染层只认 uri，字节经主进程闸门；全局搜索对全部工作区

## 端口与适配器（已落地；契约见 src/ports/store.ts 头部）

- 端口是应用层对宿主的需求清单。第一公民 = **流动数据的类型**（领域行记录 + 端口写输入/条件对象/结果）；动词薄、按用例反推、不做业务判定。
- Store：单体 + 事务（transaction = 边界原子性，不支持嵌套；一致性边界在用例）。全局约定：异步；实体写严格（NOT_FOUND/CONFLICT/INVALID）；关系写幂等；读宽松。
- 查询下沉到存储：ItemsQuery/TagsQuery 可扩展条件对象（不预造方法、不做通用查询引擎）。
- 适配器一致性：memory 与 sqlite 跑同一份场景（scripts/s32、s33）。SQLite 外键会暴露排序/删除次序依赖（例：删作品先删 collection 行再删锚）。

## 渲染层与插件（裁决基线；选型论证与机制细节见 ARCHITECTURE §3）

- 壳 = 插件的**容器与展示层**；官方功能组件与三方插件**注册机制同构**，差异只收敛在信任/生命周期分层（官方静态全信；三方动态装载、权限门、错误隔离、启停卸载）。同构验收：任一官方组件改动态加载后壳行为不变（workspaceInfo 已作验收桩）。
- 贡献点清单：`activityBar:left/right` · `displayPanel` 块 · `settings` 分区 · `contentTab` 内容标签页；**不做任意跨区停靠（完整 dock）**。官方组件居左活动栏；三方左右均可、displayPanel 可贡献块。
- 扩展机制 = 贡献点（壳声明槽、插件声明填充、壳渲染），否决自由 API/钩子/管道（2026-09-06，理由见 ARCHITECTURE §3.1：保住数据流单通道与行为单一归属）。
- 呈现面三分类（2026-09-07）：停靠面（槽）/ 服务面（壳的受控服务，非插槽）/ 调用面（多贡献者调用瞬间按上下文聚合）；插件 UI 只经这三类落到壳里。
- 注册表 = 声明表（2026-09-07）：可序列化 FeatureManifest + 实现绑定 FeatureImpl（direct | async，**与 source 正交**）；错误隔离双线（setup try/catch + 槽渲染 FeatureBoundary），官方组件同边界；生命周期 per-entry（setup/dispose 配对 + unregisterFeature）；contributed 重复 id 拒绝并报告，不炸注册表。
- 命令为原子（2026-09-07）：菜单项 = 命令 + 摆放元数据，命令面板/快捷键是同一注册表的视图；`run(ctx)` 只经 HostApi，命令注册表即三方权限清单底座。when 为壳可求值的最小可序列化谓词（相等/合取，不加载实现即可过滤），防表达式引擎蔓延。事件拦截权与装配规则（分组/排序/溢出/危险区沉底）归壳，菜单自绘不用原生。
- 服务面权力（2026-09-07）：dialog/toast 是壳的受控服务（ServiceHost 统一渲染）；功能组件禁止自起弹层；manifest.surfaces 声明所需服务 = 权限清单渲染侧雏形（v0 仅声明不校验）。
- settings 归属（2026-09-07）：SettingSchema.key = 组件内 key；存储键 = `featureId:key`，由壳 config 仓统一持有并持久化（localStorage 起步，迁宿主 config 端点时键形状不变）；ui store 只保留壳自身外观。
- contentTab 状态归属（2026-09-07）：壳持标签项（featureId/title/激活），组件自持内容状态、经 HostApi 取数；关闭即销毁；同一 feature 单实例；路由 `/feature/:featureId` 是标签的投影。
- HostApi 冻结面（2026-09-07）：HostApi = 窄桥的冻结子集视图 + HOST_API_VERSION（独立演进，破坏性变更升 major）；官方可用全量窄桥（同版本发布），contributed 只经 HostApi；命令与权限清单以此为底座。
- 插件能力分层：UI 增强 → 渲染层贡献点；复杂运算/程序外能力 → **主进程能力工具 + manifest 声明式权限**；应用层不驻插件，未来扫描期解析器走窄端口 + 独立进程（utilityProcess），不做流程钩子。
- 渲染层数据流：视图状态在渲染层；改动 → 窄桥用例 → 失效重查；不本地排序/过滤。
- 视频缩略图（D16，2026-09-07）：视频缩略图 = **派生小图**，走专用窄桥 `thumbnail.save`（canvas 抓帧 JPEG base64，≤2MiB）→ 宿主落盘 `{userData}/thumbnails/{contentHash}.jpg` + 应用层 `recordThumbnail` 按 contentHash 回写 previewUri/width/height（同内容多条目共享一份；查询下沉 `ItemsQuery.contentHash`）。**不做 ffprobe/ffmpeg 依赖**——尺寸在抓帧时经 video 元素顺带取得。渲染层懒生成 + 幂等（pending/failed + 落库复用）。
- 多选与批量（D16，2026-09-07）：`MenuContext.selection` = 调用瞬间的操作对象集（target 已入多选集 → 整集带出，否则 = 单 target）；批量打标经**受控服务弹层**（服务面 batchTag，标签多选 + 打/卸两钮）→ 应用层 `tagItems/untagItems`（单事务）→ 失效重查。**批量不新造端口写方法**：事务内循环复用 attach/detach（与级联删除同款模式）。多选交互：Ctrl/Cmd+单击 toggle、单选单击即聚合。

## 假设（仍开放的默认值）

| # | 假设 | 默认值 |
|---|---|---|
| D4 | 领域层 | 同步纯函数；异步只在边界 |
| D6 | 事件 | 只保留有真实订阅者的事件 |
| D9 | 错误控制 | 异常传播（Promise reject 携带 DomainError.code）；转译在渲染/宿主边界（信封 + 渲染层中文文案均已就绪） |
| D10 | SQLite 驱动 | node:sqlite（Node 内置）；**仅限 Node ≥ 23.4 环境** |
| D11 | 消失策略 | 缺省 keep；discard 可选 |
| D12 | 内容签名 | 头/中/尾三采样（64 KiB/段），适配器共用 sampleHash |
| D13 | 宿主 | Electron；typed IPC 窄桥暴露用例；核心零依赖。内嵌 Node 20.18 无 node:sqlite → 宿主 Store 注入 better-sqlite3（落地，见 D14） |
| D14 | SQLite 驱动 | 适配层只认最小接口 `SyncSqlite`（store.ts），驱动注入：node:sqlite 在 nodeDriver.ts（Node≥22 校准用），宿主注入 better-sqlite3（Electron ABI，根 node_modules）；node:sqlite 不进 Electron 打包产物 |
| D15 | 字节闸门 | 媒体字节不走 IPC：taghit-file:// 协议（白名单=各工作区来源根+userData，**按路径段匹配**（目录根相等或紧随分隔符，防同前缀兄弟目录越权），Range 206、MIME、ACAO）；文本走窄桥 item.readText（TEXT_EXTS 白名单 + 2MiB 上限；超限返回前段并 truncated:true，比旧版整篇拒读更好用）。白名单从 Store 端口查，不裸 SQL。图片固有尺寸扫描时从文件头解析（application/mediaMeta.ts，PNG/JPEG/GIF/WebP/BMP 零依赖，替代旧版 image-size），落 items.width/height（旧库 ALTER 迁移）；瀑布流比例优先实测值并钳制 [1/2.2, 2.2]（老版逻辑），缺失回退 contentHash 估计，非媒体类型恒 4:3 |
| D16 | 视频缩略图/尺寸 | 渲染层 canvas 抓帧（<video> 经 taghit-file Range seek）+ 宿主落盘 + 按 contentHash 回写（previewUri/width/height，items 加列 ALTER 迁移）；不引入 ffprobe/ffmpeg 运行时依赖；JPEG ≤480px、base64 ≤2MiB 上限 |
| D17 | 窗口壳（2026-09-12） | 无边框窗口（frame:false + backgroundColor 同主题底色）：TabBar 兼任标题栏——drag-region 归根部（空白处拖动/双击最大化），交互元素 no-drag；右上三键自绘（WindowControls → `window.control`/`window.isMaximized` 窄桥，宿主按 sender 解析发起方窗口；最大化态随 resize 重查）。默认应用菜单置空（Menu.setApplicationMenu(null)，Ctrl+Shift+I 等随菜单失效，后续按需自注册）。主色去蓝：暗/亮主题 --accent 统一琥珀系，CSS 变量单点换，组件零改动 |

## parked

C-S · 作品嵌套/多归属 · 子树整体排除（应用层逻辑）· 后台增量扫描

# AGENTS — 插件开发上下文（plugins/ 唯一入口）

> 写或改任何插件之前必读。本文件只放插件侧的**纪律红线与能力面**；机制论证与裁决在
> DECISIONS（D42/D43/D46）、架构在 ARCHITECTURE §二——需要时按此下探，不在此复制。

## 一、插件是什么

`plugins/<dir>/` 独立目录 = 磁盘 `manifest.json`（id/title/description/settings/surfaces，
source 由装载方打 contributed）+ 入口模块 `activate(ctx)`（返回清理函数，启停的机制承载）。
当前模拟三方形态：发现/分发未接入，装载 = dev 硬编码清单（`DEV_PLUGINS`），**启动期主动激活
是刻意的**（纯预览贡献方不挂停靠面，惰性装载对它永不触发）。

## 二、纪律红线

1. **能力边界**：三方代码只经**契约模块**（`@renderer/features/contribution`，type-only 引用其导出类型是唯一例外）+ **HostApi** 取数与注册，不 import 渲染层内部模块。
2. **内容集中一页自组织**：插件提供一个页面（内部自由分区），槽的多页面是工作台 tab 栈的事——**不得自造第二套页签**（D43 教训）。
3. **不能悄悄接管**：能力对用户可见（插件面板卡片只留名称 + 启停开关；贡献面明细在**插件详情页**，点卡片进入），默认启用可停——停用 = 调激活清理函数 + 壳按 owner **清扫其命令**（贡献摘除，内置预览兜底），启用态持久化 config。
4. **产物归属判据（D42③）**：数据层产物跟宿主能力走（能力是原生的，产物就是原生的）；呈现层产物跟插件走（插件卸载即消失）。
5. **样式**：走壳 token（`var(--*)`，与主题同语）；`.error-note` 等壳类可用（同一文档、同一 Vue 实例）；插件**不受壳机检**（check:style/check:templates 不扫 plugins/），但**入类型检查**（tsconfig.web include）与**产物构建**（check:build）——提交前这两样必须过。
6. **设置声明制（D46）**：可配置项只在 manifest `settings` 声明（SettingSchema），**插件永不自绘设置 UI**——宿主按样式规范渲染（插件详情页），值落 config 仓 `featureId:key`，插件经 HostApi config **只读**。
7. **插件自持待办**记 `<dir>/TODO.md`（惯例样例：audio-cover-player）；影响壳与契约的事项归根 TODO.md。

## 三、能力面（冻结契约）

- **HostApi `0.2.4`**（additive 升级同样要升版本号）：
  `workspaces`（list/listRoots/declaredTags/browse）· `items`（query/tag/untag/readText/**readAudioMeta**——标签+封面+歌词/**open**——打开条目详情/**get**——条目视图模型，投影转换归宿主）· `media.fileUrl`（taghit-file URL 唯一合法构造入口）· `tags`（search/create/declare/undeclare）· `config`（**只读**：value 快照 / ref 响应式——读 manifest.settings 声明项的值，写入面归宿主 UI，D46）· `ui`（confirm/toast）· `playback`（play/toggle/pause/seek/setVolume/setLoop/snapshot/onChange——**快照回调订阅式**，全局播放引擎的冻结子集）。
- **ContributionContext** = `{ hostApi, previews, commands }`：
  - `previews` = detailPreview 认领注册，id 约定 `<featureId>:<form>`，后注册覆盖先注册（D37）；
  - `commands` = 命令注册表贡献（D46）：id **强制** `<featureId>.` 前缀，自动打 contributed，**只进命令面板**（右键菜单保持官方策展）；清理函数里 unregister 是插件自己的责任，壳在停用时按 owner 兜底清扫。views 槽已随歌词视图撤回——多槽贡献等真实消费方再加。
- **自开页（D47）**：插件在 manifest `mounts` 声明 `contentTab` + 入口模块**具名导出 `page`**（整页 Vue 组件）——壳绑定为该插件的全页呈现：插件管理页显形「打开页面」入口，点开即新标签页；**内容与交互完全归插件**，壳只提供容器（壳持标签项/单实例/FeatureBoundary 错误隔离）。插件不自行弹页（不能悄悄接管）；停用即随贡献摘除。
- 契约类型唯一入口 = `@renderer/features/contribution`（type-only）。

## 四、装载与调试

- **新增插件**：`frontend/src/renderer/src/features/contributedPlugins.ts` 的 `DEV_PLUGINS` 加字面量条目（动态 import 必须字面量——vite/rollup 静态分析前提）。
- **启停/管理**：插件面板（左侧「插件」）卡片启停开关；**管理页**（面板角标进全页）= 每插件的身份/贡献面/设置/启停 + 自开页入口；启用态存 config（`plugins:enabled:<featureId>`）。
- **真机**：`npm run dev`；**宿主侧改动（ipc/preload）必须重新 bundle 并重启应用**，渲染层与插件改动刷新窗口即可。

## 五、关键文件（按需读源码）

| 文件 | 职责 |
|---|---|
| `frontend/src/renderer/src/features/contribution.ts` | 契约模块（插件 API 包的雏形） |
| `frontend/src/renderer/src/features/hostApi.ts` | HostApi 冻结面 + 版本号 |
| `frontend/src/renderer/src/features/contributedPlugins.ts` | dev 装载 + 启停（含命令清扫、自开页 fullPage 绑定） |
| `frontend/src/renderer/src/features/registry.ts` | 功能组件注册表 |
| `frontend/src/renderer/src/features/plugins/PluginsFullPage.vue` | 插件管理页（全页呈现，D47） |
| `frontend/src/renderer/src/features/detailPreview.ts` | detailPreview 认领解析（纯注册表） |
| `frontend/src/renderer/src/features/preview/builtinPreviews.ts` | 内置四类预览的出厂注册（.vue 不进契约链） |
| `plugins/audio-cover-player/` | 首插件样例（黑胶播放器：预览槽 + 命令 + 设置声明制 + 自开页「正在播放」——四个面的首个消费方） |

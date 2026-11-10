# AGENTS — 插件开发上下文（plugins/ 唯一入口）

> 写或改任何插件之前必读。本文件只放插件侧的**纪律红线与能力面**；机制在
> `docs/ARCHITECTURE.md` §二/§三，论证笔记在 `.agents/notes/`——需要时按此下探，不在此复制。

## 一、插件是什么

`plugins/<dir>/` 独立目录 = 磁盘 `manifest.json`（id/title/description/version/author/
apiVersion/settings/surfaces/mounts，source 由装载方打 contributed）+ 入口模块
`activate(ctx)`（返回清理函数，启停的机制承载）。**启动期主动激活是刻意的**（纯预览
贡献方不挂停靠面，惰性装载对它永不触发）。

**贡献文案两形态**：manifest 的 `title` / `description` / `settings[].label` / `options[].label`
及命令注册、toast/confirm 的文案，均可写**字符串**（原样透传）或**语言映射**
（`{ "zh": …, "en": … }`，值非空字符串）——渲染层按当前语言取值、缺失回落首值；
命令 title 在注册时按当前语言取快照，切语言后重新装载刷新。纯字符串写法不受影响（第三方插件零改动）。

**装载**：宿主端点驱动的运行时装载（`DEV_PLUGINS` 手工清单已退役）——开发目录经 dev 态清单
直入；**zip 分发**（`node scripts/pack-plugin.mjs <目录名>` 打包）→ 管理页「安装插件」→
`{userData}/plugins/<id>/` 落位 → bundle 经 `taghit-plugin://` 协议装载。zip 包 = manifest.json +
预构建 ESM bundle（`index.js`，vue import 已重写到宿主共享模块）；manifest 必填
`version`/`apiVersion`（宿主安装校验，apiVersion 超宿主现值即拒装）；解包预检 = yauzl 中央目录
校验（条目数上限 / 64MiB 总量 / 文件名守门拒路径穿越）。

## 二、纪律红线

1. **能力边界**：三方代码只经**契约模块**（`@renderer/features/contribution`，type-only 引用其导出类型是唯一例外）+ **HostApi** 取数与注册，不 import 渲染层内部模块。
2. **内容集中一页自组织**：插件提供一个页面（内部自由分区），槽的多页面是工作台 tab 栈的事——**不得自造第二套页签**（首插件教训）。
3. **不能悄悄接管**：能力对用户可见（插件面板卡片只留名称 + 启停开关；贡献面明细在**插件详情页**，点卡片进入），默认启用可停——停用 = 调激活清理函数 + 壳按 owner **清扫其命令**（贡献摘除，内置预览兜底），启用态持久化 config。
4. **产物归属判据**：数据层产物跟宿主能力走（能力是原生的，产物就是原生的）；呈现层产物跟插件走（插件卸载即消失）。
5. **样式**：走壳 token（`var(--*)`，与主题同语）；`.error-note` 等壳类可用（同一文档、同一 Vue 实例）；插件**不受壳机检**（check:style/check:templates 不扫 plugins/），但**入类型检查**（tsconfig.web include）与**产物构建**（check:build）——提交前这两样必须过。
6. **设置声明制**：可配置项只在 manifest `settings` 声明（SettingSchema），**插件永不自绘设置 UI**——宿主按样式规范渲染（插件详情页），值落 config 仓 `featureId:key`，插件经 HostApi config **只读**。
7. **插件自持待办**记 `<dir>/TODO.md`（样例：`plugins/audio-cover-player/TODO.md`）；影响壳与契约的事项归根 TODO.md。

## 三、能力面（冻结契约）

- **HostApi `0.2.4`**（additive 升级同样要升版本号）：
  `workspaces`（list/listRoots/declaredTags/browse）· `tags`（search/create/declare/undeclare）·
  `media.fileUrl`（taghit-file URL 唯一合法构造入口）· `ui`（confirm/toast）·
  `items`（query/tag/untag/readText/**readAudioMeta**——标签+封面+歌词/**open**——打开条目详情/
  **get**——条目视图模型，投影转换归宿主）·
  `config`（**只读**：value 快照 / ref 响应式——读 manifest.settings 声明项的值，写入面归宿主 UI）·
  `playback`（play/toggle/pause/seek/setVolume/setLoop/snapshot/onChange——**快照回调订阅式**，全局播放引擎的冻结子集）。
- **ContributionContext** = `{ hostApi, previews, commands }`：
  - `previews` = detailPreview 认领注册，id 约定 `<featureId>:<form>`，后注册覆盖先注册；
  - `commands` = 命令注册表贡献：id **强制** `<featureId>.` 前缀，自动打 contributed，
    **只进命令面板**（右键菜单保持官方策展）；清理函数里 unregister 是插件自己的责任，
    壳在停用时按 owner 兜底清扫。views 槽已随歌词视图撤回——多槽贡献等真实消费方再加。
- **自开页**：插件在 manifest `mounts` 声明 `contentTab` + 入口模块**具名导出 `page`**（整页
  Vue 组件）——壳绑定为该插件的全页呈现：插件管理页显形「打开页面」入口，点开即新标签页；
  **内容与交互完全归插件**，壳只提供容器（壳持标签项/单实例/FeatureBoundary 错误隔离）；
  停用即随贡献摘除。
- 契约类型唯一入口 = `@renderer/features/contribution`（type-only）。

## 四、装载与调试

- **开发调试**：插件目录放 `plugins/`（dev 态自动进清单）——`npm run dev`，**渲染层与插件改动
  刷新窗口即可**（源码经 vite 即时编译）；**宿主侧改动（ipc/preload/协议）必须重启应用**
  （dev 启动会自动重新打包宿主）。
- **zip 分发**：`node scripts/pack-plugin.mjs <目录名>` → `build/plugins/<id>-<version>.zip`
  （vite lib 构建 + vue 导入重写到宿主共享模块 + SFC 样式内联）→ 管理页「安装插件」导入；
  同 id 重装 = 覆盖升级，卸载 = 管理页危险确认。bare 依赖只允许 vue（打包时重写），
  其余一律 bundle 内联；契约模块 type-only 引用。
- **启停/管理**：插件面板（左侧「插件」）卡片启停开关；**管理页**（面板角标进全页）= 每插件的身份/贡献面/设置/启停/卸载 + 安装入口 + 自开页入口；启用态存 config（`plugins:enabled:<featureId>`）；装载失败（清单/激活/HostApi 版本）在管理页错误卡呈现。
- **安装位自检**：`node scripts/plugins-selfcheck.ts`（zip 安装/覆盖/校验拒绝/卸载/清单，node 直验）。

## 五、关键文件（按需读源码）

| 文件 | 职责 |
|---|---|
| `frontend/src/renderer/src/features/contribution.ts` | 契约模块（插件 API 包的雏形；previews/commands owner 记账与清扫） |
| `frontend/src/renderer/src/features/hostApi.ts` | HostApi 冻结面 + 版本号 |
| `frontend/src/renderer/src/features/contributedPlugins.ts` | 运行时装载（宿主清单驱动、形态分派、启停/卸载/重装、loadErrors） |
| `frontend/src/renderer/src/features/registry.ts` | 功能组件注册表 |
| `frontend/src/renderer/src/features/plugins/PluginsFullPage.vue` | 插件管理页（安装/卸载/启停/设置/错误呈现） |
| `frontend/src/renderer/src/features/detailPreview.ts` · `preview/builtinPreviews.ts` | detailPreview 认领解析（纯注册表）· 内置四类预览出厂注册（.vue 不进契约链） |
| `src/host/plugins.ts` | 安装位纯逻辑（zip 校验/安装/卸载/清单；宿主 = 装载事实权威） |
| `src/host/pluginProtocol.ts` | `taghit-plugin://` 模块协议（bundle 装载通道 + `__vendor/vue` 共享模块） |
| `scripts/pack-plugin.mjs` | 插件 zip 打包（参考实现） |
| `plugins/audio-cover-player/` | 首插件样例（黑胶播放器，行为规格见其 `README.md`；已可 zip 分发） |

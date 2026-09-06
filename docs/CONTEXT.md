# TagHit 开发交接（CONTEXT）

> 面向 AI 会话的**快速交接**。完整架构/状态/渲染-核心分离见 **docs/ARCHITECTURE.md**；词汇 GLOSSARY；裁决 DECISIONS。
> 版本：0.2.3（待 tag）。

## 一、一句话

0.2 领域先行重写：后端核心全部完成并通过校准；宿主契约 v0（32 端点 + 信封，单一事实源 src/host/ipc.ts）与旧 UI 吸收（frontend 全量换轨 window.taghit，缺口降级置灰）已完成；方向 = 插件生态（见 ARCHITECTURE §3/4）；贡献点 v0 类型化已完成（Manifest 带 source 信任层、setup 可退订、活动栏由注册表驱动、workspaceInfo 切片消费 HostApi；插件选型理由固化在 ARCHITECTURE §4.1）；**真机接线已完成**（真窗口 + IPC + better-sqlite3 落库全链路已验证）；下一步 = 字节闸门。

## 二、读序

README → 本文件 → **ARCHITECTURE** → GLOSSARY → DECISIONS → src/{domain,ports,application}；`frontend/` 是渲染层（已接窄桥）。

## 三、下一步

1. ~~真机接线~~（已完成）：宿主 Store 驱动注入化（store.ts 只收 SyncSqlite；node:sqlite 在 adapters/sqlite/nodeDriver.ts，Electron 无此模块不进产物），Electron 主进程注入 better-sqlite3（根 node_modules，ABI=Electron 33，勿让 node v24 直接加载）。
2. ~~字节闸门~~（已完成）：媒体经 taghit-file:// 协议（host/protocol.ts，白名单=来源根+userData，Range/MIME/ACAO；privileged 注册须在 ready 前）；文本经 item.readText 窄桥（application/content.ts，TEXT_EXTS 白名单 + 2MiB 上限，超限返回前段 truncated:true）。渲染侧 lib/media.ts taghitFileUrl + previewKindOf；ItemDetail 四类预览 + ItemCard 图片缩略图均接通。已修渲染层启动 bug：registerBuiltinFeatures 必须先于 app.mount（否则活动栏空轨）。
3. ~~界面美化~~（已完成）：考古结论——主题底座/壳层组件与老版逐字节一致，真正缺口只有 4 处，已补齐：瀑布流真实高度（contentHash 派生确定性宽高比，仅图片/视频参与变高，其余类型 4:3——用户裁定）、列表行修改时间、StartScreen 搜索瀑布流、工作区卡「N 来源根」徽标。元数据（EAV）落地后比例换实测值。
4. 功能组件显示问题：瀑布流不显示已随美化修复；图片比例已按老版逻辑落真值（扫描时 mediaMeta.ts 解析文件头 → items.width/height，瀑布流钳制 [1/2.2,2.2]，重扫即补齐旧数据）；**视频缩略图仍待帧抓取管线**（taghit-file 协议已就绪，缺 canvas 抓帧/封面提取，旧版 lib/thumbnailer.ts 思路可参考；视频尺寸同理待 ffprobe/元数据）。
5. contentTab 贡献点槽（壳标签页仍为固定四类）。
6. Backlog：事件（D6，扫描进度）、EAV 建模、标签语义带出、config 持久化、LICENSE、CI —— 见 ARCHITECTURE §5。

## 四、纪律

1. 层纪律：领域纯类型+规则；流程在应用层；存储/IO 在适配器；宿主只装配与边界；端口不做业务判定。
2. 术语纪律：只用 GLOSSARY 词；禁自造语义词（历史：is-a/修饰曾致幻觉）。
3. 文档纪律：维护 GLOSSARY / DECISIONS / CONTEXT / **ARCHITECTURE** + README；不留轮次记录。
4. 不预建模：parked 项不进代码。
5. 提交前所改层 `tsc -p tsconfig.<domain|ports|adapters|application|host>.json` 通过；语义变更即同步文档；动契约/适配器后跑三份校准。

## 五、环境与 git

- 无 node_modules：存档 tsc `& 'D:\PROJECT\freeze\TagHit-Electron-0.1.2\node_modules\.bin\tsc.cmd' -p tsconfig.<layer>.json`；node v24 直跑 TS。
- frontend：已装 node_modules；`npx vue-tsc --noEmit -p tsconfig.web.json --composite false`（web）与 `npx tsc --noEmit -p tsconfig.node.json --composite false`（构建配置）；契约类型经 @host/* alias type-only 引用根 src/host/ipc.ts。
- 校准：`npm run calibrate | calibrate:sqlite | calibrate:scan`。
- 真机运行：终端 A `npm run dev:renderer`（vite@5173）；终端 B `npm run bundle:host`（esbuild 打 src/host → build/main.cjs + preload.cjs，node:sqlite/better-sqlite3/electron external）后 `TAGHIT_RENDERER_URL=http://localhost:5173 TAGHIT_DB=<db路径> npm run start:host`。根 node_modules 仅存 better-sqlite3/bindings/file-uri-to-path（复制自 freeze，Electron ABI）。
- git：本地提交可做；**打 tag 前先向用户确认一次再打**；push（含 tag）由真人执行。

## 六、文件地图（要点）

```
src/domain/ · src/ports/ · src/adapters/ · src/application/   ← 后端核心（ARCHITECTURE §2）
src/host/      main（装配+IPC）· preload（window.taghit）· ipc（typed 契约）· env.d.ts
frontend/      渲染层（Vue3+Pinia；shared/contract.ts=契约桥，shared/api.ts=门面+D9 文案，lib/viewModel.ts=视图适配；electron-vite 仅 renderer）
scripts/       s32（六用例）· s33（扫描）—— memory/sqlite 各入口
docs/          GLOSSARY（词）· DECISIONS（裁决）· ARCHITECTURE（架构/状态）· 本文件（交接）
```

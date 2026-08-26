# TagHit 开发交接与进度指引（CONTEXT）

> 记录时间：2026-08-23（v0.1.2，续：功能组件后续会话）
> 定位：**跨 session 交接点**——无论新的人类开发者还是新 session 的 AI，先读本文档即可接上"项目进行到哪、下一步做什么、有什么坑"。
> 新 session 必读顺序：**本文件 → [ARCHITECTURE.md](ARCHITECTURE.md) → 任务相关专项文档（[PLUGIN-ARCH](PLUGIN-ARCH.md) / [API](API.md) / [USAGE](USAGE.md)）**

---

## 一、当前状态（v0.1.2 + 本地未提交改动）

- **已发布**：v0.1.2 提交 `c8b0db2` + tag `v0.1.2` 已在本地；**推送状态**：用户自行 push（`git push origin main --tags`；代理 127.0.0.1:7897 未开时用 `git -c http.proxy= -c https.proxy= push origin main --tags`）。后补提交 `111258d`（构建脚本）、`11ed39f`（文档交接）也待推送。
- **本地未提交**（2026-08-23 后续会话，功能组件框架相关）：列表布局文件管理器行样式 + 单列虚拟化修复、全局 UI 缩放（`config.uiScale`，CSS zoom）、键鼠交互组件（Ctrl+F 搜索）、设置页按组件分组渲染、`lib/format.ts` 统一格式化（详情见 [ARCHITECTURE.md](ARCHITECTURE.md) §六；git 工作区 `todo` 未跟踪）。
- **Windows 安装包已生成**：`dist/TagHit Setup 0.1.2.exe`（80.8MB，NSIS）。
- **构建方式**：`npm run release:win`（普通终端）/ `npm run release:win:full`（管理员终端）——见 `scripts/build-release.ps1` 头注释。

## 二、已知坑速查（跨 session 不要重复踩）

| 坑 | 解法 |
|---|---|
| GitHub 直连超时（20.205.243.166 不通） | electron-builder 二进制走 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`（已固化进 release 脚本） |
| winCodeSign 解压失败：7za `-snld` 创建符号链接需权限 | 普通终端用 `--config.win.signAndEditExecutable=false`（跳过资源编辑，exe 默认图标）；完整图标/版本信息需**管理员终端** + `-Full` |
| 无签名证书时打包卡/失败 | `CSC_IDENTITY_AUTO_DISCOVERY=false` |
| Windows PowerShell 5.1 读 .ps1 中文乱码（GBK） | **脚本文件一律英文输出**（build-release.ps1 已遵此） |
| 沙箱（AI 环境）无法写 workspace 外路径（LOCALAPPDATA） | 涉及 electron-builder 缓存/打包的命令需完整权限 |
| esbuild spawn EPERM（沙箱） | 构建命令需完整权限（esbuild 需管道通信） |
| 打包时 TagHit.exe 进程占用 dist | 先关闭运行中的 TagHit（安装版/win-unpacked）再打包 |
| 开发模式数据在 `%APPDATA%\taghit`，打包后在 `%APPDATA%\TagHit` | 两套数据不共享，正常现象 |

## 三、待办优先级（按用户关注顺序，完整清单见 `../todo`）

1. **筛选/搜索逻辑重做**——用户判定现有实现有问题（细节待用户展开，先别动）
2. **详情页"程序背景"观感**——媒体预览处灰/黑底其实是右侧信息栏底色造成的观感，方案待用户确认
3. **tag 管理详细页**——排在"显示"功能组件讨论之后
4. **媒体元信息三层显示 + 设置项**——文件类型→格式→格式元信息（分辨率/时长/作者…）
5. **其余功能组件标准化**——paths/tags/info/plugins/theme/scanSettings 迁移注册表框架（info 的 size/date 格式化已收敛 `lib/format.ts`）；媒体类型列表数据驱动（fileFormatMap）
6. **插件 P0/P1**（见 PLUGIN-ARCH）：manifest apiVersion/contributes 校验 → `ctx.app.*` 领域 API + 事件分发到插件
7. 排序进阶（日期范围/多标签组合/全局搜索排序）· 拖出文件 · better-sqlite3 升级 · i18n

## 四、本轮工作记录（2026-08-23 后续会话，未提交）

> 已全部落地并 typecheck 通过；功能细节见 ARCHITECTURE §六 对应条目。

1. **列表布局 = 文件管理器行样式**：缩略图 + 文件名/标签 + 大小/修改时间/类型三列；行距 4px 紧凑（`LIST_GAP`）；**顺带修复虚拟化 bug**——列表此前误用网格 `cols` 切行（滚动高度漂移/后半内容不可达），现按 1 列行进。
2. **全局 UI 缩放**：`config.uiScale`（0.8–1.5）CSS `zoom` 连续缩放，设置页滑块实时生效；决策与备选方案见 ARCHITECTURE §5.3。
3. **键鼠交互组件 `keyboardMouse`**（仅设置页，占位）：Ctrl+F/Cmd+F 聚焦搜索框（工作区/主页，`data-shortcut="search"` 定位，可开关）；框架扩展 `FeatureDefinition.setup` 行为钩子（`setupFeatureBehaviors()` 启动执行）。
4. **设置页设置分区按组件 title 分组渲染**（原合并的"显示"分区拆为每组件一个 panel，符合 ARCHITECTURE §5.1）。
5. **`lib/format.ts`**：`formatSize`/`formatDate` 统一；InfoPanel/ItemDetail 内联 `formatBytes` 已收敛删除。

## 五、文档维护机制（2026-08-23 确立）

> 背景：ARCHITECTURE.md 曾出现两处过时（finalizeScanStatus 旧函数名、主页"可多开"旧决策）——文档是活的需要持续维护。

1. **代码变更 → 同步文档**：凡改动架构级实现（服务/DAO 拆分、行为决策变化、IPC 通道增删），**必须在同一提交更新** ARCHITECTURE.md 对应描述（设计决策入 §五，待办更新 `../todo`）。教训：P0.5 大改后漏了两处细节，靠这次核对才补上。
2. **每个 release 做一次文档体检**：发布前核对 ARCHITECTURE 的功能状态/设计决策、`../todo` 的待办、CONTEXT 的状态与坑表——删过时、补新决策。
3. **AI 的角色**：新 session 开始时读文档，若发现与当前代码不一致（旧函数名、旧决策、旧结构），**主动报告并修复**，不要静默沿用过时描述。
4. **文档稳定性分级**：
   | 级 | 文档 | 更新频率 |
   |---|---|---|
   | 稳定（契约） | PLUGIN-ARCH（契约冻结后）、API.md | 破坏性变更才动 |
   | 跟随代码 | ARCHITECTURE.md | 每次架构级改动 |
   | 持续维护 | CONTEXT.md（状态/坑/待办）、`../todo`（待办）、ARCHITECTURE §五（决策） | 每次开发会话收尾 |
   | 用户向 | USAGE.md | 功能行为变化时 |
5. **CONTEXT.md 本身**：每次开发会话结束时更新（状态、坑、待办变化）。

---

*新 session 的 AI：如果本文档某处与实际代码不符，请按上述机制修正并记录，而不是绕过。*

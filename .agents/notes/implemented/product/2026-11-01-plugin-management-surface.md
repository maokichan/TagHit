# 决策：插件管理面——卡片简化、声明制设置与 commands 槽

Status: implemented

## Problem

插件能力管理（启停开关、面板卡片）已随播放全局化裁决落地，但管理面仍停留在"能开关"：插件的身份与能力清单没有阅读面；插件要提供配置（歌词字号这类）没有通路——插件自绘 UI 与壳样式纪律冲突，不声明则宿主不可见；三方命令有机制预留（contributed 类型、unregisterCommand、面板如实标注不可用）却没有贡献通路。插件职能 = 管理与装载，这轮把管理面立起来。整套裁决在 `docs/DECISIONS.md` D46 行压成了一行结论，论证层由本篇承载。

## Decision

按**插件职能 = 管理与装载**组织（开发者定调），四则：

**① 管理界面分工**：窄面板卡片 = 扫视面，只留名称 + 启停开关（id/简介进 hover）；点击卡片进插件详情页（全页，词条式分区：重心 = 贡献面清单（provider id 前缀推导；机制更换归主线 1）、次级 = 身份事实 → 声明面（manifest.surfaces 如实标注"仅声明未校验"）→ 设置 → 启停动作；版心 64rem 全页 token）。此形态后被 D47 修订——宿主词条页撤除、呈现权分离，现状以 `.agents/notes/implemented/product/2026-11-01-plugin-page-split.md` 为准。

**② 可配置项声明制**：manifest 增 `settings`（SettingSchema 复用，装载接线）与 `description`（additive，不触碰贡献面声明/激活条件结构）；插件永不自绘设置 UI——声明 schema、宿主经 SchemaControl 按样式规范渲染，值落 config 仓 `featureId:key`；HostApi 0.2.3 additive 增 config 只读域（value 快照 + ref 响应式，写入面只归宿主 UI）。首个真实消费方 = audio-cover-player 歌词字号。

**③ commands 槽**（VS Code 语义：命令全进面板，右键菜单保持官方策展）：ContributionContext 增 commands 槽，装载改每插件独立 ctx；register 强制 id 前缀 `<featureId>.`（registerCommand 重复 id 抛错兜底）+ owner 记账；`setPluginEnabled(false)` 按 owner 清扫（停用插件不得残留）；palette 去 official-only 过滤（面板 = 注册表视图，D33 语义不变），assembleMenu 官方过滤保留；三方快捷键绑定不做（权限面地盘）。首个真实命令 = audioPlayer.revealPlaying「转到正在播放的条目」（全局播放切走不停播的回看缺口）。

## Alternatives considered

- **插件自绘设置 UI**：输在壳的样式纪律管不到三方——自绘 UI 必然漂出样式规范，且配置无声明则能力清单缺一块、权限面无从谈起；声明制让宿主统一渲染、值统一落 config 仓，插件零 UI 代码，启停/卸载后的配置语义也有了归属。
- **palette 保持 official-only 过滤**：输在面板是命令注册表的视图（D33）——隐藏注册过的命令等于"注册了却看不见"，沉底灰显标"当前不可用"才能解释"为什么现在按不了"；故只去面板过滤，右键菜单的官方策展保留（assembleMenu 过滤不动）。
- **放开三方快捷键绑定**：输在快捷键绑定是全局输入劫持，属权限面地盘——面板/菜单都还只是"呈现 + 显式触发"，绑定组合键是更高一级的权力，v0 不放；HostApi 冻结面是权限清单底座，不放权的口子不开在机制层。
- **register 不设前缀与 owner 记账**：输在停用清扫无处下手——没有 owner 记账，`setPluginEnabled(false)` 摘不干净贡献，残留命令即"悄悄接管"；前缀强制让 id 空间按插件分域，重复 id 抛错兜底。
- **窄面板卡片常驻完整身份事实**（id/简介上卡面）：输在窄面板是扫视面——常驻身份信息挤占开关与清单的空间；扫视面只留"是什么 + 开不开"，详情下沉详情页（词条式分区承载）。

## Consequences

所得：插件配置有了声明通路（首个消费方歌词字号落地）；三方命令有了贡献通路并接入命令面板（revealPlaying 补上全局播放切走不停播的回看缺口）；启停清扫按 owner 收口，"不能悄悄接管"落到命令层面；管理面的扫视面/详情页分工有了形状。

代价：manifest.surfaces 仍"仅声明未校验"（权限执行远期）；三方快捷键绑定缺席是刻意留白；provider id 前缀推导是临时机制（机制更换归主线 1）；详情页形态旋即被 D47 修订（宿主词条页撤除）——本篇 ① 的全页词条形状不再是现状，呈现权分离后的现状以 D47 笔记为准，②③ 的声明制与命令通路不受影响。

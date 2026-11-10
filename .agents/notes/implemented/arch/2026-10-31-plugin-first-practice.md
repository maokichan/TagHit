# 决策：插件首批实战——宿主原生能力与产物归属

Status: implemented

## Problem

注册表与贡献点的机制件（FeatureManifest / FeatureImpl、detailPreview 槽、HostApi 冻结面）已在[架构活体文档](../../../../docs/ARCHITECTURE.md) §二定形，但从未有一个真实三方形态的插件走完全程：三方激活契约悬空——激活上下文里有什么、类型引用从哪里进、三方装载怎么接，都只有机制预留没有实战答案；
宿主能力与插件产物的归属也没有判据——音频封面解析这类"宿主做还是插件做"的问题无口径，产物（落盘的封面、解析出的标签）跟着能力走还是跟着插件走同样无答案。立第一个真实插件（音频封面 + 播放器，模拟三方形态验证插件开发能力）之前，这两件事必须先裁。整套裁决的现行事实住[插件子树入口](../../../../plugins/AGENTS.md)，论证层由本篇承载。

## Decision

首插件 = 音频封面 + 播放器，三方目录形态：仓库根 [plugins/audio-cover-player](../../../../plugins/audio-cover-player) 独立目录 + 磁盘 `manifest.json`（FeatureManifest 去 source，由 registerContributedFeature 打 contributed）+ 入口模块 `activate(ctx)`。
激活上下文与组件运行期分名：`ContributionContext` = hostApi + 贡献注册面（v0 只有 detailPreview 槽的 register/unregister），三方运行时只经此面，类型引用唯一入口 = 契约模块；HostApi 升 0.2.0（items.readAudioMeta + media.fileUrl，additive）。
装载初为 dev 接线（硬编码清单），启动期主动激活是刻意的；运行时装载后来归宿主插件协议（见 [.agents/notes/implemented/product/2026-11-04-plugin-distribution-v1.md](../product/2026-11-04-plugin-distribution-v1.md)），启动期主动激活的语义不变。

封面解析归宿主原生能力，开发者裁定的口径是：宿主只提供本来就有的能力，不替插件留功能。端点 `item.readAudioMeta`（命名与 readText 同族），闸门 = 扩展名集合（对齐渲染层默认音频表；类别映射是渲染层可配置项、宿主不可见，双表人工同步，漂移只影响提取覆盖面）∩ 解析成功。

产物归属判据：**数据层产物跟宿主能力走（能力是原生的，产物就是原生的）；呈现层产物跟插件走（插件卸载即消失）**。封面经既有缩略图通道落盘（`{userData}/thumbnails`、contentHash 键、同内容共享、2MiB 闸、幂等）并按哈希回写 previewUri 与封面实测宽高——网格/胶片条随 previewUri 零新增认识成本，瀑布流比例采纳实测值；
插件卸载后已落盘缩略图留下（派生缓存随时可再推导，无孤儿、无清理机制）。音频标签（title/artist/album）只在端点响应瞬态返回，不进领域 schema。

机检边界：三方目录不入壳机检（check:style / check:templates——三方不受壳禁区约束），入类型检查（[frontend/tsconfig.web.json](../../../../frontend/tsconfig.web.json)）与产物构建（check:build）；tailwind content 收入插件源码；vue 经 alias 钉到壳的同一份运行时。

## Alternatives considered

- **宿主替插件留功能**（为插件预建专门的媒体能力面）：输在宿主本就持有这些能力——音频元数据/封面提取与视频抓帧、图片尺寸解析同族，是程序自有媒体事实；替插件留功能等于为想象中的插件需求预建模，插件缺席时成为无主代码。开发者裁定不采纳。
- **惰性装载作为默认激活路径**：纯预览贡献方不挂任何停靠面，SurfaceHost 的惰性装载永远不会触发——默认惰性等于三方插件永远不激活。故启动期主动激活；惰性激活条件归分发里程碑再裁，不预建模。
- **封面产物随插件走、插件自管清理**：输在产物跟着能力走才无孤儿——封面若落插件目录，卸载即弃、重装即重算，还得配一套清理机制防孤儿文件；派生缓存本就随时可再推导，复用既有缩略图通道零新增认识成本。
- **音频标签进领域 schema**：输在无查询/聚合消费方——title/artist/album 只在端点响应瞬态可用，没有"要被排序/搜索"的真实需求，进 schema 是无消费方的持久化承诺；"要可查询时再提为真列"的原则此前已立，此处照办。
- **三方目录纳入壳机检**：输在三方不受壳禁区约束是三方形态的定义——壳的样式禁区、模板规则对三方代码无管辖权；但完全放出去会让三方代码编译漂移，故机检分两档切分：壳机检不入、类型检查与产物构建必入。

## Consequences

所得：三方形态的激活契约、产物归属判据、机检边界首次经实战检验，本套裁决（现行事实见[插件子树入口](../../../../plugins/AGENTS.md)）成为后续插件的模板；封面在网格/胶片条/瀑布流全链路原生呈现，同内容共享一份派生缓存；判据被后续裁决直接延伸（播放归属见 [.agents/notes/implemented/arch/2026-10-31-global-playback.md](2026-10-31-global-playback.md)，歌词归属同款）。

代价：音频扩展名双表（宿主闸门表与渲染层默认音频表）人工同步，漂移只影响提取覆盖面；插件卸载后缩略图残留在 `{userData}/thumbnails`（可接受的派生缓存）；readAudioMeta 的失败可见性是收口时补的最后一角——初版组件侧吞错掩盖了端点失败，重挂载后端点验证通过才收口。

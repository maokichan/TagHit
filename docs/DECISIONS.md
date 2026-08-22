# TagHit 决策记录（DECISIONS）

> 记录时间：2026-08-23（随项目日期）
> 起始：自"功能组件"话题（含之前的插件系统、领域服务层讨论）以来的设计意图与决策，供后续开发对齐。
> 相关：[PLUGIN-ARCH.md](PLUGIN-ARCH.md)（插件/契约 RFC）、[ARCHITECTURE.md](ARCHITECTURE.md)、[API.md](API.md)、[USAGE.md](USAGE.md)

---

## 一、功能组件标准化（核心决策）

### 1.1 概念：功能组件 = 自包含单元

一个功能组件负责一个明确的用户功能，内部聚合四样东西，**对外只暴露声明**：

```
状态（自己的数据）· 逻辑（自己的行为）· 配置（用户可调项 schema）· 渲染（自己的 UI）
        │
        ▼ 对外只暴露 manifest：
{ id, title, mounts, settings: SettingSchema[], dataSource? }
```

### 1.2 组织形态：每个组件一个目录，三样导出

```
src/renderer/src/features/<featureId>/
├── manifest.ts    声明（id/title/mounts/settings/dataSource）
├── index.vue      面板 UI（读写自己的状态）
└── types.ts       组件自身类型（按需）
```

宿主（活动栏 / 显示面板 / 设置页）**不 import 具体组件**，只查询注册表：
`registry.list(mount)` → 按声明渲染。官方组件代码注册；未来插件经贡献点注册走同一条路。

### 1.3 独立 vs 混合：独立开发、宿主聚合

- 组件之间**绝不互相 import**；通信只经宿主协调或共享 store 切片（如 `uiStore.layoutMode`）。
- 好处：改一个功能不动其他；删功能不牵连；新功能 = 新目录 + 注册一行。
- 反例（已消灭）：原 `DisplayPanel.vue` 把媒体类型/排序/布局/标题四个区块写在一个文件里。

### 1.4 可配置性：设置页 = 功能组件的配置渲染视图

- 组件声明 `settings: SettingSchema[]`（key 对应 config 字段），设置页遍历注册表**自动生成分区**，不再手写表单集。
- **配置单一来源**：同一组件的面板实例与设置页实例读写**同一份值**（收敛在 store → config），两处天然一致。
- 现状证据（已修复）：`showTitles` / `layoutMode` 原在显示面板与设置页**两处手写编辑**。

### 1.5 挂载点模型

```
type MountPoint = 'activityBar:left' | 'activityBar:right' | 'displayPanel' | 'settings' | 'statusBar' | 'grid'
```

- 同一组件可挂多处（如 `layout` 挂 `displayPanel + settings`）。
- **"卡片标题不出现在活动栏"**：`showTitles` 仅挂 `settings`（用户决策，见 §2）。

---

## 二、已实施（v0.1.3）

### 2.1 框架落地
| 文件 | 内容 |
|---|---|
| `src/shared/types/feature.ts` | `FeatureManifest` / `SettingSchema` / `MountPoint`（三端共享） |
| `src/renderer/src/features/registry.ts` | `registerFeature` / `listFeatures(mount)` / `registerBuiltinFeatures()`（main.ts 启动注册） |
| `src/renderer/src/components/settings/SchemaControl.vue` | 通用设置控件（boolean → 开关 / enum → 按钮组） |

### 2.2 显示组件拆分
| 组件 id | 挂载点 | 说明 |
|---|---|---|
| `mediaTypeFilter` 媒体类型 | displayPanel | 独立面板组件（类别列表 v1 固定五类；`dataSource: 'fileFormatMap'` 预留） |
| `sort` 排序 | displayPanel | 排序键仍从 `ItemService.listSortKeys` 驱动式查询 |
| `layout` 布局 | displayPanel + settings | 声明 `layoutMode` 枚举 schema，两处共享 |
| `showTitles` 卡片标题 | **仅 settings** | 按用户决策移出活动栏 |

### 2.3 宿主改造
- `DisplayPanel.vue` → **注册表容器**（不再内联实现；卡片标题区块已移除）。
- `Settings.vue` → 新增"显示"分区（注册表渲染 layout + showTitles 控件）；"外观"中原"网格布局/卡片标题"手写块删除（theme/开始界面封面保留，未标准化）。

---

## 三、遗留待办（用户明确提及，尚未实施）

> 以下按用户原话/意图记录，优先级待用户确认。

1. **筛选/搜索逻辑有问题（用户判定）**：用户指出当前筛选与搜索逻辑"做的有很大的问题"——具体问题待用户展开，**先不动**。
2. **详情页背景澄清**：媒体预览处的灰/黑背景**不是容器**，是**程序背景**（右侧详细信息边栏底色造成的观感）——处理方案待用户确认后实施。
3. **tag 管理详细页**：用户要求标签管理有详细页；**排在"显示"功能组件讨论之后**。
4. **媒体元信息三层显示 + 设置项**：文件类型 → 格式 → 格式元信息（分辨率/时长/作者等）都需要显示，且设置界面要有对应可配置项——与 `info` 组件、`metadata-schema.json` 数据驱动相关。
5. **媒体类型列表数据驱动**：类别列表应从 `config.fileFormatMap` 生成（`dataSource` 已预留，v1 固定五类）。
6. **其余功能组件标准化**：paths / tags / info / plugins / theme / scanSettings 尚未迁移到注册表框架。

---

## 四、关联决策（同期的其他设计）

- **插件系统**：生态定位 = 官方/半可信插件；插件契约基座 = 领域服务层（P0.5 已落地）；详见 [PLUGIN-ARCH.md](PLUGIN-ARCH.md)。
- **领域服务层（P0.5 已落地）**：业务规则唯一归属 service（ItemService/WorkspaceService），DAO 纯数据访问；排序白名单 SortKeyRegistry 单源；Logger 日志服务；事件源注入（`EmitFn`）。
- **来源抽象与预览分级**：渲染层只认 uri；预览能力 L0-L3；三级插件体系（内建/官方扩展包/社区）。
- **标签筛选入口**（v0.1.3 已落地）：TagsPanel 标签点击 = 筛选该标签条目（此前无入口，是"打标后搜不到"的根源）；SearchBar 展示筛选状态。
- **详情页返回按钮删除**（v0.1.3 已落地）：右侧信息栏顶部返回按钮移除，退出详情走标签栏关闭。
- **主页单例**（v0.1.3 已落地）：`+` 激活已有主页；侧键后退不进入主页（App.vue 守卫拦截）。
- **活动标签高亮增强**（v0.1.3 已落地）：accent 色系 + 顶部指示条。

---

## 五、文档索引

| 文档 | 定位 |
|---|---|
| [PLUGIN-ARCH.md](PLUGIN-ARCH.md) | 插件系统架构演进 RFC（契约/分层/来源/路线图） |
| [API.md](API.md) | 领域服务 API 索引（导航，权威是 TS 类型） |
| [USAGE.md](USAGE.md) | 用户使用指南 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 项目整体架构与进展 |
| 本文档 | 决策记录（为什么这么做） |

---

*新增决策请追加到对应小节并注明日期；与实现冲突时以"更新本文档 + 实现 commit 说明"为准。*

# 决策与事件日志（Agent Notes）

这里记录一种文档：**决策笔记**——影响本项目的决定、它的 why、以及放弃了什么；是 DECISIONS
一行、git 提交信息都装不下的论证层。机制仿自 TuRead / Cross-Patch 的 Agent Notes。

## 与 DECISIONS 的分工（TagHit 口径）

- `docs/DECISIONS.md` = 裁决**现状基线**：一行一条，只记事实与结论，不承载论证。
- 笔记 = **论证层**：Problem / Alternatives / Consequences。有笔记的裁决在 DECISIONS 行尾附
  `笔记：[标题](相对路径)`；无笔记的行以 DECISIONS 本行为准。
- **存量 D1–D48 不回迁**——其论证由 git 历史与提交信息承载；模型向前生效。
- TODO 条目里的「动前先立裁决」= 动笔前先有一篇 proposed 笔记（或确认旧笔记已覆盖）。

## 路径即元数据

每篇笔记的位置编码它的全部元数据：`{生命周期}/{类别}/yyyy-mm-dd-主题.md`

- **生命周期**（顶层目录）即状态，笔记随状态在目录间移动：
  - `proposed/` — 提案，未决或未落地；
  - `implemented/` — 已落地。文件随现实保持更新（限事实层面：路径、名称、结构），决策本身不改写；
  - `rejected/` — 已否决，Status 行带一句否决理由。仅当其理由还能防止一次有诱惑的错误时保留，否则整篇删除；
  - `archived/`（启用后）— 有历史决策价值但不再指导未来的 implemented 笔记，冻结不修改、不作现状权威。
- **类别**（子目录）为闭集：
  - `process/` — 仓库治理、纪律、钩子守卫、流程偏差固化；
  - `arch/` — 架构、契约、数据模型的多方案裁决（结论仍回写 DECISIONS / ARCHITECTURE 权威行）；
  - `product/` — 方向条款、组件形态定夺、批次立项与放弃、发行形态。

  加类别 = 先改本文件与同目录 AGENTS.md，再开目录。

文件名日期 = 主题**首次提出**之日，其余时间线由 git 承载，正文不写日期。笔记间互链一律用
相对 markdown 链接（可机械检查、移动不断链）。不设 INDEX.md：路径就是元数据，集中索引只会
重复它并制造争用点。

**事件 = 状态迁移**：DECISIONS 的行、笔记的生命周期目录都是「现状」，迁移过程由提交史承载
——不另维护流水账。

## 文件格式

前三行固定，后跟空行：

```markdown
# 决策：<标题>

Status: proposed
```

`Status` 取值：`proposed` / `implemented` / `rejected — <一句理由>`。状态不带日期与括号注记；
「有保留地采纳」写进正文。

正文骨架：

- `proposed/`：`## Problem` → `## Proposal` → `## Alternatives considered` → `## Acceptance criteria` → `## Risks`
- `implemented/`：`## Problem` → `## Decision`（现在时，写已发生的现实）→ `## Alternatives considered` → `## Consequences`（代价与所得）
- `rejected/`：提案原样冻结，裁决只写在 Status 行

**Alternatives considered 强制**：记录决策而不记录它战胜了什么，等于邀请重新翻案。
每条备选一段，写清它输在哪里。

## 何时写一篇

- 守卫/钩子增删、纪律与闭集变更、流程偏差固化（process）；
- 架构/契约/数据模型的多方案裁决，且被放弃的方案值得记录（arch）；
- 方向条款裁定、组件形态定夺、批次立项与放弃（product）。

更新既有笔记所拥有的决定 = 满足规则，不另开新篇；**笔记永不改写成另一个决定**——
另起一篇，新旧互链。写前先查旧笔记（supersession，见同目录 AGENTS.md）。

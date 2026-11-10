# ops/ —— 仓库治理（agent 子树入口）

> 本目录只放**仓库治理**脚本：守卫与声明，防的是仓库因 agent 而变形——路径泄漏、密钥入库、
> 文档膨胀、文档与事实脱钩。业务与校准脚本在 [scripts/](scripts)（校准场景、dev 一键、自验），两者分治。
> 红线全表在根层入口文档 §二；文档地图与洗文口径见 §四 与 docGuard 头注。

## 脚本（Guard 族挡提交报错自带修法；对账类只体检不挡）

| 脚本 | 拦什么 |
|---|---|
| [`docIndex`](scripts/docIndex.mjs) | md 链接向上（祖先）或出仓 = 拦；「提及未成链接」（提及既引用违规）= 观测期 notice、转换批清零后 hook 拦截；已知根段开头而解析失败的提及 = check 模式 notice；被引用事实变了而引用它的文档没动 = 提醒不拦 |
| [`repoGuard`](scripts/repoGuard.mjs) | 绝对路径（三形态，只扫文档/配置扩展）与 API key（八类，扫全部文本源）= 拦；密钥命中不回显；`<占位符>` 豁免 |
| [`docGuard`](scripts/docGuard.mjs) | Markdown 行数超上限 = 拦（入口类硬上限 80、其余 300；上限表见其头注，新增入口文档先登记）；单行可见文本超 200 字符 = 拦（链接目标与代码块不计，不设行级豁免——段落墙从行数门控漏掉，这里堵住）。代码事实块计 1 行（机器产物不占散文预算） |
| [`codefact`](scripts/codefact.mjs) | 代码事实生成器：契约形状事实（类型/签名/端点）从源码 AST 直抽进文档 `codefact` 块；`hook` = 块与代码不同步（陈旧）= 拦，`npm run gen:codefact` 重新生成；docIndex 探针掩块、docGuard 块计 1 行 |
| [`refdiff`](scripts/refdiff.mjs) | 不挡——引用对账钓竿：链接形态转换批后对基线跑链接计数差，钓「基线有而工作树缺失」；计数法有同数错挂盲区，完整性以入口面人工目检兜底（口径见脚本头注） |

## 门控链（pre-commit；clone 后一次性激活 `git config core.hooksPath .githooks`）

`set -e` 串联（[.githooks/pre-commit](../.githooks/pre-commit)）：docIndex hook → repoGuard → docGuard → codefact hook，任一失败即中止提交；push 前另有
`npm run ci` 全链（[.githooks/pre-push](../.githooks/pre-push)）。`--no-verify` 是人类的绕行特权，agent 不用——
门控为纪律而设，不是安全机制。体检：`docIndex check`、各 Guard `--report`，只打印不挡。
**文件级豁免单点登记 [`exemptions.json`](exemptions.json)**（path + guards + reason）——
各守卫按名取用；加豁免只改登记一处、理由随行可审计，守卫脚本内不散落硬编码（豁免堆积
即门控失效的前兆，每条都过目）。行级规则（注释剥离等）是探针机制内部规则，不在登记表。

## 路径红线（repoGuard 的口径依据）

- 所有路径一律仓库相对：命令示例从仓库根运行；指代仓库根写 `<仓库根>` 占位。
- 引用仓库外文件属越权动作：改写为指认来源的相对引用，或删除。
- 密钥检出 = 立即移出并轮换；`<占位符>` 是文档示例的合法形态。
- 路径形态本身是讨论对象时（如盘根边界 `<盘>:` vs `<盘>:/` 的裁决残留），写 `<盘>` 占位。

## 提及既引用（docIndex 的口径依据；引用治理操典法条）

- **有路径就算跟踪**：文档内任何路径形提及（md 链接、反引号、裸路径，含代码块内工具路径）
  都是对该文件/目录的跟踪边，无显式语法。被引用文件进了暂存区而引用它的文档没动 → commit
  时漂移提醒（不拦截）。解析顺序 = 文档目录 → 各级祖先 → 仓库根；单段路径（根层泛指）、
  glob/模板、gitignored 运行时路径不作边。
- **提及既引用**：凡解析到仓库实物的提及一律 md []() 链接形态（人可点、可机检；显示文本
  保持仓库相对路径，目标按文档所在目录相对解析）；反引号壳、裸路径、裸文档名是违规形态。
  豁免 = 围栏代码块、链接目标本身、模板/占位符、glob、gitignored 路径、解析不到实物的散文词
  （代码标识符、命令串不是引用）。门控两步：check 模式 notice 全量报出（观测期），转换批清零
  后 hook 翻拦截（docIndex 内 MENTIONS_BLOCKING）。
- **引用方向只管 md 链接**：**向上一概非法**——目标解析到引用文档祖先目录（含仓库根与根层
  单件 AGENTS/README/TODO）一律删除或改写为不含路径 token 的中文替称（如「唯一待办清单」
  「风格基线」）；竖直导航由入口链承担，下层不回指上层。跨子树（兄弟目录）链接合法。
- **失效引用探针**：已知根段开头（`src/` `frontend/` `docs/` `ops/` [scripts/](scripts) `plugins/`
  `.agents/` `.githooks/`）而解析失败的提及 → notice——文档与现实的脱钩从这里显形，发现即修。

# frontend/ —— 渲染层子树入口

> 渲染层 = Vue3 + Pinia + router + Tailwind，经 typed 窄桥取数。架构与渲染层词汇权威 = `docs/ARCHITECTURE.md` §二/§三，
> 风格基线 = `docs/STYLE.md`（动任何样式之前必读）；全局红线与跨域命令在根 `AGENTS.md`，不在此复读。

## 目录地图

- `frontend/src/renderer/src/` —— 渲染层源码：`features/`（功能组件 · 全局播放引擎 · 插件装载器）、
  `components/`（通用件）、`views/`（路由页）、`stores/`、`lib/`（纯函数）、`styles/`（globals.css）、
  `styleguide/`（样式基线样张页）、`__tests__/`（Vitest）、`i18n/`（语言包与英译术语表）。
- `frontend/src/shared/` —— 契约 type-only 桥 + `frontend/src/shared/api.ts` 门面（过桥入参统一转纯）。
- `frontend/scripts/` —— 文案与样式机检探针（check-style、check-i18n 及残留基线）。
- 落点纪律：标准功能组件归 `features/`；`frontend/src/renderer/src/components/workspace/` 是历史并存落点，
  组件翻新时迁入 features（TODO 登记）。

## 验证链（渲染层改动过哪些门）

```bash
npm --prefix frontend run typecheck:web      # vue-tsc；它漏报模板标签不闭合，模板防线是下一条
npm --prefix frontend run check:templates    # 模板语法防线
npm --prefix frontend run test               # Vitest 断言（不需要 DOM）
npm --prefix frontend run check:style        # 样式禁区机检（docs/STYLE.md §6）
npm --prefix frontend run check:build        # CSS 编译门——机检与 vue-tsc 都不过 PostCSS/Tailwind 编译，@apply 非法类只有它抓；动过 globals.css 必跑
npm --prefix frontend run check:i18n:strict  # 文案机检门控（键对账 + 残留基线）
```

## 增量红线

- 样式走标准样式表（组件类 + token），禁区机检零命中才绿；版式词汇（底板/卡片/全直角/版心）以 `docs/STYLE.md` 与 `docs/ARCHITECTURE.md` §二为准。
- 过桥入参必须是纯数据（store/reactive 的 Proxy 结构化克隆会抛错）——经 `frontend/src/shared/api.ts` 门面，调用点不得绕过。
- i18n：UI 文案入语言包（zh+en 键同构，残留基线只收不涨）；英译认 `frontend/src/renderer/src/i18n/TERMS.md`；功能组件 title/命令 title/设置 label = 注册时取 i18n 快照，切语言重启刷新。
- 插件契约面的渲染层实现（contribution/hostApi/装载器）变动须过 `plugins/AGENTS.md` 的契约纪律。

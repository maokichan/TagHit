# scripts/ —— 校准与开发工具子树入口

> 业务与校准脚本。仓库治理守卫在 `ops/scripts/`（分治：守卫防仓库变形，这里服务开发与验证）。
> 校准文化 = [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §一：无测试设施，code-first 校准理解——memory 与 sqlite 跑同一场景，契约一致才绿。

## 形状

- 校准场景成对：场景 `scripts/s32-scenario.ts` + 入口 `scripts/s32-calibrate.ts`（sqlite 入口
  `scripts/s32-calibrate-sqlite.ts`），s32–s38 共八份（契约/扫描/边界/浏览窗口/来源根/顺序窗口/文件操作）；
  `npm run calibrate` 一键双跑，分项入口见根 `package.json` scripts（唯一清单，不在此枚举）。
- 宿主纯模块直验（不进 CI 链）：`scripts/plugins-selfcheck.ts`（插件安装位全链）·
  `scripts/diagnostics-selfcheck.ts`（诊断快照）。
- 开发一键：`scripts/dev.mjs`（bundle:host → vite dev → Electron）· `scripts/pack.mjs`（便携 zip 装配）·
  `scripts/doctor.ts`（环境体检，`npm run ci` 收尾步）。
- 其余：`scripts/pack-plugin.mjs`（插件 zip 打包参考实现，用法见 [`plugins/AGENTS.md`](../plugins/AGENTS.md)）·
  `scripts/make-audio-fixtures.mjs`（音频夹具，产物落 gitignored 运行时区）。

## 纪律

- 新校准场景 = 场景与入口成对新增，并登记根 `package.json` scripts；动契约/适配器必跑受影响校准（根 AGENTS §二.6）。
- memory 侧断言不得比 sqlite 宽松——测试替身更宽松会掩盖真语义（并发写事务语义即属此险，见 [TODO.md](../TODO.md)「扫描的写事务」条）。

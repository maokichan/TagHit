# TagHit

面向素材与收藏的内容标记与检索管理器。

## 这是什么程序

TagHit 管理散落在本地目录里的内容（图片、视频、音频、文档等），用统一标签体系替代"文件夹层级"来组织它们：

- 把内容收进**条目**，一个条目是一个内容单元（一个文件，或一个无文件的作品标签锚点）
- 用**标签**描述条目；标签之间可以有**有向关联**（组织成层级等语义），打标时可按语义自动带出相关标签
- 多个条目可组织成一个**作品**（如一张专辑的多支曲目、一个项目的多份文件），作品自身可打标签
- **工作区**是内容视图：每个工作区索引一组目录，并可声明自己可见的标签子集——同一库，不同视角
- 按标签、工作区与检索条件发现内容

目标用户与场景：媒体工作者管理大量素材（跨项目检索），收藏者（电影、美术等）整理带个人语境的内容。核心价值是**跨目录、跨来源的标签化检索**，而不是文件管理器的目录浏览。

## 架构与意图

采用**领域先行 + 六边形分层**：

```
渲染层 / 用户输入
   │  调用
应用层（用例：流程编排）        ← 对外 API 所在
   │  调领域规则与端口
领域层（实体 + 纯规则，无存储、无 IO）
   │  依赖接口
端口 ──── 适配器（SQLite / 文件系统 / 宿主）
```

选择这套架构的原因：

1. **业务规则要有单一、可验证的归属**。领域层只装"业务上什么成立"的类型与规则，不接触 UI、存储或宿主 API；规则不散落在数据库代码、界面代码里。
2. **宿主技术是可替换的**。桌面框架、数据库、文件访问方式都可能演进（例如协作形态下的存储变化）；把它们挡在适配器后，业务核心不受影响。
3. **单核心、多入口**。官方界面、命令行、未来的插件扩展共用同一套领域与应用逻辑，避免每入口一套规则。

当前进度：领域层、端口接口、内存与 SQLite 两个 Store 适配器、应用层首批六用例已完成，校准脚本双跑（memory / sqlite，42 断言）全过；下一步是两阶段扫描与前端复用改造；渲染层沿用旧版界面并改造。

## 目录结构

```
src/domain/       领域层（纯 TS）：types（实体/关系行）· rules（不变量判定）· errors
src/ports/        端口（接口，纯声明）：store（单体 + 事务 + 条件对象）· filesystem · system（Clock/IdGen）
src/adapters/     适配器（实现）：memory（MemoryStore，开发/测试）· sqlite（SqliteStore，node:sqlite 内置驱动）
src/application/  应用层用例：tagging（打标/卸标）· browse（浏览+声明投影）· search（检索）· collection / group（维护）· cascade（删除级联）
scripts/          校准：s32-scenario.ts（共享场景）· s32-calibrate.ts / s32-calibrate-sqlite.ts（入口）
docs/             GLOSSARY（业务词汇）· DECISIONS（分层与裁决）· CONTEXT（开发交接）
```

历史版本存档于 `../freeze/`（Tauri 原型、Electron 0.1.x，含前端参考）。

## 文档

- `docs/GLOSSARY.md` — 业务词汇（条目/标签/工作区/作品/组等）
- `docs/DECISIONS.md` — 分层、裁决、规划范围
- `docs/CONTEXT.md` — 开发交接（进行到哪、下一步、纪律）

## 开发

```bash
npm run typecheck:domain      # 领域层
npm run typecheck:ports       # + 端口接口
npm run typecheck:adapters    # + 适配器
npm run typecheck:application # + 应用层与脚本
npm run calibrate             # 校准：memory（需 node ≥ v24）
npm run calibrate:sqlite      # 校准：sqlite :memory:（同一场景，契约一致性）
```

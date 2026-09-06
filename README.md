# TagHit

面向素材与收藏的内容标记与检索管理器。

## 这是什么程序

TagHit 管理散落在本地目录里的内容（图片、视频、音频、文档等），用统一标签体系替代"文件夹层级"来组织它们：

- 把内容收进**条目**，一个条目是一个内容单元（一个文件，或一个无文件的作品标签锚点）
- 用**标签**描述条目；标签之间可以有**有向关联**（组织成层级等语义），打标时可按语义自动带出相关标签
- 多个条目可组织成一个**作品**（如一张专辑的多支曲目、一个项目的多份文件），作品自身可打标签
- **工作区**是内容视图：每个工作区索引一组目录（来源根），并可声明自己可见的标签子集——同一库，不同视角
- 按标签、工作区与检索条件发现内容；工作区经扫描建立目录视图（可排除子目录，仅作用于直接条目）

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

当前进度：领域层、端口、内存/SQLite 双适配器、应用层用例与两阶段扫描完成（三份校准全绿）；宿主契约 v0（typed IPC 32 端点 + 统一错误信封）落地；旧版界面已全量改造到 `window.taghit` 窄桥（缺口能力降级置灰）。下一步：贡献点 v0 类型化、真机 Electron 接线与字节闸门（媒体预览/缩略图）。

## 目录结构

```
src/domain/       领域层（纯 TS）：types（实体/关系行/工作区-来源路径）· rules · errors
src/ports/        端口（接口，纯声明）：store · filesystem（含 hash 三采样签名）· system（Clock/IdGen）
src/adapters/     适配器（实现）：memory（MemoryStore · MemoryFileSystem 假 FS）· sqlite（SqliteStore，node:sqlite 内置驱动）
                  node（NodeFileSystem 真实 fs）· sample-hash.ts（共享签名）
src/application/  应用层用例：tagging · browse（成员派生+声明投影）· search · collection/group · cascade · scan（两阶段扫描）
src/host/         Electron 宿主：main（装配+IPC 注册）· preload（window.taghit）· ipc（typed 窄桥契约）——electron 依赖需真实机安装
frontend/         渲染层：Vue3+Pinia+router+Tailwind（已接窄桥；shared/contract=契约桥 · shared/api=门面+D9 文案 · lib/viewModel=视图适配）
scripts/          校准：s32（六用例）memory/sqlite · s33（扫描）memory/sqlite
docs/             GLOSSARY（词汇）· DECISIONS（裁决）· CONTEXT（交接）· ARCHITECTURE（架构/状态/渲染-核心分离）
```

历史版本存档于 `../freeze/`（Tauri 原型、Electron 0.1.x，含前端参考）。

## 文档

- `docs/GLOSSARY.md` — 业务词汇（条目/标签/工作区/作品/组等）
- `docs/DECISIONS.md` — 分层、裁决、规划范围
- `docs/ARCHITECTURE.md` — 架构与宿主（当前状态；渲染层/宿主与后端核心分节；插件方向）
- `docs/CONTEXT.md` — 开发交接（快速读法、下一步、纪律）

## 开发

```bash
npm run typecheck:domain      # 领域层
npm run typecheck:ports       # + 端口接口
npm run typecheck:adapters    # + 适配器
npm run typecheck:application # + 应用层与脚本
npm run typecheck:host        # + Electron 宿主骨架
npm run calibrate             # 校准：s32 memory（需 node ≥ v24）
npm run calibrate:sqlite      # 校准：s32 sqlite :memory:（契约一致性）
npm run calibrate:scan        # 校准：扫描场景 memory + sqlite
```

桌面宿主（Electron）在真实机接线：`npm i -D electron`（版本内嵌 Node 需 ≥ 23.4，见 DECISIONS D13），随后以 TAGHIT_RENDERER_URL 指向渲染 dev server 启动主进程。

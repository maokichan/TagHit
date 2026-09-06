# TagHit 决策基线（DECISIONS）

分层、裁决与范围。概念见 GLOSSARY。

## 分层

```
渲染层/宿主（Electron：渲染 UI，主进程装配）   ← src/host + frontend/
   │
应用层（用例编排，调领域规则与端口）          ← src/application（已落地）
   │
领域层（类型 + 纯规则，无存储、无 IO）        ← src/domain
   │
端口（接口）──── 适配器（实现）              ← src/ports · src/adapters
```

依赖只向内。行为在应用层；存储/IO 实现位于领域层之外。

## 裁决

- 条目 item：全局唯一，不属任何工作区；跨工作区去重是扫描行为
- 挂载：条目 × 标签（条目级）；取回条目返回全部标签
- 声明：工作区 × 标签，读取端投影事实；投影行为在应用层
- 标签关联：有向 tag→tag，领域不解义；语义由使用方组织
- 作品：独立实体 + 有序成员 + 空条目标签锚点；组：扁平容器、标签可多属
- 成员：作品→条目（有序，position）；组→标签（无序）；行记录属领域类型
- 工作区 ↔ 条目：来源根（配置行，workspace 拥有根、不拥有条目）→ 路径节点（扫描产物，workspace × 目录路径，根=来源根；included/excluded 只作用该节点直接条目，不级联；扫描不覆盖既有 excluded）→ 归属（不落库，sourceUri 父目录 == 节点 dirPath 派生）
- 重叠挂载：条目全局共享；节点按工作区各建一份
- 扫描消失策略：keep（标 missing，默认）/ discard（删条目及关联），按扫描调用配置
- 内容签名：sha256 于头/中/尾三采样点；同内容必同签名
- 元数据：核心事实 + EAV 长尾；渲染层只认 uri，字节经主进程闸门；全局搜索对全部工作区

## 端口与适配器（已落地；契约见 src/ports/store.ts 头部）

- 端口是应用层对宿主的需求清单。第一公民 = **流动数据的类型**（领域行记录 + 端口写输入/条件对象/结果）；动词薄、按用例反推、不做业务判定。
- Store：单体 + 事务（transaction = 边界原子性，不支持嵌套；一致性边界在用例）。全局约定：异步；实体写严格（NOT_FOUND/CONFLICT/INVALID）；关系写幂等；读宽松。
- 查询下沉到存储：ItemsQuery/TagsQuery 可扩展条件对象（不预造方法、不做通用查询引擎）。
- 适配器一致性：memory 与 sqlite 跑同一份场景（scripts/s32、s33）。SQLite 外键会暴露排序/删除次序依赖（例：删作品先删 collection 行再删锚）。

## 假设（仍开放的默认值）

| # | 假设 | 默认值 |
|---|---|---|
| D4 | 领域层 | 同步纯函数；异步只在边界 |
| D6 | 事件 | 只保留有真实订阅者的事件 |
| D9 | 错误控制 | 异常传播（Promise reject 携带 DomainError.code）；转译在渲染/宿主边界（信封已就绪，UI 文案待做） |
| D10 | SQLite 驱动 | node:sqlite（Node 内置）；**仅限 Node ≥ 23.4 环境** |
| D11 | 消失策略 | 缺省 keep；discard 可选 |
| D12 | 内容签名 | 头/中/尾三采样（64 KiB/段），适配器共用 sampleHash |
| D13 | 宿主 | Electron；typed IPC 窄桥暴露用例；核心零依赖。**Electron 33 内嵌 Node 20.18 → 宿主 Store 需换 better-sqlite3 实现（或升级 Electron）** |

## parked

C-S · 作品嵌套/多归属 · 子树整体排除（应用层逻辑）· 后台增量扫描

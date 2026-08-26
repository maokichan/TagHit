# TagHit 领域服务 API 索引

> 记录时间：2026-08-23（随项目日期）
> 关联设计：[PLUGIN-ARCH.md](PLUGIN-ARCH.md)（§五 领域服务层、§7.5 插件领域 API）
> **权威声明**：本文档是**导航索引**（人可读），**权威是 TS 类型**——方法签名以 `src/shared/api.ts`（渲染层 `window.api`）、各 service 类的 public 方法、`src/shared/types/*.ts` 为准。实现偏离本文档时以类型为准并更新本文档。

---

## 一、调用路径

```
渲染层 (Vue store/组件)
  → window.api.<domain>.<method>()          ← 类型：src/shared/api.ts
  → IPC 通道（preload invoke）              ← 通道名：src/shared/ipc.ts（IPC 常量表）
  → 主进程 IPC handler（薄传输层，无业务逻辑）
  → 领域服务（规则唯一归属）                 ← 本文档索引的对象
  → DAO（纯数据访问）→ SQLite
```

未来插件路径殊途同归：插件 `ctx.app.<domain>.<method>()` → **同一批 service 实例**（P1 起），规则一致、事件同源，无特权旁路。

---

## 二、通用约定

- **写操作**：渲染层直接可调；插件调用需 manifest 声明 `app.write: true`（默认只读）。
- **错误**：service 抛出 `Error`（中文消息），IPC 层透传给渲染层；插件桥同样收到。
- **事件**：写操作成功 / 后台流程发生，service 触发领域事件（见 §七），渲染层与插件共同消费。
- **同步/异步**：service 方法多为同步（better-sqlite3 同步 API）；IPC/插件桥一律返回 Promise。

---

## 三、TagService（标签域）

文件：`src/main/core/tag/tag.service.ts` ｜ 渲染层入口：`window.api.tag.*` ｜ 插件入口：`ctx.app.tags.*`

| 方法 | 签名 → 返回 | 功能 | 规则/校验 | 触发事件 |
|---|---|---|---|---|
| `list` | `(): Tag[]` | 全部全局标签 | 附带 `description`（config 合并）、`workspaceIds`（声明过的工作区） | — |
| `listForWorkspace` | `(workspaceId: number): Tag[]` | 某工作区**已声明**的标签 | 过滤未声明 | — |
| `listWithRelations` | `(): TagNode[]` | 全部标签 + 父子层级 + 声明关系 | 组装 DAG（parents/children） | — |
| `create` | `(req: CreateTagRequest): Tag` | 创建全局标签 | **名字非空、全局唯一**；带 `workspaceId` 则自动声明到该工作区 | `tag:created` |
| `update` | `(id, patch: { name?, description? }): Tag` | 改名 / 改描述 | 改名查重（排除自身）；描述存 config | — |
| `remove` | `(id): void` | 删除标签 | 存在性校验；FK 级联删层级/声明/条目关联 | `tag:deleted` |
| `declare` | `(req: DeclareTagRequest): void` | 声明到某工作区 | 标签/工作区必须存在；只改可见性，不动已有挂载 | `tag:declared` |
| `undeclare` | `(req: DeclareTagRequest): void` | 取消声明 | 不删已有 `item_tag`，重新声明即恢复 | `tag:undeclared` |
| `addHierarchy` | `(req: AddHierarchyRequest): void` | 建立父子层级 | **BFS 防环**；parent≠child；两者必须存在 | — |
| `removeHierarchy` | `(parentId, childId): void` | 移除层级边 | — | — |

类型：`src/shared/types/tag.ts`（`Tag` / `TagNode` / `CreateTagRequest` / `DeclareTagRequest` / `AddHierarchyRequest`）

---

## 四、ItemService（条目域）

文件：`src/main/core/item/item.service.ts`（新建）｜ 渲染层入口：`window.api.item.*` ｜ 插件入口：`ctx.app.items.*`

| 方法 | 签名 → 返回 | 功能 | 规则/校验 | 触发事件 |
|---|---|---|---|---|
| `list` | `(filter: ItemFilter): { items: ItemWithTags[]; total: number }` | 工作区列表 + 过滤 + 分页 | **排序键白名单解析**（SortKeyRegistry，§八）；媒体类型 → 扩展名换算（config.fileFormatMap）；**原图策略**（非缩略图路径 → null）；标签倒排交集（多个 tagIds） | — |
| `get` | `(id, workspaceId): ItemWithTags \| null` | 详情：条目 + 标签 + 元数据 EAV | 附带 `mediaType`、`metadata` | — |
| `getMetadata` | `(itemId): ItemMetadata[]` | 条目元数据（EAV 展开） | — | — |
| `updateTags` | `(workspaceId, itemId, add: number[], remove: number[]): void` | 打标/去标 | **声明校验**：add 的每个 tagId 必须已声明到该工作区，否则拒绝 | `item:tagsChanged` |

类型：`src/shared/types/item.ts`（`Item` / `ItemWithTags` / `ItemFilter` / `ItemMetadata` / `UpdateTagsRequest`）

---

## 五、WorkspaceService（工作区域）

文件：`src/main/core/workspace/workspace.service.ts`（新建）｜ 渲染层入口：`window.api.workspace.*` ｜ 插件入口：`ctx.app.workspaces.*`

| 方法 | 签名 → 返回 | 功能 | 规则/校验 | 触发事件 |
|---|---|---|---|---|
| `list` | `(): WorkspaceWithPaths[]` | 全部工作区 + 路径 + 封面 | **封面策略**：coverPath 优先 → 自动取工作区内第一张图（缩略图→原图） | — |
| `create` | `(title: string): WorkspaceWithPaths` | 创建工作区 | 标题非空 | `workspace:created` |
| `update` | `(id, title): WorkspaceWithPaths` | 重命名 | — | — |
| `remove` | `(id): void` | 删除工作区 | FK 级联条目关联/声明 | `workspace:deleted` |
| `addPath` | `(req: AddPathRequest): WorkspaceWithPaths` | 添加扫描路径 | `INSERT OR IGNORE` 去重；添加后**自动触发扫描** | `workspace:pathAdded` |
| `removePath` | `(pathId, workspaceId): WorkspaceWithPaths` | 移除扫描路径 | **脱离语义**：该路径下条目从工作区脱离（保留全局条目/标签/元数据，可重加恢复） | `workspace:pathRemoved` |
| `scan` | `(req: ScanRequest): ScanResult` | 扫描（异步分块，进度走事件） | 无路径则报错；增量模式按大小+mtime 跳过 | `scan:progress` / `scan:completed` |
| `finalizeScan` | `(workspaceId, seenUris, currentPaths): { markedMissing; detached }` | 扫描收尾缺失判定 | **缺失语义**：不在任何配置路径 → 脱离；目录在文件没 → 标 missing；目录也没 → 脱离（目录存在性 existsSync 在 service 层批量缓存） | — |
| `setCover` | `(id, coverPath \| null): WorkspaceWithPaths` | 设置封面（null = 自动） | 白名单外图片自动复制进 `{userData}/covers` | — |

类型：`src/shared/types/workspace.ts`（`Workspace` / `WorkspaceWithPaths` / `WorkspacePath` / `AddPathRequest` / `ScanRequest` / `ScanProgress` / `ScanResult`）

---

## 六、SearchService（搜索域）

文件：`src/main/core/search/search.service.ts` ｜ 渲染层入口：`window.api.search.*` ｜ 插件入口：`ctx.app.search.*`

| 方法 | 签名 → 返回 | 功能 | 规则/校验 | 触发事件 |
|---|---|---|---|---|
| `query` | `(req: SearchRequest): SearchResult` | 工作区内搜索（DSL） | 标签**倒排交集**且**仅限已声明标签**（未声明 → 空结果）；无工作区 → 空结果；`type:` 取第一个媒体类别 | — |
| `global` | `(req: SearchRequest): SearchResult` | 全局搜索（跨工作区） | 标签命中 = 条目在任一工作区拥有该标签；结果附带 `workspaceIds` | — |

DSL：`@标签 @标签2 type:image >2024-01-01 <2024-12-31 workspace:1 关键词`（支持引号词组）。

类型：`src/shared/types/search.ts`（`SearchRequest` / `SearchResult`）

---

## 七、ConfigService（配置域）

文件：`src/main/core/config.ts` ｜ 渲染层入口：`window.api.config.*` ｜ 插件入口：`ctx.app.config.*`

| 方法 | 签名 → 返回 | 功能 | 规则/校验 | 触发事件 |
|---|---|---|---|---|
| `get` | `(): AppConfig` | 当前配置（合并默认值） | — | — |
| `update` | `(patch: Partial<AppConfig>): AppConfig` | 更新配置（原子写 JSON） | 合并写 `{userData}/config.json` | `config:changed` |

类型：`src/shared/types/config.ts`（`AppConfig`：theme/layoutMode/ffmpegPath/thumbnailMaxWidth/thumbnailQuality/scanExcludePatterns/fileFormatMap/tagDescriptions/showTitles/showWorkspaceCovers/uiScale/enableSearchShortcut）

---

## 八、排序键注册表（SortKeyRegistry）

P0.5 起由 `ItemService` 持有，**单一事实来源**（现状：前端 `DisplayPanel.vue` 与后端 `item.dao.ts` 各一份白名单，改一处漏一处）。

| 键 | SQL 列 | 前端标签 | 机制 |
|---|---|---|---|
| `updatedAt` | `i.updated_at` | 最近更新（默认，降序） | A 真实列 |
| `name` | `i.title` | 名称 | A 真实列 |
| `size` | `i.size` | 大小 | A 真实列 |
| `modifiedAt` | `i.file_modified_at` | 修改时间 | A 真实列 |
| `addedAt` | `i.created_at` | 添加时间 | A 真实列 |
| `type` | `i.extension` | 类型 | A 真实列 |

- 所有排序附加 `i.updated_at DESC` 稳定次级排序。
- 渲染层排序下拉**驱动式渲染**（从主进程查询可用键，不再硬编码）。
- v2：`SortProvider` 接口支持插件注册自定义排序（B/C 类机制，见 RFC §5.7）。

---

## 九、领域事件表

由 service 触发（P0.5 起 service 注入 `emit` 回调；P1 插件订阅同一事件源）。

| 事件 | 载荷 | 触发点 |
|---|---|---|
| `scan:progress` | `ScanProgress` | WorkspaceService.scan 分块上报 |
| `scan:completed` | `ScanResult` | 扫描收尾 |
| `item:created` | `Item` | ItemService 入库 / 扫描 |
| `item:tagsChanged` | `{ itemId, workspaceId }` | ItemService.updateTags 成功后 |
| `tag:created` / `tag:deleted` | `Tag` / `{ id }` | TagService |
| `tag:declared` / `tag:undeclared` | `DeclareTagRequest` | TagService |
| `workspace:created` / `workspace:deleted` | `Workspace` / `{ id }` | WorkspaceService |
| `workspace:pathAdded` / `pathRemoved` | `{ workspaceId, path }` | WorkspaceService |
| `config:changed` | `AppConfig` | ConfigService.update |

---

## 十、插件 AppApi（ctx.app.*，P1 起）

形状与上表**完全同形**（`ctx.app.items / tags / search / workspaces / config` + `storage / events`），写操作需 `app.write: true`。完整形状见 [PLUGIN-ARCH.md §7.5](PLUGIN-ARCH.md)。P1 接线后插件与渲染层共享同一批 service 实例。

---

## 十一、维护约定

1. **新增方法**：改 TS 类型（权威）→ 更新本文档对应表格 →（P1 起）更新插件 AppApi。
2. **破坏性变更**：必须先更新 [PLUGIN-ARCH.md](PLUGIN-ARCH.md)（契约冻结流程，§十），再改类型与实现。
3. 本文档表格列：`方法 / 签名 / 功能 / 规则校验 / 触发事件`——签名以类型为准，规则以 service 实现为准，事件以 emit 调用点为准。

---

*本文档为导航索引；与类型冲突时以类型为准，发现偏差请更新本文档。*

/**
 * 宿主路径闸门（白名单的**唯一实现**）——两个消费方：
 * 1. `taghit-file://` 字节协议（D15）：媒体字节不进 IPC，直接由协议按白名单直出；
 * 2. **拖出应用**（D35）：把真实文件路径交付给系统拖放（`webContents.startDrag`）——
 *    渲染层只能"要求宿主拖出某条目"，路径由宿主按同一份白名单裁决。
 *
 * 为什么抽出来：闸门规则若各写一份，两处必然漂移（本项目"单一事实源"纪律的老账：
 * 汇总口径、标签名比较键、死代码复制都踩过）。拖出与字节读取的安全等级相同，
 * 必须是**同一条规则**，故此处收口。
 *
 * 规则与领域 `isUnderDir`/`isUnderRoot`（路径段匹配，防同前缀兄弟目录越权）同解；
 * 本文件只做**边界侧等价译文**：`normalizePath` 归一（反斜杠→正斜杠、去尾分隔符、解析 `.`/`..`）
 * ＋ Windows 大小写折叠（盘符与目录名不区分大小写）。与"SQL 译文由校准比对"同款纪律。
 */

import { app } from 'electron'
import { isUnderRoot, normalizePath } from '../domain/paths.ts'
import type { AppServices } from '../application/index.ts'

/**
 * 白名单 = 全部工作区的来源根 + userData（缩略图落点）。
 *
 * 缓存与失效：字节协议逐个请求过闸（网格 N 张图 = N 次），而白名单只随工作区/来源根变化，
 * 故缓存并在挂载/卸载来源根、建/删工作区时显式失效（宿主在对应 IPC handler 里调本函数）。
 * 失效疏漏宁可偏向"拒绝合法路径"（可重试），不偏向"放行"（安全问题）。
 */
let allowedRootsCache: string[] | null = null

/** 工作区集合或来源根集合变化后调用。 */
export function invalidateAllowedRoots(): void {
  allowedRootsCache = null
}

async function allowedRoots(services: AppServices): Promise<string[]> {
  if (allowedRootsCache != null) return allowedRootsCache
  const roots = new Set<string>()
  for (const ws of await services.store.listWorkspaces()) {
    for (const root of await services.store.listWorkspaceRoots(ws.id)) {
      roots.add(normalizePath(root.path))
    }
  }
  roots.add(normalizePath(app.getPath('userData')))
  allowedRootsCache = [...roots]
  return allowedRootsCache
}

/** 该绝对路径是否在白名单内（大小写不敏感；相对段已在归一化时解析，不可穿透）。 */
export async function isPathAllowed(services: AppServices, path: string): Promise<boolean> {
  const candidate = normalizePath(path).toLowerCase()
  const roots = (await allowedRoots(services)).map((r) => r.toLowerCase())
  return isUnderRoot(roots, candidate)
}

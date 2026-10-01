/**
 * 拖出应用：把**真实文件路径**交付给系统拖放（宿主能力）。
 *
 * 为什么必须在宿主：网页无法把真实文件放进操作系统的拖放负载，只能由主进程调
 * `webContents.startDrag`（Electron 官方教程的路径）。渲染层负责"我要拖出这些条目"这个**意图**，
 * 宿主负责"哪些路径允许出去、拖动长什么样"。
 *
 * 三条纪律：
 * 1. **单向通道**：`startDrag` 必须在 `dragstart` 手势内发起，等一次 invoke 往返就出手势了
 *    ——故走 `ipcMain.on`（契约里的 IpcSendContracts），不走请求/响应信封。
 * 2. **白名单与字节闸门同源**（pathGate.ts）：渲染层交来的是**条目 id**不是路径，
 *    路径由宿主自己从库里查、自己过闸；越界一律不出去（并留日志）。
 * 3. **交付的是当前事实**：条目没有来源（作品锚点）、文件已不在磁盘（缺失/被移走）的一律剔除；
 *    用户可感知的"跳过了什么"由渲染层预检并提示（本通道无回程，故不在这里静默吞掉语义）。
 */

import { nativeImage, type NativeImage, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { queryItems } from '../application/index.ts'
import { isPathAllowed } from './pathGate.ts'
import type { AppServices } from '../application/index.ts'
import type { Id } from '../domain/index.ts'

/**
 * 拖放预览图兜底：32×32 琥珀色方块（内嵌 PNG，111 字节）。
 * 为什么内嵌：`startDrag` 的 `icon` 在类型上是必填、在 macOS 上必须非空；
 * 而"仓库里放一个二进制资源"会被构建与打包牵着走（本项目没有资源目录）。
 */
const FALLBACK_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANklEQVR42u3OMREAIBADwchEIMLeCTR4CMUWN3PlZvY6zfImpQAAAAAAAAAAAAAAAAAA/gHUusVn6+5y3GCTAAAAAElFTkSuQmCC'

function fallbackIcon(): NativeImage {
  return nativeImage.createFromBuffer(Buffer.from(FALLBACK_ICON_PNG, 'base64'))
}

/** 拖动预览：优先用条目自己的缩略图（拖图时手里"拿着"那张图），否则兜底方块。 */
function dragIcon(thumbPaths: string[]): NativeImage {
  for (const p of thumbPaths) {
    if (p === '' || !existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return fallbackIcon()
}

/**
 * 发起一次原生文件拖动。返回实际交付的路径数（0 = 没有可交付的文件，仅留日志）。
 * 调用方（main.ts）只做端点转发，判断全在这里。
 */
export async function startFileDrag(
  services: AppServices,
  webContents: WebContents,
  itemIds: Id[]
): Promise<number> {
  if (itemIds.length === 0) return 0
  const hits = await queryItems(services, { ids: [...itemIds] })

  const deliverable: string[] = []
  const thumbPaths: string[] = []
  // 拖出顺序按调用方给的 id 序（queryItems 的返回序不保证；多文件拖动时顺序可见）
  const byId = new Map(hits.map((h) => [h.item.id, h]))
  for (const id of itemIds) {
    const item = byId.get(id)?.item
    // 作品锚点没有来源（无文件可交付）——渲染层也会预检，这里再挡一次：宿主不信任调用方
    if (item == null || item.kind !== 'file') continue
    if (!(await isPathAllowed(services, item.sourceUri))) {
      console.warn(`[drag] 拒绝交付白名单之外的路径：${item.sourceUri}`)
      continue
    }
    if (!existsSync(item.sourceUri)) continue
    deliverable.push(item.sourceUri)
    if (item.previewUri != null && item.previewUri !== '') thumbPaths.push(item.previewUri)
  }

  if (deliverable.length === 0) {
    console.warn('[drag] 没有可交付的文件（无来源、已缺失或不在白名单内）')
    return 0
  }

  // files 覆盖 file，但类型上 file 必填——故两者都给第一条
  webContents.startDrag({
    file: deliverable[0]!,
    files: deliverable,
    icon: dragIcon(thumbPaths)
  })
  return deliverable.length
}

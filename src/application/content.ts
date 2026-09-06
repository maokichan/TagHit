/**
 * 内容读取用例（字节闸门 · 文本侧）。
 *
 * 媒体字节不经 IPC：渲染层用 taghit-file:// 协议直取（宿主 protocol.ts，按条目
 * sourceUri 白名单放行）；文本预览走窄桥：应用层判定「可否读、读多少」，宿主注入
 * 真实 FileSystem。字节上限是闸门本体——主进程永不全量读入未知大小文件。
 */

import { DomainError } from '../domain/index.ts'
import type { FileSystem } from '../ports/filesystem.ts'
import type { AppServices } from './services.ts'

/** 文本可读扩展名（对齐旧版 TEXT_EXTS；静态文本预览白名单） */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx',
  'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'mjs', 'cjs',
])

/** 字节上限：超过则只返回前段并标记 truncated（旧版整篇拒读；0.2 改限额交付，语义见 D15） */
export const TEXT_MAX_BYTES = 2 * 1024 * 1024

export interface ItemText {
  text: string
  /** 文件超过上限，text 只含前段 */
  truncated: boolean
}

function extOf(title: string): string {
  const dot = title.lastIndexOf('.')
  return dot <= 0 || dot === title.length - 1 ? '' : title.slice(dot + 1).toLowerCase()
}

/** 读文本条目内容；非文件/不存在 → NOT_FOUND，扩展名不可读 → null（读宽松）。 */
export async function readItemText(
  services: AppServices,
  fs: FileSystem,
  itemId: string,
  maxBytes: number = TEXT_MAX_BYTES
): Promise<ItemText | null> {
  const item = await services.store.getItem(itemId)
  if (!item || item.kind !== 'file') throw new DomainError('NOT_FOUND', `文件条目不存在（${itemId}）`)
  if (!TEXT_EXTS.has(extOf(item.title))) return null

  const cap = Math.max(1, Math.min(Math.floor(maxBytes), TEXT_MAX_BYTES))
  const stat = await fs.stat(item.sourceUri)
  if (!stat.exists || stat.kind !== 'file') {
    throw new DomainError('NOT_FOUND', `文件已不在磁盘上（${item.sourceUri}）`)
  }
  const truncated = (stat.size ?? 0) > cap
  const bytes = await fs.readHead(item.sourceUri, truncated ? cap : (stat.size ?? cap))
  const text = new TextDecoder('utf-8').decode(bytes)
  return { text, truncated }
}

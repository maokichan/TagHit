import { promises as fs, type Dirent } from 'fs'
import { join } from 'path'
import type { AppDb } from '../../db/connection'
import type { AppConfig } from '@shared/types/config'
import type { ScanProgress, ScanResult } from '@shared/types/workspace'
import type { Item } from '@shared/types/item'
import { workspaceDao } from './workspace.dao'
import { itemDao } from '../item/item.dao'
import { extractMetadataForItem } from '../metadata/extractor'
import { hashFileFirst64Kb } from '../hash'
import { logger } from '../logger'

export interface ScanOptions {
  incremental?: boolean
  onProgress?: (progress: ScanProgress) => void
  /** 扫描收尾的缺失/脱离语义判定（决策在 WorkspaceService.finalizeScan，P0.5 起） */
  onFinalize?: (seenUris: Set<string>, currentPaths: string[]) => Promise<{ markedMissing: number; detached: number }> | { markedMissing: number; detached: number }
  signal?: AbortSignal
}

const BATCH_SIZE = 500

function isExcluded(relPath: string, config: AppConfig): boolean {
  const segments = relPath.split(/[\\/]/)
  return segments.some((seg) => config.scanExcludePatterns.includes(seg))
}

/**
 * 迭代式目录遍历（显式栈，避免深目录栈溢出）。
 * 返回相对路径列表，交给上层批处理。
 */
async function walk(
  root: string,
  recursive: boolean,
  config: AppConfig,
  onFile: (absPath: string) => void
): Promise<void> {
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue // 无权限/不存在的目录，跳过
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (isExcluded(full, config)) continue
      if (entry.isDirectory()) {
        if (recursive) stack.push(full)
      } else if (entry.isFile()) {
        onFile(full)
      }
    }
  }
}

/**
 * 全量/增量扫描：分块异步处理，事务批量提交，进度经 onProgress 上报。
 * 哈希只读文件前 64KB（xxHash64）。
 * 全程异步分块 + 短事务，避免阻塞 Electron 主进程（吸取旧版"扫描卡死 UI"教训）。
 */
export async function scanWorkspace(
  db: AppDb,
  config: AppConfig,
  workspaceId: number,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const { incremental = false, onProgress, onFinalize, signal } = options
  const startedAt = Date.now()
  logger.info('scan', `开始扫描 workspace#${workspaceId} (${incremental ? '增量' : '全量'})`)

  const workspace = workspaceDao.getById(db, workspaceId)
  if (!workspace) throw new Error('工作区不存在')
  const paths = workspaceDao.listPaths(db, workspaceId)
  if (paths.length === 0) throw new Error('工作区没有配置任何扫描路径')

  // 收集文件
  const files: string[] = []
  onProgress?.({ workspaceId, phase: 'walk', processed: 0, total: 0, current: null })
  for (const p of paths) {
    await walk(p.path, p.recursive, config, (f) => files.push(f))
    signal?.throwIfAborted()
  }

  // 已存在的 source_uri → 状态映射（用于增量跳过 + 哈希变更检测 + 缺失标记）
  const known = new Map<
    string,
    { size: number | null; fileModifiedAt: string | null; contentHash: string | null }
  >()
  for (const row of db.read
    .prepare(
      'SELECT source_uri, size, file_modified_at, content_hash FROM item WHERE source_uri IS NOT NULL'
    )
    .all() as {
    source_uri: string
    size: number | null
    file_modified_at: string | null
    content_hash: string | null
  }[]) {
    known.set(row.source_uri, {
      size: row.size,
      fileModifiedAt: row.file_modified_at,
      contentHash: row.content_hash
    })
  }

  const seenUris = new Set<string>()
  let filesAdded = 0
  let filesUpdated = 0
  let errors = 0

  const processOne = async (absPath: string): Promise<void> => {
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(absPath)
    } catch {
      errors++
      return
    }
    const sourceUri = absPath
    seenUris.add(sourceUri)
    const previous = known.get(sourceUri)
    const modifiedAt = stat.mtime.toISOString()

    // 增量：大小 + mtime 未变则跳过哈希
    if (incremental && previous && previous.size === stat.size && previous.fileModifiedAt === modifiedAt) {
      return
    }

    let contentHash: string
    try {
      contentHash = await hashFileFirst64Kb(absPath)
    } catch {
      errors++
      return
    }

    const ext = absPath.includes('.') ? absPath.slice(absPath.lastIndexOf('.') + 1).toLowerCase() : null
    // 不直出原图：网格一律用懒生成的缩略图（渲染进程抓帧/缩放），避免全分辨率解码卡顿
    const previewUri = null

    const result = itemDao.upsertFromScan(db, workspaceId, sourceUri, {
      title: absPath.split(/[\\/]/).pop() ?? absPath,
      extension: ext,
      size: stat.size,
      contentHash,
      fileModifiedAt: modifiedAt,
      previewUri
    })
    if (result === 'added') filesAdded++
    else filesUpdated++

    // 元数据提取：仅新条目或内容哈希变化时（避免全量扫描对每个文件重复 ffprobe）
    const hashChanged = previous == null || previous.contentHash !== contentHash
    if (hashChanged) {
      const item = itemDao.findBySourceUri(db, sourceUri)
      if (item) await extractMetadataForItem(db, item, config)
    }
  }

  // 分块：每块先异步收集数据，再同步短事务写入（不跨 await 持锁）
  onProgress?.({ workspaceId, phase: 'hash', processed: 0, total: files.length, current: null })
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    signal?.throwIfAborted()
    const batch = files.slice(i, i + BATCH_SIZE)
    for (const file of batch) {
      await processOne(file)
    }
    if (i % (BATCH_SIZE * 4) === 0 || i + BATCH_SIZE >= files.length) {
      onProgress?.({ workspaceId, phase: 'hash', processed: Math.min(i + BATCH_SIZE, files.length), total: files.length, current: null })
      await new Promise((r) => setImmediate(r)) // 让出事件循环
    }
  }

  // 缺失标记 / 路径脱离（语义：路径外或目录消失 → 脱离；目录在文件没 → 缺失）
  // P0.5 起决策在 WorkspaceService.finalizeScan（existsSync/isUnderPath 判定不再入 DAO）
  onProgress?.({ workspaceId, phase: 'finalize', processed: files.length, total: files.length, current: null })
  const { markedMissing, detached } = onFinalize
    ? await onFinalize(seenUris, paths.map((p) => p.path))
    : { markedMissing: 0, detached: 0 }

  // 图片宽高回填：历史条目缺少 width/height 时补 image-size（快），让比例瀑布流立即生效；
  // 视频/音频依赖 ffprobe（慢），仅随"新增/变更"提取
  const imageExts = Object.entries(config.fileFormatMap)
    .filter(([, v]) => v === 'image')
    .map(([k]) => k)
  if (imageExts.length > 0) {
    const placeholders = imageExts.map(() => '?').join(',')
    const missingDims = db.read
      .prepare(
        `SELECT i.id AS id, i.source_uri AS source_uri, i.extension AS extension FROM item i
         JOIN workspace_item wi ON wi.item_id = i.id
         WHERE wi.workspace_id = ? AND i.extension IN (${placeholders})
           AND NOT EXISTS (SELECT 1 FROM item_metadata m WHERE m.item_id = i.id AND m.key = 'width')`
      )
      .all(workspaceId, ...imageExts) as { id: number; source_uri: string; extension: string | null }[]
    for (let i = 0; i < missingDims.length; i += BATCH_SIZE) {
      const batch = missingDims.slice(i, i + BATCH_SIZE)
      for (const row of batch) {
        const item: Item = {
          id: row.id,
          title: '',
          extension: row.extension,
          itemType: 'local_file',
          sourceUri: row.source_uri,
          previewUri: null,
          contentHash: null,
          size: null,
          capturedAt: null,
          fileModifiedAt: null,
          status: 'active',
          createdAt: '',
          updatedAt: ''
        }
        await extractMetadataForItem(db, item, config)
      }
      await new Promise((r) => setImmediate(r)) // 让出事件循环
    }
  }

  // 孤儿条目自动清理：脱离路径后残留的全局条目若超过阈值则批量删除（FK 级联），
  // 防止规模增长（十万级）后库膨胀。阈值内保留以实现"重加路径即恢复"。
  const ORPHAN_THRESHOLD = 2000
  const orphans = itemDao.countOrphans(db)
  if (orphans > ORPHAN_THRESHOLD) {
    for (let left = orphans; left > 0; left -= BATCH_SIZE) {
      itemDao.deleteOrphans(db, Math.min(BATCH_SIZE, left))
      await new Promise((r) => setImmediate(r)) // 让出事件循环
    }
    logger.warn('scan', `孤儿条目超过阈值，已清理 ${orphans} 条`)
  }

  const result: ScanResult = {
    filesAdded,
    filesUpdated,
    filesMarkedMissing: markedMissing,
    filesDetached: detached,
    errors,
    durationMs: Date.now() - startedAt
  }
  workspaceDao.recordScanHistory(db, workspaceId, incremental ? 'incremental' : 'full', result)
  logger.info(
    'scan',
    `扫描完成 workspace#${workspaceId}: +${result.filesAdded} ~${result.filesUpdated} 缺失${result.filesMarkedMissing} 脱离${result.filesDetached} 错误${result.errors} (${result.durationMs}ms)`
  )
  return result
}

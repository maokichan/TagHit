import imageSize from 'image-size'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { basename, dirname, join } from 'path'
import type { AppDb } from '../../db/connection'
import type { AppConfig } from '@shared/types/config'
import type { Item } from '@shared/types/item'
import { itemDao } from '../item/item.dao'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

/** 由 config.ffmpegPath 推导 ffprobe 路径（同名目录下的 ffprobe/ffprobe.exe） */
export function deriveFfprobePath(ffmpegPath: string): string {
  const base = basename(ffmpegPath, ffmpegPath.endsWith('.exe') ? '.exe' : '')
  const exe = base === 'ffmpeg' ? 'ffprobe' : `${base.replace(/ffmpeg$/i, '')}ffprobe`
  const dir = dirname(ffmpegPath)
  if (dir && dir !== '.') return join(dir, exe + (ffmpegPath.endsWith('.exe') ? '.exe' : ''))
  return exe
}

function extractImage(filePath: string): Record<string, string> {
  try {
    const d = imageSize(filePath)
    const entries: Record<string, string> = {}
    if (d.width) entries.width = String(d.width)
    if (d.height) entries.height = String(d.height)
    if (d.type) entries.format = d.type
    return entries
  } catch {
    return {}
  }
}

async function extractFfprobe(
  filePath: string,
  ffprobePath: string,
  category: string
): Promise<Record<string, string>> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ])
  const data = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string }
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      sample_rate?: string
      channels?: number
      bit_rate?: string
      duration?: string
    }>
  }
  const entries: Record<string, string> = {}
  const stream = (data.streams ?? []).find((s) => s.codec_type === (category === 'video' ? 'video' : 'audio'))

  const durationMs =
    (data.format?.duration ?? stream?.duration) && Number(data.format?.duration ?? stream?.duration) > 0
      ? Math.round(Number(data.format?.duration ?? stream?.duration) * 1000)
      : undefined
  if (durationMs) entries.duration_ms = String(durationMs)

  const bitrate = data.format?.bit_rate ?? stream?.bit_rate
  if (bitrate) entries.bitrate = String(bitrate)

  if (category === 'video' && stream) {
    if (stream.width) entries.width = String(stream.width)
    if (stream.height) entries.height = String(stream.height)
    if (stream.codec_name) entries.codec = stream.codec_name
    if (stream.avg_frame_rate && stream.avg_frame_rate !== '0/0') {
      const [num, den] = stream.avg_frame_rate.split('/').map(Number)
      if (num && den) entries.fps = String(Math.round((num / den) * 1000) / 1000)
    }
  }

  if (category === 'audio' && stream) {
    if (stream.codec_name) entries.codec = stream.codec_name
    if (stream.sample_rate) entries.sample_rate = stream.sample_rate
    if (stream.channels) entries.channels = String(stream.channels)
  }

  return entries
}

/**
 * 提取条目元数据并写入 item_metadata（EAV）。
 * - 图片：image-size（纯 JS，快）
 * - 视频/音频：ffprobe 子进程（配置驱动路径）
 * 失败静默（元数据是非关键路径），避免破坏扫描主流程。
 */
export async function extractMetadataForItem(
  db: AppDb,
  item: Item,
  config: AppConfig
): Promise<void> {
  if (!item.sourceUri) return
  const category = config.fileFormatMap[item.extension?.toLowerCase() ?? ''] ?? 'other'
  let entries: Record<string, string> = {}
  try {
    if (category === 'image') {
      entries = extractImage(item.sourceUri)
    } else if (category === 'video' || category === 'audio') {
      entries = await extractFfprobe(item.sourceUri, deriveFfprobePath(config.ffmpegPath), category)
    }
  } catch (err) {
    logger.warn('metadata', `提取失败: ${item.sourceUri}`, err instanceof Error ? err.message : err)
    return
  }
  if (Object.keys(entries).length > 0) {
    itemDao.upsertMetadata(db, item.id, entries)
  }
}

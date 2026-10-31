/**
 * 音频元数据与内嵌封面提取（主进程能力，宿主所有）。
 *
 * 与扫描期图片尺寸解析（application/mediaMeta.ts）、视频抓帧落盘同族：都是
 * 程序自有的媒体事实提取。归宿主而非应用层，因为它需要全文件随机访问
 * （m4a 的 moov 在尾段），超出 FileSystem 端口（readHead）的表达面；
 * 依赖 music-metadata（格式动物园由成熟库兜，宿主能力永久持有）。
 *
 * 产物归属（D42 裁决）：封面经既有缩略图通道落盘（{userData}/thumbnails，
 * contentHash 键、同内容共享、previewUri 回写）——**数据层产物跟宿主能力走，
 * 产物就是原生的**；本模块只负责"解析出事实"，不做落库决策。
 *
 * 音频判定 = 扩展名集合 ∩ 解析成功。扩展名表对齐渲染层 mediaTypes 的
 * DEFAULT_EXTS.audio（类别映射是渲染层可配置项，宿主不可见，双表人工同步；
 * 漂移只影响封面提取的覆盖面，不影响安全——TEXT_EXTS 同款边界）。
 */

import { parseFile } from 'music-metadata'
import { parseImageSize } from '../../application/mediaMeta.ts'

/** 音频扩展名（对齐渲染层 DEFAULT_EXTS.audio；mp4 不在表内 = 视频探针被排除） */
const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma'])

export function isAudioExt(title: string): boolean {
  const dot = title.lastIndexOf('.')
  if (dot <= 0 || dot === title.length - 1) return false
  return AUDIO_EXTS.has(title.slice(dot + 1).toLowerCase())
}

export interface AudioTags {
  title: string | null
  artist: string | null
  album: string | null
}

export interface AudioCover {
  /** 真实图像格式的规范扩展名（决定落盘文件名后缀与 taghit-file 的 MIME） */
  ext: 'jpg' | 'png' | 'gif' | 'webp' | 'bmp'
  bytes: Uint8Array
  /** 封面固有尺寸（application/mediaMeta 零依赖头解析；解析不出 → null） */
  width: number | null
  height: number | null
}

export interface AudioMeta {
  tags: AudioTags
  cover: AudioCover | null
  /** 内嵌歌词标签原文（common.lyrics 首段；无词 → null）。伴生 .lrc 的读取决策在 handler。 */
  lyrics: string | null
}

const EXT_BY_MIME: Array<[RegExp, AudioCover['ext']]> = [
  [/jpe?g/, 'jpg'],
  [/png/, 'png'],
  [/gif/, 'gif'],
  [/webp/, 'webp'],
  [/bmp/, 'bmp'],
]

/**
 * 解析音频文件的标签与内嵌封面。非音频格式/解析失败 → null（读宽松，
 * 与 readItemText 的"不可读 → null"同语义）；有标签无封面 → cover: null。
 */
export async function readAudioMeta(filePath: string): Promise<AudioMeta | null> {
  let meta
  try {
    meta = await parseFile(filePath)
  } catch {
    return null
  }
  const picture = meta.common.picture?.[0]
  let cover: AudioCover | null = null
  if (picture != null) {
    const ext = EXT_BY_MIME.map(([re, e]) => (re.test(picture.format) ? e : null)).find((e) => e != null)
    if (ext != null && picture.data.byteLength > 0) {
      const size = parseImageSize(picture.data)
      cover = {
        ext,
        bytes: picture.data,
        width: size?.width ?? null,
        height: size?.height ?? null,
      }
    }
  }
  return {
    tags: {
      title: meta.common.title ?? null,
      artist: meta.common.artist ?? null,
      album: meta.common.album ?? null,
    },
    cover,
    lyrics: meta.common.lyrics?.[0]?.text || null,
  }
}

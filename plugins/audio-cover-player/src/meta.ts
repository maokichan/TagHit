/**
 * 音频元数据获取（插件内）：contentHash 幂等缓存（宿主侧落盘本就幂等，这里省重复 IPC）。
 * 缓存是插件自持状态——随插件卸载消失；缩略图产物在宿主通道，不受影响（D42）。
 */

import type { ItemView } from '@renderer/features/contribution'
import { hostApi } from './context.ts'

export interface AudioMetaView {
  tags: { title: string | null; artist: string | null; album: string | null }
  previewUri: string | null
}

const cache = new Map<string, AudioMetaView>()

/** 拉取音频元数据；条目无内容签名（锚）/宿主判定不可解析 → null；失败可见（不静默）。 */
export async function fetchAudioMeta(item: ItemView): Promise<AudioMetaView | null> {
  const hash = item.contentHash
  if (hash == null) return null
  const hit = cache.get(hash)
  if (hit != null) return hit
  try {
    const meta = await hostApi().items.readAudioMeta(item.id)
    if (meta != null) cache.set(hash, meta)
    return meta
  } catch (err) {
    // 失败可见性（D42 收口）：源文件缺失（NOT_FOUND）等不再被调用方吞掉，这里如实记录。
    console.error('[audioPlayer] readAudioMeta 失败', item.id, err)
    return null
  }
}

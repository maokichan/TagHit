/**
 * 音频封面 + 播放器（插件生态首批实战，模拟第三方形态：独立目录 + 磁盘 manifest）。
 *
 * 贡献：detailPreview 提供方认领音频条目（D37 ②后注册覆盖先注册 → 替换内置裸 <audio>）；
 * detailView 歌词视图（D43，views 槽首个消费方——播放器是单条目预览、歌词是条目的一个侧面）。
 * 数据：音频元数据/封面/歌词是宿主原生能力（items.readAudioMeta，与视频抓帧同族）——封面
 * 缩略图经宿主落盘回写 previewUri 后，网格/胶片条原生呈现，本插件只是第一消费方，
 * 数据面无私产（D42：数据层产物跟宿主能力走，呈现层产物跟插件走）。
 *
 * 类型引用唯一入口 = 契约模块（真实分发形态下即发布的插件 API 包）。
 */

import type { ContributionContext, DetailPreviewProvider } from '@renderer/features/contribution'
import { bindContext } from './context.ts'
import AudioPlayer from './AudioPlayer.vue'
import LyricsView from './LyricsView.vue'

const PROVIDER_ID = 'audioPlayer:audio'
const LYRICS_VIEW_ID = 'audioPlayer:lyrics'

export function activate(ctx: ContributionContext): () => void {
  bindContext(ctx)
  const provider: DetailPreviewProvider = {
    id: PROVIDER_ID,
    claims: (item) => item.mediaType === 'audio',
    component: AudioPlayer
  }
  ctx.previews.register(provider)
  ctx.views.register({
    id: LYRICS_VIEW_ID,
    title: '歌词',
    component: LyricsView,
    preferredSlot: 'right'
  })
  return () => {
    ctx.previews.unregister(PROVIDER_ID)
    ctx.views.unregister(LYRICS_VIEW_ID)
  }
}

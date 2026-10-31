/**
 * 音频封面 + 播放器（插件生态首批实战，模拟第三方形态：独立目录 + 磁盘 manifest）。
 *
 * 贡献：detailPreview 提供方认领音频条目（D37 ②后注册覆盖先注册 → 替换内置裸 <audio>）。
 * 插件内容集中在一个页面里自组织（D43：黑胶播放 + 歌词页签），不做多槽散布。
 * 数据：音频元数据/封面/歌词是宿主原生能力（items.readAudioMeta，与视频抓帧同族）——封面
 * 缩略图经宿主落盘回写 previewUri 后，网格/胶片条原生呈现，本插件只是第一消费方，
 * 数据面无私产（D42：数据层产物跟宿主能力走，呈现层产物跟插件走）。
 *
 * 类型引用唯一入口 = 契约模块（真实分发形态下即发布的插件 API 包）。
 */

import type { ContributionContext, DetailPreviewProvider } from '@renderer/features/contribution'
import { bindContext } from './context.ts'
import AudioPlayer from './AudioPlayer.vue'

const PROVIDER_ID = 'audioPlayer:audio'

export function activate(ctx: ContributionContext): () => void {
  bindContext(ctx)
  const provider: DetailPreviewProvider = {
    id: PROVIDER_ID,
    claims: (item) => item.mediaType === 'audio',
    component: AudioPlayer
  }
  ctx.previews.register(provider)
  return () => ctx.previews.unregister(PROVIDER_ID)
}

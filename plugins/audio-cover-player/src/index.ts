/**
 * 音频封面 + 播放器（插件生态首批实战，模拟第三方形态：独立目录 + 磁盘 manifest）。
 *
 * 贡献：detailPreview 提供方认领音频条目（D37 ②后注册覆盖先注册 → 替换内置裸 <audio>）；
 * commands 槽（D46）注册「转到正在播放的条目」——全局播放切走不停播（D43）的回看缺口，
 * 命令进命令面板（右键菜单保持官方策展）。
 * 插件内容集中在一个页面里自组织（D43：黑胶播放 + 歌词页签），不做多槽散布。
 * 数据：音频元数据/封面/歌词是宿主原生能力（items.readAudioMeta，与视频抓帧同族）——封面
 * 缩略图经宿主落盘回写 previewUri 后，网格/胶片条原生呈现，本插件只是第一消费方，
 * 数据面无私产（D42：数据层产物跟宿主能力走，呈现层产物跟插件走）。
 * 设置：manifest.settings 声明制（D46）——歌词字号，值经 HostApi config 只读域取。
 *
 * 类型引用唯一入口 = 契约模块（真实分发形态下即发布的插件 API 包）。
 */

import type { ContributionContext, DetailPreviewProvider } from '@renderer/features/contribution'
import { bindContext, hostApi } from './context.ts'
import AudioPlayer from './AudioPlayer.vue'

const PROVIDER_ID = 'audioPlayer:audio'
const REVEAL_COMMAND_ID = 'audioPlayer.revealPlaying'

export function activate(ctx: ContributionContext): () => void {
  bindContext(ctx)
  const provider: DetailPreviewProvider = {
    id: PROVIDER_ID,
    claims: (item) => item.mediaType === 'audio',
    component: AudioPlayer
  }
  ctx.previews.register(provider)
  // 命令 id 强制本插件前缀（<featureId>.，D46）；无 when = 面板恒可用，
  // 没在播时执行给可见反馈（不静默），而不是在面板上谎报不可用
  ctx.commands.register(
    { id: REVEAL_COMMAND_ID, title: '转到正在播放的条目' },
    () => {
      const snap = hostApi().playback.snapshot()
      if (snap.itemId == null) {
        void hostApi().ui.toast('当前没有正在播放的条目')
        return
      }
      void hostApi().items.open(snap.itemId).catch((e: unknown) => {
        void hostApi().ui.toast(e instanceof Error ? e.message : String(e))
      })
    }
  )
  return () => {
    ctx.previews.unregister(PROVIDER_ID)
    ctx.commands.unregister(REVEAL_COMMAND_ID)
  }
}

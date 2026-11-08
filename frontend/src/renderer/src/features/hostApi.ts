/**
 * HostApi 门面 —— 窄桥的**冻结子集视图**（见 DECISIONS）。
 *
 * 官方组件与壳允许使用全量窄桥（@shared/api，随壳同版本发布，可演进）；
 * contributed 代码只经本门面取数与调用服务——本文件导出的形状即三方插件 API 契约，
 * 破坏性变更必须升 HOST_API_VERSION。命令注册表与权限清单以此为底座。
 */
import { api } from '@shared/api'
import { computed, type Ref } from 'vue'
import { confirmDialog, showToast } from './services/dialog'
import type { ConfirmOptions } from './services/dialog'
import type { LocalizedText } from '@shared/contract'
import { taghitFileUrl } from '../lib/media'
import { toItemView, type ItemView } from '../lib/viewModel'
import { useConfigStore } from '../stores/config'
import { i18n } from '../i18n'
import { resolveLocalized } from '../lib/localized'
import {
  playbackPlay,
  playbackToggle,
  playbackPause,
  playbackSeek,
  playbackSetVolume,
  playbackSetLoop,
  playbackSnapshot,
  playbackSubscribe
} from './playback/playback'

export const HOST_API_VERSION = '0.2.4'

const configStore = useConfigStore()

export const hostApi = {
  version: HOST_API_VERSION,
  workspaces: {
    list: api.workspaces.list,
    listRoots: api.workspaces.listRoots,
    declaredTags: api.workspaces.declaredTags,
    browse: api.workspaces.browse
  },
  items: {
    query: api.items.query,
    tag: api.items.tag,
    untag: api.items.untag,
    readText: api.items.readText,
    readAudioMeta: api.items.readAudioMeta,
    /** 打开条目详情（D46）：与官方双击同语义（条目已在标签页 = 激活；写历史）。
     *  tabs（含 router）动态引入：本门面是插件契约模块的依赖，静态引入会把 router
     *  拖进契约链——渲染层纯逻辑测试就再也跑不动了（D30 纪律）。 */
    open: async (itemId: string): Promise<void> => {
      const hits = await api.items.query({ ids: [itemId] })
      const hit = hits[0]
      if (hit == null) throw new Error(`条目不存在（${itemId}）`)
      const { openItemTab } = await import('./tabs')
      openItemTab(hit.item.id, hit.item.title)
    },
    /** 条目视图模型（D47）：插件页面呈现条目所需（视图投影转换归宿主，插件不摸内部模块）。 */
    get: async (itemId: string): Promise<ItemView | null> => {
      const hits = await api.items.query({ ids: [itemId] })
      const hit = hits[0]
      return hit != null ? toItemView(hit) : null
    }
  },
  /** 媒体通道助手：taghit-file 协议 URL 构造（字节闸门渲染侧的唯一合法入口） */
  media: {
    fileUrl: taghitFileUrl
  },
  tags: {
    search: api.tags.search,
    create: api.tags.create,
    declare: api.tags.declare,
    undeclare: api.tags.undeclare
  },
  /**
   * 配置只读域（D46）：插件声明的设置项值（manifest.settings）由此读——
   * 存储键 = `featureId:key`，**写入面只归宿主 UI**（插件详情页的 SchemaControl），
   * 插件只读。ref = 响应式读（插件是 Vue 组件，设置改动即时生效）。
   */
  config: {
    value<T>(featureId: string, key: string, fallback: T): T {
      return configStore.value(featureId, key, fallback)
    },
    ref<T>(featureId: string, key: string, fallback: T): Ref<T> {
      return computed(() => configStore.value(featureId, key, fallback))
    }
  },
  /** 服务面（dialog/toast）：经壳统一渲染，manifest.surfaces 声明后使用。
   *  文案两形态（D51）：插件可传字符串或语言映射，进入壳服务前按当前语言解析为字符串。 */
  ui: {
    confirm(opts: {
      title: LocalizedText
      message: LocalizedText
      confirmText?: LocalizedText
      cancelText?: LocalizedText
      danger?: boolean
    }): Promise<boolean> {
      const loc = i18n.global.locale.value
      const out: ConfirmOptions = {
        title: resolveLocalized(opts.title, loc),
        message: resolveLocalized(opts.message, loc),
        danger: opts.danger
      }
      if (opts.confirmText != null) out.confirmText = resolveLocalized(opts.confirmText, loc)
      if (opts.cancelText != null) out.cancelText = resolveLocalized(opts.cancelText, loc)
      return confirmDialog(out)
    },
    toast(text: LocalizedText, kind: 'info' | 'error' = 'info'): void {
      showToast(resolveLocalized(text, i18n.global.locale.value), kind)
    }
  },
  /** 播放面（D43）：全局播放引擎的冻结子集——换曲即播/传输控制/快照订阅（回调式，不暴露响应式对象）。 */
  playback: {
    play: playbackPlay,
    toggle: playbackToggle,
    pause: playbackPause,
    seek: playbackSeek,
    setVolume: playbackSetVolume,
    setLoop: playbackSetLoop,
    snapshot: playbackSnapshot,
    onChange: playbackSubscribe
  }
} as const

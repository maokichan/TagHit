/**
 * HostApi 门面 —— 窄桥的**冻结子集视图**（见 DECISIONS）。
 *
 * 官方组件与壳允许使用全量窄桥（@shared/api，随壳同版本发布，可演进）；
 * contributed 代码只经本门面取数与调用服务——本文件导出的形状即三方插件 API 契约，
 * 破坏性变更必须升 HOST_API_VERSION。命令注册表与权限清单以此为底座。
 */
import { api } from '@shared/api'
import { confirmDialog, showToast } from './services/dialog'
import { taghitFileUrl } from '../lib/media'

export const HOST_API_VERSION = '0.2.0'

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
    readAudioMeta: api.items.readAudioMeta
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
  /** 服务面（dialog/toast）：经壳统一渲染，manifest.surfaces 声明后使用 */
  ui: {
    confirm: confirmDialog,
    toast: showToast
  }
} as const

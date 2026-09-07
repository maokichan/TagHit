import { ref } from 'vue'
import type { Id } from '@shared/contract'

/**
 * 批量打标服务面（ARCHITECTURE §3.2 服务面：壳的受控瞬态服务，非插槽）。
 * 右键命令与多选操作条经此请求；ServiceHost 统一渲染标签多选弹层。
 * 功能组件禁止自起弹层——批量打标走本服务。
 */

export type BatchTagMode = 'add' | 'remove'

export interface BatchTagRequest {
  mode: BatchTagMode
  workspaceId: Id
  /** 本次操作对象数（标题展示；命令侧来自 MenuContext.selection）。 */
  count: number
  /** 应用回调（mode + 勾选标签集）；抛错由弹层捕获并 toast。 */
  onApply: (mode: BatchTagMode, tagIds: Id[]) => Promise<void>
}

const state = ref<BatchTagRequest | null>(null)

/** 打开批量打标弹层（单实例排队：已有请求时覆盖）。 */
export function openBatchTagDialog(req: BatchTagRequest): void {
  state.value = req
}

export function closeBatchTagDialog(): void {
  state.value = null
}

export function useBatchTagState(): typeof state {
  return state
}

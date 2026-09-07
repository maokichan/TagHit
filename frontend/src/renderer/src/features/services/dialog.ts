import { ref } from 'vue'

/**
 * 服务面（ARCHITECTURE §3.2）：壳的受控瞬态服务——确认对话框 + 轻通知。
 * 不是插槽：打断级 UI 的样式/层叠/焦点语义由壳统一渲染（ServiceHost），
 * 功能组件经此模块请求，禁止自起 window.confirm / DOM 弹层。
 * manifest.surfaces 声明所需服务；权限门落地后按声明审查。
 */

// ── 确认对话框（Promise 化，单实例排队） ──
export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 危险动作：确认键红色警示（壳硬规则） */
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

const pending = ref<PendingConfirm | null>(null)

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pending.value = { ...opts, resolve }
  })
}

export function answerConfirm(ok: boolean): void {
  pending.value?.resolve(ok)
  pending.value = null
}

export function usePendingConfirm(): typeof pending {
  return pending
}

// ── 轻通知（右下角，自动消退） ──
export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

const toasts = ref<Toast[]>([])
let toastSeq = 0

export function showToast(text: string, kind: 'info' | 'error' = 'info'): void {
  const id = ++toastSeq
  toasts.value.push({ id, text, kind })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 3200)
}

export function useToasts(): typeof toasts {
  return toasts
}

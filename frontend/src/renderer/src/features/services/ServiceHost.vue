<script setup lang="ts">
/**
 * 服务面宿主（壳级，App.vue 挂载一次）：确认对话框 + 轻通知的统一渲染。
 * 模态语义：Esc = 取消、Enter = 确认、遮罩点击 = 取消；danger 确认键红色警示。
 */
import { watch } from 'vue'
import { answerConfirm, usePendingConfirm, useToasts } from './dialog'

const pending = usePendingConfirm()
const toasts = useToasts()

watch(pending, (v) => {
  if (v == null) return
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') answerConfirm(false)
    else if (e.key === 'Enter') answerConfirm(true)
    else return
    window.removeEventListener('keydown', onKey)
  }
  window.addEventListener('keydown', onKey)
})
</script>

<template>
  <!-- 确认对话框 -->
  <div
    v-if="pending != null"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
    @mousedown="answerConfirm(false)"
  >
    <div
      class="w-80 max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-4 shadow-2xl"
      @mousedown.stop
    >
      <div class="text-sm font-medium mb-2">{{ pending.title }}</div>
      <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed whitespace-pre-wrap mb-4">
        {{ pending.message }}
      </p>
      <div class="flex justify-end gap-2">
        <button class="btn text-[12px]" @click="answerConfirm(false)">
          {{ pending.cancelText ?? '取消' }}
        </button>
        <button
          class="btn text-[12px]"
          :class="pending.danger ? 'text-[var(--danger)] border-[var(--danger)]/50' : 'btn-primary'"
          @click="answerConfirm(true)"
        >
          {{ pending.confirmText ?? '确认' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 轻通知（右下角堆叠） -->
  <div class="fixed bottom-4 right-4 z-[60] space-y-2">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="px-3 py-2 rounded-md border text-[12px] shadow-lg bg-[var(--bg-elev)]"
      :class="t.kind === 'error' ? 'border-[var(--danger)]/50 text-[var(--danger)]' : 'border-[var(--border)] text-[var(--fg)]'"
    >
      {{ t.text }}
    </div>
  </div>
</template>

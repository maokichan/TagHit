<script setup lang="ts">
/**
 * 服务面宿主（壳级，App.vue 挂载一次）：确认对话框 + 轻通知 + 批量打标弹层的统一渲染。
 * 模态语义：Esc = 取消、Enter = 确认、遮罩点击 = 取消；danger 确认键红色警示。
 */
import { ref, watch } from 'vue'
import { answerConfirm, showToast, usePendingConfirm, useToasts } from './dialog'
import { closeBatchTagDialog, useBatchTagState, type BatchTagMode } from './batchTag'
import { useTagStore } from '../../stores/tag'

const pending = usePendingConfirm()
const toasts = useToasts()
const batchTag = useBatchTagState()
const tagStore = useTagStore()

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

// ── 批量打标弹层 ──
const batchChecked = ref<string[]>([])
const batchBusy = ref(false)

watch(
  batchTag,
  async (v) => {
  batchChecked.value = []
  batchBusy.value = false
  if (v == null) return
  await tagStore.refreshForWorkspace(v.workspaceId)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      closeBatchTagDialog()
      window.removeEventListener('keydown', onKey)
    }
    window.addEventListener('keydown', onKey)
  },
  { flush: 'post' }
)

function toggleBatchTag(tagId: string): void {
  batchChecked.value = batchChecked.value.includes(tagId)
    ? batchChecked.value.filter((id) => id !== tagId)
    : [...batchChecked.value, tagId]
}

async function applyBatchTag(mode: BatchTagMode): Promise<void> {
  const req = batchTag.value
  if (req == null || batchBusy.value) return
  const tagIds = batchChecked.value
  if (tagIds.length === 0) {
    showToast('请先勾选标签', 'error')
    return
  }
  batchBusy.value = true
  try {
    await req.onApply(mode, tagIds)
    showToast(mode === 'add' ? `已为 ${req.count} 项打上 ${tagIds.length} 个标签` : `已从 ${req.count} 项移除 ${tagIds.length} 个标签`)
    closeBatchTagDialog()
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    batchBusy.value = false
  }
}

const batchTitle = (): string => {
  const req = batchTag.value
  if (req == null) return ''
  return req.mode === 'add' ? `批量打标签（${req.count} 项）` : `批量移除标签（${req.count} 项）`
}
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

  <!-- 批量打标弹层（服务面：标签多选 + 打标/移除） -->
  <div
    v-if="batchTag != null"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
    @mousedown="closeBatchTagDialog()"
  >
    <div
      class="w-[380px] max-w-[92vw] rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-4 shadow-2xl"
      @mousedown.stop
    >
      <div class="text-sm font-medium mb-3">{{ batchTitle() }}</div>

      <div v-if="tagStore.tags.length === 0" class="text-[12px] text-[var(--fg-dim)] mb-3">
        当前工作区尚未声明标签，请先在左侧「标签」面板声明。
      </div>
      <div
        v-else
        class="max-h-[260px] overflow-y-auto space-y-1 mb-4 border border-[var(--border)] rounded-md p-2"
      >
        <label
          v-for="tag in tagStore.tags"
          :key="tag.id"
          class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-[var(--bg-hover)] text-[12px]"
        >
          <input
            type="checkbox"
            :checked="batchChecked.includes(tag.id)"
            @change="toggleBatchTag(tag.id)"
            class="accent-[var(--accent)]"
          />
          <span class="truncate">#{{ tag.name }}</span>
        </label>
      </div>

      <div class="flex justify-end gap-2">
        <button class="btn text-[12px]" @click="closeBatchTagDialog()">取消</button>
        <button
          v-if="batchTag.mode === 'add'"
          class="btn btn-primary text-[12px] disabled:opacity-50"
          :disabled="batchBusy"
          @click="applyBatchTag('add')"
        >
          {{ batchBusy ? '处理中…' : '打标签' }}
        </button>
        <button
          v-else
          class="btn text-[12px] disabled:opacity-50"
          :disabled="batchBusy"
          @click="applyBatchTag('remove')"
        >
          {{ batchBusy ? '处理中…' : '移除标签' }}
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

<script setup lang="ts">
/**
 * 回添菜单（D40）：列出未落在目标槽的已注册视图（含被用户关闭的——安置即收回关闭记录），
 * 点选即落位并激活。工作台槽条"+"与中心空态按钮共用；外点关闭归父级（openSlot 状态）。
 */
import { computed } from 'vue'
import { DETAIL_SLOTS, moveView, type DetailSlotId } from './slots'
import { listDetailViews } from './views'
import { commitLayout, workbenchLayoutRef } from './store'

const props = defineProps<{
  /** 目标槽（点选的视图落到这里）。 */
  to: DetailSlotId
  /** 弹层方位：槽条下方（左/中/右）或槽体上方（底槽，防溢出视口）。 */
  anchor: 'below' | 'above'
}>()

const emit = defineEmits<{ done: [] }>()

const layout = workbenchLayoutRef()

const SLOT_LABEL: Record<DetailSlotId, string> = {
  left: '左栏',
  center: '中心',
  right: '右栏',
  bottom: '底栏'
}

const items = computed(() => {
  const l = layout.value
  if (l == null) return []
  return listDetailViews().filter((v) => !l.slots[props.to].includes(v.id))
})

function slotOf(viewId: string): DetailSlotId | null {
  const l = layout.value
  if (l == null) return null
  return DETAIL_SLOTS.find((s) => l.slots[s].includes(viewId)) ?? null
}

function add(viewId: string): void {
  const l = layout.value
  if (l == null) return
  commitLayout(moveView(l, viewId, props.to))
  emit('done')
}
</script>

<template>
  <!-- 左槽贴窗口左缘：菜单必须向右展开，锚右缘会整片出屏（落在"虚空"里） -->
  <div
    class="absolute z-20 min-w-44 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] shadow-lg"
    :class="[
      anchor === 'below' ? 'top-9' : 'bottom-full mb-1',
      to === 'left' ? 'left-1.5' : 'right-1.5'
    ]"
  >
    <button
      v-for="v in items"
      :key="v.id"
      class="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-[12px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)] cursor-pointer"
      @click="add(v.id)"
    >
      <span class="truncate">{{ v.title }}</span>
      <span
        v-if="slotOf(v.id)"
        class="text-[11px] opacity-70 shrink-0"
      >
        在{{ SLOT_LABEL[slotOf(v.id)!] }}
      </span>
    </button>
    <div v-if="!items.length" class="px-2.5 py-1.5 text-[12px] text-[var(--fg-dim)] opacity-70">
      没有可添加的视图
    </div>
  </div>
</template>

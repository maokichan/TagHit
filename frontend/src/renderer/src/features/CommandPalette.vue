<script setup lang="ts">
/**
 * 命令面板宿主（调用面，壳级，App.vue 挂载一次）——与 ContextMenuHost 同构：
 * 壳体只做三件事：取当前上下文 → 调 palette 装配 → 渲染与键位；命令表与可用性判定全在 palette.ts。
 *
 * 键位用**捕获阶段**监听并 stopPropagation：面板里的输入框是输入态，
 * 而快捷键执行器（keyboardMouse/setup.ts）按"输入态不触发"放行这些按键——
 * Esc 是它唯一的例外（会去清空选择），捕获阶段拦下才不会"关面板顺带清选择"。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { closePalette, usePaletteState, buildPalette, type PaletteRow } from './palette'
import { matchShortcut } from './keyboardMouse/shortcuts'
import { isDetailNavMounted } from './detailNav'
import { useItemStore } from '../stores/item'
import { useTabStore } from '../stores/tab'
import { showToast } from './services/dialog'

const opened = usePaletteState()
const itemStore = useItemStore()
const tabStore = useTabStore()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const rows = computed<PaletteRow[]>(() =>
  opened.value
    ? buildPalette(query.value, {
        workspaceId: tabStore.activeWorkspaceId,
        selectionIds: [...itemStore.selectedIds],
        targetItemId: itemStore.selected?.id ?? null,
        detailNavActive: isDetailNavMounted()
      })
    : []
)

/** 可执行的行（键盘导航只在这些行上走——不可用的行按了也没结果，与"不静默失败"一致）。 */
const runnable = computed<PaletteRow[]>(() => rows.value.filter((r) => r.applicable))
/** 当前高亮行：下标越界（过滤后行数变少）时钳到最后一行，免得"有高亮却按不动"。 */
const activeRow = computed<PaletteRow | null>(
  () => runnable.value[Math.min(activeIndex.value, runnable.value.length - 1)] ?? null
)

watch(opened, async (open) => {
  if (open) {
    query.value = ''
    activeIndex.value = 0
    window.addEventListener('keydown', onKey, true)
    await nextTick()
    inputRef.value?.focus()
  } else {
    window.removeEventListener('keydown', onKey, true)
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closePalette()
    return
  }
  // 再按一次组合键即收起（与打开同源；输入框不会用到 Ctrl+Shift+P）
  if (e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    closePalette()
    return
  }
  // 面板是模态调用面：别的**已绑定组合键**在面板打开期间不落到下层执行器
  // （否则 Ctrl+F 会隔着面板去聚焦搜索框，看起来像"面板自己乱跳"）
  const bound = matchShortcut(e)
  if (bound != null && bound.commandId !== 'shell.commandPalette') {
    e.stopPropagation()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    const n = runnable.value.length
    if (n === 0) return
    const cur = Math.min(activeIndex.value, n - 1)
    activeIndex.value = e.key === 'ArrowDown' ? (cur + 1) % n : (cur - 1 + n) % n
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    const row = activeRow.value
    if (row != null) void runCommand(row)
  }
}

async function runCommand(row: PaletteRow): Promise<void> {
  closePalette()
  try {
    await row.entry.run(row.ctx)
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), 'error')
  }
}

/** 鼠标悬停即预选（只对可执行行走键盘焦点环，不可用的行不参与）。 */
function hoverRow(row: PaletteRow): void {
  if (!row.applicable) return
  const i = runnable.value.indexOf(row)
  if (i >= 0) activeIndex.value = i
}
</script>

<template>
  <Teleport to="body">
    <div v-if="opened" class="fixed inset-0 z-40 flex items-start justify-center pt-24" @mousedown="closePalette">
      <div class="absolute inset-0 bg-black/25" />
      <div
        class="relative w-[560px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl overflow-hidden"
        @mousedown.stop
      >
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="输入命令名或命令 id…"
          class="w-full px-3 py-2.5 text-[13px] bg-transparent outline-none border-b border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-dim)]"
          @input="activeIndex = 0"
        />

        <div class="max-h-[46vh] overflow-y-auto py-1">
          <template v-if="rows.length">
            <button
              v-for="row in rows"
              :key="row.entry.manifest.id"
              class="w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors"
              :class="[
                row.entry === activeRow?.entry ? 'bg-[var(--bg-hover)]' : '',
                row.applicable ? 'text-[var(--fg)]' : 'text-[var(--fg-dim)] opacity-55 cursor-default'
              ]"
              :disabled="!row.applicable"
              :title="row.applicable ? row.entry.manifest.id : `${row.entry.manifest.id}：当前上下文不可用`"
              @click="runCommand(row)"
              @mousemove="hoverRow(row)"
            >
              <span class="truncate flex-1">{{ row.entry.manifest.title }}</span>
              <span v-if="!row.applicable" class="shrink-0 text-[10px] opacity-80">当前不可用</span>
              <span v-if="row.shortcut" class="shrink-0 text-[10px] tabular-nums text-[var(--fg-dim)]">
                {{ row.shortcut }}
              </span>
            </button>
          </template>
          <div v-else class="px-3 py-2 text-[12px] text-[var(--fg-dim)]">没有匹配的命令</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

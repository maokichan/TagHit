<script setup lang="ts">
/**
 * 右键菜单宿主（壳级，App.vue 挂载一次）：读壳开合状态 → 命令注册表现场装配 → 自绘渲染。
 * 装配规则归壳：分组 nav/modify/danger（节间分隔线）、组内 order 排序、danger 警示色；
 * 交互语义：Esc / 失焦 / 点击后关闭，↑↓ 键盘导航，Enter 执行。执行带错误隔离，
 * 一个命令抛错只记日志，不带崩菜单与壳（与 FeatureBoundary/setup 隔离同一纪律）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { assembleMenu, type CommandEntry } from './commands'
import { closeContextMenu, useContextMenuState } from './contextMenu'

const state = useContextMenuState()

const menuRef = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })
const activeId = ref<string | null>(null)

const sections = computed(() => (state.value ? assembleMenu(state.value.ctx) : []))
const flat = computed<CommandEntry[]>(() => sections.value.flatMap((s) => s.commands))

watch(state, async (v) => {
  if (v != null) {
    activeId.value = null
    pos.value = { left: v.x, top: v.y }
    await nextTick()
    const el = menuRef.value
    if (el != null) {
      const r = el.getBoundingClientRect()
      pos.value = {
        left: Math.max(4, Math.min(v.x, window.innerWidth - r.width - 8)),
        top: Math.max(4, Math.min(v.y, window.innerHeight - r.height - 8))
      }
    }
    window.addEventListener('keydown', onKey, true)
  } else {
    window.removeEventListener('keydown', onKey, true)
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeContextMenu()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = flat.value.length
    if (n === 0) return
    const idx = flat.value.findIndex((c) => c.manifest.id === activeId.value)
    if (idx < 0) {
      activeId.value = flat.value[e.key === 'ArrowDown' ? 0 : n - 1].manifest.id
      return
    }
    const next = e.key === 'ArrowDown' ? (idx + 1) % n : (idx - 1 + n) % n
    activeId.value = flat.value[next].manifest.id
  } else if (e.key === 'Enter') {
    const entry = flat.value.find((c) => c.manifest.id === activeId.value)
    if (entry != null) void run(entry)
  }
}

async function run(entry: CommandEntry): Promise<void> {
  const ctx = state.value?.ctx
  if (ctx == null) return
  closeContextMenu()
  try {
    await entry.run(ctx)
  } catch (e) {
    console.error(`[commands] ${entry.manifest.id} 执行失败`, e)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state != null"
      class="fixed inset-0 z-50"
      @mousedown="closeContextMenu()"
      @contextmenu.prevent="closeContextMenu()"
    >
      <div
        ref="menuRef"
        class="absolute min-w-[180px] max-w-[280px] py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] shadow-xl select-none"
        :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
        @mousedown.stop
      >
        <template v-for="(sec, si) in sections" :key="sec.group">
          <div v-if="si > 0" class="my-1.5 mx-2 border-t border-[var(--border)]" />
          <button
            v-for="c in sec.commands"
            :key="c.manifest.id"
            class="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 cursor-pointer transition-colors"
            :class="[
              activeId === c.manifest.id ? 'bg-[var(--bg-hover)] text-[var(--fg)]' : '',
              c.manifest.menu?.group === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--fg)]'
            ]"
            @click="run(c)"
            @mousemove="activeId = c.manifest.id"
          >
            {{ c.manifest.title }}
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

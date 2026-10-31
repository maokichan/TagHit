<script setup lang="ts">
/**
 * 回添/分割菜单（D40/D41）：挂在触发按钮的屏幕坐标上（fixed 定位，越缘翻转）。
 * 两组动作——「加入此槽」列出未落本叶的已注册视图（含被关闭的，安置即收回关闭记录）；
 * 「分割新槽」四向新建空槽（D41：任意槽位上下左右都能长出新槽）。
 * 菜单本体归 DetailWorkbench 单例渲染（api.menu 持有锚点），外点关闭归其遮罩层。
 */
import { computed } from 'vue'
import { findLeaf, type SplitDir } from './slots'
import { listDetailViews } from './views'
import { useWorkbenchApi } from './api'

const api = useWorkbenchApi()

const leaf = computed(() => {
  const m = api.menu.value
  if (m == null) return null
  return api.layout.value ? findLeaf(api.layout.value.tree, m.leafId) : null
})

const items = computed(() => {
  const l = leaf.value
  if (l == null) return []
  return listDetailViews().filter((v) => !l.stack.includes(v.id))
})

const SPLIT_DIRS: Array<{ dir: SplitDir; label: string }> = [
  { dir: 'left', label: '向左分割新槽' },
  { dir: 'right', label: '向右分割新槽' },
  { dir: 'above', label: '向上分割新槽' },
  { dir: 'below', label: '向下分割新槽' }
]

const MENU_W = 224

/** fixed 定位 + 越缘翻转：右缘收、下缘向上弹。 */
const pos = computed(() => {
  const m = api.menu.value
  if (m == null) return { left: '8px', top: '8px' }
  const est = 34 + items.value.length * 26 + SPLIT_DIRS.length * 26 + 24
  const left = Math.max(8, Math.min(m.x, window.innerWidth - MENU_W - 8))
  const top = m.y + est > window.innerHeight - 8 ? Math.max(8, m.y - est - 32) : m.y
  return { left: `${left}px`, top: `${top}px`, width: `${MENU_W}px` }
})
</script>

<template>
  <div
    v-if="leaf"
    class="fixed z-40 py-1 border border-[var(--border)] bg-[var(--bg-elev)] shadow-lg"
    :style="pos"
  >
    <div class="px-2.5 pt-1 pb-0.5 text-[11px] text-[var(--fg-dim)] opacity-70">加入此槽</div>
    <button
      v-for="v in items"
      :key="v.id"
      class="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-[12px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)] cursor-pointer"
      @click="api.addToLeaf(v.id, leaf.id); api.closeMenu()"
    >
      <span class="truncate">{{ v.title }}</span>
    </button>
    <div v-if="!items.length" class="px-2.5 py-1.5 text-[12px] text-[var(--fg-dim)] opacity-70">
      没有可添加的视图
    </div>

    <div class="divider my-1"></div>
    <div class="px-2.5 pt-0.5 pb-1 text-[11px] text-[var(--fg-dim)] opacity-70">分割新槽</div>
    <button
      v-for="d in SPLIT_DIRS"
      :key="d.dir"
      class="w-full flex items-center text-left px-2.5 py-1.5 text-[12px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)] cursor-pointer"
      @click="api.splitLeaf(leaf.id, d.dir); api.closeMenu()"
    >
      <span>{{ d.label }}</span>
    </button>
  </div>
</template>

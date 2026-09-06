<script setup lang="ts">
/**
 * 显示面板 —— 功能组件容器（不再内联实现）。
 * 遍历注册表挂载 displayPanel 的功能组件渲染区块；组件各自独立、互不 import。
 * 当前区块：媒体类型 / 排序 / 布局（卡片标题已按用户决策仅入设置页）。
 */
import { listFeatures } from '../../features/registry'

defineProps<{ side?: 'left' | 'right' }>()

const blocks = listFeatures('displayPanel')
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3 space-y-4">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] flex items-center gap-1.5">
        显示
      </div>

      <!-- 功能组件区块（宿主只渲染声明，不关心具体组件） -->
      <component v-for="f in blocks" :key="f.id" :is="f.component" />

      <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
        瀑布流模式下，图片卡片按真实比例渲染（比例上限
        <span class="kbd">2.2:1</span>，避免极端横幅/竖幅撑开）。视频、音频与文档保持固定比例。
      </p>
    </div>
  </aside>
</template>

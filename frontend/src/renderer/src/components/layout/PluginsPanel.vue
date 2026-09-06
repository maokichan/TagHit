<script setup lang="ts">
import { Puzzle } from 'lucide-vue-next'

defineProps<{ side?: 'left' | 'right' }>()

/** 插件机制不在宿主契约 v0：面板降级为说明占位（贡献点 v0 落地后恢复）。 */
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div
        class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2 flex items-center gap-1.5"
      >
        <Puzzle :size="12" /> 插件
      </div>

      <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
        插件机制暂未接入。
      </p>
      <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed mt-2">
        0.2 的插件方向：UI 增强走渲染层贡献点，复杂能力走主进程工具 + manifest
        声明式权限，统一经 HostApi 门面（见 docs/ARCHITECTURE §4）。宿主契约就绪后此面板恢复。
      </p>
    </div>
  </aside>
</template>

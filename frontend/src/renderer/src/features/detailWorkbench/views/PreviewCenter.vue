<script setup lang="ts">
/**
 * 中心槽默认视图：内嵌预览（detailPreview 贡献点，D37）+ 两侧翻页钮。
 * 预览提供方按条目认领、状态自持；翻页走骨架的 go（命令桥同源，←/→/PgUp/PgDn 一致）。
 * 视图不感知自己的槽位——被用户安置到别处时，这套内容原样随行。
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, File, Film, FileText, Image as ImageIcon, Music } from 'lucide-vue-next'
import { resolveDetailPreview } from '../../detailPreview'
import { useDetailWorkbenchContext } from '../context'

const ctx = useDetailWorkbenchContext()

const preview = computed(() => resolveDetailPreview(ctx.item))

// 兜底占位图标（无人认领的条目形态）
const iconMap: Record<string, typeof File> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  other: File
}
const TypeIcon = computed(() => iconMap[ctx.item.mediaType] ?? File)
</script>

<template>
  <!-- 呼吸留白归预览台的内衬（DetailWorkbench 的 p-2），视图内不再另垫——媒体可以贴到台缘 -->
  <div class="h-full w-full relative flex items-center justify-center overflow-hidden">
    <button
      class="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
      :disabled="ctx.prev == null"
      :title="ctx.prev != null ? `上一张：${ctx.prev.title}（← / PgUp）` : '已是第一张'"
      @click="ctx.go(ctx.prev)"
    >
      <ChevronLeft :size="18" />
    </button>

    <!-- 提供方渲染（认领制；无人认领 → 占位）。item 变化由提供方自watch（缩放复位/换源各自治理） -->
    <component :is="preview.component" v-if="preview" :item="ctx.item" />
    <div v-else class="flex flex-col items-center gap-3 text-[var(--fg-dim)]">
      <component :is="TypeIcon" :size="56" />
      <span class="text-sm">此类型暂无内嵌预览</span>
      <span v-if="ctx.item.sourceUri" class="text-[11px] kbd max-w-full truncate">{{ ctx.item.sourceUri }}</span>
    </div>

    <button
      class="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
      :disabled="ctx.next == null"
      :title="ctx.next != null ? `下一张：${ctx.next.title}（→ / PgDn）` : '已是最后一张'"
      @click="ctx.go(ctx.next)"
    >
      <ChevronRight :size="18" />
    </button>
  </div>
</template>

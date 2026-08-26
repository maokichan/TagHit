<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, Info } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { useTabStore } from '../../stores/tab'
import { formatSize } from '../../lib/format'

defineProps<{ side?: 'left' | 'right' }>()
const router = useRouter()
const itemStore = useItemStore()
const tabStore = useTabStore()

const item = computed(() => itemStore.selected)

const rows = computed(() => {
  const it = item.value
  if (!it) return []
  const base: Array<[string, string]> = [
    ['类型', it.mediaType],
    ['扩展名', it.extension ?? '-'],
    ['大小', formatSize(it.size)],
    ['状态', it.status],
    ['修改时间', it.fileModifiedAt ?? '-'],
    ['路径', it.sourceUri ?? '-']
  ]
  for (const m of it.metadata ?? []) {
    base.push([m.key, m.value])
  }
  return base
})

function openDetail(): void {
  const it = item.value
  if (!it) return
  const ws = it.workspaceIds?.[0] ?? null
  tabStore.openItem(it.id, ws, it.title)
  router.push(ws != null ? `/item/${it.id}?workspace=${ws}` : `/item/${it.id}`)
}
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
        <Info :size="12" /> 媒体信息
      </div>

      <template v-if="item">
        <div class="flex items-center gap-2 mb-3">
          <div class="text-[12px] font-medium truncate flex-1" :title="item.title">
            {{ item.title }}
          </div>
          <button class="btn text-[11px] p-1" title="打开详情页" @click="openDetail">
            <ExternalLink :size="13" />
          </button>
        </div>

        <div v-if="item.tags.length" class="flex flex-wrap gap-1 mb-3">
          <span
            v-for="tag in item.tags"
            :key="tag.id"
            class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--fg-dim)]"
          >
            #{{ tag.name }}
          </span>
        </div>

        <dl class="space-y-1 text-[12px]">
          <div v-for="[k, v] in rows" :key="k" class="flex gap-2">
            <dt class="w-16 shrink-0 text-[var(--fg-dim)] truncate" :title="k">{{ k }}</dt>
            <dd class="break-all min-w-0">{{ v }}</dd>
          </div>
        </dl>
      </template>

      <p v-else class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
        点击网格中的条目，在此查看媒体信息。<br />双击条目可打开详情页。
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useTagStore } from '../../stores/tag'
import { useItemStore } from '../../stores/item'

const props = defineProps<{ workspaceId: number; side?: 'left' | 'right' }>()
const tagStore = useTagStore()
const itemStore = useItemStore()

const newTagName = ref('')
const tagError = ref('')

// 全局池中尚未声明到本工作区的标签
const undeclared = computed(() => {
  const declaredIds = new Set(tagStore.tags.map((t) => t.id))
  return tagStore.allTags.filter((t) => !declaredIds.has(t.id))
})

/** 当前按标签筛选的状态（点击已声明标签 = 筛选该标签的条目，再点取消） */
const activeTagFilterIds = computed(() => itemStore.filter.tagIds)

async function refresh(): Promise<void> {
  await tagStore.refreshForWorkspace(props.workspaceId)
  await tagStore.refreshAll()
}
onMounted(refresh)
watch(() => props.workspaceId, refresh)

async function createTag(): Promise<void> {
  tagError.value = ''
  if (!newTagName.value.trim()) return
  try {
    await tagStore.create(newTagName.value.trim(), undefined, props.workspaceId)
    newTagName.value = ''
  } catch (e) {
    tagError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">
        标签（本工作区已声明）
      </div>
      <div v-if="activeTagFilterIds.length" class="text-[11px] text-[var(--accent)] mb-1.5">
        已按 {{ activeTagFilterIds.length }} 个标签筛选，点击标签可取消
      </div>
      <div class="flex flex-wrap gap-1 mb-3">
        <button
          v-for="tag in tagStore.tags"
          :key="tag.id"
          class="group inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] cursor-pointer transition-colors"
          :class="
            activeTagFilterIds.includes(tag.id)
              ? 'bg-[var(--accent)] text-white shadow-sm'
              : 'bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-110'
          "
          :title="`${tag.description ?? ''}${activeTagFilterIds.includes(tag.id) ? '（点击取消筛选）' : '（点击筛选此标签的条目）'}`"
          @click="itemStore.toggleTagFilter(tag.id)"
        >
          #{{ tag.name }}
          <span
            class="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-[var(--danger)] inline-flex"
            title="取消声明（不影响已有挂载）"
            @click.stop="tagStore.undeclare(props.workspaceId, tag.id)"
          >
            <Trash2 :size="11" />
          </span>
        </button>
        <span v-if="tagStore.tags.length === 0" class="text-[12px] text-[var(--fg-dim)] w-full">
          未声明任何标签
        </span>
      </div>

      <!-- 新建标签（创建即全局，并自动声明到本工作区） -->
      <div class="flex gap-1.5 mb-3">
        <input
          v-model="newTagName"
          class="input text-[12px] flex-1 min-w-0"
          placeholder="新标签名"
          @keyup.enter="createTag"
        />
        <button class="btn text-[12px]" title="创建并声明到本工作区" @click="createTag">
          <Plus :size="13" />
        </button>
      </div>
      <p v-if="tagError" class="text-[11px] text-[var(--danger)] mb-2">{{ tagError }}</p>

      <!-- 从全局池声明 -->
      <template v-if="undeclared.length">
        <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">从全局标签声明…</div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="tag in undeclared"
            :key="tag.id"
            class="px-2 py-0.5 rounded border border-dashed border-[var(--border)] text-[12px] text-[var(--fg-dim)]
                   hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors"
            :title="tag.description ?? ''"
            @click="tagStore.declare(props.workspaceId, tag.id)"
          >
            +{{ tag.name }}
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useTagStore } from '../../stores/tag'

const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const tagStore = useTagStore()

const newTagName = ref('')
const tagError = ref('')

// 全局池中尚未声明到本工作区的标签
const undeclared = computed(() => {
  const declaredIds = new Set(tagStore.tags.map((t) => t.id))
  return tagStore.allTags.filter((t) => !declaredIds.has(t.id))
})

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
  <div class="px-3 py-3">
    <div class="panel-label mb-2">{{ $t('tags.title') }}</div>
    <!-- 本面板只管声明；按标签筛选的入口在搜索框（输入即出候选） -->
    <div class="flex flex-wrap gap-1 mb-3">
      <span
        v-for="tag in tagStore.tags"
        :key="tag.id"
        class="group inline-flex items-center gap-1 px-2 py-0.5 text-[12px] bg-[var(--accent-soft)] text-[var(--accent)]"
        :title="tag.description ?? ''"
      >
        {{ tag.name }}
        <span
          class="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-[var(--danger)] inline-flex"
          :title="$t('tags.panel.undeclareTitle')"
          @click.stop="tagStore.undeclare(props.workspaceId, tag.id)"
        >
          <Trash2 :size="11" />
        </span>
      </span>
      <span v-if="tagStore.tags.length === 0" class="text-[12px] text-[var(--fg-dim)] w-full">
        {{ $t('tags.panel.empty') }}
      </span>
    </div>

    <!-- 新建标签（创建即全局，并自动声明到本工作区） -->
    <div class="flex gap-1.5 mb-3">
      <input
        v-model="newTagName"
        class="input text-[12px] flex-1 min-w-0"
        :placeholder="$t('tags.newTagName')"
        @keyup.enter="createTag"
      />
      <button class="btn text-[12px]" :title="$t('tags.panel.createAndDeclareTitle')" @click="createTag">
        <Plus :size="13" />
      </button>
    </div>
    <p v-if="tagError" class="text-[11px] text-[var(--danger)] mb-2">{{ tagError }}</p>

    <!-- 从全局池声明 -->
    <template v-if="undeclared.length">
      <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">{{ $t('tags.panel.declareAvailable') }}</div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="tag in undeclared"
          :key="tag.id"
          class="px-2 py-0.5 border border-dashed border-[var(--border)] text-[12px] text-[var(--fg-dim)]
                 hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors"
          :title="tag.description ?? ''"
          @click="tagStore.declare(props.workspaceId, tag.id)"
        >
          {{ tag.name }}
        </button>
      </div>
    </template>
  </div>
</template>

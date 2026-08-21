<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { taghitFileUrl } from '@shared/url'
import type { ItemWithTags } from '@shared/types/item'
import { useTabStore } from '../stores/tab'
import { useTagStore } from '../stores/tag'
import TagChip from '../components/common/TagChip.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const tagStore = useTagStore()

const item = ref<ItemWithTags | null>(null)
const error = ref('')

// 工作区上下文：优先取路由 query（全局搜索结果带入），否则用当前活动工作区标签
const workspaceId = computed(() => {
  const q = Number(route.query.workspace)
  if (Number.isInteger(q) && q > 0) return q
  return tabStore.activeWorkspaceId
})

const mediaSrc = computed(() => {
  if (!item.value?.sourceUri) return null
  return taghitFileUrl(item.value.sourceUri)
})

async function load(): Promise<void> {
  error.value = ''
  if (workspaceId.value == null) {
    error.value = '请先从某个工作区打开条目'
    return
  }
  item.value = await window.api.item.get(Number(props.id), workspaceId.value)
}

onMounted(async () => {
  await load()
  if (workspaceId.value != null) await tagStore.refreshForWorkspace(workspaceId.value)
})

/** 返回 = 关闭当前条目标签，回到活动标签 */
function closeDetail(): void {
  tabStore.close(`item:${props.id}`)
  const active = tabStore.activeTab
  if (active?.kind === 'workspace') router.push(`/workspace/${active.workspaceId}`)
  else if (active?.kind === 'settings') router.push('/settings')
  else if (active?.kind === 'item')
    router.push(`/item/${active.itemId}${active.workspaceId != null ? `?workspace=${active.workspaceId}` : ''}`)
  else router.push('/')
}

async function toggleTag(tagId: number): Promise<void> {
  if (!item.value || workspaceId.value == null) return
  const has = item.value.tags.some((t) => t.id === tagId)
  const updated = await window.api.item.updateTags({
    workspaceId: workspaceId.value,
    itemId: item.value.id,
    addTagIds: has ? [] : [tagId],
    removeTagIds: has ? [tagId] : []
  })
  if (updated) item.value = updated
}

function formatBytes(size: number | null): string {
  if (size == null) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const rows = computed(() => {
  if (!item.value) return []
  const base: Array<[string, string]> = [
    ['类型', item.value.mediaType],
    ['扩展名', item.value.extension ?? '-'],
    ['大小', formatBytes(item.value.size)],
    ['状态', item.value.status],
    ['修改时间', item.value.fileModifiedAt ?? '-'],
    ['路径', item.value.sourceUri ?? '-']
  ]
  for (const m of item.value.metadata ?? []) {
    base.push([m.key, m.value])
  }
  return base
})
</script>

<template>
  <div class="h-full flex min-h-0">
    <!-- 错误：整区居中提示 -->
    <div v-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-[var(--danger)] text-sm">
        {{ error }}
        <button class="btn ml-2" @click="router.push('/')">返回主页</button>
      </div>
    </div>

    <template v-else-if="item">
      <!-- 左：媒体内容（按原始分辨率显示，超出可视区自动等比缩小，无滚动条） -->
      <div class="flex-1 min-w-0 h-full flex items-center justify-center p-4 overflow-hidden bg-black/40">
        <img
          v-if="item.mediaType === 'image' && mediaSrc"
          :src="mediaSrc"
          class="max-w-full max-h-full rounded shadow-lg"
          :alt="item.title"
        />
        <video
          v-else-if="item.mediaType === 'video' && mediaSrc"
          :src="mediaSrc"
          controls
          class="max-w-full max-h-full rounded shadow-lg"
        />
        <audio
          v-else-if="item.mediaType === 'audio' && mediaSrc"
          :src="mediaSrc"
          controls
          class="w-full max-w-xl"
        />
        <span v-else class="text-[var(--fg-dim)] text-sm">无可预览内容</span>
      </div>

      <!-- 右：媒体信息 + 标签（内容页内，替代右侧边栏的"媒体信息"工具） -->
      <div class="w-72 shrink-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elev)]">
        <div class="px-3 py-3">
          <div class="flex items-center gap-2 mb-3">
            <button class="btn" title="关闭此页（返回）" @click="closeDetail">
              <ArrowLeft :size="14" /> 返回
            </button>
            <div class="text-[12px] font-medium truncate flex-1" :title="item.title">
              {{ item.title }}
            </div>
          </div>

          <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">媒体信息</div>
          <dl class="space-y-1 text-[12px] mb-5">
            <div v-for="[k, v] in rows" :key="k" class="flex gap-2">
              <dt class="w-16 shrink-0 text-[var(--fg-dim)] truncate" :title="k">{{ k }}</dt>
              <dd class="break-all min-w-0">{{ v }}</dd>
            </div>
          </dl>

          <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">
            标签（仅当前工作区已声明的可挂载）
          </div>
          <div class="flex flex-wrap gap-1.5">
            <TagChip
              v-for="tag in item.tags"
              :key="tag.id"
              :name="tag.name"
              active
              @click="toggleTag(tag.id)"
            />
            <template v-if="tagStore.tags.length > item.tags.length">
              <TagChip
                v-for="tag in tagStore.tags.filter((t) => !item!.tags.some((it) => it.id === t.id)).slice(0, 12)"
                :key="`add-${tag.id}`"
                :name="`+${tag.name}`"
                @click="toggleTag(tag.id)"
              />
            </template>
          </div>
          <p v-if="item.tags.length === 0" class="text-[11px] text-[var(--fg-dim)] mt-2">
            点击上方「+标签名」添加标签（先在工作区左侧边栏声明需要的标签）
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

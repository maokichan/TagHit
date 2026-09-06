<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@shared/api'
import type { Id } from '@shared/contract'
import { toItemView, type ItemView } from '../lib/viewModel'
import { useTabStore } from '../stores/tab'
import { useTagStore } from '../stores/tag'
import { formatSize } from '../lib/format'
import TagChip from '../components/common/TagChip.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const tagStore = useTagStore()

const item = ref<ItemView | null>(null)
const error = ref('')

// 工作区上下文：优先取路由 query（全局搜索结果带入），否则用当前活动工作区标签
const workspaceId = computed<Id | null>(() => {
  const q = route.query.workspace
  if (typeof q === 'string' && q) return q
  return tabStore.activeWorkspaceId
})

async function load(): Promise<void> {
  error.value = ''
  const hits = await api.items.query({ ids: [props.id] })
  item.value = hits.length ? toItemView(hits[0]) : null
  if (!item.value) error.value = '条目不存在或已被删除'
}

onMounted(async () => {
  await load()
  if (workspaceId.value != null) await tagStore.refreshForWorkspace(workspaceId.value)
})

async function toggleTag(tagId: Id): Promise<void> {
  if (!item.value || workspaceId.value == null) return
  const has = item.value.tags.some((t) => t.id === tagId)
  if (has) await api.items.untag(item.value.id, [tagId])
  else await api.items.tag(item.value.id, [tagId])
  await load()
}

const rows = computed(() => {
  if (!item.value) return []
  return [
    ['类型', item.value.mediaType],
    ['扩展名', item.value.extension ?? '-'],
    ['大小', formatSize(item.value.size)],
    ['状态', item.value.status ?? '-'],
    ['修改时间', item.value.fileModifiedAt ?? '-'],
    ['路径', item.value.sourceUri ?? '-'],
    ['收录时间', item.value.createdAt]
  ] as Array<[string, string]>
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
      <!-- 左：媒体内容。0.2 契约无字节通道：预览区降级为占位（待宿主字节闸门落地） -->
      <div class="flex-1 min-w-0 h-full flex items-center justify-center p-4 overflow-hidden">
        <div class="flex flex-col items-center gap-3 text-[var(--fg-dim)]">
          <span class="text-sm">媒体预览暂不可用</span>
          <span class="text-[11px] max-w-xs text-center leading-relaxed">
            渲染层按纪律拿不到文件字节；图片/视频/文本预览将在宿主"字节闸门"能力落地后恢复。
          </span>
          <span v-if="item.sourceUri" class="text-[11px] kbd max-w-full truncate">{{ item.sourceUri }}</span>
        </div>
      </div>

      <!-- 右：媒体信息 + 标签（内容页内，替代右侧边栏的"媒体信息"工具） -->
      <div class="w-72 shrink-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elev)]">
        <div class="px-3 py-3">
          <div class="text-[13px] font-medium truncate mb-3" :title="item.title">
            {{ item.title }}
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
            <template v-if="workspaceId != null">
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
            </template>
            <template v-else>
              <span
                v-for="tag in item.tags"
                :key="tag.id"
                class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--fg-dim)]"
              >
                #{{ tag.name }}
              </span>
            </template>
          </div>
          <p v-if="item.tags.length === 0 && workspaceId != null" class="text-[11px] text-[var(--fg-dim)] mt-2">
            点击上方「+标签名」添加标签（先在工作区左侧边栏声明需要的标签）
          </p>
          <p v-if="workspaceId == null" class="text-[11px] text-[var(--fg-dim)] mt-2">
            该条目未带工作区上下文，打标请从工作区进入。
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

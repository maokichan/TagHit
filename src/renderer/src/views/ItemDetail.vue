<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { taghitFileUrl } from '@shared/url'
import type { ItemWithTags } from '@shared/types/item'
import { useTabStore } from '../stores/tab'
import { useTagStore } from '../stores/tag'
import { formatSize } from '../lib/format'
import TagChip from '../components/common/TagChip.vue'

/** 文本可预览扩展名（官方功能：L2 静态预览，与主进程 TEXT_EXTS 一致） */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'ts', 'jsx', 'tsx',
  'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'mjs', 'cjs'
])

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const tagStore = useTagStore()

const item = ref<ItemWithTags | null>(null)
const error = ref('')
const textContent = ref<string | null>(null)
const textLoading = ref(false)
const systemError = ref('')

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

/** 是否可文本预览（document 类且扩展名在文本集合内） */
const isTextPreviewable = computed(() => {
  const ext = item.value?.extension?.toLowerCase()
  return item.value?.mediaType === 'document' && ext != null && TEXT_EXTENSIONS.has(ext)
})

// 条目变化时加载/清空文本预览
watch(isTextPreviewable, async (previewable) => {
  if (previewable && item.value) {
    textLoading.value = true
    try {
      textContent.value = (await window.api.item.readText(item.value.id))?.text ?? null
    } catch {
      textContent.value = null
    } finally {
      textLoading.value = false
    }
  } else {
    textContent.value = null
  }
})

/** 用系统关联应用打开（L0/L1 预览兜底：组织归 TagHit，打开归系统） */
async function openWithSystem(): Promise<void> {
  if (!item.value) return
  systemError.value = ''
  try {
    await window.api.item.openWithSystem(item.value.id)
  } catch (e) {
    systemError.value = e instanceof Error ? e.message : String(e)
  }
}

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

const rows = computed(() => {
  if (!item.value) return []
  const base: Array<[string, string]> = [
    ['类型', item.value.mediaType],
    ['扩展名', item.value.extension ?? '-'],
    ['大小', formatSize(item.value.size)],
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
      <!-- 左：媒体内容（靠左，自动缩放适应最大边界；无固定背景容器，图片/视频融入页面） -->
      <div class="flex-1 min-w-0 h-full flex items-center justify-start p-4 overflow-hidden">
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
        <div v-else-if="isTextPreviewable" class="w-full h-full overflow-auto p-4">
          <pre
            class="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono text-left"
          >{{ textLoading ? '加载中…' : (textContent ?? '（文件过大或无法读取）') }}</pre>
        </div>
        <div v-else class="flex flex-col items-center gap-3">
          <span class="text-[var(--fg-dim)] text-sm">无可预览内容</span>
          <button class="btn" title="用系统关联应用打开此文件" @click="openWithSystem">
            在系统中打开
          </button>
          <span v-if="systemError" class="text-[11px] text-[var(--danger)]">{{ systemError }}</span>
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

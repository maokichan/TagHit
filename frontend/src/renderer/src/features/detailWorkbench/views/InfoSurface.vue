<script setup lang="ts">
/**
 * 信息面视图：文件事实（节拍折叠：常显一行骨架，长尾收折叠节）+ 标签区（编辑模式门控，D38）。
 * 自持的状态：折叠展开态、标签搜索词、共现统计——均挂 config / 本组件，不落工作台。
 * 打标/摘除走骨架的 toggleTag（改库 + 刷新当前条目，单源）；数据出自工作台上下文。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, Search } from 'lucide-vue-next'
import { api } from '@shared/api'
import type { Id } from '@shared/contract'
import { useConfigStore } from '../../../stores/config'
import { useTagStore } from '../../../stores/tag'
import { openTagTab } from '../../tabs'
import { formatDate, formatSize } from '../../../lib/format'
import { suggestTags } from '../../../lib/tagSuggest'
import TagChip from '../../../components/common/TagChip.vue'
import { useDetailWorkbenchContext } from '../context'

const ctx = useDetailWorkbenchContext()
const config = useConfigStore()
const tagStore = useTagStore()

const workspaceId = computed(() => ctx.workspaceId)

const MEDIA_LABEL: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  other: '其他'
}
const STATUS_LABEL: Record<string, string> = { active: '正常', missing: '缺失' }

/**
 * 节拍折叠：常显一行骨架（类型 · 尺寸 · 大小），长尾事实收进折叠节——
 * 翻页会重挂组件，展开态挂配置（跨翻页保持）。
 */
const factsOpen = ref<boolean>(config.value('shell', 'detailFactsOpen', false))
function toggleFacts(): void {
  factsOpen.value = !factsOpen.value
  config.setValue('shell', 'detailFactsOpen', factsOpen.value)
}

const rows = computed(() => {
  const item = ctx.item
  return [
    ['类型', MEDIA_LABEL[item.mediaType] ?? item.mediaType],
    ['扩展名', item.extension ?? '-'],
    [
      '尺寸',
      item.width != null && item.height != null ? `${item.width} × ${item.height}` : '-'
    ],
    ['大小', formatSize(item.size)],
    ['状态', item.status == null ? '-' : STATUS_LABEL[item.status]],
    ['修改时间', formatDate(item.fileModifiedAt)],
    ['路径', item.sourceUri ?? '-'],
    ['收录时间', formatDate(item.createdAt)]
  ] as Array<[string, string]>
})
const factSummary = computed(() => {
  const item = ctx.item
  const parts = [MEDIA_LABEL[item.mediaType] ?? item.mediaType]
  if (item.width != null && item.height != null) {
    parts.push(`${item.width} × ${item.height}`)
  }
  parts.push(formatSize(item.size))
  return parts.join(' · ')
})
const factRows = computed(() => rows.value.filter(([k]) => k !== '类型' && k !== '尺寸' && k !== '大小'))

/**
 * 标签池与共现统计：**打开瞬间固化的顺序上下文里的工作区**（不是"当前活动工作区"）。
 * 统计是打标候选的排序增强（lib/tagSuggest——取不到就退回名单原名序）。
 */
const tagQuery = ref('')
// 退出编辑模式即清搜索词（原骨架职责；视图自持——避免下次进入带着陈旧候选）
watch(
  () => ctx.editing,
  (editing) => {
    if (!editing) tagQuery.value = ''
  }
)
const cooccurPairs = ref<Map<string, number>>(new Map())
onMounted(async () => {
  const ws = workspaceId.value
  if (ws == null) return
  await tagStore.refreshForWorkspace(ws)
  try {
    const pairs = await api.tags.pairStats({ workspaceId: ws, kind: 'cooccur', limit: 500 })
    cooccurPairs.value = new Map(pairs.map((p) => [`${p.a}|${p.b}`, p.together]))
  } catch {
    cooccurPairs.value = new Map()
  }
})
const togetherOf = (a: Id, b: Id): number => {
  if (a === b) return 0
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  return cooccurPairs.value.get(key) ?? 0
}
const tagMatches = computed(() =>
  suggestTags({
    candidates: tagStore.tags,
    assignedIds: (ctx.item.tags ?? []).map((t) => t.id),
    query: tagQuery.value,
    together: togetherOf,
    limit: 12
  })
)

/** chip 显示速打键号（"3·风景"），映射配置在标签全页。 */
const pinnedDigits = computed(() => {
  const ws = workspaceId.value
  if (ws == null) return new Map<Id, number>()
  const pins = config.value('tags', `pinned:${ws}`, []) as Array<Id | null>
  const map = new Map<Id, number>()
  pins.forEach((tid, i) => {
    if (tid != null) map.set(tid, i + 1)
  })
  return map
})
const chipName = (t: { id: Id; name: string }): string => {
  const d = pinnedDigits.value.get(t.id)
  return d != null ? `${d}·${t.name}` : t.name
}

async function toggleTag(tagId: Id): Promise<void> {
  await ctx.toggleTag(tagId)
}

/** 编辑模式下输入即搜：Enter 打上第一个候选（连续打标时手不离键盘）。 */
async function applyFirstMatch(): Promise<void> {
  const first = tagMatches.value[0]
  if (first == null) return
  await toggleTag(first.id)
  tagQuery.value = ''
}

/**
 * 双击 chip → 标签主页（新标签页；阅读/编辑两态同口径——双击=打开是应用既有词汇）。
 * 工作区上下文随本页固化：主页的共现口径与来处一致。
 */
function openProfile(t: { id: Id; name: string }): void {
  openTagTab(t.id, t.name, workspaceId.value)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="px-4 py-3">
      <!-- 文件事实：常显一行骨架，长尾折叠（节拍折叠；展开态挂配置，翻页不丢） -->
      <button
        class="section-head w-full"
        :data-open="factsOpen ? 'true' : 'false'"
        :aria-expanded="factsOpen"
        @click="toggleFacts"
      >
        <ChevronDown :size="11" />
        媒体信息
      </button>
      <div class="text-[12px] mt-1.5">{{ factSummary }}</div>
      <dl v-if="factsOpen" class="space-y-1 text-[12px] mt-2">
        <div v-for="[k, v] in factRows" :key="k" class="flex gap-2">
          <dt class="w-16 shrink-0 text-[var(--fg-dim)] truncate" :title="k">{{ k }}</dt>
          <dd class="break-all min-w-0">{{ v }}</dd>
        </div>
      </dl>

      <div class="divider my-3"></div>

      <div class="flex items-center gap-2 mb-2 min-h-5">
        <div class="panel-label">标签</div>
        <template v-if="workspaceId != null">
          <span v-if="ctx.editing" class="text-[11px] text-[var(--accent)]">编辑中</span>
          <span
            class="kbd ml-auto"
            :title="ctx.editing ? '退出编辑模式' : '进入编辑模式：点标签打上/摘除'"
          >
            Ctrl+E
          </span>
          <span class="text-[11px] text-[var(--fg-dim)]">{{ ctx.editing ? '完成' : '编辑' }}</span>
        </template>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <template v-if="workspaceId != null && ctx.editing">
          <TagChip
            v-for="tag in ctx.item.tags"
            :key="tag.id"
            :name="chipName(tag)"
            active
            @click="toggleTag(tag.id)"
            @dblclick="openProfile(tag)"
          />
          <template v-if="tagMatches.length">
            <TagChip
              v-for="tag in tagMatches"
              :key="`add-${tag.id}`"
              :name="chipName(tag)"
              @click="toggleTag(tag.id)"
              @dblclick="openProfile(tag)"
            />
          </template>
        </template>
        <!-- 阅读态：词元去框化（P6 一页一重心——形态即状态，不可改就不长可改的样子） -->
        <template v-else>
          <button
            v-for="tag in ctx.item.tags"
            :key="tag.id"
            class="chip--text"
            :title="'双击打开标签主页'"
            @dblclick="openProfile(tag)"
          >
            {{ tag.name }}
          </button>
        </template>
      </div>

      <!-- 编辑模式下输入即搜：Enter 打上第一个候选（连续打标时手不离键盘） -->
      <div v-if="workspaceId != null && ctx.editing" class="relative mt-2">
        <Search :size="12" class="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          v-model="tagQuery"
          class="input w-full pl-7 py-1 text-[12px]"
          placeholder="搜标签"
          @keydown.enter.prevent="applyFirstMatch"
        />
      </div>
      <p v-if="workspaceId == null" class="text-[11px] text-[var(--fg-dim)] mt-2">
        从工作区打开可打标
      </p>
    </div>
  </div>
</template>

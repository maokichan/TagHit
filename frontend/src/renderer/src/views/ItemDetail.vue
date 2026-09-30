<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, File, Film, Image as ImageIcon, Music, FileText, Search } from 'lucide-vue-next'
import { api } from '@shared/api'
import type { Id, ItemContext, ItemWindowResult } from '@shared/contract'
import { toItemView, type ItemView } from '../lib/viewModel'
import { previewKindOf, taghitFileUrl, type PreviewKind } from '../lib/media'
import { useTabStore, type ItemTab } from '../stores/tab'
import { useTagStore } from '../stores/tag'
import { itemRoute, resolveItemContext } from '../features/tabs'
import { windowNav } from '../features/windowNav'
import { registerDetailNav } from '../features/detailNav'
import { formatSize } from '../lib/format'
import TagChip from '../components/common/TagChip.vue'
import ItemFilmstrip from '../components/item/ItemFilmstrip.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const tagStore = useTagStore()

const item = ref<ItemView | null>(null)
const error = ref('')

// ---- 顺序上下文 + 顺序窗口（相册式浏览：翻页与前后预览） ----------------------
/**
 * 顺序上下文：**标签项优先**（打开详情页那一刻固化，见 tab 的 ItemTab）→ 路由 query →
 * 补齐标签项的工作区。解析规则是纯函数（features/routes.ts），有断言盯着：
 * 尤其是"标签项没有 context 时**不得**退成跨工作区全库"——那会让方向键在整库里乱跳。
 */
const context = computed<ItemContext>(() => {
  const tab = tabStore.tabs.find(
    (t): t is ItemTab => t.kind === 'item' && t.itemId === props.id
  )
  return resolveItemContext(tab ?? null, route.query as Record<string, unknown>)
})

const win = ref<ItemWindowResult | null>(null)
/** 窗口请求失败的原因（**不许**把失败伪装成"没有序列"：那会把一次报错显示成功能缺失）。 */
const winError = ref<string | null>(null)
let winSeq = 0
const windowViews = computed<ItemView[]>(() => (win.value?.items ?? []).map(toItemView))
const index = computed(() => win.value?.index ?? -1)
const total = computed(() => win.value?.total ?? 0)
/**
 * 切片内定位：**切片位置 = index − from**（窗口是"锚条目 ± radius"的切片，index 是序列位置）。
 * 直接拿 index 索引切片会跳张、越界（实机症状："前十张正常，然后跳到第十四张，之后按键没反应"）。
 */
const nav = computed(() =>
  windowNav(
    win.value == null
      ? null
      : { index: win.value.index, from: win.value.from, count: win.value.items.length }
  )
)
const prev = computed<ItemView | null>(() =>
  nav.value.prev != null ? (windowViews.value[nav.value.prev] ?? null) : null
)
const next = computed<ItemView | null>(() =>
  nav.value.next != null ? (windowViews.value[nav.value.next] ?? null) : null
)

async function loadWindow(): Promise<void> {
  const seq = ++winSeq
  try {
    const res = await api.items.window(props.id, context.value)
    if (seq !== winSeq) return
    win.value = res
    winError.value = null
  } catch (e) {
    if (seq !== winSeq) return
    win.value = null
    winError.value = e instanceof Error ? e.message : String(e)
    console.error('[detail] 顺序窗口加载失败：', e)
  }
}

/**
 * 进度文案：正常走"当前视图序列"；若锚条目不在该序列里（关键词已变、跨工作区打开、
 * 无节点归属…），用例会退到"全部素材"并回报 `loose`——**如实说明**，不给死胡同。
 * 连全部素材里都没有（锚条目=非内容）才是真的没有序列。
 */
const progressText = computed(() => {
  if (winError.value != null) return '序列不可用'
  if (index.value < 0) return '非内容条目 · 无浏览序列'
  const base = `第 ${index.value + 1} / ${total.value}`
  return win.value?.loose === true ? `${base}（已按全部素材）` : base
})

const progressTitle = computed(() => {
  if (winError.value != null) return `顺序窗口加载失败：${winError.value}`
  if (index.value < 0) {
    return '锚条目（承接作品标签的空条目）不是内容，任何浏览序列都不含它'
  }
  return win.value?.loose === true
    ? '该条目不在打开时的视图序列里（关键词已变 / 跨工作区 / 无节点归属），已退到「全部素材」顺序'
    : `当前视图顺序：第 ${index.value + 1} 张，共 ${total.value} 张`
})

/**
 * 翻页：在当前条目标签内换内容（**不新开标签**——翻十张就是十个标签），
 * 路由用 replace（同一次浏览不写历史；侧键返回回到来处的网格/搜索）。
 * 打标导致当前条目退出视图时**当前页不跳**：窗口只在翻页时按新集合重算。
 */
function go(target: ItemView | null): void {
  if (target == null) return
  tabStore.flipItemTab(props.id, target.id, target.title)
  void router.replace(itemRoute(target.id, context.value))
}

function pickById(id: string): void {
  go(windowViews.value.find((v) => v.id === id) ?? null)
}

/** 相邻张预取：翻页跟手的关键（图片按原图预热解码，视频/文本按需加载）。 */
watch([prev, next], () => {
  for (const v of [next.value, prev.value]) {
    if (v != null && v.mediaType === 'image' && v.sourceUri != null) {
      const img = new Image()
      img.src = taghitFileUrl(v.sourceUri)
    }
  }
})

// ---- 字节闸门：内嵌预览 -----------------------------------------------------
const previewKind = computed<PreviewKind>(() =>
  item.value ? previewKindOf(item.value.mediaType, item.value.extension) : 'none'
)
const mediaUrl = computed(() =>
  item.value?.sourceUri ? taghitFileUrl(item.value.sourceUri) : null
)
const textContent = ref<{ text: string; truncated: boolean } | null>(null)
const textLoading = ref(false)
const textUnavailable = ref(false)
const previewFailed = ref(false)

// 兜底占位图标（音频兜底也要用）
const iconMap: Record<string, Component> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  other: File
}
const TypeIcon = computed(() => iconMap[item.value?.mediaType ?? 'other'] ?? File)

async function loadText(): Promise<void> {
  textContent.value = null
  textUnavailable.value = false
  if (!item.value || previewKind.value !== 'text') return
  textLoading.value = true
  try {
    textContent.value = await api.items.readText(item.value.id)
    if (textContent.value === null) textUnavailable.value = true
  } catch {
    textUnavailable.value = true
  } finally {
    textLoading.value = false
  }
}
watch(() => item.value?.id, () => {
  previewFailed.value = false
  void loadText()
})

/**
 * 标签池：**打开瞬间固化的顺序上下文里的工作区**（不是"当前活动工作区"——
 * 详情页成为活动标签后活动工作区即为空）。标签池在标题栏标明，翻页不随之改变。
 */
const workspaceId = computed<Id | null>(() => context.value.workspaceId ?? null)

async function load(): Promise<void> {
  error.value = ''
  try {
    const hits = await api.items.query({ ids: [props.id] })
    item.value = hits.length ? toItemView(hits[0]) : null
    if (!item.value) error.value = '条目不存在或已被删除'
  } catch (e) {
    item.value = null
    error.value = e instanceof Error ? e.message : String(e)
  }
}

let disposeNav: (() => void) | null = null

onMounted(async () => {
  await load()
  await loadWindow()
  if (workspaceId.value != null) await tagStore.refreshForWorkspace(workspaceId.value)
  // 翻页是命令（快捷键 = 命令注册表的视图）：实现在这里，登记到桥供命令调用
  disposeNav = registerDetailNav({ prev: () => go(prev.value), next: () => go(next.value) })
})

onBeforeUnmount(() => {
  disposeNav?.()
  disposeNav = null
})

watch(
  () => props.id,
  async () => {
    winSeq++ // 作废进行中的窗口请求（快速连翻时只认最后一次）
    await load()
    await loadWindow()
  }
)

async function toggleTag(tagId: Id): Promise<void> {
  if (!item.value || workspaceId.value == null) return
  const has = item.value.tags.some((t) => t.id === tagId)
  if (has) await api.items.untag(item.value.id, [tagId])
  else await api.items.tag(item.value.id, [tagId])
  await load() // 打标后当前页不跳：窗口不重算，翻页时才按新集合取邻居
}

/** 标签搜索：输入即过滤候选（未挂载的那些），Enter 打上第一个。 */
const tagQuery = ref('')
const tagMatches = computed(() => {
  const q = tagQuery.value.trim().toLowerCase()
  const assigned = new Set((item.value?.tags ?? []).map((t) => t.id))
  return tagStore.tags
    .filter((t) => !assigned.has(t.id) && (q === '' || t.name.toLowerCase().includes(q)))
    .slice(0, 12)
})

async function applyFirstMatch(): Promise<void> {
  const first = tagMatches.value[0]
  if (first == null) return
  await toggleTag(first.id)
  tagQuery.value = ''
}

const rows = computed(() => {
  if (!item.value) return []
  return [
    ['类型', item.value.mediaType],
    ['扩展名', item.value.extension ?? '-'],
    [
      '尺寸',
      item.value.width != null && item.value.height != null
        ? `${item.value.width} × ${item.value.height}`
        : '-'
    ],
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
      <!-- 左列：标题与进度 → 媒体（两侧翻页）→ 前后预览条 -->
      <div class="flex-1 min-w-0 h-full flex flex-col">
        <!-- 顶：标题 + 位置；相册式浏览的"我在哪、还有多少" -->
        <div class="h-9 shrink-0 flex items-center gap-3 px-3 border-b border-[var(--border)]">
          <div class="text-[12px] font-medium truncate min-w-0" :title="item.title">
            {{ item.title }}
          </div>
          <span
            v-if="index >= 0"
            class="text-[11px] text-[var(--fg-dim)] shrink-0"
            :title="progressTitle"
          >
            {{ progressText }}
          </span>
          <span v-else class="text-[11px] text-[var(--fg-dim)] shrink-0" :title="progressTitle">
            {{ progressText }}
          </span>
        </div>

        <!-- 中：媒体内容（字节闸门：媒体经 taghit-file 协议，文本经窄桥 readText） -->
        <div class="flex-1 min-h-0 relative flex items-center justify-center p-4 overflow-hidden">
          <button
            class="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
            :disabled="prev == null"
            :title="prev != null ? `上一张：${prev.title}（← / PgUp）` : '已是第一张'"
            @click="go(prev)"
          >
            <ChevronLeft :size="18" />
          </button>

          <!-- 图片 -->
          <img
            v-if="previewKind === 'image' && mediaUrl"
            :key="item.id"
            :src="mediaUrl"
            :alt="item.title"
            class="max-w-full max-h-full object-contain rounded-md shadow-lg"
            @error="previewFailed = true"
          />
          <!-- 视频 -->
          <video
            v-else-if="previewKind === 'video' && mediaUrl && !previewFailed"
            :key="item.id"
            :src="mediaUrl"
            controls
            class="max-w-full max-h-full rounded-md shadow-lg bg-black"
            @error="previewFailed = true"
          ></video>
          <!-- 音频 -->
          <div v-else-if="previewKind === 'audio' && mediaUrl && !previewFailed" class="w-full max-w-md flex flex-col items-center gap-4">
            <component :is="TypeIcon" :size="72" class="text-[var(--fg-dim)]" />
            <audio :key="item.id" :src="mediaUrl" controls class="w-full" @error="previewFailed = true"></audio>
          </div>
          <!-- 文本 -->
          <div v-else-if="previewKind === 'text'" class="w-full h-full flex flex-col min-h-0">
            <div v-if="textLoading" class="flex-1 flex items-center justify-center text-[var(--fg-dim)] text-sm">读取中…</div>
            <template v-else-if="textContent">
              <div v-if="textContent.truncated" class="text-[11px] text-[var(--warning, #e5a23c)] px-2 py-1">
                文件超过 2 MiB，仅显示前段内容
              </div>
              <pre class="flex-1 min-h-0 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap break-all bg-[var(--bg)] rounded-md border border-[var(--border)] p-3">{{ textContent.text }}</pre>
            </template>
            <div v-else class="flex-1 flex items-center justify-center text-[var(--fg-dim)] text-sm">
              {{ textUnavailable ? '文本读取失败（文件可能已移动或被占用）' : '读取中…' }}
            </div>
          </div>
          <!-- 兜底占位：无预览形态 / 媒体解码失败 -->
          <div v-else class="flex flex-col items-center gap-3 text-[var(--fg-dim)]">
            <component :is="TypeIcon" :size="56" />
            <span class="text-sm">
              {{ previewFailed ? '该格式无法内嵌预览' : '此类型暂无内嵌预览' }}
            </span>
            <span v-if="item.sourceUri" class="text-[11px] kbd max-w-full truncate">{{ item.sourceUri }}</span>
          </div>

          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
            :disabled="next == null"
            :title="next != null ? `下一张：${next.title}（→ / PgDn）` : '已是最后一张'"
            @click="go(next)"
          >
            <ChevronRight :size="18" />
          </button>
        </div>

        <!-- 底：前后各 6 张预览（点击即跳到那张；顺序与翻页同源） -->
        <ItemFilmstrip
          v-if="windowViews.length > 0"
          :items="windowViews"
          :current-id="item.id"
          @pick="pickById"
        />
      </div>

      <!-- 右：媒体信息 + 标签（内容页内，替代右侧边栏的"媒体信息"工具） -->
      <div class="w-72 shrink-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elev)]">
        <div class="px-3 py-3">
          <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">媒体信息</div>
          <dl class="space-y-1 text-[12px] mb-5">
            <div v-for="[k, v] in rows" :key="k" class="flex gap-2">
              <dt class="w-16 shrink-0 text-[var(--fg-dim)] truncate" :title="k">{{ k }}</dt>
              <dd class="break-all min-w-0">{{ v }}</dd>
            </div>
          </dl>

          <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">
            标签
            <span v-if="workspaceId != null" class="normal-case tracking-normal">（标签池：当前工作区已声明的）</span>
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
              <template v-if="tagMatches.length">
                <TagChip
                  v-for="tag in tagMatches"
                  :key="`add-${tag.id}`"
                  :name="tag.name"
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
                {{ tag.name }}
              </span>
            </template>
          </div>

          <!-- 输入即搜：Enter 打上第一个候选（连续打标时手不离键盘） -->
          <div v-if="workspaceId != null" class="relative mt-2">
            <Search :size="12" class="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
            <input
              v-model="tagQuery"
              class="input w-full pl-7 py-1 text-[12px]"
              placeholder="搜标签，Enter 打上"
              @keydown.enter.prevent="applyFirstMatch"
            />
          </div>
          <p v-if="item.tags.length === 0 && workspaceId != null" class="text-[11px] text-[var(--fg-dim)] mt-2">
            点击上方「+标签名」或搜标签后回车即可打标（标签池 = 打开详情页时那个工作区已声明的标签）。
          </p>
          <p v-if="workspaceId == null" class="text-[11px] text-[var(--fg-dim)] mt-2">
            该条目未带工作区上下文（从全局搜索进入）——打标请从工作区进入。
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

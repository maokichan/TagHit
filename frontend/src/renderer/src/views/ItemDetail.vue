<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ChevronLeft, ChevronRight, File, Film, Image as ImageIcon, Music, FileText, Search } from 'lucide-vue-next'
import { api } from '@shared/api'
import type { Id, ItemContext, ItemWindowResult } from '@shared/contract'
import { toItemView, type ItemView } from '../lib/viewModel'
import { taghitFileUrl } from '../lib/media'
import { useTabStore, type ItemTab } from '../stores/tab'
import { useConfigStore } from '../stores/config'
import { useTagStore } from '../stores/tag'
import { itemRoute, resolveItemContext, openTagTab } from '../features/tabs'
import { resolveDetailPreview } from '../features/detailPreview'
import { windowNav } from '../features/windowNav'
import { registerDetailNav } from '../features/detailNav'
import { showToast } from '../features/services/dialog'
import { formatDate, formatSize } from '../lib/format'
import { suggestTags } from '../lib/tagSuggest'
import TagChip from '../components/common/TagChip.vue'
import ItemFilmstrip from '../components/item/ItemFilmstrip.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()
const tagStore = useTagStore()
const config = useConfigStore()

const item = ref<ItemView | null>(null)
const error = ref('')

// ---- 顺序上下文 + 顺序窗口（相册式浏览：翻页与前后预览） ----------------------
/**
 * 顺序上下文：**标签项优先**（打开详情页那一刻固化，见 tab 的 ItemTab）→ 路由 query →
 * 补齐标签项的工作区。解析规则是纯函数（features/routes.ts），有断言盯着：
 * 尤其是"标签项没有 context 时**不得**退成跨工作区全库"——那会让方向键在整库里乱跳。
 */
/** 本条目的标签项 = 详情页**会话**：编辑模式等会话态挂在它身上（见 stores/tab.ts ItemTab）。 */
const itemTab = computed<ItemTab | null>(
  () => tabStore.tabs.find((t): t is ItemTab => t.kind === 'item' && t.itemId === props.id) ?? null
)

const context = computed<ItemContext>(() =>
  resolveItemContext(itemTab.value, route.query as Record<string, unknown>)
)

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
      // 连解码缓存一起焐热：翻页时 decode() 近乎即时，画面不用等
      void img.decode().catch(() => {})
    }
  }
})

// ---- 内嵌预览（detailPreview 贡献点，D37）-----------------------------------
// 预览区是槽：内置四类为默认提供方，功能组件可按媒体形态认领替换（音频播放器是首个消费方）。
// 加载/失败/缩放等渲染内状态归提供方自治；详情页只管"谁来渲染"与翻页导航。
const preview = computed(() => (item.value ? resolveDetailPreview(item.value) : null))

// 兜底占位图标（无人认领的条目形态）
const iconMap: Record<string, Component> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  other: File
}
const TypeIcon = computed(() => iconMap[item.value?.mediaType ?? 'other'] ?? File)

/**
 * 标签池：**打开瞬间固化的顺序上下文里的工作区**（不是"当前活动工作区"——
 * 详情页成为活动标签后活动工作区即为空）。标签池在标题栏标明，翻页不随之改变。
 */
const workspaceId = computed<Id | null>(() => context.value.workspaceId ?? null)

/**
 * 编辑模式（Ctrl+E 双向切换）：阅读态的标签区是**静态**的（防误触），修改类动作
 * （点 chip 打标/摘除、搜标签、数字速打）只在编辑模式可用；无工作区上下文不可编辑。
 * 模式态挂在条目标签项上——翻页保持（一份打完是下一件），新开详情回到阅读态。
 */
const editing = computed(() => itemTab.value?.editing === true)

function toggleEdit(): void {
  const tab = itemTab.value
  if (tab == null || workspaceId.value == null) return
  tab.editing = !tab.editing
  if (!tab.editing) tagQuery.value = ''
}

/**
 * 双击 chip → 标签主页（新标签页；阅读/编辑两态同口径——双击=打开是应用既有词汇）。
 * 工作区上下文随本页固化：主页的共现口径与来处一致。
 */
function openProfile(t: { id: Id; name: string }): void {
  openTagTab(t.id, t.name, workspaceId.value)
}

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
  // 条目与顺序窗口并行取（翻页路径同理）：串行要过两趟 IPC，白等一截
  await Promise.all([load(), loadWindow()])
  if (workspaceId.value != null) {
    await Promise.all([tagStore.refreshForWorkspace(workspaceId.value), loadCooccur(workspaceId.value)])
  }
  // 翻页是命令（快捷键 = 命令注册表的视图）：实现在这里，登记到桥供命令调用
  disposeNav = registerDetailNav({
    prev: () => go(prev.value),
    next: () => go(next.value),
    workspaceId: workspaceId.value ?? undefined,
    toggleTag: (tagId) => toggleTag(tagId),
    toggleEdit,
    isEditing: () => editing.value
  })
})

onBeforeUnmount(() => {
  disposeNav?.()
  disposeNav = null
})

watch(
  () => props.id,
  async () => {
    winSeq++ // 作废进行中的窗口请求（快速连翻时只认最后一次）
    await Promise.all([load(), loadWindow()])
  }
)

async function toggleTag(tagId: Id): Promise<void> {
  if (!item.value || workspaceId.value == null) return
  const has = item.value.tags.some((t) => t.id === tagId)
  try {
    if (has) await api.items.untag(item.value.id, [tagId])
    else await api.items.tag(item.value.id, [tagId])
  } catch (e) {
    // 失败不静默：打标失败（如扫描进行中的嵌套事务受限）若无提示就是"点了没反应"
    showToast(e instanceof Error ? e.message : String(e), 'error')
    return
  }
  await load() // 打标后当前页不跳：窗口不重算，翻页时才按新集合取邻居
}

/**
 * 标签搜索候选：未挂载 + 关键字过滤，**按相关性排序**（与该条目已有标签的共现强度，
 * 见 lib/tagSuggest——排序是增强：统计取不到就退回名单原名序）。Enter 打上第一个。
 */
const tagQuery = ref('')
const cooccurPairs = ref<Map<string, number>>(new Map())
async function loadCooccur(ws: Id): Promise<void> {
  try {
    const pairs = await api.tags.pairStats({ workspaceId: ws, kind: 'cooccur', limit: 500 })
    cooccurPairs.value = new Map(pairs.map((p) => [`${p.a}|${p.b}`, p.together]))
  } catch {
    cooccurPairs.value = new Map()
  }
}
const togetherOf = (a: Id, b: Id): number => {
  if (a === b) return 0
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  return cooccurPairs.value.get(key) ?? 0
}
const tagMatches = computed(() =>
  suggestTags({
    candidates: tagStore.tags,
    assignedIds: (item.value?.tags ?? []).map((t) => t.id),
    query: tagQuery.value,
    together: togetherOf,
    limit: 12
  })
)

/** chip 显示速打键号（"3·风景"），映射配置在标签全页。 */
const pinnedDigits = computed(() => {
  if (workspaceId.value == null) return new Map<Id, number>()
  const pins = config.value('tags', `pinned:${workspaceId.value}`, []) as Array<Id | null>
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

async function applyFirstMatch(): Promise<void> {
  const first = tagMatches.value[0]
  if (first == null) return
  await toggleTag(first.id)
  tagQuery.value = ''
}

const rows = computed(() => {
  if (!item.value) return []
  return [
    ['类型', MEDIA_LABEL[item.value.mediaType] ?? item.value.mediaType],
    ['扩展名', item.value.extension ?? '-'],
    [
      '尺寸',
      item.value.width != null && item.value.height != null
        ? `${item.value.width} × ${item.value.height}`
        : '-'
    ],
    ['大小', formatSize(item.value.size)],
    ['状态', item.value.status == null ? '-' : STATUS_LABEL[item.value.status]],
    ['修改时间', formatDate(item.value.fileModifiedAt)],
    ['路径', item.value.sourceUri ?? '-'],
    ['收录时间', formatDate(item.value.createdAt)]
  ] as Array<[string, string]>
})

// ── 信息栏（P6 样板）：一页一重心（媒体），栏是支撑信息的连续表面 ──
/**
 * 宽度即身份：栏宽由用户按内容调（拖左缘手柄），配置持久化——不在代码里拍一个固定宽度。
 * 几何是数据（:style），手柄外观在样式表（P1）。
 */
const railWidth = ref<number>(config.value('shell', 'detailRailWidth', 288))
let railDrag: { startX: number; startW: number } | null = null
function onRailResizeDown(e: PointerEvent): void {
  railDrag = { startX: e.clientX, startW: railWidth.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onRailResizeMove(e: PointerEvent): void {
  if (railDrag == null) return
  railWidth.value = Math.min(460, Math.max(220, railDrag.startW + (railDrag.startX - e.clientX)))
}
function onRailResizeUp(e: PointerEvent): void {
  if (railDrag == null) return
  railDrag = null
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  config.setValue('shell', 'detailRailWidth', railWidth.value)
}

/**
 * 节拍折叠：常显一行骨架（类型 · 尺寸 · 大小），长尾事实收进折叠节——
 * 翻页会重挂组件，展开态挂配置（跨翻页保持）。
 */
const factsOpen = ref<boolean>(config.value('shell', 'detailFactsOpen', false))
function toggleFacts(): void {
  factsOpen.value = !factsOpen.value
  config.setValue('shell', 'detailFactsOpen', factsOpen.value)
}
const factSummary = computed(() => {
  if (!item.value) return ''
  const parts = [MEDIA_LABEL[item.value.mediaType] ?? item.value.mediaType]
  if (item.value.width != null && item.value.height != null) {
    parts.push(`${item.value.width} × ${item.value.height}`)
  }
  parts.push(formatSize(item.value.size))
  return parts.join(' · ')
})
const factRows = computed(() => rows.value.filter(([k]) => k !== '类型' && k !== '尺寸' && k !== '大小'))

const MEDIA_LABEL: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  other: '其他'
}
const STATUS_LABEL: Record<string, string> = { active: '正常', missing: '缺失' }
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

        <!-- 中：媒体内容（detailPreview 贡献点：提供方认领渲染、状态自持；翻页导航仍是详情页的职责） -->
        <div class="flex-1 min-h-0 relative flex items-center justify-center p-4 overflow-hidden">
          <button
            class="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
            :disabled="prev == null"
            :title="prev != null ? `上一张：${prev.title}（← / PgUp）` : '已是第一张'"
            @click="go(prev)"
          >
            <ChevronLeft :size="18" />
          </button>

          <!-- 提供方渲染（认领制；无人认领 → 占位）。item 变化由提供方自watch（缩放复位/换源各自治理） -->
          <component :is="preview.component" v-if="preview" :item="item" />
          <div v-else class="flex flex-col items-center gap-3 text-[var(--fg-dim)]">
            <component :is="TypeIcon" :size="56" />
            <span class="text-sm">此类型暂无内嵌预览</span>
            <span v-if="item.sourceUri" class="text-[11px] kbd max-w-full truncate">{{ item.sourceUri }}</span>
          </div>

          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--bg-elev)] border border-[var(--border)] hover:border-[var(--fg-dim)] disabled:opacity-30 disabled:cursor-default"
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

      <!-- 右：信息栏（P6 样板：一整块连续表面，节头 + 发丝线分节；左缘可拖宽，宽度持久化） -->
      <div
        class="relative shrink-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elev)]"
        :style="{ width: railWidth + 'px' }"
      >
        <div
          class="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--accent-border)]"
          role="separator"
          aria-label="拖动调整信息栏宽度"
          title="拖动调整栏宽"
          @pointerdown="onRailResizeDown"
          @pointermove="onRailResizeMove"
          @pointerup="onRailResizeUp"
        ></div>
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
              <span v-if="editing" class="text-[11px] text-[var(--accent)]">编辑中</span>
              <span
                class="kbd ml-auto"
                :title="editing ? '退出编辑模式' : '进入编辑模式：点标签打上/摘除'"
              >
                Ctrl+E
              </span>
              <span class="text-[11px] text-[var(--fg-dim)]">{{ editing ? '完成' : '编辑' }}</span>
            </template>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template v-if="workspaceId != null && editing">
              <TagChip
                v-for="tag in item.tags"
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
                v-for="tag in item.tags"
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
          <div v-if="workspaceId != null && editing" class="relative mt-2">
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
  </div>
</template>

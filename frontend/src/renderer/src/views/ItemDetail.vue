<script setup lang="ts">
/**
 * 条目详情页——**骨架**（D29 收窄为骨架职责清单）：顺序上下文、顺序窗口与翻页、
 * DetailNav 命令桥、编辑模式开关。版面归详情页工作台（D39）：槽位与分配在
 * features/detailWorkbench，"条目的一个侧面"是工作台视图（预览/信息面/预览条），
 * 本页只提供事实与动作（经工作台上下文注入视图）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@shared/api'
import type { Id, ItemContext, ItemWindowResult } from '@shared/contract'
import { toItemView, type ItemView } from '../lib/viewModel'
import { taghitFileUrl } from '../lib/media'
import { useTabStore, type ItemTab } from '../stores/tab'
import { itemRoute, resolveItemContext } from '../features/tabs'
import { playbackPause, playbackSnapshot } from '../features/playback/playback'
import { windowNav } from '../features/windowNav'
import { registerDetailNav } from '../features/detailNav'
import { showToast } from '../features/services/dialog'
import DetailWorkbench from '../features/detailWorkbench/DetailWorkbench.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tabStore = useTabStore()

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
 * 翻页：在当前条目标签内换内容（**不新开标签**——翻十张就是十个标签），
 * 路由用 replace（同一次浏览不写历史；侧键返回回到来处的网格/搜索）。
 * 打标导致当前条目退出视图时**当前页不跳**：窗口只在翻页时按新集合重算。
 * 播放生命周期（D43）：标签页与资源挂钩——翻页 = 本标签的资源被替换，正播的音频即停。
 */
function go(target: ItemView | null): void {
  if (target == null) return
  const snap = playbackSnapshot()
  if (snap.itemId === props.id && snap.status === 'playing') playbackPause()
  tabStore.flipItemTab(props.id, target.id, target.title)
  void router.replace(itemRoute(target.id, context.value))
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

/**
 * 标签池：**打开瞬间固化的顺序上下文里的工作区**（不是"当前活动工作区"——
 * 详情页成为活动标签后活动工作区即为空）。标签池在标题栏标明，翻页不随之改变。
 */
const workspaceId = computed<Id | null>(() => context.value.workspaceId ?? null)

/**
 * 编辑模式（Ctrl+E 双向切换）：阅读态的标签区是**静态**的（防误触），修改类动作
 * 只在编辑模式可用；无工作区上下文不可编辑。
 * 模式态挂在条目标签项上——翻页保持（一份打完是下一件），新开详情回到阅读态。
 */
const editing = computed(() => itemTab.value?.editing === true)

function toggleEdit(): void {
  const tab = itemTab.value
  if (tab == null || workspaceId.value == null) return
  tab.editing = !tab.editing
}

async function load(): Promise<void> {
  error.value = ''
  try {
    const hits = await api.items.query({ ids: [props.id] })
    item.value = hits.length ? toItemView(hits[0]) : null
    if (!item.value) error.value = t('itemDetail.missing')
  } catch (e) {
    item.value = null
    error.value = e instanceof Error ? e.message : String(e)
  }
}

/** 打标/摘除（工作台上下文暴露给视图的唯一改动通道）：改库 + 刷新当前条目；失败有 toast 不静默。 */
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

let disposeNav: (() => void) | null = null

onMounted(async () => {
  // 条目与顺序窗口并行取（翻页路径同理）：串行要过两趟 IPC，白等一截
  await Promise.all([load(), loadWindow()])
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
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- 错误：整区居中提示 -->
    <div v-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-[var(--danger)] text-sm">
        {{ error }}
        <button class="btn ml-2" @click="router.push('/')">{{ $t('itemDetail.backHome') }}</button>
      </div>
    </div>

    <template v-else-if="item">
      <!-- 失败可见性：顺序窗口取不到时如实说（顶栏已裁撤 D40，标题由标签页承载；常驻进度不再有） -->
      <div v-if="winError" class="error-note mx-3 mt-2 shrink-0" role="alert">
        <span class="min-w-0 flex-1 break-words">{{ $t('itemDetail.winLoadFailed', { error: winError }) }}</span>
        <button class="icon-btn h-4 w-4 shrink-0" :title="$t('itemDetail.close')" @click="winError = null">✕</button>
      </div>

      <!-- 版面：详情页工作台（D39 槽位化；视图 = 预览/信息面/预览条） -->
      <div class="flex-1 min-h-0 min-w-0">
        <DetailWorkbench
          :item="item"
          :workspace-id="workspaceId"
          :editing="editing"
          :window-views="windowViews"
          :prev="prev"
          :next="next"
          :go="go"
          :toggle-tag="toggleTag"
        />
      </div>
    </template>
  </div>
</template>

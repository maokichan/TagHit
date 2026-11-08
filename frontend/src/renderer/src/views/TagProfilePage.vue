<script setup lang="ts">
/**
 * 标签主页 —— tag 的**阅读面**（词条式：版心内左栏事实 + 右侧正文，路由 /tag/:id）。
 *
 * 数据面 = TagProfile（有类型文档，全局属性）+ 标签既有事实（描述/统计/组，读全局口径）
 * + 共现邻居（按打开瞬间固化的工作区上下文，无工作区则不显示）。
 * 正文 Markdown 渲染（markdown-it，html 关闭即内联 HTML 一律转义）；正文里的 [[标签名]]
 * 解析为对应标签主页的站内链接（解析不到保持原样）；外链经宿主转系统浏览器。
 * 编辑就地完成（正文 textarea + 链接行编辑），保存走 tags.setProfile（null = 清除）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Plus, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import MarkdownIt from 'markdown-it'
import { api } from '@shared/api'
import type { Id, TagProfile } from '@shared/contract'
import { useTagStore } from '../stores/tag'
import { useTabStore, type TagTab } from '../stores/tab'
import { openTagTab } from '../features/tabs'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const tagStore = useTagStore()
const tabStore = useTabStore()

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 本标签的主页标签项 = 打开瞬间固化的工作区上下文（共现口径随它；刷新后随标签项读回）。 */
const tagTab = computed<TagTab | null>(
  () => tabStore.tabs.find((t): t is TagTab => t.kind === 'tag' && t.tagId === props.id) ?? null
)
const wsId = computed<Id | null>(() => tagTab.value?.workspaceId ?? null)

const tag = computed(() => tagStore.byId(props.id))
const error = ref<string | null>(null)
const loaded = ref(false)

// ---- 主页文档 ---------------------------------------------------------------
const profile = ref<TagProfile | null>(null)

// ---- 事实条（全局口径：挂载/声明统计是池级数据；组是全局组织） ----------------
const statsRow = ref<{ itemCount: number; workspaceCount: number } | null>(null)
const groupNames = ref<string[]>([])
const countText = (n: number | undefined): string | number =>
  statsRow.value ? (n ?? '—') : '…'

// ---- 共现邻居（工作区成员口径；无工作区上下文不显示） -------------------------
const cooccur = ref<Array<{ id: Id; name: string; together: number }>>([])

async function load(): Promise<void> {
  error.value = null
  loaded.value = false
  try {
    await tagStore.refreshAll()
    const [p, allStats] = await Promise.all([api.tags.getProfile(props.id), api.tags.stats()])
    profile.value = p
    statsRow.value = allStats.find((s) => s.tagId === props.id) ?? null
    const [groups, memberships] = await Promise.all([api.groups.list(), api.groups.memberships()])
    const nameOf = new Map(groups.map((g) => [g.id, g.name]))
    groupNames.value = memberships
      .filter((m) => m.tagId === props.id)
      .map((m) => nameOf.get(m.groupId))
      .filter((n): n is string => n != null)
    if (wsId.value != null) await loadCooccur(wsId.value)
    if (tag.value == null) error.value = t('tagProfile.missing')
  } catch (e) {
    error.value = message(e)
  } finally {
    loaded.value = true
  }
}

async function loadCooccur(workspaceId: Id): Promise<void> {
  cooccur.value = []
  try {
    const pairs = await api.tags.pairStats({ workspaceId, kind: 'cooccur', limit: 100 })
    cooccur.value = pairs
      .filter((r) => r.a === props.id || r.b === props.id)
      .map((r) => {
        const other = r.a === props.id ? r.b : r.a
        return { id: other, name: tagStore.byId(other)?.name ?? other, together: r.together }
      })
      .slice(0, 8)
  } catch {
    cooccur.value = [] // 共现是增强信息：取不到就空着，不是失败现场
  }
}

watch(
  () => props.id,
  () => {
    editing.value = false
    editError.value = null
    void load()
  }
)
onMounted(() => void load())

function openNeighbor(t: { id: Id; name: string }): void {
  openTagTab(t.id, t.name, wsId.value)
}

/** 外链交宿主：window.open 走 setWindowOpenHandler → 系统浏览器（模板作用域拿不到 window，经此方法）。 */
function openExternal(url: string): void {
  if (url.startsWith('http://') || url.startsWith('https://')) window.open(url, '_blank')
}

// ---- 正文渲染（Markdown + [[站内链接]]） ------------------------------------
const md = new MarkdownIt({ html: false, linkify: true })

const renderedBody = computed<string>(() => {
  const raw = profile.value?.body
  if (raw == null || raw.trim() === '') return ''
  const withWiki = raw.replace(/\[\[([^\[\]]+)\]\]/g, (whole, name: string) => {
    const trimmed = name.trim()
    const target = tagStore.allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    return target != null ? `[${trimmed}](#/tag/${target.id})` : whole
  })
  return md.render(withWiki)
})

/** 正文容器事件委托：站内链接走路由打开，外链交宿主（setWindowOpenHandler → 系统浏览器）。 */
function onBodyClick(e: MouseEvent): void {
  const a = (e.target as HTMLElement).closest('a')
  if (a == null) return
  e.preventDefault()
  const href = a.getAttribute('href') ?? ''
  if (href.startsWith('#/tag/')) {
    const id = href.slice('#/tag/'.length)
    const t = tagStore.byId(id)
    if (t != null) openTagTab(id, t.name, wsId.value)
    return
  }
  if (href.startsWith('http://') || href.startsWith('https://')) {
    window.open(href, '_blank')
  }
}

// ---- 就地编辑（正文 textarea + 链接行；保存走 setProfile，null = 清除） -------
const editing = ref(false)
const saving = ref(false)
const editError = ref<string | null>(null)
const draftBody = ref('')
const draftLinks = ref<Array<{ label: string; url: string }>>([])

function startEdit(): void {
  draftBody.value = profile.value?.body ?? ''
  draftLinks.value = (profile.value?.links ?? []).map((l) => ({ ...l }))
  editError.value = null
  editing.value = true
}

function cancelEdit(): void {
  editing.value = false
  editError.value = null
}

async function saveEdit(): Promise<void> {
  const links = draftLinks.value
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label !== '' || l.url !== '')
  if (links.some((l) => l.label === '' || l.url === '')) {
    editError.value = t('tagProfile.linkRequired')
    return
  }
  const body = draftBody.value.trim() === '' ? null : draftBody.value
  const next: TagProfile | null =
    body == null && links.length === 0 ? null : { schemaVersion: 1, body, links }
  saving.value = true
  editError.value = null
  try {
    await api.tags.setProfile(props.id, next)
    profile.value = next
    editing.value = false
  } catch (e) {
    editError.value = message(e)
  } finally {
    saving.value = false
  }
}

const hasContent = computed(
  () => (profile.value?.body != null && profile.value.body.trim() !== '') || (profile.value?.links.length ?? 0) > 0
)
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto px-6 py-8">
      <div v-if="error" class="error-note" role="alert">
        <span class="min-w-0 flex-1 break-words">{{ error }}</span>
      </div>

      <template v-else-if="tag">
        <div class="flex gap-8">
          <!-- 左：事实条（与正文对齐的简单信息） -->
          <aside class="w-52 shrink-0 space-y-5">
            <div class="panel p-3">
              <div class="panel-label mb-2">{{ $t('tagProfile.info') }}</div>
              <dl class="space-y-1.5 text-[12px]">
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">{{ $t('tagProfile.description') }}</dt>
                  <dd class="min-w-0 flex-1 break-words" :title="tag.description ?? undefined">
                    {{ tag.description ?? '—' }}
                  </dd>
                </div>
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">{{ $t('tagProfile.mounted') }}</dt>
                  <dd class="tabular-nums">{{ countText(statsRow?.itemCount) }}</dd>
                </div>
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">{{ $t('tagProfile.declared') }}</dt>
                  <dd class="tabular-nums">
                    {{ $t('tagProfile.wsCount', { n: countText(statsRow?.workspaceCount) }) }}
                  </dd>
                </div>
              </dl>
              <template v-if="groupNames.length > 0">
                <div class="panel-label mt-3 mb-1.5">{{ $t('tagProfile.group') }}</div>
                <div class="flex flex-wrap gap-1">
                  <span v-for="n in groupNames" :key="n" class="chip">{{ n }}</span>
                </div>
              </template>
            </div>

            <div v-if="wsId != null" class="panel p-3">
              <div class="panel-label mb-2">{{ $t('tagProfile.cooccurTitle') }}</div>
              <div v-if="cooccur.length > 0" class="flex flex-wrap gap-1">
                <button
                  v-for="c in cooccur"
                  :key="c.id"
                  class="chip chip--action"
                  :title="$t('tagProfile.cooccurHover', { n: c.together })"
                  @click="openNeighbor(c)"
                >
                  {{ c.name }}
                </button>
              </div>
              <p v-else-if="loaded" class="text-[11px] text-[var(--fg-dim)]">
                {{ $t('tagProfile.cooccurEmpty') }}
              </p>
            </div>
          </aside>

          <!-- 右：标题 + 正文（词条阅读列） -->
          <article class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-3">
              <h1 class="text-[16px] font-semibold truncate min-w-0" :title="tag.name">
                {{ tag.name }}
              </h1>
              <button
                v-if="!editing"
                class="btn h-7 px-2 text-[11px] shrink-0"
                :title="$t('tagProfile.editHover')"
                @click="startEdit"
              >
                {{ $t('tagProfile.edit') }}
              </button>
            </div>

            <!-- 编辑态：正文 textarea + 链接行 -->
            <template v-if="editing">
              <div v-if="editError" class="error-note mb-2" role="alert">
                <span class="min-w-0 flex-1 break-words">{{ editError }}</span>
                <button
                  class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]"
                  :title="$t('tagProfile.close')"
                  :aria-label="$t('tagProfile.close')"
                  @click="editError = null"
                >
                  <X :size="11" />
                </button>
              </div>
              <textarea
                v-model="draftBody"
                class="input w-full font-mono text-[12px] leading-5"
                rows="14"
                :placeholder="$t('tagProfile.bodyPlaceholder')"
                :aria-label="$t('tagProfile.bodyAria')"
                spellcheck="false"
              ></textarea>
              <div class="mt-3">
                <div class="panel-label mb-1.5">{{ $t('tagProfile.links') }}</div>
                <div class="space-y-1.5">
                  <div
                    v-for="(l, i) in draftLinks"
                    :key="i"
                    class="flex items-center gap-1.5"
                  >
                    <input
                      v-model="l.label"
                      class="input h-8 w-32 py-0 text-[12px]"
                      :placeholder="$t('tagProfile.linkNamePlaceholder')"
                      :aria-label="$t('tagProfile.linkNameAria')"
                      spellcheck="false"
                    />
                    <input
                      v-model="l.url"
                      class="input h-8 flex-1 min-w-0 py-0 text-[12px]"
                      placeholder="https://…"
                      :aria-label="$t('tagProfile.linkUrlAria')"
                      spellcheck="false"
                    />
                    <button
                      class="icon-btn h-8 w-7 shrink-0 hover:text-[var(--danger)]"
                      :title="$t('tagProfile.removeLink')"
                      :aria-label="$t('tagProfile.removeLinkAria', { name: l.label || i + 1 })"
                      @click="draftLinks.splice(i, 1)"
                    >
                      <Trash2 :size="13" />
                    </button>
                  </div>
                </div>
                <button
                  class="btn h-7 px-2 text-[11px] mt-1.5"
                  :disabled="draftLinks.length >= 100"
                  @click="draftLinks.push({ label: '', url: '' })"
                >
                  <Plus :size="12" /> {{ $t('tagProfile.addLink') }}
                </button>
              </div>
              <div class="flex items-center gap-2 mt-4">
                <button class="btn btn-primary h-7 px-3 text-[12px]" :disabled="saving" @click="saveEdit">
                  {{ $t('tagProfile.save') }}
                </button>
                <button class="btn h-7 px-2 text-[11px]" :disabled="saving" @click="cancelEdit">
                  {{ $t('tagProfile.cancel') }}
                </button>
                <span class="text-[11px] text-[var(--fg-dim)]">{{ $t('tagProfile.editorHint') }}</span>
              </div>
            </template>

            <!-- 阅读态：渲染正文 + 链接区 -->
            <template v-else>
              <div v-if="renderedBody !== ''" class="doc" @click="onBodyClick" v-html="renderedBody"></div>
              <p v-else-if="loaded && !hasContent" class="text-[12px] text-[var(--fg-dim)]">
                {{ $t('tagProfile.emptyPage') }}
              </p>

              <div v-if="(profile?.links.length ?? 0) > 0" class="mt-6">
                <div class="panel-label mb-1.5">{{ $t('tagProfile.links') }}</div>
                <ul class="space-y-1">
                  <li v-for="(l, i) in profile?.links" :key="i" class="flex items-baseline gap-2 min-w-0">
                    <a
                      :href="l.url"
                      class="text-[12px] text-[var(--accent)] hover:underline shrink-0"
                      @click.prevent="openExternal(l.url)"
                    >{{ l.label }}</a>
                    <span class="text-[11px] text-[var(--fg-dim)] truncate min-w-0" :title="l.url">
                      {{ l.url }}
                    </span>
                  </li>
                </ul>
              </div>
            </template>
          </article>
        </div>
      </template>

      <div v-else-if="loaded" class="text-[12px] text-[var(--fg-dim)]">{{ $t('tagProfile.missing') }}</div>
      <div v-else class="text-[12px] text-[var(--fg-dim)]">{{ $t('tagProfile.reading') }}</div>
    </div>
  </div>
</template>

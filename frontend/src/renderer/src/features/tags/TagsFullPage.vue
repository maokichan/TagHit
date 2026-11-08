<script setup lang="ts">
/**
 * 标签 —— 全页呈现面（contentTab；版心归壳，本组件只出内容）。
 *
 * 四个分区：池总表（搜索/新建/批量/内联描述）、组、数字键速打、对统计。
 * 选择是页内模式：有选中项时工具栏原地换成批量操作，不插入新行、不推挤表格；
 * 统计用分段视图 + 条带表达关系强度，互斥不伪造成"有值"的图形。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { api } from '@shared/api'
import type { Group, Id, Tag, TagPairStat, TagStat } from '@shared/contract'
import { useTagStore } from '../../stores/tag'
import { useConfigStore } from '../../stores/config'
import { confirmDialog } from '../services/dialog'

const props = defineProps<{ workspaceId?: string | null }>()
const tagStore = useTagStore()
const config = useConfigStore()
const { t } = useI18n()

const wsId = computed(() => props.workspaceId ?? '')
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const busy = ref(false)
const groupBusy = ref(false)
const anyBusy = computed(() => busy.value || groupBusy.value)

// ── ① 池总表 ──────────────────────────────────────────────
const stats = ref<Map<Id, TagStat>>(new Map())
const query = ref('')
const poolLoaded = ref(false)
const statsLoaded = ref(false)
const newTagName = ref('')
const newTagInput = ref<HTMLInputElement | null>(null)
const error = ref<string | null>(null)

const hasQuery = computed(() => query.value.trim() !== '')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return tagStore.allTags
    .filter((t) => q === '' || t.name.toLowerCase().includes(q))
    .map((t) => ({ tag: t, stat: stats.value.get(t.id) }))
})
const filteredLabel = computed(() => {
  const total = tagStore.allTags.length
  return hasQuery.value
    ? t('tags.countFiltered', { shown: rows.value.length, total })
    : t('tags.count', { n: total })
})
const countText = (n: number | undefined): string | number => (statsLoaded.value ? n ?? '—' : '…')

async function loadStats(): Promise<void> {
  try {
    stats.value = new Map((await api.tags.stats()).map((s) => [s.tagId, s]))
  } catch (e) {
    error.value = message(e)
  } finally {
    statsLoaded.value = true
  }
}

async function loadPool(): Promise<void> {
  try {
    await tagStore.refreshAll()
  } catch (e) {
    error.value = message(e)
  } finally {
    poolLoaded.value = true
  }
  await loadStats()
}

async function createTag(): Promise<void> {
  const name = newTagName.value.trim()
  if (name === '' || anyBusy.value || !poolLoaded.value) return
  busy.value = true
  error.value = null
  try {
    await tagStore.create(name, undefined, wsId.value === '' ? undefined : wsId.value)
    newTagName.value = ''
    query.value = ''
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
  await nextTick()
  newTagInput.value?.focus()
  void Promise.all([loadStats(), loadPins()])
}

const editingId = ref<Id | null>(null)
const draftDesc = ref('')
const descInput = ref<HTMLInputElement | null>(null)

function setDescInput(el: unknown): void {
  if (el instanceof HTMLInputElement) descInput.value = el
}

async function startEdit(id: Id, current: string | null): Promise<void> {
  if (anyBusy.value) return
  editingId.value = id
  draftDesc.value = current ?? ''
  await nextTick()
  descInput.value?.focus()
  descInput.value?.select()
}

function cancelEdit(): void {
  editingId.value = null
  draftDesc.value = ''
}

async function saveEdit(): Promise<void> {
  const id = editingId.value
  if (id == null) return
  const next = draftDesc.value.trim()
  editingId.value = null
  draftDesc.value = ''
  busy.value = true
  error.value = null
  try {
    await tagStore.update(id, next === '' ? null : next)
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}

// ── 选择与批量 ────────────────────────────────────────────
const checked = ref<Set<Id>>(new Set())
const visibleCheckedCount = computed(() => rows.value.filter((r) => checked.value.has(r.tag.id)).length)
const hiddenCheckedCount = computed(() => checked.value.size - visibleCheckedCount.value)
const allVisibleChecked = computed(
  () => rows.value.length > 0 && visibleCheckedCount.value === rows.value.length
)
const someVisibleChecked = computed(
  () => visibleCheckedCount.value > 0 && !allVisibleChecked.value
)

function toggleCheck(id: Id): void {
  if (anyBusy.value) return
  const next = new Set(checked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checked.value = next
}

function toggleAllVisible(): void {
  if (anyBusy.value) return
  const next = new Set(checked.value)
  if (allVisibleChecked.value) {
    for (const r of rows.value) next.delete(r.tag.id)
  } else {
    for (const r of rows.value) next.add(r.tag.id)
  }
  checked.value = next
}

function clearSelection(): void {
  if (anyBusy.value) return
  checked.value = new Set()
}

async function runBatch(ids: Id[], fn: (id: Id) => Promise<void>): Promise<void> {
  const next = new Set(checked.value)
  const failures: string[] = []
  for (const id of ids) {
    try {
      await fn(id)
      next.delete(id)
    } catch (e) {
      failures.push(message(e))
    }
  }
  checked.value = next
  if (failures.length > 0) {
    error.value = t('tags.selection.batchIncomplete', { n: failures.length, error: failures[0] })
  }
}

async function batchDeclare(declare: boolean): Promise<void> {
  if (wsId.value === '' || checked.value.size === 0 || anyBusy.value) return
  const ids = [...checked.value]
  const ws = wsId.value
  busy.value = true
  error.value = null
  try {
    await runBatch(ids, (id) =>
      declare ? tagStore.declare(ws, id) : tagStore.undeclare(ws, id)
    )
  } finally {
    busy.value = false
    await Promise.all([loadStats(), loadPins()])
  }
}

async function batchDelete(): Promise<void> {
  if (checked.value.size === 0 || anyBusy.value) return
  const count = checked.value.size
  const ok = await confirmDialog({
    title: t('tags.deleteTagTitle'),
    message: t('tags.deleteTagBatchConfirm', { n: count }),
    confirmText: t('tags.delete'),
    danger: true
  })
  if (!ok) return
  const ids = [...checked.value]
  busy.value = true
  error.value = null
  try {
    await runBatch(ids, (id) => tagStore.remove(id))
  } finally {
    busy.value = false
    await Promise.all([loadStats(), loadGroups(), loadPins(), loadPairs()])
  }
}

async function removeOne(id: Id, name: string): Promise<void> {
  if (anyBusy.value) return
  const ok = await confirmDialog({
    title: t('tags.deleteTagTitle'),
    message: t('tags.deleteTagConfirm', { name }),
    confirmText: t('tags.delete'),
    danger: true
  })
  if (!ok) return
  busy.value = true
  error.value = null
  try {
    await tagStore.remove(id)
    const next = new Set(checked.value)
    next.delete(id)
    checked.value = next
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
    await Promise.all([loadStats(), loadGroups(), loadPins(), loadPairs()])
  }
}

// ── ② 组（组织标签的扁平容器；只用组组织，组索引/筛选另行再看） ──
const groups = ref<Group[]>([])
const memberships = ref<Array<{ groupId: Id; tagId: Id }>>([])
const groupsLoaded = ref(false)
const groupError = ref('')
const newGroupName = ref('')
const newGroupInput = ref<HTMLInputElement | null>(null)
const renamingGroupId = ref<Id | null>(null)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const batchGroupId = ref<Id | ''>('')

const sortedGroups = computed(() => [...groups.value].sort((a, b) => a.name.localeCompare(b.name)))
const memberMap = computed(() => {
  const map = new Map<Id, Id[]>()
  for (const m of memberships.value) {
    const list = map.get(m.groupId)
    if (list) list.push(m.tagId)
    else map.set(m.groupId, [m.tagId])
  }
  return map
})
const membersOf = (gid: Id): Id[] => memberMap.value.get(gid) ?? []
const candidatesOf = (gid: Id): Tag[] => {
  const current = new Set(membersOf(gid))
  return tagStore.allTags.filter((t) => !current.has(t.id))
}

watch(sortedGroups, (list) => {
  if (batchGroupId.value !== '' && !list.some((g) => g.id === batchGroupId.value)) {
    batchGroupId.value = ''
  }
  if (renamingGroupId.value != null && !list.some((g) => g.id === renamingGroupId.value)) {
    renamingGroupId.value = null
  }
})

async function loadGroups(): Promise<void> {
  try {
    const [g, m] = await Promise.all([api.groups.list(), api.groups.memberships()])
    groups.value = g
    memberships.value = m
  } catch (e) {
    groupError.value = message(e)
  } finally {
    groupsLoaded.value = true
  }
}

async function groupAction(fn: () => Promise<void>): Promise<void> {
  if (groupBusy.value) return
  groupBusy.value = true
  groupError.value = ''
  try {
    await fn()
  } catch (e) {
    groupError.value = message(e)
  } finally {
    await loadGroups()
    groupBusy.value = false
  }
}

async function createGroup(): Promise<void> {
  const name = newGroupName.value.trim()
  if (name === '' || anyBusy.value) return
  await groupAction(async () => {
    await api.groups.create(name)
    newGroupName.value = ''
  })
  await nextTick()
  newGroupInput.value?.focus()
}

function setRenameInput(el: unknown): void {
  if (el instanceof HTMLInputElement) renameInput.value = el
}

async function startRename(g: Group): Promise<void> {
  if (anyBusy.value) return
  renamingGroupId.value = g.id
  renameDraft.value = g.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function cancelRename(): void {
  renamingGroupId.value = null
  renameDraft.value = ''
}

async function saveRename(): Promise<void> {
  const id = renamingGroupId.value
  const name = renameDraft.value.trim()
  if (id == null || name === '' || anyBusy.value) return
  await groupAction(async () => {
    await api.groups.rename(id, name)
    renamingGroupId.value = null
    renameDraft.value = ''
  })
}

async function removeGroup(g: Group): Promise<void> {
  if (anyBusy.value) return
  const ok = await confirmDialog({
    title: t('tags.groups.deleteTitle'),
    message: t('tags.groups.deleteConfirm', { name: g.name }),
    confirmText: t('tags.delete'),
    danger: true
  })
  if (!ok) return
  await groupAction(async () => {
    await api.groups.remove(g.id)
    if (batchGroupId.value === g.id) batchGroupId.value = ''
    if (renamingGroupId.value === g.id) cancelRename()
  })
}

async function addToGroup(gid: Id, el: HTMLSelectElement): Promise<void> {
  const tid = el.value
  if (tid === '' || anyBusy.value) return
  await groupAction(async () => {
    await api.groups.addMember(gid, tid)
    el.value = ''
  })
}

async function removeFromGroup(gid: Id, tid: Id): Promise<void> {
  if (anyBusy.value) return
  await groupAction(async () => {
    await api.groups.removeMember(gid, tid)
  })
}

async function batchAddToGroup(): Promise<void> {
  if (batchGroupId.value === '' || checked.value.size === 0 || anyBusy.value) return
  const gid = batchGroupId.value
  const ids = [...checked.value]
  await groupAction(async () => {
    const next = new Set(checked.value)
    const failures: string[] = []
    for (const tid of ids) {
      try {
        await api.groups.addMember(gid, tid)
        next.delete(tid)
      } catch (e) {
        failures.push(message(e))
      }
    }
    checked.value = next
    batchGroupId.value = ''
    if (failures.length > 0) {
      throw new Error(t('tags.selection.groupAddIncomplete', { n: failures.length, error: failures[0] }))
    }
  })
}

// ── ③ 数字键速打（详情页 1..9 直达；映射归标签职能，配置只在此页） ──
const declared = ref<Id[]>([])
const pins = ref<Array<Id | null>>(Array<Id | null>(9).fill(null))
const pinsLoaded = ref(false)
const pinError = ref('')

const declaredTags = computed(() => tagStore.allTags.filter((t) => declared.value.includes(t.id)))

async function loadPins(): Promise<void> {
  if (wsId.value === '') {
    declared.value = []
    pins.value = Array<Id | null>(9).fill(null)
    pinError.value = ''
    pinsLoaded.value = true
    return
  }
  try {
    declared.value = await api.workspaces.declaredTags(wsId.value)
    const raw = config.value<unknown>('tags', `pinned:${wsId.value}`, null)
    const saved = Array.isArray(raw) ? (raw as Array<Id | null>) : []
    const valid = new Set(declared.value)
    const next = Array.from({ length: 9 }, (_, i) => {
      const id = saved[i] ?? null
      return id != null && valid.has(id) ? id : null
    })
    pins.value = next
    if (saved.length !== 9 || next.some((v, i) => v !== (saved[i] ?? null))) {
      config.setValue('tags', `pinned:${wsId.value}`, next)
    }
    pinError.value = ''
  } catch (e) {
    pinError.value = message(e)
  } finally {
    pinsLoaded.value = true
  }
}

function setPin(digit: number, tagId: string): void {
  if (wsId.value === '') return
  const arr = [...pins.value]
  arr[digit - 1] = tagId === '' ? null : (tagId as Id)
  pins.value = arr
  config.setValue('tags', `pinned:${wsId.value}`, arr)
}

// ── ④ 对统计 ──────────────────────────────────────────────
const cooccur = ref<TagPairStat[]>([])
const mutex = ref<TagPairStat[]>([])
const pairsLoaded = ref(false)
const pairError = ref<string | null>(null)
const statsKind = ref<'cooccur' | 'mutex'>('cooccur')

const activePairs = computed(() =>
  statsKind.value === 'cooccur' ? cooccur.value : mutex.value
)
const cooccurMax = computed(() => Math.max(0, ...cooccur.value.map((r) => r.together)))
const mutexMax = computed(() =>
  Math.max(0, ...mutex.value.flatMap((r) => [r.aCount, r.bCount]))
)
const pct = (value: number, max: number): string =>
  max <= 0 ? '0%' : `${Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100))}%`
const cooccurPct = (r: TagPairStat): string => pct(r.together, cooccurMax.value)
const mutexPct = (n: number): string => pct(n, mutexMax.value)

const nameOf = (id: Id): string => tagStore.byId(id)?.name ?? id

async function loadPairs(): Promise<void> {
  if (wsId.value === '') {
    cooccur.value = []
    mutex.value = []
    pairError.value = null
    pairsLoaded.value = true
    return
  }
  try {
    const [a, b] = await Promise.all([
      api.tags.pairStats({ workspaceId: wsId.value, kind: 'cooccur', limit: 12 }),
      api.tags.pairStats({ workspaceId: wsId.value, kind: 'mutex', limit: 12 })
    ])
    cooccur.value = a
    mutex.value = b
    pairError.value = null
  } catch (e) {
    pairError.value = message(e)
  } finally {
    pairsLoaded.value = true
  }
}

onMounted(() => {
  void Promise.all([loadPool(), loadGroups(), loadPins(), loadPairs()])
})

watch(wsId, () => {
  pinsLoaded.value = false
  declared.value = []
  pins.value = Array<Id | null>(9).fill(null)
  pinError.value = ''
  pairsLoaded.value = false
  cooccur.value = []
  mutex.value = []
  pairError.value = null
  void Promise.all([loadPins(), loadPairs()])
})
</script>

<template>
  <div class="max-w-3xl space-y-8">
    <!-- ① 池总表 -->
    <section>
      <!-- 工具栏：无选中 = 搜索/新建；有选中 = 批量操作。同一行就地切换，表格不位移。 -->
      <div
        class="sticky top-0 z-10 -mx-2 px-2 pt-1 pb-3 bg-[var(--bg)] border-b border-[var(--border)]"
      >
        <div class="flex flex-wrap items-center gap-2 min-h-9">
          <h2 class="text-[13px] font-medium flex-1 min-w-0 truncate">
            {{ $t('tags.pool.title') }}
            <span class="ml-1 text-[11px] font-normal text-[var(--fg-dim)] tabular-nums">
              {{ poolLoaded ? filteredLabel : '…' }}
            </span>
          </h2>

          <template v-if="checked.size === 0">
            <div class="relative shrink-0">
              <Search
                :size="13"
                class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
              />
              <input
                v-model="query"
                class="input h-8 w-44 pl-8 pr-7 py-0 text-[12px]"
                :placeholder="$t('tags.pool.searchPlaceholder')"
                :aria-label="$t('tags.pool.searchPlaceholder')"
                spellcheck="false"
                @keydown.esc.prevent="query = ''"
              />
              <button
                v-if="query !== ''"
                class="icon-btn absolute right-1 top-0 h-8 w-6"
                :title="$t('tags.pool.clearSearch')"
                :aria-label="$t('tags.pool.clearSearch')"
                @click="query = ''"
              >
                <X :size="12" />
              </button>
            </div>
            <input
              ref="newTagInput"
              v-model="newTagName"
              class="input h-8 w-36 py-0 text-[12px] shrink-0"
              :placeholder="$t('tags.pool.newTagPlaceholder')"
              :aria-label="$t('tags.newTagName')"
              spellcheck="false"
              :disabled="anyBusy || !poolLoaded"
              @keydown.enter.prevent="createTag"
            />
            <button
              class="btn h-8 w-8 shrink-0 justify-center px-0"
              :disabled="anyBusy || !poolLoaded || newTagName.trim() === ''"
              :title="$t('tags.pool.newTag')"
              :aria-label="$t('tags.pool.newTag')"
              @click="createTag"
            >
              <Plus :size="13" />
            </button>
          </template>

          <template v-else>
            <span class="text-[12px] text-[var(--fg-dim)] shrink-0" aria-live="polite">
              {{ $t('tags.selection.selectedCount', { n: checked.size }) }}
              <span
                v-if="hiddenCheckedCount > 0"
                :title="$t('tags.selection.hiddenHint', { n: hiddenCheckedCount })"
              >
                （+{{ hiddenCheckedCount }}）
              </span>
            </span>
            <button
              class="btn h-8 px-2 text-[11px]"
              :disabled="anyBusy || wsId === ''"
              :title="wsId === '' ? $t('tags.selection.declareNeedWs') : $t('tags.selection.declareHint')"
              @click="batchDeclare(true)"
            >
              {{ $t('tags.selection.declare') }}
            </button>
            <button
              class="btn h-8 px-2 text-[11px]"
              :disabled="anyBusy || wsId === ''"
              :title="wsId === '' ? $t('tags.selection.undeclareNeedWs') : $t('tags.selection.undeclareHint')"
              @click="batchDeclare(false)"
            >
              {{ $t('tags.selection.undeclare') }}
            </button>
            <select
              v-model="batchGroupId"
              class="input h-8 w-32 py-0 text-[11px] shrink-0"
              :disabled="anyBusy || sortedGroups.length === 0"
              :title="sortedGroups.length === 0 ? $t('tags.selection.needGroupFirst') : $t('tags.selection.pickGroup')"
              :aria-label="$t('tags.selection.batchAddGroupAria')"
            >
              <option value="">{{ $t('tags.selection.joinGroup') }}</option>
              <option v-for="g in sortedGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
            <button
              class="btn h-8 px-2 text-[11px]"
              :disabled="anyBusy || batchGroupId === ''"
              @click="batchAddToGroup"
            >
              {{ $t('tags.selection.join') }}
            </button>
            <button
              class="btn h-8 px-2 text-[11px] text-[var(--danger)] hover:text-[var(--danger)]"
              :disabled="anyBusy"
              @click="batchDelete"
            >
              {{ $t('tags.selection.deleteAction') }}
            </button>
            <button
              class="btn h-8 w-8 shrink-0 justify-center px-0"
              :disabled="anyBusy"
              :title="$t('tags.selection.clearSelection')"
              :aria-label="$t('tags.selection.clearSelection')"
              @click="clearSelection"
            >
              <X :size="13" />
            </button>
          </template>
        </div>

        <div v-if="error" class="error-note mt-2" role="alert">
          <span class="min-w-0 flex-1 break-words">{{ error }}</span>
          <button
            class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]"
            :title="$t('tags.close')"
            :aria-label="$t('tags.close')"
            @click="error = null"
          >
            <X :size="11" />
          </button>
        </div>
      </div>

      <div :aria-busy="!poolLoaded">
        <table class="w-full table-fixed text-[12px]">
          <caption class="sr-only">
            {{ $t('tags.pool.title') }}
          </caption>
          <thead class="text-[11px] text-[var(--fg-dim)]">
            <tr class="border-b border-[var(--border)]">
              <th class="w-8 py-2 text-center font-normal" scope="col">
                <label
                  class="inline-flex h-6 w-6 items-center justify-center cursor-pointer"
                  :class="{
                    'opacity-50 cursor-not-allowed': !poolLoaded || rows.length === 0 || anyBusy
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 accent-[var(--accent)] cursor-pointer"
                    :checked="allVisibleChecked"
                    :indeterminate="someVisibleChecked"
                    :disabled="!poolLoaded || rows.length === 0 || anyBusy"
                    :aria-label="$t('tags.selection.selectVisibleAria')"
                    @change="toggleAllVisible"
                  />
                </label>
              </th>
              <th class="w-[28%] px-3 py-2 text-left font-normal" scope="col">{{ $t('tags.pool.colName') }}</th>
              <th class="px-3 py-2 text-left font-normal" scope="col">{{ $t('tags.pool.colDesc') }}</th>
              <th class="w-16 px-3 py-2 text-right font-normal" scope="col">{{ $t('tags.pool.colMounted') }}</th>
              <th class="w-16 px-3 py-2 text-right font-normal" scope="col">{{ $t('tags.pool.colDeclared') }}</th>
              <th class="w-24 px-3 py-2" scope="col"><span class="sr-only">{{ $t('tags.pool.colActions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!poolLoaded">
              <td colspan="6" class="px-3 py-6 text-[12px] text-[var(--fg-dim)]">
                {{ $t('tags.pool.loadingTags') }}
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="row in rows"
                :key="row.tag.id"
                class="data-row"
                :class="{ 'data-row--selected': checked.has(row.tag.id) }"
              >
                <td class="py-2 text-center">
                  <label
                    class="inline-flex h-6 w-6 items-center justify-center cursor-pointer"
                    :class="{ 'opacity-50 cursor-not-allowed': anyBusy }"
                  >
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 accent-[var(--accent)] cursor-pointer"
                      :checked="checked.has(row.tag.id)"
                      :disabled="anyBusy"
                      :aria-label="$t('tags.pool.selectTagAria', { name: row.tag.name })"
                      @change="toggleCheck(row.tag.id)"
                    />
                  </label>
                </td>
                <td class="px-3 py-2">
                  <span class="block truncate" :title="row.tag.name">{{ row.tag.name }}</span>
                </td>
                <td class="px-3 py-2">
                  <template v-if="editingId === row.tag.id">
                    <input
                      :ref="setDescInput"
                      v-model="draftDesc"
                      class="input w-full py-1 text-[12px]"
                      :placeholder="$t('tags.pool.descPlaceholder')"
                      :disabled="anyBusy"
                      spellcheck="false"
                      @keydown.enter.prevent="saveEdit"
                      @keydown.esc.prevent="cancelEdit"
                      @blur="saveEdit"
                    />
                  </template>
                  <template v-else>
                    <button
                      class="cell-edit"
                      :title="row.tag.description ?? $t('tags.pool.addDescHint')"
                      :aria-label="
                        row.tag.description
                          ? $t('tags.pool.editDescAria', { name: row.tag.name })
                          : $t('tags.pool.addDescAria', { name: row.tag.name })
                      "
                      :disabled="anyBusy"
                      @click="startEdit(row.tag.id, row.tag.description)"
                    >
                      {{ row.tag.description ?? '—' }}
                    </button>
                  </template>
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-[var(--fg-dim)]">
                  {{ countText(row.stat?.itemCount) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums text-[var(--fg-dim)]">
                  {{ countText(row.stat?.workspaceCount) }}
                </td>
                <td class="px-3 py-2">
                  <div class="row-actions justify-end">
                    <template v-if="editingId === row.tag.id">
                      <button
                        class="btn h-6 px-1.5 text-[11px]"
                        :disabled="anyBusy"
                        @mousedown.prevent
                        @click="saveEdit"
                      >
                        {{ $t('tags.save') }}
                      </button>
                      <button
                        class="btn h-6 px-1.5 text-[11px]"
                        :disabled="anyBusy"
                        @mousedown.prevent
                        @click="cancelEdit"
                      >
                        {{ $t('tags.cancel') }}
                      </button>
                    </template>
                    <template v-else>
                      <button
                        class="btn h-6 w-6 justify-center px-0"
                        :title="$t('tags.pool.editDesc')"
                        :aria-label="$t('tags.pool.editDescAria', { name: row.tag.name })"
                        :disabled="anyBusy"
                        @click="startEdit(row.tag.id, row.tag.description)"
                      >
                        <Pencil :size="12" />
                      </button>
                      <button
                        class="btn h-6 w-6 justify-center px-0 hover:text-[var(--danger)]"
                        :title="$t('tags.deleteTagTitle')"
                        :aria-label="$t('tags.deleteTagAria', { name: row.tag.name })"
                        :disabled="anyBusy"
                        @click="removeOne(row.tag.id, row.tag.name)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
              <tr v-if="rows.length === 0">
                <td colspan="6" class="px-3 py-8">
                  <div class="flex flex-col items-center gap-2 text-center">
                    <template v-if="hasQuery">
                      <p class="text-[12px] text-[var(--fg-dim)]">
                        {{ $t('tags.pool.noMatch', { query: query }) }}
                      </p>
                      <button class="btn text-[11px]" @click="query = ''">{{ $t('tags.pool.clearSearch') }}</button>
                    </template>
                    <p v-else class="text-[12px] text-[var(--fg-dim)]">
                      {{ $t('tags.pool.empty') }}
                    </p>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ② 组：组织标签的扁平容器（只用组组织；组索引/筛选待定） -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-[13px] font-medium flex-1 min-w-0 truncate">
          {{ $t('tags.groups.title') }}
          <span class="ml-1 text-[11px] font-normal text-[var(--fg-dim)] tabular-nums">
            {{ groupsLoaded ? $t('tags.count', { n: sortedGroups.length }) : '…' }}
          </span>
        </h2>
        <input
          ref="newGroupInput"
          v-model="newGroupName"
          class="input h-8 w-40 py-0 text-[12px] shrink-0"
          :placeholder="$t('tags.groups.newPlaceholder')"
          :aria-label="$t('tags.groups.newNameAria')"
          spellcheck="false"
          :disabled="anyBusy"
          @keydown.enter.prevent="createGroup"
        />
        <button
          class="btn h-8 w-8 shrink-0 justify-center px-0"
          :disabled="anyBusy || newGroupName.trim() === ''"
          :title="$t('tags.groups.new')"
          :aria-label="$t('tags.groups.new')"
          @click="createGroup"
        >
          <Plus :size="13" />
        </button>
      </div>

        <div v-if="groupError" class="error-note mb-2" role="alert">
          <span class="min-w-0 flex-1 break-words">{{ groupError }}</span>
          <button
            class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]"
            :title="$t('tags.close')"
            :aria-label="$t('tags.close')"
            @click="groupError = ''"
          >
          <X :size="11" />
        </button>
      </div>

      <div v-if="!groupsLoaded" class="text-[12px] text-[var(--fg-dim)]">{{ $t('tags.groups.loading') }}</div>
      <template v-else>
        <div v-if="sortedGroups.length === 0 && groupError === ''" class="text-[12px] text-[var(--fg-dim)]">
          {{ $t('tags.groups.empty') }}
        </div>
        <div v-else-if="sortedGroups.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div v-for="g in sortedGroups" :key="g.id" class="panel group-card p-3">
            <div class="flex items-center gap-2 mb-2 min-h-7">
              <template v-if="renamingGroupId === g.id">
                <input
                  :ref="setRenameInput"
                  v-model="renameDraft"
                  class="input h-7 min-w-0 flex-1 py-0 text-[12px]"
                  spellcheck="false"
                  :disabled="anyBusy"
                  @keydown.enter.prevent="saveRename"
                  @keydown.esc.prevent="cancelRename"
                />
                <button
                  class="btn h-6 px-1.5 text-[11px]"
                  :disabled="anyBusy || renameDraft.trim() === ''"
                  @click="saveRename"
                >
                  {{ $t('tags.save') }}
                </button>
                <button
                  class="btn h-6 px-1.5 text-[11px]"
                  :disabled="anyBusy"
                  @click="cancelRename"
                >
                  {{ $t('tags.cancel') }}
                </button>
              </template>
              <template v-else>
                <span class="text-[12px] font-medium truncate flex-1 min-w-0" :title="g.name">
                  {{ g.name }}
                </span>
                <span
                  class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0"
                  :title="$t('tags.groups.memberCount', { n: membersOf(g.id).length })"
                >
                  {{ $t('tags.count', { n: membersOf(g.id).length }) }}
                </span>
                <div class="card-actions shrink-0">
                  <button
                    class="btn h-6 w-6 justify-center px-0"
                    :title="$t('tags.groups.rename')"
                    :aria-label="$t('tags.groups.renameAria', { name: g.name })"
                    :disabled="anyBusy"
                    @click="startRename(g)"
                  >
                    <Pencil :size="12" />
                  </button>
                  <button
                    class="btn h-6 w-6 justify-center px-0 hover:text-[var(--danger)]"
                    :title="$t('tags.groups.deleteTitle')"
                    :aria-label="$t('tags.groups.deleteAria', { name: g.name })"
                    :disabled="anyBusy"
                    @click="removeGroup(g)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </template>
            </div>

            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="tid in membersOf(g.id)"
                :key="tid"
                class="chip max-w-full gap-1"
                :title="nameOf(tid)"
              >
                <span class="min-w-0 truncate">{{ nameOf(tid) }}</span>
                <button
                  class="icon-btn h-4 w-4 shrink-0 hover:text-[var(--danger)]"
                  :title="$t('tags.groups.removeMember')"
                  :aria-label="$t('tags.groups.removeMemberAria', { name: nameOf(tid) })"
                  :disabled="anyBusy"
                  @click="removeFromGroup(g.id, tid)"
                >
                  <X :size="11" />
                </button>
              </span>
              <span v-if="membersOf(g.id).length === 0" class="text-[11px] text-[var(--fg-dim)]">
                {{ $t('tags.groups.emptyGroup') }}
              </span>
            </div>

            <select
              class="input h-8 w-full py-0 text-[12px]"
              :disabled="anyBusy || candidatesOf(g.id).length === 0"
              :aria-label="$t('tags.groups.addTagAria', { name: g.name })"
              @change="addToGroup(g.id, $event.target as HTMLSelectElement)"
            >
              <option value="">
                {{ candidatesOf(g.id).length === 0 ? $t('tags.groups.allAdded') : $t('tags.groups.addTag') }}
              </option>
              <option v-for="opt in candidatesOf(g.id)" :key="opt.id" :value="opt.id">
                {{ opt.name }}
              </option>
            </select>
          </div>
        </div>
      </template>
    </section>

    <!-- ③ 数字键速打：详情页 1..9 直达（映射归标签职能，配置只在此页） -->
    <section>
      <h2 class="text-[13px] font-medium mb-3">{{ $t('tags.quickPin.title') }}</h2>
      <div v-if="wsId === ''" class="text-[12px] text-[var(--fg-dim)]">
        {{ $t('tags.quickPin.needWorkspace') }}
      </div>
      <div v-else-if="!pinsLoaded" class="text-[12px] text-[var(--fg-dim)]">{{ $t('tags.quickPin.loading') }}</div>
      <template v-else>
        <div v-if="pinError" class="error-note" role="alert">
          <span class="min-w-0 flex-1 break-words">{{ pinError }}</span>
          <button
            class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]"
            :title="$t('tags.close')"
            :aria-label="$t('tags.close')"
            @click="pinError = ''"
          >
            <X :size="11" />
          </button>
        </div>
        <div v-else class="panel p-3">
          <div v-if="declaredTags.length === 0" class="text-[12px] text-[var(--fg-dim)]">
            {{ $t('tags.quickPin.noDeclared') }}
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label v-for="digit in 9" :key="digit" class="flex items-center gap-2 min-w-0">
              <span class="kbd w-6 shrink-0 text-center">{{ digit }}</span>
              <select
                class="input h-8 min-w-0 flex-1 py-0 text-[12px]"
                :value="pins[digit - 1] ?? ''"
                :disabled="anyBusy"
                :aria-label="$t('tags.quickPin.digitAria', { digit })"
                @change="setPin(digit, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ $t('tags.quickPin.unassigned') }}</option>
                <option v-for="opt in declaredTags" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
              </select>
            </label>
          </div>
        </div>
      </template>
    </section>

    <!-- ④ 对统计（共现 / 互斥） -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-[13px] font-medium flex-1">{{ $t('tags.stats.title') }}</h2>
        <div v-if="wsId !== ''" class="segmented shrink-0" role="group" :aria-label="$t('tags.stats.kindAria')">
          <button
            class="segment"
            :class="{ 'segment--on': statsKind === 'cooccur' }"
            :aria-pressed="statsKind === 'cooccur'"
            @click="statsKind = 'cooccur'"
          >
            {{ $t('tags.stats.cooccur') }}
            <span class="tabular-nums opacity-70">{{ pairsLoaded ? cooccur.length : '…' }}</span>
          </button>
          <button
            class="segment"
            :class="{ 'segment--on': statsKind === 'mutex' }"
            :aria-pressed="statsKind === 'mutex'"
            @click="statsKind = 'mutex'"
          >
            {{ $t('tags.stats.mutex') }}
            <span class="tabular-nums opacity-70">{{ pairsLoaded ? mutex.length : '…' }}</span>
          </button>
        </div>
      </div>

      <div v-if="wsId === ''" class="text-[12px] text-[var(--fg-dim)]">
        {{ $t('tags.stats.needWorkspace') }}
      </div>
      <div v-else class="panel p-3">
        <div v-if="pairError" class="error-note" role="alert">
          <span class="min-w-0 flex-1 break-words">{{ pairError }}</span>
          <button
            class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]"
            :title="$t('tags.close')"
            :aria-label="$t('tags.close')"
            @click="pairError = null"
          >
            <X :size="11" />
          </button>
        </div>
        <div v-else-if="!pairsLoaded" class="py-4 text-[12px] text-[var(--fg-dim)]">
          {{ $t('tags.stats.calculating') }}
        </div>
        <ul v-else-if="activePairs.length > 0" class="divide-y divide-[var(--border)]">
          <li
            v-for="r in activePairs"
            :key="`${r.a}-${r.b}`"
            class="py-2.5"
            :title="
              statsKind === 'cooccur'
                ? $t('tags.stats.cooccurPairTitle', { a: nameOf(r.a), b: nameOf(r.b), n: r.together })
                : $t('tags.stats.mutexPairTitle', { a: nameOf(r.a), b: nameOf(r.b), aCount: r.aCount, bCount: r.bCount })
            "
          >
            <div class="flex items-baseline gap-1.5">
              <span class="min-w-0 truncate text-[12px]">{{ nameOf(r.a) }}</span>
              <span class="text-[11px] text-[var(--fg-dim)] shrink-0">
                {{ statsKind === 'cooccur' ? '+' : '·' }}
              </span>
              <span class="min-w-0 truncate text-[12px]">{{ nameOf(r.b) }}</span>
              <span class="ml-auto shrink-0 tabular-nums text-[11px] text-[var(--fg-dim)]">
                <template v-if="statsKind === 'cooccur'">{{ $t('tags.count', { n: r.together }) }}</template>
                <template v-else>{{ $t('tags.stats.mutexEach', { aCount: r.aCount, bCount: r.bCount }) }}</template>
              </span>
            </div>

            <div v-if="statsKind === 'cooccur'" class="bar-track mt-1.5" aria-hidden="true">
              <div class="bar-fill" :style="{ width: cooccurPct(r) }"></div>
            </div>
            <div v-else class="mt-1.5 flex gap-1" aria-hidden="true">
              <div class="bar-track flex-1">
                <div class="bar-fill bar-fill--dim" :style="{ width: mutexPct(r.aCount) }"></div>
              </div>
              <div class="bar-track flex-1">
                <div class="bar-fill bar-fill--dim" :style="{ width: mutexPct(r.bCount) }"></div>
              </div>
            </div>
          </li>
        </ul>
        <div v-else class="py-2 text-[12px] text-[var(--fg-dim)]">
          {{ statsKind === 'cooccur' ? $t('tags.stats.noCooccur') : $t('tags.stats.noMutex') }}
        </div>
      </div>
    </section>
  </div>
</template>

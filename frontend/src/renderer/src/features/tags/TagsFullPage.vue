<script setup lang="ts">
/**
 * 标签 —— 全页呈现面（contentTab，容器范式同来源根全页：版心归壳，本组件只出内容）。
 *
 * 三个分区：
 * ① 池总表 —— 全局标签池（名 / 描述 / 挂载 / 声明），行内编辑描述、单个删除、checkbox 多选；
 * ② 批量条 —— 多选后声明到当前工作区 / 从当前工作区取消 / 批量删除（声明类需要工作区上下文）；
 * ③ 对统计 —— 共现（经常一起出现）与互斥（都在库里却从不同现），
 *    口径 = 工作区浏览成员（与网格同一份成员派生）。可视化先以排行列表呈现，形态后续逐轮调。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { api } from '@shared/api'
import type { Group, Id, Tag, TagPairStat, TagStat } from '@shared/contract'
import { useTagStore } from '../../stores/tag'
import { useConfigStore } from '../../stores/config'
import { confirmDialog } from '../services/dialog'

const props = defineProps<{ workspaceId?: string | null }>()
const tagStore = useTagStore()
const config = useConfigStore()

const wsId = computed(() => props.workspaceId ?? '')

// ── ① 池总表 ──────────────────────────────────────────────
const stats = ref<Map<Id, TagStat>>(new Map())
const query = ref('')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return tagStore.allTags
    .filter((t) => q === '' || t.name.toLowerCase().includes(q))
    .map((t) => ({ tag: t, stat: stats.value.get(t.id) }))
})

async function refresh(): Promise<void> {
  await tagStore.refreshAll()
  stats.value = new Map((await api.tags.stats()).map((s) => [s.tagId, s]))
  await refreshGroups()
}
onMounted(refresh)

const editingId = ref<Id | null>(null)
const draftDesc = ref('')

function startEdit(id: Id, current: string | null): void {
  editingId.value = id
  draftDesc.value = current ?? ''
}

async function saveEdit(): Promise<void> {
  if (editingId.value == null) return
  await tagStore.update(editingId.value, draftDesc.value.trim() === '' ? null : draftDesc.value)
  editingId.value = null
  await refresh()
}

async function removeOne(id: Id, name: string): Promise<void> {
  const ok = await confirmDialog({
    title: '删除标签',
    message: `删除「${name}」？其挂载、声明将一并删除。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  await tagStore.remove(id)
  checked.value.delete(id)
  await refresh()
}

// ── ② 批量 ────────────────────────────────────────────────
const checked = ref<Set<Id>>(new Set())

function toggleCheck(id: Id): void {
  const next = new Set(checked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checked.value = next
}

async function batchDeclare(declare: boolean): Promise<void> {
  if (wsId.value === '') return
  for (const id of checked.value) {
    if (declare) await tagStore.declare(wsId.value, id)
    else await tagStore.undeclare(wsId.value, id)
  }
  checked.value = new Set()
  await refresh()
}

async function batchDelete(): Promise<void> {
  const ok = await confirmDialog({
    title: '删除标签',
    message: `删除选中的 ${checked.value.size} 个标签？其挂载、声明将一并删除。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  for (const id of checked.value) await tagStore.remove(id)
  checked.value = new Set()
  await refresh()
}

// ── 组（组织标签的扁平容器；只用组组织，组索引/筛选另行再看） ──
const groups = ref<Group[]>([])
const memberships = ref<Array<{ groupId: Id; tagId: Id }>>([])
const newGroupName = ref('')
const groupError = ref('')
const renamingGroupId = ref<Id | null>(null)
const renameDraft = ref('')
const batchGroupId = ref<Id | ''>('')

const sortedGroups = computed(() => [...groups.value].sort((a, b) => a.name.localeCompare(b.name)))
const membersOf = (gid: Id): Id[] =>
  memberships.value.filter((m) => m.groupId === gid).map((m) => m.tagId)
const candidatesOf = (gid: Id): Tag[] =>
  tagStore.allTags.filter((t) => !membersOf(gid).includes(t.id))

async function refreshGroups(): Promise<void> {
  const [g, m] = await Promise.all([api.groups.list(), api.groups.memberships()])
  groups.value = g
  memberships.value = m
}
onMounted(refreshGroups)

async function createGroup(): Promise<void> {
  const name = newGroupName.value.trim()
  if (name === '') return
  try {
    await api.groups.create(name)
    newGroupName.value = ''
    groupError.value = ''
    await refreshGroups()
  } catch (e) {
    groupError.value = e instanceof Error ? e.message : String(e)
  }
}

async function saveRename(): Promise<void> {
  if (renamingGroupId.value == null || renameDraft.value.trim() === '') return
  await api.groups.rename(renamingGroupId.value, renameDraft.value)
  renamingGroupId.value = null
  await refreshGroups()
}

async function removeGroup(g: Group): Promise<void> {
  const ok = await confirmDialog({
    title: '删除组',
    message: `删除组「${g.name}」？组内标签不受影响，只解除这份组织关系。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  await api.groups.remove(g.id)
  await refreshGroups()
}

async function addToGroup(gid: Id, el: HTMLSelectElement): Promise<void> {
  const tid = el.value
  if (tid === '') return
  await api.groups.addMember(gid, tid)
  el.value = ''
  await refreshGroups()
}

async function removeFromGroup(gid: Id, tid: Id): Promise<void> {
  await api.groups.removeMember(gid, tid)
  await refreshGroups()
}

async function batchAddToGroup(): Promise<void> {
  if (batchGroupId.value === '' || checked.value.size === 0) return
  for (const tid of checked.value) await api.groups.addMember(batchGroupId.value, tid)
  batchGroupId.value = ''
  await refreshGroups()
}

// ── 数字键速打（详情页 1..9 直达；映射归标签职能，配置只在此页） ──
const declared = ref<Id[]>([])
const pins = ref<Array<Id | null>>(Array(9).fill(null))

const declaredTags = computed(() => tagStore.allTags.filter((t) => declared.value.includes(t.id)))

async function refreshPins(): Promise<void> {
  if (wsId.value === '') {
    declared.value = []
    return
  }
  declared.value = await api.workspaces.declaredTags(wsId.value)
  const saved = config.value('tags', `pinned:${wsId.value}`, []) as Array<Id | null>
  pins.value = Array.from({ length: 9 }, (_, i) => saved[i] ?? null)
}
onMounted(refreshPins)
watch(wsId, refreshPins)

function setPin(digit: number, tagId: string): void {
  const arr = [...pins.value]
  arr[digit - 1] = tagId === '' ? null : (tagId as Id)
  pins.value = arr
  config.setValue('tags', `pinned:${wsId.value}`, arr)
}

// ── ③ 对统计 ──────────────────────────────────────────────
const cooccur = ref<TagPairStat[]>([])
const mutex = ref<TagPairStat[]>([])
const pairError = ref<string | null>(null)

const nameOf = (id: Id): string => tagStore.byId(id)?.name ?? id

async function refreshPairs(): Promise<void> {
  if (wsId.value === '') return
  try {
    const [a, b] = await Promise.all([
      api.tags.pairStats({ workspaceId: wsId.value, kind: 'cooccur', limit: 12 }),
      api.tags.pairStats({ workspaceId: wsId.value, kind: 'mutex', limit: 12 })
    ])
    cooccur.value = a
    mutex.value = b
    pairError.value = null
  } catch (e) {
    pairError.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(refreshPairs)
</script>

<template>
  <div class="max-w-3xl space-y-10">
    <!-- ① 池总表 -->
    <section>
      <div class="flex items-center gap-2 mb-2">
        <h2 class="text-[13px] font-medium flex-1">
          标签池
          <span class="ml-1 text-[11px] text-[var(--fg-dim)] tabular-nums">{{ tagStore.allTags.length }} 个</span>
        </h2>
        <div class="relative w-56">
          <Search :size="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
          <input v-model="query" class="input pl-8 py-1 text-[12px] w-full" placeholder="搜标签" />
        </div>
      </div>

      <!-- 批量条：勾选后出现 -->
      <div
        v-if="checked.size > 0"
        class="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-md bg-[var(--bg-elev)] border border-[var(--border)] text-[12px]"
      >
        <span class="text-[var(--fg-dim)]">已选 {{ checked.size }} 个</span>
        <button
          class="btn text-[11px]"
          :disabled="wsId === ''"
          :title="wsId === '' ? '从工作区打开本页后可声明' : ''"
          @click="batchDeclare(true)"
        >
          声明到当前工作区
        </button>
        <button
          class="btn text-[11px]"
          :disabled="wsId === ''"
          :title="wsId === '' ? '从工作区打开本页后可取消声明' : ''"
          @click="batchDeclare(false)"
        >
          从工作区取消
        </button>
        <select
          v-model="batchGroupId"
          class="input py-0.5 text-[11px] w-40"
          :disabled="sortedGroups.length === 0"
        >
          <option value="">加入组…</option>
          <option v-for="g in sortedGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button
          class="btn text-[11px]"
          :disabled="batchGroupId === ''"
          @click="batchAddToGroup"
        >
          加入
        </button>
        <button class="btn text-[11px] text-[var(--danger)]" @click="batchDelete">删除…</button>
      </div>

      <table class="w-full text-[12px]">
        <thead class="text-[11px] text-[var(--fg-dim)]">
          <tr class="border-b border-[var(--border)]">
            <th class="w-8"></th>
            <th class="text-left font-normal px-3 py-1.5">名称</th>
            <th class="text-left font-normal px-3 py-1.5">描述</th>
            <th class="text-right font-normal px-3 py-1.5 w-14">挂载</th>
            <th class="text-right font-normal px-3 py-1.5 w-14">声明</th>
            <th class="w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.tag.id"
            class="group border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
          >
              <td class="px-3 py-1.5">
                <input
                  type="checkbox"
                  class="accent-[var(--accent)]"
                  :checked="checked.has(row.tag.id)"
                  @change="toggleCheck(row.tag.id)"
                />
              </td>
              <td class="px-3 py-1.5">{{ row.tag.name }}</td>
              <td class="px-3 py-1.5 text-[var(--fg-dim)]">
                <template v-if="editingId === row.tag.id">
                  <input
                    v-model="draftDesc"
                    class="input py-0.5 text-[12px] w-full"
                    placeholder="一句话说明它管什么"
                    @keydown.enter.prevent="saveEdit"
                    @keydown.esc="editingId = null"
                  />
                </template>
                <template v-else>
                  <span class="block max-w-[14rem] truncate" :title="row.tag.description ?? ''">
                    {{ row.tag.description ?? '—' }}
                  </span>
                </template>
              </td>
              <td class="px-3 py-1.5 text-right tabular-nums text-[var(--fg-dim)]">
                {{ row.stat?.itemCount ?? '…' }}
              </td>
              <td class="px-3 py-1.5 text-right tabular-nums text-[var(--fg-dim)]">
                {{ row.stat?.workspaceCount ?? '…' }}
              </td>
              <td class="px-3 py-1.5">
                <div
                  class="flex items-center gap-1.5 transition-opacity"
                  :class="editingId === row.tag.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                >
                  <template v-if="editingId === row.tag.id">
                    <button class="btn px-1.5 py-0.5 text-[11px]" @click="saveEdit">存</button>
                    <button class="btn px-1.5 py-0.5 text-[11px]" @click="editingId = null">取消</button>
                  </template>
                  <template v-else>
                    <button
                      class="btn px-1.5 py-0.5"
                      title="编辑描述"
                      @click="startEdit(row.tag.id, row.tag.description)"
                    >
                      <Pencil :size="12" />
                    </button>
                    <button
                      class="btn px-1.5 py-0.5 text-[var(--danger)]"
                      title="删除标签"
                      @click="removeOne(row.tag.id, row.tag.name)"
                    >
                      <Trash2 :size="12" />
                    </button>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="6" class="px-3 py-2 text-[var(--fg-dim)]">
                {{ query === '' ? '池是空的' : '没有匹配的标签' }}
              </td>
            </tr>
        </tbody>
      </table>
    </section>

    <!-- ② 组：组织标签的扁平容器（只用组组织；组索引/筛选待定） -->
    <section>
      <div class="flex items-center gap-2 mb-2">
        <h2 class="text-[13px] font-medium flex-1">
          组
          <span class="ml-1 text-[11px] text-[var(--fg-dim)] tabular-nums">{{ sortedGroups.length }} 个</span>
        </h2>
        <input
          v-model="newGroupName"
          class="input py-1 text-[12px] w-48"
          placeholder="新建组"
          @keydown.enter.prevent="createGroup"
        />
        <button class="btn text-[12px]" :disabled="newGroupName.trim() === ''" title="新建组" @click="createGroup">
          <Plus :size="13" />
        </button>
      </div>
      <div v-if="groupError" class="error-note mb-2">{{ groupError }}<button class="ml-1" @click="groupError = ''">✕</button></div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div v-for="g in sortedGroups" :key="g.id" class="border border-[var(--border)] rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <template v-if="renamingGroupId === g.id">
              <input
                v-model="renameDraft"
                class="input py-0.5 text-[12px] flex-1 min-w-0"
                @keydown.enter.prevent="saveRename"
                @keydown.esc="renamingGroupId = null"
              />
              <button class="btn px-1.5 py-0.5 text-[11px]" @click="saveRename">存</button>
              <button class="btn px-1.5 py-0.5 text-[11px]" @click="renamingGroupId = null">取消</button>
            </template>
            <template v-else>
              <span class="text-[12px] font-medium truncate flex-1">{{ g.name }}</span>
              <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ membersOf(g.id).length }}</span>
              <button
                class="btn px-1.5 py-0.5"
                title="重命名"
                @click="renamingGroupId = g.id; renameDraft = g.name"
              >
                <Pencil :size="12" />
              </button>
              <button class="btn px-1.5 py-0.5 text-[var(--danger)]" title="删除组" @click="removeGroup(g)">
                <Trash2 :size="12" />
              </button>
            </template>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="tid in membersOf(g.id)" :key="tid" class="chip">
              {{ nameOf(tid) }}
              <button
                class="cursor-pointer hover:text-[var(--danger)] inline-flex"
                title="移出组"
                @click="removeFromGroup(g.id, tid)"
              >
                <X :size="10" />
              </button>
            </span>
            <span v-if="membersOf(g.id).length === 0" class="text-[11px] text-[var(--fg-dim)]">空组</span>
          </div>
          <div class="flex items-center gap-1.5">
            <select
              class="input py-0.5 text-[12px] flex-1 min-w-0"
              :disabled="candidatesOf(g.id).length === 0"
              @change="addToGroup(g.id, $event.target as HTMLSelectElement)"
            >
              <option value="">添加标签…</option>
              <option v-for="t in candidatesOf(g.id)" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
        </div>
        <div v-if="sortedGroups.length === 0" class="text-[12px] text-[var(--fg-dim)]">
          还没有组——建一个，把同类的标签放进去。
        </div>
      </div>
    </section>

    <!-- 数字键速打：详情页 1..9 直达（映射归标签职能，配置只在此页） -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">数字键速打</h2>
      <p v-if="wsId === ''" class="text-[12px] text-[var(--fg-dim)]">
        按工作区生效，从工作区打开本页后可配置。
      </p>
      <template v-else>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div v-for="digit in 9" :key="digit" class="flex items-center gap-2">
            <span class="kbd w-6 text-center shrink-0">{{ digit }}</span>
            <select
              class="input py-0.5 text-[12px] flex-1 min-w-0"
              :value="pins[digit - 1] ?? ''"
              :disabled="declaredTags.length === 0"
              @change="setPin(digit, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">未指定</option>
              <option v-for="t in declaredTags" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
        </div>
        <p v-if="declaredTags.length === 0" class="text-[11px] text-[var(--fg-dim)] mt-1.5">
          本工作区还没有已声明的标签。
        </p>
      </template>
    </section>

    <!-- ③ 对统计（共现 / 互斥） -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">统计</h2>
      <p v-if="wsId === ''" class="text-[12px] text-[var(--fg-dim)]">
        统计按工作区成员口径，从工作区打开本页后可用。
      </p>
      <template v-else>
        <div v-if="pairError" class="error-note mb-2">{{ pairError }}<button class="ml-1" @click="pairError = null">✕</button></div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div class="panel-label mb-1.5">经常一起出现</div>
            <div class="divide-y divide-[var(--border)]">
              <div
                v-for="r in cooccur"
                :key="`${r.a}-${r.b}`"
                class="flex items-center gap-2 px-3 py-1.5 text-[12px]"
              >
                <span class="truncate">{{ nameOf(r.a) }} + {{ nameOf(r.b) }}</span>
                <span class="ml-auto tabular-nums text-[var(--fg-dim)] shrink-0">{{ r.together }} 项</span>
              </div>
              <div v-if="cooccur.length === 0" class="px-3 py-2 text-[11px] text-[var(--fg-dim)]">还没有共同出现的对</div>
            </div>
          </div>
          <div>
            <div class="panel-label mb-1.5">从未一起出现</div>
            <div class="divide-y divide-[var(--border)]">
              <div
                v-for="r in mutex"
                :key="`${r.a}-${r.b}`"
                class="flex items-center gap-2 px-3 py-1.5 text-[12px]"
              >
                <span class="truncate">{{ nameOf(r.a) }} · {{ nameOf(r.b) }}</span>
                <span class="ml-auto tabular-nums text-[var(--fg-dim)] shrink-0">
                  各 {{ r.aCount }} / {{ r.bCount }} 项
                </span>
              </div>
              <div v-if="mutex.length === 0" class="px-3 py-2 text-[11px] text-[var(--fg-dim)]">没有互斥的对</div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileCog, FolderInput, PenLine, Trash2 } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { api } from '@shared/api'
import { confirmDialog } from '../../features/services/dialog'

/**
 * 文件管理功能组件 v1：对**多选集**做真实文件操作（改名 / 移动 / 删除进回收站）。
 * 磁盘操作经窄桥 fs.move / fs.trash（路径闸门 = 来源根）；操作后自动重扫——
 * 条目与标签的随动由扫描的 contentHash 认领收敛（移动保 id，删除进 missing/回收站）。
 */
const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const itemStore = useItemStore()

const newName = ref('')
const targetDir = ref('')
const error = ref('')
const busy = ref(false)

const selected = computed(() => itemStore.items.filter((i) => itemStore.isSelected(i.id)))
const single = computed(() => (selected.value.length === 1 ? selected.value[0] : null))

function reset(): void {
  newName.value = ''
  targetDir.value = ''
}

async function run(action: () => Promise<void>): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    await action()
    reset()
    // 磁盘已变 → 重扫收敛（认领保标签）
    await itemStore.scan(props.workspaceId)
    itemStore.clearSelection()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** 重命名（仅单选）：同目录内改名。 */
function rename(): void {
  const item = single.value
  const name = newName.value.trim()
  if (item?.sourceUri == null || !name || name === item.title) return
  const slash = item.sourceUri.lastIndexOf('/')
  const dir = slash < 0 ? '' : item.sourceUri.slice(0, slash)
  void run(async () => {
    await api.fs.move(props.workspaceId, item.sourceUri!, dir, name)
  })
}

/** 移动（可多选）：全部移入目标目录。 */
function moveAll(): void {
  const dir = targetDir.value.trim()
  if (!dir || selected.value.length === 0) return
  void run(async () => {
    for (const item of selected.value) {
      if (item.sourceUri != null) await api.fs.move(props.workspaceId, item.sourceUri, dir)
    }
  })
}

/** 删除（进系统回收站，可多选）。 */
function trashAll(): void {
  const paths = selected.value.map((i) => i.sourceUri).filter((p): p is string => p != null)
  if (paths.length === 0) return
  void (async () => {
    const ok = await confirmDialog({
      title: '删除文件',
      message: `把 ${paths.length} 个文件移入系统回收站？\n条目将随下次扫描标为 missing（标签保留）。`,
      confirmText: '删除',
      danger: true
    })
    if (!ok) return
    await run(async () => {
      for (const p of paths) await api.fs.trash(props.workspaceId, p)
    })
  })()
}
</script>

<template>
  <aside
    class="w-72 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3 space-y-3 text-[12px]">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)]">文件管理</div>

      <div v-if="selected.length === 0" class="text-[var(--fg-dim)]">
        先在网格中选中条目（Ctrl/Cmd+单击），此处对其真实文件执行改名 / 移动 / 删除。
      </div>

      <template v-else>
        <!-- 选中清单 -->
        <div class="rounded bg-[var(--bg)] px-2 py-1.5">
          <div class="text-[var(--fg-dim)] mb-1">已选 {{ selected.length }} 项</div>
          <div
            v-for="i in selected.slice(0, 8)"
            :key="i.id"
            class="truncate text-[11px] text-[var(--fg-dim)]"
            :title="i.sourceUri ?? i.title"
          >
            {{ i.sourceUri ?? i.title }}
          </div>
          <div v-if="selected.length > 8" class="text-[11px] text-[var(--fg-dim)] opacity-70">
            …等 {{ selected.length }} 项
          </div>
        </div>

        <!-- 重命名（仅单选） -->
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-[var(--fg-dim)]">
            <PenLine :size="12" />
            <span>重命名（单选）</span>
          </div>
          <div class="flex gap-1.5">
            <input
              v-model="newName"
              class="input text-[12px] flex-1 min-w-0"
              :placeholder="single?.title ?? '—'"
              :disabled="single == null || busy"
              @keyup.enter="rename"
            />
            <button class="btn text-[11px]" :disabled="single == null || busy || !newName.trim()" title="重命名" @click="rename">
              应用
            </button>
          </div>
        </div>

        <!-- 移动到目录 -->
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-[var(--fg-dim)]">
            <FolderInput :size="12" />
            <span>移动到目录（绝对路径）</span>
          </div>
          <div class="flex gap-1.5">
            <input
              v-model="targetDir"
              class="input text-[12px] flex-1 min-w-0"
              placeholder="如 D:\media\归档"
              :disabled="busy"
              @keyup.enter="moveAll"
            />
            <button class="btn text-[11px]" :disabled="busy || !targetDir.trim()" title="移动" @click="moveAll">
              移动
            </button>
          </div>
        </div>

        <!-- 删除（回收站） -->
        <button
          class="btn text-[11px] w-full justify-center"
          :class="'text-[var(--danger)] hover:text-[var(--danger)]'"
          :disabled="busy"
          @click="trashAll"
        >
          <Trash2 :size="12" />
          删除（进回收站）
        </button>
      </template>

      <div
        v-if="error"
        class="px-2 py-1.5 rounded text-[11px]"
        style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
      >
        {{ error }}
        <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
      </div>

      <div class="text-[11px] text-[var(--fg-dim)] opacity-70 flex items-start gap-1">
        <FileCog :size="11" class="shrink-0 mt-px" />
        <span>操作只改磁盘；重扫按内容签名认领，移动后条目与标签原样保留。</span>
      </div>
    </div>
  </aside>
</template>

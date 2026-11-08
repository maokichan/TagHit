<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderInput, PenLine, Trash2 } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { api } from '@shared/api'
import { confirmDialog } from '../../features/services/dialog'

/**
 * 文件管理功能组件 v1：对**多选集**做真实文件操作（改名 / 移动 / 删除进回收站）。
 * 磁盘操作经窄桥 fs.move / fs.trash（路径闸门 = 来源根）；**应用内操作直改库**
 * （用例内同事务改写条目与节点行，保 id 保标签；删除连条目记录一并清除）——
 * 不重扫，只有应用外的改动才需要扫描收敛。
 */
const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const itemStore = useItemStore()
const { t } = useI18n()

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
    // 库已在用例内直改，这里只需刷新当前视图（不重扫）
    await itemStore.load(props.workspaceId)
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

/** 删除（进系统回收站，可多选）：删除即删除——条目记录级联清除，不标缺失。 */
function trashAll(): void {
  const paths = selected.value.map((i) => i.sourceUri).filter((p): p is string => p != null)
  if (paths.length === 0) return
  void (async () => {
    const ok = await confirmDialog({
      title: t('files.deleteTitle'),
      message: t('files.deleteConfirm', { n: paths.length }),
      confirmText: t('files.delete'),
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
  <div class="px-3 py-3">
    <div class="panel-label">{{ $t('files.title') }}</div>

    <div v-if="selected.length === 0" class="text-[var(--fg-dim)]">
      {{ $t('files.emptyHint') }}
    </div>

    <template v-else>
      <!-- 选中清单 -->
      <div class="bg-[var(--bg)] px-2 py-1.5">
        <div class="text-[var(--fg-dim)] mb-1">{{ $t('files.selectedCount', { n: selected.length }) }}</div>
        <div
          v-for="i in selected.slice(0, 8)"
          :key="i.id"
          class="truncate text-[11px] text-[var(--fg-dim)]"
          :title="i.sourceUri ?? i.title"
        >
          {{ i.sourceUri ?? i.title }}
        </div>
        <div v-if="selected.length > 8" class="text-[11px] text-[var(--fg-dim)] opacity-70">
          {{ $t('files.moreCount', { n: selected.length }) }}
        </div>
      </div>

      <!-- 重命名（仅单选） -->
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 text-[var(--fg-dim)]">
          <PenLine :size="12" />
          <span>{{ $t('files.rename.label') }}</span>
        </div>
        <div class="flex gap-1.5">
          <input
            v-model="newName"
            class="input text-[12px] flex-1 min-w-0"
            :placeholder="single?.title ?? '—'"
            :disabled="single == null || busy"
            @keyup.enter="rename"
          />
          <button class="btn text-[11px]" :disabled="single == null || busy || !newName.trim()" :title="$t('files.rename.title')" @click="rename">
            {{ $t('files.rename.button') }}
          </button>
        </div>
      </div>

      <!-- 移动到目录 -->
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 text-[var(--fg-dim)]">
          <FolderInput :size="12" />
          <span>{{ $t('files.move.label') }}</span>
        </div>
        <div class="flex gap-1.5">
          <input
            v-model="targetDir"
            class="input text-[12px] flex-1 min-w-0"
            :placeholder="$t('files.move.placeholder')"
            :disabled="busy"
            @keyup.enter="moveAll"
          />
          <button class="btn text-[11px]" :disabled="busy || !targetDir.trim()" :title="$t('files.move.title')" @click="moveAll">
            {{ $t('files.move.button') }}
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
        {{ $t('files.delete') }}
      </button>
    </template>

    <div v-if="error" class="error-note">
      {{ error }}
      <button class="ml-1" @click="error = ''">✕</button>
    </div>
  </div>
</template>

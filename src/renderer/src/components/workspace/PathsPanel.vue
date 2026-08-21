<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { FolderOpen, Plus, Trash2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useItemStore } from '../../stores/item'

const props = defineProps<{ workspaceId: number; side?: 'left' | 'right' }>()
const workspaceStore = useWorkspaceStore()
const itemStore = useItemStore()
const ws = computed(() => workspaceStore.byId(props.workspaceId))

async function refresh(): Promise<void> {
  await workspaceStore.refresh()
}
onMounted(refresh)
watch(() => props.workspaceId, refresh)

async function addPath(): Promise<void> {
  const path = await window.api.dialog.pickFolder()
  if (!path) return
  await workspaceStore.addPath({ workspaceId: props.workspaceId, path })
  // 目录变更后自动扫描，减少手动操作
  void itemStore.scan(props.workspaceId)
}

async function removePath(pathId: number, path: string): Promise<void> {
  const ok = await window.api.dialog.confirm({
    title: '移除路径',
    message: `确定从工作区移除路径「${path}」？\n其下条目将从本工作区移除（条目/标签/元数据保留，重新添加路径即可恢复）。`
  })
  if (!ok) return
  await workspaceStore.removePath(pathId, props.workspaceId)
  void itemStore.scan(props.workspaceId)
}
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">工作区路径</div>
      <div v-if="ws?.paths.length" class="space-y-1">
        <div
          v-for="p in ws.paths"
          :key="p.id"
          class="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg)] text-[12px]"
        >
          <FolderOpen :size="13" class="shrink-0 text-[var(--fg-dim)]" />
          <span class="truncate flex-1" :title="p.path">{{ p.path }}</span>
          <button
            class="text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer"
            title="移除路径"
            @click.stop="removePath(p.id, p.path)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
      <div v-else class="text-[12px] text-[var(--fg-dim)] px-1 mb-1">尚未配置扫描路径</div>
      <button class="btn text-[12px] mt-1 w-full justify-center" @click="addPath">
        <Plus :size="13" /> 添加目录
      </button>
    </div>
  </aside>
</template>

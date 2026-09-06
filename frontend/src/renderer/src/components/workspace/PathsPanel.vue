<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { FolderOpen, Plus, Trash2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useItemStore } from '../../stores/item'
import type { WorkspaceRoot } from '@shared/contract'

/**
 * 来源根面板（0.2 模型：工作区 = 来源根集合）。
 * 原生目录选择器不在契约 v0：改为手动输入绝对路径，回车/按钮挂载。
 */
const props = defineProps<{ workspaceId: string; side?: 'left' | 'right' }>()
const workspaceStore = useWorkspaceStore()
const itemStore = useItemStore()

const roots = ref<WorkspaceRoot[]>([])
const newPath = ref('')

async function refresh(): Promise<void> {
  roots.value = await workspaceStore.listRoots(props.workspaceId)
}
onMounted(refresh)
watch(() => props.workspaceId, refresh)

async function addPath(): Promise<void> {
  const path = newPath.value.trim()
  if (!path) return
  await workspaceStore.addPath(props.workspaceId, path)
  newPath.value = ''
  await refresh()
  // 目录变更后自动扫描，减少手动操作
  void itemStore.scan(props.workspaceId)
}

async function removePath(root: WorkspaceRoot): Promise<void> {
  // 原生确认框不在契约 v0：用渲染层 confirm 兜底
  const ok = window.confirm(
    `确定从工作区移除路径「${root.path}」？\n其下条目将脱离本工作区视图（条目/标签保留，重新挂载即可恢复）。`
  )
  if (!ok) return
  await workspaceStore.removePath(props.workspaceId, root.path)
  await refresh()
  void itemStore.scan(props.workspaceId)
}
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2">来源根</div>
      <div v-if="roots.length" class="space-y-1">
        <div
          v-for="r in roots"
          :key="r.path"
          class="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg)] text-[12px]"
        >
          <FolderOpen :size="13" class="shrink-0 text-[var(--fg-dim)]" />
          <span class="truncate flex-1" :title="r.path">{{ r.path }}</span>
          <button
            class="text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer"
            title="移除来源根"
            @click.stop="removePath(r)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
      <div v-else class="text-[12px] text-[var(--fg-dim)] px-1 mb-1">尚未挂载来源根</div>

      <div class="flex gap-1.5 mt-2">
        <input
          v-model="newPath"
          class="input text-[12px] flex-1 min-w-0"
          placeholder="绝对路径，如 D:\media"
          title="原生目录选择器待宿主能力落地，先手动输入绝对路径"
          @keyup.enter="addPath"
        />
        <button class="btn text-[12px]" title="挂载来源根" @click="addPath">
          <Plus :size="13" />
        </button>
      </div>
    </div>
  </aside>
</template>

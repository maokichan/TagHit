<script setup lang="ts">
/**
 * 功能组件：工作区信息（displayPanel 区块）。
 *
 * 贡献点 v0 垂直切片：第一个**消费 HostApi 契约**的官方功能组件
 * （workspace.listRoots + workspace.declaredTags 两端点），验证
 * "manifest → 注册表 → 壳渲染 → 窄桥用例"全链路。
 */
import { onMounted, ref, watch } from 'vue'
import { useTabStore } from '../../../stores/tab'
import { api, ApiError } from '@shared/api'

const tabStore = useTabStore()

const rootCount = ref(0)
const declaredCount = ref(0)
const error = ref<string | null>(null)

async function refresh(workspaceId: string | null): Promise<void> {
  error.value = null
  if (workspaceId == null) {
    rootCount.value = 0
    declaredCount.value = 0
    return
  }
  try {
    const [roots, declared] = await Promise.all([
      api.workspaces.listRoots(workspaceId),
      api.workspaces.declaredTags(workspaceId)
    ])
    rootCount.value = roots.length
    declaredCount.value = declared.length
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  }
}

onMounted(() => void refresh(tabStore.activeWorkspaceId))
watch(() => tabStore.activeWorkspaceId, (ws) => void refresh(ws))
</script>

<template>
  <!-- 未打开工作区：没有信息可显示，整块不渲染（不渲染死块与说明） -->
  <div v-if="tabStore.activeWorkspaceId != null">
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">{{ $t('display.workspaceInfo.label') }}</div>
    <div class="space-y-1 text-[12px]">
      <div class="flex justify-between">
        <span class="text-[var(--fg-dim)]">{{ $t('display.workspaceInfo.roots') }}</span>
        <span class="tabular-nums">{{ rootCount }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--fg-dim)]">{{ $t('display.workspaceInfo.declaredTags') }}</span>
        <span class="tabular-nums">{{ declaredCount }}</span>
      </div>
    </div>
    <p v-if="error" class="text-[11px] text-[var(--danger)] mt-1.5">{{ error }}</p>
  </div>
</template>

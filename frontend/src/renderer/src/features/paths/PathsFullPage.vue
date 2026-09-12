<script setup lang="ts">
/**
 * 路径管理（来源根）——**全页呈现面**（contentTab）。
 *
 * 全页不复用窄面板（用户裁决 2026-09-12）：窄面板的纵向堆叠在宽屏下浪费空间，
 * 这里按"左树右栏"重排——左栏目录树（可深可宽），右栏摘要/扫描/脱根处置。
 * 数据与动作仍与停靠面板同一份（usePathManagement），差异只在布局。
 * 外壳（页头 + 内容区）由壳的全页外壳提供。
 */
import { onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useItemStore } from '../../stores/item'
import { providePathManagement } from './usePathManagement'
import RootTree from './RootTree.vue'
import VisibilitySummaryBar from './VisibilitySummaryBar.vue'
import RelocationPanel from './RelocationPanel.vue'

const props = defineProps<{ workspaceId?: string | null }>()
const itemStore = useItemStore()
const workspaceId = props.workspaceId ?? ''
const pm = providePathManagement(workspaceId)
const { error, mgmt, summary, roots } = pm
void onMounted(() => {
  // 无活动工作区（例如从主页直接开这个标签页）→ 不取数，只给提示
  if (workspaceId !== '') void pm.refresh()
})
</script>

<template>
  <div v-if="workspaceId === ''" class="h-full flex items-center justify-center px-6 text-center">
    <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
      路径管理按工作区生效。<br />先打开一个工作区标签页，再从那里打开本页。
    </p>
  </div>
  <div v-else class="h-full min-h-0 flex">
    <!-- 左栏：来源根树（全页给足宽度，长路径不必截断） -->
    <section class="flex-1 min-w-0 min-h-0 overflow-y-auto px-5 py-4">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-[13px] font-medium flex-1">
          来源根
          <span class="ml-1 text-[11px] text-[var(--fg-dim)] tabular-nums">{{ roots.length }} 个</span>
        </h2>
        <button
          class="btn text-[12px]"
          :disabled="itemStore.scanning || roots.length === 0"
          :title="roots.length ? '重扫全部来源根（内容签名认领移动/改名）' : '尚未挂载来源根'"
          @click="itemStore.scan(workspaceId)"
        >
          <RefreshCw :size="13" :class="{ animate: itemStore.scanning }" />
          {{ itemStore.scanning ? '扫描中…' : '扫描' }}
        </button>
      </div>

      <div
        v-if="itemStore.lastScanResult"
        class="mb-3 px-2.5 py-1.5 rounded text-[11px] text-[var(--fg-dim)] bg-[var(--bg)] border border-[var(--border)]"
      >
        上次扫描：+{{ itemStore.lastScanResult.itemsCreated }} 新增 /
        {{ itemStore.lastScanResult.itemsUpdated }} 更新 /
        {{ itemStore.lastScanResult.itemsRelocated }} 认领 /
        {{ itemStore.lastScanResult.itemsMissing }} 缺失（{{ itemStore.lastScanResult.scannedRoots }} 个来源根）
      </div>

      <RootTree />
    </section>

    <!-- 右栏：摘要 + 脱根处置 -->
    <aside class="w-80 shrink-0 min-h-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elev)] px-4 py-4 space-y-3">
      <h2 class="text-[13px] font-medium">可见性与脱根条目</h2>

      <VisibilitySummaryBar />

      <div class="pt-1 text-[11px] text-[var(--fg-dim)] leading-relaxed">
        可见性 = 当前工作区浏览/排序的成员前提（excluded 只隐藏该目录的**直接**条目，不级联）；
        「只看此节点」是视图范围，不改可见性。
      </div>

      <div
        v-if="error"
        class="px-2 py-1.5 rounded text-[11px]"
        style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
      >
        {{ error }}
        <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
      </div>

      <div v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)" class="pt-2 border-t border-[var(--border)]">
        <RelocationPanel />
      </div>
      <p v-else-if="summary" class="pt-2 border-t border-[var(--border)] text-[11px] text-[var(--fg-dim)] leading-relaxed">
        没有脱离来源根的条目。卸载来源根会在此留下记录，供你决定条目去留。
      </p>
    </aside>
  </div>
</template>

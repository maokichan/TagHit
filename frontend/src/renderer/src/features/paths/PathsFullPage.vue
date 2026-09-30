<script setup lang="ts">
/**
 * 来源根 —— **全页呈现面**（contentTab）。
 *
 * 版式（2026-09-12 用户裁定）：
 * - 版心由壳的全页外壳提供（居中 + 最大宽度），本组件**不自建侧栏**——
 *   之前的 `w-80` 固定右栏是"没必要"的窄边栏，改为单列上下分区；
 * - **批量与去留处置在这里**：一键恢复全部可见、已卸载来源根与脱根条目的重新挂载/清理、
 *   扫描与上次结果概览；窄面板只做就地轻量操作。
 * 数据与动作与停靠面板同一份（usePathManagement），差异只在版式。
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
  // 无工作区上下文（例如从主页新建的全页标签页）→ 不取数，只给提示
  if (workspaceId !== '') void pm.refresh()
})
</script>

<template>
  <div v-if="workspaceId === ''" class="flex items-center justify-center py-16 text-center">
    <p class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
      来源根按工作区生效。<br />先打开一个工作区标签页，再从那里打开本页。
    </p>
  </div>

  <div v-else class="space-y-6">
    <!-- ① 概览与工具：扫描 + 上次结果 -->
    <section>
      <div class="flex items-center gap-2 mb-2">
        <h2 class="text-[13px] font-medium flex-1">
          已挂载的来源根
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
        class="px-2.5 py-1.5 rounded text-[11px] text-[var(--fg-dim)] bg-[var(--bg-elev)] border border-[var(--border)]"
      >
        上次扫描：+{{ itemStore.lastScanResult.itemsCreated }} 新增 /
        {{ itemStore.lastScanResult.itemsUpdated }} 更新 /
        {{ itemStore.lastScanResult.itemsRelocated }} 认领 /
        {{ itemStore.lastScanResult.itemsMissing }} 缺失（{{ itemStore.lastScanResult.scannedRoots }} 个来源根）
        <span v-if="itemStore.lastScanResult.dirsUnreadable > 0" class="text-[var(--danger)]">
          · {{ itemStore.lastScanResult.dirsUnreadable }} 个目录不可读（已跳过其子树，未当消失处理）
        </span>
        <span v-if="itemStore.lastScanResult.filesUnreadable > 0" class="text-[var(--danger)]">
          · {{ itemStore.lastScanResult.filesUnreadable }} 个文件不可读（已跳过，未当消失处理）
        </span>
      </div>
    </section>

    <!-- ② 可见性：摘要 + 一键恢复全部（批量只在此页） -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">可见性</h2>
      <VisibilitySummaryBar allow-bulk />
      <p class="mt-2 text-[11px] text-[var(--fg-dim)] leading-relaxed">
        可见性 = 当前工作区浏览/排序的成员前提（excluded 只隐藏该目录的**直接**条目，不级联）；
        「只看此节点」是视图范围，不改可见性。
      </p>
    </section>

    <!-- ③ 目录树：逐节点可见性与只看某节点 -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">目录与可见性</h2>
      <RootTree />
    </section>

    <div
      v-if="error"
      class="px-2.5 py-1.5 rounded text-[11px]"
      style="background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger)"
    >
      {{ error }}
      <button class="ml-1 cursor-pointer opacity-70 hover:opacity-100" @click="error = ''">✕</button>
    </div>

    <!-- ④ 脱根条目：去留处置 -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">已卸载的来源根与脱根条目</h2>
      <RelocationPanel v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)" />
      <p v-else-if="summary" class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
        没有脱离来源根的条目。卸载来源根会在此留下记录，供你决定条目去留。
      </p>
    </section>
  </div>
</template>

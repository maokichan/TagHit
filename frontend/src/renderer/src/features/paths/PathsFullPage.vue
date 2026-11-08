<script setup lang="ts">
/**
 * 来源根 —— **全页呈现面**（contentTab）。
 *
 * 版式（用户裁定）：
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
      {{ $t('paths.noWorkspaceHint') }}<br />{{ $t('paths.noWorkspaceHintAction') }}
    </p>
  </div>

  <div v-else class="max-w-3xl space-y-10">
    <!-- ① 概览与工具：扫描 + 上次结果 -->
    <section>
      <div class="flex items-center gap-2 mb-2">
        <h2 class="text-[13px] font-medium flex-1">
          {{ $t('paths.mountedTitle') }}
          <span class="ml-1 text-[11px] text-[var(--fg-dim)] tabular-nums">{{ $t('paths.rootCount', { n: roots.length }) }}</span>
        </h2>
        <button
          class="btn text-[12px]"
          :disabled="itemStore.scanning || roots.length === 0"
          :title="roots.length ? $t('paths.rescanHint') : $t('paths.noRootsHint')"
          @click="itemStore.scan(workspaceId)"
        >
          <RefreshCw :size="13" :class="{ animate: itemStore.scanning }" />
          {{ itemStore.scanning ? $t('paths.scanning') : $t('paths.scan') }}
        </button>
      </div>

      <div
        v-if="itemStore.lastScanResult"
        class="px-2.5 py-1.5 text-[11px] text-[var(--fg-dim)] bg-[var(--bg-elev)]"
      >
        {{
          $t('paths.lastScan', {
            created: itemStore.lastScanResult.itemsCreated,
            updated: itemStore.lastScanResult.itemsUpdated,
            relocated: itemStore.lastScanResult.itemsRelocated,
            missing: itemStore.lastScanResult.itemsMissing,
            roots: itemStore.lastScanResult.scannedRoots
          })
        }}
        <span v-if="itemStore.lastScanResult.dirsUnreadable > 0" class="text-[var(--danger)]">
          {{ $t('paths.dirsUnreadable', { n: itemStore.lastScanResult.dirsUnreadable }) }}
        </span>
        <span v-if="itemStore.lastScanResult.filesUnreadable > 0" class="text-[var(--danger)]">
          {{ $t('paths.filesUnreadable', { n: itemStore.lastScanResult.filesUnreadable }) }}
        </span>
      </div>
    </section>

    <!-- ② 可见性：摘要 + 一键恢复全部（批量只在此页） -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">{{ $t('paths.visibilityTitle') }}</h2>
      <VisibilitySummaryBar allow-bulk />
    </section>

    <!-- ③ 目录树：逐节点可见性与只看某节点 -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">{{ $t('paths.treeTitle') }}</h2>
      <RootTree />
    </section>

    <div v-if="error" class="error-note">
      {{ error }}
      <button class="ml-1" @click="error = ''">✕</button>
    </div>

    <!-- ④ 脱根条目：去留处置 -->
    <section>
      <h2 class="text-[13px] font-medium mb-2">{{ $t('paths.relocationTitle') }}</h2>
      <RelocationPanel v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)" />
      <p v-else-if="summary" class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
        {{ $t('paths.relocationEmpty') }}
      </p>
    </section>
  </div>
</template>

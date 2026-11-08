<script setup lang="ts">
/**
 * 脱根条目区（共用块）：退役根（卸载记录）+ 无记录残留的去留处置。
 * - 退役根行：精确路径 + 卸载时间 + 条目数 →「重新挂载」恢复归属 /「清理条目」删条目（不可恢复）
 * - 无记录残留：按父目录聚合 →「挂载」恢复可见 /「清理」按子树清理
 * 清理安全性由宿主侧构造保证：候选集恒为"当前不属于任何来源根"的条目。
 */
import { ref } from 'vue'
import { Archive, HelpCircle } from 'lucide-vue-next'
import { usePathManagement } from './usePathManagement'

const pm = usePathManagement()
const { mgmt } = pm
/** 无记录分组默认收起（可能有很多组）。 */
const showUntracked = ref(false)
</script>

<template>
  <div v-if="mgmt && (mgmt.retired.length || mgmt.untrackedTotal)" class="space-y-1">
    <div class="panel-label">{{ $t('paths.retiredTitle') }}</div>

    <!-- 退役根（有记录）：条目仍在库中，去留在此决定 -->
    <div
      v-for="row in mgmt.retired"
      :key="row.path"
      class="px-2 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
    >
      <div class="flex items-center gap-1.5">
        <Archive :size="12" class="shrink-0 text-[var(--fg-dim)]" />
        <span class="truncate flex-1" :title="row.path">{{ row.path }}</span>
        <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ $t('paths.itemCount', { n: row.itemCount }) }}</span>
      </div>
      <div class="mt-1 flex items-center gap-2.5 pl-5 text-[11px]">
        <button
          class="underline cursor-pointer hover:text-[var(--accent)]"
          :title="$t('paths.restoreRetiredHint')"
          @click="pm.restoreRetired(row)"
        >
          {{ $t('paths.restoreRetired') }}
        </button>
        <button
          class="underline cursor-pointer hover:text-[var(--danger)]"
          :title="$t('paths.purgeItemsHint')"
          @click="pm.purgeDetached(row.path, row.path, row.itemCount)"
        >
          {{ $t('paths.purgeItems') }}
        </button>
        <span class="ml-auto text-[var(--fg-dim)] opacity-70">{{ $t('paths.retiredAt', { date: pm.formatDate(row.retiredAt) }) }}</span>
      </div>
    </div>

    <!-- 无记录的历史残留（卸载记录机制落地前卸载的根） -->
    <div v-if="mgmt.untrackedTotal" class="px-2 py-1.5 text-[12px]">
      <div class="flex items-center gap-1.5">
        <HelpCircle :size="12" class="shrink-0 text-[var(--fg-dim)]" />
        <span class="flex-1" :title="$t('paths.untrackedHint')">
          {{ $t('paths.untrackedTitle') }}
        </span>
        <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ $t('paths.itemCount', { n: mgmt.untrackedTotal }) }}</span>
        <button
          class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
          @click="showUntracked = !showUntracked"
        >
          {{ showUntracked ? $t('paths.collapse') : $t('paths.expandDirs') }}
        </button>
      </div>
      <div v-if="showUntracked" class="mt-1 pl-5 max-h-56 overflow-y-auto">
        <div v-for="g in mgmt.untrackedGroups" :key="g.dirPath" class="flex items-center gap-1.5 py-0.5">
          <span class="truncate flex-1 text-[11px] text-[var(--fg-dim)]" :title="g.dirPath">{{ g.dirPath }}</span>
          <span class="text-[11px] tabular-nums text-[var(--fg-dim)] shrink-0">{{ g.count }}</span>
          <button
            class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
            :title="$t('paths.mountHint')"
            @click="pm.mountGroup(g.dirPath)"
          >
            {{ $t('paths.mount') }}
          </button>
          <button
            class="text-[11px] underline cursor-pointer hover:text-[var(--danger)] shrink-0"
            :title="$t('paths.purgeHint')"
            @click="pm.purgeDetached(g.dirPath, g.dirPath, g.count)"
          >
            {{ $t('paths.purge') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

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
    <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)]">已卸载的来源根</div>

    <!-- 退役根（有记录）：条目仍在库中，去留在此决定 -->
    <div
      v-for="row in mgmt.retired"
      :key="row.path"
      class="px-2 py-1.5 rounded text-[12px] hover:bg-[var(--bg-hover)]"
    >
      <div class="flex items-center gap-1.5">
        <Archive :size="12" class="shrink-0 text-[var(--fg-dim)]" />
        <span class="truncate flex-1" :title="row.path">{{ row.path }}</span>
        <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ row.itemCount }} 条</span>
      </div>
      <div class="mt-1 flex items-center gap-2.5 pl-5 text-[11px]">
        <button
          class="underline cursor-pointer hover:text-[var(--accent)]"
          title="把该目录重新挂回本工作区；随后扫描即恢复条目可见"
          @click="pm.restoreRetired(row)"
        >
          重新挂载
        </button>
        <button
          class="underline cursor-pointer hover:text-[var(--danger)]"
          title="删除该根下的全部条目及其标签挂载（不可恢复；磁盘文件不动）"
          @click="pm.purgeDetached(row.path, row.path, row.itemCount)"
        >
          清理条目…
        </button>
        <span class="ml-auto text-[var(--fg-dim)] opacity-70">卸载于 {{ pm.formatDate(row.retiredAt) }}</span>
      </div>
    </div>

    <!-- 无记录的历史残留（卸载记录机制落地前卸载的根） -->
    <div v-if="mgmt.untrackedTotal" class="px-2 py-1.5 rounded text-[12px]">
      <div class="flex items-center gap-1.5">
        <HelpCircle :size="12" class="shrink-0 text-[var(--fg-dim)]" />
        <span class="flex-1" title="有来源但没有任何来源根覆盖的条目：无卸载记录可归因（旧版遗留）">
          无记录的脱根条目
        </span>
        <span class="text-[11px] text-[var(--fg-dim)] tabular-nums shrink-0">{{ mgmt.untrackedTotal }} 条</span>
        <button
          class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
          @click="showUntracked = !showUntracked"
        >
          {{ showUntracked ? '收起' : '目录…' }}
        </button>
      </div>
      <div v-if="showUntracked" class="mt-1 pl-5 max-h-56 overflow-y-auto">
        <div v-for="g in mgmt.untrackedGroups" :key="g.dirPath" class="flex items-center gap-1.5 py-0.5">
          <span class="truncate flex-1 text-[11px] text-[var(--fg-dim)]" :title="g.dirPath">{{ g.dirPath }}</span>
          <span class="text-[11px] tabular-nums text-[var(--fg-dim)] shrink-0">{{ g.count }}</span>
          <button
            class="text-[11px] underline cursor-pointer hover:text-[var(--accent)] shrink-0"
            title="把此目录挂为本工作区来源根（随后扫描即让这些条目重新可见）"
            @click="pm.mountGroup(g.dirPath)"
          >
            挂载
          </button>
          <button
            class="text-[11px] underline cursor-pointer hover:text-[var(--danger)] shrink-0"
            title="清理此目录及其子目录下的脱根条目（不可恢复）"
            @click="pm.purgeDetached(g.dirPath, g.dirPath, g.count)"
          >
            清理
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

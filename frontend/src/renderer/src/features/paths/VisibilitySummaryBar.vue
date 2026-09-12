<script setup lang="ts">
/**
 * 可见性摘要条（共用块）：解释"为什么看不到全部内容"——可见 / 被排除隐藏 / 无节点归属，
 * 并给出当前浏览范围（只看某节点）的退出入口。
 *
 * `allowBulk` 控制**一键批量**（恢复全部可见）是否出现：窄面板只做就地轻量操作，
 * 批量改可见性属重管理 → 只在全页呈现（2026-09-12 裁决：批量与去留处置归详细页）。
 */
import { Focus, X } from 'lucide-vue-next'
import { usePathManagement } from './usePathManagement'

withDefaults(defineProps<{ allowBulk?: boolean }>(), { allowBulk: false })

const pm = usePathManagement()
const { summary, scopeDirPath } = pm
</script>

<template>
  <div class="space-y-2">
    <!-- 可见性摘要：三类计数（与浏览共用同一份派生译文，故三者之和 = 根下条目总数） -->
    <div
      v-if="summary"
      class="px-2 py-1.5 rounded text-[11px] leading-relaxed bg-[var(--bg)] border border-[var(--border)]"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <span>可见 <b class="tabular-nums">{{ summary.visible }}</b></span>
        <span v-if="summary.hiddenByExcluded" class="text-[var(--danger)]">
          已排除隐藏 <b class="tabular-nums">{{ summary.hiddenByExcluded }}</b>
        </span>
        <span v-if="summary.nodeMissing" class="text-[var(--fg-dim)]">
          无归属 <b class="tabular-nums">{{ summary.nodeMissing }}</b>
        </span>
        <button
          v-if="allowBulk && summary.hiddenByExcluded"
          class="ml-auto underline cursor-pointer hover:text-[var(--accent)]"
          title="把所有被排除的目录恢复为可见（逐节点；不改动未排除目录）"
          @click="pm.restoreAllVisible"
        >
          恢复全部
        </button>
      </div>
      <div
        v-if="summary.nodeMissing"
        class="mt-1 text-[var(--fg-dim)] opacity-80"
        title="条目仍在库中（文件可能还在磁盘上），只是其所在目录已消失或未被扫描到；重新挂载对应来源根并扫描即可恢复"
      >
        无归属：所在目录已消失或未被扫描到
      </div>
    </div>

    <!-- 当前范围（只看某节点）：视图状态，不写库；一键退出 -->
    <div
      v-if="scopeDirPath"
      class="flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] bg-[var(--accent-soft)] text-[var(--accent)]"
    >
      <Focus :size="11" class="shrink-0" />
      <span class="truncate flex-1" :title="scopeDirPath">只看：{{ pm.scopedName() }}</span>
      <button class="cursor-pointer hover:brightness-110" title="退出范围（回到全部可见条目）" @click="pm.clearScope">
        <X :size="11" />
      </button>
    </div>
  </div>
</template>

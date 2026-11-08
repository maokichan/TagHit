<script setup lang="ts">
/**
 * 可见性摘要条（共用块）：解释"为什么看不到全部内容"——可见 / 被排除隐藏 / 无节点归属，
 * 并给出当前浏览范围（只看某节点）的退出入口。
 *
 * `allowBulk` 控制**一键批量**（恢复全部可见）是否出现：窄面板只做就地轻量操作，
 * 批量改可见性属重管理 → 只在全页呈现（裁决：批量与去留处置归详细页）。
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
      class="px-2 py-1.5 text-[11px] leading-relaxed bg-[var(--bg)] border border-[var(--border)]"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <span>{{ $t('paths.visible') }} <b class="tabular-nums">{{ summary.visible }}</b></span>
        <span v-if="summary.hiddenByExcluded" class="text-[var(--danger)]">
          {{ $t('paths.hiddenByExcluded') }} <b class="tabular-nums">{{ summary.hiddenByExcluded }}</b>
        </span>
        <span
          v-if="summary.nodeMissing"
          class="text-[var(--fg-dim)]"
          :title="$t('paths.nodeMissingHint')"
        >
          {{ $t('paths.nodeMissing') }} <b class="tabular-nums">{{ summary.nodeMissing }}</b>
        </span>
        <button
          v-if="allowBulk && summary.hiddenByExcluded"
          class="ml-auto underline cursor-pointer hover:text-[var(--accent)]"
          :title="$t('paths.restoreAllHint')"
          @click="pm.restoreAllVisible"
        >
          {{ $t('paths.restoreAll') }}
        </button>
      </div>
    </div>

    <!-- 当前范围（只看某节点）：视图状态，不写库；一键退出 -->
    <div
      v-if="scopeDirPath"
      class="flex items-center gap-1.5 px-2 py-1.5 text-[11px] bg-[var(--accent-soft)] text-[var(--accent)]"
    >
      <Focus :size="11" class="shrink-0" />
      <span class="truncate flex-1" :title="scopeDirPath">{{ $t('paths.scopeLabel', { name: pm.scopedName() }) }}</span>
      <button class="cursor-pointer hover:brightness-110" :title="$t('paths.exitScopeHint')" @click="pm.clearScope">
        <X :size="11" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ExternalLink, Puzzle } from 'lucide-vue-next'
import { listContributedFeatures, listFeatures } from '../../features/registry'
import { useTabStore } from '../../stores/tab'
import { openFeatureTab } from '../../features/tabs'

defineProps<{ side?: 'left' | 'right' }>()

const tabStore = useTabStore()

/** contentTab 贡献者清单：点击 = 打开/激活其内容标签页（单实例） */
const contentTabs = listFeatures('contentTab')

/** 已装载的三方插件（装载状态如实呈现；安装/启停归分发里程碑） */
const contributed = listContributedFeatures()

function open(featureId: string, title: string): void {
  // 打开瞬间的活动工作区作为上下文固化到标签项（本面板在条目详情页也可用，此时上下文为 null）
  openFeatureTab(featureId, title, tabStore.activeWorkspaceId)
}
</script>

<template>
  <div class="px-3 py-3">
    <div
      class="panel-label mb-2 flex items-center gap-1.5"
    >
      <Puzzle :size="12" /> 插件
    </div>

    <div v-if="contentTabs.length" class="space-y-1 mb-3">
      <button
        v-for="f in contentTabs"
        :key="f.manifest.id"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[12px] cursor-pointer transition-colors"
        @click="open(f.manifest.id, f.manifest.title)"
      >
        <span class="flex-1 text-left truncate">{{ f.manifest.title }}</span>
        <ExternalLink :size="12" class="shrink-0 text-[var(--fg-dim)]" />
      </button>
    </div>

    <div v-if="contributed.length" class="space-y-1 mb-3">
      <div class="panel-label mb-2">已装载</div>
      <div
        v-for="f in contributed"
        :key="f.manifest.id"
        class="flex items-center gap-2 px-2 py-1.5 text-[12px]"
      >
        <span class="flex-1 text-left truncate">{{ f.manifest.title }}</span>
        <span class="shrink-0 text-[11px] text-[var(--fg-dim)]">{{ f.manifest.id }}</span>
      </div>
    </div>

    <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">三方插件尚未开放安装。</p>
  </div>
</template>

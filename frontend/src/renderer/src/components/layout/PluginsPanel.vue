<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ExternalLink, Puzzle } from 'lucide-vue-next'
import { listFeatures } from '../../features/registry'
import { useTabStore } from '../../stores/tab'

defineProps<{ side?: 'left' | 'right' }>()

const router = useRouter()
const tabStore = useTabStore()

/** contentTab 贡献者清单：点击 = 打开/激活其内容标签页（单实例） */
const contentTabs = listFeatures('contentTab')

function open(featureId: string, title: string): void {
  tabStore.openFeature(featureId, title)
  router.push(`/feature/${featureId}`)
}
</script>

<template>
  <aside
    class="w-64 shrink-0 h-full bg-[var(--bg-elev)] overflow-y-auto"
    :class="side === 'right' ? 'border-l border-[var(--border)]' : 'border-r border-[var(--border)]'"
  >
    <div class="px-3 py-3">
      <div
        class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] mb-2 flex items-center gap-1.5"
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

      <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
        官方功能组件经贡献点注册（活动栏/显示面板/设置/内容标签页）。三方插件的动态装载
        （声明 + 惰性加载 + 权限门 + HostApi 冻结面）机制已就绪、发现/分发未接入——
        见 docs/ARCHITECTURE §3。
      </p>
    </div>
  </aside>
</template>

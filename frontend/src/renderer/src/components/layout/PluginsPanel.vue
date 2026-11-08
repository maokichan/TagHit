<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Puzzle } from 'lucide-vue-next'
import { listFeatures } from '../../features/registry'
import { listInstalledPlugins, setPluginEnabled } from '../../features/contributedPlugins'
import { useTabStore } from '../../stores/tab'
import { openFeatureTab } from '../../features/tabs'

defineProps<{ side?: 'left' | 'right' }>()

const tabStore = useTabStore()

/** contentTab 贡献者清单：点击 = 打开/激活其内容标签页（单实例）。
 *  仅官方——三方插件的自开页入口由管理页显形（D47），不在此重复列出。 */
const contentTabs = listFeatures('contentTab').filter((f) => f.manifest.source === 'official')

/** 已安装插件（manifest + 启用态；启停操作后经 refreshList 重取） */
const installed = ref(listInstalledPlugins())

function refreshList(): void {
  installed.value = listInstalledPlugins()
}

async function toggle(featureId: string, next: boolean): Promise<void> {
  await setPluginEnabled(featureId, next)
  refreshList()
}

const hasContributed = computed(() => installed.value.length > 0)

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
      <Puzzle :size="12" /> {{ $t('layout.plugins.title') }}
    </div>

    <div v-if="contentTabs.length" class="space-y-1 mb-3">
      <button
        v-for="f in contentTabs"
        :key="f.manifest.id"
        class="w-full flex items-center gap-2 px-2 py-1.5 bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[12px] cursor-pointer transition-colors"
        @click="open(f.manifest.id, f.manifest.title)"
      >
        <span class="flex-1 text-left truncate">{{ f.manifest.title }}</span>
        <ExternalLink :size="12" class="shrink-0 text-[var(--fg-dim)]" />
      </button>
    </div>

    <div v-if="hasContributed" class="space-y-2 mb-3">
      <div class="panel-label mb-2">{{ $t('layout.plugins.installed') }}</div>
      <!-- 卡片 = 扫视面：只留名称 + 启停开关（D46）；理解与管理进管理页（面板角标，D47） -->
      <div
        v-for="p in installed"
        :key="p.manifest.id"
        class="flex items-center gap-2 border border-[var(--border)] px-2.5 py-2"
        :class="p.enabled ? '' : 'opacity-60'"
        :title="`${p.manifest.id}${p.manifest.description != null ? `\n${p.manifest.description}` : ''}`"
      >
        <span class="flex-1 min-w-0 text-[12px] truncate">{{ p.manifest.title }}</span>
        <button
          type="button"
          class="text-[11px] px-1.5 py-0.5 cursor-pointer transition-colors"
          :class="p.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--fg-dim)]'"
          :title="$t(p.enabled ? 'layout.plugins.disable' : 'layout.plugins.enable')"
          @click="toggle(p.manifest.id, !p.enabled)"
        >
          {{ $t(p.enabled ? 'layout.plugins.enabledOn' : 'layout.plugins.enabledOff') }}
        </button>
      </div>
    </div>

    <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">{{ $t('layout.plugins.manageHint') }}</p>
  </div>
</template>

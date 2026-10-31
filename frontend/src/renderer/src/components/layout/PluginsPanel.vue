<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Puzzle } from 'lucide-vue-next'
import { listFeatures } from '../../features/registry'
import { listDetailPreviews } from '../../features/detailPreview'
import { listInstalledPlugins, setPluginEnabled } from '../../features/contributedPlugins'
import { useTabStore } from '../../stores/tab'
import { openFeatureTab } from '../../features/tabs'

defineProps<{ side?: 'left' | 'right' }>()

const tabStore = useTabStore()

/** contentTab 贡献者清单：点击 = 打开/激活其内容标签页（单实例） */
const contentTabs = listFeatures('contentTab')

/** 已安装插件（manifest + 启用态；启停操作后经 refreshList 重取） */
const installed = ref(listInstalledPlugins())

/** 能力清单 = 该插件当前活跃的 detailPreview 认领面（停用即空，如实呈现）。 */
function abilitiesOf(featureId: string): string[] {
  return listDetailPreviews()
    .filter((p) => p.id.startsWith(`${featureId}:`))
    .map(() => '条目预览接管')
}

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
      <Puzzle :size="12" /> 插件
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
      <div class="panel-label mb-2">已安装</div>
      <div
        v-for="p in installed"
        :key="p.manifest.id"
        class="border border-[var(--border)] px-2.5 py-2"
        :class="p.enabled ? '' : 'opacity-60'"
      >
        <div class="flex items-center gap-2">
          <span class="flex-1 text-[12px] truncate">{{ p.manifest.title }}</span>
          <button
            type="button"
            class="text-[11px] px-1.5 py-0.5 cursor-pointer transition-colors"
            :class="p.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--fg-dim)]'"
            :title="p.enabled ? '停用（贡献摘除，内置预览兜底）' : '启用'"
            @click="toggle(p.manifest.id, !p.enabled)"
          >
            {{ p.enabled ? '启用中' : '已停用' }}
          </button>
        </div>
        <div class="text-[11px] text-[var(--fg-dim)] mt-0.5">{{ p.manifest.id }}</div>
        <div v-if="p.enabled" class="mt-1 space-y-0.5">
          <div v-for="a in abilitiesOf(p.manifest.id)" :key="a" class="text-[11px] text-[var(--fg-dim)]">
            · {{ a }}
          </div>
          <div v-if="abilitiesOf(p.manifest.id).length === 0" class="text-[11px] text-[var(--fg-dim)]">· （无活跃贡献）</div>
        </div>
      </div>
    </div>

    <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">三方插件尚未开放安装。</p>
  </div>
</template>

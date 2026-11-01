<script setup lang="ts">
/**
 * 插件 —— 全页呈现面（contentTab，D47 管理页）：进入后管理全部已安装插件。
 *
 * 每个插件的呈现**经宿主组件**（D47：即便插件没有自开页，这套呈现也必要存在）——
 * 身份事实、贡献面清单（注册表现取，停用即空）、启停、manifest.settings 经
 * SchemaControl 渲染（声明制，插件永不自绘设置 UI）。
 * **自开页** = 插件在 manifest 声明 contentTab + loader 绑定 fullPage 的插件自绘整页
 * ——管理页只显形入口（「打开页面」，点开即新标签页），内容归插件，壳提供容器
 * （FeatureTabView + FeatureBoundary 错误隔离）。
 */
import { computed, ref } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { getFeature, declaresFullPage } from '../registry'
import { listDetailPreviews } from '../detailPreview'
import { listCommands } from '../commands'
import { listInstalledPlugins, setPluginEnabled } from '../contributedPlugins'
import { useConfigStore } from '../../stores/config'
import { openFeatureTab } from '../tabs'
import SchemaControl from '../../components/settings/SchemaControl.vue'
import type { SettingSchema } from '@shared/types/feature'

const config = useConfigStore()

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 已安装插件（manifest + 启用态；启停后经 refresh 重取） */
const installed = ref(listInstalledPlugins())

function refresh(): void {
  installed.value = listInstalledPlugins()
}

const busyId = ref<string | null>(null)
const error = ref<string | null>(null)

async function toggle(featureId: string, next: boolean): Promise<void> {
  if (busyId.value != null) return
  busyId.value = featureId
  error.value = null
  try {
    await setPluginEnabled(featureId, next)
    refresh()
  } catch (e) {
    error.value = message(e)
  } finally {
    busyId.value = null
  }
}

// ---- 贡献面清单（注册表现取，如实呈现；停用即空） ------------------------------
function previewsOf(featureId: string): string[] {
  return listDetailPreviews().filter((p) => p.id.startsWith(`${featureId}:`)).map((p) => p.id)
}
function commandsOf(featureId: string): Array<{ id: string; title: string }> {
  return listCommands()
    .filter((e) => e.manifest.source === 'contributed' && e.manifest.id.startsWith(`${featureId}.`))
    .map((e) => ({ id: e.manifest.id, title: e.manifest.title }))
}
function hasContributions(featureId: string): boolean {
  return previewsOf(featureId).length > 0 || commandsOf(featureId).length > 0
}

// ---- 设置（声明制）：值落 config 仓 `featureId:key` -----------------------------
function settingsOf(featureId: string): SettingSchema[] {
  const manifest = getFeature(featureId)?.manifest
  return (manifest?.settings ?? []).filter((s) => s.type !== 'shortcuts') // 键位表是壳级只读视图，与插件无关
}
const settingValue = (featureId: string, schema: SettingSchema): unknown =>
  config.value(featureId, schema.key, schema.default ?? null)
const updateSetting = (featureId: string, schema: SettingSchema, value: unknown): void => {
  config.setValue(featureId, schema.key, value)
}

/** 自开页入口（D47）：插件声明了 contentTab 才显形；点开 = 新标签页，内容归插件。 */
function openPluginPage(featureId: string, title: string): void {
  openFeatureTab(featureId, title)
}

const hasContributed = computed(() => installed.value.length > 0)
</script>

<template>
  <div class="max-w-3xl space-y-8">
    <div v-if="error" class="error-note" role="alert">
      <span class="min-w-0 flex-1 break-words">{{ error }}</span>
    </div>

    <template v-if="hasContributed">
      <section
        v-for="p in installed"
        :key="p.manifest.id"
        class="panel p-4"
        :class="p.enabled ? '' : 'opacity-60'"
      >
        <div class="flex items-center gap-2 mb-1">
          <h2 class="text-[13px] font-medium flex-1 min-w-0 truncate" :title="p.manifest.title">
            {{ p.manifest.title }}
          </h2>
          <!-- 自开页入口：插件声明了 contentTab 才出现（D47） -->
          <button
            v-if="p.enabled && getFeature(p.manifest.id) != null && declaresFullPage(getFeature(p.manifest.id) ?? null)"
            class="btn h-7 px-2 text-[11px] shrink-0"
            title="打开插件页面（新标签页）"
            @click="openPluginPage(p.manifest.id, p.manifest.title)"
          >
            <ExternalLink :size="12" /> 打开页面
          </button>
          <button
            type="button"
            class="text-[11px] px-1.5 py-0.5 cursor-pointer transition-colors shrink-0"
            :class="p.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--fg-dim)]'"
            :title="p.enabled ? '停用' : '启用'"
            :disabled="busyId != null"
            @click="toggle(p.manifest.id, !p.enabled)"
          >
            {{ p.enabled ? '启用中' : '已停用' }}
          </button>
        </div>
        <div class="text-[11px] text-[var(--fg-dim)] mb-3">
          <span class="font-mono" :title="p.manifest.description ?? undefined">{{ p.manifest.id }}</span>
          <span v-if="p.manifest.description != null"> · {{ p.manifest.description }}</span>
        </div>

        <!-- 贡献面清单 -->
        <div v-if="p.enabled && hasContributions(p.manifest.id)" class="space-y-0.5 mb-3">
          <div v-for="pid in previewsOf(p.manifest.id)" :key="pid" class="text-[12px]">
            · 条目预览 <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ pid }}</span>
          </div>
          <div v-for="c in commandsOf(p.manifest.id)" :key="c.id" class="text-[12px]">
            · 命令「{{ c.title }}」 <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ c.id }}</span>
          </div>
        </div>
        <div v-else-if="p.enabled" class="text-[12px] text-[var(--fg-dim)] mb-3">无活跃贡献</div>

        <!-- 声明的服务（说明进 hover，不占版面） -->
        <div v-if="(p.manifest.surfaces?.length ?? 0) > 0" class="flex flex-wrap gap-1 mb-3">
          <span
            v-for="s in p.manifest.surfaces"
            :key="s"
            class="chip"
            title="声明的壳服务；权限面随分发落地前仅声明不校验"
          >{{ s }}</span>
        </div>

        <!-- 设置（声明制：宿主经 SchemaControl 渲染，值落 config 仓） -->
        <div v-if="settingsOf(p.manifest.id).length > 0" class="space-y-3">
          <SchemaControl
            v-for="s in settingsOf(p.manifest.id)"
            :key="s.key"
            :schema="s"
            :model-value="settingValue(p.manifest.id, s)"
            @update:model-value="updateSetting(p.manifest.id, s, $event)"
          />
        </div>
      </section>
    </template>

    <p v-else class="text-[12px] text-[var(--fg-dim)]">三方插件尚未开放安装。</p>
  </div>
</template>

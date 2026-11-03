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
 *
 * **安装（D48）**：pick zip → peek 预检读包 → 待安装卡（身份/贡献声明/冲突提示）→
 * 确认安装 → 宿主落位 → reloadPlugins 激活。**卸载** = 危险确认 → 宿主删目录 +
 * 渲染层完整摘除。dev-source 条目是仓库开发目录（仅 dev 态出现），无卸载动作。
 * 装载不了的条目（清单校验失败/激活失败/HostApi 超版）以错误卡如实呈现。
 */
import { computed, ref } from 'vue'
import { ExternalLink, PackageOpen, Trash2 } from 'lucide-vue-next'
import { getFeature, declaresFullPage } from '../registry'
import { listCommands } from '../commands'
import { contributionsOf } from '../contribution'
import {
  isPluginEnabled,
  listInstallErrors,
  reloadPlugins,
  removePlugin,
  setPluginEnabled,
} from '../contributedPlugins'
import { useConfigStore } from '../../stores/config'
import { openFeatureTab } from '../tabs'
import { confirmDialog } from '../services/dialog'
import { api } from '@shared/api'
import SchemaControl from '../../components/settings/SchemaControl.vue'
import type { SettingSchema } from '@shared/types/feature'
import type { InstallForm, PluginInstallEntry, PluginManifestFile } from '@shared/contract'

const config = useConfigStore()

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 管理视图行：宿主清单条目 + 启用态 + 激活错误合并（注册表里才有启用态可言）。 */
interface PluginRow {
  id: string
  title: string
  form: InstallForm
  manifest: PluginManifestFile | null
  error: string | null
  registered: boolean
  enabled: boolean
}

const rows = ref<PluginRow[]>([])
const busyId = ref<string | null>(null)
const error = ref<string | null>(null)

async function refresh(): Promise<void> {
  const { installs } = await api.plugins.list()
  const activationErrors = new Map(listInstallErrors().map((e) => [e.id, e.error]))
  rows.value = installs.map((entry: PluginInstallEntry) => {
    const id = entry.manifest?.id ?? entry.id
    const registered = getFeature(id) != null
    return {
      id,
      title: entry.manifest?.title ?? id,
      form: entry.form,
      manifest: entry.manifest,
      error: entry.error ?? activationErrors.get(id) ?? null,
      registered,
      enabled: registered ? isPluginEnabled(id) : false,
    }
  })
}
void refresh()

async function toggle(row: PluginRow, next: boolean): Promise<void> {
  if (busyId.value != null) return
  busyId.value = row.id
  error.value = null
  try {
    await setPluginEnabled(row.id, next)
    await refresh()
  } catch (e) {
    error.value = message(e)
  } finally {
    busyId.value = null
  }
}

async function uninstall(row: PluginRow): Promise<void> {
  if (busyId.value != null) return
  const ok = await confirmDialog({
    title: '卸载插件',
    message: `卸载插件「${row.title}」？其贡献面（预览/命令/页面）将随之消失，可随时重新安装。`,
    confirmText: '卸载',
    danger: true,
  })
  if (!ok) return
  busyId.value = row.id
  error.value = null
  try {
    await api.plugins.uninstall(row.id)
    removePlugin(row.id)
    await refresh()
  } catch (e) {
    error.value = message(e)
  } finally {
    busyId.value = null
  }
}

// ---- 安装（D48）：pick → peek → 待安装卡 → 确认 ---------------------------------
const pending = ref<{ zipPath: string; manifest: PluginManifestFile; conflict: boolean } | null>(null)

async function pickInstall(): Promise<void> {
  if (busyId.value != null) return
  error.value = null
  try {
    const zipPath = await api.dialog.pickZip()
    if (zipPath == null) return
    pending.value = { zipPath, ...(await api.plugins.peek(zipPath)) }
  } catch (e) {
    error.value = message(e)
  }
}

async function confirmInstall(): Promise<void> {
  if (busyId.value != null || pending.value == null) return
  busyId.value = pending.value.manifest.id
  error.value = null
  try {
    await api.plugins.install(pending.value.zipPath)
    await reloadPlugins()
    pending.value = null
    await refresh()
  } catch (e) {
    error.value = message(e)
  } finally {
    busyId.value = null
  }
}

// ---- 贡献面清单（owner 记账现取，如实呈现；停用清扫后即空。D48④：不再按 id 前缀推导） ----
function previewsOf(featureId: string): string[] {
  return contributionsOf(featureId).previews
}
function commandsOf(featureId: string): Array<{ id: string; title: string }> {
  const commands = new Map(listCommands().map((e) => [e.manifest.id, { id: e.manifest.id, title: e.manifest.title }]))
  return contributionsOf(featureId).commands
    .map((id) => commands.get(id))
    .filter((c): c is { id: string; title: string } => c != null)
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

const hasAny = computed(() => rows.value.length > 0)
</script>

<template>
  <div class="max-w-3xl space-y-8">
    <!-- 动作行：安装入口（D48 分发 v1） -->
    <div class="flex items-center gap-2">
      <button
        class="btn h-8 px-3 text-[12px]"
        :disabled="busyId != null"
        title="从 zip 包安装插件"
        @click="pickInstall"
      >
        <PackageOpen :size="14" /> 安装插件
      </button>
    </div>

    <div v-if="error" class="error-note" role="alert">
      <span class="min-w-0 flex-1 break-words">{{ error }}</span>
    </div>

    <!-- 待安装卡：peek 读出的身份事实 + 贡献声明 + 冲突提示，用户拍板后才落位 -->
    <section v-if="pending" class="panel p-4 border-[var(--accent-border)]">
      <div class="flex items-center gap-2 mb-1">
        <h2 class="text-[13px] font-medium flex-1 min-w-0 truncate">待安装：{{ pending.manifest.title }}</h2>
        <span class="text-[11px] text-[var(--fg-dim)] font-mono">v{{ pending.manifest.version }}</span>
      </div>
      <div class="text-[11px] text-[var(--fg-dim)] mb-2">
        <span class="font-mono">{{ pending.manifest.id }}</span>
        <span v-if="pending.manifest.author != null"> · {{ pending.manifest.author }}</span>
        <span v-if="pending.manifest.description != null"> · {{ pending.manifest.description }}</span>
      </div>
      <div class="flex flex-wrap gap-1 mb-2">
        <span
          v-for="m in pending.manifest.mounts ?? []"
          :key="m"
          class="chip"
          title="将贡献的挂载点"
        >{{ m }}</span>
        <span
          v-for="s in pending.manifest.surfaces ?? []"
          :key="s"
          class="chip"
          title="声明的壳服务；权限面仅声明不校验"
        >{{ s }}</span>
      </div>
      <div v-if="pending.conflict" class="text-[12px] mb-2 text-[var(--accent)]">
        已安装同 id 插件——本次安装将覆盖升级。
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn h-7 px-2.5 text-[11px]"
          :disabled="busyId != null"
          @click="confirmInstall"
        >
          {{ pending.conflict ? '覆盖安装' : '确认安装' }}
        </button>
        <button
          class="text-[11px] px-1.5 py-0.5 cursor-pointer bg-[var(--bg-hover)] text-[var(--fg-dim)]"
          :disabled="busyId != null"
          @click="pending = null"
        >
          取消
        </button>
      </div>
    </section>

    <template v-if="hasAny">
      <section
        v-for="p in rows"
        :key="p.id"
        class="panel p-4"
        :class="!p.registered || !p.enabled ? 'opacity-60' : ''"
      >
        <div class="flex items-center gap-2 mb-1">
          <h2 class="text-[13px] font-medium flex-1 min-w-0 truncate" :title="p.manifest?.description ?? undefined">
            {{ p.title }}
          </h2>
          <span v-if="p.manifest?.version != null" class="text-[11px] text-[var(--fg-dim)] font-mono shrink-0">
            v{{ p.manifest.version }}
          </span>
          <span v-if="p.form === 'dev-source'" class="chip shrink-0" title="仓库开发目录：源码经 vite 即时编译，随开发刷新">开发目录</span>
          <!-- 自开页入口：插件声明了 contentTab 才出现（D47） -->
          <button
            v-if="p.enabled && getFeature(p.id) != null && declaresFullPage(getFeature(p.id) ?? null)"
            class="btn h-7 px-2 text-[11px] shrink-0"
            title="打开插件页面（新标签页）"
            @click="openPluginPage(p.id, p.title)"
          >
            <ExternalLink :size="12" /> 打开页面
          </button>
          <button
            v-if="p.registered"
            type="button"
            class="text-[11px] px-1.5 py-0.5 cursor-pointer transition-colors shrink-0"
            :class="p.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--fg-dim)]'"
            :title="p.enabled ? '停用' : '启用'"
            :disabled="busyId != null"
            @click="toggle(p, !p.enabled)"
          >
            {{ p.enabled ? '启用中' : '已停用' }}
          </button>
          <button
            v-if="p.form !== 'dev-source'"
            type="button"
            class="text-[11px] px-1 py-0.5 cursor-pointer shrink-0 text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)]"
            title="卸载（删除安装目录，可重装）"
            :disabled="busyId != null"
            @click="uninstall(p)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
        <div class="text-[11px] text-[var(--fg-dim)] mb-3">
          <span class="font-mono">{{ p.manifest?.id ?? p.id }}</span>
          <span v-if="p.manifest?.description != null"> · {{ p.manifest.description }}</span>
        </div>

        <!-- 装载失败（清单校验/激活/HostApi 版本）：如实呈现，不静默吞 -->
        <div v-if="p.error" class="error-note mb-3" role="alert">
          <span class="min-w-0 flex-1 break-words">装载失败：{{ p.error }}</span>
        </div>

        <template v-if="p.registered">
          <!-- 贡献面清单 -->
          <div v-if="p.enabled && hasContributions(p.id)" class="space-y-0.5 mb-3">
            <div v-for="pid in previewsOf(p.id)" :key="pid" class="text-[12px]">
              · 条目预览 <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ pid }}</span>
            </div>
            <div v-for="c in commandsOf(p.id)" :key="c.id" class="text-[12px]">
              · 命令「{{ c.title }}」 <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ c.id }}</span>
            </div>
          </div>
          <div v-else-if="p.enabled" class="text-[12px] text-[var(--fg-dim)] mb-3">无活跃贡献</div>

          <!-- 声明的服务（说明进 hover，不占版面） -->
          <div v-if="(p.manifest?.surfaces?.length ?? 0) > 0" class="flex flex-wrap gap-1 mb-3">
            <span
              v-for="s in p.manifest?.surfaces"
              :key="s"
              class="chip"
              title="声明的壳服务；权限面随分发落地前仅声明不校验"
            >{{ s }}</span>
          </div>

          <!-- 设置（声明制：宿主经 SchemaControl 渲染，值落 config 仓） -->
          <div v-if="settingsOf(p.id).length > 0" class="space-y-3">
            <SchemaControl
              v-for="s in settingsOf(p.id)"
              :key="s.key"
              :schema="s"
              :model-value="settingValue(p.id, s)"
              @update:model-value="updateSetting(p.id, s, $event)"
            />
          </div>
        </template>
      </section>
    </template>

    <p v-else class="text-[12px] text-[var(--fg-dim)]">尚未安装插件——点上方「安装插件」导入 zip 包。</p>
  </div>
</template>

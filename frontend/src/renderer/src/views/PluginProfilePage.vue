<script setup lang="ts">
/**
 * 插件详情页 —— 插件的**管理/阅读面**（D46，词条式原型仿标签主页，路由 /plugin/:id）。
 *
 * 重心 = 贡献面清单（"它为你做什么"：条目预览认领 + 注册进命令面板的命令，现注册表
 * 推导机制不变——机制更换归主线 1）；次级分节 = 身份事实（左栏）→ 声明面（surfaces，
 * 如实标注"仅声明未校验"）→ 设置（manifest.settings 经 SchemaControl 按样式规范渲染，
 * 插件永不自绘设置 UI）→ 动作（启停）。
 * 数据 = 注册表现取（getFeature/listDetailPreviews/listCommands）——与面板、命令面板
 * 同一事实源，无独立清单。
 */
import { computed, ref } from 'vue'
import { getFeature } from '../features/registry'
import { listDetailPreviews } from '../features/detailPreview'
import { listCommands } from '../features/commands'
import { isPluginEnabled, setPluginEnabled } from '../features/contributedPlugins'
import { useConfigStore } from '../stores/config'
import SchemaControl from '../components/settings/SchemaControl.vue'
import type { SettingSchema } from '@shared/types/feature'

const props = defineProps<{ id: string }>()
const config = useConfigStore()

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const feature = computed(() => getFeature(props.id) ?? null)
const manifest = computed(() => feature.value?.manifest ?? null)
const title = computed(() => manifest.value?.title ?? props.id)

/** 启用态 = config 仓的响应式读（面板与本页两侧开关天然同步）。 */
const enabled = computed(() => isPluginEnabled(props.id))
const busy = ref(false)
const error = ref<string | null>(null)

async function toggle(): Promise<void> {
  if (feature.value == null || busy.value) return
  busy.value = true
  error.value = null
  try {
    await setPluginEnabled(props.id, !enabled.value)
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}

// ---- 贡献面清单（重心）：注册表现取，如实呈现（停用即空） ----------------------
const previewContributions = computed(() =>
  listDetailPreviews().filter((p) => p.id.startsWith(`${props.id}:`))
)
const commandContributions = computed(() =>
  listCommands().filter((e) => e.manifest.source === 'contributed' && e.manifest.id.startsWith(`${props.id}.`))
)
const hasContributions = computed(() => previewContributions.value.length > 0 || commandContributions.value.length > 0)

// ---- 设置（声明制）：值落 config 仓 `featureId:key`，写入面归宿主 UI -----------
const settings = computed<SettingSchema[]>(
  () => (manifest.value?.settings ?? []).filter((s) => s.type !== 'shortcuts') // 键位表是壳级只读视图，与插件无关
)
const settingValue = (schema: SettingSchema): unknown =>
  config.value(props.id, schema.key, schema.default ?? null)

function updateSetting(schema: SettingSchema, value: unknown): void {
  config.setValue(props.id, schema.key, value)
}

const surfaces = computed(() => manifest.value?.surfaces ?? [])
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto px-6 py-8">
      <div v-if="error" class="error-note" role="alert">
        <span class="min-w-0 flex-1 break-words">{{ error }}</span>
      </div>

      <template v-else-if="manifest">
        <div class="flex gap-8">
          <!-- 左：身份事实（词条式事实条） -->
          <aside class="w-52 shrink-0 space-y-5">
            <div class="panel p-3">
              <div class="panel-label mb-2">身份</div>
              <dl class="space-y-1.5 text-[12px]">
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">标识</dt>
                  <dd class="min-w-0 flex-1 break-words font-mono text-[11px]" :title="manifest.id">
                    {{ manifest.id }}
                  </dd>
                </div>
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">简介</dt>
                  <dd class="min-w-0 flex-1 break-words" :title="manifest.description ?? undefined">
                    {{ manifest.description ?? '—' }}
                  </dd>
                </div>
                <div class="flex gap-2">
                  <dt class="w-10 shrink-0 text-[var(--fg-dim)]">状态</dt>
                  <dd>{{ enabled ? '启用中' : '已停用' }}</dd>
                </div>
              </dl>
              <button
                class="btn h-7 px-2 text-[11px] mt-3 w-full justify-center"
                :class="enabled ? '' : 'btn-primary'"
                :disabled="busy"
                :title="enabled ? '停用（贡献摘除，内置预览兜底）' : '启用'"
                @click="toggle"
              >
                {{ enabled ? '停用' : '启用' }}
              </button>
            </div>

            <div class="panel p-3">
              <div class="panel-label mb-2">声明的服务</div>
              <div v-if="surfaces.length > 0" class="flex flex-wrap gap-1">
                <span v-for="s in surfaces" :key="s" class="chip">{{ s }}</span>
              </div>
              <p v-else class="text-[11px] text-[var(--fg-dim)]">无</p>
              <p class="text-[11px] text-[var(--fg-dim)] mt-2">仅声明，未校验（权限面随分发落地）。</p>
            </div>
          </aside>

          <!-- 右：贡献面（重心）→ 设置 → 说明 -->
          <article class="flex-1 min-w-0">
            <h1 class="text-[16px] font-semibold truncate min-w-0 mb-3" :title="title">{{ title }}</h1>

            <div class="panel-label mb-1.5">它为你做什么</div>
            <div v-if="hasContributions" class="space-y-1.5 mb-5">
              <div v-for="p in previewContributions" :key="p.id" class="text-[12px]">
                · 条目预览接管 <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ p.id }}</span>
              </div>
              <div v-for="c in commandContributions" :key="c.manifest.id" class="text-[12px]">
                · 命令「{{ c.manifest.title }}」——命令面板可唤起
                <span class="text-[var(--fg-dim)] font-mono text-[11px]">{{ c.manifest.id }}</span>
              </div>
            </div>
            <p v-else class="text-[12px] text-[var(--fg-dim)] mb-5">
              {{ enabled ? '当前没有活跃贡献。' : '已停用——贡献随停用摘除，启用后恢复。' }}
            </p>

            <template v-if="settings.length > 0">
              <div class="panel-label mb-2">设置</div>
              <div class="space-y-3 mb-5">
                <SchemaControl
                  v-for="s in settings"
                  :key="s.key"
                  :schema="s"
                  :model-value="settingValue(s)"
                  @update:model-value="(v) => updateSetting(s, v)"
                />
              </div>
            </template>

            <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
              三方插件（随应用装载）。停用即摘除全部贡献，内置预览自动兜底；插件不能悄悄接管。
            </p>
          </article>
        </div>
      </template>

      <div v-else class="text-[12px] text-[var(--fg-dim)]">插件不存在或未装载（{{ id }}）。</div>
    </div>
  </div>
</template>

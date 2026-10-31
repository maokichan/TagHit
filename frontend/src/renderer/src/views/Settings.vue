<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useConfigStore } from '../stores/config'
import SchemaControl from '../components/settings/SchemaControl.vue'
import { listFeatures } from '../features/registry'

/**
 * 设置页（0.2 契约 v0）：
 * - 外观归壳（ui store 自身外观）；功能组件分区由注册表按组件分组渲染；
 * - 领域管理不在此——归属纪律"谁的功能谁管理"：标签池归「标签」全页，
 *   工作区生命周期归起始页工作区卡（走查反馈裁撤设置页内的重复管理面）；
 * - 「关于」= 应用自述（版本经构建从根 package.json 注入）。
 */
const uiStore = useUiStore()

/** 挂载 settings 的功能组件（设置页按组件分类渲染） */
const settingsFeatures = computed(() => listFeatures('settings'))

/**
 * 设置项读写（机制化）：key 是**组件内 key**，实际存储 = config 仓的
 * `featureId:key`（见 DECISIONS）；缺省值取 manifest 声明的 default。
 * 面板与设置页读写同一份 config，天然一致；新增设置项零代码（仅声明 schema）。
 */
const config = useConfigStore()

function settingValue(featureId: string, key: string, fallback: unknown): unknown {
  return config.value(featureId, key, fallback)
}
function setSetting(featureId: string, key: string, v: unknown): void {
  config.setValue(featureId, key, v)
}

const themes = [
  { key: 'dark', label: '暗色' },
  { key: 'light', label: '亮色' },
  { key: 'system', label: '跟随系统' }
] as const

/** 版本号：构建时注入（vite define ← 根 package.json），模板不吃 import.meta 故在此转交。 */
const appVersion = import.meta.env.APP_VERSION
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="max-w-2xl mx-auto space-y-6">
      <h1 class="text-lg font-semibold">设置</h1>

      <!-- 外观：壳自身的外观（ui store），不属任何功能组件 -->
      <section class="panel p-4">
        <div class="text-sm font-medium mb-3">外观</div>
        <div class="flex flex-wrap items-center gap-4">
          <div>
            <div class="text-[12px] text-[var(--fg-dim)] mb-1.5">主题</div>
            <div class="flex gap-1.5">
              <button
                v-for="t in themes"
                :key="t.key"
                class="btn"
                :class="uiStore.theme === t.key ? 'btn-primary' : ''"
                @click="uiStore.setTheme(t.key)"
              >
                {{ t.label }}
              </button>
            </div>
          </div>
          <div>
            <div class="text-[12px] text-[var(--fg-dim)] mb-1.5">开始界面封面</div>
            <button class="btn" @click="uiStore.toggleWorkspaceCovers()">
              {{ uiStore.showWorkspaceCovers ? '显示封面' : '隐藏封面' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 功能组件设置分区：由注册表按组件分组渲染（每个组件一个分区，标题 = 组件 title） -->
      <template v-for="f in settingsFeatures" :key="f.manifest.id">
        <section class="panel p-4">
          <div class="text-sm font-medium mb-3">{{ f.manifest.title }}</div>
          <div class="flex flex-wrap items-start gap-6">
            <div v-for="s in f.manifest.settings ?? []" :key="s.key">
              <SchemaControl
                :schema="s"
                :model-value="settingValue(f.manifest.id, s.key, s.default)"
                @update:model-value="setSetting(f.manifest.id, s.key, $event)"
              />
            </div>
          </div>
        </section>
      </template>

      <!-- 关于 -->
      <section class="panel p-4">
        <div class="text-sm font-medium mb-3">关于</div>
        <dl class="space-y-1.5 text-[12px]">
          <div class="flex gap-2"><dt class="w-12 shrink-0 text-[var(--fg-dim)]">应用</dt><dd>TagHit</dd></div>
          <div class="flex gap-2"><dt class="w-12 shrink-0 text-[var(--fg-dim)]">版本</dt><dd class="tabular-nums">{{ appVersion }}</dd></div>
          <div class="flex gap-2">
            <dt class="w-12 shrink-0 text-[var(--fg-dim)]">定位</dt>
            <dd>本地内容标记与检索管理器——标签替代层级、数据全本地、单一数据库文件。</dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>

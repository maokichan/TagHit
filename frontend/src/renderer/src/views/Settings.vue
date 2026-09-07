<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useUiStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useTagStore } from '../stores/tag'
import { useConfigStore } from '../stores/config'
import SchemaControl from '../components/settings/SchemaControl.vue'
import { listFeatures } from '../features/registry'
import { confirmDialog } from '../features/services/dialog'

/**
 * 设置页（0.2 契约 v0）：
 * - 保留：外观（本地状态）、功能组件分区、工作区删除、全局标签池建删；
 * - 降级：config 持久化、工作区改名/封面、标签层级（不在契约 v0）。
 */
const uiStore = useUiStore()
const workspaceStore = useWorkspaceStore()
const tagStore = useTagStore()

/** 挂载 settings 的功能组件（设置页按组件分类渲染；显示相关：layout / showTitles） */
const settingsFeatures = computed(() => listFeatures('settings'))

/**
 * 设置项读写（机制化）：key 是**组件内 key**，实际存储 = config 仓的
 * `featureId:key`（DECISIONS 2026-09-07）；缺省值取 manifest 声明的 default。
 * 面板与设置页读写同一份 config，天然一致；新增设置项零代码（仅声明 schema）。
 */
const config = useConfigStore()

function settingValue(featureId: string, key: string, fallback: unknown): unknown {
  return config.value(featureId, key, fallback)
}
function setSetting(featureId: string, key: string, v: unknown): void {
  config.setValue(featureId, key, v)
}

// 统一标签管理
const newTagName = ref('')
const newTagDesc = ref('')
const tagError = ref('')

const themes = [
  { key: 'dark', label: '暗色' },
  { key: 'light', label: '亮色' },
  { key: 'system', label: '跟随系统' }
] as const

onMounted(async () => {
  await workspaceStore.refresh()
  await tagStore.refreshAll()
})

async function deleteWorkspace(id: string): Promise<void> {
  const ok = await confirmDialog({
    title: '删除工作区',
    message: '删除该工作区？其来源根、节点与标签声明将一并删除。',
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  await workspaceStore.remove(id)
}

// ── 标签管理 ──
async function createTag(): Promise<void> {
  tagError.value = ''
  if (!newTagName.value.trim()) return
  try {
    await tagStore.create(newTagName.value.trim(), newTagDesc.value || undefined)
    newTagName.value = ''
    newTagDesc.value = ''
  } catch (e) {
    tagError.value = e instanceof Error ? e.message : String(e)
  }
}
async function deleteTag(id: string): Promise<void> {
  const ok = await confirmDialog({
    title: '删除标签',
    message: '删除该全局标签？其挂载、声明与组内成员关系将一并删除。',
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  await tagStore.remove(id)
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="max-w-2xl mx-auto space-y-6">
      <h1 class="text-lg font-semibold">设置</h1>

      <!-- 外观 -->
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
          <div>
            <div class="text-[12px] text-[var(--fg-dim)] mb-1.5">
              界面缩放（{{ Math.round(uiStore.uiScale * 100) }}%，80%–150%）
            </div>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.05"
              class="w-44 accent-[var(--accent)] cursor-pointer"
              :value="uiStore.uiScale"
              @input="uiStore.setUiScale(Number(($event.target as HTMLInputElement).value))"
            />
          </div>
        </div>
        <p class="text-[11px] text-[var(--fg-dim)] mt-3">
          设置持久化（config）不在宿主契约 v0：当前为会话内生效。
        </p>
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

      <!-- 工作区管理 -->
      <section class="panel p-4">
        <div class="text-sm font-medium mb-3">工作区管理</div>
        <div v-if="workspaceStore.workspaces.length === 0" class="text-[12px] text-[var(--fg-dim)]">
          暂无工作区（新建请在开始界面进行）
        </div>
        <div class="space-y-3">
          <div v-for="ws in workspaceStore.workspaces" :key="ws.id" class="border border-[var(--border)] rounded-lg p-3">
            <div class="flex items-center gap-2">
              <span class="font-medium flex-1 truncate">{{ ws.name }}</span>
              <button class="btn text-[var(--danger)]" @click="deleteWorkspace(ws.id)"><Trash2 :size="13" /></button>
            </div>
            <p class="text-[11px] text-[var(--fg-dim)] mt-1.5">
              来源根与标签声明请在工作区页左侧活动栏管理；改名/封面不在契约 v0。
            </p>
          </div>
        </div>
      </section>

      <!-- 统一标签管理 -->
      <section class="panel p-4">
        <div class="text-sm font-medium mb-3">统一标签管理（全局标签池）</div>

        <div class="flex gap-2 mb-3">
          <input v-model="newTagName" class="input flex-1" placeholder="新全局标签名" @keyup.enter="createTag" />
          <input v-model="newTagDesc" class="input flex-1" placeholder="描述（可选）" />
          <button class="btn btn-primary" @click="createTag"><Plus :size="14" /> 创建</button>
        </div>
        <p v-if="tagError" class="text-xs text-[var(--danger)] mb-2">{{ tagError }}</p>

        <div class="space-y-2">
          <div v-for="tag in tagStore.allTags" :key="tag.id" class="border border-[var(--border)] rounded-lg p-3">
            <div class="flex items-center gap-2">
              <span class="font-medium">#{{ tag.name }}</span>
              <span v-if="tag.description" class="text-[11px] text-[var(--fg-dim)] truncate">{{ tag.description }}</span>
              <span class="flex-1" />
              <button class="btn text-[var(--danger)]" @click="deleteTag(tag.id)"><Trash2 :size="13" /></button>
            </div>
          </div>
          <p v-if="tagStore.allTags.length === 0" class="text-[12px] text-[var(--fg-dim)]">暂无标签</p>
        </div>
        <p class="text-[11px] text-[var(--fg-dim)] mt-3">
          标签声明（工作区可见性）在工作区页左侧「标签」面板管理；标签层级/关联不在契约 v0。
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, ImagePlus, Link2, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { useUiStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useTagStore } from '../stores/tag'
import type { AppConfig } from '@shared/types/config'
import type { LayoutMode } from '@shared/types/config'
import SchemaControl from '../components/settings/SchemaControl.vue'
import { listFeatures } from '../features/registry'

const uiStore = useUiStore()
const workspaceStore = useWorkspaceStore()
const tagStore = useTagStore()

const config = ref<AppConfig | null>(null)
const excludeText = ref('')
const saved = ref(false)

/** 挂载 settings 的功能组件（设置页按组件分类渲染；显示相关：layout / showTitles） */
const settingsFeatures = computed(() => listFeatures('settings'))

/**
 * 设置项读写路由：key → [读, 写]，声明式（新增设置项只需加一行）。
 * 值读写均收敛在 uiStore，面板与设置页共享同一份状态。
 */
const settingHandlers: Record<string, { get: () => unknown; set: (v: unknown) => void }> = {
  layoutMode: {
    get: () => uiStore.layoutMode,
    set: (v) => void uiStore.setLayoutMode(v as LayoutMode)
  },
  showTitles: { get: () => uiStore.showTitles, set: () => void uiStore.toggleShowTitles() },
  enableSearchShortcut: {
    get: () => uiStore.enableSearchShortcut,
    set: (v) => void uiStore.setSearchShortcut(Boolean(v))
  }
}

function settingValue(key: string): unknown {
  return settingHandlers[key]?.get()
}
function setSetting(key: string, value: unknown): void {
  settingHandlers[key]?.set(value)
}

// 统一标签管理
const newTagName = ref('')
const newTagDesc = ref('')
const tagError = ref('')
const parentId = ref<number | null>(null)
const childId = ref<number | null>(null)
const declareSelects = ref<Record<number, string>>({})

// 工作区重命名
const renamingId = ref<number | null>(null)
const renameText = ref('')

onMounted(async () => {
  config.value = await window.api.config.get()
  excludeText.value = config.value.scanExcludePatterns.join('\n')
  await workspaceStore.refresh()
  await tagStore.refreshAll(true)
})

async function saveMedia(): Promise<void> {
  if (!config.value) return
  await window.api.config.update({
    ffmpegPath: config.value.ffmpegPath,
    thumbnailMaxWidth: Number(config.value.thumbnailMaxWidth) || 320,
    thumbnailQuality: Number(config.value.thumbnailQuality) || 85,
    scanExcludePatterns: excludeText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}

const themes = [
  { key: 'dark', label: '暗色' },
  { key: 'light', label: '亮色' },
  { key: 'system', label: '跟随系统' }
] as const

// ── 工作区管理 ──
async function addWorkspacePath(workspaceId: number): Promise<void> {
  const path = await window.api.dialog.pickFolder()
  if (path) await workspaceStore.addPath({ workspaceId, path })
}
async function removeWorkspacePath(pathId: number, workspaceId: number, path: string): Promise<void> {
  const ok = await window.api.dialog.confirm({
    title: '移除路径',
    message: `确定从工作区移除路径「${path}」？其下条目将从本工作区移除（条目/标签/元数据保留）。`
  })
  if (!ok) return
  await workspaceStore.removePath(pathId, workspaceId)
}

/** 选择自定义封面图片 */
async function pickCover(workspaceId: number): Promise<void> {
  const path = await window.api.dialog.pickImage()
  if (path) await workspaceStore.setCover(workspaceId, path)
}
async function deleteWorkspace(id: number): Promise<void> {
  const ok = await window.api.dialog.confirm({
    title: '删除工作区',
    message: '删除该工作区？其条目关联与标签声明将一并删除。'
  })
  if (!ok) return
  await workspaceStore.remove(id)
}
function startRename(id: number, title: string): void {
  renamingId.value = id
  renameText.value = title
}
async function commitRename(): Promise<void> {
  if (renamingId.value == null) return
  await workspaceStore.update(renamingId.value, renameText.value.trim() || '未命名工作区')
  renamingId.value = null
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
async function deleteTag(id: number): Promise<void> {
  const ok = await window.api.dialog.confirm({
    title: '删除标签',
    message: '删除该全局标签？其层级、声明与条目关联将一并删除。'
  })
  if (!ok) return
  await tagStore.remove(id)
}
async function addHierarchy(): Promise<void> {
  tagError.value = ''
  if (parentId.value == null || childId.value == null) return
  try {
    await window.api.tag.addHierarchy({ parentId: parentId.value, childId: childId.value })
    await tagStore.refreshAll(true)
    parentId.value = null
    childId.value = null
  } catch (e) {
    tagError.value = e instanceof Error ? e.message : String(e)
  }
}
async function removeHierarchy(p: number, c: number): Promise<void> {
  await window.api.tag.removeHierarchy(p, c)
  await tagStore.refreshAll(true)
}
async function declareTag(workspaceId: number, tagId: number): Promise<void> {
  await tagStore.declare(workspaceId, tagId)
  await tagStore.refreshAll(true)
}
async function undeclareTag(workspaceId: number, tagId: number): Promise<void> {
  await tagStore.undeclare(workspaceId, tagId)
  await tagStore.refreshAll(true)
}
async function onDeclareSelect(tagId: number): Promise<void> {
  const wsId = Number(declareSelects.value[tagId])
  if (Number.isInteger(wsId) && wsId > 0) {
    await declareTag(wsId, tagId)
  }
  declareSelects.value[tagId] = ''
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
      </section>

      <!-- 功能组件设置分区：由注册表按组件分组渲染（每个组件一个分区，标题 = 组件 title） -->
      <template v-for="f in settingsFeatures" :key="f.id">
        <section class="panel p-4">
          <div class="text-sm font-medium mb-3">{{ f.title }}</div>
          <div class="flex flex-wrap items-start gap-6">
            <div v-for="s in f.settings ?? []" :key="s.key">
              <SchemaControl
                :schema="s"
                :model-value="settingValue(s.key)"
                @update:model-value="setSetting(s.key, $event)"
              />
            </div>
          </div>
        </section>
      </template>

      <!-- 媒体 -->
      <section v-if="config" class="panel p-4 space-y-3">
        <div class="text-sm font-medium">媒体与扫描</div>
        <div>
          <label class="text-[12px] text-[var(--fg-dim)] block mb-1.5">
            ffmpeg 可执行文件（音视频元数据与缩略图）
          </label>
          <input v-model="config.ffmpegPath" class="input w-full" placeholder="ffmpeg" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[12px] text-[var(--fg-dim)] block mb-1.5">缩略图最大宽度</label>
            <input v-model.number="config.thumbnailMaxWidth" type="number" class="input w-full" />
          </div>
          <div>
            <label class="text-[12px] text-[var(--fg-dim)] block mb-1.5">缩略图质量 (%)</label>
            <input v-model.number="config.thumbnailQuality" type="number" class="input w-full" />
          </div>
        </div>
        <div>
          <label class="text-[12px] text-[var(--fg-dim)] block mb-1.5">扫描排除项（每行一个）</label>
          <textarea v-model="excludeText" rows="4" class="input w-full resize-none font-mono text-[12px]" />
        </div>
        <button class="btn btn-primary" @click="saveMedia">
          <Check :size="14" /> {{ saved ? '已保存' : '保存' }}
        </button>
      </section>

      <!-- 工作区管理 -->
      <section class="panel p-4">
        <div class="text-sm font-medium mb-3">工作区管理</div>
        <div v-if="workspaceStore.workspaces.length === 0" class="text-[12px] text-[var(--fg-dim)]">
          暂无工作区（新建请在开始界面进行）
        </div>
        <div class="space-y-3">
          <div v-for="ws in workspaceStore.workspaces" :key="ws.id" class="border border-[var(--border)] rounded-lg p-3">
            <div class="flex items-center gap-2 mb-2">
              <template v-if="renamingId === ws.id">
                <input v-model="renameText" class="input flex-1 text-[13px]" @keyup.enter="commitRename" @blur="commitRename" />
              </template>
              <template v-else>
                <span class="font-medium flex-1 truncate">{{ ws.title }}</span>
                <button class="btn" @click="startRename(ws.id, ws.title)"><Pencil :size="13" /> 重命名</button>
              </template>
              <button class="btn text-[var(--danger)]" @click="deleteWorkspace(ws.id)"><Trash2 :size="13" /></button>
            </div>
            <!-- 封面配置 -->
            <div class="flex items-center gap-2 mb-2 text-[12px]">
              <span class="text-[var(--fg-dim)]">封面：</span>
              <span class="text-[var(--fg-dim)]">{{ ws.coverPath ? '自定义' : '自动' }}</span>
              <button class="btn text-[12px]" @click="pickCover(ws.id)">
                <ImagePlus :size="13" /> 选择图片…
              </button>
              <button v-if="ws.coverPath" class="btn text-[12px]" @click="workspaceStore.setCover(ws.id, null)">
                恢复自动
              </button>
            </div>
            <div class="space-y-1">
              <div
                v-for="p in ws.paths"
                :key="p.id"
                class="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg)] text-[12px]"
              >
                <span class="truncate flex-1" :title="p.path">{{ p.path }}</span>
                <span v-if="!p.recursive" class="text-[10px] text-[var(--fg-dim)]">非递归</span>
                <button class="text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer" @click.stop="removeWorkspacePath(p.id, ws.id, p.path)">
                  <Trash2 :size="12" />
                </button>
              </div>
              <button class="btn text-[12px]" @click="addWorkspacePath(ws.id)">
                <Plus :size="13" /> 添加目录
              </button>
            </div>
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

        <div class="flex items-center gap-2 mb-3">
          <Link2 :size="14" class="text-[var(--fg-dim)] shrink-0" />
          <select v-model.number="parentId" class="input flex-1">
            <option :value="null" disabled>父标签…</option>
            <option v-for="t in tagStore.allTags" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <span class="text-[var(--fg-dim)]">→</span>
          <select v-model.number="childId" class="input flex-1">
            <option :value="null" disabled>子标签…</option>
            <option v-for="t in tagStore.allTags" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <button class="btn" :disabled="parentId == null || childId == null" @click="addHierarchy">建立层级</button>
        </div>
        <p v-if="tagError" class="text-xs text-[var(--danger)] mb-2">{{ tagError }}</p>

        <div class="space-y-2">
          <div v-for="node in tagStore.tagNodes" :key="node.id" class="border border-[var(--border)] rounded-lg p-3">
            <div class="flex items-center gap-2">
              <span class="font-medium">#{{ node.name }}</span>
              <span v-if="node.description" class="text-[11px] text-[var(--fg-dim)] truncate">{{ node.description }}</span>
              <span class="flex-1" />
              <button class="btn text-[var(--danger)]" @click="deleteTag(node.id)"><Trash2 :size="13" /></button>
            </div>

            <div class="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
              <template v-if="node.children.length">
                <span class="text-[var(--fg-dim)]">子级：</span>
                <button
                  v-for="c in node.children"
                  :key="c.id"
                  class="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] hover:text-[var(--danger)] cursor-pointer"
                  :title="`解除 ${node.name} → ${c.name}`"
                  @click="removeHierarchy(node.id, c.id)"
                >
                  {{ c.name }}
                </button>
              </template>
            </div>

            <div class="mt-1.5">
              <div class="text-[11px] text-[var(--fg-dim)] mb-1">已声明到工作区：</div>
              <div class="flex flex-wrap items-center gap-1">
                <span
                  v-for="ws in workspaceStore.workspaces.filter((w) => node.workspaceIds?.includes(w.id))"
                  :key="ws.id"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--fg-dim)]"
                >
                  {{ ws.title }}
                  <button class="cursor-pointer hover:text-[var(--danger)]" title="取消声明" @click="undeclareTag(ws.id, node.id)">
                    ✕
                  </button>
                </span>
                <select
                  class="input text-[11px] px-1.5 py-0.5 w-auto"
                  :value="declareSelects[node.id] ?? ''"
                  @change="declareSelects[node.id] = ($event.target as HTMLSelectElement).value; onDeclareSelect(node.id)"
                >
                  <option value="">+ 声明到…</option>
                  <option
                    v-for="ws in workspaceStore.workspaces.filter((w) => !node.workspaceIds?.includes(w.id))"
                    :key="ws.id"
                    :value="String(ws.id)"
                  >
                    {{ ws.title }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

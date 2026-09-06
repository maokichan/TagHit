<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Puzzle } from 'lucide-vue-next'
import type { PluginInfo } from '@shared/types/plugin'

defineProps<{ side?: 'left' | 'right' }>()

const plugins = ref<PluginInfo[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    plugins.value = await window.api.plugin.list()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
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

      <div v-if="loading" class="text-[12px] text-[var(--fg-dim)]">加载中…</div>
      <p v-else-if="error" class="text-[12px] text-[var(--danger)]">{{ error }}</p>

      <template v-else>
        <p v-if="plugins.length === 0" class="text-[12px] text-[var(--fg-dim)] leading-relaxed">
          暂无插件。将插件目录放入
          <code class="kbd">resources/plugins</code> 后重启应用即可加载。
        </p>
        <div v-for="p in plugins" :key="p.name" class="panel p-2 mb-2">
          <div class="flex items-center gap-1.5 text-[12px]">
            <span class="font-medium truncate flex-1">{{ p.name }}</span>
            <span class="text-[10px] text-[var(--fg-dim)] shrink-0">{{ p.version }}</span>
            <span
              v-if="p.loaded"
              class="shrink-0 px-1 rounded text-[10px] bg-[var(--accent-soft)] text-[var(--accent)]"
            >
              已加载
            </span>
            <span
              v-else
              class="shrink-0 px-1 rounded text-[10px]"
              style="background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger)"
            >
              失败
            </span>
          </div>
          <p v-if="p.description" class="text-[11px] text-[var(--fg-dim)] mt-1">
            {{ p.description }}
          </p>
          <p v-if="p.error" class="text-[11px] mt-1" style="color: var(--danger)">{{ p.error }}</p>
          <p v-if="p.tools.length" class="text-[11px] text-[var(--fg-dim)] mt-1">
            工具：{{ p.tools.join('、') }}
          </p>
        </div>
      </template>
    </div>
  </aside>
</template>

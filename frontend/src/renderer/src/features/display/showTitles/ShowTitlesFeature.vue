<script setup lang="ts">
/**
 * 功能组件：卡片标题开关（displayPanel 区块）。
 * 与设置页共享同一份 config（`showTitles:showTitles`）：面板切换、设置页勾选，一处改两处同见。
 */
import { computed } from 'vue'
import { useConfigStore } from '../../../stores/config'

const config = useConfigStore()
const current = computed(() => config.value('showTitles', 'showTitles', true))
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">标题</div>
    <div class="flex gap-1.5">
      <button
        class="btn flex-1 justify-center text-[12px]"
        :class="current ? 'btn-primary' : ''"
        @click="config.setValue('showTitles', 'showTitles', true)"
      >
        显示
      </button>
      <button
        class="btn flex-1 justify-center text-[12px]"
        :class="!current ? 'btn-primary' : ''"
        @click="config.setValue('showTitles', 'showTitles', false)"
      >
        隐藏
      </button>
    </div>
  </div>
</template>

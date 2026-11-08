<script setup lang="ts">
/**
 * 功能组件：布局（displayPanel + settings 共享配置 layoutMode）
 * 三种渲染算法（瀑布流/网格/列表）仍在 ItemGrid 内部；本组件只负责选择。
 * 设置页与面板读写同一份 config 仓（featureId:key = layout:layoutMode），天然一致。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '../../../stores/config'

const config = useConfigStore()
const { t } = useI18n()

const layouts = [
  { key: 'masonry', label: t('display.layout.masonry') },
  { key: 'grid', label: t('display.layout.grid') },
  { key: 'list', label: t('display.layout.list') }
] as const

const current = computed(() => config.value('layout', 'layoutMode', 'masonry'))
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">{{ $t('display.layout.label') }}</div>
    <div class="flex gap-1.5">
      <button
        v-for="l in layouts"
        :key="l.key"
        class="btn flex-1 justify-center text-[12px]"
        :class="current === l.key ? 'btn-primary' : ''"
        @click="config.setValue('layout', 'layoutMode', l.key)"
      >
        {{ l.label }}
      </button>
    </div>
  </div>
</template>

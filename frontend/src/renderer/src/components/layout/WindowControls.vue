<script setup lang="ts">
/**
 * 自绘窗口控制键（无边框窗口，D17）：最小化 / 最大化-还原 / 关闭。
 * 动作经窄桥 window.control 由主进程执行；最大化状态随 resize 事件重查（还原有动画，不做乐观置位）。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { Minus, Square, Copy, X } from 'lucide-vue-next'
import { api } from '@shared/api'

const maximized = ref(false)

function refresh(): void {
  api.window
    .isMaximized()
    .then((v) => {
      maximized.value = v
    })
    .catch(() => {})
}

function control(action: 'minimize' | 'toggleMaximize' | 'close'): void {
  void api.window.control(action)
}

onMounted(() => {
  refresh()
  window.addEventListener('resize', refresh)
})
onUnmounted(() => window.removeEventListener('resize', refresh))
</script>

<template>
  <div class="flex items-stretch h-full">
    <button
      class="flex items-center justify-center w-10 h-full text-[var(--fg-dim)]
             hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] transition-colors cursor-pointer"
      title="最小化"
      @click="control('minimize')"
    >
      <Minus :size="14" />
    </button>
    <button
      class="flex items-center justify-center w-10 h-full text-[var(--fg-dim)]
             hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] transition-colors cursor-pointer"
      :title="maximized ? '还原' : '最大化'"
      @click="control('toggleMaximize')"
    >
      <Square v-if="!maximized" :size="11" />
      <Copy v-else :size="11" class="-scale-x-100" />
    </button>
    <button
      class="flex items-center justify-center w-10 h-full text-[var(--fg-dim)]
             hover:bg-[var(--danger)] hover:text-white transition-colors cursor-pointer"
      title="关闭"
      @click="control('close')"
    >
      <X :size="14" />
    </button>
  </div>
</template>

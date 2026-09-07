<script setup lang="ts">
/**
 * 贡献块错误隔离边界（机制层，非官方特权）：槽渲染处的一个组件渲染错误
 * 只废掉自己那一块，不带崩壳与其余组件。官方组件同样过此边界——同构验收
 * 的一部分（ARCHITECTURE §3.1）。与 registry.setupFeature 的 setup 隔离配对：
 * 行为钩子与渲染各有一条隔离线。
 */
import { onErrorCaptured, ref } from 'vue'

const props = defineProps<{ label: string }>()

const error = ref<string | null>(null)

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err.message : String(err)
  console.error(`[features] ${props.label} 渲染失败（已隔离）`, err)
  // 不再向上传播：壳与其余贡献块不受影响
  return false
})
</script>

<template>
  <div v-if="error != null" class="text-[12px] text-[var(--danger)] leading-relaxed">
    <div>{{ label }}：{{ error }}</div>
    <button class="text-[11px] underline cursor-pointer" @click="error = null">重试</button>
  </div>
  <slot v-else />
</template>

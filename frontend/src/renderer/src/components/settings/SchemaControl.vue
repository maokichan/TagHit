<script setup lang="ts">
/**
 * 通用设置控件 —— 按 SettingSchema 渲染（boolean → 开关按钮 / enum → 按钮组）。
 * 纯 UI 组件：值由父级（设置页）读写，这里只负责呈现与交互。
 */
import type { SettingSchema } from '@shared/types/feature'

defineProps<{
  schema: SettingSchema
  modelValue: unknown
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: unknown): void }>()

function set(value: unknown): void {
  emit('update:modelValue', value)
}
</script>

<template>
  <div>
    <div class="text-[12px] text-[var(--fg-dim)] mb-1.5">{{ schema.label }}</div>

    <!-- boolean：开关按钮 -->
    <button
      v-if="schema.type === 'boolean'"
      class="btn"
      :class="modelValue ? 'btn-primary' : ''"
      @click="set(!modelValue)"
    >
      {{ modelValue ? '开' : '关' }}
    </button>

    <!-- enum：按钮组 -->
    <div v-else-if="schema.type === 'enum' && schema.options" class="flex gap-1.5 flex-wrap">
      <button
        v-for="opt in schema.options"
        :key="opt.value"
        class="btn"
        :class="modelValue === opt.value ? 'btn-primary' : ''"
        @click="set(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- string / number：文本输入（v2 用） -->
    <input
      v-else
      class="input w-full"
      :type="schema.type === 'number' ? 'number' : 'text'"
      :value="String(modelValue ?? '')"
      @input="set(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 通用设置控件 —— 按 SettingSchema 渲染（boolean → 开关按钮 / enum → 按钮组 /
 * shortcuts → **只读键位表**）。
 * 纯 UI 组件：值由父级（设置页）读写，这里只负责呈现与交互；键位表没有"值"。
 */
import { computed } from 'vue'
import type { SettingSchema } from '@shared/types/feature'
import { describe, listShortcuts } from '../../features/keyboardMouse/shortcuts'
import { getCommand } from '../../features/commands'

defineProps<{
  schema: SettingSchema
  modelValue: unknown
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: unknown): void }>()

function set(value: unknown): void {
  emit('update:modelValue', value)
}

/**
 * 键位表：**从注册表现取**（D23：快捷键 = 命令注册表的视图）。
 * 绑定指向未注册命令时（开发期笔误）如实标出来，而不是让表看起来一切正常。
 */
const shortcutRows = computed(() =>
  listShortcuts().map((b) => {
    const cmd = getCommand(b.commandId)
    return {
      key: describe(b),
      command: cmd?.manifest.title ?? '⚠ 未注册命令',
      id: b.commandId,
      note: b.label ?? '',
      gated: b.gate != null,
    }
  })
)
</script>

<template>
  <div :class="schema.type === 'shortcuts' ? 'w-full' : ''">
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

    <!-- shortcuts：只读键位表（壳级单一事实源：features/keyboardMouse/shortcuts.ts） -->
    <div v-else-if="schema.type === 'shortcuts'" class="border border-[var(--border)] rounded-md overflow-hidden">
      <table class="w-full text-[12px]">
        <thead class="bg-[var(--bg-elev)] text-[11px] text-[var(--fg-dim)]">
          <tr>
            <th class="text-left font-normal px-3 py-1.5">组合键</th>
            <th class="text-left font-normal px-3 py-1.5">功能</th>
            <th class="text-left font-normal px-3 py-1.5">生效范围</th>
            <th class="text-left font-normal px-3 py-1.5">命令</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shortcutRows" :key="row.id + row.key" class="border-t border-[var(--border)]">
            <td class="px-3 py-1.5 whitespace-nowrap">
              <span class="kbd">{{ row.key }}</span>
            </td>
            <td class="px-3 py-1.5">{{ row.command }}</td>
            <td class="px-3 py-1.5 text-[var(--fg-dim)]">
              {{ row.note !== '' ? row.note : '全局' }}{{ row.gated ? '（可在上方关闭）' : '' }}
            </td>
            <td class="px-3 py-1.5 text-[11px] text-[var(--fg-dim)] whitespace-nowrap">{{ row.id }}</td>
          </tr>
          <tr v-if="shortcutRows.length === 0">
            <td colspan="4" class="px-3 py-2 text-[var(--fg-dim)]">尚无绑定</td>
          </tr>
        </tbody>
      </table>
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

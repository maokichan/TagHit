<script setup lang="ts">
/**
 * 内置文本预览（detailPreview 默认提供方，D37）：经窄桥 readText 直读
 * （白名单在应用层 content.ts，闸门本体），限额交付 + 截断如实提示。
 */
import { ref, watch } from 'vue'
import { api } from '@shared/api'
import type { ItemView } from '../../lib/viewModel'

const props = defineProps<{ item: ItemView }>()
const textContent = ref<{ text: string; truncated: boolean } | null>(null)
const textLoading = ref(false)
const textUnavailable = ref(false)

async function loadText(): Promise<void> {
  textContent.value = null
  textUnavailable.value = false
  if (!props.item.sourceUri) {
    textUnavailable.value = true
    return
  }
  textLoading.value = true
  try {
    textContent.value = await api.items.readText(props.item.id)
    if (textContent.value === null) textUnavailable.value = true
  } catch {
    textUnavailable.value = true
  } finally {
    textLoading.value = false
  }
}
watch(
  () => props.item.id,
  () => void loadText(),
  { immediate: true }
)
</script>

<template>
  <div class="w-full h-full flex flex-col min-h-0">
    <div v-if="textLoading" class="flex-1 flex items-center justify-center text-[var(--fg-dim)] text-sm">{{ $t('preview.text.loading') }}</div>
    <template v-else-if="textContent">
      <div v-if="textContent.truncated" class="text-[11px] text-[var(--warn)] px-2 py-1">
        {{ $t('preview.text.truncated') }}
      </div>
      <pre class="flex-1 min-h-0 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap break-all bg-[var(--bg)] border border-[var(--border)] p-3">{{ textContent.text }}</pre>
    </template>
    <div v-else class="flex-1 flex items-center justify-center text-[var(--fg-dim)] text-sm">
      {{ textUnavailable ? $t('preview.text.failed') : $t('preview.text.loading') }}
    </div>
  </div>
</template>

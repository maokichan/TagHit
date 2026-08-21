<script setup lang="ts">
defineProps<{ name: string; active?: boolean }>()
defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <span
    class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border cursor-pointer select-none transition-colors"
    :class="
      active
        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
        : 'bg-[var(--bg-hover)] text-[var(--fg-dim)] border-[var(--border)] hover:text-[var(--fg)]'
    "
    @click.stop="$emit('click')"
  >
    #{{ name }}
  </span>
</template>

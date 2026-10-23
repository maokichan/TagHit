<script setup lang="ts">
defineProps<{ name: string; active?: boolean }>()
defineEmits<{ (e: 'click'): void; (e: 'dblclick'): void }>()
</script>

<template>
  <span
    class="chip"
    :class="active ? 'chip--on' : 'chip--action'"
    @click.stop="$emit('click')"
    @dblclick.stop="$emit('dblclick')"
  >
    {{ name }}
  </span>
</template>

<script setup lang="ts">
defineProps<{ name: string; active?: boolean }>()
defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <span class="chip" :class="active ? 'chip--on' : 'chip--action'" @click.stop="$emit('click')">
    {{ name }}
  </span>
</template>

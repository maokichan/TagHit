<script setup lang="ts">
/**
 * 功能组件：无标签筛选（displayPanel 区块）。
 * 只看未挂任何标签的条目——打标工作流的"先找到没打过的"；与格式筛选同类，是
 * 视图成员的过滤条件，职能归显示面板（搜索栏只管关键字与标签候选）。
 */
import { useItemStore } from '../../../stores/item'

const itemStore = useItemStore()
</script>

<template>
  <div>
    <div class="text-[11px] text-[var(--fg-dim)] mb-1.5">无标签</div>
    <div class="flex gap-1.5">
      <button
        class="btn flex-1 justify-center text-[12px]"
        :class="itemStore.filter.untaggedOnly ? 'btn-primary' : ''"
        @click="itemStore.toggleUntaggedOnly()"
      >
        {{ itemStore.filter.untaggedOnly ? '只看未打标签' : '全部条目' }}
      </button>
    </div>
  </div>
</template>

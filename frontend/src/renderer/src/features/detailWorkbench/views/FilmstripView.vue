<script setup lang="ts">
/**
 * 预览条视图：前后各 6 张的相册胶片条（顺序与翻页同源）。
 * 薄壳包 ItemFilmstrip：条只做载体不做导航决策，点选经骨架的 go 翻页。
 */
import { useDetailWorkbenchContext } from '../context'
import ItemFilmstrip from '../../../components/item/ItemFilmstrip.vue'

const ctx = useDetailWorkbenchContext()

function pickById(id: string): void {
  ctx.go(ctx.windowViews.find((v) => v.id === id) ?? null)
}
</script>

<template>
  <ItemFilmstrip
    v-if="ctx.windowViews.length > 0"
    :items="ctx.windowViews"
    :current-id="ctx.item.id"
    @pick="pickById"
  />
</template>

<script setup lang="ts">
/**
 * 内置图片预览（detailPreview 默认提供方，D37）：渲染内状态自持——
 * 解码就绪才换源（翻页不闪白）+ Ctrl+滚轮锚点缩放 + 拖拽平移 + 双击复位。
 */
import { computed, ref, watch } from 'vue'
import { taghitFileUrl } from '../../lib/media'
import { anchorZoom, pan as panZoom, FIT, wheelFactor, type ZoomState } from '../../features/imageZoom'
import type { ItemView } from '../../lib/viewModel'

const props = defineProps<{ item: ItemView }>()

const mediaUrl = computed(() => (props.item.sourceUri ? taghitFileUrl(props.item.sourceUri) : null))

/** 解码就绪才换源：图→图翻页保留旧画面等解码（上一张的预取已焐热解码缓存）；
 *  从其他形态进入时不留旧画面——那是别的内容，不放错图。 */
const shownUrl = ref<string | null>(null)
let shownSeq = 0
let prevHasShown = false
watch(
  () => [props.item.id, mediaUrl.value] as const,
  async ([id, url]) => {
    if (id == null || url == null) {
      shownSeq += 1
      shownUrl.value = null
      prevHasShown = false
      return
    }
    const keepOld = prevHasShown && shownUrl.value != null
    const seq = ++shownSeq
    if (!keepOld) shownUrl.value = null
    const probe = new Image()
    probe.src = url
    try {
      await probe.decode()
    } catch {
      // 解码失败也照常换源：真元素自会走 @error 兜底
    }
    if (seq !== shownSeq) return // 快速连翻：只认最后一次
    shownUrl.value = url
    prevHasShown = true
  },
  { immediate: true }
)

// ---- 缩放（视图状态，不落库）：新一张不继承上一张的缩放 ----
const mediaImg = ref<HTMLImageElement | null>(null)
const zoom = ref<ZoomState>({ ...FIT })
const zoomed = computed(() => zoom.value.scale !== 1)
const panning = ref(false)
const zoomStyle = computed(() => ({
  transform: `translate(${zoom.value.tx}px, ${zoom.value.ty}px) scale(${zoom.value.scale})`,
  transformOrigin: '0 0'
}))

function resetZoom(): void {
  zoom.value = { ...FIT }
  panning.value = false
}

watch(
  () => props.item.id,
  () => resetZoom()
)

function onMediaWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return
  e.preventDefault()
  const rect = mediaImg.value?.getBoundingClientRect()
  if (rect == null) return
  zoom.value = anchorZoom(zoom.value, e.clientX - rect.left, e.clientY - rect.top, wheelFactor(e.deltaY))
}

function onPointerDown(e: PointerEvent): void {
  if (!zoomed.value || e.button !== 0) return
  panning.value = true
  mediaImg.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!panning.value) return
  zoom.value = panZoom(zoom.value, e.movementX, e.movementY)
}

function onPointerUp(e: PointerEvent): void {
  if (!panning.value) return
  panning.value = false
  try {
    mediaImg.value?.releasePointerCapture(e.pointerId)
  } catch {
    // 指针已隐式释放（pointercancel 等）
  }
}
</script>

<template>
  <div class="w-full h-full flex items-center justify-center overflow-hidden" @wheel="onMediaWheel">
    <!-- object-contain：媒体整体入框，**不裁切**（宁留边不裁画面，纪律同 ItemCard） -->
    <img
      v-if="shownUrl"
      ref="mediaImg"
      :src="shownUrl"
      :alt="item.title"
      class="max-w-full max-h-full object-contain rounded-md shadow-lg select-none"
      :class="zoomed ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''"
      :style="zoomStyle"
      draggable="false"
      @dblclick="resetZoom"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>

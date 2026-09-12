<script setup lang="ts">
/**
 * 显示面板 —— 功能组件容器（不再内联实现）。
 * 遍历注册表挂载 displayPanel 的功能组件渲染区块；组件各自独立、互不 import。
 * 当前区块：媒体类型 / 排序 / 布局（卡片标题已按用户决策仅入设置页）。
 * 外壳（宽度/边框/滚动）归壳（SurfaceHost 的停靠面板外壳）——此处只出内容。
 */
import { listFeatures } from '../../features/registry'
import SurfaceHost from '../../features/SurfaceHost.vue'

const blocks = listFeatures('displayPanel')
</script>

<template>
  <div class="px-3 py-3 space-y-4">
    <div class="text-[11px] uppercase tracking-wider text-[var(--fg-dim)] flex items-center gap-1.5">
      显示
    </div>

    <!-- 功能组件区块（壳只渲染声明；统一经 SurfaceHost：惰性解析 + 错误隔离 + 上下文注入） -->
    <SurfaceHost v-for="f in blocks" :key="f.manifest.id" :feature="f" surface="displayPanel" />

    <p class="text-[11px] text-[var(--fg-dim)] leading-relaxed">
      瀑布流模式下，图片卡片按真实比例渲染（比例上限
      <span class="kbd">2.2:1</span>，避免极端横幅/竖幅撑开）。视频、音频与文档保持固定比例。
    </p>
  </div>
</template>

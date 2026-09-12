import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Theme } from '@shared/types/config'

/** 左活动栏工具：路径 / 标签 / 显示 / 文件管理 */
export type LeftTool = 'paths' | 'tags' | 'display' | 'files'
/** 右活动栏工具：媒体信息 / 插件 */
export type RightTool = 'info' | 'plugins'

/**
 * 壳自身外观状态。功能组件的设置不在此处：经 stores/config.ts 按
 * `featureId:key` 命名空间持有（DECISIONS 2026-09-07）。
 */
export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('dark')
  /** 开始界面工作区卡片是否显示封面 */
  const showWorkspaceCovers = ref(true)

  // VSCode 式活动栏：每侧同时只开一个面板（点当前图标关闭，点其他图标切换）
  const leftTool = ref<LeftTool | null>('paths')
  const rightTool = ref<RightTool | null>(null)

  function toggleLeft(tool: LeftTool): void {
    leftTool.value = leftTool.value === tool ? null : tool
  }

  function toggleRight(tool: RightTool): void {
    rightTool.value = rightTool.value === tool ? null : tool
  }

  // 跟随系统：按 prefers-color-scheme 实时解析，并监听系统主题变化
  let mediaQuery: MediaQueryList | null = null
  let mediaListener: (() => void) | null = null

  function resolvedTheme(): 'dark' | 'light' {
    if (theme.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme.value
  }

  function applyTheme(): void {
    document.documentElement.setAttribute('data-theme', resolvedTheme())
    if (theme.value === 'system') {
      if (!mediaQuery) {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaListener = () => applyTheme()
        mediaQuery.addEventListener('change', mediaListener)
      }
    } else if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener)
      mediaQuery = null
      mediaListener = null
    }
  }

  /** config 持久化不在契约 v0：init 只应用本地缺省。 */
  function init(): void {
    applyTheme()
  }

  async function setTheme(t: Theme): Promise<void> {
    theme.value = t
    applyTheme()
  }

  async function toggleWorkspaceCovers(): Promise<void> {
    showWorkspaceCovers.value = !showWorkspaceCovers.value
  }

  return {
    theme,
    showWorkspaceCovers,
    leftTool,
    rightTool,
    toggleLeft,
    toggleRight,
    init,
    setTheme,
    toggleWorkspaceCovers
  }
})

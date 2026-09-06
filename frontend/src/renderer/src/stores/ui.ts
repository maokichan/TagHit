import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LayoutMode, Theme } from '@shared/types/config'

/** 左活动栏工具：路径 / 标签 / 显示 */
export type LeftTool = 'paths' | 'tags' | 'display'
/** 右活动栏工具：媒体信息 / 插件 */
export type RightTool = 'info' | 'plugins'

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('dark')
  const layoutMode = ref<LayoutMode>('masonry')
  /** 网格卡片是否显示标题 */
  const showTitles = ref(true)
  /** 开始界面工作区卡片是否显示封面 */
  const showWorkspaceCovers = ref(true)
  /** 全局 UI 缩放系数（CSS zoom：图标/字号/间距/媒体预览等比缩放，连续可调） */
  const uiScale = ref(1)
  /** 键鼠交互：Ctrl+F 搜索快捷键（功能组件 keyboardMouse 的设置项） */
  const enableSearchShortcut = ref(true)

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

  async function init(): Promise<void> {
    const cfg = await window.api.config.get()
    theme.value = cfg.theme
    layoutMode.value = cfg.layoutMode
    showTitles.value = cfg.showTitles ?? true
    showWorkspaceCovers.value = cfg.showWorkspaceCovers ?? true
    uiScale.value = cfg.uiScale ?? 1
    enableSearchShortcut.value = cfg.enableSearchShortcut ?? true
    applyScale()
    applyTheme()
  }

  async function setTheme(t: Theme): Promise<void> {
    theme.value = t
    applyTheme()
    await window.api.config.update({ theme: t })
  }

  async function setLayoutMode(m: LayoutMode): Promise<void> {
    layoutMode.value = m
    await window.api.config.update({ layoutMode: m })
  }

  async function toggleShowTitles(): Promise<void> {
    showTitles.value = !showTitles.value
    await window.api.config.update({ showTitles: showTitles.value })
  }

  async function toggleWorkspaceCovers(): Promise<void> {
    showWorkspaceCovers.value = !showWorkspaceCovers.value
    await window.api.config.update({ showWorkspaceCovers: showWorkspaceCovers.value })
  }

  // 全局 UI 缩放：CSS zoom 连续缩放整个渲染页（虚拟化靠 ResizeObserver 自动重算）
  const SCALE_MIN = 0.8
  const SCALE_MAX = 1.5
  function applyScale(): void {
    document.documentElement.style.zoom = String(uiScale.value)
  }
  async function setUiScale(s: number): Promise<void> {
    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))
    uiScale.value = clamped
    applyScale()
    await window.api.config.update({ uiScale: clamped })
  }

  async function setSearchShortcut(v: boolean): Promise<void> {
    enableSearchShortcut.value = v
    await window.api.config.update({ enableSearchShortcut: v })
  }

  return {
    theme,
    layoutMode,
    showTitles,
    showWorkspaceCovers,
    uiScale,
    enableSearchShortcut,
    leftTool,
    rightTool,
    toggleLeft,
    toggleRight,
    init,
    setTheme,
    setLayoutMode,
    toggleShowTitles,
    toggleWorkspaceCovers,
    setUiScale,
    setSearchShortcut
  }
})

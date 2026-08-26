/**
 * 功能组件：键鼠交互 —— 行为注册（快捷键 / 远期鼠标手势）。
 * 无面板 UI，仅挂设置页（配置项见 registry.ts 中 keyboardMouse 的 settings）。
 *
 * v1（占位）：Ctrl+F / Cmd+F 聚焦当前页搜索框（工作区过滤栏 / 主页全局搜索），
 * 开关见 config.enableSearchShortcut（设置页"键鼠交互"分区）。
 * 远期：更多快捷键 / 自定义键位 / 鼠标手势在此扩展。
 */
import { useUiStore } from '../../stores/ui'

let installed = false

export function setupKeyboardMouse(): void {
  if (installed) return
  installed = true

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      const ui = useUiStore()
      if (!ui.enableSearchShortcut) return
      // 当前页面有搜索框才聚焦（工作区/主页；详情/设置页无搜索框则忽略）
      const input = document.querySelector<HTMLInputElement>('[data-shortcut="search"]')
      if (input) {
        input.focus()
        input.select()
      }
    }
  })
}

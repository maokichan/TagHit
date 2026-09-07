import { ref } from 'vue'
import type { MenuContext } from '@shared/types/command'

/**
 * 右键菜单开合状态（壳级，全局唯一实例）：拦截器（App 根部）写入，ContextMenuHost 读取渲染。
 * 事件拦截权与装配规则归壳——组件只声明 context target，不经此模块。
 */
const opened = ref<{ ctx: MenuContext; x: number; y: number } | null>(null)

export function openContextMenu(ctx: MenuContext, x: number, y: number): void {
  opened.value = { ctx, x, y }
}

export function closeContextMenu(): void {
  opened.value = null
}

export function useContextMenuState(): typeof opened {
  return opened
}

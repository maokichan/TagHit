/**
 * 搜索弹出面板的开合状态（壳级，全局唯一实例）——palette.ts 同款范式：
 * 顶栏图标钮与 shell.focusSearch 快捷键写入，SearchPopup.vue 读取渲染。
 * 开合是**切换**语义（呼出 ↔ 放回）：图标钮与 Ctrl+F 同一把状态。
 */
import { ref } from 'vue'

const opened = ref(false)

export function openSearchPopup(): void {
  opened.value = true
}

export function closeSearchPopup(): void {
  opened.value = false
}

export function toggleSearchPopup(): void {
  opened.value = !opened.value
}

export function useSearchPopupState(): typeof opened {
  return opened
}

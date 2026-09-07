import { reactive } from 'vue'

/**
 * 功能组件设置仓（settings 机制化，DECISIONS 2026-09-07）：
 * SettingSchema.key 的语义 = **组件内 key**，实际存储键 = `featureId:key`，
 * 由壳统一持有——三方插件声明同名 key 也不会冲突。
 * 持久化：localStorage 起步（taghit.featureSettings），宿主 config 端点落地后整体迁移，
 * 存储键形状不变。ui store 只保留壳自身外观（主题/缩放/封面/活动栏开合）。
 */
const STORAGE_KEY = 'taghit.featureSettings'

type Values = Record<string, unknown>

function load(): Values {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Values
  } catch {
    return {}
  }
}

const values = reactive<Values>(load())

function value<T>(featureId: string, key: string, fallback: T): T {
  const v = values[`${featureId}:${key}`]
  return (v === undefined ? fallback : v) as T
}

function setValue(featureId: string, key: string, v: unknown): void {
  values[`${featureId}:${key}`] = v
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  } catch {
    // localStorage 不可用（隐私模式等）：仅丢持久化，会话内仍生效
  }
}

export function useConfigStore() {
  return { value, setValue }
}

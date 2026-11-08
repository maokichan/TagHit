/**
 * 插件贡献文案解析（D51）：字符串透传；语言映射取当前语言、缺失回落首值。
 * 纯函数、零 Vue / 零 store 依赖——locale 由调用方传入（i18n.global.locale.value）。
 * 官方文案不走此模块（单语硬编码，D50）。
 */
import type { LocalizedText, PluginManifestFile } from '@shared/contract'

export function resolveLocalized(value: LocalizedText | undefined, locale: string): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  const direct = value[locale]
  if (typeof direct === 'string') return direct
  const first = Object.values(value)[0]
  return typeof first === 'string' ? first : ''
}

/** 磁盘 manifest 的文案字段（title/description）按当前语言解析为字符串（其余字段原样）。 */
export interface LocalizedManifest extends Omit<PluginManifestFile, 'title' | 'description'> {
  title: string
  description?: string
}

export function localizeManifestTexts(m: PluginManifestFile, locale: string): LocalizedManifest {
  const { title, description, ...rest } = m
  const out: LocalizedManifest = { ...rest, title: resolveLocalized(title, locale) }
  if (description != null) out.description = resolveLocalized(description, locale)
  return out
}

/** SettingSchema 形状的文案字段（label 与 options[].label），解析后其余字段原样保留。 */
interface LocalizableSetting {
  label: LocalizedText
  options?: Array<{ label: LocalizedText }>
}

export function resolveSettingLabels<S extends LocalizableSetting>(s: S, locale: string): S {
  return {
    ...s,
    label: resolveLocalized(s.label, locale),
    ...(s.options == null ? {} : { options: s.options.map((o) => ({ ...o, label: resolveLocalized(o.label, locale) })) })
  }
}

import { describe, expect, it } from 'vitest'
import { localizeManifestTexts, resolveLocalized, resolveSettingLabels } from '../lib/localized'

describe('resolveLocalized（D51 插件文案两形态）', () => {
  it('字符串透传', () => {
    expect(resolveLocalized('音频播放器', 'zh-CN')).toBe('音频播放器')
    expect(resolveLocalized('音频播放器', 'en')).toBe('音频播放器')
  })

  it('映射按当前语言取值', () => {
    const value = { zh: '打开', en: 'Open' }
    expect(resolveLocalized(value, 'zh-CN')).toBe('打开')
    expect(resolveLocalized(value, 'en')).toBe('Open')
  })

  it('映射缺失当前语言回落首值', () => {
    expect(resolveLocalized({ zh: '打开' }, 'en')).toBe('打开')
    expect(resolveLocalized({ 'zh-CN': '打开', en: 'Open' }, 'ja')).toBe('打开')
  })

  it('undefined 与空映射得空串', () => {
    expect(resolveLocalized(undefined, 'zh-CN')).toBe('')
    expect(resolveLocalized({}, 'zh-CN')).toBe('')
  })
})

describe('localizeManifestTexts', () => {
  it('title/description 解析为字符串，其余字段原样保留', () => {
    const m = {
      id: 'audioPlayer',
      title: { zh: '音频播放器', en: 'Audio Player' },
      description: '认领音频条目',
      version: '0.3.0'
    }
    const out = localizeManifestTexts(m, 'en')
    expect(out.title).toBe('Audio Player')
    expect(out.description).toBe('认领音频条目')
    expect(out.version).toBe('0.3.0')
  })
})

describe('resolveSettingLabels', () => {
  it('label 与 options[].label 解析，key/type/default 保留', () => {
    const s = {
      key: 'lyricsFontSize',
      type: 'enum' as const,
      label: { zh: '歌词字号', en: 'Lyrics size' },
      options: [
        { value: 'standard', label: { zh: '标准', en: 'Standard' } },
        { value: 'large', label: { zh: '大', en: 'Large' } }
      ],
      default: 'standard'
    }
    const out = resolveSettingLabels(s, 'en')
    expect(out.label).toBe('Lyrics size')
    expect(out.options?.[1].label).toBe('Large')
    expect(out.key).toBe('lyricsFontSize')
    expect(out.default).toBe('standard')
  })

  it('无 options 的设置项原样解析 label', () => {
    const s = { key: 'k', type: 'boolean' as const, label: '显示' }
    expect(resolveSettingLabels(s, 'zh-CN')).toMatchObject({ label: '显示', key: 'k' })
  })
})

import { createI18n } from 'vue-i18n'
import { DEFAULT_CONFIG } from '@shared/types/config'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'

/**
 * 界面文案 i18n 接缝（D50）：zh-CN 底 + en，缺 key 回落中文。
 * 语言包按命名空间分节（statusbar / …），存量文案抽取按批次迁入。
 */
export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_CONFIG.locale,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en
  }
})

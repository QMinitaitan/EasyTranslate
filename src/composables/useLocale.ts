import { computed, ref } from 'vue'

type Locale = 'zh-CN' | 'en'

const STORAGE_KEY = 'translate-app.ui-language'

function detectSystemLocale(): Locale {
  const language = typeof navigator !== 'undefined' ? navigator.language : ''
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh-CN' || saved === 'en') return saved
  } catch (_) {}
  return detectSystemLocale()
}

const locale = ref(initialLocale())

const messages = {
  'zh-CN': {
    settings: '设置',
    history: '历史',
    general: '通用',
    api: '翻译接口',
    prompts: '提示词预设',
    shortcuts: '快捷键',
    about: '关于',
    systemTheme: '跟随系统',
    lightTheme: '浅色',
    darkTheme: '深色'
  },
  en: {
    settings: 'Settings',
    history: 'History',
    general: 'General',
    api: 'Translation APIs',
    prompts: 'Prompt presets',
    shortcuts: 'Shortcuts',
    about: 'About',
    systemTheme: 'Use System Theme',
    lightTheme: 'Light',
    darkTheme: 'Dark'
  }
}

function setLocale(value: string) {
  locale.value = value === 'zh-CN' ? 'zh-CN' : 'en'
  document.documentElement.lang = locale.value
  try {
    window.localStorage.setItem(STORAGE_KEY, locale.value)
  } catch (_) {}
}

export function useLocale() {
  const t = (key: keyof typeof messages['zh-CN']) => messages[locale.value]?.[key] || messages['zh-CN'][key] || key
  return {
    locale,
    isEnglish: computed(() => locale.value === 'en'),
    setLocale,
    t
  }
}


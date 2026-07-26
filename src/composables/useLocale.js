import { computed, ref } from 'vue'

const STORAGE_KEY = 'translate-app.ui-language'

function detectSystemLocale() {
  const language = typeof navigator !== 'undefined' ? navigator.language : ''
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function initialLocale() {
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
    shortcuts: 'Shortcuts',
    about: 'About',
    systemTheme: 'Use System Theme',
    lightTheme: 'Light',
    darkTheme: 'Dark'
  }
}

function setLocale(value) {
  locale.value = value === 'zh-CN' ? 'zh-CN' : 'en'
  document.documentElement.lang = locale.value
  try {
    window.localStorage.setItem(STORAGE_KEY, locale.value)
  } catch (_) {}
}

export function useLocale() {
  const t = key => messages[locale.value]?.[key] || messages['zh-CN'][key] || key
  return {
    locale,
    isEnglish: computed(() => locale.value === 'en'),
    setLocale,
    t
  }
}


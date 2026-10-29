<template>
  <div v-if="isPopupRoute" class="popup-only">
    <router-view />
  </div>
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="logo drag">
        <img class="logo-mark" :src="appMarkUrl" alt="" />
        <span class="logo-text">{{ t('settings') }}</span>
      </div>
      <nav class="nav no-drag">
        <router-link class="nav-item" to="/" exact-active-class="active">
          {{ t('history') }}
        </router-link>
        <router-link class="nav-item" to="/settings/general" active-class="active">
          {{ t('general') }}
        </router-link>
        <router-link class="nav-item" to="/settings/api" active-class="active">
          {{ t('api') }}
        </router-link>
        <router-link class="nav-item" to="/settings/shortcut" active-class="active">
          {{ t('shortcuts') }}
        </router-link>
        <router-link class="nav-item" to="/settings/about" active-class="active">
          {{ t('about') }}
        </router-link>
      </nav>
      <div class="sidebar-footer no-drag">
        <div class="theme-switch">
          <button
            class="seg-btn"
            :class="{ active: mode === 'system' }"
            @click="setMode('system')"
            :title="t('systemTheme')"
          >
            <Monitor :size="13" :stroke-width="1.75" />
          </button>
          <button
            class="seg-btn"
            :class="{ active: mode === 'light' }"
            @click="setMode('light')"
            :title="t('lightTheme')"
          >
            <Sun :size="13" :stroke-width="1.75" />
          </button>
          <button
            class="seg-btn"
            :class="{ active: mode === 'dark' }"
            @click="setMode('dark')"
            :title="t('darkTheme')"
          >
            <Moon :size="13" :stroke-width="1.75" />
          </button>
        </div>
        <span class="ver">v0.0.1</span>
      </div>
    </aside>
    <main class="content">
      <router-view />
    </main>
    <CommandPalette v-model:open="paletteOpen" />
  </div>
  <div class="save-errors no-drag">
    <div v-if="configSaveError" class="config-save-error" role="alert">
      <span>{{ configSaveError }}</span>
      <button type="button" class="icon-btn" :aria-label="isEnglish ? 'Dismiss' : '关闭'" @click="configSaveError = ''">×</button>
    </div>
    <div v-if="historySaveError" class="history-save-error" role="alert">
      <span>{{ historySaveError }}</span>
      <button type="button" class="icon-btn" :aria-label="isEnglish ? 'Dismiss' : '关闭'" @click="historySaveError = ''">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import type { Unsubscribe } from '../electron/shared/ipc-contract.cjs'
import { useTheme } from './composables/useTheme'
import { useLocale } from './composables/useLocale'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { flushPendingSettings } from './composables/usePendingSettings'
import { errorMessage } from './types'
import { useRoute, useRouter } from 'vue-router'
import CommandPalette from './components/CommandPalette.vue'
import appMarkUrl from '../assets/icon-v3/easytranslate-mark.svg'

const { mode, setMode } = useTheme()
const { setLocale, t, isEnglish } = useLocale()
const configSaveError = ref('')
const historySaveError = ref('')
const paletteOpen = ref(false)
const route = useRoute()
const router = useRouter()
const isPopupRoute = computed(() => route.path.startsWith('/popup') && route.query.window === 'popup')
let offNavigate: Unsubscribe | undefined
let offConfigUpdate: Unsubscribe | undefined
let offConfigSaveError: Unsubscribe | undefined
let offHistorySaveError: Unsubscribe | undefined
let offHistoryUpdate: Unsubscribe | undefined
let offBeforeQuit: Unsubscribe | undefined

async function refreshLocale() {
  const cfg = await window.api?.loadConfig?.()
  if (cfg?.uiLanguage && cfg.uiLanguage !== 'system') setLocale(cfg.uiLanguage)
}

onMounted(async () => {
  const api = window.api
  offBeforeQuit = api?.onBeforeQuit(async token => {
    let saved = true
    try {
      await nextTick()
      await flushPendingSettings()
    } catch (error) {
      saved = false
      configSaveError.value = errorMessage(error, isEnglish.value ? 'Unable to finish saving settings' : '退出前保存配置失败')
    } finally {
      await api.completeQuitFlush(token, saved).catch(error => {
        configSaveError.value = errorMessage(error, 'Unable to acknowledge settings save')
      })
    }
  })
  offNavigate = window.api?.onNavigate?.((path) => router.push(path))
  offConfigUpdate = window.api?.onConfigUpdate?.(() => { refreshLocale().catch(() => {}) })
  offConfigSaveError = window.api?.onConfigSaveError?.((message) => { configSaveError.value = message })
  offHistorySaveError = window.api?.onHistorySaveError?.((message) => { historySaveError.value = message })
  offHistoryUpdate = window.api?.onHistoryUpdate?.(() => { historySaveError.value = '' })
  await refreshLocale().catch(() => {})
})

onUnmounted(() => { offBeforeQuit?.(); offNavigate?.(); offConfigUpdate?.(); offConfigSaveError?.(); offHistorySaveError?.(); offHistoryUpdate?.() })
</script>

<style scoped>
.save-errors {
  position: fixed;
  z-index: 1000;
  top: 12px;
  right: 12px;
  max-width: min(480px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.config-save-error, .history-save-error {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-card);
  color: var(--danger);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  font-size: var(--fs-sm);
}
.app-shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  height: 100vh;
}
.popup-only {
  height: 100vh;
  overflow: hidden;
}
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  padding: var(--space-4) var(--space-3);
  user-select: none;
}
.logo {
  display: flex; align-items: center;
  gap: 10px;
  padding: 32px var(--space-3) var(--space-5);
  font-weight: 600; font-size: var(--fs-md);
  color: var(--text-strong);
}
.logo-mark {
  width: 30px;
  height: 30px;
  display: block;
  flex: 0 0 auto;
}
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-section {
  margin: var(--space-5) var(--space-3) var(--space-2);
  font-size: var(--fs-xs);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.nav-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  color: var(--text);
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
}
.nav-item:hover { background: var(--bg-hover); }
.nav-item.active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}
.sidebar-footer {
  margin-top: auto;
  padding: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.theme-switch {
  display: flex;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  padding: 2px;
  gap: 1px;
}
.seg-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 22px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  transition: all var(--transition);
}
.seg-btn:hover { color: var(--text); }
.seg-btn.active {
  background: var(--bg-card);
  color: var(--brand);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.ver { font-size: var(--fs-xs); color: var(--text-dim); margin-left: auto; }
.content {
  overflow: auto;
  background: var(--bg-main);
}
</style>

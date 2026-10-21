<template>
  <div class="page">
    <h2 class="page-title">{{ text.title }}</h2>
    <p class="page-sub">{{ text.subtitle }}</p>
    <p v-if="saveError" class="shortcut-save-error" role="alert">{{ saveError }}</p>

    <SortableSettingList
      v-model="shortcutOrder"
      class="setting-section"
      :items="shortcuts"
      @reorder="saveShortcutOrder"
    >
      <template #default="{ item: s }">
        <div
          class="sc-row"
          :class="{ recording: recording === s.id }"
        >
          <div class="sc-info">
            <div class="sc-name">{{ shortcutText[s.id].name }}</div>
            <div class="sc-desc">{{ shortcutText[s.id].desc }}</div>
          </div>
          <div class="sc-binding">
            <template v-if="recording === s.id">
              <span class="rec-badge">
                <span class="rec-dot"></span>
                {{ text.pressShortcut }}
                <span class="rec-sep">·</span>
                <span class="rec-esc" @click="cancelRecord">ESC {{ text.cancel }}</span>
              </span>
            </template>
            <template v-else>
              <div class="keys">
                <span v-for="(k, i) in s.keys" :key="i" class="key">{{ k }}</span>
                <span v-if="!s.keys.length" class="empty-key">{{ text.notSet }}</span>
              </div>
              <button class="btn btn-sm" @click="startRecord(s.id)">{{ s.keys.length ? text.change : text.set }}</button>
              <button v-if="s.keys.length" class="icon-btn" :title="text.clear" @click="clearShortcut(s)">
                <X :size="13" :stroke-width="1.75" />
              </button>
            </template>
          </div>
        </div>
      </template>
    </SortableSettingList>
  </div>
</template>

<script setup lang="ts">
import type { Unsubscribe } from '../../electron/shared/ipc-contract.cjs'
import { errorMessage, savedOrder } from '../types'
import { registerSettingsFlush, trackSettingsSave } from '../composables/usePendingSettings'
import type { Shortcuts } from '../../electron/shared/ipc-contract.cjs'
type ShortcutId = keyof Shortcuts
interface ShortcutDraft { id: ShortcutId; name: string; desc: string; keys: string[] }
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { X } from 'lucide-vue-next'
import SortableSettingList from '../components/SortableSettingList.vue'
import { useLocale } from '../composables/useLocale'

const recording = ref<ShortcutId | null>(null)
const shortcutOrder = ref<string[]>([])
const saveError = ref('')
let offConfigUpdate: Unsubscribe | undefined
let saving = false
let disposed = false
let recordingTarget: ShortcutId | null = null
const { isEnglish } = useLocale()
const text = computed(() => isEnglish.value ? {
  title: 'Shortcuts',
  subtitle: 'Configure global shortcuts; changes take effect immediately',
  pressShortcut: 'Press a shortcut',
  cancel: 'Cancel',
  notSet: 'Not set',
  change: 'Change',
  set: 'Set',
  clear: 'Clear'
} : {
  title: '快捷键',
  subtitle: '配置全局快捷键，修改后立即生效',
  pressShortcut: '按下快捷键',
  cancel: '取消',
  notSet: '未设置',
  change: '更改',
  set: '设置',
  clear: '清除'
})
const shortcutText = computed(() => isEnglish.value ? {
  translate: { name: 'Selection Translation', desc: 'Show the translation popup for selected text' },
  show: { name: 'Show/Hide Main Window', desc: 'Quickly show or hide EasyTranslate' }
} : {
  translate: { name: '划词翻译', desc: '选中文本后弹悬浮窗显示译文' },
  show: { name: '显示/隐藏主窗口', desc: '快速唤出或隐藏程序' }
})

const DEFAULT_MAP: Record<ShortcutId, string[]> = {
  translate: ['Alt', 'Q'],
  show: ['Alt', 'E']
}

const shortcuts = reactive<ShortcutDraft[]>([
  { id: 'translate', name: '划词翻译', desc: '选中文本后弹悬浮窗显示译文', keys: [] },
  { id: 'show', name: '显示/隐藏主窗口', desc: '快速唤出或隐藏程序', keys: [] }
])

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

function normalizeKey(e: KeyboardEvent) {
  if (MODIFIER_KEYS.has(e.key)) return null
  if (e.code === 'Space') return 'Space'
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

function onKeydown(e: KeyboardEvent) {
  if (recording.value === null) return
  if (e.key === 'Escape') { cancelRecord(); return }
  e.preventDefault()
  e.stopPropagation()
  const main = normalizeKey(e)
  const mods = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  if (mods.length === 0 || !main) return
  const keys = [...mods, main]
  const target = shortcuts.find(s => s.id === recordingTarget)
  if (target) {
    target.keys = keys
    recording.value = null
    recordingTarget = null
    autoSave()
  }
}

function startRecord(id: ShortcutId) {
  recording.value = id
  recordingTarget = id
}
function cancelRecord() {
  recording.value = null
  recordingTarget = null
}

function keysToAccel(keys: string[]) { return keys.join('+') }

async function loadShortcuts() {
  const api = window.api
  if (!api) { for (const s of shortcuts) s.keys = [...DEFAULT_MAP[s.id]]; return }
  try {
    const [map, cfg] = await Promise.all([
      api.loadShortcuts(),
      api.loadConfig()
    ])
    if (disposed) return
    for (const s of shortcuts) {
      s.keys = map[s.id] ? map[s.id].split('+') : []
    }
    shortcutOrder.value = savedOrder(cfg.settingsOrder?.shortcuts)
  } catch (_) {
    for (const s of shortcuts) {
      s.keys = [...(DEFAULT_MAP[s.id] || [])]
    }
  }
}

async function saveShortcuts() {
  const api = window.api
  if (!api) return
  autoSaveTimer = undefined
  saving = true
  const map: Shortcuts = { translate: '', show: '' }
  for (const s of shortcuts) {
    map[s.id] = keysToAccel(s.keys)
  }
  try { await trackSettingsSave(api.saveShortcuts(map)); saveError.value = ''; return true }
  catch (error) { saveError.value = errorMessage(error, (isEnglish.value ? 'Unable to save shortcuts' : '快捷键保存失败')); return false }
  finally { saving = false }
}

async function saveShortcutOrder(order: string[]) {
  try { if (window.api) await trackSettingsSave(window.api.saveConfig({ settingsOrder: { shortcuts: order } })); saveError.value = '' }
  catch (error) { saveError.value = errorMessage(error, (isEnglish.value ? 'Unable to save settings' : '配置保存失败')) }
}

function clearShortcut(s: ShortcutDraft) {
  s.keys = []
  autoSave()
}

function autoSave() {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(saveShortcuts, 100)
}
let autoSaveTimer: number | undefined

const unregisterFlush = registerSettingsFlush(() => {
  if (autoSaveTimer !== undefined) { window.clearTimeout(autoSaveTimer); return saveShortcuts() }
})

onMounted(() => {
  offConfigUpdate = window.api?.onConfigUpdate?.(() => {
    if (!autoSaveTimer && !saving && recording.value === null) loadShortcuts()
  })
  loadShortcuts()
  window.addEventListener('keydown', onKeydown, true)
})
onUnmounted(() => {
  unregisterFlush()
  disposed = true
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); saveShortcuts() }
  offConfigUpdate?.()
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<style scoped>
.shortcut-save-error { color: var(--danger); font-size: var(--fs-sm); }
.sc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  gap: var(--space-4);
  min-height: 44px;
  transition: background var(--transition);
}
.sc-row.recording { background: var(--brand-soft); }
.sc-name { font-size: var(--fs-base); font-weight: 500; color: var(--text-strong); }
.sc-desc { font-size: var(--fs-xs); color: var(--text-dim); margin-top: 1px; }
.sc-binding {
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--space-2);
  flex: 1;
}
.keys {
  display: flex; gap: var(--space-1);
  justify-content: flex-end;
  min-height: 22px;
}
.key {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px;
  padding: 0 var(--space-2);
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs); font-weight: 600;
  color: var(--text-strong);
  font-family: ui-monospace, "SF Mono", monospace;
}
.empty-key {
  font-size: var(--fs-sm); color: var(--text-dim);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-3);
  height: 22px;
  display: inline-flex; align-items: center;
}
.rec-badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  font-size: var(--fs-sm);
  color: var(--brand);
  white-space: nowrap;
}
.rec-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--brand);
  animation: rec-pulse 1s ease-in-out infinite;
}
.rec-sep { color: var(--text-dim); }
.rec-esc {
  font-size: var(--fs-xs);
  color: var(--text-dim);
  cursor: pointer;
}
.rec-esc:hover { color: var(--brand); }
@keyframes rec-pulse { 50% { opacity: 0.4; } }
</style>

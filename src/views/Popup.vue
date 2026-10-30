<template>
  <div class="popup-standalone" :class="{ 'is-window': isWindow }" ref="rootEl">
    <div class="popup pop-in" :style="popupFontStyle">
      <header class="popup-head drag">
        <div class="popup-head-controls">
          <EngineSelect
            class="no-drag"
            :engines="engines"
            v-model="current"
            v-model:race-mode="raceMode"
            @change="onEngineChange"
          />
          <span class="zoom-feedback-slot" aria-live="polite">
            <transition name="zoom-feedback">
              <span v-if="zoomNotice" class="zoom-feedback">
                Font {{ Math.round(fontScale * 100) }}%
              </span>
            </transition>
          </span>
          <div class="popup-actions no-drag">
            <button class="icon-btn" :class="{ active: pinned }" title="固定窗口" @click="togglePin">
              <Pin :size="13" :stroke-width="1.75" :fill="pinned ? 'currentColor' : 'none'" />
            </button>
            <button class="icon-btn" title="关闭" @click="close"><X :size="13" :stroke-width="1.75" /></button>
          </div>
        </div>
        <div class="prompt-switch no-drag">
          <label for="popup-prompt">提示词</label>
          <select id="popup-prompt" class="input" :value="selectedPromptPreset" :disabled="presetSaving || !promptOptions.length" @change="onPresetChange">
            <option v-for="preset in promptOptions" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
          </select>
          <button class="icon-btn" type="button" title="编辑提示词预设" aria-label="编辑提示词预设" @click="openPromptSettings"><PenLine :size="13" /></button>
        </div>
        <p v-if="presetError" class="prompt-notice prompt-error no-drag" role="alert">{{ presetError }}</p>
        <p v-if="promptSupportNotice" class="prompt-notice no-drag" role="status">{{ promptSupportNotice }}</p>
      </header>

      <section class="popup-body" @dblclick="togglePinFromBody">
        <transition name="pin-feedback">
          <div v-if="pinNotice" class="pin-feedback" role="status">{{ pinNotice }}</div>
        </transition>
        <template v-if="state === 'empty'">
          <div class="empty-state">
            <MousePointerClick :size="20" :stroke-width="1.5" />
            <div>未选中文字</div>
            <div class="empty-sub">先选中文本再按快捷键</div>
          </div>
        </template>
        <template v-else>
          <div class="src-box">
            <div class="box-label">
              <span>原文</span>
              <PenLine :size="11" :stroke-width="1.5" class="edit-hint" />
            </div>
            <div
              ref="srcEl"
              class="src-text editable"
              contenteditable="true"
              spellcheck="false"
              @keydown.enter.prevent="onSrcEdit"
              @blur="onSrcEdit"
            >{{ src }}</div>
          </div>
          <div v-if="state === 'loading'" class="loading-lines" aria-label="翻译中">
            <div class="skel skel-line" style="width: 65%"></div>
            <div class="skel skel-line" style="width: 85%"></div>
            <div class="skel skel-line" style="width: 55%"></div>
          </div>
          <div v-else-if="state === 'error'" class="error-bar">
            <AlertCircle :size="13" :stroke-width="1.75" />
            <span>{{ errorMsg }}</span>
            <button class="btn btn-sm btn-ghost" @click="retry">重试</button>
          </div>
          <div
            v-else
            class="dst-box race-content"
            :class="{ 'is-swapping': raceSwapping }"
          >
            <div class="box-label">
              <span>译文 · {{ sessionRaceMode ? engineDisplayName(raceActive.engine) : engineLabel }}</span>
              <span v-if="resultPresetName" class="session-preset">{{ resultPresetName }}</span>
              <PenLine :size="11" :stroke-width="1.5" class="edit-hint" />
            </div>
            <div
              ref="dstEl"
              :key="activeTranslationKey"
              class="dst-text editable"
              contenteditable="true"
              role="textbox"
              aria-label="编辑译文"
              aria-multiline="true"
              spellcheck="false"
              @keydown.enter.exact.prevent="commitDstEdit"
              @blur="onDstEdit"
            >{{ activeTranslation }}</div>
          </div>
          <div v-if="state !== 'error' && sessionRaceMode && raceErrors.length" class="race-errors" aria-label="失败的翻译引擎">
            <span v-for="result in raceErrors" :key="result.engine" class="race-error">
              {{ engineDisplayName(result.engine) }} 失败
            </span>
          </div>
          <p v-if="saveWarning" class="save-warning" role="status">{{ saveWarning }}</p>
        </template>
      </section>

      <footer class="popup-foot drag">
        <div class="foot-main">
          <button class="lang-indicator no-drag" type="button" @click="toggleDirection" title="点击切换翻译方向">
            <span class="lang-pair">{{ langLabel }}</span>
          </button>
          <button
            class="icon-btn theme-btn no-drag"
            type="button"
            :title="themeTitle"
            @click="toggleLightDark"
          >
            <svg
              v-if="resolvedTheme === 'light'"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5" />
            </svg>
            <Moon v-else :size="13" :stroke-width="1.5" />
          </button>
          <template v-if="sessionRaceMode && raceOk.length">
            <button
              class="race-cycle no-drag"
              :class="{ 'is-swapping': raceSwapping }"
              @click="cycleRace"
              title="点击切换引擎"
            >
              <span class="race-medal">{{ ['🥇','🥈','🥉'][raceActiveIdx] || '#' }}</span>
              <span class="race-engine">{{ engineDisplayName(raceActive.engine) }}</span>
              <span class="race-latency">{{ raceActive.ms }}ms</span>
              <span class="race-count">{{ raceActiveIdx + 1 }}/{{ raceOk.length }}</span>
            </button>
          </template>
          <span v-else-if="latency" class="latency">· {{ latency }}ms</span>
        </div>
        <div class="foot-tools no-drag">
          <button
            class="icon-btn"
            :class="{ copied: copied }"
            :disabled="!activeTranslation"
            :title="copied ? '已复制' : '复制译文'"
            @click="copyDst"
          >
            <Check v-if="copied" :size="13" :stroke-width="2" />
            <Copy v-else :size="13" :stroke-width="1.75" />
          </button>
          <button class="icon-btn" :disabled="!activeTranslation" :title="speaking ? '停止朗读' : '朗读译文'" @click="toggleSpeech">
            <Square v-if="speaking" :size="12" :stroke-width="1.75" />
            <Volume2 v-else :size="13" :stroke-width="1.75" />
          </button>
          <button class="icon-btn" title="打开设置" @click="openSettings">
            <Settings :size="13" :stroke-width="1.75" />
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PromptPreset, ProviderMetadata, RaceResult, TranslationResult, Unsubscribe } from '../../electron/shared/ipc-contract.cjs'
import type { EngineOption, EngineSelection } from '../types'
import { errorMessage } from '../types'
import { trackSettingsSave } from '../composables/usePendingSettings'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Pin, X, Copy, Check, AlertCircle, MousePointerClick, Moon, Settings, PenLine, Volume2, Square } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { setBrand } from '../composables/useBrand'
import { useTheme } from '../composables/useTheme'
import { useSpeech } from '../composables/useSpeech'
import EngineSelect from '../components/EngineSelect.vue'

const api = window.api
const route = useRoute()
const {
  mode: themeMode,
  resolvedTheme,
  toggleLightDark
} = useTheme()
const isWindow = computed(() => route.query.window === 'popup' || api?.isPopup?.())
const themeTitle = computed(() => {
  const next = resolvedTheme.value === 'dark' ? '浅色' : '深色'
  return themeMode.value === 'system'
    ? `跟随系统 · 点击切换为${next}`
    : `点击切换为${next}`
})

// Provider metadata and current capabilities share the backend availability decision.
const providerMeta = ref<ProviderMetadata[]>([])
const engines = ref<EngineOption[]>([])
const promptPresets = ref<Record<string, PromptPreset>>({})
const selectedPromptPreset = ref('')
const savedPromptPreset = ref('')
const presetSaving = ref(false)
const presetError = ref('')
const sessionPresetName = ref('')
const resultPresetName = computed(() => {
  const engine = sessionRaceMode.value ? raceActive.value.engine : engineLabel.value
  const meta = providerMeta.value.find(item => item.id === engine || item.name === engine)
  return meta?.adapter === 'openai-compat' ? sessionPresetName.value : ''
})
const promptOptions = computed(() => Object.entries(promptPresets.value).map(([id, preset]) => ({ id, name: preset.name })))
const promptSupportNotice = computed(() => {
  const ids = raceMode.value ? engines.value.map(engine => engine.id) : [currentEngineId.value]
  const names = providerMeta.value.filter(meta => ids.includes(meta.id) && meta.adapter !== 'openai-compat').map(meta => meta.name)
  return names.length ? `${names.join('、')} 不支持提示词预设，仍正常翻译` : ''
})
let engineRefreshSequence = 0
let configRefreshQueued = false

function queueEngineRefresh() {
  // Geometry and preferences share config:updated. Coalesce a synchronous burst
  // and invalidate an earlier refresh as soon as a newer notification arrives.
  ++engineRefreshSequence
  if (configRefreshQueued) return
  configRefreshQueued = true
  void Promise.resolve().then(() => {
    configRefreshQueued = false
    if (popupMounted) void loadEngines()
  })
}

async function loadEngines() {
  if (!api) return
  const refresh = ++engineRefreshSequence
  try {
    const [cfg, meta, capabilities] = await Promise.all([
      api.loadConfig(),
      api.listProviders(),
      api.providerCapabilities()
    ])
    if (!popupMounted || refresh !== engineRefreshSequence) return
    providerMeta.value = meta
    promptPresets.value = cfg.promptPresets || {}
    savedPromptPreset.value = cfg.selectedPromptPreset || ''
    if (!presetSaving.value) selectedPromptPreset.value = cfg.selectedPromptPreset || ''
    raceMode.value = cfg.raceMode !== false
    const providers = cfg.providers || {}
    const list: EngineOption[] = []
    for (const m of meta) {
      const p = providers[m.id]
      if (p && capabilities.find(capability => capability.id === m.id)?.available) {
        list.push({ name: m.name, color: m.color, id: m.id })
      }
    }
    if (list.length === 0) {
      list.push({ name: '未配置API', color: 'var(--brand)', id: '__none__' })
    }
    engines.value = list
    if (!list.find(e => e.name === current.value)) {
      current.value = list[0].name
      const e = list[0]
      if (!src.value) {
        setBrand(e.color)
        engineLabel.value = e.name
      }
    }
  } catch (_) {
    if (!popupMounted || refresh !== engineRefreshSequence) return
    engines.value = [{ name: '无法读取可用引擎', color: 'var(--brand)', id: '__none__' }]
  }
}

function engineDisplayName(raw: string = '') {
  const found = providerMeta.value.find(m => m.name === raw || m.id === raw)
  return found ? found.name : raw
}

const currentEngineId = computed(() => {
  const match = engines.value.find(e => e.name === current.value)
  return match ? match.id : null
})

const current = ref('')
const raceMode = ref(true)
// Settings choose the next request. Existing results retain their session mode.
const sessionRaceMode = ref(false)
const pinned = ref(false)
const copied = ref(false)
const pinNotice = ref('')

const targetLangMap = ['中文(简体)', 'English']
const targetIdx = ref(0)
const manualDir = ref(false)
const targetLang = computed(() => targetLangMap[targetIdx.value])
const langLabel = computed(() => targetIdx.value === 0 ? '英 → 中' : '中 → 英')
const srcEl = ref<HTMLElement | null>(null)
const dstEl = ref<HTMLElement | null>(null)
function onSrcEdit() {
  const el = srcEl.value
  if (!el) return
  const text = el.textContent?.trim() || ''
  if (text && text !== src.value) {
    manualDir.value = false
    doTranslate(text)
  }
}
function toggleDirection() {
  targetIdx.value = targetIdx.value === 0 ? 1 : 0
  manualDir.value = true
  if (src.value) doTranslate(src.value)
}
function hasCJK(t: string) { return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(t) }

const state = ref<'idle' | 'loading' | 'empty' | 'error'>('idle')
const src = ref('')
const dst = ref('')
const errorMsg = ref('')
const saveWarning = ref('')
const latency = ref(0)
const engineLabel = ref('')
const raceResults = ref<RaceResult[]>([])
const raceActiveIdx = ref(0)
const firstDone = ref(false)
const raceOk = computed(() => raceResults.value.filter(r => !r.error && r.text?.trim()))
const raceErrors = computed(() => raceResults.value.filter(r => r.error))
const raceActive = computed(() => raceOk.value[raceActiveIdx.value] || { text: '', engine: '', ms: 0 })
const raceSwapping = ref(false)
let raceSwapTimer: number | undefined
const translationEdits = ref<Record<string, string>>({})

function cycleRace() {
  if (raceOk.value.length < 2 || raceSwapping.value) return
  raceSwapping.value = true
  clearTimeout(raceSwapTimer)
  raceSwapTimer = window.setTimeout(() => {
    raceActiveIdx.value = (raceActiveIdx.value + 1) % raceOk.value.length
    requestAnimationFrame(() => { raceSwapping.value = false })
  }, 75)
}

const activeTranslationKey = computed(() =>
  sessionRaceMode.value ? `race:${raceActive.value.engine || 'pending'}` : 'single'
)
const baseTranslation = computed(() =>
  sessionRaceMode.value ? (raceActive.value.text || '') : dst.value
)
const activeTranslation = computed(() => {
  const key = activeTranslationKey.value
  return Object.prototype.hasOwnProperty.call(translationEdits.value, key)
    ? translationEdits.value[key]
    : baseTranslation.value
})

function onDstEdit() {
  const el = dstEl.value
  if (!el) return
  const text = el.innerText?.trim() || ''
  translationEdits.value = {
    ...translationEdits.value,
    [activeTranslationKey.value]: text
  }
}

function commitDstEdit() {
  onDstEdit()
  dstEl.value?.blur()
}
const {
  speaking,
  stop: stopSpeech,
  toggle: toggleSpeech
} = useSpeech({
  getText: () => activeTranslation.value,
  getLanguage: () => targetLang.value === 'English' ? 'en-US' : 'zh-CN'
})

const FONT_SCALE_KEY = 'translate-app.popup-font-scale'
const FONT_SCALE_MIN = 0.8
const FONT_SCALE_MAX = 1.6
const FONT_SCALE_STEP = 0.1

function loadFontScale() {
  const saved = Number.parseFloat(window.localStorage?.getItem(FONT_SCALE_KEY) || '')
  return Number.isFinite(saved)
    ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, saved))
    : 1
}

const fontScale = ref(loadFontScale())
const popupFontStyle = computed(() => ({ '--popup-font-scale': fontScale.value }))
const zoomNotice = ref(false)
let zoomNoticeTimer: number | undefined

function isEditableNode(node: Element | null): boolean {
  if (!node) return false
  if ((node as HTMLElement).isContentEditable === true) return true
  const tag = typeof node.tagName === 'string' ? node.tagName.toUpperCase() : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function currentSelection(): Selection | null {
  return typeof document.getSelection === 'function' ? document.getSelection() : window.getSelection?.() || null
}

// Ctrl/Cmd+C copies the visible translation when nothing is selected and the
// pointer is over the result. A real selection keeps its native copy behavior.
function onCopyShortcut(e: KeyboardEvent): boolean {
  if (e.isComposing) return false
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false
  if (e.key?.toLowerCase() !== 'c') return false
  const selection = currentSelection()
  if (selection && !selection.isCollapsed) return false
  const el = dstEl.value
  if (!el) return false
  if (state.value !== 'idle') return false
  if (typeof el.matches !== 'function' || !el.matches(':hover')) return false
  const active = document.activeElement
  if (active && active !== el && isEditableNode(active)) return false
  const text = el.innerText ?? el.textContent ?? ''
  if (!text.trim()) return false
  e.preventDefault()
  void copyText(text)
  return true
}

function onKeyDown(e: KeyboardEvent) {
  if (onCopyShortcut(e)) return
  if (e.altKey) {
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      adjustFont(FONT_SCALE_STEP)
    }
    if (e.key === '-') {
      e.preventDefault()
      adjustFont(-FONT_SCALE_STEP)
    }
    if (e.key === '0') {
      e.preventDefault()
      setFontScale(1)
    }
  }
}

function onWheel(e: WheelEvent) {
  if (!e.altKey) return
  e.preventDefault()
  e.stopPropagation()
  if (e.deltaY === 0) return
  adjustFont(e.deltaY < 0 ? FONT_SCALE_STEP : -FONT_SCALE_STEP)
}

function adjustFont(delta: number) {
  setFontScale(fontScale.value + delta)
}

function setFontScale(value: number) {
  const next = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value))
  fontScale.value = Math.round(next * 10) / 10
  window.localStorage?.setItem(FONT_SCALE_KEY, String(fontScale.value))
  zoomNotice.value = true
  clearTimeout(zoomNoticeTimer)
  zoomNoticeTimer = window.setTimeout(() => { zoomNotice.value = false }, 700)
}

let offTrigger: Unsubscribe | null = null
let offConfigUpdate: Unsubscribe | null = null
let offTitlebarDoubleClick: Unsubscribe | null = null
let raceOffProgress: Unsubscribe | null = null
let raceOffDone: Unsubscribe | null = null
let singleOffProgress: Unsubscribe | null = null
let raceRequestSeq = 0
let activeRaceRequestId: string | null = null
let translationSequence = 0
let triggerSequence = 0
let pinNoticeTimer: number | undefined
let copiedTimer: number | undefined
let popupMounted = false

function onEngineChange(payload: EngineSelection) {
  if ('race' in payload) {
    raceMode.value = true
    if (api) void trackSettingsSave(api.saveConfig({ raceMode: true })).catch(() => {})
    if (src.value) doTranslate(src.value)
    return
  }
  if ('color' in payload) {
    setBrand(payload.color)
    engineLabel.value = payload.name
    raceMode.value = false
    if (api) void trackSettingsSave(api.saveConfig({ raceMode: false })).catch(() => {})
    if (src.value) doTranslate(src.value)
  }
}

async function onPresetChange(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (!api || presetSaving.value || id === selectedPromptPreset.value || !Object.hasOwn(promptPresets.value, id)) return
  const previous = selectedPromptPreset.value
  selectedPromptPreset.value = id
  presetSaving.value = true
  presetError.value = ''
  ++triggerSequence
  const sequence = ++translationSequence
  api.cancelTranslation()
  stopSpeech()
  try {
    await trackSettingsSave(api.saveConfig({ selectedPromptPreset: id }))
    savedPromptPreset.value = id
    if (popupMounted && sequence === translationSequence && src.value) void doTranslate(src.value)
  } catch {
    selectedPromptPreset.value = previous
    presetError.value = '提示词选择保存失败，请重试；仍使用上次已保存的预设。'
    if (popupMounted && sequence === translationSequence && state.value === 'loading') {
      state.value = 'error'
      errorMsg.value = '提示词选择保存失败，请重试'
    }
  } finally { presetSaving.value = false }
}

async function doTranslate(text: string) {
  ++triggerSequence
  const sequence = ++translationSequence
  stopSpeech()
  clearTimeout(raceSwapTimer)
  raceSwapping.value = false
  raceOffProgress?.()
  raceOffDone?.()
  singleOffProgress?.()
  singleOffProgress = null
  raceOffProgress = null
  raceOffDone = null
  activeRaceRequestId = null
  sessionRaceMode.value = raceMode.value
  sessionPresetName.value = promptPresets.value[savedPromptPreset.value]?.name || ''
  src.value = text
  dst.value = ''
  translationEdits.value = {}
  errorMsg.value = ''
  saveWarning.value = ''
  latency.value = 0
  raceResults.value = []
  raceActiveIdx.value = 0
  if (!text) {
    api?.cancelTranslation()
    state.value = 'empty'
    return
  }
  if (!api) { state.value = 'error'; errorMsg.value = '桌面翻译服务不可用'; return }
  state.value = 'loading'
  if (!manualDir.value) targetIdx.value = hasCJK(text) ? 1 : 0
  if (raceMode.value) {
    api?.cancelTranslation()
    raceResults.value = []
    raceActiveIdx.value = 0
    firstDone.value = false
    const requestId = `${Date.now()}-${++raceRequestSeq}`
    activeRaceRequestId = requestId
    raceOffProgress = api.onRaceProgress((result) => {
      if (sequence !== translationSequence || result.requestId !== activeRaceRequestId) return
      const existing = raceResults.value.findIndex(item => item.engine === result.engine)
      if (existing < 0) raceResults.value.push(result)
      else raceResults.value[existing] = result
      if (!result.error && result.text?.trim() && !firstDone.value) {
        firstDone.value = true
        dst.value = result.text
        latency.value = result.ms || 0
        engineLabel.value = engineDisplayName(result.engine)
        state.value = 'idle'
      }
    })
    raceOffDone = api.onRaceDone((data) => {
      if (sequence !== translationSequence || data.requestId !== activeRaceRequestId) return
      raceOffProgress?.()
      raceOffDone?.()
      raceOffProgress = null
      raceOffDone = null
      const selectedEngine = raceActive.value.engine
      raceResults.value = data.results || raceResults.value
      saveWarning.value = raceResults.value.find(result => result.historyError)?.historyError || ''
      if (!firstDone.value && (data.error || !data.best)) {
        state.value = 'error'
        errorMsg.value = data.error || raceErrors.value[0]?.error || '所有翻译引擎均请求失败'
        return
      }
      if (!firstDone.value && data.best) {
        dst.value = data.best.text || ''
        latency.value = data.best.ms || 0
        engineLabel.value = engineDisplayName(data.best.engine)
        state.value = 'idle'
      }
      const selectedIndex = raceOk.value.findIndex(result => result.engine === selectedEngine)
      raceActiveIdx.value = selectedIndex >= 0 ? selectedIndex : 0
    })
    api.startRaceTranslate({ text, target: targetLang.value, requestId, promptPresetId: savedPromptPreset.value || undefined })
    return
  } else {
    const requestId = `single-${Date.now()}-${sequence}`
    const showResult = (r: TranslationResult) => {
      if (sequence !== translationSequence || r.stale || r.requestId !== requestId) return
      if (r.error) { state.value = 'error'; errorMsg.value = r.error; return }
      dst.value = r.text || ''
      latency.value = r.ms || 0
      engineLabel.value = engineDisplayName(r.engine) || engineLabel.value
      saveWarning.value = r.historyError || ''
      state.value = 'idle'
    }
    const offProgress = api.onTranslationProgress(showResult)
    singleOffProgress = offProgress
    try {
      const r = await api.translate({ text, target: targetLang.value, providerId: currentEngineId.value, requestId, promptPresetId: savedPromptPreset.value || undefined })
      showResult(r)
    } catch (error) {
      if (sequence !== translationSequence) return
      state.value = 'error'
      errorMsg.value = errorMessage(error, '翻译失败')
    } finally {
      offProgress()
      if (singleOffProgress === offProgress) singleOffProgress = null
    }
  }
}

function retry() { if (src.value) doTranslate(src.value) }
function close() {
  stopSpeech()
  api?.closePopup()
}
function onTitlebarDoubleClick(point: { x: number; y: number }) {
  const target = document.elementFromPoint(point.x, point.y)
  if (!target?.closest('.popup-head') || target.closest('.no-drag, button, select, input, textarea, a')) return
  close()
}
function openSettings() {
  stopSpeech()
  api?.openSettings()
}
function openPromptSettings() {
  stopSpeech()
  api?.openSettings('/settings/prompts')
}
function togglePin() {
  pinned.value = !pinned.value
  api?.pinPopup(pinned.value)
}
function togglePinFromBody(e: MouseEvent) {
  if (e.button !== 0) return
  if (e.target instanceof Element && e.target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="button"], .no-pin-toggle')) return
  togglePin()
  pinNotice.value = pinned.value ? '悬浮窗已固定' : '悬浮窗已取消固定'
  clearTimeout(pinNoticeTimer)
  pinNoticeTimer = window.setTimeout(() => { pinNotice.value = '' }, 900)
}
async function writeClipboard(text: string) {
  if (!text) return
  if (api?.copyText) await api.copyText(text)
  else await navigator.clipboard.writeText(text)
}
async function copyText(text: string) {
  if (!text) return
  try {
    await writeClipboard(text)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => { copied.value = false }, 1000)
  } catch (_) {}
}
async function copyDst() {
  await copyText(activeTranslation.value)
}
onMounted(async () => {
  popupMounted = true
  offTitlebarDoubleClick = api?.onPopupTitlebarDoubleClick?.(onTitlebarDoubleClick) || null
  offConfigUpdate = api?.onConfigUpdate(queueEngineRefresh) || null
  await loadEngines()
  if (!popupMounted) return
  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
  document.addEventListener('keydown', onKeyDown)
  if (api?.triggerTranslate) {
    offTrigger = api.triggerTranslate(async (payload) => {
      const trigger = ++triggerSequence
      ++translationSequence
      api?.cancelTranslation()
      await loadEngines()
      if (trigger !== triggerSequence) return
      doTranslate(payload.text)
    })
  }
  if (isWindow.value && api?.popupReady) {
    const ready = await api.popupReady()
    if (popupMounted) pinned.value = ready.pinned
  }
})
onUnmounted(() => {
  popupMounted = false
  offTitlebarDoubleClick?.()
  ++engineRefreshSequence
  if (isWindow.value) api?.popupNotReady?.()
  ++translationSequence
  ++triggerSequence
  api?.cancelTranslation()
  document.removeEventListener('wheel', onWheel, { capture: true })
  document.removeEventListener('keydown', onKeyDown)
  clearTimeout(pinNoticeTimer)
  clearTimeout(zoomNoticeTimer)
  clearTimeout(raceSwapTimer)
  clearTimeout(copiedTimer)
  offTrigger?.()
  offConfigUpdate?.()
  singleOffProgress?.()
  raceOffProgress?.()
  raceOffDone?.()
})
</script>

<style scoped>
.prompt-switch { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--fs-xs); color: var(--text-dim); }
.prompt-switch select { flex: 1; min-width: 0; font-size: var(--fs-xs); padding: 4px 8px; }
.prompt-notice { margin: 4px 0 0; font-size: var(--fs-xs); color: var(--text-dim); white-space: normal; }
.prompt-error { color: var(--danger); }
.session-preset { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
.popup-standalone {
  padding: var(--space-6);
  height: 100vh;
  background: var(--bg-main);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.popup-standalone.is-window {
  padding: 0;
  background: var(--bg-card);
}
.popup {
  container-type: inline-size;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popup);
  overflow: hidden;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}
.popup-standalone.is-window .popup {
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.popup-head {
  display: flex; flex-direction: column; align-items: stretch;
  padding: var(--space-2);
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  user-select: none;
}
.popup-head-controls {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; gap: var(--space-2);
}
.popup-actions { display: flex; gap: 2px; flex-shrink: 0; }
.popup-body {
  --fs-xs: calc(12px * var(--popup-font-scale, 1));
  --fs-sm: calc(14px * var(--popup-font-scale, 1));
  --fs-base: calc(15px * var(--popup-font-scale, 1));
  --fs-md: calc(17px * var(--popup-font-scale, 1));
  --fs-lg: calc(19px * var(--popup-font-scale, 1));
  --fs-xl: calc(22px * var(--popup-font-scale, 1));
  padding: var(--space-4);
  flex: 1;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.save-warning { color: var(--danger); font-size: var(--fs-xs); }
.box-label {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--fs-xs); color: var(--text-dim); margin-bottom: var(--space-1);
}
.src-box { padding-bottom: var(--space-3); }
.src-text { font-size: var(--fs-sm); color: var(--text-dim); font-weight: 500; }
.src-text.live { color: var(--text); }
.editable {
  border-radius: var(--radius-sm);
  outline: none;
  border: 1.5px solid transparent;
  transition: border-color 0.15s;
  caret-color: var(--brand);
  padding: 2px 4px;
  margin: -2px -4px;
}
.editable:focus {
  border-color: color-mix(in srgb, var(--brand) 25%, transparent);
}
.edit-hint { opacity: 0.4; transition: opacity 0.15s; }
.box-label:hover .edit-hint { opacity: 0.8; }
.dst-box { padding-top: var(--space-3); }
.dst-text { font-size: var(--fs-md); font-weight: 500; color: var(--text-strong); line-height: 1.55; white-space: pre-wrap; }
.race-content {
  opacity: 1;
  transition: opacity 75ms ease;
}
.race-content.is-swapping {
  opacity: 0;
}
.loading-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-5);
}
.race-errors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-3);
}
.race-error {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 7%, transparent);
  font-size: var(--fs-xs);
}

.popup-foot {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--fs-xs); color: var(--text-dim);
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
}
.foot-main {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.theme-btn { flex-shrink: 0; }
.lang-pair { font-weight: 500; color: var(--text-dim); }
.lang-indicator {
  cursor: pointer;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  font-family: inherit;
  font-size: var(--fs-xs);
  white-space: nowrap;
  transition: background var(--transition);
}
.lang-indicator:hover {
  background: var(--bg-hover);
}
.lang-indicator:hover .lang-pair {
  color: var(--text-dim);
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
}
.lang-indicator:focus-visible {
  outline: 2px solid var(--border-strong);
  outline-offset: 1px;
}
.foot-tools { display: flex; gap: 2px; flex-shrink: 0; }

.race-medal { font-size: 11px; line-height: 1; flex-shrink: 0; }
.race-cycle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  max-width: 176px;
  min-width: 0;
  justify-self: start;
  overflow: hidden;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: var(--fs-xs); font-family: inherit;
  color: var(--text-dim);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), opacity 75ms ease;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.race-cycle.is-swapping {
  opacity: 0;
}
.race-cycle:hover {
  border-color: var(--border);
  background: var(--bg-hover);
  color: var(--text-dim);
}
.race-engine {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.race-latency {
  flex-shrink: 0;
}
.race-count {
  font-size: 10px; color: var(--text-dim);
  margin-left: 2px;
  flex-shrink: 0;
}

@container (max-width: 360px) {
  .popup-foot {
    gap: var(--space-1);
    padding-inline: var(--space-3);
  }
  .foot-main {
    gap: var(--space-1);
  }
  .race-count {
    display: none;
  }
}

.icon-btn.active { color: var(--brand); transform: rotate(-45deg); }
.icon-btn.copied { color: var(--text-dim); transform: none; transition: all 0.15s ease; }
.icon-btn:not(.copied) { transition: all 0.3s ease; }
.icon-btn:disabled { opacity: 0.35; cursor: default; }
.icon-btn:disabled:hover { background: transparent; color: inherit; }

.pin-feedback {
  position: absolute;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 5px 10px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow-popup);
  font-size: var(--fs-xs);
  pointer-events: none;
  white-space: nowrap;
}

.zoom-feedback-slot {
  margin-left: auto;
  width: 64px;
  min-width: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.zoom-feedback {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.2;
  opacity: 0.72;
  white-space: nowrap;
}

.error-bar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-size: var(--fs-sm);
}
.error-bar .btn { margin-left: auto; }
.empty-state {
  text-align: center;
  color: var(--text-dim);
  padding: var(--space-5) 0;
}
.empty-state > div { margin-top: var(--space-2); font-size: var(--fs-sm); }
.empty-sub { font-size: var(--fs-xs); color: var(--text-dim); }

.skel {
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: sk 1.4s infinite;
  border-radius: var(--radius-sm);
}
.skel-line { height: 12px; }
@keyframes sk {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.pin-feedback-enter-active, .pin-feedback-leave-active { transition: opacity 0.15s, transform 0.15s; }
.pin-feedback-enter-from, .pin-feedback-leave-to { opacity: 0; transform: translate(-50%, -4px); }
.zoom-feedback-enter-active, .zoom-feedback-leave-active { transition: opacity 0.15s ease; }
.zoom-feedback-enter-from, .zoom-feedback-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .race-content,
  .race-cycle {
    transition-duration: 0ms;
  }
}
</style>

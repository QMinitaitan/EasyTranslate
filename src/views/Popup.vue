<template>
  <div class="popup-standalone" :class="{ 'is-window': isWindow }" ref="rootEl">
    <div class="popup pop-in" :style="popupFontStyle">
      <header class="popup-head" @mousedown="startDrag">
        <div class="popup-head-controls">
          <EngineSelect
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
          <div class="popup-actions">
            <button class="icon-btn" :class="{ active: pinned }" title="固定窗口" @click="togglePin">
              <Pin :size="13" :stroke-width="1.75" :fill="pinned ? 'currentColor' : 'none'" />
            </button>
            <button class="icon-btn" title="关闭" @click="close"><X :size="13" :stroke-width="1.75" /></button>
          </div>
        </div>
      </header>

      <section class="popup-body" @dblclick="togglePinFromBody">
        <transition name="pin-feedback">
          <div v-if="pinNotice" class="pin-feedback" role="status">{{ pinNotice }}</div>
        </transition>
        <template v-if="state === 'loading'">
          <div class="box-label">原文</div>
          <div class="src-text live">{{ src || '—' }}</div>
          <div class="skel skel-line" style="width: 65%; margin-top: 16px"></div>
          <div class="skel skel-line" style="width: 85%; margin-top: 6px"></div>
          <div class="skel skel-line" style="width: 55%; margin-top: 6px"></div>
        </template>
        <template v-else-if="state === 'error'">
          <div class="error-bar">
            <AlertCircle :size="13" :stroke-width="1.75" />
            <span>{{ errorMsg }}</span>
            <button class="btn btn-sm btn-ghost" @click="retry">重试</button>
          </div>
        </template>
        <template v-else-if="state === 'empty'">
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
          <div class="dst-box">
            <div class="box-label">译文 · {{ raceMode ? engineDisplayName(raceActive.engine) : engineLabel }}</div>
            <div class="dst-text">{{ raceMode ? raceActive.text : dst }}</div>
          </div>
        </template>
      </section>

      <footer class="popup-foot" @mousedown="startDrag">
        <div class="foot-main">
          <span class="lang-indicator" @click="toggleDirection" title="点击切换翻译方向">
            <span class="lang-pair">{{ langLabel }}</span>
          </span>
          <button class="lang-btn" @click="cycleTheme()" title="切换主题">
            <Sun v-if="themeMode === 'light'" :size="12" :stroke-width="1.75" />
            <Moon v-else-if="themeMode === 'dark'" :size="12" :stroke-width="1.75" />
            <Monitor v-else :size="12" :stroke-width="1.75" />
          </button>
          <template v-if="raceMode && raceOk.length">
            <button class="race-cycle" @click="cycleRace" title="点击切换引擎">
              <span class="race-medal">{{ ['🥇','🥈','🥉'][raceActiveIdx] || '#' }}</span>
              <span class="race-engine-dot" :style="{ background: engineColor(raceActive.engine) }"></span>
              {{ engineDisplayName(raceActive.engine) }} {{ raceActive.ms }}ms
              <span class="race-count">{{ raceActiveIdx + 1 }}/{{ raceOk.length }}</span>
            </button>
          </template>
          <span v-else-if="latency" class="latency">· {{ latency }}ms</span>
        </div>
        <div class="foot-tools no-drag">
          <button class="icon-btn" :class="{ copied: copied }" :disabled="!activeTranslation" title="复制译文" @click="copyDst">
            <Copy :size="13" :stroke-width="1.75" />
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

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Pin, X, Copy, AlertCircle, MousePointerClick, Sun, Moon, Monitor, Settings, PenLine, Volume2, Square } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { setBrand } from '../composables/useBrand'
import { useTheme } from '../composables/useTheme'
import { useSpeech } from '../composables/useSpeech'
import EngineSelect from '../components/EngineSelect.vue'

const route = useRoute()
const { mode: themeMode, cycle: cycleTheme } = useTheme()
const isWindow = computed(() => route.query.window === 'popup' || window.api?.isPopup?.())

// Provider metadata loaded once from backend — name, color, id for display
const providerMeta = ref([])
const engines = ref([])

async function loadEngines() {
  try {
    const [cfg, meta] = await Promise.all([
      window.api.loadConfig(),
      window.api.listProviders()
    ])
    providerMeta.value = meta
    raceMode.value = cfg.raceMode !== false
    const providers = cfg.providers || {}
    const list = []
    for (const m of meta) {
      const p = providers[m.id]
      if (p && p.enabled) {
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
      setBrand(e.color)
      engineLabel.value = e.name
    }
  } catch (_) {
    engines.value = [{ name: 'DeepSeek', color: '#4d6bfe', id: 'deepseek' }]
    providerMeta.value = [{ id: 'deepseek', name: 'DeepSeek', color: '#4d6bfe' }]
  }
}

function engineColor(raw) {
  const found = providerMeta.value.find(m => m.name === raw || m.id === raw)
  if (found) return found.color
  return engines.value.find(e => e.name === raw)?.color || 'var(--brand)'
}

function engineDisplayName(raw) {
  const found = providerMeta.value.find(m => m.name === raw || m.id === raw)
  return found ? found.name : raw
}

const currentEngineId = computed(() => {
  const match = engines.value.find(e => e.name === current.value)
  return match ? match.id : null
})

const current = ref('')
const raceMode = ref(true)
const pinned = ref(false)
const copied = ref(false)
const pinNotice = ref('')

const targetLangMap = ['中文(简体)', 'English']
const targetIdx = ref(0)
const manualDir = ref(false)
const targetLang = computed(() => targetLangMap[targetIdx.value])
const langLabel = computed(() => targetIdx.value === 0 ? '英 → 中' : '中 → 英')
const srcEl = ref(null)
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
function hasCJK(t) { return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(t) }

const state = ref('idle')
const src = ref('')
const dst = ref('')
const errorMsg = ref('')
const latency = ref(0)
const engineLabel = ref('')
const raceResults = ref([])
const raceActiveIdx = ref(0)
const firstDone = ref(false)
const raceOk = computed(() => raceResults.value.filter(r => !r.error))
const raceActive = computed(() => raceOk.value[raceActiveIdx.value] || { text: '', engine: '', ms: 0 })

function cycleRace() {
  if (raceOk.value.length) {
    raceActiveIdx.value = (raceActiveIdx.value + 1) % raceOk.value.length
  }
}

const activeTranslation = computed(() => raceMode.value ? raceActive.value.text : dst.value)
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
  const saved = Number.parseFloat(window.localStorage?.getItem(FONT_SCALE_KEY))
  return Number.isFinite(saved)
    ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, saved))
    : 1
}

const fontScale = ref(loadFontScale())
const popupFontStyle = computed(() => ({ '--popup-font-scale': fontScale.value }))
const zoomNotice = ref(false)
let zoomNoticeTimer = null

function onKeyDown(e) {
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

function onWheel(e) {
  if (!e.altKey) return
  e.preventDefault()
  e.stopPropagation()
  if (e.deltaY === 0) return
  adjustFont(e.deltaY < 0 ? FONT_SCALE_STEP : -FONT_SCALE_STEP)
}

function adjustFont(delta) {
  setFontScale(fontScale.value + delta)
}

function setFontScale(value) {
  const next = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value))
  fontScale.value = Math.round(next * 10) / 10
  window.localStorage?.setItem(FONT_SCALE_KEY, String(fontScale.value))
  zoomNotice.value = true
  clearTimeout(zoomNoticeTimer)
  zoomNoticeTimer = setTimeout(() => { zoomNotice.value = false }, 700)
}

// manual drag
const dragging = ref(false)
let dragBaseX = 0
let dragBaseY = 0

function startDrag(e) {
  if (e.target.closest('.no-drag')) return
  if (e.button !== 0) return
  dragging.value = true
  dragBaseX = e.screenX
  dragBaseY = e.screenY
}
function onDragMove(e) {
  if (!dragging.value) return
  const dx = e.screenX - dragBaseX
  const dy = e.screenY - dragBaseY
  if (dx === 0 && dy === 0) return
  window.api.movePopup(dx, dy)
  dragBaseX = e.screenX
  dragBaseY = e.screenY
}
function stopDrag() { dragging.value = false }

let offTrigger = null
let raceOffProgress = null
let raceOffDone = null
let raceRequestSeq = 0
let activeRaceRequestId = null
let pinNoticeTimer = null

function onEngineChange(payload) {
  if (payload && payload.race) {
    raceMode.value = true
    window.api.saveConfig?.({ raceMode: true })
    return
  }
  if (payload && payload.color) {
    setBrand(payload.color)
    engineLabel.value = payload.name
    raceMode.value = false
    window.api.saveConfig?.({ raceMode: false })
  }
}

async function doTranslate(text) {
  stopSpeech()
  if (!text) { state.value = 'empty'; return }
  raceOffProgress?.()
  raceOffDone?.()
  raceOffProgress = null
  raceOffDone = null
  activeRaceRequestId = null
  src.value = text
  dst.value = ''
  raceResults.value = []
  raceActiveIdx.value = 0
  state.value = 'loading'
  if (!manualDir.value) targetIdx.value = hasCJK(text) ? 1 : 0
  if (raceMode.value) {
    raceResults.value = []
    raceActiveIdx.value = 0
    firstDone.value = false
    const requestId = `${Date.now()}-${++raceRequestSeq}`
    activeRaceRequestId = requestId
    raceOffProgress = window.api.onRaceProgress((result) => {
      if (result.requestId !== activeRaceRequestId) return
      raceResults.value.push(result)
      if (!result.error && !firstDone.value) {
        firstDone.value = true
        dst.value = result.text
        latency.value = result.ms
        engineLabel.value = engineDisplayName(result.engine)
        state.value = 'idle'
      }
    })
    raceOffDone = window.api.onRaceDone((data) => {
      if (data.requestId !== activeRaceRequestId) return
      if (data.error && !firstDone.value) {
        state.value = 'error'
        errorMsg.value = data.error
        return
      }
      if (!firstDone.value && data.best) {
        dst.value = data.best.text
        latency.value = data.best.ms
        engineLabel.value = engineDisplayName(data.best.engine)
        state.value = 'idle'
      }
      raceResults.value = data.results || []
      raceActiveIdx.value = 0
    })
    window.api.startRaceTranslate(text, targetLang.value, requestId)
    return
  } else {
    const r = await window.api.translate(text, targetLang.value, currentEngineId.value)
    if (r.error) { state.value = 'error'; errorMsg.value = r.error; return }
    dst.value = r.text
    latency.value = r.ms
    engineLabel.value = engineDisplayName(r.engine) || engineLabel.value
    state.value = 'idle'
  }
}

function retry() { if (src.value) doTranslate(src.value) }
function close() {
  stopSpeech()
  window.api.closePopup?.()
}
function openSettings() {
  stopSpeech()
  window.api.openSettings?.()
}
function togglePin() {
  pinned.value = !pinned.value
  window.api.pinPopup?.(pinned.value)
}
function togglePinFromBody(e) {
  if (e.button !== 0) return
  if (e.target.closest?.('button, a, input, textarea, select, [contenteditable="true"], [role="button"], .no-pin-toggle')) return
  togglePin()
  pinNotice.value = pinned.value ? '悬浮窗已固定' : '悬浮窗已取消固定'
  clearTimeout(pinNoticeTimer)
  pinNoticeTimer = setTimeout(() => { pinNotice.value = '' }, 900)
}
async function writeClipboard(text) {
  if (!text) return
  if (window.api?.copyText) await window.api.copyText(text)
  else await navigator.clipboard.writeText(text)
}
async function copyDst() {
  const text = activeTranslation.value
  if (!text) return
  try {
    await writeClipboard(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 600)
  } catch (_) {}
}
onMounted(async () => {
  await loadEngines()
  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', stopDrag)
  if (window.api?.triggerTranslate) {
    offTrigger = window.api.triggerTranslate(async (payload) => {
    await loadEngines()
    doTranslate(payload.text)
  })
  }
})
onUnmounted(() => {
  document.removeEventListener('wheel', onWheel, { capture: true })
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
  clearTimeout(pinNoticeTimer)
  clearTimeout(zoomNoticeTimer)
  offTrigger?.()
  raceOffProgress?.()
  raceOffDone?.()
})
</script>

<style scoped>
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
  display: flex; align-items: center; justify-content: space-between;
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
.box-label {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--fs-xs); color: var(--text-dim); margin-bottom: var(--space-1);
}
.src-box { padding-bottom: var(--space-3); }
.src-text { font-size: var(--fs-sm); color: var(--text-dim); font-weight: 500; }
.src-text.live { color: var(--text); }
.src-text.editable {
  border-radius: var(--radius-sm);
  outline: none;
  border: 1.5px solid transparent;
  transition: border-color 0.15s;
  caret-color: var(--brand);
  padding: 2px 4px;
  margin: -2px -4px;
}
.src-text.editable:focus {
  border-color: color-mix(in srgb, var(--brand) 25%, transparent);
}
.edit-hint { opacity: 0.4; transition: opacity 0.15s; }
.box-label:hover .edit-hint { opacity: 0.8; }
.dst-box { padding-top: var(--space-3); }
.dst-text { font-size: var(--fs-md); font-weight: 500; color: var(--text-strong); line-height: 1.55; white-space: pre-wrap; }

.popup-foot {
  position: relative;
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--fs-xs); color: var(--text-dim);
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
}
.foot-main { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
.lang-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: var(--fs-xs); font-family: inherit;
  color: var(--text);
  cursor: pointer;
  transition: all var(--transition);
}
.lang-btn:hover { border-color: var(--border-strong); background: var(--bg-active); }
.lang-pair { font-weight: 500; color: var(--text); }
.lang-indicator { cursor: pointer; padding: 2px 0; font-size: var(--fs-xs); }
.lang-indicator:hover .lang-pair { color: var(--brand); }
.foot-tools { display: flex; gap: 2px; }

.race-medal { font-size: 11px; line-height: 1; }
.race-engine-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.race-cycle {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: var(--fs-xs); font-family: inherit;
  color: var(--text);
  cursor: pointer;
  transition: all var(--transition);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.race-cycle:hover { border-color: var(--border-strong); background: var(--bg-active); }
.race-count {
  font-size: 10px; color: var(--text-dim);
  margin-left: 2px;
}

.icon-btn.active { color: var(--brand); transform: rotate(-45deg); }
.icon-btn.copied { color: var(--brand); transform: scale(1.2); transition: all 0.15s ease; }
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
</style>

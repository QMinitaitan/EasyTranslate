<template>
  <div class="popup-standalone" :class="{ 'is-window': isWindow }" ref="rootEl">
    <div class="popup pop-in" :style="{ fontSize: 'calc(var(--fs-base) * ' + fontScale + ')' }">
      <header class="popup-head" @mousedown="startDrag">
        <div class="popup-head-controls">
          <EngineSelect
            :engines="engines"
            v-model="current"
            v-model:race-mode="raceMode"
            @change="onEngineChange"
          />
          <div class="popup-actions">
            <button class="icon-btn" :class="{ active: pinned }" title="固定窗口" @click="togglePin">
              <Pin :size="13" :stroke-width="1.75" :fill="pinned ? 'currentColor' : 'none'" />
            </button>
            <button class="icon-btn" title="关闭" @click="close"><X :size="13" :stroke-width="1.75" /></button>
          </div>
        </div>
      </header>

      <section class="popup-body">
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
            <div class="box-label">原文</div>
            <div class="src-text">{{ src }}</div>
          </div>
          <div class="dst-box">
            <div class="box-label">译文 · {{ raceMode ? engineDisplayName(raceActive.engine) : engineLabel }}</div>
            <div class="dst-text">{{ raceMode ? raceActive.text : dst }}</div>
          </div>

          <!-- race switcher -->
          <template v-if="raceMode && raceOk.length > 1">
            <div class="race-switcher">
              <button
                v-for="(r, i) in raceOk"
                :key="r.engine"
                class="race-switch-btn"
                :class="{ active: i === raceActiveIdx }"
                @click="raceActiveIdx = i"
              >
                <span class="race-engine-dot" :style="{ background: engineColor(r.engine) }"></span>
                {{ r.engine }}
                <span class="race-switch-ms">{{ r.ms }}ms</span>
              </button>
            </div>
          </template>
        </template>
      </section>

      <footer class="popup-foot" @mousedown="startDrag">
        <div class="foot-main">
          <button class="lang-btn" @click="toggleDirection" title="切换翻译方向">
            <ArrowLeftRight :size="12" :stroke-width="1.75" />
            <span class="lang-pair">{{ langLabel }}</span>
          </button>
          <button class="lang-btn" @click="cycleTheme()" title="切换主题">
            <Sun v-if="themeMode === 'light'" :size="12" :stroke-width="1.75" />
            <Moon v-else-if="themeMode === 'dark'" :size="12" :stroke-width="1.75" />
            <Monitor v-else :size="12" :stroke-width="1.75" />
          </button>
          <template v-if="raceMode && raceOk.length">
            <span class="race-top3">
              <span v-for="(r, i) in raceOk.slice(0, 3)" :key="r.engine" class="race-top3-item">
                <span class="rank">{{ ['🥇','🥈','🥉'][i] }}</span>
                <span class="race-engine-dot" :style="{ background: engineColor(r.engine) }"></span>
                {{ r.engine }} {{ r.ms }}ms
              </span>
            </span>
          </template>
          <span v-else-if="latency" class="latency">· {{ latency }}ms</span>
        </div>
        <div class="foot-tools no-drag">
          <button class="icon-btn" :class="{ copied: copied }" title="复制译文" @click="copyDst"><Copy :size="13" :stroke-width="1.75" /></button>
          <button class="icon-btn" ref="moreBtn" title="更多" @click="moreOpen = !moreOpen">
            <MoreHorizontal :size="13" :stroke-width="1.75" />
          </button>
        </div>

        <transition name="fade">
          <div v-if="moreOpen" ref="morePop" class="more-pop">
            <button class="more-item" @click="chatOpen = !chatOpen">
              <MessageSquare :size="13" :stroke-width="1.75" :class="{ active: chatOpen }" />
              {{ chatOpen ? '关闭追问' : '追问 / 改写' }}
            </button>
            <button class="more-item" @click="openSettings">
              <Settings :size="13" :stroke-width="1.75" />
              打开设置
            </button>
          </div>
        </transition>
      </footer>

      <transition name="expand">
        <div v-if="chatOpen" class="chat-bar">
          <input class="chat-input" placeholder="追加提问,例如:换成更口语化的表达" v-model="chatText" @keyup.enter="sendChat" />
          <button class="icon-btn" title="发送" @click="sendChat"><CornerDownLeft :size="13" :stroke-width="1.75" /></button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Pin, X, Copy, AlertCircle, MoreHorizontal, MessageSquare, CornerDownLeft, MousePointerClick, ArrowLeftRight, Sun, Moon, Monitor, Settings } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { setBrand } from '../composables/useBrand'
import { useTheme } from '../composables/useTheme'
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

const current = ref('')
const raceMode = ref(true)
const pinned = ref(false)
const moreOpen = ref(false)
const moreBtn = ref(null)
const morePop = ref(null)

function onMouseDown(e) {
  if (morePop.value && !morePop.value.contains(e.target) && moreBtn.value && !moreBtn.value.contains(e.target)) {
    moreOpen.value = false
  }
}
const chatOpen = ref(false)
const chatText = ref('')
const copied = ref(false)

const targetLangMap = ['中文(简体)', 'English']
const targetIdx = ref(0)
const targetLang = computed(() => targetLangMap[targetIdx.value])
const langLabel = computed(() => targetIdx.value === 0 ? '英 → 中' : '中 → 英')
function toggleDirection() {
  targetIdx.value = targetIdx.value === 0 ? 1 : 0
  if (src.value) doTranslate(src.value)
}

const state = ref('idle')
const src = ref('')
const dst = ref('')
const errorMsg = ref('')
const latency = ref(0)
const engineLabel = ref('')
const raceResults = ref([])
const raceActiveIdx = ref(0)
const raceOk = computed(() => raceResults.value.filter(r => !r.error))
const raceActive = computed(() => raceOk.value[raceActiveIdx.value] || { text: '', engine: '', ms: 0 })

const fontScale = ref(1.0)
const ctrlHeld = ref(false)

function onKeyDown(e) {
  if (e.key === 'Control') ctrlHeld.value = true
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '=' || e.key === '+') adjustFont(0.05)
    if (e.key === '-') adjustFont(-0.05)
  }
}
function onKeyUp(e) {
  if (e.key === 'Control') ctrlHeld.value = false
}
function onWheel(e) {
  if (!ctrlHeld.value && !e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  e.stopPropagation()
  adjustFont(e.deltaY < 0 ? 0.05 : -0.05)
}
function adjustFont(delta) {
  fontScale.value = Math.min(1.8, Math.max(0.6, fontScale.value + delta))
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

function onEngineChange(payload) {
  if (payload && payload.race) { raceMode.value = true; return }
  if (payload && payload.color) {
    setBrand(payload.color)
    engineLabel.value = payload.name
    raceMode.value = false
  }
}

async function doTranslate(text) {
  if (!text) { state.value = 'empty'; return }
  src.value = text
  dst.value = ''
  raceResults.value = []
  raceActiveIdx.value = 0
  state.value = 'loading'
  if (raceMode.value) {
    const r = await window.api.raceTranslate(text, targetLang.value)
    if (r.error) { state.value = 'error'; errorMsg.value = r.error; return }
    raceResults.value = r.results
    const best = r.best
    if (best) {
      dst.value = best.text
      latency.value = best.ms
      engineLabel.value = engineDisplayName(best.engine)
    }
    state.value = 'idle'
  } else {
    const r = await window.api.translate(text, targetLang.value)
    if (r.error) { state.value = 'error'; errorMsg.value = r.error; return }
    dst.value = r.text
    latency.value = r.ms
    engineLabel.value = engineDisplayName(r.engine) || engineLabel.value
    state.value = 'idle'
  }
}

function retry() { if (src.value) doTranslate(src.value) }
function close() { window.api.closePopup?.() }
function openSettings() {
  moreOpen.value = false
  window.api.openSettings?.()
}
function togglePin() {
  pinned.value = !pinned.value
  window.api.pinPopup?.(pinned.value)
}
function copyDst() {
  const text = raceMode.value ? raceActive.value.text : dst.value
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 600)
  })
}
async function sendChat() {
  if (!chatText.value.trim() || !dst.value) return
  const ask = chatText.value
  chatText.value = ''
  const combined = `${src.value}\n\n[追加要求] ${ask}`
  src.value = combined
  state.value = 'loading'
  const r = await window.api.translate(combined, targetLang.value)
  if (r.error) { state.value = 'error'; errorMsg.value = r.error; return }
  dst.value = r.text
  latency.value = r.ms
  state.value = 'idle'
}

onMounted(async () => {
  await loadEngines()
  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mousedown', onMouseDown)
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
  document.removeEventListener('mousedown', onMouseDown)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
  offTrigger?.()
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
.popup-actions { display: flex; gap: 2px; }
.popup-body {
  padding: var(--space-4);
  flex: 1;
  overflow-y: auto;
}
.box-label { font-size: var(--fs-xs); color: var(--text-dim); margin-bottom: var(--space-1); }
.src-box { padding-bottom: var(--space-3); }
.src-text { font-size: var(--fs-sm); color: var(--text-dim); }
.src-text.live { color: var(--text); }
.dst-box { padding-top: var(--space-3); }
.dst-text { font-size: var(--fs-md); color: var(--text-strong); line-height: 1.5; white-space: pre-wrap; }

.popup-foot {
  position: relative;
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--fs-xs); color: var(--text-dim);
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
}
.foot-main { display: flex; align-items: center; gap: var(--space-2); flex: 1; }
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
.foot-tools { display: flex; gap: 2px; }

/* race switcher */
.race-switcher {
  display: flex; gap: var(--space-1);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}
.race-switch-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  font-size: var(--fs-xs); font-family: inherit;
  color: var(--text-dim);
  cursor: pointer;
  transition: all var(--transition);
}
.race-switch-btn:hover { border-color: var(--border-strong); color: var(--text); }
.race-switch-btn.active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}
.race-switch-ms {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.race-engine-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.race-top3 {
  display: flex; align-items: center; gap: var(--space-2);
  font-variant-numeric: tabular-nums;
}
.race-top3-item {
  display: inline-flex; align-items: center; gap: 3px;
  white-space: nowrap;
}
.rank { font-size: 10px; }

.icon-btn.active { color: var(--brand); transform: rotate(-45deg); }
.icon-btn.copied { color: var(--brand); transform: scale(1.2); transition: all 0.15s ease; }
.icon-btn:not(.copied) { transition: all 0.3s ease; }

.more-pop {
  position: absolute;
  bottom: calc(100% + 4px);
  right: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popup);
  padding: var(--space-1);
  display: flex; flex-direction: column;
  min-width: 140px;
  z-index: 10;
}
.more-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: none; background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.more-item:hover { background: var(--bg-hover); }
.more-item .active { color: var(--brand); }

.chat-bar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--bg-card);
}
.chat-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--fs-sm); font-family: inherit;
  color: var(--text); outline: none;
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

.fade-enter-active, .fade-leave-active { transition: opacity 0.12s, transform 0.12s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(4px); }
.expand-enter-active, .expand-leave-active { transition: max-height 0.18s ease, opacity 0.15s; overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; }
.expand-enter-to, .expand-leave-from { max-height: 80px; opacity: 1; }
</style>
<template>
  <div class="page">
    <h2 class="page-title">快捷键</h2>
    <p class="page-sub">配置全局快捷键，修改后立即生效</p>

    <div class="setting-section">
      <div
        v-for="s in shortcuts"
        :key="s.id"
        class="sc-row"
        :class="{ recording: recording === s.id }"
      >
        <div class="sc-info">
          <div class="sc-name">{{ s.name }}</div>
          <div class="sc-desc">{{ s.desc }}</div>
        </div>
        <div class="sc-binding">
          <template v-if="recording === s.id">
            <span class="rec-badge">
              <span class="rec-dot"></span>
              按下快捷键
              <span class="rec-sep">·</span>
              <span class="rec-esc" @click="cancelRecord">ESC 取消</span>
            </span>
          </template>
          <template v-else>
            <div class="keys">
              <span v-for="(k, i) in s.keys" :key="i" class="key">{{ k }}</span>
              <span v-if="!s.keys.length" class="empty-key">未设置</span>
            </div>
            <button class="btn btn-sm" @click="startRecord(s.id)">{{ s.keys.length ? '更改' : '设置' }}</button>
            <button v-if="s.keys.length" class="icon-btn" title="清除" @click="clearShortcut(s)">
              <X :size="13" :stroke-width="1.75" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

const recording = ref(null)
let recordingTarget = null

const DEFAULT_MAP = {
  translate: ['Alt', 'Q'],
  input: ['Alt', 'D'],
  show: ['Alt', 'E']
}

const shortcuts = reactive([
  { id: 'translate', name: '划词翻译', desc: '选中文本后弹悬浮窗显示译文', keys: [] },
  { id: 'input', name: '输入翻译', desc: '打开主窗口并聚焦输入框', keys: [] },
  { id: 'show', name: '显示/隐藏主窗口', desc: '快速唤出或隐藏程序', keys: [] }
])

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

function normalizeKey(e) {
  if (MODIFIER_KEYS.has(e.key)) return null
  if (e.code === 'Space') return 'Space'
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

function onKeydown(e) {
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

function startRecord(id) {
  recording.value = id
  recordingTarget = id
}
function cancelRecord() {
  recording.value = null
  recordingTarget = null
}

function keysToAccel(keys) { return keys.join('+') }

async function loadShortcuts() {
  try {
    const map = await window.api.loadShortcuts()
    for (const s of shortcuts) {
      s.keys = map[s.id] ? map[s.id].split('+') : []
    }
  } catch (_) {
    for (const s of shortcuts) {
      s.keys = [...(DEFAULT_MAP[s.id] || [])]
    }
  }
}

async function saveShortcuts() {
  const map = {}
  for (const s of shortcuts) {
    map[s.id] = keysToAccel(s.keys)
  }
  try { await window.api.saveShortcuts(map) } catch (_) {}
}

function clearShortcut(s) {
  s.keys = []
  autoSave()
}

function autoSave() {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(saveShortcuts, 100)
}
let autoSaveTimer = null

onMounted(() => {
  loadShortcuts()
  window.addEventListener('keydown', onKeydown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<style scoped>
.sc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  gap: var(--space-4);
  min-height: 44px;
  transition: background var(--transition);
}
.sc-row:first-of-type { border-top: 1px solid var(--border); }
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

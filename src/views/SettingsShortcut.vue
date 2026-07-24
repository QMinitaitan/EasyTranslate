<template>
  <div class="page">
    <h2 class="page-title">快捷键</h2>
    <p class="page-sub">在任意应用中选中文本即触发。点击「设置」后按下组合键,ESC 取消</p>

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
            <span class="recording">
              <Keyboard :size="13" :stroke-width="1.75" />
              按下组合键 · ESC 取消
            </span>
            <button class="btn btn-sm" @click="cancelRecord">取消</button>
          </template>
          <template v-else>
            <div class="keys">
              <span v-for="(k, i) in s.keys" :key="i" class="key">{{ k }}</span>
              <span v-if="!s.keys.length" class="empty-key">未设置</span>
            </div>
            <button class="btn btn-sm" @click="startRecord(s.id)">{{ s.keys.length ? '更改' : '设置' }}</button>
            <button v-if="s.keys.length" class="icon-btn" title="清除" @click="s.keys = []">
              <X :size="13" :stroke-width="1.75" />
            </button>
          </template>
        </div>
      </div>
    </div>

    <div class="tip-card" style="margin-top: var(--space-5);">
      <div class="tip-title">提示</div>
      <ul>
        <li>macOS 下 <code>⌘</code> 对应 <code>Super</code> 键</li>
        <li>支持的功能键:<code>Ctrl</code> · <code>Shift</code> · <code>Alt</code> · <code>Super</code></li>
        <li>与系统冲突的快捷键将无法注册,请更换组合</li>
      </ul>
    </div>

    <div class="actions">
      <button class="btn btn-primary">保存</button>
      <button class="btn">恢复默认</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { Keyboard, X } from 'lucide-vue-next'

const recording = ref(null)
let recordingTarget = null

const shortcuts = reactive([
  { id: 'translate', name: '划词翻译', desc: '选中文本后弹悬浮窗显示译文', keys: ['Alt', 'Q'] },
  { id: 'input', name: '输入翻译', desc: '打开主窗口并聚焦输入框', keys: ['Alt', 'D'] },
  { id: 'ocr', name: '截图 OCR 翻译', desc: '截屏识别文字后翻译(后续支持)', keys: [] },
  { id: 'show', name: '显示/隐藏主窗口', desc: '快速唤出或隐藏程序', keys: ['Alt', 'E'] }
])

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])
const DISPLAY = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super' }

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
  if (mods.length === 0) return
  if (!main) return
  // 单独按修饰键不算
  const keys = [...mods, main]
  const target = shortcuts.find(s => s.id === recordingTarget)
  if (target) {
    target.keys = keys
    recording.value = null
    recordingTarget = null
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

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
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
.sc-row:first-child { border-top: 1px solid var(--border); }
.sc-row:last-child { border-bottom: none; }
.sc-row.recording { background: var(--brand-soft); }
.sc-name { font-size: var(--fs-base); font-weight: 500; color: var(--text-strong); }
.sc-desc { font-size: var(--fs-xs); color: var(--text-dim); margin-top: 1px; }
.sc-binding {
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--space-2);
  flex-shrink: 0;
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
.recording {
  display: inline-flex; align-items: center; gap: var(--space-1);
  justify-content: flex-end;
  font-size: var(--fs-sm); color: var(--brand);
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse { 50% { opacity: 0.5; } }
</style>

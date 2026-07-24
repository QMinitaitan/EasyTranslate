<template>
  <transition name="fade">
    <div v-if="open" class="cmd-mask" @click.self="close">
      <div class="cmd-panel pop-in">
        <div class="cmd-input-wrap">
          <Search :size="14" :stroke-width="1.75" class="cmd-ico" />
          <input
            ref="inputEl"
            class="cmd-input"
            placeholder="输入命令、跳转页面或搜索历史..."
            v-model="q"
            @keydown.esc="close"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter="runSelected"
          />
        </div>
        <div class="cmd-list">
          <div
            v-for="(item, i) in filtered"
            :key="item.key"
            class="cmd-item"
            :class="{ active: i === cursor }"
            @mouseenter="cursor = i"
            @click="run(item)"
          >
            <component :is="item.icon" :size="14" :stroke-width="1.75" />
            <span class="cmd-label">{{ item.label }}</span>
            <span class="cmd-hint">{{ item.hint }}</span>
          </div>
          <div v-if="!filtered.length" class="cmd-empty">无匹配项</div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Home, SquareArrowOutUpRight, Settings2, Plug, Keyboard, Palette, Info, Sun, Moon, Monitor, Zap } from 'lucide-vue-next'
import { useTheme } from '../composables/useTheme'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open'])

const router = useRouter()
const { mode, setMode } = useTheme()
const q = ref('')
const cursor = ref(0)
const inputEl = ref(null)

const commands = computed(() => [
  { key: 'go-home', label: '前往主页', hint: '⌘', icon: Home, run: () => router.push('/') },
  { key: 'go-popup', label: '悬浮窗预览', hint: '', icon: SquareArrowOutUpRight, run: () => router.push('/popup') },
  { key: 'go-general', label: '设置 · 通用', hint: '', icon: Settings2, run: () => router.push('/settings/general') },
  { key: 'go-api', label: '设置 · 翻译接口', hint: '', icon: Plug, run: () => router.push('/settings/api') },
  { key: 'go-shortcut', label: '设置 · 快捷键', hint: '', icon: Keyboard, run: () => router.push('/settings/shortcut') },
  { key: 'go-appearance', label: '设置 · 外观', hint: '', icon: Palette, run: () => router.push('/settings/appearance') },
  { key: 'go-about', label: '设置 · 关于', hint: '', icon: Info, run: () => router.push('/settings/about') },
  { key: 'theme-system', label: '主题 · 跟随系统', hint: '', icon: Monitor, run: () => setMode('system') },
  { key: 'theme-light', label: '主题 · 浅色', hint: '', icon: Sun, run: () => setMode('light') },
  { key: 'theme-dark', label: '主题 · 深色', hint: '', icon: Moon, run: () => setMode('dark') }
])

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return commands.value
  return commands.value.filter(c => c.label.toLowerCase().includes(k))
})

watch(() => props.open, v => {
  if (v) {
    q.value = ''; cursor.value = 0
    nextTick(() => inputEl.value?.focus())
  }
})
watch(filtered, () => cursor.value = 0)

function move(d) {
  const n = filtered.value.length
  if (!n) return
  cursor.value = (cursor.value + d + n) % n
}
function run(item) { item.run(); close() }
function runSelected() {
  const item = filtered.value[cursor.value]
  if (item) run(item)
}
function close() { emit('update:open', false) }

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    emit('update:open', !props.open)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.cmd-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.25);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  z-index: 100;
}
.cmd-panel {
  width: 560px;
  max-width: 92vw;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
  overflow: hidden;
}
.cmd-input-wrap {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.cmd-ico { color: var(--text-dim); }
.cmd-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--fs-md); font-family: inherit;
  color: var(--text); outline: none;
}
.cmd-list { max-height: 340px; overflow-y: auto; padding: var(--space-1); }
.cmd-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  color: var(--text);
  cursor: pointer;
}
.cmd-item.active {
  background: var(--brand-soft);
  color: var(--brand);
}
.cmd-label { flex: 1; }
.cmd-hint { font-size: var(--fs-xs); color: var(--text-dim); }
.cmd-empty {
  padding: var(--space-5); text-align: center;
  color: var(--text-dim); font-size: var(--fs-sm);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

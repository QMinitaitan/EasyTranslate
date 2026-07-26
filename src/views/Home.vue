<template>
  <div class="page">
    <h2 class="page-title">{{ text.title }}</h2>
    <p class="page-sub">{{ text.subtitle }}</p>

    <div class="toolbar">
      <div class="search-wrap">
        <Search class="search-ico" :size="14" :stroke-width="1.75" />
        <input class="search-input" :placeholder="text.search" v-model="keyword" />
      </div>
      <BaseSelect v-model="engineFilter" :options="engineOptions" />
      <button class="btn btn-sm btn-ghost" @click="clearAll"><Trash2 :size="13" :stroke-width="1.75" />{{ text.clear }}</button>
    </div>

    <div class="history">
      <template v-for="g in grouped" :key="g.date">
        <div class="date-header">{{ g.label }}</div>
        <div v-for="h in g.items" :key="h.id" class="history-item card">
          <div class="brand-bar" :style="{ background: h.color }"></div>
          <div class="h-body">
            <div class="h-meta">
              <span class="h-engine" :style="{ color: h.color }">● {{ h.engine }}</span>
              <span class="h-lang">{{ langLabel(h.lang) }}</span>
              <span class="h-time">{{ formatTime(h.ts) }}</span>
              <span class="h-actions">
                <button
                  class="icon-btn"
                  :class="{ favorite: h.favorite }"
                  :title="h.favorite ? text.unfavorite : text.favorite"
                  @click="toggleFavorite(h)"
                >
                  <Star :size="13" :stroke-width="1.75" :fill="h.favorite ? 'currentColor' : 'none'" />
                </button>
                <button class="icon-btn" :title="text.copy" @click="copyDst(h)"><Copy :size="13" :stroke-width="1.75" /></button>
                <button class="icon-btn" :title="text.delete" @click="removeItem(h)"><Trash2 :size="13" :stroke-width="1.75" /></button>
              </span>
            </div>
            <div class="h-src">{{ h.src }}</div>
            <div class="h-dst">{{ h.dst }}</div>
          </div>
        </div>
      </template>
      <div v-if="!grouped.length" class="empty">
        <div class="empty-ico"><Inbox :size="42" :stroke-width="1.5" /></div>
        <div class="empty-title">{{ text.empty }}</div>
        <div class="empty-sub">{{ text.emptyDesc }}</div>
        <div class="empty-cta">
          <router-link to="/settings/api" class="btn btn-primary btn-sm">{{ text.configureApi }}</router-link>
          <router-link to="/settings/shortcut" class="btn btn-sm">{{ text.configureShortcuts }}</router-link>
        </div>
      </div>
    </div>
  </div>
  <ConfirmDialog
    :open="showConfirm"
    :title="text.clearTitle"
    :message="text.clearMessage"
    @confirm="doClear"
    @cancel="showConfirm = false"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Search, Copy, Trash2, Inbox, Star } from 'lucide-vue-next'
import BaseSelect from '../components/BaseSelect.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useLocale } from '../composables/useLocale'

const { isEnglish } = useLocale()
const text = computed(() => isEnglish.value ? {
  title: 'History',
  subtitle: 'Recent selection and input translations',
  search: 'Search history…',
  clear: 'Clear',
  favorite: 'Favorite',
  unfavorite: 'Remove from favorites',
  copy: 'Copy translation',
  delete: 'Delete',
  empty: 'No history yet',
  emptyDesc: 'Select text in any app and press your translation shortcut',
  configureApi: 'Configure APIs',
  configureShortcuts: 'Configure Shortcuts',
  clearTitle: 'Clear History',
  clearMessage: 'Clear all translation history?',
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month'
} : {
  title: '历史记录',
  subtitle: '最近的划词与输入翻译历史',
  search: '搜索历史…',
  clear: '清空',
  favorite: '收藏',
  unfavorite: '取消收藏',
  copy: '复制译文',
  delete: '删除',
  empty: '暂无记录',
  emptyDesc: '在任意应用中选中文字，按快捷键即可翻译',
  configureApi: '配置翻译接口',
  configureShortcuts: '设置快捷键',
  clearTitle: '清空记录',
  clearMessage: '确定清空所有翻译记录？',
  today: '今天',
  yesterday: '昨天',
  thisWeek: '本周',
  thisMonth: '本月'
})
const engineOptions = computed(() => [
  { label: isEnglish.value ? 'All Engines' : '全部引擎', value: '' },
  { label: isEnglish.value ? 'Bing Translator' : 'Bing 微软翻译', value: 'Bing 微软翻译' },
  'DeepSeek',
  { label: isEnglish.value ? 'Youdao Translate' : '有道翻译', value: '有道翻译' },
  { label: isEnglish.value ? 'Tencent TMT' : '腾讯交互翻译 TMT', value: '腾讯交互翻译 TMT' },
  'OpenAI',
  'DeepL',
  { label: isEnglish.value ? 'Caiyun Translate' : '彩云小译', value: '彩云小译' },
  { label: isEnglish.value ? 'Baidu Translate' : '百度翻译', value: '百度翻译' },
  { label: isEnglish.value ? 'Google Translate' : 'Google 翻译', value: 'Google 翻译' }
])

const keyword = ref('')
const engineFilter = ref('')
const list = ref([])
const showConfirm = ref(false)
let unsubHistory = null

function langLabel(lang) {
  if (lang === '中文(简体)') return isEnglish.value ? 'EN → ZH' : '英 → 中'
  if (lang === 'English') return isEnglish.value ? 'ZH → EN' : '中 → 英'
  return lang
}
function formatTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getDateStr(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateLabel(dateStr) {
  const today = new Date()
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = ymd(today)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = ymd(yesterday)

  if (dateStr === todayStr) return text.value.today
  if (dateStr === yesterdayStr) return text.value.yesterday

  const d = new Date(dateStr)
  const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24))
  if (diffDays <= 7) return text.value.thisWeek
  if (diffDays <= 30) return text.value.thisMonth
  return dateStr
}

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return list.value.filter(h =>
    (!k || h.src.toLowerCase().includes(k) || h.dst.toLowerCase().includes(k)) &&
    (!engineFilter.value || h.engine === engineFilter.value)
  )
})

const grouped = computed(() => {
  const groups = {}
  for (const h of filtered.value) {
    const label = dateLabel(getDateStr(h.ts))
    if (!groups[label]) groups[label] = { label, items: [] }
    groups[label].items.push(h)
  }
  const order = [text.value.today, text.value.yesterday, text.value.thisWeek, text.value.thisMonth]
  return Object.entries(groups)
    .sort(([a], [b]) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    .map(([, g]) => g)
})

function copyDst(h) {
  navigator.clipboard.writeText(h.dst)
}

async function toggleFavorite(h) {
  try {
    const updated = await window.api.setFavorite(h.id, !h.favorite)
    if (updated) h.favorite = updated.favorite
  } catch (_) {}
}

async function removeItem(h) {
  try {
    await window.api.deleteHistory(h.id)
    const idx = list.value.findIndex(i => i.id === h.id)
    if (idx !== -1) list.value.splice(idx, 1)
  } catch (_) {}
}

function clearAll() {
  if (list.value.length === 0) return
  showConfirm.value = true
}

async function doClear() {
  showConfirm.value = false
  try {
    await window.api.clearHistory()
    list.value.splice(0)
  } catch (_) {}
}

async function load() {
  try {
    list.value = await window.api.loadHistory()
  } catch (_) { list.value = [] }
}

onMounted(() => {
  load()
  unsubHistory = window.api.onHistoryUpdate(() => load())
})

onUnmounted(() => {
  if (unsubHistory) unsubHistory()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-4);
}
.search-wrap {
  position: relative;
  flex: 1;
}
.search-ico {
  position: absolute;
  left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
}
.search-input {
  width: 100%;
  padding: var(--space-2) var(--space-3) var(--space-2) 30px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  font-size: var(--fs-base);
  font-family: inherit;
  color: var(--text);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.search-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.history { display: flex; flex-direction: column; gap: var(--space-1); }
.date-header {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-dim);
  padding: var(--space-3) var(--space-1) var(--space-1);
  letter-spacing: 0.3px;
}
.history-item {
  display: flex;
  padding: 0;
  overflow: hidden;
  transition: box-shadow var(--transition), transform var(--transition);
}
.history-item:hover {
  box-shadow: var(--shadow-hover, 0 2px 8px rgba(0,0,0,0.06));
}
.brand-bar {
  width: 3px;
  flex-shrink: 0;
  border-radius: 2px 0 0 2px;
}
.h-body {
  flex: 1;
  padding: var(--space-3) var(--space-4);
}
.h-meta {
  display: flex; align-items: center; gap: var(--space-3);
  font-size: var(--fs-xs); color: var(--text-dim);
  margin-bottom: var(--space-2);
}
.h-engine { font-weight: 600; }
.h-lang {
  padding: 1px var(--space-2);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: 10px;
}
.h-time { opacity: 0.6; }
.h-actions {
  margin-left: auto;
  display: flex; gap: 2px;
  opacity: 0;
  transition: opacity var(--transition);
}
.history-item:hover .h-actions { opacity: 1; }
.icon-btn.favorite { color: #d97706; }
.h-src {
  font-size: var(--fs-sm);
  color: var(--text-dim);
  margin-bottom: var(--space-1);
  line-height: 1.5;
}
.h-dst {
  font-size: var(--fs-md);
  color: var(--text-strong);
  line-height: 1.6;
  font-weight: 450;
}
.empty {
  text-align: center;
  color: var(--text-dim);
  padding: 60px 0;
}
.empty-ico {
  color: var(--text-dim);
  opacity: 0.4;
  margin-bottom: var(--space-4);
  display: flex; justify-content: center;
}
.empty-title { font-size: var(--fs-md); color: var(--text); margin-bottom: var(--space-1); }
.empty-sub { font-size: var(--fs-sm); margin-bottom: var(--space-5); }
.empty-cta { display: flex; gap: var(--space-2); justify-content: center; }
</style>

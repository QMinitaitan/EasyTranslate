<template>
  <div class="page">
    <h2 class="page-title">翻译记录</h2>
    <p class="page-sub">最近的划词与输入翻译历史</p>

    <div class="toolbar">
      <div class="search-wrap">
        <Search class="search-ico" :size="14" :stroke-width="1.75" />
        <input class="search-input" placeholder="搜索历史..." v-model="keyword" />
      </div>
      <select class="select" v-model="engineFilter" style="width: 140px;">
        <option value="">全部引擎</option>
        <option>Bing</option>
        <option>DeepSeek</option>
        <option>有道</option>
        <option>腾讯</option>
        <option>OpenAI</option>
        <option>DeepL</option>
        <option>彩云小译</option>
        <option>百度翻译</option>
      </select>
      <button class="btn btn-sm btn-ghost"><Trash2 :size="13" :stroke-width="1.75" />清空</button>
    </div>

    <div class="history">
      <div v-for="h in filtered" :key="h.id" class="history-item card">
        <div class="brand-bar" :style="{ background: h.color }"></div>
        <div class="h-body">
          <div class="h-meta">
            <span class="h-engine" :style="{ color: h.color }">● {{ h.engine }}</span>
            <span class="h-lang">{{ h.lang }}</span>
            <span class="h-time">{{ h.time }}</span>
          </div>
          <div class="h-src">{{ h.src }}</div>
          <div class="h-dst">{{ h.dst }}</div>
          <div class="h-actions">
            <button class="icon-btn" title="复制译文"><Copy :size="13" :stroke-width="1.75" /></button>
            <button class="icon-btn" title="再次翻译"><RotateCw :size="13" :stroke-width="1.75" /></button>
            <button class="icon-btn" title="删除"><Trash2 :size="13" :stroke-width="1.75" /></button>
          </div>
        </div>
      </div>
      <div v-if="!filtered.length" class="empty">
        <div class="empty-ico"><Inbox :size="42" :stroke-width="1.5" /></div>
        <div class="empty-title">暂无记录</div>
        <div class="empty-sub">在任意应用中选中文字,按快捷键即可翻译</div>
        <div class="empty-cta">
          <router-link to="/settings/api" class="btn btn-primary btn-sm">配置翻译接口</router-link>
          <router-link to="/settings/shortcut" class="btn btn-sm">设置快捷键</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Search, Copy, RotateCw, Trash2, Inbox } from 'lucide-vue-next'

const keyword = ref('')
const engineFilter = ref('')

const list = ref([
  { id: 1, engine: 'Bing', color: '#0078d4', lang: 'EN → 中文', time: '14:32', src: 'serendipity', dst: '意外发现美好事物的能力' },
  { id: 2, engine: 'DeepSeek', color: '#4d6bfe', lang: 'EN → 中文', time: '14:28', src: 'The quick brown fox jumps over the lazy dog.', dst: '敏捷的棕色狐狸跳过了懒狗。' },
  { id: 3, engine: '有道', color: '#e8380f', lang: 'EN → 中文', time: '13:05', src: 'edge case', dst: '边界情况' },
  { id: 4, engine: 'OpenAI', color: '#10b981', lang: '中文 → EN', time: '11:41', src: '已所不欲,勿施于人', dst: 'Do not do to others what you do not want done to yourself.' }
])

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return list.value.filter(h =>
    (!k || h.src.toLowerCase().includes(k) || h.dst.toLowerCase().includes(k)) &&
    (!engineFilter.value || h.engine === engineFilter.value)
  )
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
.history { display: flex; flex-direction: column; gap: var(--space-2); }
.history-item {
  display: flex;
  padding: 0;
  overflow: hidden;
}
.brand-bar {
  width: 3px;
  flex-shrink: 0;
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
.h-engine { font-weight: 500; }
.h-lang {
  padding: 1px var(--space-2);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: 10px;
}
.h-time { margin-left: auto; }
.h-src { font-size: var(--fs-sm); color: var(--text-dim); margin-bottom: var(--space-1); }
.h-dst { font-size: var(--fs-md); color: var(--text-strong); line-height: 1.5; }
.h-actions {
  display: flex; gap: 2px;
  margin-top: var(--space-3);
  opacity: 0.4;
  transition: opacity var(--transition);
}
.history-item:hover .h-actions { opacity: 1; }
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

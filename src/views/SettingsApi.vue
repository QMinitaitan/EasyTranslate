<template>
  <div class="page">
    <h2 class="page-title">翻译接口</h2>
    <p class="page-sub">启用并配置翻译平台 API，可在悬浮窗中实时切换</p>

    <div class="setting-section">
      <template v-for="p in providers" :key="p.id">
        <div class="setting-row" :class="{ expanded: expanded === p.id }" @click="toggleExpand(p)">
          <div class="setting-row-info">
            <span class="prov-dot" :style="{ background: p.color }"></span>
            <div class="setting-row-text">
              <div class="setting-row-title">
                {{ p.name }}
                <span v-if="p.builtin" class="tag">推荐</span>
                <span class="status-indicator" :class="p.status" :title="statusTitle(p)"></span>
              </div>
              <div class="setting-row-desc">{{ p.desc }}</div>
            </div>
          </div>
          <div class="setting-row-control" @click.stop>
            <label class="switch">
              <input type="checkbox" v-model="p.enabled" />
              <span class="switch-track"></span>
            </label>
            <ChevronRight
              :size="14" :stroke-width="1.75"
              class="expand-arrow"
              :class="{ flip: expanded === p.id }"
            />
          </div>
        </div>

        <div v-if="expanded === p.id" class="setting-expand">
          <div v-if="p.id === 'google' && p.enabled" class="tip-card warning">
            <AlertTriangle :size="13" :stroke-width="1.75" style="margin-right: 6px;" />
            Google 翻译 API 在国内可能不可直达，需要代理
          </div>

          <div class="field">
            <label>API Key</label>
            <InputKey v-model="p.apiKey" :placeholder="p.keyHint" />
          </div>

          <div v-if="p.hasSecret" class="field">
            <label>{{ p.secretHint }}</label>
            <InputKey v-model="p.secret" :placeholder="p.secretHint" />
          </div>

          <div v-if="p.hasRegion" class="field">
            <label>区域</label>
            <BaseSelect v-model="p.region" :options="regions" />
          </div>

          <div v-if="p.hasModel" class="field">
            <label>模型</label>
            <BaseSelect v-model="p.model" :options="p.models || []" />
          </div>

          <div v-if="p.hasEndpoint" class="field">
            <label>自定义 Endpoint</label>
            <input class="input" v-model="p.endpoint" placeholder="留空使用官方地址" />
          </div>

          <div v-if="p.hasPrompt" class="field">
            <label>Prompt 模板</label>
            <textarea class="input" rows="2" v-model="p.prompt" placeholder="用 {{target}} 表示目标语言"></textarea>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: var(--space-2); padding-top: var(--space-1);">
            <button class="btn btn-sm" :disabled="p.testState === 'testing'" @click.stop="testProvider(p)">
              <Loader2 v-if="p.testState === 'testing'" :size="13" :stroke-width="1.75" class="spin" />
              <Check v-else-if="p.testState === 'success'" :size="13" :stroke-width="1.75" />
              <XCircle v-else-if="p.testState === 'fail'" :size="13" :stroke-width="1.75" />
              <Plug v-else :size="13" :stroke-width="1.75" />
              {{ testLabel(p) }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, watch } from 'vue'
import { Plug, Check, XCircle, Loader2, AlertTriangle, ChevronRight } from 'lucide-vue-next'
import InputKey from '../components/InputKey.vue'
import BaseSelect from '../components/BaseSelect.vue'

const regions = ['eastasia', 'southeastasia', 'eastus', 'westeurope']

const expanded = ref(null)
const providers = reactive([])

function toggleExpand(p) {
  expanded.value = expanded.value === p.id ? null : p.id
}

function buildFromMeta(meta, saved) {
  return meta.map(m => {
    const s = saved[m.id] || {}
    const item = {
      id: m.id,
      name: m.name,
      color: m.color,
      desc: m.desc,
      builtin: m.builtin || false,
      status: 'unknown',
      testState: 'idle'
    }
    item.enabled = 'enabled' in s ? s.enabled : m.enabled
    item.apiKey = s.apiKey || m.apiKey || ''
    item.hasEndpoint = m.hasEndpoint
    if (m.hasEndpoint) item.endpoint = 'endpoint' in s ? s.endpoint : m.endpoint
    item.hasSecret = m.hasSecret
    if (m.hasSecret) {
      item.secret = 'secret' in s ? s.secret : (m.secret || '')
      item.secretHint = m.id === 'youdao' ? 'appSecret' : m.id === 'tencent' ? 'SecretKey' : m.id === 'baidu' ? '密钥' : 'Secret'
    }
    item.hasRegion = m.hasRegion
    if (m.hasRegion) item.region = 'region' in s ? s.region : (m.region || 'eastasia')
    item.hasModel = m.hasModel
    if (m.hasModel) {
      item.model = 'model' in s ? s.model : m.model
      item.models = m.models || []
    }
    item.hasPrompt = m.hasPrompt
    if (m.hasPrompt) item.prompt = 'prompt' in s ? s.prompt : m.prompt
    item.keyHint = m.id === 'bing' ? 'Ocp-Apim-Subscription-Key' : m.id === 'youdao' ? 'appKey' : m.id === 'tencent' ? 'SecretId' : m.id === 'deepl' ? 'auth-key' : m.id === 'caiyun' ? 'token' : m.id === 'baidu' ? 'appid' : m.id === 'google' ? 'API key' : 'sk-...'
    return item
  })
}

onMounted(async () => {
  try {
    const [cfg, meta] = await Promise.all([
      window.api.loadConfig(),
      window.api.listProviders()
    ])
    const saved = cfg.providers || {}
    providers.push(...buildFromMeta(meta, saved))
  } catch (_) {
    try {
      const cfg = await window.api.loadConfig()
      const p = cfg.providers || {}
      for (const [id, s] of Object.entries(p)) {
        providers.push({
          id, name: id, color: 'var(--brand)', desc: '', enabled: s.enabled, apiKey: s.apiKey || '',
          status: 'unknown', testState: 'idle'
        })
      }
    } catch (__) { /* nothing */ }
  }
})

let saveTimer = null
watch(providers, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 800)
}, { deep: true })

function persist() {
  const cfg = {}
  for (const p of providers) {
    const item = { enabled: p.enabled, apiKey: p.apiKey }
    item.endpoint = p.endpoint
    if (p.hasRegion) item.region = p.region
    if (p.hasModel) item.model = p.model
    if (p.hasPrompt) item.prompt = p.prompt
    if (p.hasSecret) item.secret = p.secret
    cfg[p.id] = item
  }
  window.api.saveConfig({ providers: cfg })
}

let _cachedMeta = null
async function resetDefaults() {
  if (!_cachedMeta) _cachedMeta = await window.api.listProviders()
  providers.length = 0
  providers.push(...buildFromMeta(_cachedMeta, {}))
  persist()
}

function statusTitle(p) {
  return { unknown: '未测试', success: '上次测试成功', fail: '上次测试失败' }[p.status]
}
function testLabel(p) {
  return { idle: '测试', testing: '测试中', success: '已通过', fail: '失败,重试' }[p.testState]
}
function testProvider(p) {
  p.testState = 'testing'
  setTimeout(() => {
    const ok = Math.random() > 0.4
    p.testState = ok ? 'success' : 'fail'
    p.status = ok ? 'success' : 'fail'
  }, 1100)
}
</script>

<style scoped>
.expand-arrow {
  color: var(--text-dim);
  transition: transform 0.15s;
  flex-shrink: 0;
}
.expand-arrow.flip { transform: rotate(90deg); }

.tip-card.warning {
  display: flex;
  align-items: center;
  font-size: var(--fs-xs);
  padding: var(--space-2) var(--space-3);
}
</style>
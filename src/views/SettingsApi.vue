<template>
  <div class="page">
    <h2 class="page-title">{{ text.title }}</h2>
    <p class="page-sub">{{ text.subtitle }}</p>
    <p v-if="saveError" class="provider-error" role="alert">{{ saveError }}</p>

    <SortableSettingList
      v-model="providerOrder"
      class="setting-section"
      :items="providers"
      @reorder="saveProviderOrder"
    >
      <template #default="{ item: p }">
        <div class="setting-row" :class="{ expanded: expanded === p.id }" @click="toggleExpand(p)">
          <div class="setting-row-info">
            <span class="prov-dot" :style="{ background: p.color }"></span>
            <div class="setting-row-text">
              <div class="setting-row-title">
                {{ providerName(p) }}
                <span v-if="p.builtin" class="tag">{{ text.recommended }}</span>
                <span v-if="p.capability?.status === 'unsupported'" class="tag">{{ isEnglish ? 'Not supported' : '尚未支持' }}</span>
                <span class="status-indicator" :class="p.status" :title="statusTitle(p)"></span>
              </div>
              <div class="setting-row-desc">{{ providerDescription(p) }}</div>
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
          <div v-if="p.capability" class="tip-card warning" role="status">
            {{ p.capability.protocol }} · {{ capabilityReason(p.capability) }}
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
            <label>{{ text.region }}</label>
            <BaseSelect v-model="p.region" :options="regions" />
          </div>

          <div v-if="p.hasModel" class="field">
            <label>{{ text.model }}</label>
            <input class="input" v-model="p.model" :placeholder="(p.models || []).join(', ')" />
          </div>

          <div v-if="p.hasEndpoint" class="field">
            <label>{{ text.customEndpoint }}</label>
            <input class="input" v-model="p.endpoint" :placeholder="text.officialEndpoint" />
          </div>

          <div v-if="p.hasPrompt" class="field">
            <label>{{ text.promptTemplate }}</label>
            <textarea class="input" rows="2" v-model="p.prompt" :placeholder="text.promptHint"></textarea>
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
          <p v-if="p.testMessage" class="provider-result" :class="{ 'provider-error': p.status === 'fail' }" role="status">{{ p.testMessage }}</p>
        </div>
      </template>
    </SortableSettingList>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { Plug, Check, XCircle, Loader2, ChevronRight } from 'lucide-vue-next'
import InputKey from '../components/InputKey.vue'
import BaseSelect from '../components/BaseSelect.vue'
import SortableSettingList from '../components/SortableSettingList.vue'
import { useLocale } from '../composables/useLocale'

const regions = ['eastasia', 'southeastasia', 'eastus', 'westeurope']
const { isEnglish } = useLocale()
const text = computed(() => isEnglish.value ? {
  title: 'Translation APIs',
  subtitle: 'Enable and configure translation providers for instant switching in the popup',
  recommended: 'Recommended',
  googleWarning: 'Google Translate API may require a proxy in mainland China',
  region: 'Region',
  model: 'Model',
  customEndpoint: 'Custom Endpoint',
  officialEndpoint: 'Leave blank to use the official endpoint',
  promptTemplate: 'Prompt Template',
  promptHint: 'Use {{target}} for the target language',
  untested: 'Not tested',
  testSuccess: 'Last test succeeded',
  testFailed: 'Last test failed',
  test: 'Test',
  testing: 'Testing',
  passed: 'Passed',
  retry: 'Failed, retry'
} : {
  title: '翻译接口',
  subtitle: '启用并配置翻译平台 API，可在悬浮窗中实时切换',
  recommended: '推荐',
  googleWarning: 'Google 翻译 API 在国内可能不可直达，需要代理',
  region: '区域',
  model: '模型',
  customEndpoint: '自定义 Endpoint',
  officialEndpoint: '留空使用官方地址',
  promptTemplate: 'Prompt 模板',
  promptHint: '用 {{target}} 表示目标语言',
  untested: '未测试',
  testSuccess: '上次测试成功',
  testFailed: '上次测试失败',
  test: '测试',
  testing: '测试中',
  passed: '已通过',
  retry: '失败，重试'
})

const providerDescriptionsEn = {
  deepseek: 'High-quality, low-cost translation with a China-based language model',
  bing: 'Custom OpenAI-compatible endpoint only; official Bing translation protocol is not implemented',
  openai: 'High-quality translation with GPT models',
  youdao: 'Official adapter is not implemented; existing configuration is retained',
  tencent: 'Official adapter is not implemented; SecretId/SecretKey configuration is retained',
  deepl: 'Excellent for European languages; overseas connectivity required',
  caiyun: 'Official adapter is not implemented; existing configuration is retained',
  baidu: 'Official adapter is not implemented; appid/secret configuration is retained',
  google: 'Custom OpenAI-compatible endpoint only; official Google translation protocol is not implemented'
}
const providerNamesEn = {
  bing: 'Bing Translator',
  youdao: 'Youdao Translate',
  tencent: 'Tencent TMT',
  caiyun: 'Caiyun Translate',
  baidu: 'Baidu Translate',
  google: 'Google Translate'
}

function providerDescription(provider) {
  return isEnglish.value ? (providerDescriptionsEn[provider.id] || provider.desc) : provider.desc
}
function providerName(provider) {
  return isEnglish.value ? (providerNamesEn[provider.id] || provider.name) : provider.name
}

const expanded = ref(null)
const providers = reactive([])
const providerOrder = ref([])
const saveError = ref('')
let hydrated = false
let disposed = false
let draftVersion = 0
let capabilityVersion = 0
let offConfig = null

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
      testState: 'idle',
      testMessage: '',
      capability: null,
      testVersion: 0
    }
    item.enabled = 'enabled' in s ? s.enabled : m.enabled
    item.apiKey = s.apiKey || m.apiKey || ''
    item.hasEndpoint = m.hasEndpoint
    if (m.hasEndpoint) item.endpoint = 'endpoint' in s ? s.endpoint : m.endpoint
    item.hasSecret = m.hasSecret
    if (m.hasSecret) {
      item.secret = 'secret' in s ? s.secret : (m.secret || '')
      item.secretHint = m.id === 'youdao' ? 'appSecret' : m.id === 'tencent' ? 'SecretKey' : m.id === 'baidu' ? 'Secret Key' : 'Secret'
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
    item.keyHint = m.id === 'youdao' ? 'appKey' : m.id === 'tencent' ? 'SecretId' : m.id === 'deepl' ? 'auth-key' : m.id === 'caiyun' ? 'token' : m.id === 'baidu' ? 'appid' : 'sk-...'
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
    providerOrder.value = cfg.settingsOrder?.providers || []
    await refreshCapabilities()
    if (!disposed) offConfig = window.api.onConfigUpdate?.(() => refreshCapabilities())
  } catch (error) {
    saveError.value = isEnglish.value ? 'Unable to load provider settings' : '无法读取引擎设置'
  } finally {
    hydrated = true
  }
})

function saveProviderOrder(order) {
  window.api?.saveConfig?.({
    settingsOrder: { providers: order }
  }).catch(() => { saveError.value = isEnglish.value ? 'Unable to save provider order' : '引擎排序保存失败' })
}

let saveTimer = null
watch(() => JSON.stringify(providerDraft()), () => {
  if (!hydrated || disposed) return
  draftVersion += 1
  for (const provider of providers) {
    provider.testVersion += 1
    provider.testState = 'idle'
    provider.status = 'unknown'
    provider.testMessage = ''
  }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; void persist() }, 800)
  void refreshCapabilities()
})

function providerDraft() {
  const cfg = {}
  for (const p of providers) {
    const item = { enabled: p.enabled, apiKey: p.apiKey }
    if (p.hasEndpoint) item.endpoint = p.endpoint || ''
    if (p.hasRegion) item.region = p.region
    if (p.hasModel) item.model = p.model
    if (p.hasPrompt) item.prompt = p.prompt
    if (p.hasSecret) item.secret = p.secret
    cfg[p.id] = item
  }
  return cfg
}

async function refreshCapabilities() {
  const version = ++capabilityVersion
  try {
    const capabilities = await window.api.providerCapabilities(providerDraft())
    if (disposed || version !== capabilityVersion) return
    for (const provider of providers) provider.capability = capabilities.find(item => item.id === provider.id)
  } catch (_) {
    if (disposed || version !== capabilityVersion) return
    for (const provider of providers) provider.capability = null
    saveError.value = isEnglish.value ? 'Unable to read provider capabilities' : '无法读取引擎能力'
  }
}

async function persist() {
  const version = draftVersion
  try {
    await window.api.saveConfig({ providers: providerDraft() })
    if (version === draftVersion) saveError.value = ''
    return true
  } catch (_) {
    saveError.value = isEnglish.value ? 'Provider settings could not be saved; the application still uses the last saved settings.' : '引擎设置保存失败；应用仍使用上次已保存的配置。'
    return false
  }
}

let _cachedMeta = null
async function resetDefaults() {
  if (!_cachedMeta) _cachedMeta = await window.api.listProviders()
  providers.length = 0
  providers.push(...buildFromMeta(_cachedMeta, {}))
  await persist()
}

function capabilityReason(capability) {
  if (!isEnglish.value) return capability.reason
  return { ready: 'Configuration is available', disabled: 'Provider is disabled', unsupported: 'Official adapter is not implemented', 'missing-configuration': 'Configuration is incomplete or the endpoint is invalid' }[capability.status]
}

function statusTitle(p) {
  return {
    unknown: text.value.untested,
    success: text.value.testSuccess,
    fail: text.value.testFailed
  }[p.status]
}
function testLabel(p) {
  return {
    idle: text.value.test,
    testing: text.value.testing,
    success: text.value.passed,
    fail: text.value.retry
  }[p.testState]
}
async function testProvider(p) {
  const version = ++p.testVersion
  p.testState = 'testing'
  p.testMessage = ''
  try {
    const result = await window.api.testProvider(p.id, providerDraft()[p.id])
    if (disposed || version !== p.testVersion) return
    p.capability = result.capability
    p.testState = result.ok ? 'success' : 'fail'
    p.status = result.ok ? 'success' : 'fail'
    p.testMessage = result.ok ? (isEnglish.value ? `This probe succeeded (${result.ms} ms)` : `本次实际探测成功 (${result.ms} ms)`) : result.error
  } catch (_) {
    if (disposed || version !== p.testVersion) return
    p.testState = 'fail'
    p.status = 'fail'
    p.testMessage = isEnglish.value ? 'Unable to run the engine probe' : '无法执行引擎探测'
  }
}

onUnmounted(() => {
  disposed = true
  offConfig?.()
  capabilityVersion += 1
  for (const provider of providers) provider.testVersion += 1
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; void persist() }
})
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
.provider-error { color: var(--danger); }
.provider-result { font-size: var(--fs-xs); margin-top: var(--space-2); }
</style>

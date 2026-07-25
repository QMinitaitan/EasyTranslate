const https = require('https')
const { getProvider } = require('./providers.cjs')

// ── OpenAI-compatible chat completion adapter ──
// Works for: deepseek, openai, bing, google (and any custom endpoint)
function openaiCompat({ apiKey, endpoint, model, prompt, text, target }) {
  return new Promise((resolve, reject) => {
    const base = (endpoint || 'https://api.deepseek.com').replace(/\/$/, '')
    const url = new URL(base + '/v1/chat/completions')
    const sysTpl = prompt || '请将以下{{src}}文本翻译为{{target}},仅输出译文'
    const systemPrompt = sysTpl
      .replace('{{target}}', target || '中文')
      .replace('{{src}}', '')
    const body = JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.3,
      stream: false
    })
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 20000
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        try {
          const json = JSON.parse(data)
          const out = json.choices?.[0]?.message?.content || ''
          resolve({ text: out.trim(), usage: json.usage })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.write(body)
    req.end()
  })
}

// ── Adapter registry ──
// Each adapter receives the raw user config object + { text, target }
// and must return Promise<{ text, usage? }>

const adapters = {
  'openai-compat': (cfg, { text, target }) => openaiCompat({
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    prompt: cfg.prompt,
    text,
    target
  }),

  // ── DeepL adapter ──
  // Uses api-free.deepl.com (Free API). For Pro, change host to api.deepl.com.
  deepl: (cfg, { text, target }) => {
    const langMap = {
      '中文(简体)': 'ZH',
      '中文(繁体)': 'ZH-HANT',
      'English': 'EN',
      '日本語': 'JA'
    }
    const targetLang = langMap[target] || 'ZH'
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ text: [text], target_lang: targetLang })
      const req = https.request('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`DeepL HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
            return
          }
          try {
            const json = JSON.parse(data)
            const out = json.translations?.[0]?.text || ''
            resolve({ text: out.trim() })
          } catch(e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.write(body)
      req.end()
    })
  },

  // Stubs for providers that need non-OpenAI APIs
  youdao: () => Promise.reject(new Error('有道翻译适配器尚未实现')),
  tencent: () => Promise.reject(new Error('腾讯翻译适配器尚未实现')),
  caiyun: () => Promise.reject(new Error('彩云小译适配器尚未实现')),
  baidu: () => Promise.reject(new Error('百度翻译适配器尚未实现'))
}

// ── Unified translate entry point ──
// Routes to the correct adapter based on provider metadata.
// cfg: the per-provider user config from config file (apiKey, endpoint, model, ...)
// providerId: e.g. 'deepseek', 'openai'
function translateWith(cfg, providerId, { text, target }) {
  const meta = getProvider(providerId)
  if (!meta) return Promise.reject(new Error(`Unknown provider: ${providerId}`))
  const adapter = adapters[meta.adapter]
  if (!adapter) return Promise.reject(new Error(`No adapter for type: ${meta.adapter}`))
  return adapter(cfg, { text, target })
}

module.exports = { translateWith, adapters }
import https = require('node:https')
import { getAll, getProvider } from './providers.cjs'
import type { ProviderCapability, ProviderConfig, ProviderProbeResult } from './shared/ipc-contract.cjs'

export type ProviderErrorCode = 'unsupported' | 'missing-configuration' | 'disabled' | 'http-error' | 'network-error' | 'invalid-response' | 'empty-result' | 'timeout' | 'cancelled'
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, message: string) { super(message); this.name = 'ProviderError' }
}
export interface ProviderTranslationInput { text: string; target?: string; signal?: AbortSignal }
export interface ProviderTranslation { text: string; usage?: unknown }
export interface ProviderServiceOptions { request?: typeof https.request; timeoutMs?: number }

export function createProviderService({ request = https.request, timeoutMs = 20000 }: ProviderServiceOptions = {}) {
  function inspect(id: string, config: Partial<ProviderConfig> = {}): ProviderCapability {
    const meta = getProvider(id)
    const compatibleAlias = id === 'bing' || id === 'google'
    const supported = !!meta && ['openai-compat', 'deepl'].includes(meta.adapter)
    const protocol = !supported ? '官方协议（未实现）' : compatibleAlias ? 'OpenAI-compatible（非官方翻译 API）' : meta?.adapter === 'deepl' ? 'DeepL API' : 'OpenAI-compatible'
    const missing = !config.apiKey?.trim() ? 'API Key' : compatibleAlias && !config.endpoint?.trim() ? 'OpenAI-compatible Endpoint' : compatibleAlias && !config.model?.trim() ? '兼容模型' : ''
    let configured = supported && !missing
    let reason = !supported ? '该引擎的官方适配器尚未实现' : missing ? `缺少 ${missing}` : ''
    if (configured && config.endpoint?.trim()) {
      try {
        const url = new URL(config.endpoint)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error()
      } catch {
        configured = false
        reason = 'Endpoint 必须是无内嵌凭据、查询或片段的 HTTPS 地址'
      }
    }
    const enabled = config.enabled === true
    const status = !supported ? 'unsupported' : !configured ? 'missing-configuration' : !enabled ? 'disabled' : 'ready'
    return { id, supported, configured, enabled, available: status === 'ready', status, reason: reason || (!enabled ? '引擎未启用' : '配置可用'), protocol }
  }
  async function translate(config: Partial<ProviderConfig>, id: string, input: ProviderTranslationInput): Promise<ProviderTranslation> {
    if (input.signal?.aborted) throw new ProviderError('cancelled', '翻译请求已取消')
    const capability = inspect(id, config)
    if (!capability.available) throw new ProviderError(capability.status as ProviderErrorCode, capability.reason)
    const meta = getProvider(id)!
    const deepl = meta.adapter === 'deepl'
    const base = (config.endpoint?.trim() || meta.endpoint || (deepl ? 'https://api-free.deepl.com' : id === 'openai' ? 'https://api.openai.com' : 'https://api.deepseek.com')).replace(/\/$/, '')
    const url = new URL(base + (deepl ? '/v2/translate' : base.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'))
    const template = config.prompt || meta.prompt || '请将以下{{src}}文本翻译为{{target}},仅输出译文'
    const languages: Record<string, string> = { '中文(简体)': 'ZH', '中文(繁体)': 'ZH-HANT', English: 'EN', '日本語': 'JA' }
    const body = JSON.stringify(deepl ? { text: [input.text], target_lang: languages[input.target || ''] || 'ZH' } : { model: config.model || meta.model || 'deepseek-chat', messages: [
      { role: 'system', content: template.replaceAll('{{target}}', input.target || '中文').replaceAll('{{src}}', '') },
      { role: 'user', content: input.text }
    ], temperature: 0.3, stream: false })
    return new Promise((resolve, reject) => {
      let settled = false
      let req: ReturnType<typeof https.request> | undefined
      const finish = (error?: ProviderError, result?: ProviderTranslation) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(result!)
      }
      const timer = setTimeout(() => {
        finish(new ProviderError('timeout', '引擎请求超时'))
        req?.destroy()
      }, timeoutMs)
      const abort = () => {
        finish(new ProviderError('cancelled', '翻译请求已取消'))
        req?.destroy()
      }
      input.signal?.addEventListener('abort', abort, { once: true })
      try {
      req = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `${deepl ? 'DeepL-Auth-Key' : 'Bearer'} ${config.apiKey}` } }, res => {
        if (settled) { res.resume(); return }
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('error', () => finish(new ProviderError('network-error', '网络响应中断')))
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) { finish(new ProviderError('http-error', `引擎请求失败 (HTTP ${res.statusCode || 0})`)); return }
          try {
            const parsed: unknown = JSON.parse(data)
            const out = deepl ? (parsed as { translations?: { text?: unknown }[] }).translations?.[0]?.text : (parsed as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
            if (typeof out !== 'string') throw new Error()
            if (!out.trim()) { finish(new ProviderError('empty-result', '引擎返回空译文')); return }
            finish(undefined, { text: out.trim(), usage: (parsed as { usage?: unknown }).usage })
          } catch { finish(new ProviderError('invalid-response', '引擎响应格式无效')) }
        })
      })
      req.on('error', () => finish(new ProviderError('network-error', '无法连接翻译引擎，请检查网络和接口配置')))
      req.write(body)
      req.end()
      } catch { finish(new ProviderError('network-error', '无法连接翻译引擎，请检查网络和接口配置')) }
    })
  }
  async function probe(id: string, config: Partial<ProviderConfig> = {}): Promise<ProviderProbeResult> {
    const capability = inspect(id, config)
    const started = performance.now()
    try {
      await translate(config, id, { text: 'Hello', target: '中文(简体)' })
      return { ok: true, status: 'success', ms: Math.round(performance.now() - started), capability }
    } catch (error) {
      const failure = error instanceof ProviderError ? error : new ProviderError('network-error', '引擎探测失败')
      return { ok: false, status: failure.code, ms: Math.round(performance.now() - started), error: failure.message, capability }
    }
  }
  return { inspect, translate, probe, capabilities: (configs: Record<string, Partial<ProviderConfig>> = {}) => getAll().map(meta => inspect(meta.id, configs[meta.id])) }
}

const service = createProviderService()
export const inspectProvider = service.inspect
export const getProviderCapabilities = service.capabilities
export const translateWith = service.translate
export const probeProvider = service.probe

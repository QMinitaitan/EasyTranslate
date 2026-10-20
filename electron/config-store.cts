import * as path from 'node:path'
import * as fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { AppConfig, ConfigUpdate, ProviderConfig, ProviderMetadata } from './shared/ipc-contract.cjs'

const { getAll } = require('../electron/providers.cjs') as { getAll(): ProviderMetadata[] }

export const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE || homedir(), '.translate-app.config.json')

function providerDefaults(): Record<string, ProviderConfig> {
  const defaults: Record<string, ProviderConfig> = {}
  for (const provider of getAll()) {
    const value: ProviderConfig = { enabled: provider.enabled, apiKey: '' }
    for (const [flag, key, fallback] of [
      ['hasEndpoint', 'endpoint', ''], ['hasRegion', 'region', 'eastasia'],
      ['hasModel', 'model', ''], ['hasPrompt', 'prompt', ''], ['hasSecret', 'secret', '']
    ] as const) {
      if (provider[flag]) value[key] = typeof provider[key] === 'string' ? provider[key] as string : fallback
    }
    defaults[provider.id] = value
  }
  return defaults
}

export const DEFAULTS: AppConfig = {
  providers: providerDefaults(), target: '中文(简体)', uiLanguage: 'system',
  closeAction: 'tray', launchToTray: false, autoLaunch: false, raceMode: true,
  settingsOrder: {}, shortcut: 'Alt+Q', shortcuts: { translate: 'Alt+Q', show: 'Alt+E' }
}

export interface ConfigStorage {
  read(): string | null
  write(contents: string): Promise<void>
}

function fileStorage(filePath: string): ConfigStorage {
  return {
    read() {
      try { return fs.readFileSync(filePath, 'utf8') }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    },
    async write(contents) {
      const temporary = `${filePath}.${randomUUID()}.tmp`
      try {
        await fs.promises.writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await fs.promises.rename(temporary, filePath)
      } finally {
        await fs.promises.unlink(temporary).catch(() => {})
      }
    }
  }
}

function merge(current: AppConfig, partial: ConfigUpdate): AppConfig {
  const next = { ...current, ...partial, providers: { ...current.providers },
    shortcuts: { ...current.shortcuts, ...partial.shortcuts },
    settingsOrder: { ...current.settingsOrder, ...partial.settingsOrder } }
  for (const [id, provider] of Object.entries(partial.providers || {})) {
    const previous = next.providers[id] || { enabled: false, apiKey: '' }
    next.providers[id] = { ...previous, ...provider }
  }
  return next
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function jsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
  const valid = entries.every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) &&
    (item === undefined && !Array.isArray(value) || jsonValue(item, seen)))
  seen.delete(value)
  return valid
}

/** Also used for untyped IPC callers; TypeScript never validates incoming data. */
export function isConfigUpdate(value: unknown): value is ConfigUpdate {
  if (!record(value) || !jsonValue(value)) return false
  const booleanFields = ['launchToTray', 'autoLaunch', 'raceMode']
  const stringFields = ['target', 'uiLanguage', 'closeAction', 'shortcut', 'theme']
  if (booleanFields.some(key => key in value && typeof value[key] !== 'boolean')) return false
  if (stringFields.some(key => key in value && typeof value[key] !== 'string')) return false
  if ('closeAction' in value && !['tray', 'quit'].includes(value.closeAction as string)) return false
  if ('providers' in value) {
    if (!record(value.providers)) return false
    for (const provider of Object.values(value.providers)) {
      if (!record(provider)) return false
      if ('enabled' in provider && typeof provider.enabled !== 'boolean') return false
      if (['apiKey', 'endpoint', 'model', 'prompt', 'region', 'secret'].some(key => key in provider && typeof provider[key] !== 'string')) return false
    }
  }
  if ('shortcuts' in value && (!record(value.shortcuts) || Object.values(value.shortcuts).some(v => typeof v !== 'string'))) return false
  if ('settingsOrder' in value && (!record(value.settingsOrder) || Object.values(value.settingsOrder).some(v => !Array.isArray(v) || v.some(item => typeof item !== 'string')))) return false
  if ('popupBounds' in value) {
    if (!record(value.popupBounds)) return false
    for (const [key, dimension] of Object.entries(value.popupBounds)) {
      if (!['width', 'height', 'x', 'y'].includes(key) || typeof dimension !== 'number' || !Number.isFinite(dimension)) return false
      if (['width', 'height'].includes(key) && dimension <= 0) return false
    }
  }
  if ('popupBoundsVersion' in value && (!Number.isSafeInteger(value.popupBoundsVersion) || (value.popupBoundsVersion as number) < 0)) return false
  return true
}

function compatibleSavedConfig(value: unknown): ConfigUpdate {
  if (!record(value) || !jsonValue(value)) throw new Error('invalid saved config')
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'providers' && record(entry)) {
      const providers: Record<string, unknown> = {}
      for (const [id, provider] of Object.entries(entry)) {
        if (!record(provider)) continue
        providers[id] = Object.fromEntries(Object.entries(provider).filter(([field, item]) =>
          isConfigUpdate({ providers: { [id]: { [field]: item } } })))
      }
      result.providers = providers
    } else if (['shortcuts', 'settingsOrder', 'popupBounds'].includes(key) && record(entry)) {
      result[key] = Object.fromEntries(Object.entries(entry).filter(([field, item]) =>
        isConfigUpdate({ [key]: { [field]: item } })))
    } else if (isConfigUpdate({ [key]: entry })) {
      result[key] = entry
    }
  }
  return result as ConfigUpdate
}

export function createConfigStore({ filePath = CONFIG_PATH, storage = fileStorage(filePath) }: { filePath?: string; storage?: ConfigStorage } = {}) {
  let current: AppConfig | null = null
  let readFailed = false
  let pending: Promise<unknown> = Promise.resolve()
  const subscribers = new Set<(config: AppConfig) => void>()
  function load(): AppConfig {
    if (!current) {
      try {
        const raw = storage.read()
        const saved = compatibleSavedConfig(raw ? JSON.parse(raw) : {})
        current = merge(structuredClone(DEFAULTS), saved)
        if (typeof saved.shortcut === 'string' && saved.shortcuts?.translate === undefined) current.shortcuts.translate = saved.shortcut
      } catch {
        readFailed = true
        current = structuredClone(DEFAULTS)
      }
    }
    return structuredClone(current)
  }
  function save(partial: unknown): Promise<AppConfig> {
    if (!record(partial) || !jsonValue(partial)) return Promise.reject(new Error('无效的配置更新'))
    // Optional IPC object fields may be undefined; JSON omission must preserve the previous value.
    const update: unknown = JSON.parse(JSON.stringify(partial))
    if (!isConfigUpdate(update)) return Promise.reject(new Error('无效的配置更新'))
    const result = pending.then(async () => {
      const next = merge(load(), update)
      if (readFailed) throw new Error('现有配置读取失败，未覆盖原文件，请修复后重启应用')
      try { await storage.write(JSON.stringify(next, null, 2)) }
      catch { throw new Error('配置保存失败，请检查文件访问权限并重试') }
      current = next
      for (const subscriber of subscribers) {
        // A presentation listener must not turn an already durable write into a save failure.
        try { subscriber(load()) } catch {}
      }
      return load()
    })
    pending = result.catch(() => {})
    return result
  }
  async function flush(): Promise<void> {
    let observed: Promise<unknown>
    do {
      observed = pending
      await observed
    } while (observed !== pending)
  }
  function subscribe(listener: (config: AppConfig) => void): () => void {
    subscribers.add(listener)
    return () => { subscribers.delete(listener) }
  }
  return { load, save, flush, subscribe }
}

const store = createConfigStore()
export const load = store.load
export const save = store.save
export const flush = store.flush
export const subscribe = store.subscribe

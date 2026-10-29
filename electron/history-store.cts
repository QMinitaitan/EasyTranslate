import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { HistoryEntry, HistoryId } from './shared/ipc-contract.cjs'

export const HISTORY_PATH = path.join(process.env.HOME || process.env.USERPROFILE || homedir(), '.translate-app.history.json')
export const MAX_ITEMS = 20
const readError = '历史读取失败，原文件未修改，请检查文件后重试'
const blockedError = '现有历史读取失败，未覆盖原文件，请修复后重启应用'
const saveError = '历史保存失败，请检查文件访问权限并重试'

export interface HistoryInput {
  src: string; dst: string; engine?: string; color?: string; lang?: string; ts?: number; favorite?: boolean
  [key: string]: unknown
}
export interface HistoryStorage {
  read(): string | null
  /** Recheck before the atomic commit; false means the automatic entry was superseded. */
  write(contents: string, isCurrent: () => boolean): Promise<boolean | void>
}
function fileStorage(filePath: string): HistoryStorage {
  return {
    read() {
      try { return fs.readFileSync(filePath, 'utf8') }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    },
    async write(contents, isCurrent) {
      const temporary = `${filePath}.${randomUUID()}.tmp`
      try {
        if (!isCurrent()) return false
        await fs.promises.writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        if (!isCurrent()) return false
        await fs.promises.rename(temporary, filePath)
        return true
      } finally { await fs.promises.unlink(temporary).catch(() => {}) }
    }
  }
}
export function isHistoryId(value: unknown): value is HistoryId {
  return typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function compatibleEntry(value: unknown): HistoryEntry {
  if (!record(value) || !isHistoryId(value.id) || typeof value.src !== 'string' || typeof value.dst !== 'string' ||
      typeof value.ts !== 'number' || !Number.isFinite(value.ts) ||
      (value.favorite !== undefined && typeof value.favorite !== 'boolean')) throw new Error('invalid history')
  return { ...value, id: value.id, src: value.src, dst: value.dst, ts: value.ts,
    engine: typeof value.engine === 'string' ? value.engine : '', color: typeof value.color === 'string' ? value.color : '#888',
    lang: typeof value.lang === 'string' ? value.lang : '', favorite: value.favorite === true }
}
function retain(items: HistoryEntry[]): HistoryEntry[] {
  const sorted = [...items].sort((left, right) => right.ts - left.ts)
  let recent = 0
  return sorted.filter(item => item.favorite || recent++ < MAX_ITEMS)
}
interface Change<T> { items: HistoryEntry[]; result(items: HistoryEntry[]): T; changed?: boolean }

export function createHistoryStore({ filePath = HISTORY_PATH, storage = fileStorage(filePath), now = Date.now }: { filePath?: string; storage?: HistoryStorage; now?: () => number } = {}) {
  let current: HistoryEntry[] | null = null
  let readFailed = false
  let sequence = 0
  let pending: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(items: HistoryEntry[]) => void>()
  const errors = new Set<(message: string) => void>()
  function initialize() {
    if (current) return
    try {
      const raw = storage.read()
      const value: unknown = raw === null ? [] : JSON.parse(raw)
      if (!Array.isArray(value)) throw new Error('invalid history')
      current = value.map(compatibleEntry).sort((left, right) => right.ts - left.ts)
      if (new Set(current.map(item => item.id)).size !== current.length) throw new Error('duplicate history ids')
    } catch { current = []; readFailed = true }
  }
  function load(): HistoryEntry[] {
    initialize()
    if (readFailed) throw new Error(readError)
    return structuredClone(current!)
  }
  function publishError(message: string) {
    for (const listener of errors) { try { listener(message) } catch {} }
  }
  function mutate<T>(change: (items: HistoryEntry[]) => Change<T>, skipped: T, isCurrent: () => boolean = () => true): Promise<T> {
    const result = pending.then(async () => {
      if (!isCurrent()) return skipped
      initialize()
      if (readFailed) { publishError(blockedError); throw new Error(blockedError) }
      const update = change(structuredClone(current!))
      if (update.changed === false) return update.result(structuredClone(current!))
      const next = retain(update.items)
      let committed
      try { committed = await storage.write(JSON.stringify(next, null, 2), isCurrent) }
      catch { publishError(saveError); throw new Error(saveError) }
      if (committed === false) return skipped
      current = next
      for (const listener of listeners) { try { listener(load()) } catch {} }
      return update.result(load())
    })
    pending = result.catch(() => {})
    return result
  }
  function add(input: HistoryInput, { isCurrent = () => true }: { isCurrent?: () => boolean } = {}): Promise<HistoryEntry | null> {
    let entry: HistoryInput
    try {
      entry = JSON.parse(JSON.stringify(input))
      if (!record(entry) || typeof entry.src !== 'string' || !entry.src.trim() || typeof entry.dst !== 'string' || !entry.dst.trim() ||
          (entry.favorite !== undefined && typeof entry.favorite !== 'boolean') ||
          (entry.ts !== undefined && (typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)))) throw new Error()
    } catch { return Promise.reject(new Error('无效的历史记录')) }
    return mutate(items => {
      let id: HistoryId = Math.trunc(now() * 1000) + ++sequence
      while (Number.isSafeInteger(id) && items.some(item => item.id === id)) id++
      if (!Number.isSafeInteger(id)) id = randomUUID()
      const item = compatibleEntry({ ...entry, id, ts: entry.ts ?? now(), favorite: entry.favorite ?? false })
      return { items: [item, ...items], result: saved => saved.find(value => value.id === id) || null }
    }, null, isCurrent)
  }
  function setFavorite(id: HistoryId, favorite: boolean): Promise<HistoryEntry | null> {
    if (!isHistoryId(id) || typeof favorite !== 'boolean') return Promise.reject(new Error('无效的收藏更新'))
    return mutate(items => {
      const item = items.find(value => value.id === id)
      if (!item || item.favorite === favorite) return { items, result: () => item || null, changed: false }
      item.favorite = favorite
      return { items, result: saved => saved.find(value => value.id === id) || null }
    }, null)
  }
  function remove(id: HistoryId): Promise<HistoryEntry[]> {
    if (!isHistoryId(id)) return Promise.reject(new Error('无效的历史记录标识'))
    return mutate(items => ({ items: items.filter(item => item.id !== id), result: saved => saved, changed: items.some(item => item.id === id) }), [])
  }
  function clearAll(): Promise<HistoryEntry[]> {
    return mutate(items => ({ items: [], result: saved => saved, changed: !!items.length }), [])
  }
  async function flush(): Promise<void> {
    let observed
    do { observed = pending; await observed } while (observed !== pending)
  }
  return { load, add, setFavorite, remove, clearAll, flush,
    subscribe(listener: (items: HistoryEntry[]) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    subscribeErrors(listener: (message: string) => void) { errors.add(listener); return () => { errors.delete(listener) } }
  }
}

const store = createHistoryStore()
export const load = store.load
export const add = store.add
export const setFavorite = store.setFavorite
export const remove = store.remove
export const clearAll = store.clearAll
export const flush = store.flush
export const subscribe = store.subscribe
export const subscribeErrors = store.subscribeErrors

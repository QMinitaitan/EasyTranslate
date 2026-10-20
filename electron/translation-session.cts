import type { ProviderConfig, TranslationResult } from './shared/ipc-contract.cjs'
import { rankRaceResults } from './race.cjs'

export interface SessionEngine { id: string; provider: ProviderConfig }
export interface SessionRequest {
  text: string
  target: string
  engine?: SessionEngine
  engines?: SessionEngine[]
  mode?: 'single' | 'race'
  requestId?: string
}
export interface SessionResult extends TranslationResult { sessionId: string; requestId?: string }
export type SessionStatus = 'loading' | 'success' | 'error' | 'empty' | 'superseded'
export interface SessionSnapshot {
  sessionId: string
  requestId?: string
  text: string
  target: string
  status: SessionStatus
  result?: SessionResult
  results: SessionResult[]
  pending: number
  mode: 'single' | 'race'
}
export interface SessionHistoryEntry {
  sessionId: string
  text: string
  target: string
  engine: SessionEngine
  result: SessionResult
  /** Async storage checks this again when a queued automatic write is admitted. */
  isCurrent(): boolean
}
interface Dependencies {
  execute(engine: SessionEngine, input: { text: string; target: string; signal: AbortSignal }): Promise<{ text?: string | null }>
  saveHistory(entry: SessionHistoryEntry): { id: number } | null | Promise<{ id: number } | null>
  now?: () => number
}
interface ActiveSession {
  snapshot: SessionSnapshot
  controller: AbortController
  settled: boolean
  finish(snapshot: SessionSnapshot): void
}

/** Owns current-session identity independently of whether transport cancellation succeeds. */
export function createTranslationSessions({ execute, saveHistory, now = Date.now }: Dependencies) {
  let sequence = 0
  let active: ActiveSession | null = null
  let disposed = false
  const listeners = new Set<(snapshot: SessionSnapshot, progress?: SessionResult) => void>()
  const copy = (snapshot: SessionSnapshot): SessionSnapshot => ({ ...snapshot, result: snapshot.result ? { ...snapshot.result } : undefined, results: snapshot.results.map(result => ({ ...result })) })
  const notify = (session: ActiveSession, progress?: SessionResult) => {
    if (active !== session || disposed) return
    for (const listener of listeners) {
      if (active !== session || disposed) break
      listener(copy(session.snapshot), progress ? { ...progress } : undefined)
    }
  }
  const finish = (session: ActiveSession) => {
    if (session.settled) return
    session.settled = true
    session.finish(copy(session.snapshot))
  }
  const cancel = () => {
    const previous = active
    active = null
    if (!previous || previous.settled) return
    previous.snapshot = { ...previous.snapshot, status: 'superseded', result: undefined, pending: 0 }
    previous.controller.abort()
    finish(previous)
  }

  return {
    start(request: SessionRequest) {
      if (disposed) throw new Error('Translation sessions have been disposed')
      cancel()
      const sessionId = `translation-${++sequence}`
      const mode = request.mode || (request.engines ? 'race' : 'single')
      const engines = mode === 'race' ? request.engines || [] : request.engine ? [request.engine] : []
      let complete!: (snapshot: SessionSnapshot) => void
      const done = new Promise<SessionSnapshot>(resolve => { complete = resolve })
      const session: ActiveSession = {
        snapshot: { sessionId, requestId: request.requestId, text: request.text, target: request.target, status: 'loading', mode, results: [], pending: engines.length },
        controller: new AbortController(), settled: false, finish: complete
      }
      active = session
      const isCurrent = () => active === session && !disposed
      let historyWrite: Promise<void> | undefined
      notify(session)
      void (async () => {
        try {
          if (!isCurrent()) return
          if (!request.text.trim()) {
            session.snapshot.status = 'empty'
            session.snapshot.pending = 0
            notify(session)
            return
          }
          if (!engines.length) throw new Error('未配置启用的翻译接口,请到设置中填写 API Key')
          await Promise.all(engines.map(async engine => {
            const started = now()
            let result: SessionResult
            try {
              const output = await execute(engine, { text: request.text, target: request.target, signal: session.controller.signal })
              if (!isCurrent()) return
              const text = typeof output.text === 'string' ? output.text.trim() : ''
              if (!text) throw new Error('翻译引擎返回空译文')
              result = { sessionId, requestId: request.requestId, text, engine: engine.id, ms: Math.max(0, now() - started) }
            } catch (error) {
              if (!isCurrent()) return
              result = { sessionId, requestId: request.requestId, text: null, engine: engine.id, ms: Math.max(0, now() - started), error: error instanceof Error ? error.message : '翻译失败' }
            }
            if (!isCurrent()) return
            session.snapshot.pending--
            session.snapshot.results = rankRaceResults([...session.snapshot.results, result]).results
            const firstSuccess = !!result.text && !session.snapshot.result?.text
            if (firstSuccess) session.snapshot = { ...session.snapshot, status: 'success', result }
            notify(session, result)
            if (!firstSuccess || !isCurrent()) return
            historyWrite = (async () => {
              try {
                const saved = await saveHistory({ sessionId, text: request.text, target: request.target, engine, result: { ...result }, isCurrent })
                if (!isCurrent()) return
                if (saved) result.historyId = saved.id
                else result.historyError = '翻译成功，但历史保存失败'
              } catch (_) {
                if (isCurrent()) result.historyError = '翻译成功，但历史保存失败'
              }
            })()
          }))
          if (!isCurrent()) return
          await historyWrite
          if (!isCurrent()) return
          if (!session.snapshot.result?.text) {
            const reason = session.snapshot.results[0]?.error || '翻译失败'
            throw new Error(mode === 'race' ? `所有翻译引擎均请求失败：${reason}` : reason)
          }
        } catch (error) {
          if (!isCurrent()) return
          session.snapshot = {
            ...session.snapshot, status: 'error', result: {
              sessionId, requestId: request.requestId,
              error: error instanceof Error ? error.message : '翻译失败'
            }
          }
          notify(session)
        } finally {
          if (isCurrent()) finish(session)
        }
      })()
      return { sessionId, done }
    },
    current(): SessionSnapshot | null { return active ? copy(active.snapshot) : null },
    subscribe(listener: (snapshot: SessionSnapshot, progress?: SessionResult) => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    cancel,
    dispose() { cancel(); listeners.clear(); disposed = true }
  }
}

import type { ProviderConfig, TranslationResult } from './shared/ipc-contract.cjs'

export interface SessionEngine { id: string; provider: ProviderConfig }
export interface SessionRequest {
  text: string
  target: string
  engine?: SessionEngine
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
  const listeners = new Set<(snapshot: SessionSnapshot) => void>()
  const copy = (snapshot: SessionSnapshot): SessionSnapshot => ({ ...snapshot, result: snapshot.result ? { ...snapshot.result } : undefined })
  const notify = (session: ActiveSession) => {
    if (active !== session || disposed) return
    for (const listener of listeners) listener(copy(session.snapshot))
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
    previous.snapshot = { ...previous.snapshot, status: 'superseded', result: undefined }
    previous.controller.abort()
    finish(previous)
  }

  return {
    start(request: SessionRequest) {
      if (disposed) throw new Error('Translation sessions have been disposed')
      cancel()
      const sessionId = `translation-${++sequence}`
      let complete!: (snapshot: SessionSnapshot) => void
      const done = new Promise<SessionSnapshot>(resolve => { complete = resolve })
      const session: ActiveSession = {
        snapshot: { sessionId, requestId: request.requestId, text: request.text, target: request.target, status: 'loading' },
        controller: new AbortController(), settled: false, finish: complete
      }
      active = session
      const isCurrent = () => active === session && !disposed
      const started = now()
      notify(session)
      void (async () => {
        try {
          if (!request.text.trim()) {
            session.snapshot.status = 'empty'
            notify(session)
            return
          }
          if (!request.engine) throw new Error('未配置启用的翻译接口,请到设置中填写 API Key')
          const output = await execute(request.engine, {
            text: request.text, target: request.target, signal: session.controller.signal
          })
          if (!isCurrent()) return
          const text = typeof output.text === 'string' ? output.text.trim() : ''
          if (!text) throw new Error('翻译引擎返回空译文')
          const result: SessionResult = {
            sessionId, requestId: request.requestId, text, engine: request.engine.id,
            ms: Math.max(0, now() - started)
          }
          session.snapshot = { ...session.snapshot, status: 'success', result }
          // Translation availability does not depend on persistence completing.
          notify(session)
          if (!isCurrent()) return
          try {
            const saved = await saveHistory({
              sessionId, text: request.text, target: request.target, engine: request.engine,
              result: { ...result }, isCurrent
            })
            if (!isCurrent()) return
            if (saved) result.historyId = saved.id
            else result.historyError = '翻译成功，但历史保存失败'
          } catch (_) {
            if (isCurrent()) result.historyError = '翻译成功，但历史保存失败'
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
    subscribe(listener: (snapshot: SessionSnapshot) => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    cancel,
    dispose() { cancel(); listeners.clear(); disposed = true }
  }
}

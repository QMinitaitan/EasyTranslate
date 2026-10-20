import type { RaceResult } from './shared/ipc-contract.cjs'

/** Ranking policy shared by single/race session results and compatibility callers. */
export function rankRaceResults<T extends { ms?: number; error?: string | null }>(results: T[]) {
  const ranked = [...results].sort((a, b) => (a.ms || 0) - (b.ms || 0))
  const best = ranked.find(result => !result.error) || null
  return { results: ranked, best }
}

interface RaceOptions<Engine extends { id: string }> {
  engines: Engine[]
  requestId?: string
  execute(engine: Engine): Promise<{ text?: string | null }>
  onProgress?(result: RaceResult): void | Promise<void>
  onFirstSuccess?(result: RaceResult, engine: Engine): { id?: number | string } | null | Promise<{ id?: number | string } | null>
  now?: () => number
}

/** Temporary compatibility runner; application ownership lives in translation-session. */
export async function runTranslationRace<Engine extends { id: string }>({
  engines, requestId, execute, onProgress = () => {}, onFirstSuccess = () => null, now = Date.now
}: RaceOptions<Engine>) {
  if (!Array.isArray(engines)) throw new TypeError('engines must be an array')
  if (typeof execute !== 'function') throw new TypeError('execute is required')
  let firstSuccessHandled = false
  const tasks = engines.map(async engine => {
    const startedAt = now()
    let result: RaceResult
    try {
      const translation = await execute(engine)
      result = { requestId, text: translation?.text || '', ms: Math.max(0, now() - startedAt), engine: engine.id, error: null }
      if (result.text && !firstSuccessHandled) {
        firstSuccessHandled = true
        const item = await onFirstSuccess(result, engine)
        if (typeof item?.id === 'number') result.historyId = item.id
        else if (typeof item?.id === 'string') Object.assign(result, { historyId: item.id })
      }
    } catch (error) {
      result = { requestId, text: null, ms: Math.max(0, now() - startedAt), engine: engine.id, error: error instanceof Error ? error.message : String(error) }
    }
    await onProgress(result)
    return result
  })
  return { requestId, ...rankRaceResults(await Promise.all(tasks)) }
}

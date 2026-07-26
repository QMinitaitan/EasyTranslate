function rankRaceResults(results) {
  const ranked = [...results].sort((a, b) => a.ms - b.ms)
  const best = ranked.find(result => !result.error) || null
  return { results: ranked, best }
}

async function runTranslationRace({
  engines,
  requestId,
  execute,
  onProgress = () => {},
  onFirstSuccess = () => null,
  now = Date.now
}) {
  if (!Array.isArray(engines)) throw new TypeError('engines must be an array')
  if (typeof execute !== 'function') throw new TypeError('execute is required')

  let firstSuccessHandled = false

  const tasks = engines.map(async (engine) => {
    const startedAt = now()
    let result

    try {
      const translation = await execute(engine)
      result = {
        requestId,
        text: translation?.text || '',
        ms: Math.max(0, now() - startedAt),
        engine: engine.id,
        error: null
      }

      if (result.text && !firstSuccessHandled) {
        firstSuccessHandled = true
        const historyItem = await onFirstSuccess(result, engine)
        if (historyItem?.id) result.historyId = historyItem.id
      }
    } catch (error) {
      result = {
        requestId,
        text: null,
        ms: Math.max(0, now() - startedAt),
        engine: engine.id,
        error: error?.message || String(error)
      }
    }

    await onProgress(result)
    return result
  })

  const { results, best } = rankRaceResults(await Promise.all(tasks))
  return { requestId, results, best }
}

module.exports = { rankRaceResults, runTranslationRace }

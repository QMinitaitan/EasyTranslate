const test = require('node:test')
const assert = require('node:assert/strict')
const { rankRaceResults, runTranslationRace } = require('../electron/race.cjs')

test('Race results are ordered by latency and choose the fastest success', () => {
  const input = [
    { engine: 'deepseek', ms: 420, error: null },
    { engine: 'deepl', ms: 180, error: null },
    { engine: 'bing', ms: 80, error: 'timeout' }
  ]

  const ranked = rankRaceResults(input)

  assert.deepEqual(ranked.results.map(item => item.engine), ['bing', 'deepl', 'deepseek'])
  assert.equal(ranked.best.engine, 'deepl')
  assert.deepEqual(input.map(item => item.engine), ['deepseek', 'deepl', 'bing'])
})

test('Race returns no best result when every engine fails', () => {
  const ranked = rankRaceResults([
    { engine: 'a', ms: 10, error: 'failed' },
    { engine: 'b', ms: 20, error: 'failed' }
  ])

  assert.equal(ranked.best, null)
})

test('Race emits every result, preserves request identity, and saves only the first success', async () => {
  const progress = []
  const saved = []
  let timestamp = 100

  const race = await runTranslationRace({
    requestId: 'request-7',
    engines: [
      { id: 'slow', provider: {} },
      { id: 'fast', provider: {} },
      { id: 'failed', provider: {} }
    ],
    execute: async ({ id }) => {
      if (id === 'failed') throw new Error('provider unavailable')
      return { text: `${id} translation` }
    },
    onProgress: (result) => progress.push(result),
    onFirstSuccess: (result) => {
      saved.push(result.engine)
      return { id: 'history-1' }
    },
    now: () => ++timestamp
  })

  assert.equal(race.requestId, 'request-7')
  assert.equal(progress.length, 3)
  assert.ok(progress.every(result => result.requestId === 'request-7'))
  assert.deepEqual(saved, ['slow'])
  assert.equal(
    race.results.filter(result => result.historyId === 'history-1').length,
    1
  )
  assert.equal(race.results.find(result => result.engine === 'failed').error, 'provider unavailable')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { rankRaceResults } = require('../dist-electron/race.cjs')

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

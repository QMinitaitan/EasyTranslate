const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { buildReport } = require('../scripts/performance/final-evidence.cjs')

test('incomplete benchmark observations cannot pass frozen cohort acceptance gates', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-partial-evidence-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const run = path.join(folder, 'cold-1')
  fs.mkdirSync(run)
  const json = (file, value) => fs.writeFileSync(path.join(folder, file), JSON.stringify(value))
  const lines = (file, values) => fs.writeFileSync(path.join(run, file), values.map(value => JSON.stringify(value)).join('\n') + '\n')
  json('environment.json', { logicalProcessors: 16 })
  const quick = { p50: 1, p95: 2 }
  json('summary.json', { summary: { firstSuccessful: { showMs: quick, domResultMs: quick }, warmSuccessful: { showMs: quick, domResultMs: quick }, warm: { showMs: quick } }, idle: [] })
  const trial = 'cold-1-invoke-1'
  const src = 'Hello baseline world 1.'
  lines('events.jsonl', [
    { t: 1, event: 'launcher' }, { t: 2, event: 'window-created', kind: 'main', id: 1 }, { t: 3, event: 'window-created', kind: 'popup', id: 2 },
    { t: 4, event: 'health', windows: 2 }, { t: 10, event: 'shortcut', trial },
    { t: 11, event: 'selection-end', trial, text: src, clipboardRestored: true, htmlRestored: true, rtfRestored: true },
    { t: 12, event: 'transport-start', trial, source: src }, { t: 13, event: 'translate-end', trial, ok: true, historyId: 1 },
    { t: 14, event: 'dom-result', trial, text: `BENCH_TRANSLATED: ${src}`, visible: 'visible' }
  ])
  lines('driver.jsonl', [{ t: 0, event: 'launch-start' }, { t: 10, event: 'invoke-start', trial, foreground: 1, sourceWindow: 1 }, { t: 20, event: 'invoke-end', trial }, { t: 30, event: 'precondition-failed', trial: 'cold-1-invoke-2', stage: 'foreground' }])
  fs.writeFileSync(path.join(run, 'resources.csv'), 't,count,privateBytes,workingSetBytes,cumulativeCpuSeconds,pids,samplingMs,foreground,processes\n0,5,100,200,0,1,1,1,1:0:1:0:100:200\n100,5,100,200,0,1,1,1,1:0:1:0:100:200\n')
  fs.writeFileSync(path.join(run, 'stdout.txt'), '')
  fs.writeFileSync(path.join(run, 'stderr.txt'), '')
  json('cold-1/.translate-app.history.json', [{ id: 1, src, dst: `BENCH_TRANSLATED: ${src}`, favorite: false }])
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/performance/2026-10-20-baseline.json'), 'utf8'))
  const report = buildReport(folder, baseline, {})
  assert.equal(report.allPassed, false)
  assert.equal(report.checks.some(check => check.pass), false)
  assert.equal(report.cohortComplete, false)
  const firstShow = report.checks.find(check => check.name === 'First successful show P50 improves')
  assert.equal(firstShow.observedComparisonPass, true)
  assert.equal(firstShow.status, 'unavailable-incomplete-cohort')
})

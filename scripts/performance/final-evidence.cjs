const fs = require('node:fs')
const path = require('node:path')

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const readLines = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/, '')))
const stats = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  const quantile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
  return { n: sorted.length, min: sorted[0], p50: quantile(.5), p95: quantile(.95), max: sorted.at(-1) }
}

// Post-processing only: never changes the timed launcher, sampler or raw ledger.
function collectEvidence(folder) {
  const environment = fs.existsSync(path.join(folder, 'environment.json')) ? readJson(path.join(folder, 'environment.json')) : {}
  const logicalProcessors = Number(environment.logicalProcessors)
  if (!Number.isInteger(logicalProcessors) || logicalProcessors < 1) throw new Error('Final cohort requires environment.json with its recorded logical processor count')
  return fs.readdirSync(folder).filter(name => /^cold-\d+$/.test(name)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).map(name => {
    const run = path.join(folder, name)
    const missing = ['events.jsonl', 'driver.jsonl', 'resources.csv', 'stdout.txt', 'stderr.txt'].filter(file => !fs.existsSync(path.join(run, file)))
    if (missing.length) return { run: name, complete: false, missing }
    const events = readLines(path.join(run, 'events.jsonl'))
    const driver = readLines(path.join(run, 'driver.jsonl'))
    const rows = fs.readFileSync(path.join(run, 'resources.csv'), 'utf8').trim().split(/\r?\n/)
    const keys = rows.shift().split(',')
    const samples = rows.map(line => Object.fromEntries(line.split(',').map((value, index) => [keys[index], ['pids', 'processes'].includes(keys[index]) ? value : Number(value)])))
    const launch = driver.find(event => event.event === 'launch-start')
    const quit = events.find(event => event.event === 'quit')
    const exit = driver.find(event => event.event === 'run-end')
    const idle = phase => {
      const begin = driver.find(event => event.event === `idle-${phase}-start`)
      const end = driver.find(event => event.event === `idle-${phase}-end`)
      return begin && end ? samples.filter(sample => sample.t >= begin.t + 2000 && sample.t <= end.t) : []
    }
    const attempts = driver.filter(event => event.event === 'invoke-start').map(invoke => {
      const trial = events.filter(event => event.trial === invoke.trial)
      const first = event => trial.find(item => item.event === event)
      const capture = first('selection-end')
      const result = first('translate-end')
      const dom = first('dom-result')
      const transport = trial.filter(event => event.event === 'transport-start')
      const expectedSource = invoke.empty ? '' : `Hello baseline world ${Number(invoke.trial.match(/-invoke-(\d+)$/)[1])}.`
      const foregroundSamples = samples.filter(sample => sample.t >= invoke.t && sample.t <= (capture?.t ?? invoke.t))
      return {
        trial: invoke.trial,
        group: invoke.empty ? 'empty' : invoke.trial.endsWith('-invoke-1') ? 'first' : 'warm',
        expectedSource,
        shortcutObserved: !!first('shortcut'),
        captureObserved: !!capture,
        capturedText: capture?.text,
        selectionSource: capture?.source,
        reason: capture?.reason,
        nonemptyCapture: !!capture?.text,
        captureMatchesFixture: capture?.text === expectedSource,
        transportCount: transport.length,
        transportMatchesCapture: transport.every(event => event.source === capture?.text),
        backendSuccess: !!result?.ok,
        historyId: result?.historyId,
        domText: dom?.text,
        domVisible: dom?.visible,
        domMatchesCapture: !!capture?.text && dom?.text === `BENCH_TRANSLATED: ${capture.text}`,
        clipboard: capture ? { text: capture.clipboardRestored, html: capture.htmlRestored, rtf: capture.rtfRestored } : null,
        driverCompleted: driver.some(event => event.event === 'invoke-end' && event.trial === invoke.trial),
        foregroundAtEmission: invoke.foreground,
        sourceWindow: invoke.sourceWindow,
        foregroundSamples: foregroundSamples.length,
        outsideSourceSamples: foregroundSamples.filter(sample => sample.foreground !== invoke.sourceWindow).length,
        observedForegrounds: [...new Set(foregroundSamples.map(sample => sample.foreground))]
      }
    })
    const historyPath = path.join(run, '.translate-app.history.json')
    const history = fs.existsSync(historyPath) ? readJson(historyPath) : []
    const accepted = attempts.filter(attempt => attempt.nonemptyCapture && attempt.backendSuccess && attempt.historyId !== undefined)
    const expectedHistory = accepted.slice(-20).reverse()
    const historyMatches = history.length === expectedHistory.length && history.every((row, index) => String(row.id) === String(expectedHistory[index].historyId) && row.src === expectedHistory[index].capturedText && row.dst === `BENCH_TRANSLATED: ${row.src}` && row.favorite === false)
    const before = idle('before')
    const after = idle('after')
    const created = events.filter(event => event.event === 'window-created')
    const health = events.filter(event => event.event === 'health')
    const intervalCpu = samples.slice(1).flatMap((sample, index) => {
      const prior = samples[index]
      return sample.t > prior.t ? [100 * (sample.cumulativeCpuSeconds - prior.cumulativeCpuSeconds) / ((sample.t - prior.t) / 1000) / logicalProcessors] : []
    })
    return {
      run: name,
      complete: !!exit,
      launch: events.find(event => event.event === 'launcher'),
      popupAppReadyMs: events.find(event => event.event === 'popup-app-ready')?.t - launch.t,
      popupDocumentMs: events.find(event => event.event === 'document-ready' && event.kind === 'popup')?.t - launch.t,
      observerReadyMs: events.find(event => event.event === 'observer-ready')?.t - launch.t,
      exitCode: exit?.exitCode,
      quitObserved: !!quit,
      naturallyExited: !!quit && exit?.exitCode === 0,
      stderrEmpty: fs.readFileSync(path.join(run, 'stderr.txt'), 'utf8').trim().length === 0,
      harnessFailures: [...events.filter(event => event.event === 'harness-failure'), ...driver.filter(event => event.event === 'precondition-failed')],
      attempts,
      history: { count: history.length, expectedCount: expectedHistory.length, matchesLatestSuccessfulCaptures: historyMatches, rows: history.map(({ id, src, dst, favorite }) => ({ id, src, dst, favorite })) },
      windows: { created: created.length, maxLive: Math.max(0, ...health.map(event => event.windows)), ids: created.map(({ kind, id }) => ({ kind, id })) },
      cpu: { logicalProcessors, observedCumulativeSeconds: samples.at(-1)?.cumulativeCpuSeconds, intervalNormalizedPercent: stats(intervalCpu), interpretation: 'Sample-to-sample full-tree CPU delta / wall time / logical CPUs; newly observed child lifetime CPU is charged on discovery, so short-interval maxima are noisy and not a hardware peak.' },
      retained: {
        beforeProcesses: stats(before.map(sample => sample.count)),
        afterProcesses: stats(after.map(sample => sample.count)),
        finalIdleCount: after.at(-1)?.count,
        finalIdleIdentities: after.at(-1)?.processes,
        transientMaxProcesses: Math.max(0, ...samples.map(sample => sample.count))
      },
      idleDurationMs: { before: before.length ? before.at(-1).t - before[0].t : null, after: after.length ? after.at(-1).t - after[0].t : null }
    }
  })
}

function buildReport(folder, baseline, manifest) {
  const measurements = readJson(path.join(folder, 'summary.json'))
  const runs = collectEvidence(folder)
  const attempts = runs.flatMap(run => run.attempts || [])
  const first = attempts.filter(attempt => attempt.group === 'first')
  const warm = attempts.filter(attempt => attempt.group === 'warm')
  const empty = attempts.filter(attempt => attempt.group === 'empty')
  const captured = attempts.filter(attempt => attempt.nonemptyCapture)
  const longRun = runs.find(run => run.run === 'cold-1')
  const before = measurements.idle.find(phase => phase.phase === 'before')
  const after = measurements.idle.find(phase => phase.phase === 'after')
  const baselineAfter = baseline.idle.find(phase => phase.phase === 'after')
  const privateLimit = baselineAfter.privateMiB.p50 + Math.max(baselineAfter.privateMiB.p50 * .15, 30)
  const baselineCpu = Math.max(...baseline.idle.map(phase => phase.normalizedCpuPercent))
  const cpuLimit = Math.max(baselineCpu + .5, 1)
  const checks = []
  const check = (name, pass, observed, limit) => checks.push({ name, pass: !!pass, observed, limit })
  check('Frozen cohort is complete', runs.length === 7 && runs.every(run => run.complete) && first.length === 7 && warm.length === 30 && empty.length === 1 && longRun?.idleDurationMs.before >= 27000 && longRun?.idleDurationMs.after >= 27000, { runs: runs.length, first: first.length, warm: warm.length, empty: empty.length, retainedIdleMs: longRun?.idleDurationMs }, '7 fresh processes/profiles, 30 warm, 1 empty, two 30-second intervals excluding first 2 seconds')
  check('No harness precondition violation', runs.length === 7 && runs.every(run => run.harnessFailures?.length === 0), runs.flatMap(run => run.harnessFailures || []), 'exact owned source HWND before Alt+Q and exact synthetic source before capture/transport logging')
  for (const [field, label] of [['showMs', 'show'], ['domResultMs', 'DOM']]) {
    const value = measurements.summary.firstSuccessful[field].p50
    const reference = baseline.summary.firstSuccessful[field].p50
    check(`First successful ${label} P50 improves`, value < reference, value, reference)
  }
  for (const group of ['warmSuccessful', 'warm']) {
    for (const field of group === 'warm' ? ['showMs'] : ['showMs', 'domResultMs']) {
      for (const quantile of ['p50', 'p95']) {
        const reference = baseline.summary[group][field][quantile]
        const limit = reference + Math.max(reference * .15, 50)
        const value = measurements.summary[group][field][quantile]
        check(`${group} ${field} ${quantile}`, value <= limit, value, limit)
      }
    }
  }
  const coldTimeouts = first.filter(attempt => !attempt.nonemptyCapture)
  const warmTimeouts = warm.filter(attempt => !attempt.nonemptyCapture)
  check('No additional cold capture timeout count', coldTimeouts.length <= 1, coldTimeouts.map(attempt => attempt.trial), 1)
  check('No additional warm capture timeout count', warmTimeouts.length <= 2, warmTimeouts.map(attempt => attempt.trial), 2)
  check('Every nonempty capture reaches its visible result and one transport', captured.length > 0 && captured.every(attempt => attempt.captureMatchesFixture && attempt.transportCount === 1 && attempt.transportMatchesCapture && attempt.backendSuccess && attempt.domMatchesCapture && attempt.domVisible === 'visible' && attempt.historyId !== undefined), captured.length, 'all nonempty captures, exact synthetic source/result, visible DOM, accepted history ID')
  check('All empty captures skip transport, result and history', attempts.filter(attempt => !attempt.nonemptyCapture).every(attempt => attempt.captureObserved && attempt.transportCount === 0 && !attempt.backendSuccess && !attempt.domText && attempt.historyId === undefined), attempts.filter(attempt => !attempt.nonemptyCapture).length, 'no translation or history ID for deliberate empty or copy timeout')
  check('Clipboard text/HTML/RTF restored', attempts.length === 38 && attempts.every(attempt => attempt.clipboard?.text && attempt.clipboard?.html && attempt.clipboard?.rtf), attempts.length, 'all 38 captures')
  check('Every shortcut and attempt observed', attempts.length === 38 && attempts.every(attempt => attempt.shortcutObserved && attempt.captureObserved && attempt.driverCompleted), attempts.length, 38)
  check('Durable history is exactly latest successful captures', runs.length === 7 && runs.every(run => run.history?.matchesLatestSuccessfulCaptures), runs.map(run => ({ run: run.run, count: run.history?.count, expectedCount: run.history?.expectedCount, matches: run.history?.matchesLatestSuccessfulCaptures })), 'newest 20 successful captures per isolated run; no failed/empty capture history')
  check('Idle normalized CPU', before && after && Math.max(before.normalizedCpuPercent, after.normalizedCpuPercent) <= cpuLimit, { before: before?.normalizedCpuPercent, after: after?.normalizedCpuPercent }, cpuLimit)
  check('Steady private MiB', after?.privateMiB.p50 <= privateLimit, after?.privateMiB.p50, privateLimit)
  check('Two created/live windows per run', runs.length === 7 && runs.every(run => run.windows?.created === 2 && run.windows.maxLive === 2), runs.map(run => ({ run: run.run, ...run.windows })), 2)
  check('No retained process growth after 30 warm invocations', longRun?.retained?.beforeProcesses.p50 === 5 && longRun.retained.afterProcesses.p50 === 5 && longRun.retained.afterProcesses.p95 === 5 && longRun.retained.finalIdleCount === 5, longRun?.retained, 'prewarm P50 and after-idle P50/P95/final count = 5; helper transient peak is observation')
  check('Every run exits naturally with code zero', runs.length === 7 && runs.every(run => run.naturallyExited), runs.map(run => ({ run: run.run, exitCode: run.exitCode, quitObserved: run.quitObserved })), 'quit observed and native process exit0 for all seven runs')
  const cohortComplete = checks[0].pass
  for (const item of checks) {
    item.observedComparisonPass = item.pass
    item.status = item.pass ? 'pass' : 'fail'
    if (!cohortComplete) {
      item.pass = false
      item.status = 'unavailable-incomplete-cohort'
    }
  }
  if (!cohortComplete) {
    checks[0].status = 'fail'
    if (runs.some(run => run.harnessFailures?.length)) checks.find(item => item.name === 'No harness precondition violation').status = 'fail'
    if (coldTimeouts.length > 1) checks.find(item => item.name === 'No additional cold capture timeout count').status = 'fail'
    if (warmTimeouts.length > 2) checks.find(item => item.name === 'No additional warm capture timeout count').status = 'fail'
  }
  return {
    manifest,
    protocol: { baselineSource: '6c85be6 (same application code as 75516d6)', cold: 7, warm: 30, empty: 1, idleSeconds: 30, controlledTransportMs: 50, sampler: 'causal-creation-v2', quantiles: 'nearest-rank; 7 first samples have coarse maximum-like P95', resultTiming: 'visible DOM mutation availability, not physical pixel presentation', launch: 'stock Electron loads unchanged production ASAR; frozen Chromium remote-debugging-port=9333, no Node inspector or debugger attachment' },
    cohortComplete,
    acceptanceScope: cohortComplete ? 'complete frozen cohort' : 'incomplete cohort: observed comparisons are retained, but cannot pass frozen acceptance gates',
    allPassed: checks.every(item => item.pass),
    checks,
    failures: attempts.filter(attempt => attempt.group !== 'empty' && !attempt.nonemptyCapture),
    runs,
    measurements
  }
}

if (require.main === module) {
  const [, , folder, baselinePath, manifestPath, outputPath] = process.argv
  if (!folder || !baselinePath || !manifestPath || !outputPath) throw new Error('Usage: node final-evidence.cjs RAW_FOLDER BASELINE_JSON FROZEN_MANIFEST_JSON OUTPUT_JSON')
  const result = buildReport(folder, readJson(baselinePath), readJson(manifestPath))
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ allPassed: result.allPassed, checks: result.checks, output: outputPath }, null, 2))
  if (!result.allPassed) process.exitCode = 1
}

module.exports = { collectEvidence, buildReport }

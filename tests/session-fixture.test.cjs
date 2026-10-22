const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createSessionFixture, roleForModel } = require('../scripts/testing/session-fixture.cjs')
const { createProviderService } = require('../dist-electron/provider-service.cjs')
const { createTranslationSessions } = require('../dist-electron/translation-session.cjs')

for (const scenario of ['single', 'race', 'history', 'flow']) {
  test(`${scenario} fixture remains compatible with provider policy and saves one successful session offline`, async () => {
    const config = createSessionFixture(scenario)
    // The flow branch enables its second engine in settings before its race.
    if (scenario === 'flow') {
      config.providers.openai.enabled = true
      config.raceMode = true
    }
    const requests = [], history = []
    const service = createProviderService({ request(_url, _options, callback) {
      const request = new EventEmitter()
      let body = ''
      request.write = chunk => { body += chunk }
      request.destroy = () => request
      request.end = () => {
        const payload = JSON.parse(body)
        const role = roleForModel(payload.model)
        requests.push({ model: payload.model, role })
        const reply = () => {
          const response = new PassThrough()
          response.statusCode = 200
          callback(response)
          response.end(JSON.stringify({ choices: [{ message: { content: `FIXTURE ${role}` } }] }))
        }
        if (role === 'slow') queueMicrotask(() => queueMicrotask(reply))
        else queueMicrotask(reply)
      }
      return request
    } })
    const engines = Object.entries(config.providers)
      .filter(([, provider]) => provider.enabled)
      .map(([id, provider]) => ({ id, provider }))
    for (const engine of engines) assert.equal(service.inspect(engine.id, engine.provider).available, true)
    const sessions = createTranslationSessions({
      execute: (engine, input) => service.translate(engine.provider, engine.id, input),
      saveHistory: entry => { history.push(entry); return { id: `synthetic-${scenario}` } }
    })
    const result = await sessions.start({ text: 'FIXTURE', target: 'English', mode: config.raceMode ? 'race' : 'single', engine: engines[0], engines }).done
    assert.equal(result.status, 'success')
    assert.deepEqual(requests.map(request => request.model), config.raceMode ? ['deepseek-v4-flash', 'synthetic-slow'] : ['deepseek-v4-flash'])
    assert.deepEqual(result.results.map(item => item.text).sort(), config.raceMode ? ['FIXTURE fast', 'FIXTURE slow'] : ['FIXTURE fast'])
    assert.equal(history.length, 1)
    assert.equal(history[0].result.text, 'FIXTURE fast')
    sessions.dispose()
  })
}

for (const [entry, source, delays] of [
  ['race-ui-smoke.cjs', 'FIXTURE', [25, 120]],
  ['history-ui-smoke.cjs', 'FLOW_RACE', [20, 100]]
]) {
  test(`${entry} transport presents fast/slow roles independently of protocol model names`, async () => {
    // Exercise the actual retained HTTPS replacement at its network seam. Only
    // that assignment is evaluated; the disabled native entry is never run.
    const file = path.join(__dirname, '../scripts/testing', entry)
    const code = fs.readFileSync(file, 'utf8')
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
    const assignment = ast.statements.find(statement => ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) && statement.expression.left.getText(ast) === "require('node:https').request")
    assert.ok(assignment, 'controlled HTTPS replacement must remain independently inspectable')
    const https = {}, tasks = [], replies = []
    vm.runInNewContext(assignment.getText(ast), {
      require: id => { assert.equal(id, 'node:https'); return https },
      EventEmitter, PassThrough, roleForModel, requests: [], abortAttempts: 0,
      setTimeout: (callback, delay) => tasks.push({ callback, delay })
    })
    for (const model of ['deepseek-v4-flash', 'synthetic-slow']) {
      const request = https.request('https://controlled.invalid', {}, response => {
        let body = ''
        response.on('data', chunk => { body += chunk })
        response.on('end', () => replies.push(JSON.parse(body).choices[0].message.content))
      })
      request.write(JSON.stringify({ model, messages: [{ role: 'system', content: 'synthetic' }, { role: 'user', content: source }] }))
      request.end()
    }
    assert.deepEqual(tasks.map(task => task.delay), delays)
    tasks.forEach(task => task.callback())
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(replies, [`${source} fast`, `${source} slow`])
  })
}

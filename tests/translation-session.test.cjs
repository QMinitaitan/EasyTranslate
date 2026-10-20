const test = require('node:test')
const assert = require('node:assert/strict')
const { createTranslationSessions } = require('../dist-electron/translation-session.cjs')
const { createProviderService } = require('../dist-electron/provider-service.cjs')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const engine = { id: 'deepseek', provider: { enabled: true, apiKey: 'synthetic' } }
const request = text => ({ text, target: '中文(简体)', engine })

test('the latest single translation session owns display and history even when an old request ignores cancellation', async () => {
  const old = deferred()
  const saved = []
  const visible = []
  let oldSignal
  const sessions = createTranslationSessions({
    execute: (_engine, input) => {
      if (input.text === 'A') { oldSignal = input.signal; return old.promise }
      return Promise.resolve({ text: 'B 的译文' })
    },
    saveHistory: entry => { saved.push(entry.text); return { id: 101 } }
  })
  sessions.subscribe(snapshot => {
    if (snapshot.status === 'success') visible.push(snapshot.result.text)
  })
  const a = sessions.start(request('A'))
  const b = sessions.start(request('B'))
  assert.equal(oldSignal.aborted, true)
  assert.equal((await a.done).status, 'superseded')
  assert.equal((await b.done).result.text, 'B 的译文')
  old.resolve({ text: 'A 的迟到译文' })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(visible, ['B 的译文'])
  assert.deepEqual(saved, ['B'])
  assert.equal(sessions.current().sessionId, b.sessionId)
  sessions.dispose()
})

test('a replacement accepted while success is presented prevents the superseded automatic history write', async () => {
  const saved = []
  let next
  const sessions = createTranslationSessions({
    execute: async (_engine, input) => ({ text: `${input.text} 的译文` }),
    saveHistory: entry => { saved.push(entry.text); return { id: 201 } }
  })
  sessions.subscribe(snapshot => {
    if (snapshot.status === 'success' && snapshot.text === 'A') next = sessions.start(request('B'))
  })
  const previous = sessions.start(request('A'))
  await previous.done
  await next.done
  assert.deepEqual(saved, ['B'])
  sessions.dispose()
})

test('late failure from a superseded request does not replace the current success', async () => {
  const old = deferred()
  const visible = []
  const sessions = createTranslationSessions({
    execute: (_engine, input) => input.text === 'A' ? old.promise : Promise.resolve({ text: 'B 成功' }),
    saveHistory: () => ({ id: 301 })
  })
  sessions.subscribe(snapshot => visible.push(snapshot.status))
  const a = sessions.start(request('A'))
  const b = sessions.start(request('B'))
  await b.done
  const before = [...visible]
  old.reject(new Error('迟到的网络故障'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await a.done).status, 'superseded')
  assert.deepEqual(visible, before)
  assert.equal(sessions.current().result.text, 'B 成功')
  sessions.dispose()
})

test('empty translations and missing configuration never qualify for automatic history', async () => {
  const saved = []
  const sessions = createTranslationSessions({
    execute: async () => ({ text: ' \n ' }),
    saveHistory: entry => { saved.push(entry); return { id: 401 } }
  })
  const emptyOutput = await sessions.start(request('source')).done
  assert.equal(emptyOutput.status, 'error')
  assert.equal(emptyOutput.result.error, '翻译引擎返回空译文')
  const missing = await sessions.start({ text: 'source', target: 'English' }).done
  assert.equal(missing.status, 'error')
  assert.match(missing.result.error, /未配置/)
  const noSelection = await sessions.start(request('')).done
  assert.equal(noSelection.status, 'empty')
  assert.deepEqual(saved, [])
  sessions.dispose()
})

test('completed history survives replacements, with one automatic entry per successful single session', async () => {
  const saved = []
  const sessions = createTranslationSessions({
    execute: async (_engine, input) => ({ text: `${input.text} 译文` }),
    saveHistory: entry => { saved.push(entry.text); return { id: 500 + saved.length } }
  })
  const a = await sessions.start(request('A')).done
  const b = await sessions.start(request('B')).done
  assert.equal(a.result.historyId, 501)
  assert.equal(b.result.historyId, 502)
  assert.deepEqual(saved, ['A', 'B'])
  sessions.dispose()
})

test('translation success is observable before saving and a failed save does not invent a history id', async () => {
  const persistence = deferred()
  const visible = []
  const sessions = createTranslationSessions({
    execute: async () => ({ text: '可展示的译文' }),
    saveHistory: () => persistence.promise
  })
  sessions.subscribe(snapshot => {
    if (snapshot.status === 'success') visible.push(snapshot.result.text)
  })
  const current = sessions.start(request('source'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(visible, ['可展示的译文'])
  persistence.reject(new Error('synthetic disk failure'))
  const completed = await current.done
  assert.equal(completed.status, 'success')
  assert.equal(completed.result.text, '可展示的译文')
  assert.equal(completed.result.historyId, undefined)
  assert.equal(completed.result.historyError, '翻译成功，但历史保存失败')
  sessions.dispose()
})

test('a queued storage adapter can recheck current-session eligibility before writing', async () => {
  const queued = deferred()
  const saved = []
  const sessions = createTranslationSessions({
    execute: async (_engine, input) => ({ text: `${input.text} 译文` }),
    saveHistory: async entry => {
      if (entry.text === 'A') await queued.promise
      if (!entry.isCurrent()) return null
      saved.push(entry.text)
      return { id: 601 }
    }
  })
  const a = sessions.start(request('A'))
  await new Promise(resolve => setImmediate(resolve))
  await sessions.start(request('B')).done
  queued.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await a.done).status, 'superseded')
  assert.deepEqual(saved, ['B'])
  sessions.dispose()
})

test('empty intent and disposal release current work and subscriptions without publishing late results', async () => {
  const pending = deferred()
  let signal
  let notifications = 0
  const saved = []
  const sessions = createTranslationSessions({
    execute: (_engine, input) => { signal = input.signal; return pending.promise },
    saveHistory: entry => { saved.push(entry); return { id: 701 } }
  })
  const unsubscribe = sessions.subscribe(() => { notifications++ })
  const current = sessions.start(request('A'))
  const empty = await sessions.start(request('')).done
  assert.equal(signal.aborted, true)
  assert.equal((await current.done).status, 'superseded')
  assert.equal(empty.status, 'empty')
  unsubscribe()
  const before = notifications
  sessions.dispose()
  pending.resolve({ text: '迟到' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(notifications, before)
  assert.equal(sessions.current(), null)
  assert.deepEqual(saved, [])
})

test('session replacement reaches the actual adapter transport cancellation boundary', async () => {
  const requests = []
  const saved = []
  const providerService = createProviderService({
    request: (_url, _options, callback) => {
      const transport = new EventEmitter()
      const record = { destroyed: false, body: '', transport }
      requests.push(record)
      transport.write = body => { record.body += body }
      transport.destroy = () => { record.destroyed = true }
      transport.end = () => {
        const source = JSON.parse(record.body).messages[1].content
        if (source === 'A') return
        queueMicrotask(() => {
          const response = new PassThrough()
          response.statusCode = 200
          callback(response)
          response.end(JSON.stringify({ choices: [{ message: { content: 'B via adapter' } }] }))
        })
      }
      return transport
    }
  })
  const sessions = createTranslationSessions({
    execute: (selected, input) => providerService.translate(selected.provider, selected.id, input),
    saveHistory: entry => { saved.push(entry.text); return { id: 801 } }
  })
  const a = sessions.start(request('A'))
  const b = sessions.start(request('B'))
  assert.equal((await a.done).status, 'superseded')
  assert.equal((await b.done).result.text, 'B via adapter')
  assert.equal(requests[0].destroyed, true)
  assert.deepEqual(saved, ['B'])
  sessions.dispose()
})

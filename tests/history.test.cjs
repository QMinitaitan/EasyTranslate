const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHistoryStore } = require('../dist-electron/history-store.cjs')
const { createTranslationSessions } = require('../dist-electron/translation-session.cjs')

const entry = (src, extra = {}) => ({ src, dst: `${src} translation`, engine: 'DeepSeek', color: '#6366f1', lang: 'English', ts: 100, ...extra })

test('history retains legacy ids, fields and favorites through durable mutations and consistent notifications', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-history-'))
  const filePath = path.join(directory, 'history.json')
  fs.writeFileSync(filePath, JSON.stringify([{ ...entry('old'), id: 'legacy-1', favorite: true, custom: { preserved: 1 } }]))
  const history = createHistoryStore({ filePath })
  const changes = []
  history.subscribe(items => changes.push(items))
  assert.equal(history.load()[0].id, 'legacy-1')
  const added = await history.add(entry('new', { ts: 200 }))
  await history.setFavorite(added.id, true)
  await history.setFavorite(added.id, false)
  await history.remove(added.id)
  assert.deepEqual(history.load(), [{ ...entry('old'), id: 'legacy-1', favorite: true, custom: { preserved: 1 } }])
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), history.load())
  assert.equal(changes.length, 4)
  assert.deepEqual(changes.at(-1), history.load())
  await history.clearAll()
  assert.deepEqual(history.load(), [])
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), [])
  assert.equal(changes.length, 5)
  await history.flush()
  fs.rmSync(directory, { recursive: true, force: true })
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('serialized mutations read once, preserve overlapping edits and notify every subscriber only after durable commit', async () => {
  const gate = deferred()
  let reads = 0, disk = null, writes = 0
  const store = createHistoryStore({ storage: {
    read() { reads++; return disk },
    async write(contents) { if (++writes === 1) await gate.promise; disk = contents }
  } })
  const left = [], right = []
  store.subscribe(items => { left.push(items); throw new Error('renderer gone') })
  const off = store.subscribe(items => right.push(items))
  const first = store.add(entry('first'))
  const second = store.add(entry('second'))
  await tick()
  assert.deepEqual(store.load(), [])
  assert.equal(left.length, 0)
  gate.resolve()
  const [a, b] = await Promise.all([first, second])
  assert.notEqual(a.id, b.id)
  assert.equal(reads, 1)
  assert.equal(left.length, 2)
  assert.deepEqual(left, right)
  assert.equal(JSON.parse(disk).length, 2)
  await store.setFavorite(a.id, false)
  await store.remove('nonexistent')
  assert.equal(writes, 2)
  off()
  await store.clearAll()
  assert.equal(right.length, 2)
  await store.flush()
})

test('favorites are unbounded while only the newest twenty nonfavorites survive, including after unfavorite', async () => {
  const store = createHistoryStore({ storage: { read: () => null, write: async () => {} } })
  for (let i = 0; i < 25; i++) await store.add(entry(`favorite-${i}`, { favorite: true, ts: i }))
  for (let i = 0; i < 25; i++) await store.add(entry(`recent-${i}`, { ts: 100 + i }))
  assert.equal(store.load().filter(item => item.favorite).length, 25)
  assert.deepEqual(store.load().filter(item => !item.favorite).map(item => item.src), Array.from({ length: 20 }, (_, i) => `recent-${24 - i}`))
  const oldestFavorite = store.load().find(item => item.src === 'favorite-0')
  assert.equal(await store.setFavorite(oldestFavorite.id, false), null)
  assert.equal(store.load().length, 44)
  assert.ok(!store.load().some(item => item.id === oldestFavorite.id))
})

test('write failure preserves the durable cache, reports a safe error and permits a later retry without a false id', async () => {
  let fail = true, disk = null
  const errors = [], notifications = []
  const store = createHistoryStore({ storage: { read: () => disk, write: async contents => {
    if (fail) throw new Error('SECRET path/provider contents')
    disk = contents
  } } })
  store.subscribeErrors(message => errors.push(message))
  store.subscribe(items => notifications.push(items))
  await assert.rejects(store.add(entry('failed')), /历史保存失败/)
  assert.deepEqual(store.load(), [])
  assert.equal(disk, null)
  assert.equal(notifications.length, 0)
  assert.equal(errors.length, 1)
  assert.ok(!errors[0].includes('SECRET'))
  fail = false
  const saved = await store.add(entry('retry'))
  assert.ok(saved.id)
  assert.deepEqual(JSON.parse(disk), store.load())
  assert.equal(notifications.length, 1)
})

test('unreadable or malformed old data is protected against every mutation', async () => {
  for (const read of [() => { throw new Error('access denied') }, () => '{broken', () => '{}', () => JSON.stringify([{ id: 1, src: 'incomplete' }])]) {
    let writes = 0
    const store = createHistoryStore({ storage: { read, write: async () => { writes++ } } })
    assert.throws(() => store.load(), /历史读取失败/)
    await assert.rejects(store.add(entry('new')), /未覆盖原文件/)
    await assert.rejects(store.clearAll(), /未覆盖原文件/)
    await assert.rejects(store.setFavorite(1, true), /未覆盖原文件/)
    assert.equal(writes, 0)
  }
})

test('the real session and history queue reject stale automatic entries while retaining earlier completed history', async () => {
  const gate = deferred()
  let hold = false, disk = null
  const history = createHistoryStore({ storage: { read: () => disk, write: async (contents, isCurrent) => {
    if (hold) { hold = false; await gate.promise }
    if (!isCurrent()) return false
    disk = contents
    return true
  } } })
  const sessions = createTranslationSessions({
    execute: async (_engine, input) => ({ text: `${input.text} translated` }),
    saveHistory: value => history.add(entry(value.text), { isCurrent: value.isCurrent })
  })
  const engine = { id: 'deepseek', provider: { enabled: true, apiKey: 'fixture' } }
  const start = text => sessions.start({ text, target: 'English', engine })
  await start('completed').done
  hold = true
  const blocker = history.add(entry('manual favorite', { favorite: true }))
  await tick()
  const stale = start('A')
  await tick()
  const current = start('B')
  await tick()
  gate.resolve()
  await blocker
  await current.done
  assert.equal((await stale.done).status, 'superseded')
  assert.deepEqual(new Set(history.load().map(item => item.src)), new Set(['completed', 'manual favorite', 'B']))
  assert.deepEqual(JSON.parse(disk), history.load())
  sessions.dispose()
})

test('a race saves only its first success through the real store and a failed durable save remains a translation success', async () => {
  let writes = 0
  const history = createHistoryStore({ storage: { read: () => null, write: async () => { writes++; throw new Error('disk full') } } })
  const later = deferred()
  const sessions = createTranslationSessions({
    execute: engine => engine.id === 'first' ? Promise.resolve({ text: 'first valid' }) : later.promise,
    saveHistory: value => history.add(entry(value.text), { isCurrent: value.isCurrent })
  })
  const race = sessions.start({ text: 'race', target: 'English', mode: 'race', engines: ['first', 'later'].map(id => ({ id, provider: {} })) })
  await tick()
  assert.equal(sessions.current().result.text, 'first valid')
  later.resolve({ text: 'later comparison' })
  const done = await race.done
  assert.equal(done.status, 'success')
  assert.equal(done.results.length, 2)
  assert.equal(done.result.historyId, undefined)
  assert.match(done.result.historyError, /历史保存失败/)
  assert.equal(writes, 1)
  assert.deepEqual(history.load(), [])
  sessions.dispose()
})

test('the file adapter rechecks current ownership after its asynchronous temporary write and leaves no stale entry', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-history-current-'))
  const filePath = path.join(directory, 'history.json')
  const gate = deferred()
  const started = deferred()
  const originalWrite = fs.promises.writeFile
  let current = true
  fs.promises.writeFile = async (target, ...args) => {
    const result = await originalWrite(target, ...args)
    if (String(target).startsWith(filePath + '.')) { started.resolve(); await gate.promise }
    return result
  }
  try {
    const history = createHistoryStore({ filePath })
    const pending = history.add(entry('stale during temporary write'), { isCurrent: () => current })
    await started.promise
    current = false
    gate.resolve()
    assert.equal(await pending, null)
    assert.deepEqual(history.load(), [])
    assert.deepEqual(fs.readdirSync(directory), [])
  } finally {
    gate.resolve()
    fs.promises.writeFile = originalWrite
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('flush includes mutations queued by a completed durable notification', async () => {
  const first = deferred(), second = deferred()
  let writes = 0
  const history = createHistoryStore({ storage: { read: () => null, write: async () => {
    if (++writes === 1) await first.promise
    else await second.promise
  } } })
  let appended
  const off = history.subscribe(items => {
    if (items.length === 1) appended = history.add(entry('appended'))
  })
  const initial = history.add(entry('initial'))
  const flush = history.flush()
  let flushed = false
  flush.then(() => { flushed = true })
  first.resolve()
  await initial
  await tick()
  assert.equal(flushed, false)
  second.resolve()
  await flush
  await appended
  assert.equal(history.load().length, 2)
  off()
})

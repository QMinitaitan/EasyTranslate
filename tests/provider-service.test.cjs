const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { createProviderService } = require('../dist-electron/provider-service.cjs')

const configured = { enabled: true, apiKey: 'synthetic-test-key' }

function transportFixture(reply) {
  const calls = []
  return {
    calls,
    request(url, options, callback) {
      const request = new EventEmitter()
      const call = { url: String(url), options, body: '', request, destroyed: false }
      calls.push(call)
      request.write = value => { call.body += value }
      request.end = () => queueMicrotask(() => {
        if (reply === null) return
        const response = new PassThrough()
        response.statusCode = reply.status || 200
        callback(response)
        response.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body))
      })
      request.destroy = () => { call.destroyed = true }
      return request
    }
  }
}

test('capabilities reject placeholders and require explicit compatible configuration for Bing and Google', () => {
  const service = createProviderService()
  assert.equal(service.inspect('youdao', configured).status, 'unsupported')
  assert.match(service.inspect('youdao', configured).protocol, /未实现/)
  assert.equal(service.inspect('bing', configured).status, 'missing-configuration')
  assert.equal(service.inspect('google', { ...configured, endpoint: 'https://compatible.example', model: 'test-model' }).available, true)
  assert.match(service.inspect('google', configured).protocol, /OpenAI-compatible/)
  assert.match(service.inspect('google', configured).protocol, /非官方/)
  assert.equal(service.inspect('openai', configured).available, true)
  assert.equal(service.inspect('openai', { ...configured, enabled: false }).status, 'disabled')
  assert.equal(service.inspect('deepseek', { enabled: true, apiKey: '' }).status, 'missing-configuration')
})

test('OpenAI-compatible execution uses its actual protocol and OpenAI defaults instead of DeepSeek routing', async () => {
  const transport = transportFixture({ body: { choices: [{ message: { content: '  你好  ' } }] } })
  const service = createProviderService({ request: transport.request })
  const result = await service.translate(configured, 'openai', { text: 'Hello', target: '中文(简体)' })
  assert.equal(result.text, '你好')
  assert.equal(transport.calls[0].url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(transport.calls[0].options.headers.Authorization, 'Bearer synthetic-test-key')
  assert.deepEqual(JSON.parse(transport.calls[0].body), {
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: '请将以下文本翻译为中文(简体),仅输出译文:' }, { role: 'user', content: 'Hello' }],
    temperature: 0.3,
    stream: false
  })
})

test('DeepL execution preserves its endpoint, authentication and target-language payload', async () => {
  const transport = transportFixture({ body: { translations: [{ text: 'こんにちは' }] } })
  const service = createProviderService({ request: transport.request })
  const result = await service.translate(configured, 'deepl', { text: 'Hello', target: '日本語' })
  assert.equal(result.text, 'こんにちは')
  assert.equal(transport.calls[0].url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(transport.calls[0].options.headers.Authorization, 'DeepL-Auth-Key synthetic-test-key')
  assert.deepEqual(JSON.parse(transport.calls[0].body), { text: ['Hello'], target_lang: 'JA' })
})

test('a stalled engine times out, destroys the request, and exposes no response or credential detail', async () => {
  const transport = transportFixture(null)
  const service = createProviderService({ request: transport.request, timeoutMs: 5 })
  await assert.rejects(Promise.race([
    service.translate(configured, 'openai', { text: 'Hello' }),
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('test deadline'), { code: 'test-deadline' })), 60))
  ]), { code: 'timeout' })
  assert.equal(transport.calls[0].destroyed, true)
})

test('session cancellation stops an active request and already-aborted work never reaches transport', async () => {
  const transport = transportFixture(null)
  const service = createProviderService({ request: transport.request, timeoutMs: 80 })
  const controller = new AbortController()
  const pending = service.translate(configured, 'deepseek', { text: 'old session', signal: controller.signal })
  controller.abort('private reason must not be surfaced')
  await assert.rejects(pending, { code: 'cancelled', message: '翻译请求已取消' })
  assert.equal(transport.calls[0].destroyed, true)
  await assert.rejects(service.translate(configured, 'deepseek', { text: 'old session', signal: controller.signal }), { code: 'cancelled' })
  assert.equal(transport.calls.length, 1)
})

test('engine probes report an actual adapter attempt and never pretend unsupported or incomplete engines succeeded', async () => {
  const transport = transportFixture({ body: { choices: [{ message: { content: '你好' } }] } })
  const service = createProviderService({ request: transport.request })
  assert.equal((await service.probe('openai', configured)).ok, true)
  assert.equal((await service.probe('youdao', configured)).status, 'unsupported')
  assert.equal((await service.probe('bing', configured)).status, 'missing-configuration')
  assert.equal(transport.calls.length, 1)
  assert.equal(JSON.parse(transport.calls[0].body).messages[1].content, 'Hello')
})

test('failed probes distinguish HTTP, malformed responses, empty output and network failures without exposing secrets', async () => {
  const cases = [
    [{ status: 401, body: { detail: 'synthetic-test-key and private provider payload' } }, 'http-error'],
    [{ body: '{not valid JSON synthetic-test-key' }, 'invalid-response'],
    [{ body: { choices: [{ message: { content: 42 } }] } }, 'invalid-response'],
    [{ body: { choices: [{ message: { content: '  ' } }] } }, 'empty-result']
  ]
  for (const [reply, expected] of cases) {
    const transport = transportFixture(reply)
    const result = await createProviderService({ request: transport.request }).probe('openai', configured)
    assert.equal(result.ok, false)
    assert.equal(result.status, expected)
    assert.doesNotMatch(JSON.stringify(result), /synthetic-test-key|private provider payload|not valid JSON/)
  }
  const result = await createProviderService({ request: () => { throw new Error('network synthetic-test-key') } }).probe('openai', configured)
  assert.equal(result.status, 'network-error')
  assert.doesNotMatch(JSON.stringify(result), /synthetic-test-key/)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { DEFAULTS } = require('../dist-electron/config-store.cjs')
const { providerWithPreset, PROMPT_PRESETS } = require('../dist-electron/prompt-presets.cjs')
const { createProviderService } = require('../dist-electron/provider-service.cjs')
const { parseTranslationRequest, parseRaceRequest } = require('../dist-electron/shared/ipc-contract.cjs')

test('all compatible engines use the saved global text, substitute target and keep source in its own user message', async () => {
  const config = structuredClone(DEFAULTS)
  config.promptPresets.concise.prompt = 'SYNTHETIC {{target}} / {{target}}'
  config.selectedPromptPreset = 'concise'
  const bodies = []
  const service = createProviderService({ request(url, options, callback) {
    const request = new EventEmitter()
    request.write = body => bodies.push(JSON.parse(body))
    request.destroy = () => {}
    request.end = () => queueMicrotask(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify({ choices: [{ message: { content: 'SYNTHETIC RESULT' } }] }))
    })
    return request
  } })
  for (const id of ['deepseek', 'openai', 'bing', 'google']) {
    config.providers[id] = {
      enabled: true, apiKey: 'synthetic-key', endpoint: 'https://synthetic.invalid',
      model: id === 'deepseek' ? 'deepseek-v4-flash' : 'synthetic-model', prompt: 'SYNTHETIC OLD PROVIDER PROMPT'
    }
    const provider = providerWithPreset(config, id)
    await service.translate(provider, id, { text: 'SYNTHETIC SOURCE', target: 'English' })
    assert.deepEqual(bodies.at(-1).messages, [
      { role: 'system', content: 'SYNTHETIC English / English' },
      { role: 'user', content: 'SYNTHETIC SOURCE' }
    ])
    assert.equal(config.providers[id].prompt, 'SYNTHETIC OLD PROVIDER PROMPT')
  }
  assert.equal(bodies.length, 4)
})

test('preset resolution snapshots text, respects explicit selection, and leaves non-prompt engines unchanged', () => {
  const config = structuredClone(DEFAULTS)
  const snapshot = providerWithPreset(config, 'openai', 'natural')
  config.promptPresets.natural.prompt = 'SYNTHETIC LATER EDIT'
  assert.equal(snapshot.prompt, PROMPT_PRESETS.natural.prompt)
  assert.deepEqual(providerWithPreset(config, 'deepl'), config.providers.deepl)
  assert.throws(() => providerWithPreset(config, 'openai', 'missing'), /提示词预设不存在/)
  assert.throws(() => providerWithPreset(config, 'openai', 'constructor'), /提示词预设不存在/)
})

test('both translation contracts validate preset identity before session admission', () => {
  for (const parse of [parseTranslationRequest, parseRaceRequest]) {
    for (const promptPresetId of [42, null, {}, '', []]) assert.equal(parse({ text: 'Synthetic', promptPresetId }), null)
    assert.equal(parse({ text: 'Synthetic', promptPresetId: 'concise' }).promptPresetId, 'concise')
    assert.equal(parse({ text: 'Synthetic' }).promptPresetId, undefined)
  }
})

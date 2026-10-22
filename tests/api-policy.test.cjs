const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { createProviderService } = require('../dist-electron/provider-service.cjs')
const { getProvider } = require('../dist-electron/providers.cjs')

test('DeepSeek permits only flash and rejects pro and aliases before transport or probes', async () => {
  let calls = 0
  const service = createProviderService({ request() { calls++; throw new Error('transport must not run') } })
  const configured = { enabled: true, apiKey: 'synthetic-policy-key' }
  assert.deepEqual(getProvider('deepseek').models, ['deepseek-v4-flash'])
  assert.equal(service.inspect('deepseek', configured).available, true)
  for (const [id, config] of [
    ['deepseek', { ...configured, model: 'deepseek-v4-pro' }],
    ['deepseek', { ...configured, model: 'unknown-alias' }],
    ['openai', { ...configured, model: 'deepseek-v4-pro', endpoint: 'https://relay.invalid' }],
    ['openai', { ...configured, endpoint: 'https://api.deepseek.com' }]
  ]) {
    assert.equal(service.inspect(id, config).available, false)
    await assert.rejects(service.translate(config, id, { text: 'synthetic' }), { code: 'missing-configuration' })
    const probe = await service.probe(id, config)
    assert.equal(probe.ok, false)
    assert.doesNotMatch(JSON.stringify(probe), /synthetic-policy-key/)
  }
  assert.equal(calls, 0)
})

test('offline guard blocks native sockets, HTTPS, fetch and inherited Node children', async () => {
  // Run in a child so this assertion cannot alter the surrounding test runner.
  const guard = path.resolve(__dirname, '../scripts/testing/block-network.cjs')
  const script = `
    const assert = require('node:assert/strict');
    const expected = { code: 'EASY_TEST_NETWORK_BLOCKED' };
    assert.throws(() => require('node:net').connect(443, 'example.invalid'), expected);
    assert.throws(() => require('node:https').request('https://example.invalid'), expected);
    assert.rejects(fetch('https://example.invalid'), expected).catch(() => process.exitCode = 1);
    const child = require('node:child_process').spawnSync(process.execPath, ['-e',
      "try { require('node:net').connect(443, 'example.invalid'); process.exit(2) } catch (e) { process.exit(e.code === 'EASY_TEST_NETWORK_BLOCKED' ? 0 : 3) }"]);
    assert.equal(child.status, 0);
  `
  const child = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(guard)}` }, encoding: 'utf8'
  })
  assert.equal(child.status, 0, child.stderr)
})

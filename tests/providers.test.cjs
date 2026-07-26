const test = require('node:test')
const assert = require('node:assert/strict')
const { getAll } = require('../electron/providers.cjs')

test('provider metadata never ships credentials', () => {
  for (const provider of getAll()) {
    assert.equal(provider.apiKey || '', '', `${provider.id} contains a default API key`)
    assert.equal(provider.secret || '', '', `${provider.id} contains a default secret`)
  }
})

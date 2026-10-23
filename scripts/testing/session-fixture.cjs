const template = require('./session-fixture.json')

function createSessionFixture(scenario) {
  if (!['single', 'race', 'history', 'flow'].includes(scenario)) throw new Error('Unknown synthetic session scenario')
  const config = structuredClone(template)
  config.raceMode = scenario === 'race'
  config.providers.openai.enabled = config.raceMode
  return config
}

// Protocol models follow provider policy; semantic roles control fixture timing
// and display. No response or timing assertion treats a model name as a label.
function roleForModel(model) {
  if (model === template.providers.deepseek.model) return 'fast'
  if (model === template.providers.openai.model) return 'slow'
  throw new Error('Unexpected synthetic session model')
}

module.exports = { createSessionFixture, roleForModel }

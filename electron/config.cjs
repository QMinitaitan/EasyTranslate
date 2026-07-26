const path = require('path')
const fs = require('fs')
const { getAll } = require('./providers.cjs')

const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.translate-app.config.json')

function buildProviderDefaults() {
  const defaults = {}
  for (const p of getAll()) {
    const cfg = {
      enabled: p.enabled,
      apiKey: p.apiKey || ''
    }
    if (p.hasEndpoint) cfg.endpoint = p.endpoint || ''
    if (p.hasRegion) cfg.region = p.region || 'eastasia'
    if (p.hasModel) cfg.model = p.model || ''
    if (p.hasPrompt) cfg.prompt = p.prompt || ''
    if (p.hasSecret) cfg.secret = p.secret || ''
    defaults[p.id] = cfg
  }
  return defaults
}

const DEFAULTS = {
  providers: buildProviderDefaults(),
  target: '中文(简体)',
  closeAction: 'tray',
  launchToTray: false,
  autoLaunch: false,
  raceMode: true,
  shortcut: 'Alt+Q',
  shortcuts: {
    translate: 'Alt+Q',
    input: 'Alt+D',
    show: 'Alt+E'
  }
}

function load() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
      const user = JSON.parse(raw)
      return { ...DEFAULTS, ...user, providers: { ...DEFAULTS.providers, ...(user.providers || {}) } }
    }
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULTS))
}

function save(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
  } catch (e) { /* ignore */ }
}

module.exports = { load, save, CONFIG_PATH, DEFAULTS }

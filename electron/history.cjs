const path = require('path')
const fs = require('fs')

const HISTORY_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.translate-app.history.json')
const MAX_ITEMS = 20

function load() {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const items = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
      return items.sort((a, b) => b.ts - a.ts)
    }
  } catch (_) {}
  return []
}

function save(items) {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2))
  } catch (_) {}
}

let _idSeq = 0
function nextId() {
  _idSeq++
  return Date.now() * 1000 + (_idSeq % 1000)
}

function add(entry) {
  const items = load()
  entry.id = nextId()
  items.unshift(entry)
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS
  save(items)
  return items
}

function remove(id) {
  let items = load()
  items = items.filter(i => i.id !== id)
  save(items)
  return items
}

function clearAll() {
  save([])
  return []
}

module.exports = { load, add, remove, clearAll }

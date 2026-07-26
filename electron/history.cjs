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
  const item = { favorite: false, ...entry, id: nextId() }
  items.unshift(item)
  const favorites = items.filter(i => i.favorite)
  const recent = items.filter(i => !i.favorite).slice(0, MAX_ITEMS)
  save([...favorites, ...recent].sort((a, b) => b.ts - a.ts))
  return item
}

function setFavorite(id, favorite) {
  const items = load()
  const item = items.find(i => i.id === id)
  if (!item) return null
  item.favorite = !!favorite
  save(items)
  return item
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

module.exports = { load, add, setFavorite, remove, clearAll }

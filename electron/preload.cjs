const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  isPopup: () => window.location.hash.includes('/popup') && window.location.hash.includes('window=popup'),
  triggerTranslate: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('translate:trigger', handler)
    return () => ipcRenderer.removeListener('translate:trigger', handler)
  },
  translate: (text, target, providerId) => ipcRenderer.invoke('translate:do', { text, target, providerId }),
  startRaceTranslate: (text, target, requestId) => ipcRenderer.send('translate:race:start', { text, target, requestId }),
  onRaceProgress: (cb) => {
    const handler = (_e, result) => cb(result)
    ipcRenderer.on('translate:race:progress', handler)
    return () => ipcRenderer.removeListener('translate:race:progress', handler)
  },
  onRaceDone: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('translate:race:done', handler)
    return () => ipcRenderer.removeListener('translate:race:done', handler)
  },
  loadConfig: () => ipcRenderer.invoke('config:load'),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  getAutoLaunch: () => ipcRenderer.invoke('autostart:get'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  resetPopupBounds: () => ipcRenderer.invoke('popup:bounds:reset'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  loadShortcuts: () => ipcRenderer.invoke('shortcuts:load'),
  saveShortcuts: (shortcuts) => ipcRenderer.invoke('shortcuts:save', shortcuts),
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveFavorite: (payload) => ipcRenderer.invoke('history:favorite', payload),
  setFavorite: (id, favorite) => ipcRenderer.invoke('history:favorite:set', id, favorite),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  onHistoryUpdate: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('history:updated', handler)
    return () => ipcRenderer.removeListener('history:updated', handler)
  },
  openSettings: () => ipcRenderer.send('settings:open'),
  openMain: () => ipcRenderer.send('main:open'),
  onNavigate: (cb) => {
    const handler = (_e, path) => cb(path)
    ipcRenderer.on('main:navigate', handler)
    return () => ipcRenderer.removeListener('main:navigate', handler)
  },
  closePopup: () => ipcRenderer.send('popup:close'),
  pinPopup: (on) => ipcRenderer.send('popup:pin', on),
  movePopup: (dx, dy) => ipcRenderer.send('popup:move', { dx, dy }),
  dismissPopup: () => ipcRenderer.send('popup:dismiss')
})

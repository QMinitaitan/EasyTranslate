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
  startRaceTranslate: (text, target) => ipcRenderer.send('translate:race:start', { text, target }),
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
  loadShortcuts: () => ipcRenderer.invoke('shortcuts:load'),
  saveShortcuts: (shortcuts) => ipcRenderer.invoke('shortcuts:save', shortcuts),
  loadHistory: () => ipcRenderer.invoke('history:load'),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  onHistoryUpdate: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('history:updated', handler)
    return () => ipcRenderer.removeListener('history:updated', handler)
  },
  openSettings: () => ipcRenderer.send('settings:open'),
  closePopup: () => ipcRenderer.send('popup:close'),
  pinPopup: (on) => ipcRenderer.send('popup:pin', on),
  movePopup: (dx, dy) => ipcRenderer.send('popup:move', { dx, dy }),
  dismissPopup: () => ipcRenderer.send('popup:dismiss')
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  isPopup: () => window.location.hash.includes('/popup') && window.location.hash.includes('window=popup'),
  triggerTranslate: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('translate:trigger', handler)
    return () => ipcRenderer.removeListener('translate:trigger', handler)
  },
  translate: (text, target) => ipcRenderer.invoke('translate:do', { text, target }),
  raceTranslate: (text, target) => ipcRenderer.invoke('translate:race', { text, target }),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  openSettings: () => ipcRenderer.send('settings:open'),
  closePopup: () => ipcRenderer.send('popup:close'),
  pinPopup: (on) => ipcRenderer.send('popup:pin', on),
  movePopup: (dx, dy) => ipcRenderer.send('popup:move', { dx, dy }),
  dismissPopup: () => ipcRenderer.send('popup:dismiss')
})

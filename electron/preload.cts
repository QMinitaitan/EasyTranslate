import { contextBridge, ipcRenderer } from 'electron'
import type { EasyTranslateApi, EventChannels, InvokeChannels, RaceRequest, SendChannels, TranslationRequest } from './shared/ipc-contract.cjs'

// Type-only shared imports disappear: Electron sandbox preloads cannot require local modules.
function invoke<C extends keyof InvokeChannels>(channel: C, ...args: InvokeChannels[C]['args']): Promise<InvokeChannels[C]['result']> {
  return ipcRenderer.invoke(channel, ...args)
}

function send<C extends keyof SendChannels>(channel: C, ...args: SendChannels[C]): void {
  ipcRenderer.send(channel, ...args)
}

function on<C extends keyof EventChannels>(channel: C, cb: (payload: EventChannels[C]) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: EventChannels[C]) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: EasyTranslateApi = {
  platform: process.platform,
  isPopup: () => window.location.hash.includes('/popup') && window.location.hash.includes('window=popup'),
  triggerTranslate: (cb) => on('translate:trigger', cb),
  translate: (input: string | TranslationRequest, target?: string, providerId?: string | null) =>
    invoke('translate:do', typeof input === 'string' ? { text: input, target, providerId } : input),
  cancelTranslation: () => send('translate:cancel'),
  startRaceTranslate: (input: string | RaceRequest, target?: string, requestId?: string) =>
    send('translate:race:start', typeof input === 'string' ? { text: input, target, requestId } : input),
  onRaceProgress: (cb) => on('translate:race:progress', cb),
  onRaceDone: (cb) => on('translate:race:done', cb),
  loadConfig: () => invoke('config:load'),
  listProviders: () => invoke('providers:list'),
  providerCapabilities: (config) => invoke('providers:capabilities', config),
  testProvider: (providerId, config) => invoke('providers:probe', { providerId, config }),
  saveConfig: (cfg) => invoke('config:save', cfg),
  getAutoLaunch: () => invoke('autostart:get'),
  setAutoLaunch: (enabled) => invoke('autostart:set', enabled),
  resetPopupBounds: () => invoke('popup:bounds:reset'),
  copyText: (text) => invoke('clipboard:write', text),
  loadShortcuts: () => invoke('shortcuts:load'),
  saveShortcuts: (shortcuts) => invoke('shortcuts:save', shortcuts),
  loadHistory: () => invoke('history:load'),
  saveFavorite: (payload) => invoke('history:favorite', payload),
  setFavorite: (id, favorite) => invoke('history:favorite:set', id, favorite),
  deleteHistory: (id) => invoke('history:delete', id),
  clearHistory: () => invoke('history:clear'),
  onHistoryUpdate: (cb) => on('history:updated', cb),
  openSettings: () => send('settings:open'),
  openMain: () => send('main:open'),
  onNavigate: (cb) => on('main:navigate', cb),
  closePopup: () => send('popup:close'),
  pinPopup: (value) => send('popup:pin', value),
  dismissPopup: () => send('popup:dismiss')
}

contextBridge.exposeInMainWorld('api', api)

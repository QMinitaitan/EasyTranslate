import { contextBridge, ipcRenderer } from 'electron'
import type { EasyTranslateApi, EventChannels, InvokeChannels, SendChannels } from './shared/ipc-contract.cjs'

// Type-only shared imports disappear: Electron sandbox preloads cannot require local modules.
function invoke<C extends keyof InvokeChannels>(channel: C, ...args: InvokeChannels[C]['args']): Promise<InvokeChannels[C]['result']> {
  return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    const message = typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message : '操作失败，请重试'
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
  })
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
  setThemeMode: (mode) => send('theme:mode', mode),
  onBeforeQuit: (cb) => {
    const off = on('app:before-quit', cb)
    send('app:flush:register', true)
    return () => { off(); send('app:flush:register', false) }
  },
  completeQuitFlush: (token, saved = true) => invoke('app:flush:done', token, saved),
  isPopup: () => window.location.hash.includes('/popup') && window.location.hash.includes('window=popup'),
  triggerTranslate: (cb) => on('translate:trigger', cb),
  translate: (request) => invoke('translate:do', request),
  cancelTranslation: () => send('translate:cancel'),
  onTranslationProgress: (cb) => on('translate:progress', cb),
  startRaceTranslate: (request) => send('translate:race:start', request),
  onRaceProgress: (cb) => on('translate:race:progress', cb),
  onRaceDone: (cb) => on('translate:race:done', cb),
  loadConfig: () => invoke('config:load'),
  listProviders: () => invoke('providers:list'),
  listPromptDefaults: () => invoke('prompts:defaults'),
  providerCapabilities: (config) => invoke('providers:capabilities', config),
  testProvider: (providerId, config) => invoke('providers:probe', { providerId, config }),
  saveConfig: (cfg) => invoke('config:save', cfg),
  onConfigUpdate: (cb) => on('config:updated', cb),
  onConfigSaveError: (cb) => on('config:save:error', cb),
  getAutoLaunch: () => invoke('autostart:get'),
  setAutoLaunch: (enabled) => invoke('autostart:set', enabled),
  resetPopupBounds: () => invoke('popup:bounds:reset'),
  popupReady: () => invoke('popup:ready'),
  popupNotReady: () => send('popup:unready'),
  onPopupTitlebarDoubleClick: (cb) => on('popup:titlebar-double-click', cb),
  copyText: (text) => invoke('clipboard:write', text),
  loadShortcuts: () => invoke('shortcuts:load'),
  saveShortcuts: (shortcuts) => invoke('shortcuts:save', shortcuts),
  loadHistory: () => invoke('history:load'),
  setFavorite: (id, favorite) => invoke('history:favorite:set', id, favorite),
  deleteHistory: (id) => invoke('history:delete', id),
  clearHistory: () => invoke('history:clear'),
  onHistoryUpdate: (cb) => on('history:updated', cb),
  onHistorySaveError: (cb) => on('history:save:error', cb),
  openSettings: (path) => send('settings:open', path),
  openMain: () => send('main:open'),
  onNavigate: (cb) => on('main:navigate', cb),
  closePopup: () => send('popup:close'),
  pinPopup: (value) => send('popup:pin', value),
  dismissPopup: () => send('popup:dismiss')
}

contextBridge.exposeInMainWorld('api', api)

/** Shared wire data. Legacy positional preload calls remain supported during migration. */
export interface TranslationRequest {
  text: string
  target?: string
  providerId?: string | null
  requestId?: string
}

export interface RaceRequest extends TranslationRequest {
  requestId?: string
}

export interface TranslationResult {
  text?: string | null
  engine?: string
  ms?: number
  error?: string | null
  historyId?: number
  historyError?: string
  sessionId?: string
  requestId?: string
  stale?: boolean
}

export interface RaceResult extends TranslationResult {
  requestId?: string
}

export interface RaceDone {
  requestId?: string
  results?: RaceResult[]
  best?: RaceResult | null
  error?: string
}

export interface TranslationTrigger {
  text: string
  ts: number
}

export interface ProviderConfig {
  enabled: boolean
  apiKey: string
  endpoint?: string
  model?: string
  prompt?: string
  region?: string
  secret?: string
}

export interface ProviderMetadata {
  id: string
  name: string
  color: string
  adapter: string
  enabled: boolean
  desc?: string
  models?: string[]
  apiKey?: string
  secret?: string
  endpoint?: string
  model?: string
  prompt?: string
  region?: string
  hasEndpoint?: boolean
  hasModel?: boolean
  hasPrompt?: boolean
  hasRegion?: boolean
  hasSecret?: boolean
  builtin?: boolean
  [key: string]: unknown
}

export type ProviderStatus = 'ready' | 'unsupported' | 'missing-configuration' | 'disabled'
export interface ProviderCapability {
  id: string
  supported: boolean
  configured: boolean
  enabled: boolean
  available: boolean
  status: ProviderStatus
  reason: string
  protocol: string
}

export interface ProviderProbeRequest { providerId: string; config?: Partial<ProviderConfig> }
export interface ProviderProbeResult {
  ok: boolean
  status: 'success' | ProviderStatus | 'http-error' | 'network-error' | 'invalid-response' | 'empty-result' | 'timeout' | 'cancelled'
  ms: number
  error?: string
  capability: ProviderCapability
}

export interface PopupBounds {
  width: number
  height: number
  x?: number
  y?: number
}

export interface Shortcuts { translate: string; show: string }

export interface AppConfig {
  providers: Record<string, ProviderConfig>
  target: string
  uiLanguage: string
  closeAction: string
  launchToTray: boolean
  autoLaunch: boolean
  raceMode: boolean
  shortcuts: Shortcuts
  shortcut?: string
  popupBounds?: PopupBounds
  popupBoundsVersion?: number
  settingsOrder?: Record<string, unknown>
}

export type ConfigUpdate = Partial<Omit<AppConfig, 'providers' | 'shortcuts'>> & {
  providers?: Record<string, Partial<ProviderConfig>>
  shortcuts?: Partial<Shortcuts>
}

export interface HistoryEntry {
  id: number
  src: string
  dst: string
  engine: string
  color: string
  lang: string
  ts: number
  favorite: boolean
}

export interface FavoriteRequest {
  historyId?: number
  src: string
  dst: string
  providerId: string
  target: string
}

export interface InvokeChannels {
  'translate:do': { args: [TranslationRequest]; result: TranslationResult }
  'config:load': { args: []; result: AppConfig }
  'config:save': { args: [ConfigUpdate]; result: AppConfig }
  'providers:list': { args: []; result: ProviderMetadata[] }
  'providers:capabilities': { args: [Record<string, Partial<ProviderConfig>>?]; result: ProviderCapability[] }
  'providers:probe': { args: [ProviderProbeRequest]; result: ProviderProbeResult }
  'autostart:get': { args: []; result: boolean }
  'autostart:set': { args: [boolean]; result: boolean }
  'popup:bounds:reset': { args: []; result: PopupBounds }
  'clipboard:write': { args: [string]; result: boolean }
  'shortcuts:load': { args: []; result: Shortcuts }
  'shortcuts:save': { args: [Partial<Shortcuts>]; result: void }
  'history:load': { args: []; result: HistoryEntry[] }
  'history:favorite': { args: [FavoriteRequest]; result: HistoryEntry | null }
  'history:favorite:set': { args: [number, boolean]; result: HistoryEntry | null }
  'history:delete': { args: [number]; result: HistoryEntry[] }
  'history:clear': { args: []; result: HistoryEntry[] }
}

export interface SendChannels {
  'translate:cancel': []
  'translate:race:start': [RaceRequest]
  'settings:open': []
  'main:open': []
  'popup:close': []
  'popup:pin': [boolean]
  'popup:dismiss': []
}

export interface EventChannels {
  'translate:trigger': TranslationTrigger
  'translate:race:progress': RaceResult
  'translate:race:done': RaceDone
  'history:updated': void
  'config:updated': void
  'config:save:error': string
  'main:navigate': string
}

export type Unsubscribe = () => void

export interface EasyTranslateApi {
  platform: NodeJS.Platform
  isPopup(): boolean
  triggerTranslate(cb: (payload: TranslationTrigger) => void): Unsubscribe
  translate(request: TranslationRequest): Promise<TranslationResult>
  translate(text: string, target?: string, providerId?: string | null): Promise<TranslationResult>
  cancelTranslation(): void
  startRaceTranslate(request: RaceRequest): void
  startRaceTranslate(text: string, target?: string, requestId?: string): void
  onRaceProgress(cb: (result: RaceResult) => void): Unsubscribe
  onRaceDone(cb: (data: RaceDone) => void): Unsubscribe
  loadConfig(): Promise<AppConfig>
  listProviders(): Promise<ProviderMetadata[]>
  providerCapabilities(config?: Record<string, Partial<ProviderConfig>>): Promise<ProviderCapability[]>
  testProvider(providerId: string, config?: Partial<ProviderConfig>): Promise<ProviderProbeResult>
  saveConfig(cfg: ConfigUpdate): Promise<AppConfig>
  onConfigUpdate(cb: () => void): Unsubscribe
  onConfigSaveError(cb: (message: string) => void): Unsubscribe
  getAutoLaunch(): Promise<boolean>
  setAutoLaunch(enabled: boolean): Promise<boolean>
  resetPopupBounds(): Promise<PopupBounds>
  copyText(text: string): Promise<boolean>
  loadShortcuts(): Promise<Shortcuts>
  saveShortcuts(shortcuts: Partial<Shortcuts>): Promise<void>
  loadHistory(): Promise<HistoryEntry[]>
  saveFavorite(payload: FavoriteRequest): Promise<HistoryEntry | null>
  setFavorite(id: number, favorite: boolean): Promise<HistoryEntry | null>
  deleteHistory(id: number): Promise<HistoryEntry[]>
  clearHistory(): Promise<HistoryEntry[]>
  onHistoryUpdate(cb: () => void): Unsubscribe
  openSettings(): void
  openMain(): void
  onNavigate(cb: (path: string) => void): Unsubscribe
  closePopup(): void
  pinPopup(on: boolean): void
  dismissPopup(): void
}

/** IPC input is untrusted even when a typed renderer sends it. */
export function parseTranslationRequest(input: unknown): TranslationRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (typeof value.text !== 'string') return null
  if (value.target !== undefined && typeof value.target !== 'string') return null
  if (value.providerId !== undefined && value.providerId !== null && typeof value.providerId !== 'string') return null
  if (value.requestId !== undefined && typeof value.requestId !== 'string') return null
  return { text: value.text, target: value.target as string | undefined, providerId: value.providerId as string | null | undefined, requestId: value.requestId as string | undefined }
}

export function parseRaceRequest(input: unknown): RaceRequest | null {
  const request = parseTranslationRequest(input)
  if (!request) return null
  const requestId = (input as Record<string, unknown>).requestId
  if (requestId !== undefined && typeof requestId !== 'string') return null
  return { ...request, requestId }
}

export function parseProviderConfig(input: unknown): Partial<ProviderConfig> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  const parsed: Partial<ProviderConfig> = {}
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') return null
    parsed.enabled = value.enabled
  }
  for (const key of ['apiKey', 'endpoint', 'model', 'prompt', 'region', 'secret'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string') return null
    parsed[key] = value[key]
  }
  return parsed
}

export function parseProviderConfigs(input: unknown): Record<string, Partial<ProviderConfig>> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const parsed: Record<string, Partial<ProviderConfig>> = Object.create(null)
  for (const [id, value] of Object.entries(input)) {
    const config = parseProviderConfig(value)
    if (!config) return null
    parsed[id] = config
  }
  return parsed
}

export function parseProviderProbe(input: unknown): ProviderProbeRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (typeof value.providerId !== 'string' || !value.providerId) return null
  if (value.config === undefined) return { providerId: value.providerId }
  const config = parseProviderConfig(value.config)
  return config ? { providerId: value.providerId, config } : null
}

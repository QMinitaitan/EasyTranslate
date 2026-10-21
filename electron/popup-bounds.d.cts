import type { PopupBounds } from './shared/ipc-contract.cjs'
export const DEFAULT_POPUP_BOUNDS: Readonly<PopupBounds>
export const MIN_POPUP_BOUNDS: Readonly<PopupBounds>
export function supportsCursorPositioning(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): boolean
export interface BoundsConfig { popupBounds?: PopupBounds; popupBoundsVersion?: number }
export interface PopupBoundsStore {
  get(): PopupBounds
  update(bounds: Partial<PopupBounds>, options?: { preservePosition?: boolean }): PopupBounds
  reset(): PopupBounds
  flush(): Promise<unknown>
}
export function createPopupBoundsStore(dependencies: {
  loadConfig(): BoundsConfig
  saveConfig(partial: BoundsConfig): unknown
  onSaveError?(error: unknown): void
}): PopupBoundsStore

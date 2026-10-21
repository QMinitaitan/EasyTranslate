type Timer = ReturnType<typeof setTimeout>
export interface PopupAutoHideController {
  onBlur(): void
  onFocus(): void
  onMove(): void
  onPinChange(pinned: boolean): void
  dispose(): void
}
export function createPopupAutoHideController(dependencies: {
  isPinned(): boolean
  hide(): void
  setAlwaysOnTop(value: boolean): void
  schedule?(callback: () => void, delay: number): Timer
  cancel?(timer: Timer): void
  delayMs?: number
}): PopupAutoHideController

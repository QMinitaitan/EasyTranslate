import type { EasyTranslateApi } from '../electron/shared/ipc-contract.cjs'

declare global {
  interface Window { api?: EasyTranslateApi }
}

import type { App } from 'electron'
type StartupApp = Pick<App, 'getPath' | 'getAppPath' | 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>
export function getLaunchSpec(app: StartupApp): { executable: string; args: string[] }
export function getLinuxDesktopPath(app: StartupApp): string
export function buildLinuxDesktopEntry(app: StartupApp): string
export function isEnabled(app: StartupApp): boolean
export function setEnabled(app: StartupApp, enabled: boolean): boolean

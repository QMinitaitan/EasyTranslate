import type { Clipboard } from 'electron'
export interface SelectionResult { text: string; source: string; reason?: string }
interface CommandResult { err: Error | null; stdout: string; stderr?: string }
type RunCommand = (file: string, args: string[], timeout?: number) => Promise<CommandResult>
export interface SelectionOptions {
  platform?: NodeJS.Platform
  clipboardApi?: Pick<Clipboard, 'readText' | 'writeText' | 'write' | 'clear'> & Partial<Pick<Clipboard, 'readHTML' | 'readRTF' | 'readImage'>>
  runCommand?: RunCommand
  copyShortcut?: (platform: NodeJS.Platform, runCommand?: RunCommand) => Promise<CommandResult>
  wait?: (ms: number) => Promise<void>
}
export function getSelection(options?: SelectionOptions): Promise<SelectionResult>

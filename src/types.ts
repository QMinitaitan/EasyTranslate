import type { ProviderMetadata } from '../electron/shared/ipc-contract.cjs'

export type EngineOption = Pick<ProviderMetadata, 'id' | 'name' | 'color'>
export type EngineSelection = EngineOption | { race: true }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function savedOrder(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

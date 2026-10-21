/** Renderer-owned debounce work must reach IPC before main drains its stores. */
type SaveFlush = () => void | Promise<unknown>
const owners = new Set<SaveFlush>()
const active = new Set<Promise<unknown>>()
let draining: Promise<void> | undefined
let drainErrors: unknown[] | undefined

export function registerSettingsFlush(flush: SaveFlush): () => void {
  owners.add(flush)
  return () => { owners.delete(flush) }
}

export function trackSettingsSave<T>(save: Promise<T>): Promise<T> {
  active.add(save)
  void save.then(() => active.delete(save), error => {
    active.delete(save)
    drainErrors?.push(error)
  })
  return save
}

async function drain(): Promise<void> {
  const errors: unknown[] = []
  drainErrors = errors
  try {
    // Snapshot running saves before awaiting owners, including quickly rejected IPC.
    const pending = [...active, ...[...owners].map(flush => Promise.resolve().then(flush))]
    const flushed = await Promise.allSettled(pending)
    for (const result of flushed) {
      if (result.status === 'rejected' && !errors.includes(result.reason)) errors.push(result.reason)
      else if (result.status === 'fulfilled' && result.value === false) errors.push(new Error('Settings save did not finish successfully'))
    }
    // A flush can enqueue a save, and a completing save can enqueue another save.
    while (active.size) {
      const results = await Promise.allSettled([...active])
      for (const result of results) if (result.status === 'rejected' && !errors.includes(result.reason)) errors.push(result.reason)
    }
    if (errors.length) throw new AggregateError(errors, 'Unable to finish saving settings')
  } finally {
    drainErrors = undefined
  }
}

export function flushPendingSettings(): Promise<void> {
  if (draining) return draining
  draining = drain()
  void draining.then(() => { draining = undefined }, () => { draining = undefined })
  return draining
}

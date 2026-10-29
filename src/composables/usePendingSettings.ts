/** Renderer-owned debounce work must reach IPC before main drains its stores. */
type SaveFlush = () => void | Promise<unknown>
const owners = new Set<SaveFlush>()
const active = new Set<Promise<unknown>>()
interface MutationOwner { supersede(): void; draft(): unknown }
const mutationOwners = new Map<string, MutationOwner>()
let draining: Promise<void> | undefined
let drainErrors: unknown[] | undefined

export function registerSettingsFlush(flush: SaveFlush): () => void {
  owners.add(flush)
  return () => { owners.delete(flush) }
}

/** A remounted settings view can restore the concrete draft before replacing its owner. */
export function getPendingSettingsDraft<T>(key: string): T | undefined {
  return mutationOwners.get(key)?.draft() as T | undefined
}

/** Own a concrete unsaved mutation independently of a debounce timer or view. */
export function createSettingsMutation<T>(key: string, persist: (value: T) => Promise<boolean>) {
  let pending: { value: T } | undefined
  let running: Promise<boolean> | undefined
  let released = false
  const unregister = registerSettingsFlush(flush)
  const owner: MutationOwner = { supersede, draft: () => pending?.value }

  function releaseIfSaved() {
    if (released && !pending && !running) {
      unregister()
      if (mutationOwners.get(key) === owner) mutationOwners.delete(key)
    }
  }

  function supersede() {
    pending = undefined
    released = true
    unregister()
  }

  function update(value: T) {
    const previous = mutationOwners.get(key)
    if (previous && previous !== owner) previous.supersede()
    mutationOwners.set(key, owner)
    pending = { value }
  }

  function save(): Promise<boolean> {
    // A newer debounce may fire during the prior write; keep that requested save
    // attached to completion so its latest snapshot is not stranded until quit.
    if (running) return running.then(saved => saved ? save() : false)
    const snapshot = pending
    if (!snapshot) return Promise.resolve(true)
    running = persist(snapshot.value).then(saved => {
      if (saved && pending === snapshot) pending = undefined
      return saved
    }).finally(() => {
      running = undefined
      releaseIfSaved()
    })
    return running
  }

  async function flush(): Promise<boolean> {
    do {
      if (!await save()) return false
    } while (pending)
    return true
  }

  function release() {
    released = true
    releaseIfSaved()
  }

  return { update, save, flush, release, isPending: () => !!pending }
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

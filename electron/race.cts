/** Ranking policy shared by single/race session results. */
export function rankRaceResults<T extends { ms?: number; error?: string | null }>(results: T[]) {
  const ranked = [...results].sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))
  const best = ranked.find(result => !result.error) || null
  return { results: ranked, best }
}

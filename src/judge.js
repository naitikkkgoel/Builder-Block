import { supabase } from './supabase'

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function localMatch(item, guess) {
  const g = norm(guess)
  if (!g) return false
  return [item.word, ...item.aliases].map(norm).some(
    (t) => t === g || (g.length > 3 && (t.includes(g) || g.includes(t))) || lev(t, g) <= 1
  )
}

// Instant local check first; if that misses, ask the LLM judge (semantic match).
// If the edge function isn't deployed, we just stay with the local result.
export async function judge(item, guess) {
  if (localMatch(item, guess)) return true
  try {
    const { data, error } = await supabase.functions.invoke('ai', {
      body: { mode: 'judge', word: item.word, guess },
    })
    if (!error && typeof data?.ok === 'boolean') return data.ok
  } catch (_) {}
  return false
}

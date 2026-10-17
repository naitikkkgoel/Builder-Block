import { supabase } from './supabase'
import { DECK } from './words'

async function call(body) {
  const { data, error } = await supabase.functions.invoke('ai', { body })
  if (error) throw error
  return data
}

// AI-generated deck personalised to the two players. Falls back to the static deck.
export async function generateWords(gens = []) {
  try {
    const data = await call({ mode: 'words', gens, count: 10 })
    const words = (data.words || [])
      .filter((w) => w?.word && w?.meaning)
      .map((w) => ({
        word: String(w.word),
        era: w.era === 'old' ? 'old' : 'new',
        aliases: Array.isArray(w.aliases) ? w.aliases.map(String) : [],
        meaning: String(w.meaning),
      }))
    if (words.length >= 6) return words
  } catch (_) {}
  return DECK
}

// One funny caption per misunderstanding. Falls back to a plain sentence.
export async function writeStories(misses) {
  try {
    const data = await call({ mode: 'story', misses })
    if (Array.isArray(data.stories) && data.stories.length === misses.length) return data.stories.map(String)
  } catch (_) {}
  return misses.map((m) => `${m.by || 'Someone'} heard “${m.clue}” and guessed “${m.guess}”. It was ${m.word}! 😄`)
}

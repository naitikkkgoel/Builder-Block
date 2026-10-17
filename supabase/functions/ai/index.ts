// One edge function, three AI modes: judge | words | story
// Deploy: supabase functions deploy ai --no-verify-jwt
// Secret: supabase secrets set GROQ_API_KEY=your_key
// @ts-nocheck
declare const Deno: any
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown) =>
  new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } })

async function groq(system: string, user: string, temperature = 0) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  const j = await r.json()
  return JSON.parse(j.choices[0].message.content)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()

    if (body.mode === 'judge') {
      const out = await groq(
        'You judge a word-guessing game. Say ok=true if the guess refers to the same thing as the target (synonyms, other names, regional names, close descriptions count). Reply ONLY with JSON: {"ok": true} or {"ok": false}.',
        `Target: ${body.word}\nGuess: ${body.guess}`
      )
      return json({ ok: out.ok === true })
    }

    if (body.mode === 'words') {
      const count = body.count ?? 10
      const players = (body.gens ?? []).filter(Boolean).join(' and ') || 'a younger and an older player'
      const out = await groq(
        'You create word decks for a co-op word-guessing game that bridges generations in India. Reply ONLY with JSON.',
        `Players: ${players}. Create ${count} words: half "old" era (things from 1960s-1990s India: objects, TV/radio, customs, old slang) and half "new" era (modern slang, apps, tech, trends). Each word must be 1-3 words, describable without saying it, and family-friendly. For each give: "word", "era" ("old" or "new"), "aliases" (0-3 other accepted answers, lowercase), "meaning" (ONE plain sentence a grandparent or a teenager could understand). Shuffle old and new. Return {"words":[{"word":"","era":"","aliases":[],"meaning":""}]}`,
        0.9
      )
      return json({ words: out.words ?? [] })
    }

    if (body.mode === 'story') {
      const items = (body.misses ?? []).map((m: any, i: number) => `${i + 1}. ${m.by ?? 'Player'} heard the clue "${m.clue}" and guessed "${m.guess}" but the answer was "${m.word}".`).join('\n')
      const out = await groq(
        'You write warm, funny one-line captions for a family memory scrapbook. Never mock anyone. Reply ONLY with JSON.',
        `For each numbered item write ONE sentence (max 20 words) about the funny misunderstanding. Use the guesser's name and one emoji.\n${items}\nReturn {"stories":["..."]} with exactly ${body.misses.length} strings, in the same order.`,
        0.8
      )
      return json({ stories: out.stories ?? [] })
    }

    return json({ error: 'unknown mode' })
  } catch (e) {
    return json({ error: String(e) })
  }
})

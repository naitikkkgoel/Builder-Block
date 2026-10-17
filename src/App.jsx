import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { DECK } from './words'
import { judge } from './judge'
import { generateWords, writeStories } from './ai'
import Bridge from './Bridge'

const GOAL = 6
const MAX_TRIES = 5
const initial = { phase: 'lobby', planks: 0, describerId: null, item: null, clue: '', last: null, misses: [], used: [], tries: 0, revealed: null, deck: [], stories: null }

// Hint appears after 2 wrong guesses; gets stronger after 4
const hintFor = (item, tries) => {
  if (!item || tries < 2) return null
  const base = `${item.era === 'old' ? 'Something from the old days' : 'Something modern'} · ${item.word.replace(/ /g, '').length} letters`
  return tries >= 4 ? `${base} · starts with "${item.word[0]}"` : base
}

const pick = (used, deck = DECK) => {
  const left = deck.filter((d) => !used.includes(d.word))
  const pool = left.length ? left : deck
  return pool[Math.floor(Math.random() * pool.length)]
}

function listen(setText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return alert('Voice input needs Chrome. Please type instead.')
  const r = new SR()
  r.lang = 'en-IN'
  r.onresult = (e) => setText(e.results[0][0].transcript)
  r.start()
}

function useRoom(code, name, gen) {
  const me = useMemo(() => crypto.randomUUID(), [])
  const [state, setState] = useState(initial)
  const [players, setPlayers] = useState([])
  const stateRef = useRef(initial)
  const chRef = useRef(null)

  const send = (s) => chRef.current?.send({ type: 'broadcast', event: 'state', payload: s })

  useEffect(() => {
    if (!code) return
    const ch = supabase.channel('bridge:' + code, {
      config: { broadcast: { self: false }, presence: { key: me } },
    })
    chRef.current = ch
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      stateRef.current = payload
      setState(payload)
    })
      .on('presence', { event: 'sync' }, () => {
        const ps = Object.entries(ch.presenceState())
          .map(([id, v]) => ({ id, name: v[0].name, gen: v[0].gen }))
          .sort((a, b) => a.id.localeCompare(b.id))
        setPlayers(ps)
      })
      // someone (re)joined mid-game: re-broadcast current state so they catch up
      .on('presence', { event: 'join' }, () => {
        if (stateRef.current.phase !== 'lobby') send(stateRef.current)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ name, gen })
      })
    return () => { supabase.removeChannel(ch) }
  }, [code])

  const update = (patch) => {
    const next = { ...stateRef.current, ...patch }
    stateRef.current = next
    setState(next)
    send(next)
  }
  return { me, state, players, update }
}

export default function App() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [joined, setJoined] = useState(false)
  const [gen, setGen] = useState('')

  if (!joined)
    return (
      <div className="max-w-md mx-auto p-6 pt-16 text-center">
        <h1 className="text-5xl font-extrabold">🌉 Bridge Builder</h1>
        <p className="mt-2 text-slate-600">A co-op game where two generations build a bridge by understanding each other.</p>
        <input className="mt-8 w-full p-4 rounded-xl border text-lg" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="mt-3 w-full p-4 rounded-xl border text-lg uppercase tracking-widest text-center" placeholder="ROOM CODE (e.g. DILLI)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <div className="mt-3 flex gap-2">
          {[['younger', '🧒 Younger (under 30)'], ['older', '🧓 Older (50+)']].map(([v, l]) => (
            <button key={v} onClick={() => setGen(v)} className={`flex-1 p-3 rounded-xl border font-semibold ${gen === v ? 'bg-amber-600 text-white' : 'bg-white'}`}>{l}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">Used by the AI to pick words for both of you.</p>
        <button disabled={!name || !code} onClick={() => setJoined(true)} className="mt-4 w-full p-4 rounded-xl bg-amber-600 text-white text-xl font-bold disabled:opacity-40">
          Join room
        </button>
        <p className="mt-3 text-sm text-slate-500">Both players enter the same room code.</p>
      </div>
    )
  return <Game name={name} code={code} gen={gen} />
}

function Game({ name, code, gen }) {
  const { me, state, players, update } = useRoom(code, name, gen)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [starting, setStarting] = useState(false)
  useEffect(() => setShowInfo(false), [state.item?.word])

  // When the bridge is complete, the first player asks the AI to write scrapbook captions
  useEffect(() => {
    if (state.phase !== 'won' || state.stories || players[0]?.id !== me) return
    const shown = state.misses.slice(-6)
    if (!shown.length) return update({ stories: [] })
    writeStories(shown).then((stories) => update({ stories }))
  }, [state.phase, state.stories])
  const other = players.find((p) => p.id !== state.describerId)
  const iAmDescriber = state.describerId === me
  const describerName = players.find((p) => p.id === state.describerId)?.name

  const start = async () => {
    setStarting(true)
    const deck = await generateWords(players.map((p) => p.gen))
    const item = pick([], deck)
    update({ ...initial, phase: 'play', describerId: players[0].id, item, used: [item.word], deck })
    setStarting(false)
  }
  const sendClue = () => { update({ clue: text, last: null }); setText('') }
  const skip = () => { const item = pick(state.used, state.deck); update({ item, used: [...state.used, item.word], clue: '', last: null, tries: 0, revealed: null }) }

  const submitGuess = async () => {
    const g = text
    setText('')
    setBusy(true)
    const ok = await judge(state.item, g)
    setBusy(false)
    if (ok) {
      const planks = state.planks + 1
      if (planks >= GOAL) return update({ planks, phase: 'won', last: { guess: g, ok: true } })
      const item = pick(state.used, state.deck)
      update({ planks, item, used: [...state.used, item.word], describerId: me, clue: '', last: { guess: g, ok: true }, tries: 0, revealed: null })
    } else {
      const tries = state.tries + 1
      const misses = [...state.misses, { word: state.item.word, clue: state.clue, guess: g, by: name }]
      if (tries >= MAX_TRIES) {
        // out of guesses: reveal the answer, skip to a new word, swap roles
        const item = pick(state.used, state.deck)
        update({ misses, tries: 0, item, used: [...state.used, item.word], describerId: me, clue: '', last: null, revealed: state.item.word })
      } else {
        update({ last: { guess: g, ok: false }, misses, tries })
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold">🌉 Bridge Builder</h1>
        <span className="text-sm bg-white rounded-full px-3 py-1 shadow">Room {code} · {players.map((p) => p.name).join(' & ')}</span>
      </header>

      {state.phase !== 'lobby' && <Bridge planks={state.planks} goal={GOAL} />}

      {state.phase === 'lobby' && (
        <div className="text-center mt-16">
          <p className="text-xl">{players.length < 2 ? 'Waiting for the other player…' : 'Both players are in!'}</p>
          <p className="mt-2 text-slate-500">Share room code <b>{code}</b></p>
          <button disabled={players.length < 2 || starting} onClick={start} className="mt-6 px-8 py-4 rounded-xl bg-amber-600 text-white text-xl font-bold disabled:opacity-40">
            {starting ? '✨ AI is picking words for you two…' : 'Start building'}
          </button>
        </div>
      )}

      {state.phase === 'play' && (
        <div className="bg-white rounded-2xl shadow p-6">
          {state.revealed && (
            <div className="mb-4 rounded-xl bg-red-50 text-red-700 p-3">
              <p className="font-semibold">⏭️ Out of guesses! The word was “{state.revealed}”. New word, roles switched.</p>
              <p className="text-sm mt-1">{state.deck.find((d) => d.word === state.revealed)?.meaning}</p>
            </div>
          )}
          <div className="flex justify-between text-sm text-slate-500 mb-3">
            <span>Guesses used</span>
            <span className="font-bold">{state.tries} / {MAX_TRIES}</span>
          </div>
          {hintFor(state.item, state.tries) && (
            <p className="mb-4 rounded-xl bg-sky-50 text-sky-800 p-3">💡 Hint: {hintFor(state.item, state.tries)}</p>
          )}
          {iAmDescriber ? (
            <>
              <p className="text-sm uppercase tracking-wide text-slate-500">You are describing</p>
              <div className="flex items-center gap-3 my-2">
                <p className="text-4xl font-extrabold">{state.item.word}</p>
                <button onClick={() => setShowInfo((v) => !v)} className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-bold text-lg" title="What does this mean?">ℹ️</button>
              </div>
              {showInfo && <p className="mb-3 rounded-xl bg-sky-50 text-sky-900 p-3">📖 {state.item.meaning}</p>}
              <p className="text-slate-500 text-sm">Explain it to {other?.name} <b>without saying the word</b>. Use your own era's words!</p>
              <div className="flex gap-2 mt-4">
                <input className="flex-1 p-4 rounded-xl border text-lg" placeholder="Describe it…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text && sendClue()} />
                <button onClick={() => listen(setText)} className="px-4 rounded-xl bg-sky-500 text-white text-2xl" title="Speak">🎤</button>
                <button disabled={!text} onClick={sendClue} className="px-5 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-40">Send</button>
              </div>
              <button onClick={skip} className="mt-3 text-sm text-slate-500 underline">Skip this word</button>
              {state.clue && <p className="mt-4 text-slate-600">Your clue: “{state.clue}”</p>}
              {state.last && !state.last.ok && <p className="mt-2 text-red-600 font-semibold">{other?.name} guessed “{state.last.guess}” — not quite. Give another clue!</p>}
              {state.last?.ok && <p className="mt-2 text-green-600 font-semibold">Plank added!</p>}
            </>
          ) : (
            <>
              <p className="text-sm uppercase tracking-wide text-slate-500">{describerName} is describing something…</p>
              <p className="text-3xl font-bold my-4 min-h-[3rem]">{state.clue ? `“${state.clue}”` : '…waiting for a clue'}</p>
              <div className="flex gap-2">
                <input className="flex-1 p-4 rounded-xl border text-lg" placeholder="What is it?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text && !busy && submitGuess()} />
                <button onClick={() => listen(setText)} className="px-4 rounded-xl bg-sky-500 text-white text-2xl" title="Speak">🎤</button>
                <button disabled={!text || busy || !state.clue} onClick={submitGuess} className="px-5 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-40">{busy ? '…' : 'Guess'}</button>
              </div>
              {state.last && !state.last.ok && <p className="mt-3 text-red-600 font-semibold">“{state.last.guess}” isn't it. Ask for another clue!</p>}
              {state.last?.ok && <p className="mt-3 text-green-600 font-semibold">Correct! Now it's your turn to describe.</p>}
            </>
          )}
        </div>
      )}

      {state.phase === 'won' && (
        <div className="bg-white rounded-2xl shadow p-6 text-center">
          <h2 className="text-3xl font-extrabold">🎉 Bridge complete!</h2>
          <p className="text-slate-600 mt-1">You understood each other across generations.</p>
          <h3 className="mt-6 font-bold text-lg text-left">📖 Memory Scrapbook: funniest misunderstandings</h3>
          {state.misses.length === 0 && <p className="text-left text-slate-500">No misses. Perfect understanding!</p>}
          {state.misses.length > 0 && !state.stories && <p className="text-left text-slate-500 mt-2">✨ AI is writing your scrapbook…</p>}
          <ul className="text-left mt-2 space-y-2">
            {state.stories && state.misses.slice(-6).map((m, i) => (
              <li key={i} className="bg-amber-50 rounded-xl p-3">
                <p className="font-semibold">{state.stories[i]}</p>
                <p className="text-sm text-slate-500 mt-1">Clue: “{m.clue}” → guessed “{m.guess}” · it was <b>{m.word}</b></p>
              </li>
            ))}
          </ul>
          <button onClick={start} className="mt-6 px-6 py-3 rounded-xl bg-amber-600 text-white font-bold">Play again</button>
        </div>
      )}
    </div>
  )
}

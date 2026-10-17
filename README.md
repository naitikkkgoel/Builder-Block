# Bridge Builder: MVP

## Run
1. `npm install`
2. `cp .env.example .env` and fill in your Supabase URL + anon key (Project Settings > API)
3. `npm run dev`, then open on two devices/tabs and join the SAME room code.

No DB tables needed: multiplayer uses Supabase Realtime (Broadcast + Presence).

## Optional: AI judge (semantic matching)
    supabase functions deploy ai --no-verify-jwt
    supabase secrets set GROQ_API_KEY=your_key
One function, three modes: `judge` (semantic matching), `words` (AI-generated deck), `story` (scrapbook captions).
Without it the game still works: static word deck, local matching, plain-text scrapbook.

## Demo on two phones
Same Wi-Fi: open the `Network:` URL Vite prints. Or deploy to Vercel (add the 2 env vars).

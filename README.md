# Pixel Nook

**Swap a cart. Play like it's 1989.**

A tiny living-room cabinet for the browser — pick a cartridge, play, chase the high score. Built for Kai's Vibe Coding Academy hackathon.

Free. No ads. Just beeps and pixels — plus a tiny serverless leaderboard.

## Games

Twelve cartridges, all original names and pixel art, all running in the browser with no downloads.

| Cart | What you do |
|------|-------------|
| **Snake** | Grow, don't hit walls or yourself. Speed ramps up. |
| **Block Drop** | Stack falling pieces, clear lines, climb levels. |
| **Maze Munch** | Eat dots in a maze while a ghost chases you. 3 lives. |
| **Star Blaster** | Shoot down waves of aliens from your ship at the bottom. Each wave is faster. 3 lives. |
| **Brick Bash** | Bounce the ball with your paddle and smash every brick. Catch power-ups: **W** wide paddle, **M** multiball, **S** slow ball, **+** extra life. |
| **Frog Hop** | Cross five lanes of traffic, then ride logs over the river and fill all **4** homes before the timer runs out. |
| **Asteroid Drift** | Free-flying ship with thrust and wrap-around space. Big rocks split into smaller, faster rocks. |
| **Pixel Paddle** | Table tennis, first to 7. Play the CPU or a friend on the same keyboard. |
| **Ladder Climb** | Climb ladders and jump the rolling barrels to reach the goal at the top. Jumping a barrel = +100. |
| **Neon Racer** | Endless synthwave highway. Swerve around traffic, boost for extra points. |
| **Moon Drop** | Ease your lander down onto a flat pad with limited fuel. Touch down slowly and level — smaller pads score ×2/×3. Each level adds gravity, a narrower pad and (from level 3) wind. 3 lives. |
| **Tank Duel** | Tank battle in a fresh maze each round. Shots bounce off walls (watch out for your own!). First to 5 wins — vs the CPU or a friend on the same keyboard. |

## Controls

All carts: **(i)** game info in Norwegian (goal, controls, rules — also on each cart in the menu; pauses the game, close with X / Esc / tap outside) · **P / Esc** pause · **R** restart after game over · ◀ CABINET back · sound toggle (saved in localStorage).
On phones/tablets use the on-screen D-pad and the red **●** button (hold works for steering, thrust and auto-fire).

| Cart | Keyboard | Touch |
|------|----------|-------|
| Snake | Arrows / WASD | D-pad, or tap anywhere = turn left |
| Block Drop | ←/→ move · ↑/W/X rotate · ↓ soft drop · Space/Enter hard drop | D-pad · ● hard drop · tap = rotate |
| Maze Munch | Arrows / WASD | D-pad |
| Star Blaster | ←/→ move · Space (or ↑) fire, hold for auto-fire | ◀ ▶ · ● / ▲ fire |
| Brick Bash | ←/→ move paddle · Space (or ↑) launch ball | ◀ ▶ · ● launch |
| Frog Hop | Arrows / WASD hop one square (Space = hop forward) | D-pad |
| Asteroid Drift | ←/→ rotate · ↑ thrust · ↓ brake · Space fire | D-pad · ● fire |
| Pixel Paddle | Menu: ↑/↓ + Space, or 1 / 2. 1P: ↑/↓ or W/S. 2P: left W/S, right ↑/↓ | ▲ ▼ move (left paddle) · ● start |
| Ladder Climb | ←/→ walk · ↑/↓ climb at a ladder · Space (or ↑ away from a ladder) jump | D-pad · ● jump |
| Neon Racer | ←/→ steer · ↑ or Space boost · ↓ brake | D-pad · ● boost |
| Moon Drop | ←/→ rotate · ↑ or Space thrust (hold) | ◀ ▶ rotate · ▲ / ● thrust |
| Tank Duel | Menu: ↑/↓ + Space, or 1 / 2. 1P: arrows/WASD drive · Space/Enter/F fire. 2P: left WASD + Space/F/Q fire, right arrows + Enter/Shift-right/. fire | D-pad drive (left tank) · ● fire / start |

**Gamepad** (Xbox / PlayStation, Gamepad API — just plug in and press a button): d-pad or left stick moves, **A / ✕** = fire / action, **B / ○** = secondary (rotate in Block Drop), **Start** = pause (restart after game over), **Y / △** = game info, **Select / Share** = back to the cabinet. In the menu the d-pad moves between carts and buttons, A starts, Y opens the cart's info, X opens the leaderboard. **Pixel Paddle** and **Tank Duel** support two controllers: controller 1 = left / green, controller 2 = right / red.

## Features

- **Global leaderboard** — arcade-style 3 initials, top 10 per game, shared by everyone. Enter your initials after game over (keyboard, ▲▼ buttons or gamepad). The cart cards show the online top 3–5 and the play screen shows the top 10. If the API is unreachable the game falls back to the local top 5 (`localStorage`). Pixel Paddle and Tank Duel only submit 1-player scores.
- **Daily challenge** — one game + one goal per day (deterministic from the Oslo date, so it is the same for everyone). Shown in the menu; completion is stored locally and pays bonus coins.
- **Coins, achievements and shop** — every game pays coins (score-based; 2-player rounds pay a little). 20 achievements (+25 coins each). Spend coins on cabinet themes (Arktis, Neon, Krom, Gull) and skins (Snake ×2, Frog Hop, Star Blaster, Tank Duel, Moon Drop). Everything is stored locally.
- **Sound** — original chiptune loop in the menu and richer SFX (noise bursts, envelopes), all generated live with Web Audio — no audio files, no copyrighted music. The sound button mutes everything.
- **CRT mode** — 📺 toggle for heavier scanlines, slight screen curvature, vignette and glow. Saved in `localStorage`.

## Leaderboard API

`api/scores.js` is a Vercel Function backed by a free **Neon Postgres** database (added through the Vercel Marketplace; `DATABASE_URL` is injected by Vercel). It talks to Neon's SQL-over-HTTP endpoint with plain `fetch` — no extra npm packages. The table is created on first use.

- `GET /api/scores` → top 10 for every game · `GET /api/scores?game=snake` → one game
- `POST /api/scores` `{ "game": "snake", "name": "KAI", "score": 420 }`
- Abuse protection: game whitelist, initials must be 3 × `A–Z / 0–9` (with a small blocklist), per-game score ceilings, and a rate limit per hashed IP (6 per minute, 60 per hour → HTTP 429). Raw IPs are never stored.

## Run locally

```bash
cd pixel-nook
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build / deploy (Vercel)

```bash
npm run build
```

Static output lands in `dist/`; the leaderboard lives in `api/` (Vercel Functions). On any other static host the game still works with local high scores only.

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- `vercel.json` is included for SPA-friendly rewrites (everything except `/api/*`)
- Leaderboard storage: Neon Postgres (Vercel Marketplace, free plan) connected to the project

Or: `npx vercel` from this folder after login.

## Domain ideas

- **pixelnook.com** — brand match
- **cartslot.com** — cartridge vibe
- **beepbloop.com** — audio juice
- **8bitsofa.com** — living-room sofa energy

## Stack

Vite + vanilla JavaScript · Canvas 2D · Web Audio API · Gamepad API · CSS CRT/scanlines · localStorage · Vercel Functions + Neon Postgres

The nine newer carts share a tiny engine in `src/games/kit.js` (held keys + touch, pause/game-over overlays, high scores). The original three carts keep their own code. Meta features live in `src/progress.js` (coins, achievements, shop, daily challenge), `src/online.js` (leaderboard client), `src/gamepad.js` and `src/audio.js`.

## License

MIT — hackathon free-for-all. Have fun.

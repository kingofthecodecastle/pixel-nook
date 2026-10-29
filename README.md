# Pixel Nook

**Swap a cart. Play like it's 1989.**

A tiny living-room cabinet for the browser — pick a cartridge, play, chase the high score. Built for Kai's Vibe Coding Academy hackathon.

Free. No backend. No ads. Just beeps and pixels.

## Games

Ten cartridges, all original names and pixel art, all running in the browser with no downloads.

| Cart | What you do |
|------|-------------|
| **Snake** | Grow, don't hit walls or yourself. Speed ramps up. |
| **Block Drop** | Stack falling pieces, clear lines, climb levels. |
| **Maze Munch** | Eat dots in a maze while a ghost chases you. 3 lives. |
| **Star Blaster** | Shoot down waves of aliens from your ship at the bottom. Each wave is faster. 3 lives. |
| **Brick Bash** | Bounce the ball with your paddle and smash every brick. Catch power-ups: **W** wide paddle, **M** multiball, **S** slow ball, **+** extra life. |
| **Frog Hop** | Cross five lanes of traffic, then ride logs over the river into the 4 home slots before the timer runs out. |
| **Asteroid Drift** | Free-flying ship with thrust and wrap-around space. Big rocks split into smaller, faster rocks. |
| **Pixel Paddle** | Table tennis, first to 7. Play the CPU or a friend on the same keyboard. |
| **Ladder Climb** | Climb ladders and jump the rolling barrels to reach the goal at the top. Jumping a barrel = +100. |
| **Neon Racer** | Endless synthwave highway. Swerve around traffic, boost for extra points. |

## Controls

All carts: **P / Esc** pause · **R** restart after game over · ◀ CABINET back · sound toggle (saved in localStorage).
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

High scores: top **5** per game, stored in `localStorage`. Pixel Paddle saves scores in 1-player mode only.

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

Static output lands in `dist/`. Deploy that folder to Vercel (or any static host).

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- `vercel.json` is included for SPA-friendly rewrites

Or: `npx vercel` from this folder after login.

## Domain ideas

- **pixelnook.com** — brand match
- **cartslot.com** — cartridge vibe
- **beepbloop.com** — audio juice
- **8bitsofa.com** — living-room sofa energy

## Stack

Vite + vanilla JavaScript · Canvas 2D · Web Audio API · CSS CRT/scanlines · localStorage

The seven newer carts share a tiny engine in `src/games/kit.js` (held keys + touch, pause/game-over overlays, high scores). The original three carts are unchanged.

## License

MIT — hackathon free-for-all. Have fun.

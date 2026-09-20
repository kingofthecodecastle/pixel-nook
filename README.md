# Pixel Nook

**Swap a cart. Play like it's 1989.**

A tiny living-room cabinet for the browser — pick a cartridge, play, chase the high score. Built for Kai's Vibe Coding Academy hackathon.

Free. No backend. No ads. Just beeps and pixels.

## Games

| Cart | What you do |
|------|-------------|
| **Snake** | Grow, don't hit walls or yourself. Speed ramps up. |
| **Block Drop** | Stack falling pieces, clear lines, climb levels. |
| **Maze Munch** | Eat dots in a maze while a ghost chases you. 3 lives. |

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move | Arrow keys / WASD | D-pad |
| Rotate / hard drop (Block Drop) | ↑ / W / X · Space / Enter | ▲ or ● |
| Pause | P / Esc | Pause button |
| Restart | R (after game over) or Restart | Restart button |
| Mute | Sound button (saved in localStorage) | same |

High scores: top **5** per game, stored in `localStorage`.

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

## License

MIT — hackathon free-for-all. Have fun.

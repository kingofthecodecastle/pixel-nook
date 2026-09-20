import { sfx } from '../audio.js';
import { saveHighScore, getHighScores } from '../storage.js';

// 1 = wall, 0 = dot, 2 = empty (no dot), 3 = power-ish empty start
const MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,2,1,2,1,1,1,0,1,1,1,1],
  [2,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,2],
  [1,1,1,1,0,1,2,1,1,2,1,1,2,1,0,1,1,1,1],
  [2,2,2,2,0,2,2,1,2,2,2,1,2,2,0,2,2,2,2],
  [1,1,1,1,0,1,2,1,1,1,1,1,2,1,0,1,1,1,1],
  [2,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,2],
  [1,1,1,1,0,1,1,1,2,1,2,1,1,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const ROWS = MAZE.length;
const COLS = MAZE[0].length;
const CELL = 16;

export function createMazeMunch(canvas, hooks) {
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  let map, player, ghost, score, lives, alive, paused, over, dotsLeft;
  let moveAcc, ghostAcc, last, flash, mouth;

  function cloneMaze() {
    return MAZE.map((r) => r.slice());
  }

  function countDots(m) {
    let n = 0;
    for (const row of m) for (const c of row) if (c === 0) n++;
    return n;
  }

  function resetFull() {
    map = cloneMaze();
    dotsLeft = countDots(map);
    // Open horizontal corridor — start moving so controls feel alive
    player = { x: 9, y: 19, dx: -1, dy: 0, ndx: -1, ndy: 0 };
    ghost = { x: 9, y: 9, dx: 0, dy: -1, ndx: 0, ndy: 0 };
    score = 0;
    lives = 3;
    alive = true;
    paused = false;
    over = false;
    moveAcc = 0;
    ghostAcc = 0;
    last = performance.now();
    flash = 0;
    mouth = 0;
    hooks.onScore(score);
    hooks.onExtra?.({ lives });
    hooks.onStatus('Playing');
  }

  function respawn() {
    player = { x: 9, y: 19, dx: -1, dy: 0, ndx: -1, ndy: 0 };
    ghost = { x: 9, y: 9, dx: 0, dy: -1, ndx: 0, ndy: 0 };
    moveAcc = 0;
    ghostAcc = 0;
    last = performance.now();
  }

  function canWalk(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (y < 0 || y >= ROWS) return false;
    // tunnel wrap
    if (x < 0 || x >= COLS) return true;
    return map[y][x] !== 1;
  }

  function setDir(dx, dy) {
    if (!alive || paused || over) return;
    player.ndx = dx;
    player.ndy = dy;
    // Apply immediately when the next cell is open (incl. reverse)
    if (canWalk(player.x + dx, player.y + dy)) {
      player.dx = dx;
      player.dy = dy;
    }
  }

  function tryTurn(ent) {
    // Ghost has no ndx/ndy — must not treat undefined as a turn (was NaN-crashing the loop)
    if (ent.ndx == null || ent.ndy == null) return;
    if (ent.ndx === 0 && ent.ndy === 0) return;
    const nx = ent.x + ent.ndx;
    const ny = ent.y + ent.ndy;
    if (canWalk(nx, ny)) {
      ent.dx = ent.ndx;
      ent.dy = ent.ndy;
    }
  }

  function stepEntity(ent) {
    tryTurn(ent);
    const nx = ent.x + ent.dx;
    const ny = ent.y + ent.dy;
    if (canWalk(nx, ny)) {
      ent.x = nx;
      ent.y = ny;
      // wrap tunnels
      if (ent.x < 0) ent.x = COLS - 1;
      if (ent.x >= COLS) ent.x = 0;
    } else {
      ent.dx = 0;
      ent.dy = 0;
    }
  }

  function ghostChase() {
    const options = [];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      // no reverse unless stuck
      if (dx === -ghost.dx && dy === -ghost.dy) continue;
      const nx = ghost.x + dx;
      const ny = ghost.y + dy;
      if (canWalk(nx, ny)) options.push({ dx, dy, d: Math.abs(nx - player.x) + Math.abs(ny - player.y) });
    }
    if (!options.length) {
      ghost.dx = -ghost.dx;
      ghost.dy = -ghost.dy;
      return;
    }
    options.sort((a, b) => a.d - b.d);
    // mostly chase, sometimes wander
    const pick = Math.random() < 0.75 ? options[0] : options[(Math.random() * options.length) | 0];
    ghost.dx = pick.dx;
    ghost.dy = pick.dy;
  }

  function eatDot() {
    if (map[player.y]?.[player.x] === 0) {
      map[player.y][player.x] = 2;
      dotsLeft--;
      score += 10;
      sfx.eat();
      flash = 4;
      hooks.onFlash?.('eat');
      hooks.onScore(score);
      if (dotsLeft <= 0) {
        // clear stage — refill maze, bonus
        score += 500;
        map = cloneMaze();
        dotsLeft = countDots(map);
        sfx.level();
        hooks.onScore(score);
        hooks.onFlash?.('clear');
        flash = 14;
      }
    }
  }

  function checkHit() {
    if (player.x === ghost.x && player.y === ghost.y) {
      lives--;
      sfx.die();
      hooks.onFlash?.('die');
      hooks.onExtra?.({ lives });
      flash = 16;
      if (lives <= 0) {
        die();
      } else {
        respawn();
        hooks.onStatus('Lives: ' + lives);
        setTimeout(() => { if (alive) hooks.onStatus('Playing'); }, 800);
      }
    }
  }

  function die() {
    alive = false;
    over = true;
    hooks.onStatus('Game Over');
    saveHighScore('mazemunch', score);
    hooks.onGameOver?.(score, getHighScores('mazemunch'));
  }

  function draw() {
    ctx.fillStyle = '#000018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = map[y][x];
        if (c === 1) {
          ctx.fillStyle = '#1a3a8a';
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          ctx.fillStyle = '#3d6ad6';
          ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
        } else if (c === 0) {
          ctx.fillStyle = '#ffcc66';
          ctx.beginPath();
          ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ghost
    const gx = ghost.x * CELL + CELL / 2;
    const gy = ghost.y * CELL + CELL / 2;
    ctx.fillStyle = '#ff4466';
    ctx.beginPath();
    ctx.arc(gx, gy - 1, CELL / 2 - 2, Math.PI, 0);
    ctx.lineTo(gx + CELL / 2 - 2, gy + CELL / 2 - 3);
    ctx.lineTo(gx + CELL / 4, gy + CELL / 2 - 6);
    ctx.lineTo(gx, gy + CELL / 2 - 3);
    ctx.lineTo(gx - CELL / 4, gy + CELL / 2 - 6);
    ctx.lineTo(gx - CELL / 2 + 2, gy + CELL / 2 - 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(gx - 5, gy - 4, 3, 3);
    ctx.fillRect(gx + 2, gy - 4, 3, 3);

    // player
    const px = player.x * CELL + CELL / 2;
    const py = player.y * CELL + CELL / 2;
    const ang = player.dx === 1 ? 0 : player.dx === -1 ? Math.PI : player.dy === -1 ? -Math.PI / 2 : player.dy === 1 ? Math.PI / 2 : 0;
    const open = 0.25 + 0.2 * Math.sin(mouth);
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, CELL / 2 - 2, ang + open, ang + Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();

    if (flash > 0) {
      const color = flash > 10 ? 'rgba(255,80,80,' : 'rgba(255,255,150,';
      ctx.fillStyle = color + (flash / 24) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flash--;
    }

    if (paused && alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    }

    if (over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '9px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#fff';
      ctx.fillText('SCORE ' + score, canvas.width / 2, canvas.height / 2 + 12);
    }
  }

  const PLAYER_MS = 140;
  const GHOST_MS = 170;

  function update(now) {
    mouth += 0.25;
    if (alive && !paused) {
      const dt = now - last;
      last = now;
      moveAcc += dt;
      ghostAcc += dt;
      while (moveAcc >= PLAYER_MS) {
        moveAcc -= PLAYER_MS;
        stepEntity(player);
        eatDot();
        checkHit();
        if (!alive) break;
      }
      while (ghostAcc >= GHOST_MS && alive) {
        ghostAcc -= GHOST_MS;
        ghostChase();
        stepEntity(ghost);
        checkHit();
      }
    } else {
      last = now;
    }
    draw();
  }

  function onKey(e) {
    const k = (e.key || '').toLowerCase();
    const c = e.code || '';
    if (k === 'arrowup' || k === 'w' || c === 'ArrowUp' || c === 'KeyW') { e.preventDefault(); setDir(0, -1); }
    else if (k === 'arrowdown' || k === 's' || c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); setDir(0, 1); }
    else if (k === 'arrowleft' || k === 'a' || c === 'ArrowLeft' || c === 'KeyA') { e.preventDefault(); setDir(-1, 0); }
    else if (k === 'arrowright' || k === 'd' || c === 'ArrowRight' || c === 'KeyD') { e.preventDefault(); setDir(1, 0); }
    else if (k === 'p' || k === 'escape' || c === 'KeyP' || c === 'Escape') { e.preventDefault(); togglePause(); }
    else if ((k === 'r' || c === 'KeyR') && over) { e.preventDefault(); restart(); }
  }

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    last = performance.now();
    sfx.pause();
    hooks.onStatus(paused ? 'Paused' : 'Playing');
  }

  function restart() {
    resetFull();
    sfx.select();
  }

  resetFull();
  return {
    update,
    onKey,
    setDir,
    togglePause,
    restart,
    destroy() {},
    getScore: () => score,
  };
}

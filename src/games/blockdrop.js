import { sfx } from '../audio.js';
import { saveHighScore, getHighScores } from '../storage.js';

const COLS = 10;
const ROWS = 20;
const CELL = 18;

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

const COLORS = {
  I: '#00f0f0', O: '#f0f000', T: '#a000f0',
  S: '#00f000', Z: '#f00000', J: '#0000f0', L: '#f0a000',
};

const BAG = Object.keys(SHAPES);

function rotate(m) {
  const n = m.length;
  const r = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      r[x][n - 1 - y] = m[y][x];
  return r;
}

export function createBlockDrop(canvas, hooks) {
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  let grid, piece, nextType, score, lines, level, alive, paused, over;
  let dropMs, acc, last, flash, bag;

  function newBag() {
    if (!bag.length) bag = [...BAG].sort(() => Math.random() - 0.5);
    return bag.pop();
  }

  function spawn(type) {
    const shape = SHAPES[type].map((r) => [...r]);
    return {
      type,
      shape,
      x: ((COLS - shape[0].length) / 2) | 0,
      y: 0,
    };
  }

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    nextType = newBag();
    piece = spawn(newBag());
    nextType = newBag();
    score = 0;
    lines = 0;
    level = 1;
    dropMs = 700;
    alive = true;
    paused = false;
    over = false;
    acc = 0;
    last = performance.now();
    flash = 0;
    hooks.onScore(score);
    hooks.onExtra?.({ lines, level });
    hooks.onStatus('Playing');
  }

  function collides(p, ox = 0, oy = 0, shape = p.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = p.x + x + ox;
        const ny = p.y + y + oy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function lock() {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (!piece.shape[y][x]) continue;
        const ny = piece.y + y;
        const nx = piece.x + x;
        if (ny < 0) {
          die();
          return;
        }
        grid[ny][nx] = piece.type;
      }
    }
    clearLines();
    piece = spawn(nextType);
    nextType = newBag();
    if (collides(piece)) die();
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every((c) => c)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      score += pts;
      lines += cleared;
      const newLevel = 1 + Math.floor(lines / 10);
      if (newLevel > level) {
        level = newLevel;
        dropMs = Math.max(100, 700 - (level - 1) * 60);
        sfx.level();
      } else {
        sfx.clear();
      }
      flash = 12;
      hooks.onFlash?.('clear');
      hooks.onScore(score);
      hooks.onExtra?.({ lines, level });
    }
  }

  function die() {
    alive = false;
    over = true;
    sfx.die();
    hooks.onFlash?.('die');
    hooks.onStatus('Game Over');
    saveHighScore('blockdrop', score);
    hooks.onGameOver?.(score, getHighScores('blockdrop'));
  }

  function softDrop() {
    if (!alive || paused) return;
    if (!collides(piece, 0, 1)) {
      piece.y++;
      score += 1;
      hooks.onScore(score);
      sfx.drop();
    } else {
      lock();
    }
  }

  function hardDrop() {
    if (!alive || paused) return;
    while (!collides(piece, 0, 1)) {
      piece.y++;
      score += 2;
    }
    hooks.onScore(score);
    sfx.drop();
    lock();
  }

  function move(dx) {
    if (!alive || paused) return;
    if (!collides(piece, dx, 0)) {
      piece.x += dx;
      sfx.move();
    }
  }

  function rotateCW() {
    if (!alive || paused) return;
    const rotated = rotate(piece.shape);
    if (!collides(piece, 0, 0, rotated)) {
      piece.shape = rotated;
      sfx.click();
    } else if (!collides(piece, -1, 0, rotated)) {
      piece.x -= 1;
      piece.shape = rotated;
      sfx.click();
    } else if (!collides(piece, 1, 0, rotated)) {
      piece.x += 1;
      piece.shape = rotated;
      sfx.click();
    }
  }

  function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 6, 3);
  }

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) drawCell(x, y, COLORS[grid[y][x]]);
      }
    }

    if (piece && alive) {
      let gy = 0;
      while (!collides(piece, 0, gy + 1)) gy++;
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (!piece.shape[y][x]) continue;
          const px = piece.x + x;
          const py = piece.y + y + gy;
          if (py >= 0) {
            ctx.strokeStyle = COLORS[piece.type];
            ctx.strokeRect(px * CELL + 2, py * CELL + 2, CELL - 4, CELL - 4);
          }
        }
      }
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (!piece.shape[y][x]) continue;
          const px = piece.x + x;
          const py = piece.y + y;
          if (py >= 0) drawCell(px, py, COLORS[piece.type]);
        }
      }
    }

    if (flash > 0) {
      ctx.fillStyle = 'rgba(200,220,255,' + (flash / 20) + ')';
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

  function update(now) {
    if (alive && !paused) {
      acc += now - last;
      last = now;
      while (acc >= dropMs) {
        acc -= dropMs;
        if (!collides(piece, 0, 1)) piece.y++;
        else lock();
        if (!alive) break;
      }
    } else {
      last = now;
    }
    draw();
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { e.preventDefault(); move(-1); }
    else if (k === 'arrowright' || k === 'd') { e.preventDefault(); move(1); }
    else if (k === 'arrowdown' || k === 's') { e.preventDefault(); softDrop(); }
    else if (k === 'arrowup' || k === 'w' || k === 'x') { e.preventDefault(); rotateCW(); }
    else if (k === ' ' || k === 'enter') { e.preventDefault(); hardDrop(); }
    else if (k === 'p' || k === 'escape') { e.preventDefault(); togglePause(); }
    else if (k === 'r' && over) { e.preventDefault(); restart(); }
  }

  function setDir(dx, dy) {
    if (dy > 0) softDrop();
    else if (dy < 0) rotateCW();
    else if (dx) move(dx);
  }

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    last = performance.now();
    sfx.pause();
    hooks.onStatus(paused ? 'Paused' : 'Playing');
  }

  function restart() {
    reset();
    sfx.select();
  }

  reset();
  return {
    update,
    onKey,
    setDir,
    action: rotateCW,
    hardDrop,
    togglePause,
    restart,
    destroy() {},
    getScore: () => score,
  };
}

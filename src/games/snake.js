import { sfx } from '../audio.js';
import { saveHighScore, getHighScores } from '../storage.js';

const COLS = 16;
const ROWS = 16;
const CELL = 20;

export function createSnake(canvas, hooks) {
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  let snake, dir, nextDir, food, score, alive, paused, tickMs, acc, last, flash;
  let over = false;

  function reset() {
    snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    dir = { x: 1, y: 0 };
    nextDir = { ...dir };
    score = 0;
    alive = true;
    paused = false;
    over = false;
    tickMs = 180;
    acc = 0;
    last = performance.now();
    flash = 0;
    spawnFood();
    hooks.onScore(score);
    hooks.onStatus('Playing');
  }

  function spawnFood() {
    const taken = new Set(snake.map((p) => `${p.x},${p.y}`));
    let x, y;
    do {
      x = (Math.random() * COLS) | 0;
      y = (Math.random() * ROWS) | 0;
    } while (taken.has(`${x},${y}`));
    food = { x, y };
  }

  function setDir(dx, dy) {
    if (!alive || paused) return;
    if (dx === -dir.x && dy === -dir.y) return;
    nextDir = { x: dx, y: dy };
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      die();
      return;
    }
    if (snake.some((p) => p.x === head.x && p.y === head.y)) {
      die();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      tickMs = Math.max(70, tickMs - 4);
      sfx.eat();
      flash = 8;
      hooks.onFlash?.('eat');
      hooks.onScore(score);
      spawnFood();
    } else {
      snake.pop();
      sfx.move();
    }
  }

  function die() {
    alive = false;
    over = true;
    sfx.die();
    hooks.onFlash?.('die');
    hooks.onStatus('Game Over');
    saveHighScore('snake', score);
    hooks.onGameOver?.(score, getHighScores('snake'));
  }

  function draw() {
    ctx.fillStyle = '#0d1b0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = 'rgba(80,140,80,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }

    // food
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);

    // snake
    snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#7CFC00' : '#3cb371';
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
      if (i === 0) {
        ctx.fillStyle = '#0d1b0d';
        const ex = dir.x !== 0 ? (dir.x > 0 ? 12 : 4) : 6;
        const ey = dir.y !== 0 ? (dir.y > 0 ? 12 : 4) : 6;
        ctx.fillRect(p.x * CELL + ex, p.y * CELL + ey, 3, 3);
        ctx.fillRect(p.x * CELL + (dir.x !== 0 ? ex : 12), p.y * CELL + ey, 3, 3);
      }
    });

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,180,${flash / 16})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flash--;
    }

    if (paused && alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '12px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    }

    if (over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '10px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#fff';
      ctx.fillText(`SCORE ${score}`, canvas.width / 2, canvas.height / 2 + 14);
    }
  }

  function update(now) {
    if (!alive || paused) {
      draw();
      return;
    }
    acc += now - last;
    last = now;
    while (acc >= tickMs) {
      acc -= tickMs;
      step();
      if (!alive) break;
    }
    draw();
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') { e.preventDefault(); setDir(0, -1); }
    else if (k === 'arrowdown' || k === 's') { e.preventDefault(); setDir(0, 1); }
    else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); setDir(-1, 0); }
    else if (k === 'arrowright' || k === 'd') { e.preventDefault(); setDir(1, 0); }
    else if (k === 'p' || k === 'escape') { e.preventDefault(); togglePause(); }
    else if (k === 'r' && over) { e.preventDefault(); restart(); }
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
    togglePause,
    restart,
    destroy() {},
    getScore: () => score,
  };
}

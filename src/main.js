import './style.css';
import { sfx, isMuted, toggleMute } from './audio.js';
import { getHighScores } from './storage.js';
import { createSnake } from './games/snake.js';
import { createBlockDrop } from './games/blockdrop.js';
import { createMazeMunch } from './games/mazemunch.js';

const GAMES = {
  snake: {
    id: 'snake',
    title: 'SNAKE',
    year: "'89",
    color: '#3cb371',
    accent: '#7CFC00',
    blurb: "Grow. Don't crash. Classic.",
    factory: createSnake,
    extraLabel: null,
  },
  blockdrop: {
    id: 'blockdrop',
    title: 'BLOCK DROP',
    year: "'90",
    color: '#6c5ce7',
    accent: '#a29bfe',
    blurb: 'Stack. Clear. Speed up.',
    factory: createBlockDrop,
    extraLabel: 'LVL',
  },
  mazemunch: {
    id: 'mazemunch',
    title: 'MAZE MUNCH',
    year: "'87",
    color: '#e17055',
    accent: '#ffeaa7',
    blurb: 'Dots. Ghost. Survive.',
    factory: createMazeMunch,
    extraLabel: 'LIVES',
  },
};

const app = document.querySelector('#app');
let currentGame = null;
let raf = 0;
let keyHandler = null;
let screenFlashEl = null;

function hsList(id) {
  const list = getHighScores(id);
  if (!list.length) return '<li class="empty">— no scores yet —</li>';
  return list.map((e, i) => `<li><span class="rank">${i + 1}</span><span class="pts">${e.score}</span></li>`).join('');
}

function renderHome() {
  teardownGame();
  app.innerHTML = `
    <div class="crt-frame home">
      <div class="scanlines"></div>
      <header class="brand">
        <div class="logo-mark" aria-hidden="true">▣</div>
        <h1>PIXEL NOOK</h1>
        <p class="tagline">Swap a cart. Play like it's 1989.</p>
      </header>
      <p class="select-label">SELECT CARTRIDGE</p>
      <div class="cart-row" role="list">
        ${Object.values(GAMES).map((g) => `
          <button class="cart" data-game="${g.id}" role="listitem" style="--cart:${g.color};--accent:${g.accent}">
            <div class="cart-ridge"></div>
            <div class="cart-label">
              <span class="cart-year">${g.year}</span>
              <span class="cart-title">${g.title}</span>
              <span class="cart-blurb">${g.blurb}</span>
            </div>
            <div class="cart-chip"></div>
            <ol class="cart-hs">${hsList(g.id)}</ol>
          </button>
        `).join('')}
      </div>
      <footer class="home-foot">
        <button type="button" class="btn chunky mute-btn" id="muteBtn">${isMuted() ? '🔇 MUTED' : '🔊 SOUND'}</button>
        <p class="hint">Arrows / WASD · P pause · R restart</p>
      </footer>
    </div>
  `;

  app.querySelectorAll('.cart').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.select();
      startGame(btn.dataset.game);
    });
  });
  app.querySelector('#muteBtn').addEventListener('click', () => {
    toggleMute();
    sfx.click();
    renderHome();
  });
}

function startGame(id) {
  const meta = GAMES[id];
  if (!meta) return;
  teardownGame();

  app.innerHTML = `
    <div class="crt-frame play" id="playFrame">
      <div class="scanlines"></div>
      <div class="screen-flash" id="screenFlash"></div>
      <header class="play-bar">
        <button type="button" class="btn chunky small" id="backBtn">◀ CABINET</button>
        <div class="play-title" style="color:${meta.accent}">${meta.title}</div>
        <button type="button" class="btn chunky small mute-btn" id="muteBtn">${isMuted() ? '🔇' : '🔊'}</button>
      </header>
      <div class="hud">
        <div class="hud-item"><span class="lbl">SCORE</span><span id="scoreEl">0</span></div>
        <div class="hud-item" id="extraWrap" style="display:none"><span class="lbl" id="extraLbl"></span><span id="extraEl"></span></div>
        <div class="hud-item"><span class="lbl">STATUS</span><span id="statusEl">Playing</span></div>
      </div>
      <div class="canvas-wrap">
        <canvas id="gameCanvas"></canvas>
      </div>
      <div class="play-actions">
        <button type="button" class="btn chunky small" id="pauseBtn">PAUSE</button>
        <button type="button" class="btn chunky small" id="restartBtn">RESTART</button>
      </div>
      <div class="touch-pad" aria-label="Touch controls">
        <div class="dpad">
          <button type="button" class="pad-btn" data-dx="0" data-dy="-1">▲</button>
          <div class="dpad-mid">
            <button type="button" class="pad-btn" data-dx="-1" data-dy="0">◀</button>
            <button type="button" class="pad-btn action" id="actionBtn">●</button>
            <button type="button" class="pad-btn" data-dx="1" data-dy="0">▶</button>
          </div>
          <button type="button" class="pad-btn" data-dx="0" data-dy="1">▼</button>
        </div>
      </div>
      <div class="hs-panel">
        <p class="hs-title">TOP 5</p>
        <ol id="hsLive">${hsList(id)}</ol>
      </div>
    </div>
  `;

  screenFlashEl = app.querySelector('#screenFlash');
  const canvas = app.querySelector('#gameCanvas');

  const hooks = {
    onScore(s) {
      const el = app.querySelector('#scoreEl');
      if (el) el.textContent = String(s);
    },
    onStatus(t) {
      const el = app.querySelector('#statusEl');
      if (el) el.textContent = t;
    },
    onExtra(data) {
      const wrap = app.querySelector('#extraWrap');
      const lbl = app.querySelector('#extraLbl');
      const el = app.querySelector('#extraEl');
      if (!wrap) return;
      if (data.level != null) {
        wrap.style.display = '';
        lbl.textContent = 'LVL';
        el.textContent = `${data.level} · L${data.lines}`;
      } else if (data.lives != null) {
        wrap.style.display = '';
        lbl.textContent = 'LIVES';
        el.textContent = '❤'.repeat(Math.max(0, data.lives)) || '0';
      }
    },
    onFlash(kind) {
      if (!screenFlashEl) return;
      screenFlashEl.className = 'screen-flash show ' + kind;
      clearTimeout(screenFlashEl._t);
      screenFlashEl._t = setTimeout(() => {
        screenFlashEl.className = 'screen-flash';
      }, 180);
    },
    onGameOver(score, list) {
      const hs = app.querySelector('#hsLive');
      if (hs) {
        hs.innerHTML = list.map((e, i) =>
          `<li><span class="rank">${i + 1}</span><span class="pts">${e.score}</span></li>`
        ).join('') || '<li class="empty">—</li>';
      }
    },
  };

  currentGame = meta.factory(canvas, hooks);

  keyHandler = (e) => currentGame?.onKey(e);
  window.addEventListener('keydown', keyHandler);

  app.querySelector('#backBtn').addEventListener('click', () => { sfx.blip(); renderHome(); });
  app.querySelector('#muteBtn').addEventListener('click', () => {
    const m = toggleMute();
    app.querySelector('#muteBtn').textContent = m ? '🔇' : '🔊';
    sfx.click();
  });
  app.querySelector('#pauseBtn').addEventListener('click', () => currentGame?.togglePause());
  app.querySelector('#restartBtn').addEventListener('click', () => {
    currentGame?.restart();
    app.querySelector('#hsLive').innerHTML = hsList(id);
  });

  app.querySelectorAll('.pad-btn[data-dx]').forEach((btn) => {
    const fire = (e) => {
      e.preventDefault();
      currentGame?.setDir(+btn.dataset.dx, +btn.dataset.dy);
    };
    btn.addEventListener('pointerdown', fire);
  });

  // Tap/click anywhere (not on UI buttons):
  // Snake = one left turn; Block Drop = one rotate
  if (id === 'snake' || id === 'blockdrop') {
    const playFrame = app.querySelector('#playFrame');
    playFrame?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      if (id === 'snake') currentGame?.turnLeft?.();
      else currentGame?.action?.(); // Block Drop rotateCW
    });
  }
  const act = app.querySelector('#actionBtn');
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (currentGame?.hardDrop) currentGame.hardDrop();
    else if (currentGame?.action) currentGame.action();
  });

  const loop = (now) => {
    currentGame?.update(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function teardownGame() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  currentGame?.destroy?.();
  currentGame = null;
}

renderHome();

// Tiny pixel-art cartridge icons (inline SVG, crisp edges). Each row is a string; '.' = empty, letters = palette.
const P = { g: '#7CFC00', G: '#1e7a1e', r: '#ff4d6d', y: '#ffe066', w: '#ffffff', k: '#111111', b: '#4fc3ff', o: '#ff9f43', p: '#ff6fd8', s: '#b8c2cc', S: '#6b7785', c: '#22e0d0', t: '#c9a46a', T: '#7a5a2e', v: '#a29bfe', l: '#33ff66' };
const ART = {
  snake: [
    '..........gggg..',
    '..........gkgg.r',
    '.gggg.....ggggr.',
    'gg..gg....gg....',
    'g....gg..gg.....',
    '......gggg......',
  ],
  blockdrop: [
    '.....pppp.......',
    '.....pppp.......',
    '.pppppppppppp...',
    '.pppppppppppp...',
    '.pppp....pppp...',
    '.pppp....pppp...',
  ],
  mazemunch: [
    '..yyyy..........',
    '.yyyyyy.........',
    'yyyy...........',
    'yyy....yy..yy..yy',
    'yyyy............',
    '.yyyyyy.........',
    '..yyyy..........',
  ],
  starblaster: [
    '.......w........',
    '......www.......',
    '......wbw.......',
    '..r..wwwww..r...',
    '..s.wwwwwww.s...',
    '..sswwwwwwwss...',
    '......r.r.......',
  ],
  brickbash: [
    'rrrr.rrrr.....w.',
    'rrrr.rrrr.......',
    '..rrrr..rrrr....',
    '..rrrr..rrrr....',
    'rrrr.rrrr.......',
  ],
  froghop: [
    '..ww......ww....',
    '.wkkw....wkkw...',
    '.gggggggggggg...',
    'ggg.gggggg.ggg..',
    '.gggggggggggg...',
    'gg..gg..gg..gg..',
  ],
  asteroiddrift: [
    '.....ssss.......',
    '...ssSssss......',
    '..ssssssSss.....',
    '..sSssssssss....',
    '..ssssSssss.....',
    '...sssssss......',
    '.....sss........',
  ],
  pixelpaddle: [
    '..........ww....',
    '.........wwww...',
    '..........ww....',
    'ww..............',
    'ww......wwwwwwww',
    'ww..............',
  ],
  ladderclimb: [
    '..pp.....pp.....',
    '..pppppppppp....',
    '..pp.....pp.....',
    '..pppppppppp....',
    '..pp.....pp.....',
    '..pppppppppp....',
    '..pp.....pp.....',
  ],
  neonracer: [
    '....pppppp......',
    '...pbbppbbp.....',
    '.pppppppppppp...',
    'ppyppppppppypp..',
    '.pkkpppppppkkp..',
    '..kk.......kk...',
  ],
  moondrop: [
    '......ss........',
    '.....sbbs.......',
    '....ssssss......',
    '....yyyyyy......',
    '...s..r...s.....',
    '..ss..r...ss....',
  ],
  tankduel: [
    '......yyyyyyyy..',
    '....yyyy........',
    '..yyyyyyyy......',
    '.oooooooooooo...',
    'okokokokokoko...',
    '.oooooooooooo...',
  ],
};
export function cartIcon(id) {
  const rows = ART[id];
  if (!rows) return '';
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (P[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${P[ch]}"/>`; }));
  return `<svg class="cart-icon" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

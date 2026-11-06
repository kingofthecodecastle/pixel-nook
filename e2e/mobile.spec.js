import { test, expect } from '@playwright/test';

const GAME_IDS = ['snake', 'blockdrop', 'mazemunch', 'starblaster', 'brickbash', 'froghop',
  'asteroiddrift', 'pixelpaddle', 'ladderclimb', 'neonracer', 'moondrop', 'tankduel'];
const progress = {
  coins: 875, earned: 1400,
  ach: { first: 1700000000001, all12: 1700000000002, shopper: 1700000000003 },
  played: Object.fromEntries(GAME_IDS.map(id => [id, 4])),
  owned: { wood: true, neon: true, 'snake-gold': true }, theme: 'neon',
  skins: { snake: 'snake-gold' }, daily: { '2026-10-01': 1700000000004 }, dailyCount: 1,
  futureVersionField: { keep: 'existing progress' },
};
const originalScores = Object.fromEntries(GAME_IDS.map((id, index) => [id,
  Array.from({ length: 7 }, (_, i) => ({ name: 'KAI', score: 7000 + index * 100 - i * 10, at: 1700000000100 + i })),
]));
const originalEntries = {
  pixelnook_progress: JSON.stringify(progress),
  pixelnook_initials: 'KAI',
  pixelnook_cam_snake: 'classic',
  pixelnook_muted: '1',
  ...Object.fromEntries(GAME_IDS.map(id => [`pixelnook_hs_${id}`, JSON.stringify(originalScores[id])])),
};

async function savedEntries(page) {
  return page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(originalEntries));
}
async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
async function openHome(page, { three = false } = {}) {
  await page.goto(three ? '/' : '/?3d=0');
  await expect(page.locator('.cart')).toHaveCount(12);
  await expect(page.locator('#coinCount')).toHaveText(String(progress.coins));
}

test.beforeEach(async ({ page }) => {
  // Seed once per isolated browser context, never again on reload: reload checks
  // must observe the app's persisted result rather than silently repairing it.
  await page.addInitScript(entries => {
    if (sessionStorage.getItem('pixelnook-e2e-seeded')) return;
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    sessionStorage.setItem('pixelnook-e2e-seeded', '1');
  }, originalEntries);
  // Every leaderboard request is local test data; no test reads or writes Neon.
  await page.route('**/api/scores**', async route => {
    const url = new URL(route.request().url());
    const game = url.searchParams.get('game');
    const rows = [{ name: 'NET', score: 99999 }];
    await route.fulfill({ json: {
      scores: game ? rows : Object.fromEntries(GAME_IDS.map(id => [id, rows])),
      ...(route.request().method() === 'POST' ? { rank: 1 } : {}),
    } });
  });
});

test('all twelve existing carts open in the mobile layout and preserve saved progress', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openHome(page);
  expect(await savedEntries(page)).toEqual(originalEntries);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon');
  await capture(page, testInfo, 'retro-cabinet');
  for (const id of GAME_IDS) {
    await page.locator(`.cart[data-game="${id}"]`).click();
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect(page.locator('#statusEl')).toHaveText('Ready');
    await expect.poll(() => page.evaluate(() => window.__pixelnook.id)).toBe(id);
    expect(await page.locator('#gameCanvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
    if (id === 'snake') await capture(page, testInfo, 'snake-start-screen');
    await page.locator('#backBtn').click();
    await expect(page.locator('.cart')).toHaveCount(12);
  }
  const saved = await savedEntries(page);
  for (const id of GAME_IDS) expect(JSON.parse(saved[`pixelnook_hs_${id}`])).toEqual(originalScores[id]);
  expect(saved.pixelnook_initials).toBe('KAI');
  const after = JSON.parse(saved.pixelnook_progress);
  expect(after.coins).toBe(progress.coins);
  expect(after.earned).toBe(progress.earned);
  expect(after.owned).toEqual(progress.owned);
  expect(after.ach).toEqual(progress.ach);
  expect(after.daily).toEqual(progress.daily);
  expect(after.skins).toEqual(progress.skins);
  expect(after.futureVersionField).toEqual(progress.futureVersionField);
  for (const id of GAME_IDS) expect(after.played[id]).toBe(progress.played[id] + 1);
  expect(errors).toEqual([]);
});

test('Snake starts and restarts through keyboard and touch without native ads on web', async ({ page }, testInfo) => {
  const nativeAdRequests = [];
  page.on('request', request => {
    if (/@capacitor-community[\/_-]admob|googleads|doubleclick/.test(request.url())) nativeAdRequests.push(request.url());
  });
  // Deterministic food at (0, 0), away from the straight path to the right wall.
  await page.addInitScript(() => { Math.random = () => 0.01; });
  await openHome(page);
  await page.locator('.cart[data-game="snake"]').click();
  await expect(page.locator('#statusEl')).toHaveText('Ready');
  await page.locator('#gameCanvas').tap();
  await expect(page.locator('#statusEl')).toHaveText('Playing');
  await expect(page.locator('#statusEl')).toHaveText('Game Over');
  await capture(page, testInfo, 'snake-game-over');
  // Existing game-over grace protects the initials/score UI from accidental taps.
  await page.waitForTimeout(1400);
  await page.keyboard.press('r');
  await expect(page.locator('#statusEl')).toHaveText('Ready');
  await page.locator('#gameCanvas').tap();
  await expect(page.locator('#statusEl')).toHaveText('Game Over');
  await page.waitForTimeout(1400);
  await page.locator('#gameCanvas').tap();
  await expect(page.locator('#statusEl')).toHaveText('Playing');
  await page.keyboard.press('p');
  await expect(page.locator('#statusEl')).toHaveText('Paused');
  expect(nativeAdRequests).toEqual([]);
  await expect(page.locator('.round-transition')).toHaveCount(0);
  const saved = await savedEntries(page);
  const scores = JSON.parse(saved.pixelnook_hs_snake);
  for (const score of originalScores.snake) expect(scores).toContainEqual(score);
  expect(saved.pixelnook_initials).toBe('KAI');
});

test('save transfer rejects invalid data and merges a real save without resetting existing data', async ({ page }, testInfo) => {
  await openHome(page);
  await page.locator('#saveBtn').click();
  await expect(page.getByRole('dialog', { name: 'Save & transfer' })).toBeVisible();
  await page.locator('#saveText').fill('{not valid JSON');
  await page.locator('#saveImport').click();
  await expect(page.locator('#saveStatus')).toHaveText('File is not a valid save.');
  expect(await savedEntries(page)).toEqual(originalEntries);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#saveExport').click();
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath('original-save.json'));
  const exported = JSON.parse(await page.locator('#saveText').inputValue());
  expect(exported.format).toBe('pixel-nook-save');
  expect(exported.entries).toMatchObject(originalEntries);
  await capture(page, testInfo, 'save-transfer');

  const incomingScore = { score: 88888, name: 'NEW', at: 1700000999999 };
  const incoming = {
    format: 'pixel-nook-save', version: 1,
    entries: {
      pixelnook_progress: JSON.stringify({ coins: 100, earned: 200, ach: { master_snake: 1700000999999 },
        played: { snake: 12 }, owned: { wood: true, gold: true }, theme: 'gold', skins: {}, daily: {}, dailyCount: 0 }),
      pixelnook_hs_snake: JSON.stringify([incomingScore]),
      pixelnook_initials: 'NEW',
    },
  };
  await page.locator('#saveText').fill(JSON.stringify(incoming));
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.locator('#saveImport').click(),
  ]);
  await expect(page.locator('.cart')).toHaveCount(12);
  const saved = await savedEntries(page);
  expect(saved.pixelnook_initials).toBe('KAI');
  const after = JSON.parse(saved.pixelnook_progress);
  expect(after.coins).toBe(progress.coins);
  expect(after.theme).toBe(progress.theme);
  expect(after.owned.neon).toBe(true);
  expect(after.owned.gold).toBe(true);
  expect(after.ach.master_snake).toBe(1700000999999);
  expect(after.daily).toEqual(progress.daily);
  expect(after.futureVersionField).toEqual(progress.futureVersionField);
  const scores = JSON.parse(saved.pixelnook_hs_snake);
  for (const score of [...originalScores.snake, incomingScore]) expect(scores).toContainEqual(score);
  for (const id of GAME_IDS.filter(id => id !== 'snake')) expect(JSON.parse(saved[`pixelnook_hs_${id}`])).toEqual(originalScores[id]);

  await page.locator('#saveBtn').click();
  await page.locator('.save-recovery summary').click();
  await expect(page.locator('#saveRecovery')).toBeEnabled();
  await expect(page.locator('#saveRecoveryBefore')).toBeEnabled();
  await expect(page.locator('#saveRecoveryIncoming')).toBeEnabled();
});

test('the existing 3D cabinet remains available with its normal route', async ({ page }, testInfo) => {
  await openHome(page, { three: true });
  await page.evaluate(() => window.__pixelnook.threeReady);
  await expect(page.locator('.cart')).toHaveCount(12);
  await capture(page, testInfo, 'cabinet-default-3d');
  expect(await savedEntries(page)).toEqual(originalEntries);
});

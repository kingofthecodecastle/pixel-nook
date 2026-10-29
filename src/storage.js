const PREFIX = 'pixelnook_hs_';

export function getHighScores(gameId) {
  try {
    const raw = localStorage.getItem(PREFIX + gameId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHighScore(gameId, score, name = 'YOU') {
  const list = getHighScores(gameId);
  list.push({ score, name, at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 5);
  localStorage.setItem(PREFIX + gameId, JSON.stringify(top));
  return top;
}

export function isTopScore(gameId, score) {
  if (score <= 0) return false;
  const list = getHighScores(gameId);
  return list.length < 5 || score > list[list.length - 1].score;
}

/** Put arcade initials on the most recent local entry with this score. */
export function nameLatest(gameId, score, name) {
  const list = getHighScores(gameId);
  let best = null;
  for (const e of list) if (e.score === score && (!best || e.at > best.at)) best = e;
  if (!best) return;
  best.name = name;
  localStorage.setItem(PREFIX + gameId, JSON.stringify(list));
}

const PREFIX = 'pixelnook_hs_';

function allHighScores(gameId) {
  try {
    const raw = localStorage.getItem(PREFIX + gameId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getHighScores(gameId) {
  return allHighScores(gameId).slice(0, 5);
}

export function saveHighScore(gameId, score, name = 'YOU') {
  const list = allHighScores(gameId);
  list.push({ score, name, at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 5);
  // Keep the complete history under the original key. The public leaderboard
  // remains a top five, while transfers and future app updates retain all runs.
  localStorage.setItem(PREFIX + gameId, JSON.stringify(list));
  return top;
}

export function isTopScore(gameId, score) {
  if (score <= 0) return false;
  const list = getHighScores(gameId);
  return list.length < 5 || score > list[list.length - 1].score;
}

/** Put arcade initials on the most recent local entry with this score. */
export function nameLatest(gameId, score, name) {
  const list = allHighScores(gameId);
  let best = null;
  for (const e of list) if (e.score === score && (!best || e.at > best.at)) best = e;
  if (!best) return;
  best.name = name;
  localStorage.setItem(PREFIX + gameId, JSON.stringify(list));
}

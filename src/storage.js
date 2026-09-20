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

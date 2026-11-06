/** Public endpoint only. Database credentials must never enter the client bundle. */
export function resolveScoresApi({ native = false, configured = '' } = {}) {
  const value = String(configured || '').trim();
  if (!value) {
    if (native) throw new Error('Native builds require VITE_SCORES_API_URL (an absolute HTTPS leaderboard endpoint).');
    return '/api/scores';
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('VITE_SCORES_API_URL must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_SCORES_API_URL must use HTTPS, without credentials, query parameters or a fragment.');
  }
  return url.href;
}

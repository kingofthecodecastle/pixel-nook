/**
 * The game reports a completed round, then awaits beforeNextRound at a restart.
 * adapter.show must settle only when the native ad is closed or failed to show.
 * A loading deadline may skip an ad; an on-screen ad has no artificial timeout.
 */
export function createInterstitialGate({
  adapter,
  now = () => Date.now(),
  cooldownMs = 60_000,
  prepareTimeoutMs = 1_500,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  canPresent = () => true,
}) {
  const cooldown = Math.max(30_000, Number(cooldownMs) || 60_000);
  let pendingBreak = false;
  let transition = null;
  let preparation = null;
  let ready = false;
  let generation = 0;
  let lastShownAt = -Infinity;

  function preload() {
    if (ready) return Promise.resolve(true);
    if (preparation) return preparation;
    const requestedGeneration = generation;
    const request = Promise.resolve().then(() => adapter.prepare()).then(
      loaded => {
        if (requestedGeneration !== generation) return false;
        ready = loaded === true;
        return ready;
      },
      () => false,
    );
    preparation = request.finally(() => { preparation = null; });
    return preparation;
  }

  function waitForPrepared() {
    return new Promise(resolve => {
      let finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        clearTimer(timer);
        resolve(value);
      };
      const timer = setTimer(() => finish(false), Math.max(0, prepareTimeoutMs));
      preload().then(finish);
    });
  }

  function noteGameOver() {
    // Repeated game-over callbacks from the old round cannot queue another ad.
    if (!transition) pendingBreak = true;
  }

  function beforeNextRound() {
    if (transition) return transition;
    if (!pendingBreak) return Promise.resolve({ shown: false, reason: 'no-game-over' });
    pendingBreak = false;

    transition = Promise.resolve().then(async () => {
      if (!canPresent()) return { shown: false, reason: 'background' };
      if (now() - lastShownAt < cooldown) return { shown: false, reason: 'cooldown' };
      if (!(await waitForPrepared())) return { shown: false, reason: 'unavailable' };
      if (!canPresent()) return { shown: false, reason: 'background' };

      ready = false;
      let shown = false;
      const onShown = () => {
        if (shown) return;
        shown = true;
        lastShownAt = now();
      };
      // No Promise.race here: gameplay must never resume underneath a native ad.
      const outcome = await adapter.show({ onShown });
      if (outcome === 'dismissed') onShown();
      void preload();
      return { shown, reason: outcome };
    }).finally(() => { transition = null; });
    return transition;
  }

  function invalidate() {
    generation += 1;
    ready = false;
  }

  return { preload, noteGameOver, beforeNextRound, invalidate };
}

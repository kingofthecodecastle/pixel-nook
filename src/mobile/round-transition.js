// One gate for buttons, keyboard, touch, cabinet controls and gamepads.
// Leave all cartridge physics/rendering untouched.
export function guardRoundTransitions(game, { isOver, isCurrent, transition, canRestart = () => true, canAutoStart = () => true }) {
  const wrapped = Object.create(game);
  let busy = false;
  wrapped.restart = async ({ autoStart = false } = {}) => {
    if (busy || !isCurrent(wrapped) || !canRestart()) return false;
    if (!isOver()) { game.restart(); if (autoStart && canAutoStart()) game.start?.(); return true; }
    busy = true;
    try {
      await transition();
      if (!isCurrent(wrapped) || !canRestart()) return false;
      game.restart();
      if (autoStart && canAutoStart()) game.start?.();
      return true;
    } finally { busy = false; }
  };
  wrapped.onKey = (event) => {
    if (busy || !isCurrent(wrapped)) { event.preventDefault?.(); return; }
    if (isOver() && (event.code === 'KeyR' || String(event.key).toLowerCase() === 'r')) {
      event.preventDefault?.();
      if (!event.repeat) void wrapped.restart();
      return;
    }
    return game.onKey?.(event);
  };
  for (const method of ['start', 'setDir', 'turnLeft', 'turnRight', 'action', 'hardDrop', 'togglePause']) {
    if (game[method]) wrapped[method] = (...args) => busy || !isCurrent(wrapped) ? undefined : game[method](...args);
  }
  return wrapped;
}

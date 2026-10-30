// "Game info" texts shown by the (i) button in the menu and in each game.
export const INFO = {
  snake: {
    goal: 'Eat the food and grow as long as you can. The speed keeps increasing.',
    keys: ['Arrows / WASD: steer', 'P / Esc: pause · R: restart'],
    pad: ['D-pad / stick: steer', 'Start: pause · A / ✕ after game over: new round'],
    touch: ['D-pad: steer', 'Tap anywhere: turn left'],
    rules: ['You die if you hit the wall or yourself.'],
  },
  blockdrop: {
    goal: 'Stack the falling pieces and complete full rows to clear them. Each new level drops faster.',
    keys: ['←/→: move · ↑ / W / X: rotate', '↓: soft drop · Space / Enter: hard drop', 'P / Esc: pause'],
    pad: ['D-pad / stick ←/→: move · ↓: soft drop · ↑ / B / ○: rotate', 'A / ✕: hard drop · Start: pause'],
    touch: ['D-pad: move / rotate / soft drop', '●: hard drop · tap the screen: rotate'],
    rules: ['The game ends when the pieces reach the top.', 'Clearing several rows at once scores more.'],
  },
  mazemunch: {
    goal: 'Eat every dot in the maze.',
    keys: ['Arrows / WASD: move', 'P / Esc: pause'],
    pad: ['D-pad / stick: move', 'Start: pause'],
    touch: ['D-pad: move'],
    rules: ['The ghost is chasing you – get caught and you lose a life.', '3 lives.'],
  },
  starblaster: {
    goal: 'Shoot down every alien in each wave. Every wave is faster.',
    keys: ['←/→: move', 'Space / ↑: fire (hold for autofire)', 'P / Esc: pause'],
    pad: ['D-pad / stick: move', 'A / ✕: fire (hold) · Start: pause'],
    touch: ['◀ ▶: move', '● / ▲: fire (hold)'],
    rules: ['Dodge their shots.', 'If the aliens reach the bottom, it’s over.', '3 lives.'],
  },
  brickbash: {
    goal: 'Keep the ball in play with your paddle and smash all the bricks.',
    keys: ['←/→: move the paddle', 'Space / ↑: launch the ball', 'P / Esc: pause'],
    pad: ['D-pad / stick: move the paddle', 'A / ✕: launch the ball · Start: pause'],
    touch: ['◀ ▶: move', '●: launch the ball'],
    rules: ['Let the ball past your paddle and you lose a life.', 'Power-ups: W wide paddle · M multiball · S slow ball · + extra life.'],
  },
  froghop: {
    goal: 'Get the frog across the road and the river and fill all 4 homes (the bays at the top) before time runs out.',
    keys: ['Arrows / WASD: hop one square', 'Space: hop forward', 'P / Esc: pause'],
    pad: ['D-pad / stick: hop one square', 'A / ✕: hop forward · Start: pause'],
    touch: ['D-pad: hop'],
    rules: [
      'Cars on the road kill on contact.',
      'The river (blue) is deadly – you can’t swim! Hop onto the logs and ride them.',
      'If a log carries you off the screen, you die.',
      'Hop straight into an empty home bay – hit the hedge next to it and you die.',
      'Timer bar bottom right: if it runs out, you lose a life. 3 lives.',
    ],
  },
  asteroiddrift: {
    goal: 'Blast the asteroids to pieces. Big rocks split into smaller, faster ones.',
    keys: ['←/→: rotate · ↑: thrust · ↓: brake', 'Space: fire', 'P / Esc: pause'],
    pad: ['D-pad / stick: rotate · ↑ thrust · ↓ brake', 'A / ✕: fire · Start: pause'],
    touch: ['D-pad: rotate / thrust / brake', '●: fire'],
    rules: ['Hitting a rock costs a life.', 'Space wraps around at the edges.'],
  },
  pixelpaddle: {
    goal: 'Table tennis – first to 7 wins. Play the CPU or a friend.',
    keys: ['Menu: ↑/↓ + Space, or 1 / 2', '1P: ↑/↓ or W/S', '2P: left W/S, right ↑/↓'],
    pad: ['Menu: ↑/↓ + A / ✕', '1P: controller 1 ↑/↓', '2P: controller 1 = left, controller 2 = right', 'Start: pause'],
    touch: ['▲ ▼: move left paddle', '●: start'],
    rules: ['High scores are only saved in 1-player mode.'],
  },
  ladderclimb: {
    goal: 'Climb the ladders all the way to the goal at the top.',
    keys: ['←/→: walk · ↑/↓: climb at a ladder', 'Space (or ↑ away from a ladder): jump', 'P / Esc: pause'],
    pad: ['D-pad / stick: walk / climb', 'A / ✕: jump · Start: pause'],
    touch: ['D-pad: walk / climb', '●: jump'],
    rules: ['Rolling barrels cost a life.', 'Jumping over a barrel = +100.'],
  },
  neonracer: {
    goal: 'Drive as far as you can on the endless highway.',
    keys: ['←/→: steer', '↑ / Space: boost (extra points)', '↓: brake', 'P / Esc: pause'],
    pad: ['D-pad / stick: steer · ↑ boost · ↓ brake', 'A / ✕: boost · Start: pause'],
    touch: ['D-pad: steer / brake', '●: boost'],
    rules: ['Crashing into traffic costs a life.'],
  },
  moondrop: {
    goal: 'Land your craft gently on the flat pad. Each level: stronger gravity, narrower pads, and wind from level 3.',
    keys: ['←/→: tilt', '↑ / Space: engine (hold)', 'P / Esc: pause'],
    pad: ['D-pad / stick ←/→: tilt', 'A / ✕ or ↑: engine (hold) · Start: pause'],
    touch: ['◀ ▶: tilt', '▲ / ●: engine'],
    rules: [
      'Limited fuel – save it, leftovers give a bonus.',
      'Land slowly (V and H green) and upright, with both legs on the pad.',
      'Small pads give ×2 / ×3. A crash costs a life. 3 lives.',
    ],
  },
  tankduel: {
    goal: 'Tanks in a maze – first to 5 hits wins. New maze every round.',
    keys: ['Menu: ↑/↓ + Space, or 1 / 2', '1P: arrows/WASD drive · Space/Enter/Q fire', '2P: left WASD + Space/Q · right arrows + Enter/Shift/.'],
    pad: ['Menu: ↑/↓ + A / ✕', 'Drive with d-pad / stick · A / ✕: fire', '2P: controller 1 = green, controller 2 = red', 'Start: pause'],
    touch: ['D-pad: drive (left tank)', '●: fire / start'],
    rules: ['Shells bounce off walls – you can hit yourself!', 'Max 4 shells out at once.', 'High scores are only saved in 1-player mode.'],
  },
};

// Shown under every game's gamepad section
export const PAD_COMMON = ['Y / △: this info · Select / Share: back to the cabinet', 'RB / R1: fullscreen on/off', 'LB / L1: switch camera'];
// Shown under every game's keyboard section
export const KEYS_COMMON = ['F: fullscreen on/off', 'C: switch camera (CLASSIC → CHASE → FIRST PERSON)'];

// What CHASE and FIRST PERSON mean in each cart (the CAMERA button / C key / LB cycles them; saved per game)
export const CAM_NOTES = {
  snake: ['CHASE: low and close behind the head, turning with you.', 'FIRST PERSON: eye level from the head.', 'Steering (below): RELATIVE = ◀ ▶ turn left/right from where the head points (▲ ▼ do nothing); ABSOLUTE = arrows are compass directions like the classic view.'],
  mazemunch: ['CHASE: behind Munch, turning down each corridor.', 'FIRST PERSON: eye level in the maze.', 'Steering (below): RELATIVE = ◀ ▶ take the next left/right turn, ▼ turns around; ABSOLUTE = arrows are compass directions.'],
  blockdrop: ['No "forward" here, so CHASE is a low, dramatic view from the floor of the well, looking up at the falling piece.', 'FIRST PERSON: right at floor level of the well. Controls are unchanged.'],
  starblaster: ['CHASE: behind and above your ship, looking up the screen at the swarm.', 'FIRST PERSON: cockpit view. Controls are unchanged.'],
  brickbash: ['No real heading, so CHASE sits low behind the paddle and looks across the wall of bricks.', 'FIRST PERSON: paddle-level view. Controls are unchanged.'],
  froghop: ['CHASE: behind the frog, looking across the road and river.', 'FIRST PERSON: frog eye level. Controls are unchanged.'],
  asteroiddrift: ['CHASE: behind the ship, turning as it rotates.', 'FIRST PERSON: cockpit view. Rotate/thrust controls already work relative to the ship.'],
  pixelpaddle: ['No real heading, so CHASE sits low behind your paddle and looks down the table.', 'FIRST PERSON: paddle-level view. In CHASE / FIRST PERSON, ◀ ▶ also slide the paddle (as you see it).'],
  ladderclimb: ['CHASE: behind the climber, looking up the girders.', 'FIRST PERSON: eye level. Controls are unchanged.'],
  neonracer: ['CHASE: behind the car, looking down the road.', 'FIRST PERSON: driver\'s seat. Controls are unchanged.'],
  moondrop: ['CHASE: a low-angle view from the landing zone, looking up at the lander.', 'FIRST PERSON: a cockpit cam just above the lander (screen-up stays up, so controls are unchanged).'],
  tankduel: ['CHASE: behind the green tank, turning with its turret.', 'FIRST PERSON: from the hatch. Drive controls already work relative to the tank.', 'In 2-player mode the camera follows the green tank.'],
};

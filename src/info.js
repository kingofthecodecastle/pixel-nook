// "Game info" texts (Norwegian) shown by the (i) button in the menu and in each game.
export const INFO = {
  snake: {
    goal: 'Spis maten og bli så lang som mulig. Farten øker etter hvert.',
    keys: ['Piler / WASD: styr', 'P / Esc: pause · R: start på nytt'],
    touch: ['D-pad: styr', 'Trykk hvor som helst: sving til venstre'],
    rules: ['Du dør hvis du treffer veggen eller deg selv.'],
  },
  blockdrop: {
    goal: 'Stable fallende brikker og fyll hele rader for å fjerne dem. Nytt nivå = raskere fall.',
    keys: ['←/→: flytt · ↑ / W / X: roter', '↓: myk drop · Space / Enter: hard drop', 'P / Esc: pause'],
    touch: ['D-pad: flytt / roter / myk drop', '●: hard drop · trykk på skjermen: roter'],
    rules: ['Spillet er over når brikkene når toppen.', 'Flere rader samtidig gir mer poeng.'],
  },
  mazemunch: {
    goal: 'Spis alle prikkene i labyrinten.',
    keys: ['Piler / WASD: gå', 'P / Esc: pause'],
    touch: ['D-pad: gå'],
    rules: ['Spøkelset jager deg – blir du tatt, mister du et liv.', '3 liv.'],
  },
  starblaster: {
    goal: 'Skyt ned alle romvesenene i hver bølge. Hver bølge er raskere.',
    keys: ['←/→: flytt', 'Space / ↑: skyt (hold for autofire)', 'P / Esc: pause'],
    touch: ['◀ ▶: flytt', '● / ▲: skyt (hold)'],
    rules: ['Unngå skuddene deres.', 'Når romvesenene når bunnen, er det slutt.', '3 liv.'],
  },
  brickbash: {
    goal: 'Hold ballen i spill med racketen og knus alle klossene.',
    keys: ['←/→: flytt racketen', 'Space / ↑: send ballen', 'P / Esc: pause'],
    touch: ['◀ ▶: flytt', '●: send ballen'],
    rules: ['Slipper ballen forbi racketen, mister du et liv.', 'Power-ups: W bred racket · M multiball · S treg ball · + ekstra liv.'],
  },
  froghop: {
    goal: 'Få frosken over veien og elven og fyll alle 4 hjem (lommene øverst) før tiden går ut.',
    keys: ['Piler / WASD: hopp én rute', 'Space: hopp fremover', 'P / Esc: pause'],
    touch: ['D-pad: hopp'],
    rules: [
      'Bilene på veien dreper ved kontakt.',
      'Elven (blått) dreper – du kan ikke svømme! Hopp på stokkene og la dem frakte deg.',
      'Blir du båret ut av skjermen på en stokk, dør du.',
      'Hopp rett inn i en ledig hjemmelomme – treffer du hekken ved siden av, dør du.',
      'Tidslinjen nede til høyre: går den tom, mister du et liv. 3 liv.',
    ],
  },
  asteroiddrift: {
    goal: 'Skyt asteroidene i stykker. Store steiner deler seg i mindre og raskere.',
    keys: ['←/→: roter · ↑: gass · ↓: brems', 'Space: skyt', 'P / Esc: pause'],
    touch: ['D-pad: roter / gass / brems', '●: skyt'],
    rules: ['Kollisjon med en stein koster et liv.', 'Rommet henger sammen i kantene.'],
  },
  pixelpaddle: {
    goal: 'Bordtennis – først til 7 vinner. Spill mot CPU eller en venn.',
    keys: ['Meny: ↑/↓ + Space, eller 1 / 2', '1P: ↑/↓ eller W/S', '2P: venstre W/S, høyre ↑/↓'],
    touch: ['▲ ▼: flytt venstre racket', '●: start'],
    rules: ['Highscore lagres bare i 1-spiller.'],
  },
  ladderclimb: {
    goal: 'Klatre stigene helt til målet på toppen.',
    keys: ['←/→: gå · ↑/↓: klatre ved en stige', 'Space (eller ↑ borte fra stige): hopp', 'P / Esc: pause'],
    touch: ['D-pad: gå / klatre', '●: hopp'],
    rules: ['Rullende tønner koster et liv.', 'Hopp over en tønne = +100.'],
  },
  neonracer: {
    goal: 'Kjør så langt du kan på den endeløse motorveien.',
    keys: ['←/→: styr', '↑ / Space: boost (ekstra poeng)', '↓: brems', 'P / Esc: pause'],
    touch: ['D-pad: styr / brems', '●: boost'],
    rules: ['Krasj i trafikken koster et liv.'],
  },
  moondrop: {
    goal: 'Land fartøyet forsiktig på den flate plattformen. Hvert nivå: sterkere gravitasjon, smalere plattform og vind fra nivå 3.',
    keys: ['←/→: tilt', '↑ / Space: motor (hold)', 'P / Esc: pause'],
    touch: ['◀ ▶: tilt', '▲ / ●: motor'],
    rules: [
      'Begrenset drivstoff – spar på det, resten gir bonus.',
      'Land sakte (V og H grønne) og rett opp, med begge bein på plattformen.',
      'Små plattformer gir ×2 / ×3. Krasj koster et liv. 3 liv.',
    ],
  },
  tankduel: {
    goal: 'Tanks i labyrint – først til 5 treff vinner. Ny labyrint hver runde.',
    keys: ['Meny: ↑/↓ + Space, eller 1 / 2', '1P: piler/WASD kjør · Space/Enter/F skyt', '2P: venstre WASD + Space/F/Q · høyre piler + Enter/Shift/.'],
    touch: ['D-pad: kjør (venstre tank)', '●: skyt / start'],
    rules: ['Skuddene spretter i veggene – du kan treffe deg selv!', 'Maks 4 skudd ute samtidig.', 'Highscore lagres bare i 1-spiller.'],
  },
};

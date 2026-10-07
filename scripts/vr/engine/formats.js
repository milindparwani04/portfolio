// The only format bundled into the Victory Road engine (replaces Showdown's config/formats.ts).
//
// Reg M-B mechanics from the championsregmb mod (Pokémon Champions stat points, its Mega Evolutions,
// items and move changes) in doubles with team preview and bring 4 — the 2026 Worlds format. Two
// deliberate Victory Road changes, documented in docs/victory-road-build.md:
//   - no Obtainable / roster rule, so the player's team can be any Gen I-IX Pokémon;
//   - Level Clause Mod instead of "Adjust Level = 50", so Level Cap 45 can put the player at Lv 45
//     while the champion stays at Lv 50 (the stats at Lv 50 are identical either way).
// Teams are built by the engine, never typed in, so no team validator runs.
export const Formats = [
  { section: 'Victory Road' },
  {
    name: '[Gen 9 Champions] Victory Road',
    mod: 'championsregmb',
    gameType: 'doubles',
    ruleset: ['Team Preview', 'Picked Team Size = 4', 'Species Clause', 'Item Clause = 1', 'Level Clause Mod', 'Endless Battle Clause'],
  },
];

// The champion's team: Takuma Yamazaki's 2026 Pokémon VGC Masters World Championship team
// (Regulation Set M-B), piloted in this game by Ren Kestrel, an original fictional character.
// Ren's dialogue, strategy and move variations are this game's fiction, not statements or
// strategies of Takuma Yamazaki (credited in the game's credits for the team sheet only).
//
// Official (open team sheet, pokemon.com/uk/play-pokemon/worlds/2026/vgc-masters): species, items,
// abilities, natures and the `official` moves below.
// Community reconstruction (championsdex.app/teams/community-mb861): stat points ("evs" here — the
// Champions mod reads them as stat points). IVs are unpublished; Showdown's default (31) is assumed.
//
// Species, forms, items, abilities, natures and stat points never change. Moves are drawn per
// battle from curated variants (TEMPLATE_VERSION) that suit the fixed item, ability and nature:
// no Protect or status moves on the Choice Scarf Garchomp, special attacks on the Modest Dragonite,
// and so on. Every move is checked against the species' learnset by tests/vr/engine.test.mjs.
export const TEMPLATE_VERSION = 1;

export const CHAMPION = {
  name: 'Ren Kestrel',
  short: 'Ren',
  label: 'Ren Kestrel · Reigning Champion',
  team: [
    { species: 'Floette-Eternal', item: 'Floettite', ability: 'Flower Veil', nature: 'Timid',
      moves: ['Moonblast', 'Dazzling Gleam', 'Light of Ruin', 'Protect'], evs: { hp: 4, atk: 0, def: 8, spa: 32, spd: 0, spe: 22 } },
    { species: 'Basculegion', gender: 'M', item: 'Life Orb', ability: 'Adaptability', nature: 'Adamant',
      moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect'], evs: { hp: 4, atk: 18, def: 4, spa: 0, spd: 15, spe: 25 } },
    { species: 'Kingambit', item: 'Chople Berry', ability: 'Defiant', nature: 'Adamant',
      moves: ['Sucker Punch', 'Kowtow Cleave', 'Low Kick', 'Iron Head'], evs: { hp: 32, atk: 15, def: 0, spa: 0, spd: 19, spe: 0 } },
    { species: 'Dragonite', item: 'Dragoninite', ability: 'Multiscale', nature: 'Modest',
      moves: ['Dragon Pulse', 'Heat Wave', 'Extreme Speed', 'Protect'], evs: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 } },
    { species: 'Garchomp', item: 'Choice Scarf', ability: 'Rough Skin', nature: 'Adamant',
      moves: ['Dragon Claw', 'Stomping Tantrum', 'Earthquake', 'Rock Slide'], evs: { hp: 10, atk: 20, def: 9, spa: 0, spd: 0, spe: 27 } },
    { species: 'Sneasler', item: 'Focus Sash', ability: 'Poison Touch', nature: 'Jolly',
      moves: ['Close Combat', 'Dire Claw', 'Fake Out', 'Feint'], evs: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } },
  ],
};

// Variants per species. `w` weights the draw (the official set is the most likely). `roles` are
// what the set brings to the team: damage, spread, protect, priority, speed (speed control),
// disrupt, setup, coverage, support.
export const VARIANTS = {
  'Floette-Eternal': [
    { key: 'official', w: 3, moves: ['Moonblast', 'Dazzling Gleam', 'Light of Ruin', 'Protect'], roles: ['damage', 'spread', 'protect'] },
    { key: 'calm-mind', w: 2, moves: ['Calm Mind', 'Moonblast', 'Dazzling Gleam', 'Protect'], roles: ['setup', 'spread', 'protect'] },
    { key: 'support', w: 2, moves: ['Moonblast', 'Dazzling Gleam', 'Helping Hand', 'Protect'], roles: ['spread', 'support', 'protect'] },
    { key: 'coverage', w: 1, moves: ['Light of Ruin', 'Dazzling Gleam', 'Psychic', 'Protect'], roles: ['damage', 'coverage', 'protect'] },
  ],
  Basculegion: [
    { key: 'official', w: 3, moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect'], roles: ['damage', 'priority', 'protect'] },
    { key: 'psychic-fangs', w: 2, moves: ['Wave Crash', 'Last Respects', 'Psychic Fangs', 'Protect'], roles: ['damage', 'coverage', 'protect'] },
    { key: 'pivot', w: 1, moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Flip Turn'], roles: ['damage', 'priority'] },
  ],
  Kingambit: [
    { key: 'official', w: 3, moves: ['Sucker Punch', 'Kowtow Cleave', 'Low Kick', 'Iron Head'], roles: ['damage', 'priority', 'coverage'] },
    { key: 'protect', w: 2, moves: ['Sucker Punch', 'Kowtow Cleave', 'Iron Head', 'Protect'], roles: ['damage', 'priority', 'protect'] },
    { key: 'swords-dance', w: 2, moves: ['Swords Dance', 'Kowtow Cleave', 'Sucker Punch', 'Protect'], roles: ['setup', 'priority', 'protect'] },
  ],
  Dragonite: [
    { key: 'official', w: 3, moves: ['Dragon Pulse', 'Heat Wave', 'Extreme Speed', 'Protect'], roles: ['damage', 'spread', 'priority', 'protect'] },
    { key: 'tailwind', w: 2, moves: ['Draco Meteor', 'Heat Wave', 'Tailwind', 'Protect'], roles: ['speed', 'spread', 'protect'] },
    { key: 'coverage', w: 2, moves: ['Dragon Pulse', 'Hurricane', 'Ice Beam', 'Protect'], roles: ['damage', 'coverage', 'protect'] },
  ],
  Garchomp: [
    { key: 'official', w: 3, moves: ['Dragon Claw', 'Stomping Tantrum', 'Earthquake', 'Rock Slide'], roles: ['damage', 'spread', 'coverage'] },
    { key: 'spread', w: 2, moves: ['Earthquake', 'Rock Slide', 'Scale Shot', 'Poison Jab'], roles: ['spread', 'coverage'] },
    { key: 'coverage', w: 2, moves: ['Dragon Claw', 'Earthquake', 'Iron Head', 'Fire Fang'], roles: ['damage', 'spread', 'coverage'] },
  ],
  Sneasler: [
    { key: 'official', w: 3, moves: ['Close Combat', 'Dire Claw', 'Fake Out', 'Feint'], roles: ['damage', 'disrupt'] },
    { key: 'protect', w: 2, moves: ['Close Combat', 'Dire Claw', 'Fake Out', 'Protect'], roles: ['damage', 'disrupt', 'protect'] },
    { key: 'throat-chop', w: 2, moves: ['Close Combat', 'Gunk Shot', 'Fake Out', 'Throat Chop'], roles: ['damage', 'disrupt', 'coverage'] },
  ],
};

// One coherent configuration for a battle, from the champion's own seeded stream (separate from
// the simulator's and the AI's). Team rules: at least two Protect users, and the team keeps a way
// to move first (priority, Fake Out or Tailwind); a draw that breaks a rule is redrawn (bounded).
// Different seeds can repeat a configuration; nothing promises uniqueness.
export function championTeam(rand) {
  const pick = (list) => {
    const total = list.reduce((s, v) => s + v.w, 0);
    let r = rand() * total;
    for (const v of list) { r -= v.w; if (r < 0) return v; }
    return list[list.length - 1];
  };
  let chosen = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const draw = CHAMPION.team.map((set) => pick(VARIANTS[set.species]));
    const roles = draw.flatMap((v) => v.roles);
    const protects = roles.filter((r) => r === 'protect').length;
    const tempo = roles.includes('priority') || roles.includes('speed') || roles.includes('disrupt');
    chosen = draw;
    if (protects >= 2 && tempo) break;
  }
  return {
    version: TEMPLATE_VERSION,
    variants: chosen.map((v) => v.key),
    team: CHAMPION.team.map((set, i) => ({ ...set, moves: chosen[i].moves.slice() })),
  };
}

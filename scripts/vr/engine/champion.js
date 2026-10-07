// Takuma Yamazaki's 2026 Pokémon VGC Masters World Championship team (Regulation Set M-B).
//
// Official (open team sheet, pokemon.com/uk/play-pokemon/worlds/2026/vgc-masters): species, items,
// abilities, natures and moves.
// Community reconstruction (championsdex.app/teams/community-mb861): stat points ("evs" here — the
// Champions mod reads them as stat points). IVs are unpublished; Showdown's default (31) is assumed.
// Nicknames, genders beyond Basculegion's (male form) and AI behaviour are not facts about him.
export const CHAMPION = {
  name: 'Takuma Yamazaki',
  label: 'Takuma Yamazaki · Japan · 2026 VGC Masters World Champion',
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

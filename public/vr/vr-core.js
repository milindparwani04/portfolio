// Victory Road core: pure setup logic shared by the page (window.VRCore) and the Node tests
// (tests/vr/*.test.mjs). No DOM access here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VRCore = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEAM_SIZE = 6;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

  // Least reward contribution first, the hardest last (Victory Road master prompt, 2026-10-07).
  // Level Cap 45 replaces "Level Cap 50": at Worlds every Pokémon is already set to Lv 50, so a cap
  // of 50 changes nothing. Here the player's team is Lv 45 against the champion's Lv 50 — a Victory
  // Road rule, not a Worlds rule (Milind, 2026-10-07).
  const MODS = [
    { k: 'shiny', label: 'All shiny', note: 'Your Pokémon use their shiny colours. Cosmetic only.', m: 1 },
    { k: 'taunts', label: 'Trainer taunts', note: 'The champion quips after each of your moves. Cosmetic only.', m: 1 },
    { k: 'items', label: 'Random held items', note: 'Each of your Pokémon holds a random item, no two the same.', m: 1.1 },
    { k: 'chaos', label: 'Chaotic replacement', note: 'When one of yours faints, its replacement is picked at random.', m: 1.15 },
    { k: 'noswitch', label: 'No switching', note: 'You can’t switch out. Replacing a fainted Pokémon still works.', m: 1.2 },
    { k: 'nopotions', label: 'No potions', note: 'Your bag’s two Potions are gone.', m: 1.25 },
    { k: 'random', label: 'Random team', note: 'Six Pokémon from your generations, hidden until battle.', m: 1.35 },
    { k: 'moves', label: 'Random moves', note: 'Every Pokémon gets four random moves it can learn.', m: 1.5 },
    { k: 'cap', label: 'Level cap 45', note: 'Your team is Lv 45; the champion stays at Lv 50. (At Worlds everyone is Lv 50.)', m: 1.75 }
  ];
  const TIERS = [['Master', 4], ['Gold', 2.5], ['Silver', 1.75], ['Bronze', 1]];

  // Multipliers compound (multiply), as the original Champion Run setup did. All nine: x6.72.
  function multiplier(mods) {
    return MODS.reduce((acc, m) => acc * (mods && mods[m.k] ? m.m : 1), 1);
  }
  function tier(mult) {
    return TIERS.find((t) => mult >= t[1] - 1e-9)[0];
  }

  // Seeded PRNG (mulberry32). Battles and random teams take a seed so tests can replay them.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
  }

  // Unbiased Fisher-Yates.
  function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Species Clause: one Pokémon per National Dex number (so not Rotom and Rotom-Wash together).
  function rollTeam(pool, rand) {
    const seen = new Set();
    const team = [];
    for (const entry of shuffle(pool, rand)) {
      if (seen.has(entry.num)) continue;
      seen.add(entry.num);
      team.push(entry.id);
      if (team.length === TEAM_SIZE) break;
    }
    return team;
  }

  function eligible(pool, setup) {
    const gens = setup.mode === 'single' ? [setup.gen] : setup.gens;
    return pool.filter((entry) => gens.includes(entry.gen));
  }

  // Moves the Pokémon at `from` to `to`, shifting the others along. Never duplicates or drops one.
  function moveSlot(team, from, to) {
    const out = team.slice();
    if (from < 0 || from >= out.length) return out;
    const target = Math.max(0, Math.min(out.length - 1, to));
    const [picked] = out.splice(from, 1);
    out.splice(target, 0, picked);
    return out;
  }

  // Adds one Pokémon; returns { team, error }. Errors are user-facing copy.
  function addToTeam(team, entry, byId) {
    if (team.includes(entry.id)) return { team, error: `${entry.name} is already on your team.` };
    if (team.length >= TEAM_SIZE) return { team, error: 'Team is full. Remove one first.' };
    const clash = team.find((id) => byId[id] && byId[id].num === entry.num);
    if (clash) return { team, error: `Only one of each species: ${byId[clash].name} is already on your team.` };
    return { team: [...team, entry.id], error: '' };
  }

  // Modifier combinations: none are impossible, but some change how others behave. Returned notes
  // are shown under the list so the interaction is never a surprise.
  function modNotes(mods) {
    const notes = [];
    if (mods.noswitch && mods.chaos) notes.push('No switching + chaotic replacement: you never choose who comes in.');
    if (mods.random && mods.moves) notes.push('Random team + random moves: everything is a surprise until the battle starts.');
    return notes;
  }

  // What is saved to localStorage. A hidden random team is never saved: it lives only in memory and
  // is rerolled after a reload, so it can't be read back out of storage.
  function serialize(setup) {
    return JSON.stringify({
      v: 2, mode: setup.mode, gen: setup.gen, gens: setup.gens, mods: setup.mods,
      team: setup.mods.random ? [] : setup.team
    });
  }
  function restore(raw, byId) {
    const base = { mode: 'cross', gen: 1, gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], team: [], mods: {} };
    MODS.forEach((m) => { base.mods[m.k] = false; });
    let saved = null;
    try { saved = JSON.parse(raw || 'null'); } catch (_) { saved = null; }
    if (!saved || typeof saved !== 'object') return base;
    const setup = { ...base };
    if (saved.mode === 'single' || saved.mode === 'cross') setup.mode = saved.mode;
    if (Number.isInteger(saved.gen) && saved.gen >= 1 && saved.gen <= 9) setup.gen = saved.gen;
    if (Array.isArray(saved.gens)) {
      const gens = [...new Set(saved.gens.filter((g) => Number.isInteger(g) && g >= 1 && g <= 9))].sort((a, b) => a - b);
      if (gens.length) setup.gens = gens;
    }
    if (saved.mods && typeof saved.mods === 'object') MODS.forEach((m) => { setup.mods[m.k] = saved.mods[m.k] === true; });
    // Old Champion Run saves stored display names; v2 stores ids. Unknown entries are dropped.
    if (Array.isArray(saved.team) && !setup.mods.random) {
      let team = [];
      saved.team.forEach((id) => {
        const key = typeof id === 'string' ? id.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        if (byId[key]) team = addToTeam(team, byId[key], byId).team;
      });
      setup.team = team;
    }
    return setup;
  }

  // A battle set from a /vr/sets.json row: [ability, item, nature, moves, "hp,atk,def,spa,spd,spe"].
  function toSet(entry, row, opts) {
    const [ability, item, nature, moves, points] = row;
    const [hp, atk, def, spa, spd, spe] = points.split(',').map(Number);
    const set = { species: entry.name, name: entry.name.split('-')[0], ability, item, nature, moves: moves.slice(), evs: { hp, atk, def, spa, spd, spe } };
    if (opts && opts.shiny) set.shiny = true;
    return set;
  }

  // Random Held Items draws from these, never repeating within a team (Item Clause). Ordinary held
  // items that work for any Pokémon in doubles; no Mega Stones, Z-Crystals or species items.
  const RANDOM_ITEMS = ['Sitrus Berry', 'Lum Berry', 'Leftovers', 'Life Orb', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Focus Sash',
    'Assault Vest', 'Rocky Helmet', 'Expert Belt', 'Muscle Band', 'Wise Glasses', 'Shell Bell', 'Mental Herb', 'White Herb', 'Safety Goggles',
    'Covert Cloak', 'Clear Amulet', 'Bright Powder', 'Scope Lens', 'Light Clay', 'Throat Spray', 'Weakness Policy', 'Air Balloon', 'Red Card',
    'Eject Button', 'Eject Pack', 'Mirror Herb', 'Loaded Dice', 'Punching Glove', 'Quick Claw', 'Kings Rock', 'Black Glasses', 'Charcoal',
    'Mystic Water', 'Miracle Seed', 'Magnet', 'Never-Melt Ice', 'Black Belt', 'Poison Barb', 'Soft Sand', 'Sharp Beak', 'Twisted Spoon',
    'Silver Powder', 'Hard Stone', 'Spell Tag', 'Dragon Fang', 'Metal Coat', 'Silk Scarf', 'Fairy Feather'];

  // Random Moves: four distinct moves from the Pokémon's learnable list (movepools.json), with at
  // least two attacks whenever it knows two, so no team is left unable to deal damage.
  function randomMoves(pool, moveNames, isAttack, rand) {
    const names = shuffle(pool.map((i) => moveNames[i]), rand);
    const attacks = names.filter(isAttack);
    const picked = attacks.slice(0, Math.min(2, attacks.length));
    for (const n of names) { if (picked.length >= 4) break; if (!picked.includes(n)) picked.push(n); }
    return picked;
  }

  // The player's battle team from the chosen ids and modifiers. data: { byId, sets, movepools,
  // attacks } where attacks is a Set of move names that deal damage. Seeded, so Retry with the
  // same seed rebuilds the same team.
  function buildTeam(ids, mods, seed, data) {
    const rand = rng(seed ^ 0x13579bdf);
    const items = mods.items ? shuffle(RANDOM_ITEMS, rand) : null;
    return ids.map((id, n) => {
      const set = toSet(data.byId[id], data.sets[id], { shiny: mods.shiny });
      if (items) set.item = items[n];
      if (mods.moves && data.movepools && data.movepools.pools[id] && data.movepools.pools[id].length) {
        set.moves = randomMoves(data.movepools.pools[id], data.movepools.moves, (m) => data.attacks.has(m), rand);
      }
      return set;
    });
  }

  // Engine rules from the chosen modifiers (cosmetic ones don't reach the engine).
  function engineRules(mods) {
    return { noSwitch: !!mods.noswitch, chaos: !!mods.chaos, noPotions: !!mods.nopotions, levelCap: !!mods.cap };
  }

  return { TEAM_SIZE, ROMAN, MODS, RANDOM_ITEMS, toSet, engineRules, buildTeam, randomMoves, TIERS, multiplier, tier, rng, newSeed, shuffle, rollTeam, eligible, moveSlot, addToTeam, modNotes, serialize, restore };
}));

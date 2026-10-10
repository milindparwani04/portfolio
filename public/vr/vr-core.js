// The Very Best core: pure game logic shared by the page (window.VRCore) and the Node tests
// (tests/vr/*.test.mjs). No DOM access here. (Technical paths still say "vr": the game was called
// Victory Road until 2026-10-10.)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VRCore = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEAM_SIZE = 6;
  // Doubles needs two on the field; with two to four you bring them all, with five or six you pick
  // four at team preview (Milind, 2026-10-10).
  const MIN_BATTLE = 2;
  const BRING = 4;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const DEFAULT_NAME = 'Challenger';

  // Least reward contribution first, the hardest last. Level Cap 45: the player's team is Lv 45
  // against the champion's Lv 50 (at Worlds everyone is Lv 50) — a game rule, not a Worlds rule.
  // `cosmetic` modifiers never move the difficulty spectrum.
  const MODS = [
    { k: 'shiny', label: 'All shiny', note: 'Your Pokémon use their shiny colours. Cosmetic only.', m: 1, cosmetic: true },
    { k: 'taunts', label: 'Trainer taunts', note: 'The champion reacts to each of your moves. Cosmetic only.', m: 1, cosmetic: true },
    { k: 'chaos', label: 'Chaotic replacement', note: 'When one of yours faints, its replacement is picked at random.', m: 1.15 },
    { k: 'noswitch', label: 'No switching', note: 'You can’t switch out. Replacing a fainted Pokémon still works.', m: 1.2 },
    { k: 'nopotions', label: 'No potions', note: 'Your bag’s two Potions are gone.', m: 1.25 },
    { k: 'random', label: 'Random team', note: 'Six random Pokémon from every generation, hidden until the battle: five fully evolved Pokémon and one legendary or mythical, each holding a random item. Your own party is kept.', m: 1.35 },
    { k: 'moves', label: 'Random moves', note: 'For this battle each Pokémon gets four random moves it can learn. Your chosen moves are kept for next time.', m: 1.5 },
    { k: 'cap', label: 'Level cap 45', note: 'Your team is Lv 45; the champion stays at Lv 50. (At Worlds everyone is Lv 50.)', m: 1.75 }
  ];
  const TIERS = [['Master', 4], ['Gold', 2.5], ['Silver', 1.75], ['Bronze', 1]];

  // Multipliers compound (multiply). All eight: x6.11.
  function multiplier(mods) {
    return MODS.reduce((acc, m) => acc * (mods && mods[m.k] ? m.m : 1), 1);
  }
  function tier(mult) {
    return TIERS.find((t) => mult >= t[1] - 1e-9)[0];
  }

  // Difficulty spectrum fill: the share of all handicap "weight" that is switched on, on a log
  // scale so it agrees with the compounding multiplier. 0 with no handicaps, 1 only with every
  // gameplay modifier. Cosmetic modifiers (x1.00) never count. A presentation of the configured
  // handicaps, not a measured win probability.
  function difficulty(mods) {
    let on = 0;
    let all = 0;
    MODS.forEach((m) => {
      if (m.m <= 1) return;
      all += Math.log(m.m);
      if (mods && mods[m.k]) on += Math.log(m.m);
    });
    return all ? Math.max(0, Math.min(1, on / all)) : 0;
  }
  const DIFFICULTY = [[1, 'The Very Best'], [0.75, 'Extreme'], [0.5, 'Brutal'], [0.25, 'Hard']];
  function difficultyLabel(p) {
    if (p <= 1e-9) return 'Standard';
    const hit = DIFFICULTY.find((d) => p >= d[0] - 1e-9);
    return hit ? hit[1] : 'Tough';
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

  // Moves the item at `from` to `to`, shifting the others along. Never duplicates or drops one.
  function moveSlot(list, from, to) {
    const out = list.slice();
    if (from < 0 || from >= out.length) return out;
    const target = Math.max(0, Math.min(out.length - 1, to));
    const [picked] = out.splice(from, 1);
    out.splice(target, 0, picked);
    return out;
  }

  // ---------- Catalog ----------
  // Builds the lookup tables every other function takes, from the raw JSON files:
  // dex.json (pool), species.json, learnsets.json, items.json and sets.json. Any of the last four
  // may be missing while they load; functions that need them say so.
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function decodeLearnset(text) {
    let n = 0;
    return text ? text.split('.').map((x) => (n += parseInt(x, 36))) : [];
  }
  function catalog(raw) {
    const rows = (list) => list.map(([id, name, num, gen, form, types, has]) => ({ id, name, num, gen, form, types, has }));
    const pool = rows(raw.dex.pool);
    const battle = rows(raw.dex.battle || []);
    const byId = {};
    const baseByNum = {};
    [...pool, ...battle].forEach((e) => { byId[e.id] = e; });
    pool.forEach((e) => { if (!e.form) baseByNum[e.num] = e; });
    const cat = { pool, battle, byId, baseByNum, sets: raw.sets ? raw.sets.sets || raw.sets : null };
    if (raw.species) {
      cat.abilities = raw.species.abilities.map(([name, desc]) => ({ name, desc }));
      cat.species = {};
      Object.entries(raw.species.species).forEach(([id, r]) => {
        cat.species[id] = { base: { hp: r[0], atk: r[1], def: r[2], spa: r[3], spd: r[4], spe: r[5] }, abilities: r[6].map((i) => cat.abilities[i].name), cls: r[7], weight: r[8], final: r[9] === 1 };
      });
    }
    if (raw.learnsets) {
      cat.moves = raw.learnsets.moves.map(([name, type, category, power, accuracy, pp, priority, target, desc]) => ({ name, type, category: { P: 'Physical', S: 'Special', '-': 'Status' }[category], power, accuracy, pp, priority, target, desc }));
      cat.moveByName = {};
      cat.moves.forEach((m) => { cat.moveByName[m.name] = m; });
      cat.learnsetRaw = raw.learnsets.learnsets;
      cat.learnCache = {};
    }
    if (raw.items) {
      cat.items = raw.items.items.map(([name, desc, users, kind]) => ({ name, desc, users, kind }));
      cat.itemByName = {};
      cat.items.forEach((it) => { cat.itemByName[it.name] = it; });
    }
    return cat;
  }
  // The names of every move `id` can legally learn (see scripts/vr/build-catalog.mjs for the rule).
  function legalMoves(cat, id) {
    if (!cat.learnsetRaw) return null;
    if (!cat.learnCache[id]) cat.learnCache[id] = new Set(decodeLearnset(cat.learnsetRaw[id]).map((i) => cat.moves[i].name));
    return cat.learnCache[id];
  }
  const classOf = (cat, id) => (cat.species && cat.species[id] ? cat.species[id].cls : '');
  // Legendaries and mythicals share one allowance per party (Milind, 2026-10-10). Ultra Beasts and
  // Paradox Pokémon are not restricted.
  const isSpecial = (cat, id) => ['L', 'M'].includes(classOf(cat, id));
  const CLASS_NAME = { L: 'legendary', M: 'mythical', U: 'Ultra Beast', P: 'Paradox' };
  // Fully evolved (no further ordinary evolution; species.json, from the engine's evolution data).
  const isFinal = (cat, id) => !!(cat.species && cat.species[id] && cat.species[id].final);

  // ---------- Catalog search ----------
  // The 18 types. A query that is exactly a type name (any case) shows only Pokémon of that type,
  // dual types included; anything else matches name, National Dex number or form. Both respect the
  // generation filter (0: all).
  const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
  function typeQuery(query) {
    const q = String(query || '').trim().toLowerCase();
    return TYPES.find((t) => t.toLowerCase() === q) || '';
  }
  function searchKey(entry) {
    return `${entry.name.toLowerCase()} ${entry.num} ${String(entry.num).padStart(4, '0')} ${entry.form.toLowerCase()}`;
  }
  // Whether `entry` shows for this query and generation filter.
  function matches(entry, query, gen) {
    if (gen && entry.gen !== gen) return false;
    const type = typeQuery(query);
    if (type) return entry.types.includes(type);
    const q = String(query || '').trim().toLowerCase().replace(/^#/, '');
    return !q || searchKey(entry).includes(q);
  }

  // ---------- Party (draft loadout) ----------
  // A member: { uid, id, moves: [names], item, ability }. uid is stable through reordering, so
  // moves and items follow the Pokémon, never the slot.
  function defaultMember(cat, id, uid) {
    const row = cat.sets && cat.sets[id];
    const sp = cat.species && cat.species[id];
    if (!row) return { uid, id, moves: [], item: '', ability: sp ? sp.abilities[0] : '' };
    return { uid, id, moves: row[3].slice(0, 4), item: row[1] || '', ability: row[0] };
  }
  function nextUid(party) {
    let n = 1;
    party.forEach((m) => { const k = Number(String(m.uid).replace(/^m/, '')); if (k >= n) n = k + 1; });
    return `m${n}`;
  }
  // Why `entry` can't join `party`, or '' if it can. Errors are user-facing copy.
  function joinError(cat, party, entry) {
    if (party.length >= TEAM_SIZE) return 'Your party is full. Remove one first.';
    const clash = party.find((m) => cat.byId[m.id] && cat.byId[m.id].num === entry.num);
    if (clash) return `Only one of each species: ${cat.byId[clash.id].name} is already in your party.`;
    if (isSpecial(cat, entry.id)) {
      const other = party.find((m) => isSpecial(cat, m.id));
      if (other) return `Only one legendary or mythical Pokémon per party: ${cat.byId[other.id].name} is already in it.`;
    }
    return '';
  }
  // Default sets often share an item (Life Orb, Sitrus Berry, Eviolite...). Item Clause allows one
  // of each, so a newcomer whose default item is taken gets the first free general-purpose item
  // instead: casual players never have to fix a clash they didn't make.
  const FALLBACK_ITEMS = ['Sitrus Berry', 'Life Orb', 'Leftovers', 'Focus Sash', 'Lum Berry', 'Expert Belt', 'Rocky Helmet', 'Shell Bell',
    'Covert Cloak', 'Clear Amulet', 'Safety Goggles', 'Mental Herb', 'White Herb', 'Quick Claw', 'Scope Lens', 'Bright Powder'];
  function freeItem(party, member) {
    const taken = new Set(party.filter((m) => m.uid !== member.uid).map((m) => m.item).filter(Boolean));
    if (!member.item || !taken.has(member.item)) return member;
    const item = FALLBACK_ITEMS.find((it) => !taken.has(it)) || '';
    return { ...member, item };
  }
  function addMember(cat, party, entry) {
    const error = joinError(cat, party, entry);
    if (error) return { party, error };
    return { party: [...party, freeItem(party, defaultMember(cat, entry.id, nextUid(party)))], error: '' };
  }
  function removeMember(party, uid) {
    return party.filter((m) => m.uid !== uid);
  }
  function updateMember(party, uid, patch) {
    return party.map((m) => (m.uid === uid ? { ...m, ...patch, moves: (patch.moves || m.moves).slice() } : m));
  }

  // Problems with one member, as user-facing strings (empty: valid). Needs species, learnsets and
  // items in the catalog.
  function itemProblem(cat, id, itemName, moves) {
    if (!itemName) return '';
    const item = cat.itemByName && cat.itemByName[itemName];
    if (!item) return `${itemName} isn’t a held item in this game.`;
    const entry = cat.byId[id];
    if (item.users.length) {
      const base = entry.name.split('-')[0];
      if (!item.users.some((u) => u === entry.name || u === base || (entry.form && u === `${base}-${entry.form}`))) return `${item.name} only works for ${item.users.slice(0, 3).join(', ')}${item.users.length > 3 ? '…' : ''}.`;
    }
    if (item.kind === 'choice' && moves && cat.moveByName && !moves.some((n) => cat.moveByName[n] && cat.moveByName[n].category !== 'Status')) {
      return `${item.name} locks its holder into one move: give it at least one attack.`;
    }
    return '';
  }
  function memberProblems(cat, m) {
    const out = [];
    const entry = cat.byId[m.id];
    if (!entry) return ['Unknown Pokémon.'];
    const legal = legalMoves(cat, m.id);
    if (!Array.isArray(m.moves) || m.moves.length < 1) out.push('Give it at least one move.');
    else {
      if (m.moves.length > 4) out.push('Four moves at most.');
      if (new Set(m.moves).size !== m.moves.length) out.push('Each move can only be chosen once.');
      if (legal) m.moves.forEach((n) => { if (!legal.has(n)) out.push(`${entry.name} can’t learn ${n}.`); });
    }
    const sp = cat.species && cat.species[m.id];
    if (sp && !sp.abilities.includes(m.ability)) out.push(`${entry.name} can’t have ${m.ability || 'no ability'}.`);
    const ip = itemProblem(cat, m.id, m.item, m.moves);
    if (ip) out.push(ip);
    return out;
  }
  // Party-level problems for entering a battle (a draft may be smaller or unfinished).
  function partyProblems(cat, party) {
    const out = [];
    if (party.length < MIN_BATTLE) out.push(`Add ${MIN_BATTLE - party.length} more Pokémon: doubles needs at least ${MIN_BATTLE}.`);
    if (party.length > TEAM_SIZE) out.push(`Six Pokémon at most.`);
    const nums = party.map((m) => cat.byId[m.id] && cat.byId[m.id].num);
    if (new Set(nums).size !== nums.length) out.push('Only one of each species.');
    if (party.filter((m) => isSpecial(cat, m.id)).length > 1) out.push('Only one legendary or mythical Pokémon per party.');
    const items = party.map((m) => m.item).filter(Boolean);
    const dup = items.find((it, i) => items.indexOf(it) !== i);
    if (dup) out.push(`Item Clause: only one Pokémon can hold ${dup}.`);
    party.forEach((m) => memberProblems(cat, m).forEach((p) => out.push(`${cat.byId[m.id] ? cat.byId[m.id].name : m.id}: ${p}`)));
    return out;
  }

  // ---------- Stats (Pokémon Champions stat points; engine's Level Clause Mod formula) ----------
  const NATURES = {
    Adamant: ['atk', 'spa'], Bold: ['def', 'atk'], Brave: ['atk', 'spe'], Calm: ['spd', 'atk'], Careful: ['spd', 'spa'], Gentle: ['spd', 'def'],
    Hasty: ['spe', 'def'], Impish: ['def', 'spa'], Jolly: ['spe', 'spa'], Lax: ['def', 'spd'], Lonely: ['atk', 'def'], Mild: ['spa', 'def'],
    Modest: ['spa', 'atk'], Naive: ['spe', 'spd'], Naughty: ['atk', 'spd'], Quiet: ['spa', 'spe'], Rash: ['spa', 'spd'], Relaxed: ['def', 'spe'],
    Sassy: ['spd', 'spe'], Timid: ['spe', 'atk'], Bashful: [], Docile: [], Hardy: [], Quirky: [], Serious: []
  };
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  function calcStats(base, points, nature, level, id) {
    const out = {};
    const [plus, minus] = NATURES[nature] || [];
    STATS.forEach((s) => {
      const core = Math.floor((2 * base[s] + 31 + Math.max(2 * (points[s] || 0) - 1, 0)) * level / 100);
      if (s === 'hp') { out.hp = id === 'shedinja' ? 1 : core + level + 10; return; }
      let v = core + 5;
      if (s === plus) v = Math.floor(v * 110 / 100);
      else if (s === minus) v = Math.floor(v * 90 / 100);
      out[s] = v;
    });
    return out;
  }
  // A member's spread (nature + stat points) comes from its default set.
  function spreadOf(cat, id) {
    const row = cat.sets && cat.sets[id];
    if (!row) return { nature: 'Hardy', points: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } };
    const [hp, atk, def, spa, spd, spe] = row[4].split(',').map(Number);
    return { nature: row[2], points: { hp, atk, def, spa, spd, spe } };
  }
  function memberStats(cat, m, level) {
    const sp = cat.species[m.id];
    const { nature, points } = spreadOf(cat, m.id);
    return calcStats(sp.base, points, nature, level, m.id);
  }

  // ---------- Saved draft ----------
  // Storage key pdosTheVeryBest, version 3: { v, filterGen, party, mods }. Earlier saves
  // (pdosVictoryRoad v2: team of ids; pdosChampionRun: display names) migrate into a party with
  // default sets. Every field is validated; anything unknown or illegal is dropped. The trainer name
  // is kept in memory only, and a hidden random team is never saved.
  const STORE = 'pdosTheVeryBest';
  const LEGACY_STORES = ['pdosVictoryRoad', 'pdosChampionRun'];
  function blankDraft() {
    const mods = {};
    MODS.forEach((m) => { mods[m.k] = false; });
    return { filterGen: 0, party: [], mods };
  }
  function serialize(draft) {
    return JSON.stringify({ v: 3, filterGen: draft.filterGen, mods: draft.mods, party: draft.party.map((m) => ({ uid: m.uid, id: m.id, moves: m.moves, item: m.item, ability: m.ability })) });
  }
  const MAX_SAVE = 20000;
  function restore(raw, cat, legacyRaw) {
    const draft = blankDraft();
    const notes = [];
    const parse = (text) => {
      if (typeof text !== 'string' || !text || text.length > MAX_SAVE) return null;
      try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (_) { return null; }
    };
    let saved = parse(raw);
    let legacy = false;
    if (!saved && legacyRaw) { saved = parse(legacyRaw); legacy = !!saved; }
    if (!saved) return { draft, notes, migrated: false };
    if (saved.mods && typeof saved.mods === 'object') MODS.forEach((m) => { draft.mods[m.k] = saved.mods[m.k] === true; });
    if (Number.isInteger(saved.filterGen) && saved.filterGen >= 0 && saved.filterGen <= 9) draft.filterGen = saved.filterGen;
    let party = [];
    const tryAdd = (id) => {
      const entry = cat.byId[id];
      if (!entry || !cat.pool.includes(entry)) return null;
      const result = addMember(cat, party, entry);
      if (result.error) { notes.push(result.error); return null; }
      party = result.party;
      return party[party.length - 1];
    };
    if (saved.v === 3 && Array.isArray(saved.party)) {
      saved.party.slice(0, TEAM_SIZE).forEach((s) => {
        if (!s || typeof s !== 'object') return;
        const m = tryAdd(toId(s.id));
        if (!m) return;
        const patch = {};
        if (Array.isArray(s.moves) && s.moves.length >= 1 && s.moves.length <= 4 && s.moves.every((n) => typeof n === 'string' && n.length < 40)) patch.moves = s.moves.slice();
        if (typeof s.item === 'string' && s.item.length < 40) patch.item = s.item;
        if (typeof s.ability === 'string' && s.ability.length < 40) patch.ability = s.ability;
        let next = { ...m, ...patch };
        // Anything that no longer validates falls back to the default set for that field.
        const legal = legalMoves(cat, m.id);
        if (legal && (new Set(next.moves).size !== next.moves.length || next.moves.some((n) => !legal.has(n)))) next.moves = m.moves;
        if (cat.species && !cat.species[m.id].abilities.includes(next.ability)) next.ability = m.ability;
        if (cat.itemByName && itemProblem(cat, m.id, next.item, next.moves)) next.item = m.item;
        party = party.map((x) => (x.uid === m.uid ? next : x));
      });
    } else if (Array.isArray(saved.team)) {
      // v2 (Victory Road) and v1 (Champion Run) teams: ids or display names.
      saved.team.slice(0, TEAM_SIZE).forEach((id) => { if (typeof id === 'string') tryAdd(toId(id)); });
    }
    // Item Clause on restore: a duplicate item gets a free general-purpose item instead.
    party = party.reduce((list, m) => [...list, freeItem(list, m)], []);
    draft.party = party;
    return { draft, notes, migrated: legacy || saved.v !== 3 };
  }

  // ---------- Trainer name ----------
  // 1-20 grapheme clusters after trimming; no control or formatting characters. Empty input gets
  // the default name. Returns { name, error }.
  function graphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
    return [...text].length;
  }
  function cleanName(input) {
    const text = String(input == null ? '' : input).normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!text) return { name: DEFAULT_NAME, error: '' };
    // Zero-width joiners stay (emoji sequences and many scripts need them); bidi controls don't.
    if (/[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁠-⁤⁦-⁩﻿]/.test(text)) return { name: '', error: 'Names can’t contain control characters.' };
    if (graphemes(text) > 20) return { name: '', error: 'Keep it to 20 characters or fewer.' };
    return { name: text, error: '' };
  }

  // ---------- Random team (modifier) ----------
  // Exactly five fully evolved Pokémon that are neither legendary nor mythical, plus exactly one
  // legendary or mythical (one shared slot), from every generation whatever the catalog filter
  // shows (Milind, 2026-10-10). The special slot takes fully evolved legendaries and mythicals too,
  // so Cosmog, Cosmoem, Kubfu and Type: Null (whose only moves are Splash-like or who evolve) never
  // fill it. Ultra Beasts and Paradox Pokémon are ordinary picks. Each pool is sampled by species
  // (National Dex number) first, then one of that species' eligible forms, so a species with many
  // forms is not more likely. The six are shuffled, so the special is not always last. Seeded.
  const RANDOM_FINALS = 5;
  function randomPools(cat) {
    const group = (keep) => {
      const byNum = new Map();
      cat.pool.forEach((e) => { if (keep(e.id)) { if (!byNum.has(e.num)) byNum.set(e.num, []); byNum.get(e.num).push(e.id); } });
      return [...byNum.values()];
    };
    return { finals: group((id) => isFinal(cat, id) && !isSpecial(cat, id)), specials: group((id) => isFinal(cat, id) && isSpecial(cat, id)) };
  }
  function rollTeam(cat, rand) {
    const { finals, specials } = randomPools(cat);
    if (finals.length < RANDOM_FINALS || !specials.length) throw new Error('Random team: the catalog has too few eligible Pokémon.');
    const pickForm = (forms) => forms[Math.floor(rand() * forms.length)];
    const five = shuffle(finals, rand).slice(0, RANDOM_FINALS).map(pickForm);
    const special = pickForm(specials[Math.floor(rand() * specials.length)]);
    return shuffle([...five, special], rand);
  }
  // Why a generated team breaks the random-team rule, or '' (checked again at Enter Battle and, by
  // the same rule on the engine's own data, at the engine boundary).
  function randomTeamProblem(cat, ids) {
    if (!Array.isArray(ids) || ids.length !== TEAM_SIZE) return 'A random team has six Pokémon.';
    const nums = ids.map((id) => cat.byId[id] && cat.byId[id].num);
    if (nums.some((n) => !n) || new Set(nums).size !== TEAM_SIZE) return 'A random team has six different species.';
    const special = ids.filter((id) => isSpecial(cat, id));
    if (special.length !== 1) return 'A random team has exactly one legendary or mythical Pokémon.';
    if (ids.some((id) => !isFinal(cat, id))) return 'A random team has only fully evolved Pokémon.';
    return '';
  }

  // A Random Team's held items are drawn from these, never repeating within a team (Item Clause). Ordinary held
  // items that work for any Pokémon in doubles; no Mega Stones, Z-Crystals or species items.
  const RANDOM_ITEMS = ['Sitrus Berry', 'Lum Berry', 'Leftovers', 'Life Orb', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Focus Sash',
    'Assault Vest', 'Rocky Helmet', 'Expert Belt', 'Muscle Band', 'Wise Glasses', 'Shell Bell', 'Mental Herb', 'White Herb', 'Safety Goggles',
    'Covert Cloak', 'Clear Amulet', 'Bright Powder', 'Scope Lens', 'Light Clay', 'Throat Spray', 'Weakness Policy', 'Air Balloon', 'Red Card',
    'Eject Button', 'Eject Pack', 'Mirror Herb', 'Loaded Dice', 'Punching Glove', 'Quick Claw', 'Kings Rock', 'Black Glasses', 'Charcoal',
    'Mystic Water', 'Miracle Seed', 'Magnet', 'Never-Melt Ice', 'Black Belt', 'Poison Barb', 'Soft Sand', 'Sharp Beak', 'Twisted Spoon',
    'Silver Powder', 'Hard Stone', 'Spell Tag', 'Dragon Fang', 'Metal Coat', 'Silk Scarf', 'Fairy Feather'];

  // Random Moves: four distinct moves from the Pokémon's usable learnable list (movepools.json),
  // with at least two attacks whenever it knows two, so no team is left unable to deal damage.
  function randomMoves(pool, moveNames, isAttack, rand) {
    const names = shuffle(pool.map((i) => moveNames[i]), rand);
    const attacks = names.filter(isAttack);
    const picked = attacks.slice(0, Math.min(2, attacks.length));
    for (const n of names) { if (picked.length >= 4) break; if (!picked.includes(n)) picked.push(n); }
    return picked;
  }

  // ---------- Battle snapshot ----------
  // Enter Battle copies the validated draft into a separate battle loadout, then applies the
  // modifiers to the copy only: the draft (and storage) never sees random moves or a random team
  // (whose held items are random too). data: { movepools } for Random Moves. Seeded, so the same seed rebuilds the same
  // team. Returns { members: [{ uid, id }], sets: [engine sets] }.
  function battleLoadout(cat, draft, seed, data) {
    const mods = draft.mods;
    const rand = rng(seed ^ 0x13579bdf);
    let members;
    if (mods.random) {
      const ids = rollTeam(cat, rng(seed ^ 0x2468ace0));
      const problem = randomTeamProblem(cat, ids);
      if (problem) throw new Error(problem);
      members = ids.reduce((list, id, n) => [...list, freeItem(list, defaultMember(cat, id, `r${n + 1}`))], []);
    } else members = draft.party.map((m) => ({ ...m, moves: m.moves.slice() }));
    const items = mods.random ? shuffle(RANDOM_ITEMS, rand) : null;
    const pools = data && data.movepools;
    const attacks = pools ? new Set(pools.attacks) : null;
    const sets = members.map((m, n) => {
      const entry = cat.byId[m.id];
      const { nature, points } = spreadOf(cat, m.id);
      const set = { species: entry.name, name: entry.name.split('-')[0], ability: m.ability, item: m.item, nature, moves: m.moves.slice(), evs: { ...points } };
      if (mods.shiny) set.shiny = true;
      if (items) set.item = items[n];
      if (mods.moves && pools && pools.pools[m.id] && pools.pools[m.id].length) set.moves = randomMoves(pools.pools[m.id], pools.moves, (x) => attacks.has(x), rand);
      return set;
    });
    return { members: members.map((m) => ({ uid: m.uid, id: m.id })), sets, hidden: !!mods.random };
  }

  // ---------- Battle playback ----------
  // Splits the player's channel of the battle log into beats, one per action, in the simulator's
  // order: a move (with everything it causes: hits, immunities, effectiveness, status, faints), a
  // switch-in, a Pokémon that can't move, a Mega Evolution, or the end-of-turn upkeep. The page plays
  // one beat at a time with a short gap between them, so four doubles actions never blur into one.
  // End-of-turn effects (poison, burn, weather, Leftovers, Grassy Terrain...) start a 'residual'
  // beat of their own, so they never run on from the last move. Lines before the first action
  // (|t:|, |turn|) form a beat of their own. Spread damage stays in its move's beat; nothing is
  // reordered or dropped.
  const BEAT_START = new Set(['move', 'switch', 'drag', 'replace', 'cant', '-mega', 'upkeep', 'turn']);
  const RESIDUAL = /\[from\] (psn|tox|brn|Sandstorm|Hail|Snow|Leech Seed|Salt Cure|Grassy Terrain|item: (Leftovers|Black Sludge|Sticky Barb)|ability: (Rain Dish|Ice Body|Dry Skin|Solar Power|Poison Heal|Bad Dreams|Speed Boost))$/;
  function beats(lines) {
    const out = [];
    let cur = null;
    lines.forEach((line, i) => {
      const text = String(line);
      const cmd = text.split('|')[1];
      const next = String(lines[i + 1] || '').split('|')[1];
      // A Mega Evolution's detailschange comes just before its -mega line: same beat.
      const residual = /^-(damage|heal|boost)$/.test(cmd) && RESIDUAL.test(text);
      const start = BEAT_START.has(cmd) || (cmd === 'detailschange' && next === '-mega') || (residual && !(cur && cur.kind === 'residual'));
      const continuesMega = cmd === '-mega' && cur && cur.kind === 'detailschange';
      if (!cur || (start && !continuesMega)) { cur = { kind: start ? (residual ? 'residual' : cmd) : '', lines: [] }; out.push(cur); }
      cur.lines.push(line);
    });
    return out;
  }
  // Runs of direct hits (no [from]) inside a beat, so a spread move's targets take damage together;
  // everything else is one line per step, in order.
  function steps(beatLines) {
    const out = [];
    beatLines.forEach((line) => {
      const p = String(line).split('|');
      const hit = p[1] === '-damage' && !p.some((x) => x.startsWith('[from]'));
      const last = out[out.length - 1];
      if (hit && last && last.hit) last.lines.push(line);
      else out.push({ hit, lines: [line] });
    });
    return out;
  }

  // Engine rules from the chosen modifiers (cosmetic ones don't reach the engine).
  function engineRules(mods) {
    return { noSwitch: !!mods.noswitch, chaos: !!mods.chaos, noPotions: !!mods.nopotions, levelCap: !!mods.cap, randomTeam: !!mods.random };
  }

  // Modifier combinations: none are impossible, but some change how others behave.
  function modNotes(mods, partySize) {
    const notes = [];
    if (mods.noswitch && mods.chaos) notes.push('No switching + chaotic replacement: you never choose who comes in.');
    if (mods.random && mods.moves) notes.push('Random team + random moves: everything is a surprise until the battle starts.');
    if (mods.random && partySize && partySize !== TEAM_SIZE) notes.push(`Random team brings six Pokémon; your party of ${partySize} waits on the bench.`);
    return notes;
  }
  // Pending battle-only overrides, explained before the battle.
  function overrides(mods) {
    const out = [];
    if (mods.random) out.push('Random team replaces your party for this battle only.');
    if (mods.moves) out.push('Random moves replace your chosen moves for this battle only.');
    if (mods.cap) out.push('Your Pokémon fight at Lv 45.');
    return out;
  }

  return {
    TEAM_SIZE, MIN_BATTLE, BRING, ROMAN, DEFAULT_NAME, MODS, TIERS, RANDOM_ITEMS, NATURES, STATS, STORE, LEGACY_STORES, CLASS_NAME, TYPES, RANDOM_FINALS,
    multiplier, tier, difficulty, difficultyLabel, rng, newSeed, shuffle, moveSlot, toId,
    catalog, decodeLearnset, legalMoves, classOf, isSpecial, isFinal, typeQuery, matches, defaultMember, nextUid, joinError, addMember, removeMember, updateMember,
    itemProblem, memberProblems, partyProblems, calcStats, spreadOf, memberStats,
    blankDraft, serialize, restore, cleanName, beats, steps, randomPools, rollTeam, randomTeamProblem, randomMoves, battleLoadout, engineRules, modNotes, overrides
  };
}));

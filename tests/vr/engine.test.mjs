// Victory Road battle engine: runs the shipped public/vr/vr-engine.js. Run: node --test tests/vr/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadEngine, playBattle, SAMPLE_TEAM } from './harness.mjs';

const require = createRequire(import.meta.url);
const C = require('../../public/vr/vr-core.js');
const E = loadEngine();
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../public/vr/${f}`, import.meta.url), 'utf8'));
const dex = read('dex.json');
const { sets } = read('sets.json');
const pool = dex.pool.map(([id, name, num, gen, form]) => ({ id, name, num, gen, form }));
const byId = Object.fromEntries(pool.map((e) => [e.id, e]));
const teamOf = (ids) => ids.map((id) => C.toSet(byId[id], sets[id]));
const logOf = (r) => r.events.filter((e) => e.t === 'log').flatMap((e) => e.lines).filter((l) => !l.startsWith('|t:|'));

test('the champion team matches the official 2026 Worlds team sheet', () => {
  const t = E.CHAMPION.team;
  const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays from the engine sandbox
  assert.deepEqual(plain(t.map((s) => s.species)), ['Floette-Eternal', 'Basculegion', 'Kingambit', 'Dragonite', 'Garchomp', 'Sneasler']);
  assert.deepEqual(plain(t.map((s) => s.item)), ['Floettite', 'Life Orb', 'Chople Berry', 'Dragoninite', 'Choice Scarf', 'Focus Sash']);
  assert.deepEqual(plain(t.map((s) => s.ability)), ['Flower Veil', 'Adaptability', 'Defiant', 'Multiscale', 'Rough Skin', 'Poison Touch']);
  assert.deepEqual(plain(t.map((s) => s.nature)), ['Timid', 'Adamant', 'Adamant', 'Modest', 'Adamant', 'Jolly']);
  assert.deepEqual(plain(t[5].moves), ['Close Combat', 'Dire Claw', 'Fake Out', 'Feint']);
  t.forEach((s) => assert.ok(Object.values(s.evs).reduce((a, b) => a + b, 0) <= 66));
});

test('doubles, team preview, bring four', () => {
  const r = playBattle(E, { seed: 7 });
  const log = logOf(r);
  assert.ok(log.includes('|gametype|doubles'));
  assert.ok(r.events.find((e) => e.t === 'request').request.teamPreview);
  const p2Switched = new Set(log.filter((l) => l.startsWith('|switch|p2')).map((l) => l.split('|')[3].split(',')[0].replace('-Mega', '')));
  assert.ok(p2Switched.size <= 4, [...p2Switched].join(','));
  assert.ok(r.winner === 'p1' || r.winner === 'p2');
});

test('the same seed and choices replay the same battle; another seed differs', () => {
  const a = logOf(playBattle(E, { seed: 99 }));
  const b = logOf(playBattle(E, { seed: 99 }));
  const c = logOf(playBattle(E, { seed: 100 }));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('the champion Mega Evolves at most once per battle', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const megas = logOf(playBattle(E, { seed })).filter((l) => l.startsWith('|-mega|p2'));
    assert.ok(megas.length <= 1, `seed ${seed}: ${megas.length}`);
  }
});

test('the AI only holds public information', () => {
  const r = playBattle(E, { seed: 5 }, () => 'default', 6);
  const { view } = r.engine._aiInputs();
  const json = JSON.stringify(view);
  // The player's exact HP (e.g. 202/202 Incineroar) never reaches the AI; only percentages.
  for (const m of Object.values(view.mons).filter((x) => x.side === 'p1')) {
    assert.ok(m.hp >= 0 && m.hp <= 100);
    // Only moves the player has actually used are known.
    m.moves.forEach((mv) => assert.ok(logOf(r).some((l) => l.startsWith('|move|p1') && l.split('|')[3] === mv)));
  }
  assert.doesNotMatch(json, /Sitrus Berry|Choice Band|Choice Specs|Rocky Helmet/); // unrevealed items
  assert.equal(r.engine._battle, undefined);
});

test('bag: Potions heal half, run out, and No Potions removes them', () => {
  const ev = [];
  let req = null;
  const eng = E.createEngine({ seed: 3, player: { name: 'You', team: SAMPLE_TEAM }, exposeBattle: true }, (e) => { ev.push(e); if (e.t === 'request') req = e.request; });
  eng.choose('team 1234');
  assert.ok(req.active[0].moves.some((m) => m.id === 'potion'));
  assert.equal(req.vr.potions, 2);
  const b = eng._battle;
  const mon = b.sides[0].active[0];
  mon.sethp(Math.floor(mon.maxhp / 4));
  const before = mon.hp;
  const slot = req.active[0].moves.findIndex((m) => m.id === 'potion') + 1;
  eng.choose(`move ${slot} -1, move 1 1`);
  const healed = ev.flatMap((e) => e.lines || []).find((l) => l.startsWith('|-heal|p1a') && l.includes('Potion'));
  assert.ok(healed, 'heal line');
  assert.ok(mon.hp >= before + Math.floor(mon.maxhp / 2) - 1 || mon.fainted || mon.hp === mon.maxhp || mon.hp < before);
  assert.equal(eng.state().potions, 1);
  let noBag = null;
  const e2 = E.createEngine({ seed: 3, player: { name: 'You', team: SAMPLE_TEAM }, rules: { noPotions: true } }, (e) => { if (e.t === 'request') noBag = e.request; });
  e2.choose('team 1234');
  assert.ok(!noBag.active[0].moves.some((m) => m.id === 'potion'));
});

test('No Switching refuses voluntary switches; Chaotic Replacement picks replacements itself', () => {
  const ev = [];
  const eng = E.createEngine({ seed: 4, player: { name: 'You', team: SAMPLE_TEAM }, rules: { noSwitch: true } }, (e) => ev.push(e));
  eng.choose('team 1234');
  eng.choose('switch 3, move 1 1');
  assert.ok(ev.some((e) => e.t === 'error' && /No switching/.test(e.message)));
  const r = playBattle(E, { seed: 11, rules: { chaos: true } });
  const forced = r.events.filter((e) => e.t === 'request' && e.request.forceSwitch);
  assert.equal(forced.length, 0);
  assert.ok(logOf(r).includes('|vr-chaos|') || !logOf(r).some((l) => l.startsWith('|faint|p1')));
});

test('Level Cap 45: the player is Lv 45, the champion Lv 50', () => {
  const log = logOf(playBattle(E, { seed: 8, rules: { levelCap: true } }, () => 'default', 3));
  assert.ok(log.some((l) => /^\|poke\|p1\|[^|]*L45/.test(l)));
  assert.ok(log.some((l) => /^\|poke\|p2\|[^|]*L50/.test(l)));
});

test('fuzz: 60 random player teams from the full pool play to a result without errors', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const ids = C.rollTeam(pool, C.rng(seed * 7919));
    const ev = [];
    let req = null;
    let winner = null;
    const eng = E.createEngine({ seed, player: { name: 'You', team: teamOf(ids) } }, (e) => { ev.push(e); if (e.t === 'request') req = e.request; if (e.t === 'end') winner = e.winner; });
    for (let i = 0; i < 300 && winner === null && req; i += 1) { const r = req; req = null; eng.choose('default'); }
    assert.notEqual(winner, null, `seed ${seed} team ${ids.join(',')} did not finish`);
    assert.equal(ev.filter((e) => e.t === 'fatal').length, 0);
  }
});

// ---- Phase 3: champion fidelity ----
test('champion stats follow the Pokemon Champions stat-point formula at Lv 50', () => {
  const eng = E.createEngine({ seed: 2, exposeBattle: true, player: { name: 'You', team: SAMPLE_TEAM } }, () => {});
  const mons = Object.fromEntries(eng._battle.sides[1].pokemon.map((p) => [p.species.name, p]));
  // HP = base + points + 75; others = (base + points + 20) x nature.
  assert.equal(mons.Kingambit.maxhp, 100 + 32 + 75);
  assert.equal(mons.Sneasler.storedStats.spe, Math.floor((120 + 32 + 20) * 1.1));
  assert.equal(mons['Floette-Eternal'].maxhp, 74 + 4 + 75);
  assert.equal(mons.Dragonite.storedStats.spa, Math.floor((100 + 32 + 20) * 1.1));
  assert.equal(mons.Garchomp.item, 'choicescarf');
  assert.equal(mons.Basculegion.ability, 'adaptability');
  const megaF = eng._battle.dex.species.get('Floette-Mega');
  const megaD = eng._battle.dex.species.get('Dragonite-Mega');
  assert.equal(megaF.abilities[0], 'Fairy Aura');
  assert.equal(megaD.abilities[0], 'Multiscale');
});

test('when Floette and Dragonite could both Mega Evolve, the AI picks Floette', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const megas = logOf(playBattle(E, { seed })).filter((l) => l.startsWith('|-mega|p2'));
    megas.forEach((l) => assert.ok(/Floette|Dragonite/.test(l)));
    const both = logOf(playBattle(E, { seed })).filter((l) => /^\|switch\|p2[ab]: (Floette|Dragonite)/.test(l));
    if (megas.length && both.length >= 2 && both[0].includes('Floette') && both[1].includes('Dragonite')) assert.match(megas[0], /Floette/);
  }
});

test('AI choices are deterministic for a seed and stay legal at every difficulty', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const a = logOf(playBattle(E, { seed: 31, difficulty }));
    const b = logOf(playBattle(E, { seed: 31, difficulty }));
    assert.deepEqual(a, b);
    const r = playBattle(E, { seed: 32, difficulty });
    assert.ok(r.winner === 'p1' || r.winner === 'p2', difficulty);
  }
});

test('the hard AI beats a first-legal-option player most of the time', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed += 1) if (playBattle(E, { seed }).winner === 'p2') wins += 1;
  assert.ok(wins >= 14, `champion won ${wins}/20`);
});

// ---- Phase 4: modifier behaviour ----
const movepools = read('movepools.json');
const data = { byId, sets, movepools, attacks: new Set(movepools.attacks) };

test('Random Held Items: six different real items, repeatable for a seed', () => {
  const ids = ['garchomp', 'pikachu', 'snorlax', 'gengar', 'lucario', 'rotomwash'];
  for (let seed = 1; seed <= 50; seed += 1) {
    const team = C.buildTeam(ids, { items: true }, seed, data);
    assert.equal(new Set(team.map((s) => s.item)).size, 6);
    team.forEach((s) => assert.ok(E.Dex.items.get(s.item).exists, s.item));
  }
  assert.deepEqual(C.buildTeam(ids, { items: true }, 9, data), C.buildTeam(ids, { items: true }, 9, data));
  assert.equal(C.buildTeam(ids, {}, 9, data)[0].item, sets.garchomp[1]);
});

test('Random Moves: four distinct learnable moves, at least two attacks', () => {
  const ids = pool.map((e) => e.id);
  for (let seed = 1; seed <= 400; seed += 1) {
    const id = ids[(seed * 7919) % ids.length];
    const [set] = C.buildTeam([id], { moves: true }, seed, data);
    const learn = new Set(movepools.pools[id].map((i) => movepools.moves[i]));
    assert.equal(new Set(set.moves).size, set.moves.length);
    assert.ok(set.moves.length === Math.min(4, learn.size), `${id} ${set.moves.length}`);
    set.moves.forEach((m) => assert.ok(learn.has(m), `${id} can't learn ${m}`));
    const attacksKnown = [...learn].filter((m) => data.attacks.has(m)).length;
    assert.ok(set.moves.filter((m) => data.attacks.has(m)).length >= Math.min(2, attacksKnown), id);
  }
});

test('every pair of modifiers (and all nine) plays to a result', () => {
  const keys = C.MODS.map((m) => m.k);
  const combos = [];
  for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) combos.push({ [keys[i]]: true, [keys[j]]: true });
  combos.push(Object.fromEntries(keys.map((k) => [k, true])));
  combos.forEach((mods, n) => {
    const seed = 1000 + n;
    const ids = mods.random ? C.rollTeam(pool, C.rng(seed)) : ['incineroar', 'rillaboom', 'gholdengo', 'amoonguss', 'dragonite', 'pikachu'];
    const team = C.buildTeam(ids, mods, seed, data);
    let req = null;
    let winner = null;
    const errs = [];
    const eng = E.createEngine({ seed, player: { name: 'You', team }, rules: C.engineRules(mods) }, (e) => { if (e.t === 'request') req = e.request; if (e.t === 'end') winner = e.winner; if (e.t === 'fatal') errs.push(e.message); });
    for (let i = 0; i < 300 && winner === null && req; i += 1) {
      const r = req; req = null;
      // With No Switching, 'default' never switches voluntarily; forced replacements still arrive.
      eng.choose('default');
    }
    assert.notEqual(winner, null, JSON.stringify(mods));
    assert.equal(errs.length, 0, errs.join());
  });
});

test('the multiplier for all nine modifiers is x6.72 (Master tier)', () => {
  const all = Object.fromEntries(C.MODS.map((m) => [m.k, true]));
  assert.equal(C.multiplier(all).toFixed(2), '6.72');
  assert.equal(C.tier(C.multiplier(all)), 'Master');
});

// The Very Best battle engine: runs the shipped public/vr/vr-engine.js. Run: node --test tests/vr/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadEngine, playBattle, SAMPLE_TEAM } from './harness.mjs';

const require = createRequire(import.meta.url);
const C = require('../../public/vr/vr-core.js');
const E = loadEngine();
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../public/vr/${f}`, import.meta.url), 'utf8'));
const raw = { dex: read('dex.json'), species: read('species.json'), learnsets: read('learnsets.json'), items: read('items.json'), sets: read('sets.json') };
const cat = C.catalog(raw);
const movepools = read('movepools.json');
const plain = (x) => JSON.parse(JSON.stringify(x)); // values from the engine sandbox
const logOf = (r) => r.events.filter((e) => e.t === 'log').flatMap((e) => e.lines).filter((l) => !l.startsWith('|t:|'));
const D = E.Dex.forFormat(E.FORMAT_ID);
const draftOf = (ids, mods = {}) => ({ filterGen: 0, party: ids.reduce((p, id) => C.addMember(cat, p, cat.byId[id]).party, []), mods: { ...Object.fromEntries(C.MODS.map((m) => [m.k, false])), ...mods } });
const teamOf = (ids, mods = {}, seed = 1) => C.battleLoadout(cat, draftOf(ids, mods), seed, { movepools }).sets;

// Drives a battle to the end with `pick(request)`, resuming the championship cinematic at once.
function run(config, pick = () => 'default', { maxSteps = 500, onEscalation } = {}) {
  const events = [];
  let request = null;
  let esc = null;
  let winner = null;
  const engine = E.createEngine({ player: { name: 'You', team: SAMPLE_TEAM }, ...config }, (ev) => {
    events.push(ev);
    if (ev.t === 'request') request = ev.request;
    if (ev.t === 'escalation') esc = ev;
    if (ev.t === 'end') winner = ev.winner;
  });
  for (let step = 0; step < maxSteps && winner === null; step += 1) {
    if (esc) { const e = esc; esc = null; if (onEscalation) onEscalation(e, engine); else engine.resume(e.id); continue; }
    if (!request) break;
    const r = request;
    request = null;
    engine.choose(pick(r, engine), r.rqid);
  }
  return { events, winner, engine, record: engine.state().record };
}

// ---------- The champion ----------
test('the champion keeps the official species, items, abilities, natures and stat points', () => {
  const t = plain(E.CHAMPION.team);
  assert.deepEqual(t.map((s) => s.species), ['Floette-Eternal', 'Basculegion', 'Kingambit', 'Dragonite', 'Garchomp', 'Sneasler']);
  assert.deepEqual(t.map((s) => s.item), ['Floettite', 'Life Orb', 'Chople Berry', 'Dragoninite', 'Choice Scarf', 'Focus Sash']);
  assert.deepEqual(t.map((s) => s.ability), ['Flower Veil', 'Adaptability', 'Defiant', 'Multiscale', 'Rough Skin', 'Poison Touch']);
  assert.deepEqual(t.map((s) => s.nature), ['Timid', 'Adamant', 'Adamant', 'Modest', 'Adamant', 'Jolly']);
  t.forEach((s) => assert.ok(Object.values(s.evs).reduce((a, b) => a + b, 0) <= 66));
  // The official sheet's moves are one of the variants for every member.
  t.forEach((s) => assert.ok(plain(E.VARIANTS[s.species]).some((v) => JSON.stringify(v.moves) === JSON.stringify(s.moves)), s.species));
  assert.equal(E.CHAMPION.name, 'Ren Kestrel');
});

test('every champion variant is legal, unique and fits the fixed item, ability and nature', () => {
  const variants = plain(E.VARIANTS);
  for (const [species, list] of Object.entries(variants)) {
    const legal = C.legalMoves(cat, C.toId(species));
    for (const v of list) {
      assert.equal(v.moves.length, 4, `${species} ${v.key}`);
      assert.equal(new Set(v.moves).size, 4);
      v.moves.forEach((m) => {
        assert.ok(legal.has(m), `${species} ${v.key}: ${m} isn't in its learnset`);
        assert.ok(D.moves.get(m).exists && !D.moves.get(m).isZ && !D.moves.get(m).isMax, m);
      });
    }
  }
  // Choice Scarf: no status moves (they would lock it into Protect or a set-up move).
  variants.Garchomp.forEach((v) => v.moves.forEach((m) => assert.notEqual(D.moves.get(m).category, 'Status', `Garchomp ${v.key}: ${m}`)));
  // Modest Dragonite: its attacks are special except the priority Extreme Speed of the official set.
  variants.Dragonite.forEach((v) => v.moves.filter((m) => m !== 'Extreme Speed').forEach((m) => assert.notEqual(D.moves.get(m).category, 'Physical', m)));
});

test('champion configurations: seeded, varied, and always coherent', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed += 1) {
    const r = plain(run({ seed }, () => 'default', { maxSteps: 1 }).record);
    seen.add(r.variants.join(','));
    assert.equal(r.templateVersion, 1);
  }
  assert.ok(seen.size >= 30, `only ${seen.size} configurations in 300 seeds`);
  const a = plain(run({ seed: 4242 }, () => 'default', { maxSteps: 1 }).record.variants);
  const b = plain(run({ seed: 4242 }, () => 'default', { maxSteps: 1 }).record.variants);
  assert.deepEqual(a, b);
  // Team rules hold for every draw: two or more Protect users and a way to take tempo.
  let x = 7;
  const rand = () => { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
  for (let i = 0; i < 300; i += 1) {
    const t = plain(E.championTeam(rand));
    assert.ok(t.team.filter((s) => s.moves.includes('Protect')).length >= 2, t.variants.join());
    assert.ok(t.team.some((s) => s.moves.some((m) => ['Aqua Jet', 'Sucker Punch', 'Extreme Speed', 'Fake Out', 'Tailwind'].includes(m))));
  }
});

test('champion stats follow the Pokémon Champions stat-point formula at Lv 50', () => {
  const eng = E.createEngine({ seed: 2, exposeBattle: true, player: { name: 'You', team: SAMPLE_TEAM } }, () => {});
  const mons = Object.fromEntries(eng._battle.sides[1].pokemon.map((p) => [p.species.name, p]));
  assert.equal(mons.Kingambit.maxhp, 100 + 32 + 75);
  assert.equal(mons.Sneasler.storedStats.spe, Math.floor((120 + 32 + 20) * 1.1));
  assert.equal(mons['Floette-Eternal'].maxhp, 74 + 4 + 75);
  assert.equal(mons.Dragonite.storedStats.spa, Math.floor((100 + 32 + 20) * 1.1));
  assert.equal(eng._battle.dex.species.get('Floette-Mega').abilities[0], 'Fairy Aura');
});

test('the editor\'s calculated stats and PP agree with the engine for sample forms and levels', () => {
  for (const [ids, cap] of [[['garchomp', 'rotomwash', 'raichualola', 'shedinja', 'floetteeternal', 'ninetalesalola'], false], [['incineroar', 'urshifu', 'basculegion', 'pikachu', 'snorlax', 'gengar'], true]]) {
    const draft = draftOf(ids, { cap });
    const eng = E.createEngine({ seed: 3, exposeBattle: true, rules: { levelCap: cap }, player: { name: 'You', team: C.battleLoadout(cat, draft, 3, {}).sets } }, () => {});
    eng._battle.sides[0].pokemon.forEach((p, i) => {
      const want = C.memberStats(cat, draft.party[i], cap ? 45 : 50);
      assert.equal(p.maxhp, want.hp, `${p.species.name} HP`);
      ['atk', 'def', 'spa', 'spd', 'spe'].forEach((s) => assert.equal(p.storedStats[s], want[s], `${p.species.name} ${s}`));
      p.baseMoveSlots.filter((m) => m.id !== 'potion').forEach((m) => assert.equal(m.maxpp, cat.moveByName[m.move].pp, `${p.species.name} ${m.move} PP`));
    });
  }
});

// ---------- Format and fairness ----------
test('doubles, team preview, the champion brings four', () => {
  const r = playBattle(E, { seed: 7 });
  const log = logOf(r);
  assert.ok(log.includes('|gametype|doubles'));
  assert.ok(r.events.find((e) => e.t === 'request').request.teamPreview);
  const p2 = new Set(log.filter((l) => l.startsWith('|switch|p2')).map((l) => l.split('|')[3].split(',')[0].replace('-Mega', '')));
  assert.ok(p2.size <= 4, [...p2].join(','));
});

test('parties of two to six battle; three brings all three', () => {
  for (const ids of [['garchomp', 'pikachu'], ['garchomp', 'pikachu', 'snorlax'], ['garchomp', 'pikachu', 'snorlax', 'gengar', 'lucario']]) {
    const r = run({ seed: 21, player: { name: 'You', team: teamOf(ids) } }, (req) => (req.teamPreview ? `team ${ids.slice(0, 4).map((_, i) => i + 1).join('')}` : 'default'));
    assert.ok(r.winner === 'p1' || r.winner === 'p2', ids.join());
    const log = r.events.filter((e) => e.t === 'log').flatMap((e) => e.lines);
    assert.ok(log.includes(`|teamsize|p1|${Math.min(4, ids.length)}`), ids.join());
  }
});

test('the AI decides before the player: its choice is committed when the player\'s request arrives', () => {
  const eng = E.createEngine({ seed: 5, exposeBattle: true, player: { name: 'You', team: SAMPLE_TEAM } }, () => {});
  eng.choose('team 1234');
  for (let i = 0; i < 6 && !eng.state().ended; i += 1) {
    const b = eng._battle;
    if (b.requestState === 'move') assert.ok(b.sides[1].isChoiceDone(), 'p2 committed before p1 chose');
    eng.choose('default');
  }
});

test('the AI only holds public information', () => {
  const r = playBattle(E, { seed: 5 }, () => 'default', 6);
  const { view } = r.engine._aiInputs();
  const json = JSON.stringify(view);
  for (const m of Object.values(view.mons).filter((x) => x.side === 'p1')) {
    assert.ok(m.hp >= 0 && m.hp <= 100);
    m.moves.forEach((mv) => assert.ok(logOf(r).some((l) => l.startsWith('|move|p1') && l.split('|')[3] === mv)));
  }
  assert.doesNotMatch(json, /Sitrus Berry|Choice Band|Choice Specs|Rocky Helmet/);
  assert.equal(r.engine._battle, undefined);
});

test('the same seed and choices replay the same battle, escalation included; another seed differs', () => {
  const a = run({ seed: 99 });
  const b = run({ seed: 99 });
  assert.deepEqual(logOf(a), logOf(b));
  assert.deepEqual(plain(a.record), plain(b.record));
  assert.notDeepEqual(logOf(a), logOf(run({ seed: 100 })));
});

test('the champion Mega Evolves at most once per battle, preferring Floette', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const megas = logOf(run({ seed })).filter((l) => l.startsWith('|-mega|p2'));
    assert.ok(megas.length <= 1, `seed ${seed}: ${megas.length}`);
    megas.forEach((l) => assert.match(l, /Floette|Dragonite/));
  }
});

test('AI choices are deterministic for a seed and stay legal at every difficulty', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    assert.deepEqual(logOf(run({ seed: 31, difficulty })), logOf(run({ seed: 31, difficulty })));
    const r = run({ seed: 32, difficulty });
    assert.ok(r.winner === 'p1' || r.winner === 'p2', difficulty);
    assert.equal(r.events.filter((e) => e.t === 'error').length, 0);
  }
});

// ---------- Rules and modifiers ----------
test('bag: Potions heal half, run out, and No Potions removes them', () => {
  const ev = [];
  let req = null;
  const eng = E.createEngine({ seed: 3, player: { name: 'You', team: SAMPLE_TEAM }, exposeBattle: true }, (e) => { ev.push(e); if (e.t === 'request') req = e.request; });
  eng.choose('team 1234');
  assert.ok(req.active[0].moves.some((m) => m.id === 'potion'));
  assert.equal(req.vr.potions, 2);
  const mon = eng._battle.sides[0].active[0];
  mon.sethp(Math.floor(mon.maxhp / 4));
  const slot = req.active[0].moves.findIndex((m) => m.id === 'potion') + 1;
  eng.choose(`move ${slot} -1, move 1 1`);
  assert.ok(ev.flatMap((e) => e.lines || []).some((l) => l.startsWith('|-heal|p1a') && l.includes('Potion')));
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
  assert.equal(ev.at(-1).t, 'request', 'the same request stands');
  const r = run({ seed: 11, rules: { chaos: true } });
  assert.equal(r.events.filter((e) => e.t === 'request' && e.request.forceSwitch).length, 0);
});

test('Level Cap 45: the player is Lv 45, the champion Lv 50', () => {
  const log = logOf(playBattle(E, { seed: 8, rules: { levelCap: true } }, () => 'default', 3));
  assert.ok(log.some((l) => /^\|poke\|p1\|[^|]*L45/.test(l)));
  assert.ok(log.some((l) => /^\|poke\|p2\|[^|]*L50/.test(l)));
});

test('random items and random moves are real and legal in the engine', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const sets = teamOf(['garchomp', 'pikachu', 'snorlax', 'gengar', 'lucario', 'rotomwash'], { items: true, moves: true }, seed);
    assert.equal(new Set(sets.map((s) => s.item)).size, 6);
    sets.forEach((s) => assert.ok(D.items.get(s.item).exists, s.item));
    E.validateTeam(sets, D, raw.learnsets);
  }
});

test('every pair of modifiers (and all nine) plays to a result', () => {
  const keys = C.MODS.map((m) => m.k);
  const combos = [];
  for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) combos.push({ [keys[i]]: true, [keys[j]]: true });
  combos.push(Object.fromEntries(keys.map((k) => [k, true])));
  combos.forEach((mods, n) => {
    const seed = 1000 + n;
    const team = teamOf(['incineroar', 'rillaboom', 'gholdengo', 'amoonguss', 'dragonite', 'pikachu'], mods, seed);
    const r = run({ seed, player: { name: 'You', team }, rules: C.engineRules(mods) });
    assert.ok(r.winner === 'p1' || r.winner === 'p2', JSON.stringify(mods));
    assert.equal(r.events.filter((e) => e.t === 'fatal').length, 0);
  });
});

test('fuzz: 60 random full-pool teams play to a result without errors', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const team = C.battleLoadout(cat, draftOf([], { random: true }), seed * 7919, {}).sets;
    const r = run({ seed, rules: { randomTeam: true }, player: { name: 'You', team } });
    assert.ok(r.winner === 'p1' || r.winner === 'p2' || r.winner === '', `seed ${seed} did not finish`);
  }
});

// ---------- Validation at the engine boundary ----------
test('the engine refuses invalid teams', () => {
  const ok = teamOf(['garchomp', 'pikachu', 'snorlax']);
  E.validateTeam(ok, D, raw.learnsets);
  const bad = (team, re) => assert.throws(() => E.validateTeam(team, D, raw.learnsets), (e) => re.test(e.message), re);
  bad(ok.slice(0, 1), /two to six/);
  bad([...ok, ...ok, ...ok], /two to six/);
  bad([ok[0], { ...ok[0] }], /Species Clause/);
  bad([...teamOf(['mewtwo']), ...teamOf(['mew'])], /legendary or mythical/);
  bad([{ ...ok[1], moves: ['Spore'] }, ok[0]], /can't learn Spore/);
  bad([{ ...ok[1], moves: ['Thunderbolt', 'Thunderbolt'] }, ok[0]], /each move once/);
  bad([{ ...ok[1], moves: ['Catastropika'] }, ok[0]], /usable move|can't learn/);
  bad([{ ...ok[1], ability: 'Huge Power' }, ok[0]], /can't have/);
  bad([{ ...ok[1], item: 'Garchompite' }, { ...ok[0], item: 'Leftovers' }], /only works for/);
  bad([{ ...ok[1], item: 'Leftovers' }, { ...ok[0], item: 'Leftovers' }], /Item Clause/);
  bad([{ ...ok[1], evs: { hp: 33 } }, ok[0]], /0-32/);
  bad([{ ...ok[1], evs: { hp: 32, atk: 32, def: 32 } }, ok[0]], /66/);
  bad([{ ...ok[1], species: 'Charizard-Mega-X' }, ok[0]], /can't battle/);
  assert.throws(() => E.createEngine({ seed: 1, player: { name: 'You', team: ok.slice(0, 1) } }, () => {}), /two to six/);
});

test('Ren brings four of his six at random, and any two can lead', () => {
  const brought = new Map();
  const leads = new Set();
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const r = run({ seed, player: { name: 'You', team: SAMPLE_TEAM } }, () => 'default', { maxSteps: 2 });
    const log = logOf(r);
    const switched = log.filter((l) => /^\|switch\|p2[ab]: /.test(l)).map((l) => l.split('|')[3].split(',')[0]);
    const size = log.find((l) => l.startsWith('|teamsize|p2|'));
    assert.equal(size, '|teamsize|p2|4');
    const pair = switched.slice(0, 2).sort().join('+');
    leads.add(pair);
    switched.slice(0, 2).forEach((s) => { brought.set(s, (brought.get(s) || 0) + 1); seen.add(s); });
  }
  // Only his own six, all of them seen leading, and many different lead pairs (15 possible).
  const six = plain(E.CHAMPION.team).map((s) => s.species);
  [...seen].forEach((s) => assert.ok(six.some((x) => s === x || s.startsWith(x.split('-')[0])), s));
  assert.equal(seen.size, 6, [...seen].join());
  assert.ok(leads.size >= 12, `${leads.size} lead pairs: ${[...leads].join(' ')}`);
  // Same seed, same choice.
  const a = logOf(run({ seed: 77, player: { name: 'You', team: SAMPLE_TEAM } }, () => 'default', { maxSteps: 2 })).filter((l) => /^\|switch\|p2/.test(l));
  const b = logOf(run({ seed: 77, player: { name: 'You', team: SAMPLE_TEAM } }, () => 'default', { maxSteps: 2 })).filter((l) => /^\|switch\|p2/.test(l));
  assert.deepEqual(a, b);
});

test('the engine boundary enforces the random-team composition', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const team = C.battleLoadout(cat, draftOf([], { random: true }), seed, {}).sets;
    E.validateTeam(team, D, raw.learnsets, { randomTeam: true });
  }
  const team = C.battleLoadout(cat, draftOf([], { random: true }), 9, {}).sets;
  const bad = (t, re) => assert.throws(() => E.validateTeam(t, D, raw.learnsets, { randomTeam: true }), (e) => re.test(e.message), re);
  const plainAt = team.findIndex((s) => !['L', 'M'].includes(C.classOf(cat, C.toId(s.species))));
  const specialAt = team.findIndex((s) => ['L', 'M'].includes(C.classOf(cat, C.toId(s.species))));
  bad(team.slice(0, 5), /six Pokémon/);
  bad(team.map((s, i) => (i === specialAt ? { ...teamOf(['snorlax'])[0], item: '' } : s)), /exactly one/);
  bad(team.map((s, i) => (i === plainAt ? { ...teamOf(['primeape'])[0], item: '' } : s)), /fully evolved/);
  bad(team.map((s, i) => (i === plainAt ? { ...teamOf(['eevee'])[0], item: '' } : s)), /fully evolved/);
  // The same rule as species.json's flag (built by build-catalog.mjs): every pool entry agrees.
  cat.pool.forEach((e) => assert.equal(E.isFinal(D, D.species.get(e.id)), C.isFinal(cat, e.id), e.id));
  // A manual party is not held to it.
  E.validateTeam(teamOf(['eevee', 'pikachu']), D, raw.learnsets);
  // The worker passes the flag through from the page's rules.
  assert.deepEqual(C.engineRules({ random: true }).randomTeam, true);
});

// ---------- Type immunity: Poison into Steel (player report, 2026-10-10) ----------
// A player reported Sneasler's Poison move one-shotting Poison/Steel Revavroom. Not reproduced:
// these fixed scenarios run the shipped bundle's simulator directly (no AI) and pin the rule.
function scenario(p1, p2) {
  const b = new E.Battle({ formatid: E.FORMAT_ID, seed: 'sodium,00000000000000000000000000000001', send: () => {} });
  const mon = ([species, ability, moves]) => ({ species, name: species, ability, item: '', nature: 'Hardy', moves, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, level: 50 });
  b.setPlayer('p1', { name: 'A', team: p1.map(mon) });
  b.setPlayer('p2', { name: 'B', team: p2.map(mon) });
  b.choose('p1', 'team 12');
  b.choose('p2', 'team 12');
  // The public log (what a player's channel shows): after |split|, skip the exact-HP copy.
  const publicLog = () => { const out = []; for (let i = 0; i < b.log.length; i += 1) { if (b.log[i].startsWith('|split|')) { i += 1; continue; } if (!b.log[i].startsWith('|t:|')) out.push(b.log[i]); } return out; };
  return { b, publicLog };
}
const SNEASLER = ['Sneasler', 'Poison Touch', ['Dire Claw', 'Gunk Shot', 'Poison Jab', 'Close Combat']];
const PIKACHU = ['Pikachu', 'Static', ['Thunderbolt', 'Protect']];
const REVAVROOM = ['Revavroom', 'Overcoat', ['Shift Gear', 'Protect']];
const FOE_PIKACHU = ['Pikachu', 'Static', ['Growl', 'Protect']];

test('Steel blocks Poison damage: Dire Claw, Gunk Shot and Poison Jab do nothing to Revavroom', () => {
  for (const n of [1, 2, 3]) {
    const { b, publicLog } = scenario([SNEASLER, PIKACHU], [REVAVROOM, FOE_PIKACHU]);
    const rev = b.p2.active[0];
    assert.deepEqual(plain(rev.getTypes()), ['Steel', 'Poison']);
    const hp = rev.hp;
    b.choose('p1', `move ${n} 1, move 2`);
    b.choose('p2', 'move 1, move 2');
    const log = publicLog();
    const at = log.findIndex((l) => l.startsWith('|move|p1a: Sneasler|'));
    assert.ok(log[at].endsWith('|p2a: Revavroom'), log[at]);
    assert.equal(log[at + 1], '|-immune|p2a: Revavroom');
    assert.equal(rev.hp, hp, 'no damage');
    assert.equal(rev.status, '', 'no hit-derived status');
    assert.equal(rev.fainted, false);
  }
});

test('immunity then a partner hit: each in its own beat, damage only on the hit', () => {
  const { b, publicLog } = scenario([SNEASLER, PIKACHU], [REVAVROOM, FOE_PIKACHU]);
  const rev = b.p2.active[0];
  b.choose('p1', 'move 1 1, move 1 1'); // Dire Claw and Thunderbolt, both into Revavroom
  b.choose('p2', 'move 1, move 2');
  const turn = publicLog().slice(publicLog().lastIndexOf('|turn|1'));
  const beats = C.beats(turn).filter((x) => x.kind === 'move');
  const claw = beats.find((x) => /Dire Claw/.test(x.lines[0]));
  const bolt = beats.find((x) => /Thunderbolt/.test(x.lines[0]));
  assert.ok(claw && bolt);
  assert.ok(beats.indexOf(claw) < beats.indexOf(bolt), 'simulator order kept');
  assert.ok(claw.lines.includes('|-immune|p2a: Revavroom'));
  assert.ok(!claw.lines.some((l) => l.startsWith('|-damage|')), 'the immune beat carries no damage');
  assert.ok(bolt.lines.some((l) => l.startsWith('|-damage|p2a: Revavroom|') && !l.includes('[from]')), 'the partner hit carries the damage');
  assert.ok(rev.hp < rev.maxhp && rev.hp > 0);
  // Every line of the turn is in exactly one beat, in order.
  assert.deepEqual(C.beats(turn).flatMap((x) => x.lines), turn);
});

test('ordinary damage still lands: Close Combat hits Revavroom', () => {
  const { b } = scenario([SNEASLER, PIKACHU], [REVAVROOM, FOE_PIKACHU]);
  const rev = b.p2.active[0];
  b.choose('p1', 'move 4 1, move 2');
  b.choose('p2', 'move 1, move 2');
  assert.ok(rev.hp < rev.maxhp, 'Fighting into Steel/Poison is neutral and deals damage');
});

test('playback beats: Mega Evolution stays together, spread hits group, nothing reordered', () => {
  const lines = ['|', '|detailschange|p2a: Charizard|Charizard-Mega-Y, L50', '|-mega|p2a: Charizard|Charizard|Charizardite Y', '|move|p2a: Charizard|Heat Wave|p1a: Pikachu|[spread] p1a,p1b',
    '|-damage|p1a: Pikachu|40/110', '|-damage|p1b: Eevee|60/130', '|-supereffective|p1b: Eevee', '|-damage|p2a: Charizard|90/100|[from] item: Life Orb', '|faint|p1a: Pikachu', '|upkeep', '|turn|2'];
  const bs = C.beats(lines);
  assert.deepEqual(bs.map((x) => x.kind), ['', 'detailschange', 'move', 'upkeep', 'turn']);
  assert.deepEqual(bs.flatMap((x) => x.lines), lines);
  const st = C.steps(bs[2].lines);
  assert.deepEqual(st.map((x) => x.lines.length), [1, 2, 1, 1, 1]);
  assert.equal(st[1].hit, true);
  assert.equal(st[3].hit, false, 'Life Orb recoil is not a hit');
  // End-of-turn effects get their own beat after the last move; consecutive ones share it.
  const turn = ['|move|p1a: Dragonite|Dragon Claw|p2a: Floette', '|-immune|p2a: Floette', '|-damage|p2a: Floette|7/100 psn|[from] psn', '|-heal|p1a: Dragonite|90/100|[from] item: Leftovers', '|upkeep', '|turn|4'];
  assert.deepEqual(C.beats(turn).map((x) => [x.kind, x.lines.length]), [['move', 2], ['residual', 2], ['upkeep', 1], ['turn', 1]]);
});

test('worker choice pattern: allowlisted commands only', () => {
  const re = new RegExp(E.CHOICE.source);
  ['team 1234', 'team 12', 'move 1 2, move 3 -1', 'move 4 1 mega, switch 5', 'switch 3, pass', 'default', 'move 5 -2, move 2'].forEach((c) => assert.ok(re.test(c), c));
  ['move 1; eval', 'team 1234567', 'move 9 1', 'switch 7', 'move 1 3', '', 'move 1, move 2, move 3', 'MOVE 1'].forEach((c) => assert.ok(!re.test(c), c));
});

test('stale request ids are ignored', () => {
  const ev = [];
  const eng = E.createEngine({ seed: 6, player: { name: 'You', team: SAMPLE_TEAM } }, (e) => ev.push(e));
  const first = ev.filter((e) => e.t === 'request').at(-1).request;
  assert.equal(eng.choose('team 1234', first.rqid), true);
  const turn = eng.state().turn;
  assert.equal(eng.choose('default', first.rqid), false, 'the old request id is stale');
  assert.equal(eng.state().turn, turn);
  assert.equal(eng.choose('default', eng.state().rqid), true);
});

// ---------- Championship escalation ----------
test('escalation: exactly once, after two different champion Pokémon faint, reviving the first to faint at 50%', () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    let paused = null;
    const r = run({ seed, exposeBattle: true }, () => 'default', {
      onEscalation(e, engine) {
        const b = engine._battle;
        const fainted = b.sides[1].pokemon.filter((p) => p.fainted);
        assert.ok(new Set(fainted).size >= 2, 'two different champion Pokémon have fainted');
        assert.equal(engine.state().paused, true);
        assert.equal(engine.choose('default', engine.state().rqid), false, 'no action while paused');
        assert.equal(engine.resume('wrong-id'), false);
        const left = b.sides[1].pokemonLeft;
        assert.equal(engine.resume(e.id), true);
        assert.equal(engine.resume(e.id), false, 'a duplicate resume is ignored');
        const revived = engine.state().record.escalation.revived;
        assert.equal(revived.length, 1, 'only one comes back (Milind, 2026-10-10)');
        const firstDown = plain(engine.state().record.faints).find((f) => f.side === 'p2');
        assert.equal(revived[0], firstDown.species, 'the first to faint');
        assert.equal(b.sides[1].pokemonLeft, left + 1);
        assert.equal(b.sides[1].pokemon.filter((p) => p.fainted).length, fainted.length - 1, 'the others stay down');
        b.sides[1].pokemon.filter((p) => p.vrRevived).forEach((p) => {
          assert.ok(!p.fainted || p.hp === 0);
          if (!p.fainted) assert.equal(p.status, '');
        });
        paused = e;
      },
    });
    const escalations = r.events.filter((e) => e.t === 'escalation');
    assert.ok(escalations.length <= 1, `seed ${seed}`);
    if (!escalations.length) continue;
    checked += 1;
    assert.ok(paused);
    const log = logOf(r);
    const heals = log.filter((l) => l.startsWith('|-heal|p2') && l.includes('[from] vr: championship'));
    assert.equal(heals.length, 1);
    heals.forEach((l) => assert.match(l, /\|(49|50)\/100[gyr]?\|/, l)); // half, shown as a percentage (exact HP: next test)
    // Only Pokémon the champion brought can come back.
    const brought = new Set(log.filter((l) => l.startsWith('|switch|p2')).map((l) => l.split('|')[2].replace(/^p2[ab]: /, '')));
    heals.forEach((l) => assert.ok(brought.has(l.split('|')[2].replace(/^p2[ab]?: /, '')), l));
    // A fresh, valid request follows the revival, and the battle finishes normally.
    const after = r.events.slice(r.events.indexOf(escalations[0]) + 1);
    assert.ok(after.some((e) => e.t === 'request'));
    assert.ok(r.winner === 'p1' || r.winner === 'p2');
    // Before the event, at most one champion Pokémon had fainted at any earlier boundary.
    const faintsBefore = plain(r.record.faints).filter((f) => f.side === 'p2' && f.turn < r.record.escalation.turn);
    assert.ok(faintsBefore.length < 2 || r.record.escalation.turn === faintsBefore[1].turn);
  }
  assert.ok(checked >= 20, `escalation seen in ${checked}/40 battles`);
});

test('escalation revives the exact HP (half, rounded down) and keeps spent PP and items', () => {
  let done = false;
  for (let seed = 1; seed <= 30 && !done; seed += 1) {
    run({ seed, exposeBattle: true }, () => 'default', {
      onEscalation(e, engine) {
        const before = engine._battle.sides[1].pokemon.filter((p) => p.fainted).map((p) => ({ p, pp: p.moveSlots.map((m) => m.pp), item: p.item }));
        engine.resume(e.id);
        before.filter(({ p }) => p.vrRevived).forEach(({ p, pp, item }) => {
          assert.equal(p.hp, Math.floor(p.maxhp / 2));
          assert.deepEqual(p.moveSlots.map((m) => m.pp), pp);
          assert.equal(p.item, item);
        });
        done = true;
      },
    });
  }
  assert.ok(done);
});

test('simultaneous knockouts trigger one escalation that revives exactly one', () => {
  let found = 0;
  for (let seed = 1; seed <= 120 && found < 3; seed += 1) {
    const r = run({ seed });
    const f = plain(r.record.faints).filter((x) => x.side === 'p2');
    if (f.length >= 2 && f[0].turn === f[1].turn && r.record.escalation) {
      found += 1;
      const revived = plain(r.record.escalation.revived);
      assert.equal(revived.length, 1);
      assert.ok([f[0].species, f[1].species].includes(revived[0]));
      assert.equal(r.record.escalation.turn, f[1].turn);
    }
  }
  assert.ok(found >= 1, 'no simultaneous double knockout found in 120 seeds');
});

test('the revival needs no switch-out effects: none of the champion\'s abilities or items have any', () => {
  const t = plain(E.CHAMPION.team);
  t.forEach((s) => {
    const ab = D.abilities.get(s.ability);
    const it = D.items.get(s.item);
    for (const fx of [ab, it]) assert.ok(!fx.onSwitchOut && !fx.onBeforeSwitchOut && !fx.onEnd, `${fx.name}`);
  });
});

test('if the player is out when the second champion Pokémon falls, the loss stands (no escalation)', () => {
  const eng = E.createEngine({ seed: 12, exposeBattle: true, player: { name: 'You', team: teamOf(['magikarp', 'feebas']) } }, () => {});
  eng.choose('team 12');
  const b = eng._battle;
  b.sides[0].pokemon.forEach((p) => p.faint());
  b.sides[1].active.forEach((p) => p.faint());
  b.faintMessages();
  b.sendUpdates();
  assert.ok(b.ended);
  assert.equal(eng.choose('default'), false);
  assert.equal(eng.state().record.escalation, null);
});

// ---------- Strength ----------
// A strategic player: the same heuristic the champion uses, driving p1 from p1's own view.
function strategicPolicy(seed) {
  const view = E.createView('p1');
  const ai = E.createAI(D, C.rng(seed ^ 0x77777777), 50, 'hard');
  // Same four as the naive player (team 1234), so the comparison is about in-battle decisions;
  // the AI's own team preview is Ren's random pick.
  return { view, pick: (req) => (req.teamPreview ? 'team 1234' : ai.decide(req, view) || 'default') };
}
test('strategic play beats the champion more often than naive play (reported sample)', () => {
  const N = 30;
  const tally = { naive: 0, strategic: 0 };
  for (const mode of ['naive', 'strategic']) {
    for (let seed = 1; seed <= N; seed += 1) {
      const policy = strategicPolicy(seed);
      let fed = 0;
      const events = [];
      let request = null; let esc = null; let winner = null;
      const engine = E.createEngine({ seed, player: { name: 'You', team: SAMPLE_TEAM } }, (ev) => { events.push(ev); if (ev.t === 'request') request = ev.request; if (ev.t === 'escalation') esc = ev; if (ev.t === 'end') winner = ev.winner; });
      for (let i = 0; i < 500 && winner === null; i += 1) {
        if (esc) { engine.resume(esc.id); esc = null; continue; }
        if (!request) break;
        const req = request; request = null;
        let choice = 'default';
        if (mode === 'strategic') {
          const lines = events.filter((e) => e.t === 'log').flatMap((e) => e.lines);
          policy.view.feed(lines.slice(fed));
          fed = lines.length;
          choice = policy.pick(req);
        }
        if (!engine.choose(choice, req.rqid) && choice !== 'default' && !request) engine.choose('default', req.rqid);
      }
      if (winner === 'p1') tally[mode] += 1;
    }
  }
  console.log(`# player wins over ${N} seeds vs Ren (hard): naive ${tally.naive}, strategic ${tally.strategic}`);
  assert.ok(tally.strategic > tally.naive, JSON.stringify(tally));
});

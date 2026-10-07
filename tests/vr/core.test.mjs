// Victory Road core logic. Run: node --test tests/vr/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const C = require('../../public/vr/vr-core.js');
const dex = JSON.parse(fs.readFileSync(new URL('../../public/vr/dex.json', import.meta.url), 'utf8'));
const pool = dex.pool.map(([id, name, num, gen, form]) => ({ id, name, num, gen, form }));
const byId = Object.fromEntries(pool.map((e) => [e.id, e]));
const all = (on) => Object.fromEntries(C.MODS.map((m) => [m.k, on]));

test('modifiers run from least to most reward, ending with the level cap', () => {
  const ms = C.MODS.map((m) => m.m);
  assert.deepEqual([...ms].sort((a, b) => a - b), ms);
  assert.deepEqual(C.MODS.map((m) => m.k), ['shiny', 'taunts', 'items', 'chaos', 'noswitch', 'nopotions', 'random', 'moves', 'cap']);
  assert.equal(C.MODS.at(-1).label, 'Level cap 45');
});

test('multipliers compound', () => {
  assert.equal(C.multiplier(all(false)), 1);
  assert.equal(C.multiplier({ shiny: true, taunts: true }), 1);
  assert.equal(C.multiplier({ random: true, moves: true }).toFixed(4), (1.35 * 1.5).toFixed(4));
  assert.equal(C.multiplier(all(true)).toFixed(3), '6.724');
});

test('tier boundaries', () => {
  assert.equal(C.tier(1), 'Bronze');
  assert.equal(C.tier(1.7499), 'Bronze');
  assert.equal(C.tier(1.75), 'Silver');
  assert.equal(C.tier(2.4999), 'Silver');
  assert.equal(C.tier(2.5), 'Gold');
  assert.equal(C.tier(4), 'Master');
  assert.equal(C.tier(C.multiplier({ cap: true })), 'Silver');
});

test('the pool lists every National Dex species once as a base form', () => {
  const bases = pool.filter((e) => !e.form);
  assert.equal(bases.length, 1025);
  assert.equal(new Set(bases.map((e) => e.num)).size, 1025);
  assert.ok(byId.floetteeternal && byId.basculegion && byId.kingambit && byId.dragonite && byId.garchomp && byId.sneasler);
  assert.ok(!pool.some((e) => /Mega|Gmax|Totem/.test(e.form)));
});

test('random teams: six unique species, seeded and repeatable, within the chosen generations', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const team = C.rollTeam(C.eligible(pool, { mode: 'cross', gens: [1, 9], gen: 1 }), C.rng(seed));
    assert.equal(team.length, 6);
    assert.equal(new Set(team.map((id) => byId[id].num)).size, 6);
    team.forEach((id) => assert.ok([1, 9].includes(byId[id].gen)));
  }
  assert.deepEqual(C.rollTeam(pool, C.rng(42)), C.rollTeam(pool, C.rng(42)));
  assert.notDeepEqual(C.rollTeam(pool, C.rng(42)), C.rollTeam(pool, C.rng(43)));
});

test('the shuffle is unbiased enough: every position is hit evenly', () => {
  const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const rand = C.rng(7);
  for (let i = 0; i < 40000; i += 1) C.shuffle([0, 1, 2, 3], rand).forEach((v, pos) => { counts[v][pos] += 1; });
  counts.flat().forEach((n) => assert.ok(Math.abs(n - 10000) < 400, `count ${n}`));
});

test('moving a slot never duplicates or loses a Pokémon', () => {
  const team = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (let from = 0; from < 6; from += 1) {
    for (let to = -2; to < 8; to += 1) {
      const out = C.moveSlot(team, from, to);
      assert.equal(out.length, 6);
      assert.deepEqual([...out].sort(), [...team]);
      assert.equal(out[Math.max(0, Math.min(5, to))], team[from]);
    }
  }
  assert.deepEqual(C.moveSlot(team, 3, 0), ['d', 'a', 'b', 'c', 'e', 'f']);
});

test('adding enforces six slots, no duplicates and one per species', () => {
  let team = [];
  ['garchomp', 'kingambit', 'sneasler', 'dragonite', 'basculegion', 'floetteeternal'].forEach((id) => { team = C.addToTeam(team, byId[id], byId).team; });
  assert.equal(team.length, 6);
  assert.match(C.addToTeam(team, byId.pikachu, byId).error, /full/);
  assert.match(C.addToTeam(['rotom'], byId.rotomwash, byId).error, /one of each species/);
  assert.match(C.addToTeam(['rotom'], byId.rotom, byId).error, /already/);
});

test('a hidden random team is never written to storage', () => {
  const saved = C.serialize({ mode: 'cross', gen: 1, gens: [1], team: ['garchomp'], mods: { ...all(false), random: true } });
  assert.equal(JSON.parse(saved).team.length, 0);
  assert.doesNotMatch(saved, /garchomp/);
});

test('restore validates storage and migrates old Champion Run saves', () => {
  const old = JSON.stringify({ mode: 'cross', gen: 4, gens: [1, 4, 9], team: ['Garchomp', 'Lucario', 'Nonsense'], mods: { moves: true, potions: true } });
  const st = C.restore(old, byId);
  assert.deepEqual(st.team, ['garchomp', 'lucario']);
  assert.deepEqual(st.gens, [1, 4, 9]);
  assert.equal(st.mods.moves, true);
  assert.equal(st.mods.nopotions, false);
  assert.deepEqual(C.restore('{bad json', byId).team, []);
  assert.deepEqual(C.restore(JSON.stringify({ gens: [0, 12, 'x'] }), byId).gens, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('combination notes are only shown when they apply', () => {
  assert.equal(C.modNotes(all(false)).length, 0);
  assert.equal(C.modNotes({ noswitch: true, chaos: true }).length, 1);
});

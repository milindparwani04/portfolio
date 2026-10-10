// The Very Best core logic (public/vr/vr-core.js). Run: node --test tests/vr/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const C = require('../../public/vr/vr-core.js');
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../public/vr/${f}`, import.meta.url), 'utf8'));
const raw = { dex: read('dex.json'), species: read('species.json'), learnsets: read('learnsets.json'), items: read('items.json'), sets: read('sets.json') };
const cat = C.catalog(raw);
const movepools = read('movepools.json');
const byId = cat.byId;
const all = (on) => Object.fromEntries(C.MODS.map((m) => [m.k, on]));
const partyOf = (ids) => ids.reduce((p, id) => { const r = C.addMember(cat, p, byId[id]); assert.equal(r.error, '', `${id}: ${r.error}`); return r.party; }, []);
const draftOf = (ids, mods = {}) => ({ filterGen: 0, party: partyOf(ids), mods: { ...all(false), ...mods } });

test('modifiers run from least to most reward, ending with the level cap', () => {
  const ms = C.MODS.map((m) => m.m);
  assert.deepEqual([...ms].sort((a, b) => a - b), ms);
  assert.deepEqual(C.MODS.map((m) => m.k), ['shiny', 'taunts', 'items', 'chaos', 'noswitch', 'nopotions', 'random', 'moves', 'cap']);
  assert.equal(C.MODS.at(-1).label, 'Level cap 45');
});

test('multipliers compound and tiers keep their boundaries', () => {
  assert.equal(C.multiplier(all(false)), 1);
  assert.equal(C.multiplier({ shiny: true, taunts: true }), 1);
  assert.equal(C.multiplier({ random: true, moves: true }).toFixed(4), (1.35 * 1.5).toFixed(4));
  assert.equal(C.multiplier(all(true)).toFixed(3), '6.724');
  assert.equal(C.tier(1.7499), 'Bronze');
  assert.equal(C.tier(1.75), 'Silver');
  assert.equal(C.tier(2.5), 'Gold');
  assert.equal(C.tier(C.multiplier(all(true))), 'Master');
});

test('spectrum: empty at no handicaps, cosmetics never count, full only with every gameplay modifier', () => {
  assert.equal(C.difficulty(all(false)), 0);
  assert.equal(C.difficulty({ shiny: true, taunts: true }), 0);
  assert.equal(C.difficulty(all(true)), 1);
  const gameplay = C.MODS.filter((m) => !m.cosmetic).map((m) => m.k);
  assert.deepEqual(gameplay, ['items', 'chaos', 'noswitch', 'nopotions', 'random', 'moves', 'cap']);
  assert.equal(C.difficulty(Object.fromEntries(gameplay.map((k) => [k, true]))), 1);
  // Every subset that leaves one gameplay modifier out stays below full, cosmetics or not.
  for (const left of gameplay) {
    const mods = { ...all(true), [left]: false };
    assert.ok(C.difficulty(mods) < 1, left);
  }
  // Adding a handicap always moves the fill up; the log scale agrees with the multiplier's order.
  let prev = 0;
  for (const k of gameplay) { const p = C.difficulty(Object.fromEntries(gameplay.slice(0, gameplay.indexOf(k) + 1).map((x) => [x, true]))); assert.ok(p > prev); prev = p; }
  assert.ok(C.difficulty({ cap: true }) > C.difficulty({ items: true }));
  assert.equal(C.difficultyLabel(0), 'Standard');
  assert.equal(C.difficultyLabel(1), 'The Very Best');
  assert.equal(C.difficultyLabel(C.difficulty({ items: true })), 'Tough');
});

test('the catalog lists every National Dex species once as a base form, ordered by generation and number', () => {
  const bases = cat.pool.filter((e) => !e.form);
  assert.equal(bases.length, 1025);
  assert.equal(new Set(bases.map((e) => e.num)).size, 1025);
  for (let i = 1; i < cat.pool.length; i += 1) assert.ok(cat.pool[i].gen > cat.pool[i - 1].gen || (cat.pool[i].gen === cat.pool[i - 1].gen && cat.pool[i].num >= cat.pool[i - 1].num));
  assert.ok(!cat.pool.some((e) => /Mega|Gmax|Totem|Primal/.test(e.form)), 'battle-only forms are not pickable');
  cat.pool.forEach((e) => { assert.ok(cat.species[e.id], `species data for ${e.id}`); assert.ok(raw.learnsets.learnsets[e.id], `learnset for ${e.id}`); assert.ok(raw.sets.sets[e.id], `default set for ${e.id}`); });
});

test('classification: legendaries and mythicals share one allowance; regional forms inherit; UB and Paradox are free', () => {
  assert.equal(C.classOf(cat, 'mewtwo'), 'L');
  assert.equal(C.classOf(cat, 'zapdos'), 'L');
  assert.equal(C.classOf(cat, 'zapdosgalar'), 'L');
  assert.equal(C.classOf(cat, 'mew'), 'M');
  assert.equal(C.classOf(cat, 'nihilego'), 'U');
  assert.equal(C.classOf(cat, 'greattusk'), 'P');
  assert.equal(C.classOf(cat, 'garchomp'), '');
  let p = partyOf(['mewtwo', 'garchomp']);
  assert.match(C.addMember(cat, p, byId.mew).error, /one legendary or mythical/i);
  assert.match(C.addMember(cat, p, byId.zapdosgalar).error, /one legendary or mythical/i);
  p = C.addMember(cat, p, byId.nihilego).party;
  p = C.addMember(cat, p, byId.greattusk).party;
  assert.equal(p.length, 4);
  assert.match(C.addMember(cat, partyOf(['rotom']), byId.rotomwash).error, /one of each species/);
  assert.match(C.addMember(cat, partyOf(['a', 'b', 'c', 'd', 'e', 'f'].map((_, i) => ['pikachu', 'eevee', 'snorlax', 'gengar', 'lucario', 'garchomp'][i])), byId.mew).error, /full/);
  assert.ok(C.partyProblems(cat, [...partyOf(['garchomp']), { ...C.defaultMember(cat, 'mew', 'm9') }, { ...C.defaultMember(cat, 'mewtwo', 'm8') }]).some((t) => /legendary or mythical/.test(t)), 'party-level check too');
});

test('random team: whole pool whatever the filter shows, exactly five fully evolved non-specials plus one legendary or mythical', () => {
  const gens = new Set();
  const specialAt = new Set();
  for (let seed = 1; seed <= 1000; seed += 1) {
    const team = C.rollTeam(cat, C.rng(seed));
    assert.equal(team.length, 6);
    assert.equal(new Set(team.map((id) => byId[id].num)).size, 6, 'unique species');
    assert.equal(team.filter((id) => C.isSpecial(cat, id)).length, 1, `seed ${seed}: one special`);
    assert.equal(team.filter((id) => !C.isSpecial(cat, id) && C.isFinal(cat, id)).length, 5, `seed ${seed}: five fully evolved`);
    assert.ok(team.every((id) => C.isFinal(cat, id)), 'the special is fully evolved too');
    assert.ok(team.every((id) => cat.pool.includes(byId[id])), 'pickable forms only, never battle-only forms');
    assert.equal(C.randomTeamProblem(cat, team), '');
    specialAt.add(team.findIndex((id) => C.isSpecial(cat, id)));
    team.forEach((id) => gens.add(byId[id].gen));
  }
  assert.equal(specialAt.size, 6, 'the special slot is shuffled');
  assert.equal(gens.size, 9);
  // The same through the battle snapshot with a Gen I filter saved in the draft.
  const draft = draftOf(['pikachu'], { random: true });
  draft.filterGen = 1;
  const seen = new Set();
  for (let seed = 1; seed <= 100; seed += 1) C.battleLoadout(cat, draft, seed, {}).members.forEach((m) => seen.add(byId[m.id].gen));
  assert.ok(seen.size >= 8);
  assert.deepEqual(C.rollTeam(cat, C.rng(42)), C.rollTeam(cat, C.rng(42)));
});

test('fully evolved: ordinary evolution stages and forms, from the engine data', () => {
  const final = ['annihilape', 'vaporeon', 'sylveon', 'raichualola', 'perrserker', 'persian', 'tauros', 'scizor', 'kleavor', 'wyrdeer', 'basculin', 'basculegion', 'sneasler', 'clodsire', 'rotomwash', 'gholdengo', 'archaludon', 'sirfetchd', 'mrrime', 'floetteeternal'];
  const not = ['primeape', 'eevee', 'pikachu', 'meowth', 'meowthgalar', 'scyther', 'dunsparce', 'girafarig', 'stantler', 'ursaring', 'basculinwhitestriped', 'qwilfishhisui', 'sneaselhisui', 'slowpokegalar', 'wooperpaldea', 'gimmighoul', 'duraludon', 'applin', 'dipplin', 'farfetchdgalar', 'mrmimegalar', 'cosmog', 'kubfu', 'typenull', 'floette'];
  final.forEach((id) => assert.equal(C.isFinal(cat, id), true, id));
  not.forEach((id) => assert.equal(C.isFinal(cat, id), false, id));
  // Ultra Beasts and Paradox Pokémon are ordinary picks, not the special slot.
  assert.equal(C.isSpecial(cat, 'nihilego'), false);
  assert.equal(C.isSpecial(cat, 'fluttermane'), false);
  const { finals, specials } = C.randomPools(cat);
  const flat = (g) => g.flat();
  assert.ok(flat(finals).includes('nihilego') && flat(finals).includes('fluttermane'));
  assert.ok(!flat(finals).some((id) => flat(specials).includes(id)), 'disjoint pools');
  assert.ok(!flat(specials).includes('cosmog') && flat(specials).includes('mewtwo') && flat(specials).includes('mew'));
  // The validator refuses teams that break the rule.
  const ok = C.rollTeam(cat, C.rng(5));
  assert.match(C.randomTeamProblem(cat, ok.map((id) => (C.isSpecial(cat, id) ? 'garchomp' : id))), /species|legendary/);
  assert.match(C.randomTeamProblem(cat, [...ok.filter((id) => !C.isSpecial(cat, id)).slice(0, 5), 'primeape']), /legendary|fully evolved/);
  assert.match(C.randomTeamProblem(cat, ok.map((id, i) => (i === ok.findIndex((x) => !C.isSpecial(cat, x)) ? 'mew' : id))), /exactly one/);
  assert.match(C.randomTeamProblem(cat, ok.slice(0, 5)), /six/);
});

test('catalog search: an exact type name shows only that type, within the generation filter', () => {
  const shown = (q, gen = 0) => cat.pool.filter((e) => C.matches(e, q, gen));
  const fire = shown('fire');
  assert.ok(fire.length > 50);
  assert.ok(fire.every((e) => e.types.includes('Fire')), 'only Fire types');
  assert.deepEqual(fire, cat.pool.filter((e) => e.types.includes('Fire')), 'every Fire type, dual types included');
  assert.ok(fire.some((e) => e.types.length === 2 && e.types[0] !== 'Fire'), 'a secondary Fire type is included');
  assert.deepEqual(shown('FIRE'), fire);
  assert.deepEqual(shown('  Fire '), fire);
  // Names containing a type word don't leak in: "Steelix" is Steel, but "rock" must not bring in
  // a non-Rock "Rockruff"-like name, and "ice" must not match "Pikachu"-like substrings.
  assert.ok(shown('ice').every((e) => e.types.includes('Ice')));
  assert.ok(shown('dark').every((e) => e.types.includes('Dark')));
  assert.ok(!shown('normal').some((e) => !e.types.includes('Normal')));
  // Generation filter intersects (forms count in their species' generation, as the chips show).
  assert.ok(shown('fire', 1).every((e) => e.gen === 1 && e.types.includes('Fire')));
  assert.deepEqual(shown('fire', 1).map((e) => e.id), ['charmander', 'charmeleon', 'charizard', 'vulpix', 'ninetales', 'growlithe', 'growlithehisui', 'arcanine', 'arcaninehisui', 'ponyta', 'rapidash', 'marowakalola', 'magmar', 'taurospaldeablaze', 'flareon', 'moltres']);
  // Names and numbers still work; a partial type word is a name search; empty restores the filter.
  assert.deepEqual(shown('pikachu').map((e) => e.id), ['pikachu']);
  assert.deepEqual(shown('#25').map((e) => e.id).slice(0, 1), ['pikachu']);
  assert.ok(shown('fir').every((e) => e.name.toLowerCase().includes('fir') || e.form.toLowerCase().includes('fir')));
  assert.equal(shown('').length, cat.pool.length);
  assert.equal(shown('', 3).length, cat.pool.filter((e) => e.gen === 3).length);
  assert.equal(shown('zzzz').length, 0);
  assert.equal(C.TYPES.length, 18);
});

test('the draft is byte-for-byte unchanged through Random moves, items and team on and off', () => {
  const draft = draftOf(['garchomp', 'pikachu', 'snorlax']);
  draft.party = C.updateMember(draft.party, draft.party[1].uid, { moves: ['Thunderbolt', 'Protect', 'Fake Out'], item: 'Light Ball' });
  const before = C.serialize(draft);
  for (const mods of [{ moves: true }, { items: true }, { random: true }, { moves: true, items: true, random: true }, {}]) {
    draft.mods = { ...all(false), ...mods };
    const bl = C.battleLoadout(cat, draft, 77, { movepools });
    assert.ok(bl.sets.length);
    draft.mods = all(false);
    assert.equal(C.serialize(draft), before, JSON.stringify(mods));
  }
  // With Random moves off again the battle uses exactly the saved moves and items.
  const plain = C.battleLoadout(cat, draft, 78, { movepools });
  assert.deepEqual(plain.sets[1].moves, ['Thunderbolt', 'Protect', 'Fake Out']);
  assert.equal(plain.sets[1].item, 'Light Ball');
  draft.mods = { ...all(false), moves: true, items: true };
  const random = C.battleLoadout(cat, draft, 78, { movepools });
  assert.notDeepEqual(random.sets.map((s) => s.moves), plain.sets.map((s) => s.moves));
  assert.equal(new Set(random.sets.map((s) => s.item)).size, 3);
});

test('members keep their moves and items by identity through reordering and removal', () => {
  let p = partyOf(['garchomp', 'pikachu', 'snorlax', 'gengar']);
  p = C.updateMember(p, p[1].uid, { moves: ['Thunderbolt', 'Volt Tackle'], item: 'Light Ball' });
  const pika = p[1].uid;
  p = C.moveSlot(p, 1, 3);
  assert.equal(p[3].uid, pika);
  assert.deepEqual(p[3].moves, ['Thunderbolt', 'Volt Tackle']);
  p = C.removeMember(p, p[0].uid);
  const again = p.find((m) => m.uid === pika);
  assert.deepEqual(again.moves, ['Thunderbolt', 'Volt Tackle']);
  assert.equal(again.item, 'Light Ball');
  p = C.addMember(cat, p, byId.lucario).party;
  assert.equal(new Set(p.map((m) => m.uid)).size, p.length, 'uids stay unique after removal');
});

test('a party of three is a complete, battle-ready party; one is not', () => {
  const three = partyOf(['garchomp', 'pikachu', 'snorlax']);
  assert.equal(three.length, 3);
  assert.deepEqual(C.partyProblems(cat, three), []);
  assert.ok(C.partyProblems(cat, partyOf(['garchomp'])).some((t) => /at least 2/.test(t)));
  assert.deepEqual(C.partyProblems(cat, partyOf(['garchomp', 'pikachu'])), []);
});

test('move and item validation: legal learnset, four unique moves, Item Clause, species items, choice items', () => {
  const [m] = partyOf(['pikachu']);
  assert.deepEqual(C.memberProblems(cat, m), []);
  assert.ok(C.memberProblems(cat, { ...m, moves: ['Thunderbolt', 'Spore'] }).some((t) => /can’t learn Spore/.test(t)));
  assert.ok(C.memberProblems(cat, { ...m, moves: ['Thunderbolt', 'Thunderbolt'] }).some((t) => /once/.test(t)));
  assert.ok(C.memberProblems(cat, { ...m, moves: ['Thunderbolt', 'Protect', 'Fake Out', 'Volt Tackle', 'Quick Attack'] }).some((t) => /Four/.test(t)));
  assert.ok(C.memberProblems(cat, { ...m, moves: [] }).some((t) => /at least one/.test(t)));
  assert.ok(C.memberProblems(cat, { ...m, item: 'Garchompite' }).some((t) => /only works for Garchomp/.test(t)));
  assert.ok(C.memberProblems(cat, { ...m, ability: 'Levitate' }).length);
  assert.ok(C.memberProblems(cat, { ...m, item: 'Choice Specs', moves: ['Protect', 'Nasty Plot'] }).some((t) => /locks/.test(t)));
  const [g] = partyOf(['garchomp']);
  assert.deepEqual(C.memberProblems(cat, { ...g, item: 'Garchompite' }), []);
  const p = partyOf(['garchomp', 'snorlax']).map((x) => ({ ...x, item: 'Leftovers' }));
  assert.ok(C.partyProblems(cat, p).some((t) => /Item Clause/.test(t)));
  // Smeargle can Sketch anything sketchable.
  assert.ok(C.legalMoves(cat, 'smeargle').size > 700);
  // Forms inherit their parent's moves (Rotom-Wash keeps Thunderbolt), regional forms don't take
  // the other region's (Alolan Vulpix has no Flamethrower).
  assert.ok(C.legalMoves(cat, 'rotomwash').has('Thunderbolt') && C.legalMoves(cat, 'rotomwash').has('Hydro Pump'));
  assert.ok(!C.legalMoves(cat, 'vulpixalola').has('Flamethrower'));
  assert.ok(C.legalMoves(cat, 'raichu').has('Fake Out'), 'prevolution moves (Pichu/Pikachu) count');
});

test('six default sets never clash under Item Clause (a taken default item is swapped for a free one)', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const ids = C.rollTeam(cat, C.rng(seed));
    const party = partyOf(ids);
    assert.deepEqual(C.partyProblems(cat, party), [], ids.join());
    const bl = C.battleLoadout(cat, { filterGen: 0, party: [], mods: { ...all(false), random: true } }, seed, {});
    const items = bl.sets.map((s) => s.item).filter(Boolean);
    assert.equal(new Set(items).size, items.length);
  }
});

test('every default set is legal under the editor rules', () => {
  const bad = [];
  cat.pool.forEach((e) => {
    const m = C.defaultMember(cat, e.id, 'm1');
    const problems = C.memberProblems(cat, m);
    if (problems.length) bad.push(`${e.id}: ${problems.join('; ')}`);
  });
  assert.deepEqual(bad, []);
});

test('saves: v3 round trip, v2/v1 migration, corrupt and hostile input', () => {
  const draft = draftOf(['garchomp', 'pikachu', 'mew'], { moves: true });
  draft.filterGen = 4;
  draft.party = C.updateMember(draft.party, draft.party[1].uid, { moves: ['Thunderbolt'], item: 'Light Ball' });
  const back = C.restore(C.serialize(draft), cat).draft;
  assert.deepEqual(back, draft);
  // v2 (Victory Road, ids) and v1 (Champion Run, display names).
  const v2 = C.restore(null, cat, JSON.stringify({ v: 2, mode: 'cross', gen: 1, gens: [1], team: ['garchomp', 'lucario', 'nonsense'], mods: { cap: true } }));
  assert.deepEqual(v2.draft.party.map((m) => m.id), ['garchomp', 'lucario']);
  assert.equal(v2.draft.mods.cap, true);
  assert.equal(v2.migrated, true);
  const v1 = C.restore(null, cat, JSON.stringify({ team: ['Garchomp', 'Lucario'], mods: { potions: true } }));
  assert.deepEqual(v1.draft.party.map((m) => m.id), ['garchomp', 'lucario']);
  // Corrupt, oversized, wrong types.
  assert.deepEqual(C.restore('{bad json', cat).draft.party, []);
  assert.deepEqual(C.restore('x'.repeat(30000), cat).draft.party, []);
  assert.deepEqual(C.restore('[]', cat).draft.party, []);
  const hostile = C.restore(JSON.stringify({ v: 3, filterGen: 99, mods: { cap: 'yes', moves: 1 }, party: [
    { id: 'mewtwo', moves: ['Psystrike'] }, { id: 'mew', moves: ['Psychic'] }, { id: 'pikachu', moves: ['Spore', 'Thunderbolt'], item: 'Garchompite', ability: 'Levitate' },
    { id: '<img src=x onerror=alert(1)>' }, { id: 'snorlax', item: 'Leftovers' }, { id: 'munchlax', item: 'Leftovers' }, null, 5
  ] }), cat);
  assert.deepEqual(hostile.draft.party.map((m) => m.id), ['mewtwo', 'pikachu', 'snorlax', 'munchlax']);
  assert.ok(hostile.notes.some((t) => /legendary or mythical/.test(t)), 'the second special is dropped and explained');
  const pika = hostile.draft.party[1];
  assert.deepEqual(pika.moves, C.defaultMember(cat, 'pikachu', 'x').moves, 'illegal moves fall back to the default set');
  assert.equal(pika.ability, C.defaultMember(cat, 'pikachu', 'x').ability);
  assert.equal(hostile.draft.party[2].item, 'Leftovers');
  assert.notEqual(hostile.draft.party[3].item, 'Leftovers', 'Item Clause on restore');
  assert.equal(new Set(hostile.draft.party.map((m) => m.item)).size, 4);
  assert.equal(hostile.draft.filterGen, 0);
  assert.equal(hostile.draft.mods.cap, false);
  assert.equal(hostile.draft.mods.moves, false);
  hostile.draft.party.forEach((m) => assert.deepEqual(C.memberProblems(cat, m), []));
});

test('a hidden random team and the trainer name are never written to storage', () => {
  const draft = draftOf(['garchomp'], { random: true });
  const bl = C.battleLoadout(cat, draft, 5, {});
  const saved = C.serialize(draft);
  bl.members.forEach((m) => { if (m.id !== 'garchomp') assert.doesNotMatch(saved, new RegExp(`"${m.id}"`)); });
  assert.doesNotMatch(saved, /name/);
});

test('trainer names: trimmed, 1-20 graphemes, no control characters, default when empty', () => {
  assert.deepEqual(C.cleanName('  Ash  Ketchum '), { name: 'Ash Ketchum', error: '' });
  assert.equal(C.cleanName('').name, C.DEFAULT_NAME);
  assert.equal(C.cleanName('   ').name, C.DEFAULT_NAME);
  assert.ok(C.cleanName('a\u0007b').error);
  assert.ok(C.cleanName('evil‮eman').error, 'bidi override');
  assert.ok(C.cleanName('x'.repeat(21)).error);
  assert.equal(C.cleanName('x'.repeat(20)).error, '');
  assert.equal(C.cleanName('👨‍👩‍👧‍👦'.repeat(20)).error, '', 'a family emoji is one grapheme');
  assert.equal(C.cleanName('<b>Hi</b>').name, '<b>Hi</b>', 'markup is kept as text (rendered with textContent)');
});

test('stats follow the engine formula (Champions stat points, natures, level)', () => {
  const [g] = partyOf(['garchomp']);
  const s50 = C.memberStats(cat, g, 50);
  const s45 = C.memberStats(cat, g, 45);
  C.STATS.forEach((k) => assert.ok(s45[k] < s50[k], k));
  assert.equal(C.calcStats({ hp: 1, atk: 90, def: 45, spa: 30, spd: 30, spe: 40 }, {}, 'Hardy', 50, 'shedinja').hp, 1);
});

test('notes and overrides explain modifier interactions', () => {
  assert.equal(C.modNotes(all(false)).length, 0);
  assert.equal(C.modNotes({ noswitch: true, chaos: true }).length, 1);
  assert.ok(C.modNotes({ random: true }, 3).some((t) => /party of 3/.test(t)));
  assert.ok(C.overrides({ moves: true }).some((t) => /this battle only/.test(t)));
});

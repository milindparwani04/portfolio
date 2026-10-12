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
  assert.deepEqual(C.MODS.map((m) => m.k), ['shiny', 'taunts', 'chaos', 'noswitch', 'nopotions', 'random', 'moves', 'cap']);
  assert.equal(C.MODS.at(-1).label, 'Level cap 45');
});

test('multipliers compound and tiers keep their boundaries', () => {
  assert.equal(C.multiplier(all(false)), 1);
  assert.equal(C.multiplier({ shiny: true, taunts: true }), 1);
  assert.equal(C.multiplier({ random: true, moves: true }).toFixed(4), (1.35 * 1.5).toFixed(4));
  assert.equal(C.multiplier(all(true)).toFixed(3), '6.113');
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
  assert.deepEqual(gameplay, ['chaos', 'noswitch', 'nopotions', 'random', 'moves', 'cap']);
  assert.equal(C.difficulty(Object.fromEntries(gameplay.map((k) => [k, true]))), 1);
  // Every subset that leaves one gameplay modifier out stays below full, cosmetics or not.
  for (const left of gameplay) {
    const mods = { ...all(true), [left]: false };
    assert.ok(C.difficulty(mods) < 1, left);
  }
  // Adding a handicap always moves the fill up; the log scale agrees with the multiplier's order.
  let prev = 0;
  for (const k of gameplay) { const p = C.difficulty(Object.fromEntries(gameplay.slice(0, gameplay.indexOf(k) + 1).map((x) => [x, true]))); assert.ok(p > prev); prev = p; }
  assert.ok(C.difficulty({ cap: true }) > C.difficulty({ chaos: true }));
  assert.equal(C.difficultyLabel(0), 'Standard');
  assert.equal(C.difficultyLabel(1), 'The Very Best');
  assert.equal(C.difficultyLabel(C.difficulty({ chaos: true })), 'Tough');
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

test('the draft is byte-for-byte unchanged through Random moves and team on and off', () => {
  const draft = draftOf(['garchomp', 'pikachu', 'snorlax']);
  draft.party = C.updateMember(draft.party, draft.party[1].uid, { moves: ['Thunderbolt', 'Protect', 'Fake Out'], item: 'Light Ball' });
  const before = C.serialize(draft);
  for (const mods of [{ moves: true }, { random: true }, { moves: true, random: true }, {}]) {
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
  draft.mods = { ...all(false), moves: true };
  const random = C.battleLoadout(cat, draft, 78, { movepools });
  assert.notDeepEqual(random.sets.map((s) => s.moves), plain.sets.map((s) => s.moves));
  assert.equal(random.sets[1].item, C.stealsItems(random.sets[1].moves) ? '' : 'Light Ball', 'random moves keep a chosen item unless they roll Thief or Covet');
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
    assert.equal(new Set(items).size, items.length, 'distinct held items');
    assert.equal(items.length, bl.sets.filter((s) => !C.stealsItems(s.moves)).length, 'everyone but a thief holds something');
    items.forEach((it) => assert.ok(C.RANDOM_ITEMS.includes(it), it));
  }
});

test('random team items suit the holder: real items, never a type item without that type, no Choice/Vest beside status moves', () => {
  C.RANDOM_ITEMS.forEach((it) => assert.ok(cat.itemByName[it], `${it} is a real held item`));
  const TYPE_ITEMS = { Charcoal: 'Fire', 'Mystic Water': 'Water', Magnet: 'Electric', 'Miracle Seed': 'Grass', 'Never-Melt Ice': 'Ice', 'Black Belt': 'Fighting',
    'Poison Barb': 'Poison', 'Soft Sand': 'Ground', 'Sharp Beak': 'Flying', 'Twisted Spoon': 'Psychic', 'Silver Powder': 'Bug', 'Hard Stone': 'Rock',
    'Spell Tag': 'Ghost', 'Dragon Fang': 'Dragon', 'Black Glasses': 'Dark', 'Metal Coat': 'Steel', 'Silk Scarf': 'Normal', 'Fairy Feather': 'Fairy' };
  const seen = new Set();
  for (const mods of [{ random: true }, { random: true, moves: true }]) {
    for (let seed = 1; seed <= 300; seed += 1) {
      const bl = C.battleLoadout(cat, draftOf([], mods), seed, { movepools });
      bl.sets.forEach((s, n) => {
        const moves = s.moves.map((x) => cat.moveByName[x]).filter(Boolean);
        const attacks = moves.filter((m) => m.category !== 'Status');
        const status = moves.filter((m) => m.category === 'Status' && !['Trick', 'Switcheroo'].includes(m.name));
        const why = `${bl.members[n].id} @ ${s.item}: ${s.moves.join(', ')}`;
        if (s.item) seen.add(s.item);
        if (TYPE_ITEMS[s.item]) assert.ok(attacks.some((m) => m.type === TYPE_ITEMS[s.item]), why);
        if (/^Choice /.test(s.item) || s.item === 'Assault Vest') assert.equal(status.length, 0, why);
        if (s.item === 'Light Clay') assert.ok(s.moves.some((x) => ['Reflect', 'Light Screen', 'Aurora Veil'].includes(x)), why);
        if (s.item === 'Air Balloon') assert.ok(!byId[bl.members[n].id].types.includes('Flying') && s.ability !== 'Levitate', why);
        if (C.stealsItems(s.moves)) assert.equal(s.item, '', why);
        assert.equal(C.itemProblem(cat, bl.members[n].id, s.item, s.moves), '', why);
      });
    }
  }
  assert.ok(seen.size >= 35, `variety: ${seen.size} different items over 600 teams`);
  // Same seed, same team and items.
  const a = C.battleLoadout(cat, draftOf([], { random: true, moves: true }), 42, { movepools });
  assert.deepEqual(C.battleLoadout(cat, draftOf([], { random: true, moves: true }), 42, { movepools }).sets, a.sets);
});

test('item rules: weights follow the moves', () => {
  const w = (id, moves, item, ability = '') => C.itemWeight(item, C.itemProfile(cat, id, moves, ability));
  assert.equal(w('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'], 'Never-Melt Ice'), 0);
  assert.ok(w('garchomp', ['Earthquake', 'Dragon Claw', 'Fire Fang', 'Protect'], 'Soft Sand') > w('garchomp', ['Earthquake', 'Dragon Claw', 'Fire Fang', 'Protect'], 'Charcoal'), 'STAB weighs more');
  assert.equal(w('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'], 'Choice Band'), 0, 'Protect rules out Choice');
  assert.ok(w('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Fire Fang'], 'Choice Band') > 0);
  assert.equal(w('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Fire Fang'], 'Choice Specs'), 0, 'physical attacker');
  assert.equal(w('garchomp', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Protect'], 'Assault Vest'), 0);
  assert.ok(w('alakazam', ['Psychic', 'Shadow Ball', 'Focus Blast', 'Trick'], 'Choice Specs') > w('alakazam', ['Psychic', 'Shadow Ball', 'Focus Blast', 'Energy Ball'], 'Choice Specs'), 'Trick favours a Choice item');
  assert.equal(w('gengar', ['Shadow Ball', 'Sludge Bomb'], 'Air Balloon', 'Levitate'), 0);
  assert.equal(w('garchomp', ['Earthquake'], 'Light Clay'), 0);
  assert.ok(w('alakazam', ['Reflect', 'Light Screen'], 'Light Clay') > 0);
  assert.ok(C.stealsItems(['Thief', 'Protect']) && C.stealsItems(['Covet']) && !C.stealsItems(['Knock Off']));
  // A thief always goes empty-handed; nobody else is left without an item.
  const items = C.randomItems(cat, [{ id: 'weavile', moves: ['Thief', 'Ice Shard'], ability: 'Pressure' }, { id: 'garchomp', moves: ['Earthquake'], ability: 'Rough Skin' }], C.rng(1));
  assert.equal(items[0], '');
  assert.ok(items[1]);
});

test('Random moves: a Pokémon that rolls Thief or Covet battles with no item, the saved item is untouched', () => {
  const draft = draftOf(['garchomp', 'pikachu', 'snorlax', 'gengar', 'weavile', 'lucario'], { moves: true });
  const before = C.serialize(draft);
  let thieves = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    C.battleLoadout(cat, draft, seed, { movepools }).sets.forEach((s, n) => {
      if (C.stealsItems(s.moves)) { thieves += 1; assert.equal(s.item, '', `${s.species}: ${s.moves.join(', ')}`); } else assert.equal(s.item, draft.party[n].item);
    });
  }
  assert.ok(thieves > 0, 'some seed rolls Thief or Covet');
  assert.equal(C.serialize(draft), before);
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
  assert.deepEqual(C.cleanName(''), { name: '', error: 'Enter a trainer name to continue.' }, 'a name is required');
  assert.ok(C.cleanName('   ').error, 'spaces only counts as empty');
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

test('effectiveness: type chart, special moves, user abilities and revealed target abilities/items', () => {
  const eq = (move, target, user, want) => assert.equal(C.effectiveness(move, target, user), want, `${move.name} on ${target.types}`);
  const mv = (name, type, category = 'Physical') => ({ name, type, category });
  eq(mv('Earthquake', 'Ground'), { types: ['Fire', 'Steel'] }, {}, 4);
  eq(mv('Earthquake', 'Ground'), { types: ['Flying'] }, {}, 0);
  eq(mv('Earthquake', 'Ground'), { types: ['Steel'], ability: 'Levitate' }, {}, 0);
  eq(mv('Earthquake', 'Ground'), { types: ['Steel'], ability: 'Levitate' }, { ability: 'Mold Breaker' }, 2);
  eq(mv('Earthquake', 'Ground'), { types: ['Steel'], item: 'Air Balloon' }, {}, 0);
  eq(mv('Thousand Arrows', 'Ground'), { types: ['Flying', 'Steel'] }, {}, 2);
  eq(mv('Flamethrower', 'Fire', 'Special'), { types: ['Water', 'Dragon'] }, {}, 0.25);
  eq(mv('Freeze-Dry', 'Ice', 'Special'), { types: ['Water', 'Ground'] }, {}, 4);
  eq(mv('Flying Press', 'Fighting'), { types: ['Grass'] }, {}, 2);
  eq(mv('Return', 'Normal'), { types: ['Ghost'] }, {}, 0);
  eq(mv('Return', 'Normal'), { types: ['Ghost'] }, { ability: 'Scrappy' }, 1);
  eq(mv('Hyper Voice', 'Normal', 'Special'), { types: ['Dragon'] }, { ability: 'Pixilate' }, 2);
  eq(mv('Weather Ball', 'Normal', 'Special'), { types: ['Grass'] }, { weather: 'sunnyday' }, 2);
  eq(mv('Shadow Ball', 'Ghost', 'Special'), { types: ['Normal'], ability: 'Wonder Guard' }, {}, 0);
  eq(mv('Fire Fang', 'Fire'), { types: ['Bug'], ability: 'Wonder Guard' }, {}, 2);
  eq(mv('Shadow Ball', 'Ghost', 'Special'), { types: ['Bug'], ability: 'Wonder Guard' }, {}, 0);
  eq(mv('Protect', 'Normal', 'Status'), { types: ['Ghost'] }, {}, null);
  assert.deepEqual(C.speedRange(100, 50), [108, 167]);
});

test('playback steps: spread hits land together, multi-hits one by one, Focus Sash after the hit it survives', () => {
  const st = C.steps(['|move|p1a: A|Rock Slide|p2a: X|[spread] p2a,p2b', '|-damage|p2a: X|50/100', '|-damage|p2b: Y|60/100']);
  assert.deepEqual(st.map((s) => [s.hit, s.lines.length]), [[false, 1], [true, 2]]);
  const multi = C.steps(['|move|p1a: A|Scale Shot|p2a: X', '|-enditem|p2a: X|Focus Sash', '|-damage|p2a: X|1/100', '|-damage|p2a: X|0 fnt', '|faint|p2a: X']);
  assert.deepEqual(multi.map((s) => s.lines[0].split('|')[1] + (s.hit ? ':hit' : '')), ['move', '-damage:hit', '-enditem', '-damage:hit', 'faint']);
  assert.equal(multi[1].lines[0], '|-damage|p2a: X|1/100');
});

test('random team: total Lv 50 stats within 2% of Ren\'s team, no member under 300 BST, seeded', () => {
  const target = C.championStrength(cat);
  assert.ok(target > 4000, String(target));
  const bstOf = (id) => C.STATS.reduce((s, k) => s + cat.species[id].base[k], 0);
  const offs = [];
  for (let seed = 1; seed <= 150; seed += 1) {
    const ids = C.rollTeam(cat, C.rng(seed));
    assert.equal(C.randomTeamProblem(cat, ids), '', `seed ${seed}`);
    assert.ok(ids.every((id) => bstOf(id) >= C.RANDOM_MIN_BST), `seed ${seed}: ${ids}`);
    const off = C.teamStrength(cat, ids) / target - 1;
    assert.ok(Math.abs(off) <= C.RANDOM_STRENGTH, `seed ${seed}: ${(off * 100).toFixed(1)}%`);
    offs.push(off);
    assert.deepEqual(C.rollTeam(cat, C.rng(seed)), ids);
  }
  // Still varied: different teams, and individual strengths spread out.
  const spread = C.rollTeam(cat, C.rng(7)).map(bstOf);
  assert.ok(Math.max(...spread) - Math.min(...spread) >= 60, String(spread));
});

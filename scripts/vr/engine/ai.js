// The champion's battle AI. Inputs are only what the AI's side could know: its own request (its
// team, moves, PP and legal options) and a public view (createView) built from its own channel of the
// log. It never receives the Battle object, the opponent's request, or the RNG — so it can't see the
// player's current-turn choice, unrevealed sets or future rolls. Choices are deterministic for a given
// seed (`rand` is the AI's own seeded generator, separate from the battle's).
//
// Behaviour is a heuristic, not a claim about how any real player plays. Each legal action gets a
// value: estimated damage per target (Showdown's type chart, base stats, public boosts), knock-out
// bonuses, Fake Out on the first turn, Protect when threatened, speed control, set-up when safe,
// Helping Hand with an attacking partner, recoil and friendly-fire penalties. The two active slots
// are then chosen together: every pair of the best few actions is scored as one turn, so damage
// that overkills is not double-counted, two attacks that only knock out together get the bonus,
// and a foe likely to Protect is worth less to target. Voluntary switches are considered when a
// Pokémon is threatened with nothing useful to do. The search is bounded (a few dozen pairs).
const TYPES_IMMUNE_ABILITY = { Ground: ['Levitate', 'Earth Eater'], Water: ['Water Absorb', 'Storm Drain', 'Dry Skin'], Electric: ['Volt Absorb', 'Lightning Rod', 'Motor Drive'], Fire: ['Flash Fire', 'Well-Baked Body'], Grass: ['Sap Sipper'] };
const PRIORITY_BLOCKERS = ['Armor Tail', 'Queenly Majesty', 'Dazzling'];
const NO_TARGET = ['self', 'allAdjacentFoes', 'allAdjacent', 'allySide', 'foeSide', 'all', 'randomNormal', 'allies'];

// difficulty: how close to the best-scored turn a choice must be ('easy' 25 points, 'normal' 8,
// 'hard' 3). Lower margins play the best line more often; none of them read hidden information.
const MARGIN = { easy: 25, normal: 8, hard: 3 };
// When two of its Pokémon could Mega Evolve, the one it prefers (Mega Floette's Fairy Aura first).
const MEGA_PREFERENCE = ['Floette-Eternal', 'Dragonite'];
const TOP = 6;

export function createAI(Dex, rand, level = 50, difficulty = 'normal') {
  const margin = MARGIN[difficulty] ?? MARGIN.normal;
  const dex = Dex;
  const species = (name) => dex.species.get(name);
  const effectiveness = (moveType, defTypes) => {
    let mult = 1;
    for (const t of defTypes) {
      if (!dex.getImmunity(moveType, t)) return 0;
      mult *= 2 ** dex.getEffectiveness(moveType, t);
    }
    return mult;
  };
  const statAt = (base, sp, isHp, lv) => (isHp ? Math.floor((2 * base + 31 + Math.max(2 * sp - 1, 0)) * lv / 100) + lv + 10 : Math.floor((2 * base + 31 + Math.max(2 * sp - 1, 0)) * lv / 100) + 5);
  const boostMult = (stage = 0) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
  // An ability the foe certainly has: revealed, or its species' only ability.
  const knownAbility = (mon) => {
    if (mon.ability) return mon.ability;
    const list = Object.values(species(mon.species).abilities || {});
    return list.length === 1 ? list[0] : '';
  };

  // Expected damage as a % of the target's max HP. Foe stats are estimated from base stats with an
  // even 11 stat points per stat (unknown spreads), foe level from the battle (shown at preview).
  function damagePct(move, user, target, spreadTargets, view) {
    if (move.category === 'Status' || !target || target.fainted) return 0;
    const tSpecies = species(target.species);
    const ability = knownAbility(target);
    const immune = TYPES_IMMUNE_ABILITY[move.type];
    if (immune && ability && immune.includes(ability)) return 0;
    const eff = effectiveness(move.type, tSpecies.types);
    if (!eff) return 0;
    let bp = move.basePower;
    if (move.id === 'lowkick' || move.id === 'grassknot') {
      const w = tSpecies.weightkg;
      bp = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
    }
    if (move.id === 'lastrespects') bp = 50 + 50 * Math.min(100, view.faintedOwn);
    if (!bp) return 0;
    if (move.multihit) bp *= Array.isArray(move.multihit) ? (move.multihit[0] + move.multihit[1]) / 2 : move.multihit;
    const physical = move.category === 'Physical';
    const atk = (physical ? user.stats.atk : user.stats.spa) * boostMult((user.boosts || {})[physical ? 'atk' : 'spa']);
    const def = statAt(tSpecies.baseStats[physical ? 'def' : 'spd'], 11, false, target.level || 50) * boostMult((target.boosts || {})[physical ? 'def' : 'spd']);
    const hp = statAt(tSpecies.baseStats.hp, 11, true, target.level || 50);
    const lv = user.level || level;
    let dmg = (Math.floor(Math.floor((2 * lv) / 5 + 2) * bp * atk / def) / 50 + 2);
    const userTypes = species(user.species).types;
    if (userTypes.includes(move.type)) dmg *= user.ability === 'Adaptability' ? 2 : 1.5;
    dmg *= eff;
    if (spreadTargets > 1) dmg *= 0.75;
    if (user.item === 'Life Orb') dmg *= 1.3;
    if (user.item === 'Choice Specs' && !physical) dmg *= 1.5;
    if (user.item === 'Choice Band' && physical) dmg *= 1.5;
    if (user.helped) dmg *= 1.5;
    if (ability === 'Multiscale' && target.hp >= 99.9) dmg *= 0.5;
    const acc = move.accuracy === true ? 1 : move.accuracy / 100;
    return (dmg * 0.925 / hp) * 100 * acc;
  }

  // Own Pokémon from the request, plus public facts (boosts) from the view.
  function ownMon(req, i, view) {
    const p = req.side.pokemon.filter((m) => m.active)[i] || req.side.pokemon[i];
    const name = p.ident.replace(/^p\d[ab]?: /, '');
    const pub = Object.values(view.mons).find((m) => m.side === view.side && m.key.endsWith(`: ${name}`)) || {};
    const [cur, max] = (p.condition || '0/1').split(' ')[0].split('/').map(Number);
    return {
      species: p.details.split(',')[0], stats: p.stats, item: p.item ? dex.items.get(p.item).name : '', ability: dex.abilities.get(p.ability || p.baseAbility).name,
      level: Number((/, L(\d+)/.exec(p.details) || [])[1] || level), hp: max ? (cur / max) * 100 : 0, boosts: pub.boosts || {}, turnsActive: pub.turnsActive || 0, key: pub.key
    };
  }

  function foeTargets(view) {
    return view.activeMons(view.foe).map((m, i) => (m && !m.fainted ? { ...m, loc: i + 1, level } : null));
  }

  // The most damage (% of `user`'s HP) one foe on the field could deal it this turn, from the foe's
  // revealed moves, or an 80-power attack of each of its types when none are revealed yet.
  function threatTo(user, view) {
    let worst = 0;
    for (const f of foeTargets(view).filter(Boolean)) {
      const fs = species(f.species);
      const physical = fs.baseStats.atk >= fs.baseStats.spa;
      const foeAsUser = { species: f.species, stats: { atk: statAt(fs.baseStats.atk, 11, false, level), spa: statAt(fs.baseStats.spa, 11, false, level) }, boosts: f.boosts, item: f.item, ability: f.ability, level };
      const meAsTarget = { species: user.species, hp: user.hp, boosts: user.boosts, ability: user.ability, level };
      const moves = f.moves.length ? f.moves.map((m) => dex.moves.get(m)) : fs.types.map((t) => ({ type: t, basePower: 80, category: physical ? 'Physical' : 'Special', accuracy: 100, id: '' }));
      for (const m of moves) worst = Math.max(worst, damagePct(m, foeAsUser, meAsTarget, 1, view));
    }
    return worst;
  }

  // How likely a foe is to Protect this turn, as a damage factor. Only public facts: whether it has
  // shown Protect, whether it just used it (a second Protect in a row usually fails), its HP.
  function protectFactor(f, view) {
    const shown = f.moves.some((m) => /^(Protect|Detect|Spiky Shield|King's Shield|Baneful Bunker|Silk Trap|Burning Bulwark)$/.test(m));
    const last = view.lastMove[f.key] || '';
    if (/Protect|Detect|Shield|Bunker|Silk Trap|Bulwark/.test(last)) return 1;
    if (shown) return f.hp < 50 ? 0.55 : 0.8;
    return f.hp < 35 && f.turnsActive > 0 ? 0.85 : 1;
  }

  // One action's value. hits: { foeLoc: expected % damage }, base: everything else.
  function options(move, i, user, foes, ally, view, sideState) {
    const out = [];
    const target = move.target;
    const live = foes.filter(Boolean);
    const lastMove = user.key ? view.lastMove[user.key] : '';
    const threatened = threatTo(user, view) >= user.hp;
    const id = move.id;
    if (id === 'protect' || id === 'detect') {
      let s = 8;
      if (user.hp < 40) s += 22;
      if (threatened) s += 18; // likely knocked out this turn otherwise
      if (lastMove === move.name) s = -50; // consecutive Protect usually fails
      if (user.turnsActive === 0 && view.turn <= 1) s -= 10;
      return [{ base: s, hits: {}, target: null }];
    }
    if (id === 'fakeout') {
      if (user.turnsActive > 0) return [{ base: -100, hits: {}, target: null }];
      for (const f of live) {
        if (species(f.species).types.includes('Ghost')) continue;
        const ab = knownAbility(f);
        if (ab === 'Inner Focus' || PRIORITY_BLOCKERS.includes(ab) || live.some((x) => PRIORITY_BLOCKERS.includes(knownAbility(x)))) continue;
        if (view.field.terrain === 'Psychic Terrain') continue;
        out.push({ base: 45 + (f.hp < 30 ? 10 : 0), hits: { [f.loc]: damagePct(move, user, f, 1, view) }, target: f.loc });
      }
      return out.length ? out : [{ base: -100, hits: {}, target: null }];
    }
    if (id === 'feint') {
      for (const f of live) out.push({ base: 6, hits: { [f.loc]: damagePct(move, user, f, 1, view) }, target: f.loc });
      return out;
    }
    if (id === 'tailwind') {
      const on = sideState.tailwind;
      return [{ base: on ? -60 : (view.turn <= 2 ? 34 : 22) - (threatened ? 12 : 0), hits: {}, target: null }];
    }
    if (id === 'helpinghand') {
      // Valued in the pair search from the partner's damage; alone it is worth little.
      return ally ? [{ base: 2, hits: {}, target: -(i === 0 ? 2 : 1), helping: true }] : [{ base: -40, hits: {}, target: null }];
    }
    if (id === 'swordsdance' || id === 'calmmind') {
      const stat = id === 'swordsdance' ? 'atk' : 'spa';
      const stage = (user.boosts || {})[stat] || 0;
      const safe = !threatened && user.hp > 60;
      return [{ base: stage >= 2 ? -30 : safe ? 26 - stage * 8 : -10, hits: {}, target: null }];
    }
    if (move.category === 'Status') return [{ base: 1, hits: {}, target: target === 'normal' || target === 'any' || target === 'adjacentFoe' ? (live[0] || {}).loc : null }];

    const spread = target === 'allAdjacentFoes' || target === 'allAdjacent';
    const recoilCost = (d, left) => {
      if (!move.recoil) return 0;
      const self = Math.min(d, left) * (move.recoil[0] / move.recoil[1]);
      if (self >= user.hp) return d >= left ? 15 : 60;
      return self * (user.hp < 40 ? 1.2 : 0.4);
    };
    const selfDrop = move.self && move.self.boosts ? 4 : 0;
    if (spread) {
      const n = live.length + (target === 'allAdjacent' && ally ? 1 : 0);
      const hits = {};
      let base = -selfDrop;
      for (const f of live) hits[f.loc] = damagePct(move, user, f, n, view) * protectFactor(f, view);
      if (target === 'allAdjacent' && ally && ally.hp > 0) {
        const d = damagePct(move, user, { ...ally, level }, n, view);
        base -= d * 1.4 + (d >= ally.hp ? 60 : 0);
      }
      return [{ base, hits, target: null, spread: true }];
    }
    for (const f of live) {
      let d = damagePct(move, user, f, 1, view);
      // Sucker Punch fails unless the target attacks: trust it less against a Pokémon whose last
      // move was a status move.
      if (id === 'suckerpunch') {
        const last = view.lastMove[f.key] ? dex.moves.get(view.lastMove[f.key]) : null;
        d *= last && last.category === 'Status' ? 0.35 : 0.8;
      }
      d *= protectFactor(f, view);
      const base = (move.priority > 0 && d >= f.hp ? 15 : 0) - recoilCost(d, f.hp) - selfDrop;
      out.push({ base, hits: { [f.loc]: d }, target: f.loc });
    }
    return out;
  }

  // The value of one turn: base values plus damage on each foe, capped at what it has left, with a
  // knock-out bonus (and none for overkill).
  function turnValue(picks, foes) {
    const total = {};
    let s = 0;
    let helped = null;
    for (const p of picks) {
      if (!p) continue;
      s += p.base;
      if (p.helping) helped = p;
    }
    picks.forEach((p) => {
      if (!p) return;
      const boost = helped && p !== helped ? 1.5 : 1;
      Object.entries(p.hits).forEach(([loc, d]) => { total[loc] = (total[loc] || 0) + d * boost; });
    });
    if (helped && !picks.some((p) => p && p !== helped && Object.keys(p.hits).length)) s -= 20;
    for (const f of foes.filter(Boolean)) {
      const d = total[f.loc] || 0;
      s += Math.min(d, f.hp) + (d >= f.hp && f.hp > 0 ? 35 : 0);
    }
    return s;
  }

  // Bench candidates for a voluntary switch or a replacement: damage it threatens on the field.
  function matchup(p, view) {
    const sp = p.details.split(',')[0];
    const mon = { species: sp, stats: p.stats, item: p.item ? dex.items.get(p.item).name : '', ability: dex.abilities.get(p.baseAbility).name, level, boosts: {} };
    let s = 0;
    for (const f of foeTargets(view).filter(Boolean)) s += Math.max(0, ...p.moves.map((id) => damagePct(dex.moves.get(id), mon, f, 1, view)));
    const [cur, max] = p.condition.split(' ')[0].split('/').map(Number);
    return s * (max ? 0.5 + cur / max / 2 : 0);
  }

  function chooseMoves(req, view) {
    const foes = foeTargets(view);
    const actives = req.active || [];
    const own = actives.map((_, i) => ownMon(req, i, view));
    const sideState = { tailwind: !!(view.sideConditions[view.side] || {}).tailwind };
    const megaSlot = (() => {
      const can = actives.map((a, i) => (a.canMegaEvo ? i : -1)).filter((i) => i >= 0);
      if (!can.length) return -1;
      const rank = (i) => { const sp = own[i] ? own[i].species : ''; const n = MEGA_PREFERENCE.indexOf(sp); return n < 0 ? 99 : n; };
      return can.sort((a, b) => rank(a) - rank(b))[0];
    })();
    const bench = req.side.pokemon.map((p, n) => ({ p, n: n + 1 })).filter(({ p }) => !p.active && !p.condition.endsWith(' fnt'));
    // Candidate actions per slot (best TOP by their own value), or a pass.
    const slots = actives.map((act, i) => {
      const sideMon = req.side.pokemon.filter((m) => m.active)[i];
      if (!sideMon || sideMon.condition.endsWith(' fnt') || act.commanding) return [{ pass: true, base: 0, hits: {} }];
      const user = own[i];
      const ally = own[1 - i] && own[1 - i].hp > 0 ? own[1 - i] : null;
      const list = [];
      act.moves.forEach((m, n) => {
        if (m.disabled || m.pp === 0) return;
        const move = { ...dex.moves.get(m.id), target: m.target || dex.moves.get(m.id).target };
        for (const o of options(move, i, user, foes, ally, view, sideState)) list.push({ ...o, n: n + 1, move });
      });
      // A voluntary switch: only when threatened with nothing useful to do.
      if (!act.trapped && bench.length) {
        const own0 = turnValue([list.slice().sort((a, b) => turnValue([b], foes) - turnValue([a], foes))[0]], foes);
        if (threatTo(user, view) >= user.hp && own0 < 15) {
          const best = bench.map((b) => ({ ...b, s: matchup(b.p, view) })).sort((a, b) => b.s - a.s)[0];
          if (best && best.s > 30) list.push({ switchTo: best.n, base: best.s * 0.4, hits: {} });
        }
      }
      if (!list.length) return [{ n: 1, base: 0, hits: {}, move: null, fallback: true }];
      return list.map((o) => ({ ...o, solo: turnValue([o], foes) })).sort((a, b) => b.solo - a.solo).slice(0, TOP);
    });
    const pairs = [];
    const [first, second = [null]] = slots;
    for (const a of first) {
      for (const b of second) {
        if (a && b && a.switchTo && b.switchTo && a.switchTo === b.switchTo) continue;
        pairs.push({ picks: [a, b], s: turnValue([a, b], foes) });
      }
    }
    pairs.sort((x, y) => y.s - x.s);
    const top = pairs.filter((p) => p.s >= pairs[0].s - margin);
    const chosen = top[Math.floor(rand() * top.length)].picks;
    let megaUsed = false;
    return chosen.slice(0, actives.length).map((o, i) => {
      if (!o || o.pass) return 'pass';
      if (o.switchTo) return `switch ${o.switchTo}`;
      if (o.fallback) return 'move 1';
      let choice = `move ${o.n}`;
      if (o.target && !NO_TARGET.includes(o.move.target)) choice += ` ${o.target}`;
      if (actives[i].canMegaEvo && !megaUsed && i === megaSlot) { choice += ' mega'; megaUsed = true; }
      return choice;
    }).join(', ');
  }

  // Replacement: the bench Pokémon with the best damage against the foes on the field.
  function chooseSwitches(req, view) {
    const taken = new Set();
    return req.forceSwitch.map((must) => {
      if (!must) return 'pass';
      const bench = req.side.pokemon.map((p, n) => ({ p, n: n + 1 })).filter(({ p, n }) => !p.active && !p.condition.endsWith(' fnt') && !taken.has(n));
      if (!bench.length) return 'pass';
      bench.sort((a, b) => matchup(b.p, view) - matchup(a.p, view));
      taken.add(bench[0].n);
      return `switch ${bench[0].n}`;
    }).join(', ');
  }

  // Team preview: bring four. Floette (the Mega) and Sneasler (Fake Out) lead; the back two are the
  // best of the rest against the Pokémon the player showed.
  function teamPreview(req, view) {
    const mons = req.side.pokemon.map((p, n) => ({ p, n: n + 1, sp: p.details.split(',')[0] }));
    const foeSpecies = view.preview[view.foe].map((s) => species(s));
    const threat = (m) => {
      const user = { species: m.sp, stats: m.p.stats, item: m.p.item ? dex.items.get(m.p.item).name : '', ability: dex.abilities.get(m.p.baseAbility).name, level, boosts: {} };
      return foeSpecies.reduce((sum, f) => sum + Math.min(100, Math.max(0, ...m.p.moves.map((id) => damagePct(dex.moves.get(id), user, { species: f.name, hp: 100, level, moves: [] }, 1, view)))), 0);
    };
    const leads = ['Sneasler', 'Floette-Eternal'].map((name) => mons.find((m) => m.sp === name)).filter(Boolean);
    const rest = mons.filter((m) => !leads.includes(m)).map((m) => ({ m, s: threat(m) + rand() * 5 }));
    rest.sort((a, b) => b.s - a.s);
    const order = [...leads, ...rest.map((r) => r.m)].slice(0, 4);
    return `team ${order.map((m) => m.n).join('')}`;
  }

  function decide(req, view) {
    if (req.wait) return null;
    if (req.teamPreview) return teamPreview(req, view);
    if (req.forceSwitch) return chooseSwitches(req, view);
    return chooseMoves(req, view);
  }
  return { decide, damagePct };
}

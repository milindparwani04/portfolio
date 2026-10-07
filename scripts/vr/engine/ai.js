// The champion's battle AI. Inputs are only what the AI's side could know: its own request (its
// team, moves, PP and legal options) and a public view (createView) built from its own channel of the
// log. It never receives the Battle object, the opponent's request, or the RNG — so it can't see the
// player's current-turn choice, unrevealed sets or future rolls. Choices are deterministic for a given
// seed (`rand` is the AI's own seeded generator, separate from the battle's).
//
// Behaviour is a heuristic, not a claim about how Takuma Yamazaki plays: score every legal action by
// estimated damage (Showdown's type chart, base stats and public boosts), add bonuses for knock-outs,
// Fake Out on the first turn, sensible Protect use, and penalties for hitting its own partner.
const TYPES_IMMUNE_ABILITY = { Ground: ['Levitate', 'Earth Eater'], Water: ['Water Absorb', 'Storm Drain', 'Dry Skin'], Electric: ['Volt Absorb', 'Lightning Rod', 'Motor Drive'], Fire: ['Flash Fire', 'Well-Baked Body'], Grass: ['Sap Sipper'] };

export function createAI(Dex, rand, level = 50) {
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

  // Expected damage as a % of the target's max HP. Foe stats are estimated from base stats with an
  // even 11 stat points per stat (unknown spreads), foe level from the battle (shown at preview).
  function damagePct(move, user, target, spreadTargets, view) {
    if (move.category === 'Status' || !target || target.fainted) return 0;
    const tSpecies = species(target.species);
    const ability = target.ability || '';
    const immune = TYPES_IMMUNE_ABILITY[move.type];
    if (immune && immune.some((a) => tSpecies.abilities && Object.values(tSpecies.abilities).length === 1 && Object.values(tSpecies.abilities)[0] === a)) return 0;
    if (ability && immune && immune.includes(ability)) return 0;
    const eff = effectiveness(move.type, tSpecies.types);
    if (!eff) return 0;
    let bp = move.basePower;
    if (move.id === 'lowkick' || move.id === 'grassknot') {
      const w = tSpecies.weightkg;
      bp = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
    }
    if (move.id === 'lastrespects') bp = 50 + 50 * Math.min(100, view.faintedOwn);
    if (!bp) return 0;
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
    if (target.ability === 'Multiscale' && target.hp >= 99.9) dmg *= 0.5;
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

  function scoreAction(move, slot, user, foes, ally, view, plannedDamage) {
    const options = [];
    const target = move.target;
    const live = foes.filter(Boolean);
    const lastMove = user.key ? view.lastMove[user.key] : '';
    if (move.id === 'protect' || move.id === 'detect') {
      let s = 8;
      if (user.hp < 40) s += 22;
      if (lastMove === move.name) s = -50; // consecutive Protect usually fails
      if (user.turnsActive === 0 && view.turn <= 1) s -= 10;
      options.push({ s, target: null });
      return options;
    }
    if (move.id === 'fakeout') {
      if (user.turnsActive > 0) return [{ s: -100, target: null }];
      for (const f of live) {
        const sp = species(f.species);
        if (sp.types.includes('Ghost')) continue;
        options.push({ s: 55 + damagePct(move, user, f, 1, view) + (f.hp < 30 ? 10 : 0), target: f.loc });
      }
      return options;
    }
    if (move.id === 'feint') {
      for (const f of live) options.push({ s: 6 + damagePct(move, user, f, 1, view), target: f.loc });
      return options;
    }
    if (move.category === 'Status') return [{ s: 1, target: target === 'normal' || target === 'any' || target === 'adjacentFoe' ? (live[0] || {}).loc : null }];

    const spread = target === 'allAdjacentFoes' || target === 'allAdjacent';
    if (spread) {
      const hit = live.length + (target === 'allAdjacent' && ally ? 1 : 0);
      let s = 0;
      for (const f of live) {
        const d = damagePct(move, user, f, hit, view);
        const left = Math.max(0, f.hp - (plannedDamage[f.loc] || 0));
        s += Math.min(d, left) + (d >= left && left > 0 ? 35 : 0);
      }
      if (target === 'allAdjacent' && ally && !ally.fainted) {
        const d = damagePct(move, user, { ...ally, level }, hit, view);
        s -= d * 1.4 + (d >= ally.hp ? 60 : 0);
      }
      options.push({ s, target: null, spread: true });
      return options;
    }
    for (const f of live) {
      let d = damagePct(move, user, f, 1, view);
      if (move.id === 'suckerpunch') d *= 0.7; // fails if the target doesn't attack
      const left = Math.max(0, f.hp - (plannedDamage[f.loc] || 0));
      let s = Math.min(d, left) + (d >= left && left > 0 ? 35 : 0);
      if (move.priority > 0 && d >= left && left > 0) s += 15;
      // Recoil (Light of Ruin, Wave Crash...): costs a share of the damage dealt; never worth
      // knocking itself out unless it knocks the target out too.
      if (move.recoil) {
        const self = Math.min(d, left) * (move.recoil[0] / move.recoil[1]);
        if (self >= user.hp) s -= d >= left ? 15 : 60;
        else s -= self * (user.hp < 40 ? 1.2 : 0.4);
      }
      options.push({ s, target: f.loc, dmg: d });
    }
    return options;
  }

  function chooseMoves(req, view) {
    const foes = foeTargets(view);
    const actives = req.active || [];
    const planned = {};
    let megaUsed = false;
    const parts = [];
    const own = actives.map((_, i) => ownMon(req, i, view));
    actives.forEach((act, i) => {
      const sideMon = req.side.pokemon.filter((m) => m.active)[i];
      if (!sideMon || sideMon.condition.endsWith(' fnt') || act.commanding) { parts.push('pass'); return; }
      const user = own[i];
      const ally = own[1 - i] && own[1 - i].hp > 0 ? own[1 - i] : null;
      let best = null;
      const scored = [];
      act.moves.forEach((m, n) => {
        if (m.disabled || m.pp === 0) return;
        const move = { ...dex.moves.get(m.id), target: m.target || dex.moves.get(m.id).target };
        for (const o of scoreAction(move, i, user, foes, ally, view, planned)) scored.push({ ...o, n: n + 1, move });
      });
      if (!scored.length) { parts.push('move 1'); return; }
      scored.sort((a, b) => b.s - a.s);
      // Seeded variety: pick among actions within 8 points of the best.
      const top = scored.filter((o) => o.s >= scored[0].s - 8);
      best = top[Math.floor(rand() * top.length)];
      if (best.target && best.dmg) planned[best.target] = (planned[best.target] || 0) + best.dmg;
      let choice = `move ${best.n}`;
      if (best.target && !['self', 'allAdjacentFoes', 'allAdjacent', 'allySide', 'foeSide', 'all', 'randomNormal', 'allies'].includes(best.move.target)) choice += ` ${best.target}`;
      if (act.canMegaEvo && !megaUsed) { choice += ' mega'; megaUsed = true; }
      parts.push(choice);
    });
    return parts.join(', ');
  }

  // Replacement: the bench Pokémon with the best damage against the foes on the field.
  function matchup(p, view) {
    const sp = p.details.split(',')[0];
    const mon = { species: sp, stats: p.stats, item: p.item ? dex.items.get(p.item).name : '', ability: dex.abilities.get(p.baseAbility).name, level, boosts: {} };
    let s = 0;
    for (const f of foeTargets(view).filter(Boolean)) s += Math.max(0, ...p.moves.map((id) => damagePct(dex.moves.get(id), mon, f, 1, view)));
    const [cur, max] = p.condition.split(' ')[0].split('/').map(Number);
    return s * (max ? 0.5 + cur / max / 2 : 0);
  }
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
  // best of the rest against the six the player showed.
  function teamPreview(req, view) {
    const mons = req.side.pokemon.map((p, n) => ({ p, n: n + 1, sp: p.details.split(',')[0] }));
    const foeSpecies = view.preview[view.foe].map((s) => species(s));
    const threat = (m) => {
      const user = { species: m.sp, stats: m.p.stats, item: m.p.item ? dex.items.get(m.p.item).name : '', ability: dex.abilities.get(m.p.baseAbility).name, level, boosts: {} };
      return foeSpecies.reduce((sum, f) => sum + Math.min(100, Math.max(0, ...m.p.moves.map((id) => damagePct(dex.moves.get(id), user, { species: f.name, hp: 100, level }, 1, view)))), 0);
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

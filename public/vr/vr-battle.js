// The Very Best: the battle screen, registered as the shell's `battle` state (vr-game.js). The
// battle runs in a Web Worker (/vr/vr-engine.js: Pokémon Showdown's simulator + the champion AI);
// this file draws what the engine reports for the player's side and sends the player's choices
// back. Everything — intro, commands, targeting, bag, party, dialogue, the championship cinematic
// and the result — renders inside the battle frame.
//
// Playback: the engine's log is played one action at a time (VRCore.beats): who acts and with what,
// then the impact or immunity on the right target, the HP bar moving, the effect messages, any
// faint, a short gap, then the next action. Visible HP and status only ever change when their own
// log line plays, and a new request, the championship cinematic or the result waits until
// everything before it has played. Reduced motion removes movement and flashing, not reading time.
//
// Nothing here persists: closing the window, Quit or a reload ends the battle for good.
(function () {
  'use strict';

  const T = window.TVB;
  const { G, C, A, ART, h, go, announce, typeRow, TYPE_COLOURS } = T;
  const ENGINE_URL = '/vr/vr-engine.js?v=5';
  const CHAMP = { name: 'Ren Kestrel', short: 'Ren', label: 'Ren Kestrel · Reigning Champion' };
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Pacing (ms). Starting values for playtesting, from the 2026-10-10 refinement brief.
  const PACE = { gap: 320, impact: 560, enter: 450, residual: 420 };

  // ---------- Trainer Taunts (modifier): original lines, confident and respectful ----------
  const TAUNTS = {
    generic: ['Clean play. Let’s see if you can keep it up.', 'Interesting line. I’ll remember that one.', 'Good tempo. Don’t let it slip.', 'You’re reading the field. So am I.', 'Solid. But solid doesn’t win titles.'],
    super: ['Sharp. You found the gap.', 'That one landed. Respect.', 'Good read — I’ll adjust.', 'Okay, that’s a real hit.'],
    resisted: ['Resisted. Check the matchup and try again.', 'Not quite the angle you wanted.', 'My Pokémon can take that one.'],
    miss: ['A miss. It happens to everyone.', 'Unlucky. Reset and go again.', 'Accuracy checks are part of the game.'],
    protect: ['Shield’s up. Timing is everything.', 'I saw that coming.', 'Patience. Protect wins rounds too.'],
    faint: ['Well played. That’s one down.', 'Great hit. Now it gets serious.', 'You earned that knockout.', 'Noted. I’ll answer that.'],
    lowhp: ['Still standing. That counts for a lot.', 'Close, but not closed out.', 'One more turn can change everything.'],
    switch: ['A switch. Good instinct.', 'Repositioning — smart.'],
    potion: ['Resources matter. Good call.', 'Healing up? Fair. Let’s keep going.']
  };
  const RANK = ['faint', 'super', 'protect', 'miss', 'resisted', 'lowhp', 'potion', 'switch', 'generic'];

  let poolsPromise = null;
  const loadPools = () => {
    if (!poolsPromise) poolsPromise = fetch('/vr/movepools.json?v=2').then((r) => { if (!r.ok) throw new Error('movepools'); return r.json(); }).catch((e) => { poolsPromise = null; throw e; });
    return poolsPromise;
  };

  let active = null; // the running battle's dispose()
  window.VictoryRoad.disposeBattle = () => { if (active) active(); };

  G.screens.battle = (screen, arg) => {
    if (active) active();
    const seed = (arg && arg.seed) >>> 0 || C.newSeed();
    const battleId = `b${seed.toString(36)}${Date.now().toString(36)}`.slice(0, 40);
    const mods = { ...G.draft.mods };
    const mult = C.multiplier(mods);
    const rules = C.engineRules(mods);
    const reduced = T.reduced();
    // Every wait resolves when the battle is disposed (close, quit, rematch), so no playback promise
    // is left hanging and no stale callback runs afterwards.
    const waits = new Set();
    const sleep = (ms) => new Promise((resolve) => {
      if (disposed) { resolve(); return; }
      const w = { resolve, t: 0 };
      w.t = window.setTimeout(() => { waits.delete(w); resolve(); }, ms);
      waits.add(w);
    });
    let worker = null;
    let ended = false;
    let disposed = false;
    let cinematic = null;
    const timers = new Set();
    const stats = { turns: 0, yourKOs: 0, renKOs: 0, renMoves: {}, escalated: false };

    G.battleActive = () => !ended && !disposed;

    // ----- layout: bar, then the frame (arena + dock with text box and commands) -----
    const liveEl = h('p', { class: 'tvb-sr', 'aria-live': 'polite' });
    const tauntLive = h('p', { class: 'tvb-sr', 'aria-live': 'polite' });
    const turnEl = h('span', { class: 'tvb-turn' });
    const bar = h('div', { class: 'tvb-battle-bar' },
      h('span', { class: 'tvb-battle-mult', text: `×${mult.toFixed(2)} · ${C.tier(mult)}` }), turnEl,
      h('span', { class: 'tvb-head-tools' },
        h('button', { type: 'button', class: 'tvb-btn tvb-btn--icon', 'aria-label': 'Settings', onclick: () => { A.play('select'); T.openSettings(); } }, h('span', { 'aria-hidden': 'true', text: '⚙' })),
        h('button', { type: 'button', class: 'tvb-btn', onclick: () => quit() }, 'Quit')));
    const stage = h('div', { class: 'tvb-stage' });
    const textEl = h('p', { class: 'tvb-text' });
    const subEl = h('p', { class: 'tvb-text-sub', id: 'tvbSub' });
    const textbox = h('div', { class: 'tvb-textbox' }, textEl, subEl, h('span', { class: 'tvb-next', 'aria-hidden': 'true', text: '▼' }));
    const menu = h('div', { class: 'tvb-cmds' });
    const dock = h('div', { class: 'tvb-dock' }, textbox, menu);
    const frame = h('div', { class: 'tvb-frame' }, stage, dock);
    screen.append(h('div', { class: 'tvb-battle', role: 'region', 'aria-label': 'Battle' }, bar, frame, liveEl, tauntLive));
    // One encounter phase drives the backdrop, platforms, crowd and lighting: 'court' until the
    // championship escalation turns the arena into the stadium for the rest of this battle.
    const arena = h('div', { class: 'tvb-arena', 'aria-hidden': 'true' });
    stage.append(arena);
    let phase = '';
    function setPhase(next) {
      if (phase === next) return;
      phase = next;
      frame.dataset.phase = next;
      arena.innerHTML = ART.arena(next, seed);
    }
    setPhase('court');

    // ----- message box -----
    let skip = null;
    const advance = () => { if (skip) skip(); };
    frame.addEventListener('click', (e) => { if (!e.target.closest('button, input, select')) advance(); });
    const onKey = (e) => {
      if (disposed || G.modal) return;
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, input, select')) { e.preventDefault(); advance(); }
    };
    document.addEventListener('keydown', onKey);
    // How long a line stays up, typing included: about 900-1200 ms for "X used Y!", 800-1200 ms for
    // an effect message, more for long ones; 'quick' for send-outs. A number is an exact total.
    const readMs = (text, kind) => {
      if (typeof kind === 'number') return kind;
      if (kind === 'move') return Math.min(1200, Math.max(900, 560 + text.length * 14));
      if (kind === 'quick') return 700;
      return Math.min(1500, Math.max(800, 420 + text.length * 18));
    };
    async function say(text, kind = 'info') {
      if (disposed || !text) return;
      const total = readMs(text, kind);
      const started = performance.now();
      liveEl.textContent = text;
      textEl.textContent = '';
      subEl.textContent = '';
      let done = false;
      await new Promise((resolve) => {
        skip = () => { done = true; textEl.textContent = text; };
        if (reduced) { textEl.textContent = text; resolve(); return; }
        let i = 0;
        const step = () => {
          if (disposed) return resolve();
          if (done || i >= text.length) { textEl.textContent = text; resolve(); return; }
          i += 1;
          textEl.textContent = text.slice(0, i);
          const t = window.setTimeout(step, 16);
          timers.add(t);
        };
        step();
      });
      textbox.classList.add('is-waiting');
      await new Promise((resolve) => {
        if (disposed) return resolve();
        const w = { resolve, t: 0 };
        const finish = () => { window.clearTimeout(w.t); waits.delete(w); resolve(); };
        w.t = window.setTimeout(finish, done ? 120 : Math.max(200, total - (performance.now() - started)));
        waits.add(w);
        skip = finish;
      });
      skip = null;
      textbox.classList.remove('is-waiting');
    }

    // ----- arena -----
    const slots = {};
    const healthPairs = { p1: h('div', { class: 'tvb-health-pair tvb-health-pair--p1' }), p2: h('div', { class: 'tvb-health-pair tvb-health-pair--p2' }) };
    stage.append(healthPairs.p1, healthPairs.p2);
    ['p2a', 'p2b', 'p1a', 'p1b'].forEach((pos) => {
      const sprite = h('img', { class: 'tvb-mon-sprite', alt: '', width: 96, height: 96, decoding: 'async' });
      const name = h('span', { class: 'tvb-hp-name' });
      const lvl = h('span', { class: 'tvb-hp-lv' });
      const fill = h('span', { class: 'tvb-hp-fill' });
      const nums = h('span', { class: 'tvb-hp-nums' });
      const status = h('span', { class: 'tvb-hp-status' });
      const types = h('span', { class: 'tvb-hp-types' });
      const box = h('div', { class: 'tvb-hpbox', hidden: true },
        h('div', { class: 'tvb-hp-top' }, name, lvl),
        h('div', { class: 'tvb-hp-row' }, h('span', { class: 'tvb-hp-label', text: 'HP' }), h('span', { class: 'tvb-hp-bar' }, fill)),
        h('div', { class: 'tvb-hp-bottom' }, types, status, nums));
      const spot = h('div', { class: `tvb-spot tvb-spot--${pos}` }, h('span', { class: 'tvb-platform', 'aria-hidden': 'true' }), sprite);
      stage.append(spot);
      healthPairs[pos.slice(0, 2)].append(h('div', { class: `tvb-hpslot tvb-hpslot--${pos}` }, box));
      slots[pos] = { sprite, name, lvl, fill, nums, status, types, box, spot, ident: '', species: '', hp: 0, max: 0, pct: 0, typeList: [] };
    });
    // Remaining Pokémon indicators (filled = able to battle).
    const balls = { p1: h('div', { class: 'tvb-left tvb-left--p1', 'aria-hidden': 'true' }), p2: h('div', { class: 'tvb-left tvb-left--p2', 'aria-hidden': 'true' }) };
    healthPairs.p1.append(balls.p1);
    healthPairs.p2.append(balls.p2);
    const roster = { p1: {}, p2: {} };
    const drawBalls = () => ['p1', 'p2'].forEach((s) => { balls[s].replaceChildren(...Object.values(roster[s]).map((alive) => h('span', { class: alive ? 'is-alive' : 'is-out' }))); });

    const tauntText = h('span', { class: 'tvb-taunt-text' });
    const taunt = h('div', { class: 'tvb-taunt', hidden: true }, h('span', { class: 'tvb-taunt-who', text: CHAMP.short }), tauntText,
      h('button', { type: 'button', class: 'tvb-taunt-x', 'aria-label': 'Dismiss', text: '×', onclick: () => { taunt.hidden = true; } }));
    stage.append(taunt);
    let tauntTimer = 0;
    const lastTaunt = {};
    function showTaunt(kind) {
      if (!mods.taunts || disposed) return;
      const pool = TAUNTS[kind] || TAUNTS.generic;
      let line = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1 && line === lastTaunt[kind]) line = pool[(pool.indexOf(line) + 1) % pool.length];
      lastTaunt[kind] = line;
      tauntText.textContent = line;
      tauntLive.textContent = `${CHAMP.short}: ${line}`;
      taunt.hidden = false;
      window.clearTimeout(tauntTimer);
      tauntTimer = window.setTimeout(() => { taunt.hidden = true; }, 3200);
      timers.add(tauntTimer);
    }
    let tauntCtx = null;
    const noteTaunt = (kind) => { if (tauntCtx && RANK.indexOf(kind) < RANK.indexOf(tauntCtx)) tauntCtx = kind; };
    const flushTaunt = () => { if (tauntCtx) { showTaunt(tauntCtx); tauntCtx = null; } };

    const trainer = h('div', { class: 'tvb-trainer', hidden: true }, ART.trainer('tvb-trainer-art'));
    const trainerLabel = h('p', { class: 'tvb-trainer-label', text: CHAMP.label, hidden: true });
    stage.append(trainer, trainerLabel);

    const entryOf = (species) => G.cat.byId[toId(species)] || G.cat.byId[toId(String(species).split('-')[0])] || null;
    function setSprite(pos, species, shiny) {
      const s = slots[pos];
      const entry = entryOf(species);
      const kind = pos.startsWith('p1') ? (shiny ? 'back-shiny' : 'back') : (shiny ? 'shiny' : 'front');
      const url = entry ? T.spriteUrl(entry, kind) : '';
      s.sprite.classList.remove('is-missing', 'is-fainted');
      if (url) s.sprite.src = url; else { s.sprite.removeAttribute('src'); s.sprite.classList.add('is-missing'); }
      s.sprite.onerror = () => { s.sprite.removeAttribute('src'); s.sprite.classList.add('is-missing'); };
    }
    const parseIdent = (ident) => { const m = /^(p\d)([ab])?: (.*)$/.exec(ident || ''); return m ? { side: m[1], pos: m[2] ? m[1] + m[2] : '', name: m[3] } : { side: '', pos: '', name: ident }; };
    const display = (ident) => { const p = parseIdent(ident); return p.side === 'p2' ? `${CHAMP.short}’s ${p.name}` : p.name; };
    const Display = display;
    function readHp(text) {
      const [hpPart, status = ''] = String(text || '').split(' ');
      if (hpPart === '0' || /fnt/.test(text)) return { cur: 0, max: 0, pct: 0, status: 'fnt' };
      const [cur, max] = hpPart.replace(/[gyr]$/, '').split('/').map(Number);
      return { cur, max, pct: max ? (cur / max) * 100 : 0, status };
    }
    // The number counts to its new value in step with the bar (11 steps over the impact time).
    function drawHp(pos, hp, animate = true) {
      const s = slots[pos];
      if (!s) return;
      const fromCur = s.hp;
      const fromPct = s.pct;
      s.hp = hp.cur;
      if (hp.max) s.max = hp.max;
      const pct = Math.max(0, Math.min(100, hp.pct));
      s.pct = pct;
      s.fill.style.transition = animate && !reduced ? '' : 'none';
      s.fill.style.width = `${pct}%`;
      s.fill.dataset.level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
      const own = pos.startsWith('p1') && hp.max;
      const text = (k) => (own ? `${Math.round(fromCur + (hp.cur - fromCur) * k)}/${hp.max}` : `${Math.round(fromPct + (pct - fromPct) * k)}%`);
      window.clearInterval(s.tween);
      if (animate && !reduced) {
        let n = 0;
        s.tween = window.setInterval(() => { n += 1; s.nums.textContent = text(n / 11); if (n >= 11) window.clearInterval(s.tween); }, PACE.impact / 11);
        timers.add(s.tween);
      } else s.nums.textContent = text(1);
      s.box.setAttribute('aria-label', `${s.name.textContent}, ${s.typeList.join(' and ')} type: ${Math.round(pct)}% HP${hp.status && hp.status !== 'fnt' ? `, ${hp.status}` : ''}`);
      if (hp.status !== undefined) {
        s.status.textContent = hp.status && hp.status !== 'fnt' ? hp.status.toUpperCase() : '';
        s.status.dataset.status = hp.status || '';
      }
    }
    function placeMon(ident, details, hpText) {
      const p = parseIdent(ident);
      const s = slots[p.pos];
      if (!s) return;
      const [species, ...rest] = details.split(', ');
      const lv = (rest.find((x) => /^L\d+/.test(x)) || 'L50').slice(1);
      const gender = rest.includes('M') ? ' ♂' : rest.includes('F') ? ' ♀' : '';
      s.ident = ident.replace(/^(p\d)[ab]:/, '$1:');
      s.species = species;
      s.name.textContent = p.name + gender;
      s.lvl.textContent = `Lv${lv}`;
      s.box.hidden = false;
      setSprite(p.pos, species, rest.includes('shiny'));
      const entry = entryOf(species);
      setTypes(p.pos, entry ? entry.types : [], false);
      s.hp = readHp(hpText).cur;
      s.pct = readHp(hpText).pct;
      drawHp(p.pos, readHp(hpText), false);
    }
    // The types shown under an HP bar: the species' typing (forms and Megas included) unless the
    // battle has reported a change (Soak, Protean, Reflect Type, Transform...), which is marked.
    function setTypes(pos, list, changed) {
      const s = slots[pos];
      if (!s) return;
      s.typeList = list.slice();
      s.types.replaceChildren(typeRow(list, 'tvb-types--hp'));
      s.types.classList.toggle('is-changed', !!changed);
      s.types.title = changed ? 'Type changed in this battle' : '';
    }
    // A short label over a Pokémon ("No effect", "Miss"); the narration says it in words too.
    function pop(pos, text) {
      const s = slots[pos];
      if (!s) return;
      const el = h('span', { class: 'tvb-pop', 'aria-hidden': 'true', text });
      s.spot.append(el);
      const t = window.setTimeout(() => el.remove(), 1500);
      timers.add(t);
    }
    const posOf = (ident) => parseIdent(ident).pos;
    async function anim(pos, cls, ms) {
      const el = slots[pos] && slots[pos].spot;
      if (!el || reduced) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      await sleep(ms);
      el.classList.remove(cls);
    }

    const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
    const STATUS = { brn: 'was burned', par: 'is paralyzed! It may be unable to move', slp: 'fell asleep', psn: 'was poisoned', tox: 'was badly poisoned', frz: 'was frozen solid' };
    const from = (parts) => { const f = parts.find((x) => x && x.startsWith('[from]')); return f ? f.replace('[from] ', '').replace(/^(item|ability|move): /, '') : ''; };

    // Trainer Taunts: remembers the most notable thing in the player's latest action.
    function noteLine(parts) {
      const cmd = parts[1];
      if (mods.taunts) {
        if (cmd === 'move' || cmd === 'turn' || cmd === 'upkeep' || cmd === 'win') flushTaunt();
        if (cmd === 'move' && parts[2].startsWith('p1')) tauntCtx = parts[3] === 'Potion' ? 'potion' : 'generic';
        else if (cmd === 'switch' && parts[2].startsWith('p1') && lastRequest && !lastRequest.forceSwitch && !lastRequest.teamPreview) { flushTaunt(); tauntCtx = 'switch'; }
        else if (tauntCtx) {
          if (cmd === 'faint' && parts[2].startsWith('p2')) noteTaunt('faint');
          else if (cmd === '-supereffective' && parts[2].startsWith('p2')) noteTaunt('super');
          else if ((cmd === '-activate' || cmd === '-singleturn') && parts[2].startsWith('p2') && /Protect|Detect/.test(parts[3])) noteTaunt('protect');
          else if (cmd === '-miss' && parts[2].startsWith('p1')) noteTaunt('miss');
          else if (cmd === '-resisted' && parts[2].startsWith('p2')) noteTaunt('resisted');
          else if (cmd === '-damage' && parts[2].startsWith('p2') && readHp(parts[3]).pct > 0 && readHp(parts[3]).pct < 25) noteTaunt('lowhp');
        }
      }
    }
    // Direct hits from one move (a spread move hits its targets together): every target's bar moves
    // at once, then one pause for the impact.
    async function hits(lines) {
      A.play('hit');
      lines.forEach((line) => {
        const parts = line.split('|');
        noteLine(parts);
        const pos = posOf(parts[2]);
        anim(pos, 'is-hit', 420);
        drawHp(pos, readHp(parts[3]));
      });
      await sleep(PACE.impact);
    }

    // One log line -> animation + narration. Unknown lines are skipped.
    async function handle(line) {
      const parts = line.split('|');
      const cmd = parts[1];
      noteLine(parts);
      switch (cmd) {
        case 'poke': {
          const side = parts[2];
          roster[side][`${Object.keys(roster[side]).length}`] = true;
          break;
        }
        case 'teamsize': {
          // After team preview: the number each side brought.
          const side = parts[2];
          roster[side] = {};
          for (let i = 0; i < Number(parts[3]); i += 1) roster[side][i] = true;
          drawBalls();
          break;
        }
        case 'switch': case 'drag': case 'replace': {
          // Send-out: a short pixel flash where the Pokémon appears (no capsule).
          const p = parseIdent(parts[2]);
          placeMon(parts[2], parts[3], parts[4]);
          A.play('select');
          anim(p.pos, 'is-entering', PACE.enter);
          await say(p.side === 'p1' ? `Go! ${p.name}!` : `${CHAMP.short} sent out ${p.name}!`, 'quick');
          break;
        }
        case 'detailschange': case '-formechange': {
          const pos = posOf(parts[2]);
          if (slots[pos]) {
            slots[pos].species = parts[3].split(',')[0];
            setSprite(pos, slots[pos].species, parts[3].includes('shiny'));
            const entry = entryOf(slots[pos].species);
            if (entry) setTypes(pos, entry.types, false);
          }
          break;
        }
        case '-start': {
          const pos = posOf(parts[2]);
          if (parts[3] === 'typechange' && slots[pos]) setTypes(pos, parts[4].split('/'), true);
          else if (parts[3] === 'typeadd' && slots[pos] && !slots[pos].typeList.includes(parts[4])) setTypes(pos, [...slots[pos].typeList, parts[4]], true);
          if (parts[3] === 'confusion') await say(`${Display(parts[2])} became confused!`);
          else if (parts[3] === 'typechange' && parts[4]) await say(`${Display(parts[2])} became ${parts[4].replace('/', ' and ')} type!`);
          break;
        }
        case '-transform': {
          const pos = posOf(parts[2]);
          const model = slots[posOf(parts[3])];
          if (slots[pos] && model) setTypes(pos, model.typeList, true);
          await say(`${Display(parts[2])} transformed into ${parseIdent(parts[3]).name}!`);
          break;
        }
        case '-mega': {
          A.play('mega');
          anim(posOf(parts[2]), 'is-mega', 700);
          await say(`${Display(parts[2])}’s ${parts[4]} is reacting! ${Display(parts[2])} has Mega Evolved!`);
          break;
        }
        case 'move': {
          const pos = posOf(parts[2]);
          if (parts[3] === 'Potion') { await say('You used a Potion!'); break; }
          if (parts[2].startsWith('p2')) stats.renMoves[parts[3]] = (stats.renMoves[parts[3]] || 0) + 1;
          // Anticipation: the user lunges and its single target is marked while the line reads.
          anim(pos, pos.startsWith('p1') ? 'is-lunge-up' : 'is-lunge-down', 300);
          const target = posOf(parts[4] || '');
          if (target && target !== pos && !line.includes('[spread]') && !line.includes('[notarget]')) anim(target, 'is-aimed', 900);
          await say(`${Display(parts[2])} used ${parts[3]}!`, 'move');
          break;
        }
        case '-damage': {
          // Indirect damage (recoil, Life Orb, poison, weather...): direct hits go through hits().
          const pos = posOf(parts[2]);
          const src = from(parts);
          const text = src === 'Recoil' ? `${Display(parts[2])} is damaged by the recoil!`
            : src === 'Life Orb' ? `${Display(parts[2])} lost some of its HP!`
              : src === 'psn' || src === 'tox' ? `${Display(parts[2])} is hurt by poison!`
                : src === 'brn' ? `${Display(parts[2])} is hurt by its burn!`
                  : src ? `${Display(parts[2])} is hurt by ${src}!` : '';
          const said = say(text);
          drawHp(pos, readHp(parts[3]));
          await Promise.all([said, sleep(PACE.residual)]);
          break;
        }
        case '-heal': {
          const pos = posOf(parts[2]);
          const src = from(parts);
          if (src === 'vr: championship') {
            const p = parseIdent(parts[2]);
            Object.keys(roster.p2).some((k) => { if (!roster.p2[k]) { roster.p2[k] = true; return true; } return false; });
            drawBalls();
            if (pos && slots[pos]) { slots[pos].sprite.classList.remove('is-fainted'); drawHp(pos, readHp(parts[3])); }
            A.play('revive');
            await say(`${CHAMP.short}’s ${p.name} rose again at half strength!`);
            break;
          }
          const said = say(src === 'Potion' ? `${Display(parts[2])}’s HP was restored.` : src === 'drain' ? `${Display(parts[2])} drained some HP!` : src ?`${Display(parts[2])} restored HP using ${src === 'Grassy Terrain' ? 'the Grassy Terrain' : `its ${src}`}!` : '');
          drawHp(pos, readHp(parts[3]));
          A.play('heal');
          await Promise.all([said, sleep(PACE.residual)]);
          break;
        }
        case '-sethp': drawHp(posOf(parts[2]), readHp(parts[3])); break;
        case 'faint': {
          const pos = posOf(parts[2]);
          const side = parts[2].slice(0, 2);
          if (side === 'p2') stats.yourKOs += 1; else stats.renKOs += 1;
          const k = Object.keys(roster[side]).find((x) => roster[side][x]);
          if (k !== undefined) { roster[side][k] = false; drawBalls(); }
          A.play('faint');
          if (slots[pos]) { slots[pos].sprite.classList.add('is-fainted'); drawHp(pos, { cur: 0, max: slots[pos].max, pct: 0, status: '' }); }
          await say(`${Display(parts[2])} fainted!`);
          if (slots[pos]) slots[pos].box.hidden = true;
          break;
        }
        case '-supereffective': A.play('superHit'); await say('It’s super effective!'); break;
        case '-resisted': await say('It’s not very effective…'); break;
        case '-immune': pop(posOf(parts[2]), 'No effect'); await say(`It doesn’t affect ${display(parts[2])}…`); break;
        case '-crit': await say('A critical hit!'); break;
        case '-miss': pop(posOf(parts[3] || parts[2]), 'Miss'); await say(`${Display(parts[3] || parts[2])} avoided the attack!`); break;
        case '-fail': await say(parts[3] === 'move: Potion' ? (line.includes('full HP') ? 'It won’t have any effect.' : 'The bag is empty!') : 'But it failed!'); break;
        case '-hitcount': await say(`The Pokémon was hit ${parts[3]} time${parts[3] === '1' ? '' : 's'}!`); break;
        case '-boost': case '-unboost': {
          const n = Number(parts[4]);
          const how = n >= 3 ? ' drastically' : n === 2 ? ' sharply' : '';
          await say(`${Display(parts[2])}’s ${STAT[parts[3]] || parts[3]} ${cmd === '-boost' ? 'rose' : 'fell'}${how}!`);
          break;
        }
        case '-status': {
          const s = slots[posOf(parts[2])];
          if (s) { s.status.textContent = parts[3].toUpperCase(); s.status.dataset.status = parts[3]; }
          await say(`${Display(parts[2])} ${STATUS[parts[3]] || `is affected by ${parts[3]}`}!`);
          break;
        }
        case '-curestatus': {
          const s = slots[posOf(parts[2])];
          if (s) { s.status.textContent = ''; s.status.dataset.status = ''; }
          await say(parts[3] === 'slp' ? `${Display(parts[2])} woke up!` : `${Display(parts[2])} was cured!`);
          break;
        }
        case 'cant': {
          const why = parts[3];
          const msg = why === 'slp' ? 'is fast asleep.' : why === 'par' ? 'is paralyzed! It can’t move!' : why === 'flinch' ? 'flinched and couldn’t move!' : why === 'frz' ? 'is frozen solid!' : 'can’t move!';
          await say(`${Display(parts[2])} ${msg}`);
          break;
        }
        case '-activate': {
          if (/Protect|Detect/.test(parts[3])) await say(`${Display(parts[2])} protected itself!`);
          else if (/confusion/.test(parts[3])) await say(`${Display(parts[2])} is confused!`);
          break;
        }
        case '-singleturn': if (/Protect|Detect/.test(parts[3])) await say(`${Display(parts[2])} protected itself!`); break;
        case '-enditem': {
          if (parts[3] === 'Focus Sash') await say(`${Display(parts[2])} hung on using its Focus Sash!`);
          else if (line.includes('[eat]')) await say(`${Display(parts[2])} ate its ${parts[3]}!`);
          break;
        }
        case '-ability': await say(`[${Display(parts[2])}’s ${parts[3]}]`); break;
        case '-fieldstart': await say(/Grassy/.test(parts[2]) ? 'Grass grew to cover the battlefield!' : /Electric/.test(parts[2]) ? 'An electric current ran across the battlefield!' : /Psychic/.test(parts[2]) ? 'The battlefield got weird!' : /Misty/.test(parts[2]) ? 'Mist swirled around the battlefield!' : /Trick Room/.test(parts[2]) ? 'The dimensions were twisted!' : `${parts[2].replace('move: ', '')} began!`); break;
        case '-fieldend': await say(`${parts[2].replace('move: ', '')} ended.`); break;
        case '-weather': if (parts[2] !== 'none' && !line.includes('[upkeep]')) await say(`The weather became ${parts[2].replace('RainDance', 'rain').replace('SunnyDay', 'harsh sunlight').replace('Sandstorm', 'a sandstorm').replace('Snowscape', 'snow')}!`); break;
        case '-sidestart': await say(`${parts[3].replace('move: ', '')} started on ${parts[2].startsWith('p1') ? 'your' : 'Ren’s'} side!`); break;
        case '-sideend': await say(`${parts[3].replace('move: ', '')} ended on ${parts[2].startsWith('p1') ? 'your' : 'Ren’s'} side.`); break;
        case 'vr-chaos': await say('Chaotic replacement! Your next Pokémon was picked at random.'); break;
        case 'turn': stats.turns = Number(parts[2]); turnEl.textContent = `Turn ${parts[2]}`; textEl.textContent = ''; break;
        default: break;
      }
    }

    // The presentation queue: log batches play strictly in arrival order, one beat (action) at a
    // time with a gap between actions. frame[data-busy] is set while anything is playing; command
    // menus only appear after the queue has drained (onRequest), so input is locked meanwhile.
    let queue = Promise.resolve();
    let playing = 0;
    let lastWasAction = false;
    const ACTIONS = new Set(['move', 'switch', 'drag', 'replace', 'cant', 'detailschange', '-mega', 'residual']);
    const busy = (d) => { playing += d; frame.dataset.busy = playing > 0 ? '1' : ''; };
    const playLines = (lines) => {
      busy(1);
      queue = queue.then(async () => {
        for (const beat of C.beats(lines)) {
          if (disposed) return;
          const action = ACTIONS.has(beat.kind);
          if (action && lastWasAction) await sleep(PACE.gap);
          if (beat.kind === 'turn') lastWasAction = false;
          else if (action || beat.kind === 'upkeep') lastWasAction = action;
          for (const step of C.steps(beat.lines)) {
            if (disposed) return;
            if (step.hit) await hits(step.lines);
            else await handle(step.lines[0]);
          }
        }
        if (mods.taunts && lines.length) flushTaunt();
      }).catch(() => { /* a drawing error must not stall later batches */ }).then(() => busy(-1));
      return queue;
    };

    // ----- command menus (inside the dock) -----
    const clearMenu = () => menu.replaceChildren();
    function menuButton(label, onClick, attrs = {}) {
      return h('button', { type: 'button', class: 'tvb-cmd', ...attrs, onclick: (e) => { A.play(attrs['data-back'] ? 'back' : 'select'); onClick(e); } }, ...[].concat(label));
    }
    let backAction = null;
    // The prompt and any detail go in the text box (classic layout); the dock's right side holds
    // only the command grid, with Back as its last cell.
    function prompt(title, sub = '') {
      textEl.textContent = title;
      subEl.textContent = sub;
      textbox.classList.remove('is-waiting');
    }
    function showMenu(title, buttons, { cols = 2, back = null, sub = '' } = {}) {
      clearMenu();
      backAction = back;
      prompt(title, sub);
      const cells = back ? [...buttons, menuButton('◂ Back', back, { 'data-back': 'back', class: 'tvb-cmd tvb-cmd--back' })] : buttons;
      menu.append(h('div', { class: `tvb-cmd-grid tvb-cmd-grid--${cols}`, role: 'group', 'aria-label': title, 'data-grid': '' }, cells));
      const first = menu.querySelector('button:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
    const highlight = (pos) => Object.entries(slots).forEach(([k, s]) => s.spot.classList.toggle('is-choosing', k === pos));

    // Team preview: pick up to four in order; the first two lead.
    function teamPreview(req) {
      const picks = [];
      const mons = req.side.pokemon;
      const need = Math.min(C.BRING, mons.length);
      const render = () => {
        const buttons = mons.map((p, i) => {
          const species = p.details.split(',')[0];
          const entry = entryOf(species);
          const n = picks.indexOf(i + 1);
          const img = h('img', { class: 'tvb-sprite', alt: '', width: 96, height: 96, src: entry ? T.spriteUrl(entry, p.details.includes('shiny') ? 'shiny' : 'front') : null });
          const label = p.ident.replace(/^p1: /, '');
          const types = entry ? entry.types : [];
          return menuButton([typeRow(types, 'tvb-types--card'), img, h('span', { text: label }), h('span', { class: 'tvb-pick-n', text: n >= 0 ? (n < 2 ? `Lead ${n + 1}` : `Back ${n - 1}`) : '' })], () => {
            const at = picks.indexOf(i + 1);
            if (at >= 0) picks.splice(at, 1); else if (picks.length < need) picks.push(i + 1);
            render();
            // With the team complete, focus Start battle so Enter starts it.
            (picks.length === need ? menu.querySelector('.tvb-cmd--go') : menu.querySelectorAll('.tvb-pickmon')[i])?.focus();
          }, { class: 'tvb-cmd tvb-pickmon', 'aria-pressed': String(n >= 0), 'aria-label': `${label}, ${types.join(' and ')} type${n >= 0 ? `, picked ${n + 1}${n < 2 ? ', leads' : ''}` : ''}` });
        });
        const confirm = menuButton(picks.length === need ? 'Start battle ▸' : `Pick ${need - picks.length} more`, () => { A.play('confirm'); send(`team ${picks.join('')}`); }, { class: 'tvb-cmd tvb-cmd--go' });
        confirm.disabled = picks.length !== need;
        clearMenu();
        backAction = null;
        prompt(`Team preview: bring ${need}. The first two you pick lead.`, `${CHAMP.short} brought: ${previewFoes.join(', ')}`);
        menu.append(
          h('div', { class: 'tvb-cmd-grid tvb-cmd-grid--3 tvb-preview-pick', role: 'group', 'aria-label': 'Your team', 'data-grid': '' }, buttons),
          h('div', { class: 'tvb-cmd-foot' }, confirm));
      };
      render();
      menu.querySelector('.tvb-pickmon')?.focus({ preventScroll: true });
    }

    function targetsFor(move, slot) {
      const t = move.target;
      const foes = ['p2a', 'p2b'].map((pos, i) => ({ loc: i + 1, pos })).filter((x) => slots[x.pos].ident && !slots[x.pos].sprite.classList.contains('is-fainted') && !slots[x.pos].box.hidden);
      const allyPos = slot === 0 ? 'p1b' : 'p1a';
      const ally = slots[allyPos].ident && !slots[allyPos].box.hidden ? [{ loc: -(slot === 0 ? 2 : 1), pos: allyPos }] : [];
      const self = [{ loc: -(slot + 1), pos: slot === 0 ? 'p1a' : 'p1b' }];
      if (['normal', 'any'].includes(t)) return [...foes, ...ally];
      if (t === 'adjacentFoe') return foes;
      if (t === 'adjacentAlly') return ally;
      if (t === 'adjacentAllyOrSelf') return [...self, ...ally];
      return null; // spread, self, field: no target needed
    }
    const SPREAD_TEXT = { allAdjacentFoes: 'Hits both opponents', allAdjacent: 'Hits everyone next to it, partner included', self: 'Targets itself', allySide: 'Affects your side', foeSide: 'Affects Ren’s side', all: 'Affects the whole field', randomNormal: 'Hits a random opponent', allies: 'Affects your team' };

    // Player's turn: one command per active slot, then both are sent together.
    function command(req) {
      const choices = [];
      const actives = req.side.pokemon.filter((p) => p.active);
      let megaTaken = false;
      const next = (slot) => {
        if (slot >= req.active.length) { highlight(''); send(choices.join(', ')); return; }
        const act = req.active[slot];
        const mon = actives[slot];
        if (!mon || mon.condition.endsWith(' fnt') || act.commanding) { choices[slot] = 'pass'; next(slot + 1); return; }
        const name = mon.ident.replace(/^p1: /, '');
        const pos = slot === 0 ? 'p1a' : 'p1b';
        const count = req.active.filter((a, i) => actives[i] && !actives[i].condition.endsWith(' fnt')).length;
        const tag = count > 1 ? ` (${slot + 1} of 2)` : '';
        const prevSlot = slot > 0 ? () => { choices.length = slot - 1; megaTaken = choices.some((c) => / mega$/.test(c)); next(slot - 1); } : null;
        highlight(pos);
        const top = () => {
          const potions = req.vr ? req.vr.potions : 0;
          const canSwitch = !act.trapped && !(req.vr && req.vr.noSwitch) && req.side.pokemon.some((p, i) => !p.active && !p.condition.endsWith(' fnt') && !choices.includes(`switch ${i + 1}`));
          const buttons = [
            menuButton('Fight', () => fight(), { class: 'tvb-cmd tvb-cmd--fight' }),
            menuButton(`Bag${potions ? ` (${potions})` : ''}`, () => bag(), { disabled: !potions }),
            menuButton('Party', () => party(), { disabled: !canSwitch }),
            menuButton('Quit', () => quit(), { 'data-back': 'quit' })
          ];
          const note = req.vr && req.vr.noSwitch ? 'No switching is on.' : '';
          showMenu(`What will ${name} do?${tag}`, buttons, { back: prevSlot, sub: note });
        };
        const pickTarget = (label, list, done) => {
          if (!list) return done('');
          if (list.length === 1) return done(` ${list[0].loc}`);
          showMenu(`${label}: choose a target`, list.map((x) => menuButton(`${slots[x.pos].name.textContent}${x.pos.startsWith('p1') ? (x.loc === -(slot + 1) ? ' (itself)' : ' (partner)') : ` (${CHAMP.short}, ${x.pos === 'p2a' ? 'left' : 'right'})`}`, () => done(` ${x.loc}`))), { back: () => top() });
          return null;
        };
        const fight = () => {
          let mega = false;
          const moves = act.moves.map((m, i) => ({ ...m, n: i + 1 })).filter((m) => m.id !== 'potion');
          const describe = (m) => {
            const info = (req.vr && req.vr.moves && req.vr.moves[m.id]) || {};
            const cat = G.cat.moveByName[m.move];
            const reach = SPREAD_TEXT[m.target] || '';
            subEl.textContent = [
              `${m.move}: ${info.type || ''} · ${info.category || ''}${info.power ? ` · Power ${info.power}` : ''} · ${info.accuracy ? `Acc ${info.accuracy}%` : 'Never misses'}${info.priority ? ` · Priority ${info.priority > 0 ? '+' : ''}${info.priority}` : ''}`,
              reach, cat ? cat.desc : ''
            ].filter(Boolean).join('. ');
          };
          const render = () => {
            const buttons = moves.map((m) => {
              const info = (req.vr && req.vr.moves && req.vr.moves[m.id]) || {};
              const b = menuButton([h('span', { class: 'tvb-move-name', text: m.move }), h('span', { class: 'tvb-move-meta', text: `${info.type || ''}${m.pp != null ? ` · PP ${m.pp}/${m.maxpp}` : ''}` })], () => {
                pickTarget(m.move, targetsFor(m, slot), (tgt) => {
                  choices[slot] = `move ${m.n}${tgt}${mega ? ' mega' : ''}`;
                  if (mega) megaTaken = true;
                  next(slot + 1);
                });
              }, { disabled: m.disabled || m.pp === 0, class: 'tvb-cmd tvb-move', style: `--type:${TYPE_COLOURS[info.type] || '#777'}`, 'aria-describedby': 'tvbSub' });
              b.addEventListener('focus', () => describe(m));
              b.addEventListener('pointerenter', () => describe(m));
              return b;
            });
            if (act.canMegaEvo && !megaTaken) buttons.push(menuButton(mega ? 'Mega Evolution: on' : 'Mega Evolve', () => { mega = !mega; render(); menu.querySelector('.tvb-cmd--mega')?.focus(); }, { class: 'tvb-cmd tvb-cmd--mega', 'aria-pressed': String(mega) }));
            showMenu(`${name}: choose a move${tag}`, buttons, { back: () => top() });
            const first = moves.find((m) => !m.disabled && m.pp !== 0);
            if (first) describe(first);
          };
          render();
        };
        const bag = () => {
          const slotN = act.moves.findIndex((m) => m.id === 'potion') + 1;
          showMenu(`Bag: ${req.vr.potions} Potion${req.vr.potions === 1 ? '' : 's'} (restores half of max HP)`, [
            menuButton('Use Potion', () => pickTarget('Potion', targetsFor({ target: 'adjacentAllyOrSelf' }, slot), (tgt) => { choices[slot] = `move ${slotN}${tgt}`; next(slot + 1); }), { disabled: !slotN })
          ], { back: () => top() });
        };
        const party = () => {
          const taken = choices.filter((c) => /^switch /.test(c)).map((c) => Number(c.split(' ')[1]));
          const buttons = req.side.pokemon.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => !p.active).map(({ p, n }) => {
            const hp = readHp(p.condition);
            return menuButton(`${p.ident.replace(/^p1: /, '')} · ${hp.status === 'fnt' ? 'fainted' : `${hp.cur}/${hp.max}`}`, () => { choices[slot] = `switch ${n}`; next(slot + 1); }, { disabled: hp.status === 'fnt' || taken.includes(n) });
          });
          showMenu(`Switch ${name} for…`, buttons, { back: () => top() });
        };
        top();
      };
      next(0);
    }

    // Forced replacements: every empty slot that can be filled must be (Back undoes the first pick).
    function forcedSwitch(req) {
      const choices = [];
      const taken = new Set();
      const next = (slot) => {
        if (slot >= req.forceSwitch.length) { send(choices.join(', ')); return; }
        if (!req.forceSwitch[slot]) { choices[slot] = 'pass'; next(slot + 1); return; }
        const bench = req.side.pokemon.map((p, i) => ({ p, n: i + 1 })).filter(({ p, n }) => !p.active && !p.condition.endsWith(' fnt') && !taken.has(n));
        if (!bench.length) { choices[slot] = 'pass'; next(slot + 1); return; }
        const prev = choices.slice(0, slot).findIndex((c) => c && c !== 'pass');
        showMenu(`Choose a Pokémon for the ${slot === 0 ? 'left' : 'right'} slot`, bench.map(({ p, n }) => {
          const hp = readHp(p.condition);
          return menuButton(`${p.ident.replace(/^p1: /, '')} · ${hp.cur}/${hp.max}`, () => { taken.add(n); choices[slot] = `switch ${n}`; next(slot + 1); });
        }), { back: prev >= 0 ? () => { taken.clear(); choices.length = 0; next(0); } : null });
      };
      next(0);
    }

    async function quit() {
      if (ended) { leave('builder'); return; }
      const yes = await T.confirm('Quit the battle?', 'This battle can’t be resumed. Your party and modifiers stay saved.', 'Quit', 'Keep battling');
      if (yes) leave('builder');
      else if (lastRequest) onRequest(lastRequest);
    }

    // ----- engine plumbing -----
    let lastRequest = null;
    const previewFoes = [];
    function send(choice) {
      clearMenu();
      backAction = null;
      if (!worker || ended || !lastRequest) return;
      worker.postMessage({ t: 'choose', battleId, rqid: lastRequest.rqid, choice });
    }
    function onRequest(req) {
      lastRequest = req;
      playLines([]).then(() => {
        if (disposed || ended || cinematic || req !== lastRequest) return;
        if (req.wait) return;
        if (req.teamPreview) { textEl.textContent = `Choose ${Math.min(C.BRING, req.side.pokemon.length)} Pokémon to bring.`; teamPreview(req); return; }
        if (req.forceSwitch) { forcedSwitch(req); return; }
        textEl.textContent = '';
        command(req);
      });
    }

    // Pre-rendered 38-second cinematic. Engine state, not the video, chooses and revives the first faint.
    function runEscalation(event) {
      if (cinematic || stats.escalated) return Promise.resolve();
      return new Promise((resolve) => {
        stats.escalated = true;
        clearMenu();
        backAction = null;
        highlight('');
        A.music.stop();
        A.crowd.stop();
        cinematic = window.TVBCinematic.play(frame, event, A, (reason) => {
          cinematic = null;
          if (disposed || ended) { resolve(); return; }
          setPhase('stadium');
          if (reason === 'unavailable') {
            textEl.textContent = 'The cinematic could not play. Ren’s first fainted Pokémon returns for the final round.';
            liveEl.textContent = textEl.textContent;
          }
          G.lastSync = { clock: 'video', skipped: reason === 'skipped', fallback: reason === 'unavailable' };
          A.music.start('finale');
          if (worker) worker.postMessage({ t: 'resume', battleId, id: event.id });
          resolve();
        });
      });
    }

    // ----- the end -----
    function leave(state) {
      dispose();
      go(state);
    }
    async function finish(winner, champion) {
      if (ended) return;
      ended = true;
      await playLines([]);
      if (disposed) return;
      clearMenu();
      highlight('');
      const won = winner === 'p1';
      A.music.stop();
      A.crowd.stop();
      A.play(won ? 'win' : 'lose');
      frame.classList.add(won ? 'is-won' : 'is-lost');
      await say(won ? `You defeated ${CHAMP.name}! ${G.name} is the very best!` : `You lost to ${CHAMP.name}…`);
      if (worker) { worker.terminate(); worker = null; }
      const used = Object.entries(stats.renMoves).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${m} ×${n}`).join(', ');
      const insights = [
        `${stats.turns} turn${stats.turns === 1 ? '' : 's'} · you knocked out ${stats.yourKOs} · Ren knocked out ${stats.renKOs}${stats.escalated ? ' · the championship revival happened' : ''}.`,
        used ? `Ren’s most-used moves: ${used}.` : '',
        won ? '' : 'Tips: protect a Pokémon Ren is focusing, use spread moves while Ren’s Pokémon are healthy, and save a knockout until you can take the second one quickly — the revival only happens once.'
      ].filter(Boolean);
      const sets = (champion || []).map((s) => h('li', {}, h('strong', { text: s.species }), ` @ ${s.item} · ${s.ability} · ${s.moves.join(', ')}`));
      menu.replaceChildren(
        h('div', { class: 'tvb-result' },
          h('p', { class: 'tvb-cmd-title', text: won ? `Victory! Reward ×${mult.toFixed(2)} · ${C.tier(mult)} tier` : 'Defeat. Your party is saved.' }),
          ...insights.map((t) => h('p', { class: 'tvb-dim', text: t })),
          sets.length ? h('details', { class: 'tvb-reveal' }, h('summary', { text: 'Ren’s sets this battle' }), h('ul', {}, sets)) : null,
          h('div', { class: 'tvb-cmd-grid tvb-cmd-grid--3', 'data-grid': '' },
            menuButton('Rematch', () => { dispose(); go('battle', { seed: C.newSeed() }); }, { class: 'tvb-cmd tvb-cmd--go' }),
            menuButton('Edit party', () => leave('builder')),
            menuButton('Title', () => leave('title'), { 'data-back': 'title' }))));
      menu.querySelector('button').focus();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (cinematic) cinematic.cancel();
      cinematic = null;
      skip = null;
      timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
      waits.forEach((w) => { window.clearTimeout(w.t); w.resolve(); });
      waits.clear();
      document.removeEventListener('keydown', onKey);
      if (worker) { worker.terminate(); worker = null; }
      A.crowd.stop();
      A.music.stop();
      G.battleActive = null;
      G.escapeHook = null;
      if (active === dispose) active = null;
    }
    active = dispose;
    // Escape: skip the cinematic, else go back one menu level, else ask to quit.
    G.escapeHook = () => {
      if (disposed) return false;
      if (cinematic) { cinematic.skip(); return true; }
      if (backAction) { A.play('back'); backAction(); return true; }
      if (!ended) { quit(); return true; }
      return false;
    };

    // ----- intro -> battle -----
    (async () => {
      A.music.start('battle');
      textEl.textContent = '';
      let pools = null;
      try {
        if (mods.moves) pools = await loadPools();
      } catch (_) {
        await say('The battle data didn’t load. Check your connection and try again.');
        showMenu('Couldn’t start the battle', [menuButton('Retry', () => { dispose(); go('battle', { seed }); }, { class: 'tvb-cmd tvb-cmd--go' }), menuButton('Back to party', () => leave('builder'))]);
        return;
      }
      if (disposed) return;
      let loadout = null;
      try {
        loadout = C.battleLoadout(G.cat, G.draft, seed, { movepools: pools });
      } catch (_) {
        await say('The random team couldn’t be built from this catalog.');
        showMenu('Couldn’t start the battle', [menuButton('Back to party', () => leave('builder'))]);
        return;
      }
      trainer.hidden = false;
      trainerLabel.hidden = false;
      if (!reduced) trainer.classList.add('is-arriving');
      await say(`${CHAMP.name} would like to battle!`, 1300);
      if (disposed) return;
      try {
        worker = new Worker(ENGINE_URL);
      } catch (_) {
        await say('Your browser couldn’t start the battle engine.');
        showMenu('Couldn’t start the battle', [menuButton('Back to party', () => leave('builder'))]);
        return;
      }
      const stopped = (text) => {
        if (ended || disposed) return;
        ended = true;
        window.clearTimeout(watchdog);
        if (worker) { worker.terminate(); worker = null; }
        say(text).then(() => showMenu('Battle stopped', [menuButton('Retry', () => { dispose(); go('battle', { seed: C.newSeed() }); }, { class: 'tvb-cmd tvb-cmd--go' }), menuButton('Back to party', () => leave('builder'))]));
      };
      // Watchdog: an engine that never answers ends in a message, not a silent wait.
      const watchdog = window.setTimeout(() => stopped('The battle engine didn’t respond. Check your connection and try again.'), 20000);
      timers.add(watchdog);
      worker.onerror = () => stopped('The battle engine stopped unexpectedly.');
      worker.onmessage = (event) => {
        const msg = event.data || {};
        if (disposed || (msg.battleId && msg.battleId !== battleId)) return;
        if (msg.t === 'ready') return;
        window.clearTimeout(watchdog);
        if (msg.t === 'log') {
          const lines = msg.lines;
          lines.forEach((l) => { if (l.startsWith('|poke|p2|')) previewFoes.push(l.split('|')[3].split(',')[0]); });
          if (lines.some((l) => l.startsWith('|switch|') || l.startsWith('|start'))) { trainer.hidden = true; trainerLabel.hidden = true; }
          playLines(lines);
        } else if (msg.t === 'request') onRequest(msg.request);
        else if (msg.t === 'error') playLines([]).then(() => say(msg.message));
        else if (msg.t === 'escalation') playLines([]).then(() => { if (!disposed && !ended) runEscalation(msg); });
        else if (msg.t === 'end') finish(msg.winner, msg.champion);
        else if (msg.t === 'invalid') stopped(`Your team can’t battle: ${msg.message}`);
        else if (msg.t === 'fatal') stopped('The battle engine hit an error.');
      };
      worker.postMessage({ t: 'start', battleId, config: { seed, player: { team: loadout.sets }, rules } });
    })();
  };
}());

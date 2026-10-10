// The Very Best: the battle screen, registered as the shell's `battle` state (vr-game.js). The
// battle runs in a Web Worker (/vr/vr-engine.js: Pokémon Showdown's simulator + the champion AI);
// this file draws what the engine reports for the player's side and sends the player's choices
// back. Everything — intro, commands, targeting, bag, party, dialogue, the championship cinematic
// and the result — renders inside the battle frame.
//
// Nothing here persists: closing the window, Quit or a reload ends the battle for good.
(function () {
  'use strict';

  const T = window.TVB;
  const { G, C, A, ART, h, go, announce } = T;
  const ENGINE_URL = '/vr/vr-engine.js?v=3';
  const CHAMP = { name: 'Ren Kestrel', short: 'Ren', label: 'Ren Kestrel · Reigning Champion' };
  const CUE = A.MANIFEST.escalation.resumeCueSeconds;
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const TYPE_COLOURS = {
    Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#d9b416', Grass: '#5fae3e', Ice: '#6cc8c4', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#c9a75a',
    Flying: '#8f7fd9', Psychic: '#f95587', Bug: '#8d9c1b', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#8a8aa3', Fairy: '#d685ad'
  };

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
  // The championship escalation: original lines, respectful (cues in seconds).
  const ESC_LINES = [
    [0.5, 'You’ve earned this stage.'],
    [5, 'But a championship is decided by how we finish.'],
    [26, 'Let’s give them a battle to remember.']
  ];

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
    const sleep = (ms) => new Promise((r) => { const t = window.setTimeout(r, reduced ? Math.min(ms, 60) : ms); timers.add(t); });
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

    // ----- message box -----
    let skip = null;
    const advance = () => { if (skip) skip(); };
    frame.addEventListener('click', (e) => { if (!e.target.closest('button, input, select')) advance(); });
    const onKey = (e) => {
      if (disposed || G.modal) return;
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, input, select')) { e.preventDefault(); advance(); }
    };
    document.addEventListener('keydown', onKey);
    async function say(text, hold = 650) {
      if (disposed || !text) return;
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
        const t = window.setTimeout(resolve, done ? 120 : hold);
        timers.add(t);
        skip = () => { window.clearTimeout(t); resolve(); };
      });
      skip = null;
      textbox.classList.remove('is-waiting');
    }

    // ----- arena -----
    const slots = {};
    ['p2a', 'p2b', 'p1a', 'p1b'].forEach((pos) => {
      const sprite = h('img', { class: 'tvb-mon-sprite', alt: '', width: 96, height: 96, decoding: 'async' });
      const name = h('span', { class: 'tvb-hp-name' });
      const lvl = h('span', { class: 'tvb-hp-lv' });
      const fill = h('span', { class: 'tvb-hp-fill' });
      const nums = h('span', { class: 'tvb-hp-nums' });
      const status = h('span', { class: 'tvb-hp-status' });
      const box = h('div', { class: 'tvb-hpbox', hidden: true },
        h('div', { class: 'tvb-hp-top' }, name, lvl),
        h('div', { class: 'tvb-hp-row' }, h('span', { class: 'tvb-hp-label', text: 'HP' }), h('span', { class: 'tvb-hp-bar' }, fill)),
        h('div', { class: 'tvb-hp-bottom' }, status, nums));
      const spot = h('div', { class: `tvb-spot tvb-spot--${pos}` }, h('span', { class: 'tvb-platform', 'aria-hidden': 'true' }), sprite);
      stage.append(spot, h('div', { class: `tvb-hpslot tvb-hpslot--${pos}` }, box));
      slots[pos] = { sprite, name, lvl, fill, nums, status, box, spot, ident: '', species: '', hp: 0, max: 0 };
    });
    // Remaining Pokémon indicators (filled = able to battle).
    const balls = { p1: h('div', { class: 'tvb-left tvb-left--p1', 'aria-hidden': 'true' }), p2: h('div', { class: 'tvb-left tvb-left--p2', 'aria-hidden': 'true' }) };
    stage.append(balls.p1, balls.p2);
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

    const trainer = h('div', { class: 'tvb-trainer', hidden: true });
    trainer.innerHTML = ART.champion('tvb-trainer-art');
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
    function drawHp(pos, hp, animate = true) {
      const s = slots[pos];
      if (!s) return;
      s.hp = hp.cur;
      if (hp.max) s.max = hp.max;
      const pct = Math.max(0, Math.min(100, hp.pct));
      s.fill.style.transition = animate && !reduced ? '' : 'none';
      s.fill.style.width = `${pct}%`;
      s.fill.dataset.level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
      s.nums.textContent = pos.startsWith('p1') && hp.max ? `${hp.cur}/${hp.max}` : `${Math.round(pct)}%`;
      s.box.setAttribute('aria-label', `${s.name.textContent}: ${Math.round(pct)}% HP${hp.status && hp.status !== 'fnt' ? `, ${hp.status}` : ''}`);
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
      drawHp(p.pos, readHp(hpText), false);
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
    // Ren's capsule: a short arc from the trainer's side to the slot, then the Pokémon appears.
    async function throwCapsule(pos) {
      if (reduced) return;
      const cap = h('span', { class: `tvb-throw tvb-throw--${pos}`, 'aria-hidden': 'true' });
      cap.innerHTML = ART.capsule('tvb-capsule');
      stage.append(cap);
      A.play('throw');
      await sleep(520);
      cap.remove();
    }

    const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
    const STATUS = { brn: 'was burned', par: 'is paralyzed! It may be unable to move', slp: 'fell asleep', psn: 'was poisoned', tox: 'was badly poisoned', frz: 'was frozen solid' };
    const from = (parts) => { const f = parts.find((x) => x && x.startsWith('[from]')); return f ? f.replace('[from] ', '').replace(/^(item|ability|move): /, '') : ''; };
    let throwsLeft = 2;

    // One log line -> animation + narration. Unknown lines are skipped.
    async function handle(line) {
      const parts = line.split('|');
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
          const p = parseIdent(parts[2]);
          if (p.side === 'p2' && throwsLeft > 0) { throwsLeft -= 1; await throwCapsule(p.pos); }
          placeMon(parts[2], parts[3], parts[4]);
          A.play('select');
          anim(p.pos, 'is-entering', 400);
          await say(p.side === 'p1' ? `Go! ${p.name}!` : `${CHAMP.short} sent out ${p.name}!`, 450);
          break;
        }
        case 'detailschange': case '-formechange': {
          const pos = posOf(parts[2]);
          if (slots[pos]) { slots[pos].species = parts[3].split(',')[0]; setSprite(pos, slots[pos].species, parts[3].includes('shiny')); }
          break;
        }
        case '-mega': {
          A.play('mega');
          anim(posOf(parts[2]), 'is-mega', 700);
          await say(`${Display(parts[2])}’s ${parts[4]} is reacting! ${Display(parts[2])} has Mega Evolved!`, 900);
          break;
        }
        case 'move': {
          const pos = posOf(parts[2]);
          if (parts[3] === 'Potion') { await say('You used a Potion!'); break; }
          if (parts[2].startsWith('p2')) stats.renMoves[parts[3]] = (stats.renMoves[parts[3]] || 0) + 1;
          anim(pos, pos.startsWith('p1') ? 'is-lunge-up' : 'is-lunge-down', 260);
          await say(`${Display(parts[2])} used ${parts[3]}!`, 500);
          break;
        }
        case '-damage': {
          const pos = posOf(parts[2]);
          const hp = readHp(parts[3]);
          const src = from(parts);
          if (!src) { A.play('hit'); anim(pos, 'is-hit', 420); }
          drawHp(pos, hp);
          await sleep(src ? 200 : 450);
          if (src === 'Recoil') await say(`${Display(parts[2])} is damaged by the recoil!`);
          else if (src === 'Life Orb') await say(`${Display(parts[2])} lost some of its HP!`);
          else if (src === 'psn' || src === 'tox') await say(`${Display(parts[2])} is hurt by poison!`);
          else if (src === 'brn') await say(`${Display(parts[2])} is hurt by its burn!`);
          else if (src) await say(`${Display(parts[2])} is hurt by ${src}!`);
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
            await say(`${CHAMP.short}’s ${p.name} rose again at half strength!`, 800);
            break;
          }
          drawHp(pos, readHp(parts[3]));
          A.play('heal');
          if (src === 'Potion') await say(`${Display(parts[2])}’s HP was restored.`);
          else if (src) await say(`${Display(parts[2])} restored HP using ${src === 'Grassy Terrain' ? 'the Grassy Terrain' : `its ${src}`}!`, 450);
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
          await say(`${Display(parts[2])} fainted!`, 700);
          if (slots[pos]) slots[pos].box.hidden = true;
          break;
        }
        case '-supereffective': A.play('superHit'); await say('It’s super effective!'); break;
        case '-resisted': await say('It’s not very effective…'); break;
        case '-immune': await say(`It doesn’t affect ${display(parts[2])}…`); break;
        case '-crit': await say('A critical hit!'); break;
        case '-miss': await say(`${Display(parts[3] || parts[2])} avoided the attack!`); break;
        case '-fail': await say(parts[3] === 'move: Potion' ? (line.includes('full HP') ? 'It won’t have any effect.' : 'The bag is empty!') : 'But it failed!'); break;
        case '-hitcount': await say(`The Pokémon was hit ${parts[3]} time${parts[3] === '1' ? '' : 's'}!`); break;
        case '-boost': case '-unboost': {
          const n = Number(parts[4]);
          const how = n >= 3 ? ' drastically' : n === 2 ? ' sharply' : '';
          await say(`${Display(parts[2])}’s ${STAT[parts[3]] || parts[3]} ${cmd === '-boost' ? 'rose' : 'fell'}${how}!`, 450);
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
          await say(parts[3] === 'slp' ? `${Display(parts[2])} woke up!` : `${Display(parts[2])} was cured!`, 450);
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
          else if (/confusion/.test(parts[3])) await say(`${Display(parts[2])} is confused!`, 450);
          break;
        }
        case '-singleturn': if (/Protect|Detect/.test(parts[3])) await say(`${Display(parts[2])} protected itself!`, 450); break;
        case '-enditem': {
          if (parts[3] === 'Focus Sash') await say(`${Display(parts[2])} hung on using its Focus Sash!`);
          else if (line.includes('[eat]')) await say(`${Display(parts[2])} ate its ${parts[3]}!`, 450);
          break;
        }
        case '-ability': await say(`[${Display(parts[2])}’s ${parts[3]}]`, 450); break;
        case '-fieldstart': await say(/Grassy/.test(parts[2]) ? 'Grass grew to cover the battlefield!' : /Electric/.test(parts[2]) ? 'An electric current ran across the battlefield!' : /Psychic/.test(parts[2]) ? 'The battlefield got weird!' : /Misty/.test(parts[2]) ? 'Mist swirled around the battlefield!' : /Trick Room/.test(parts[2]) ? 'The dimensions were twisted!' : `${parts[2].replace('move: ', '')} began!`, 450); break;
        case '-fieldend': await say(`${parts[2].replace('move: ', '')} ended.`, 400); break;
        case '-weather': if (parts[2] !== 'none' && !line.includes('[upkeep]')) await say(`The weather became ${parts[2].replace('RainDance', 'rain').replace('SunnyDay', 'harsh sunlight').replace('Sandstorm', 'a sandstorm').replace('Snowscape', 'snow')}!`, 450); break;
        case '-sidestart': await say(`${parts[3].replace('move: ', '')} started on ${parts[2].startsWith('p1') ? 'your' : 'Ren’s'} side!`, 450); break;
        case '-sideend': await say(`${parts[3].replace('move: ', '')} ended on ${parts[2].startsWith('p1') ? 'your' : 'Ren’s'} side.`, 400); break;
        case '-start': if (parts[3] === 'confusion') await say(`${Display(parts[2])} became confused!`); break;
        case 'vr-chaos': await say('Chaotic replacement! Your next Pokémon was picked at random.'); break;
        case 'turn': stats.turns = Number(parts[2]); turnEl.textContent = `Turn ${parts[2]}`; textEl.textContent = ''; break;
        default: break;
      }
    }

    let queue = Promise.resolve();
    const playLines = (lines) => { queue = queue.then(async () => { for (const l of lines) { if (disposed) return; await handle(l); } if (mods.taunts && lines.length) flushTaunt(); }); return queue; };

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
          return menuButton([img, h('span', { text: label }), h('span', { class: 'tvb-pick-n', text: n >= 0 ? (n < 2 ? `Lead ${n + 1}` : `Back ${n - 1}`) : '' })], () => {
            const at = picks.indexOf(i + 1);
            if (at >= 0) picks.splice(at, 1); else if (picks.length < need) picks.push(i + 1);
            render();
            menu.querySelectorAll('.tvb-pickmon')[i]?.focus();
          }, { class: 'tvb-cmd tvb-pickmon', 'aria-pressed': String(n >= 0), 'aria-label': `${label}${n >= 0 ? `, picked ${n + 1}` : ''}` });
        });
        const confirm = menuButton(picks.length === need ? 'Confirm ▸' : `Pick ${need - picks.length} more`, () => { A.play('confirm'); send(`team ${picks.join('')}`); }, { class: 'tvb-cmd tvb-cmd--go' });
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

    // ----- championship escalation: a 38 s timeline on the audio clock -----
    // Visual cues and the revival are scheduled against one clock: the AudioContext's when audio is
    // running (so the unlock lands on the musical drop), otherwise a performance clock that only
    // advances while the tab is visible. Background tabs pause both. Skip seeks to the cue and runs
    // the same once-only revival; reduced motion keeps the timeline but drops the movement.
    function runEscalation(id) {
      return new Promise((resolve) => {
        stats.escalated = true;
        clearMenu();
        backAction = null;
        highlight('');
        A.music.stop();
        const layer = h('div', { class: 'tvb-esc', role: 'group', 'aria-label': 'Championship moment' });
        const crowd = h('div', { class: 'tvb-esc-crowd', 'aria-hidden': 'true' });
        crowd.innerHTML = ART.crowd(seedFor(id));
        const champ = h('div', { class: 'tvb-esc-champ', 'aria-hidden': 'true' });
        champ.innerHTML = ART.champion('tvb-esc-art');
        const line = h('p', { class: 'tvb-esc-line', 'aria-live': 'polite' });
        const progress = h('span', { class: 'tvb-esc-progress', 'aria-hidden': 'true' }, h('span'));
        const skipBtn = h('button', { type: 'button', class: 'tvb-btn tvb-esc-skip', onclick: () => seekEnd(true) }, 'Skip ▸▸');
        layer.append(h('div', { class: 'tvb-esc-lights', 'aria-hidden': 'true' }), crowd, h('div', { class: 'tvb-esc-fire', 'aria-hidden': 'true' }), champ, h('div', { class: 'tvb-esc-flash', 'aria-hidden': 'true' }), h('div', { class: 'tvb-esc-dialog' }, h('span', { class: 'tvb-esc-who', text: CHAMP.short }), line), progress, skipBtn);
        frame.append(layer);
        menu.append(h('p', { class: 'tvb-dim', text: 'The arena is changing… (Skip to continue)' }));
        skipBtn.focus();
        const cues = [
          [0, () => layer.classList.add('is-on')],
          ...ESC_LINES.map(([t, text]) => [t, () => { line.textContent = text; liveEl.textContent = `${CHAMP.short}: ${text}`; }]),
          [10, () => layer.classList.add('is-arena')],
          [14, () => { layer.classList.add('is-crowd'); A.crowd.start(0.3); }],
          [18, () => A.crowd.start(0.6)],
          [22, () => layer.classList.add('is-fire')],
          [30, () => { layer.classList.add('is-charge'); A.crowd.start(0.9); line.textContent = `${CHAMP.short} raises a capsule. The crowd is on its feet.`; }],
          [36, () => layer.classList.add('is-flash')]
        ].sort((a, b) => a[0] - b[0]);
        let next = 0;
        // The clock.
        const audioT0 = A.running() ? A.now() + 0.15 : null;
        const score = audioT0 != null ? A.escalationScore(audioT0) : false;
        let perfElapsed = 0;
        let perfLast = performance.now();
        const now = () => {
          if (score) { const t = A.now(); return t == null ? lastT : t - audioT0; }
          const p = performance.now();
          if (!document.hidden) perfElapsed += (p - perfLast) / 1000;
          perfLast = p;
          return perfElapsed;
        };
        let lastT = 0;
        let raf = 0;
        let finished = false;
        const fireCues = (t) => { while (next < cues.length && cues[next][0] <= t) { cues[next][1](); next += 1; } };
        function finish(skipped) {
          if (finished) return;
          finished = true;
          window.cancelAnimationFrame(raf);
          fireCues(CUE);
          const audioNow = A.now();
          if (skipped && score) { score.cancel(); A.dropHit(audioNow); A.music.start('finale', audioNow); }
          else if (score) A.music.start('finale', audioT0 + CUE);
          else { A.dropHit(); A.music.start('finale'); }
          // Measured audiovisual offset: how far the unlock frame is from the scheduled drop (audio
          // clock), plus the context's reported output latency. Recorded for the build notes.
          G.lastSync = score && !skipped && audioNow != null ? { offsetMs: Math.round((audioNow - (audioT0 + CUE)) * 1000), outputLatencyMs: Math.round(A.outputLatency() * 1000) } : { skipped: !!skipped, clock: score ? 'audio' : 'performance' };
          A.crowd.start(0.5);
          layer.classList.add('is-done');
          const t = window.setTimeout(() => layer.remove(), reduced ? 0 : 900);
          timers.add(t);
          cinematic = null;
          if (worker && !disposed) worker.postMessage({ t: 'resume', battleId, id });
          resolve();
        }
        function seekEnd(skipped) { A.play('select'); finish(skipped); }
        function tick() {
          if (disposed) return;
          const t = now();
          lastT = t;
          fireCues(t);
          progress.firstChild.style.width = `${Math.min(100, (t / CUE) * 100).toFixed(1)}%`;
          if (t >= CUE) { finish(false); return; }
          raf = window.requestAnimationFrame(tick);
        }
        // rAF stops in background tabs; a timer catches the cue there only if the clock is moving.
        cinematic = { skip: () => seekEnd(true), cancel: () => { finished = true; window.cancelAnimationFrame(raf); if (score) score.cancel(); } };
        tick();
      });
    }
    const seedFor = (s) => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };

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
      await say(won ? `You defeated ${CHAMP.name}! ${G.name} is the very best!` : `You lost to ${CHAMP.name}…`, 900);
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
      timers.forEach((t) => window.clearTimeout(t));
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
      const loadout = C.battleLoadout(G.cat, G.draft, seed, { movepools: pools });
      trainer.hidden = false;
      trainerLabel.hidden = false;
      if (!reduced) trainer.classList.add('is-arriving');
      await say(`${CHAMP.name} would like to battle!`, 1100);
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
        else if (msg.t === 'escalation') playLines([]).then(() => { if (!disposed && !ended) runEscalation(msg.id); });
        else if (msg.t === 'end') finish(msg.winner, msg.champion);
        else if (msg.t === 'invalid') stopped(`Your team can’t battle: ${msg.message}`);
        else if (msg.t === 'fatal') stopped('The battle engine hit an error.');
      };
      worker.postMessage({ t: 'start', battleId, config: { seed, player: { team: loadout.sets }, rules } });
    })();
  };
}());

// Victory Road battle screen (Phase 2+). Runs inside the setup window: "Enter battle" hides the
// setup and mounts this view; Exit puts the setup back. The battle itself runs in a Web Worker
// (/vr/vr-engine.js: Pokémon Showdown's simulator + the champion AI); this file only draws what
// the engine reports for the player's side and sends the player's choices back.
//
// Nothing here persists: a reload, Exit or closing the window ends the battle for good.
(function () {
  'use strict';

  const C = window.VRCore;
  const VR = window.VictoryRoad;
  const ENGINE_URL = '/vr/vr-engine.js?v=1';
  const CHAMP = { name: 'Takuma Yamazaki', short: 'Takuma', label: 'Takuma Yamazaki · Japan · 2026 VGC Masters World Champion' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = (ms) => new Promise((r) => window.setTimeout(r, reduceMotion.matches ? Math.min(ms, 60) : ms));
  const toId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const h = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    kids.flat().forEach((kid) => { if (kid != null) node.append(kid); });
    return node;
  };

  // ---------- Original sound set (synthesised; no recordings) ----------
  const Sound = (() => {
    let ctx = null;
    let muted = false;
    try { muted = window.localStorage.getItem('pdosVrMuted') === '1'; } catch (_) { /* private mode */ }
    const ensure = () => {
      if (muted) return null;
      if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) => {
      const a = ensure();
      if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol = 0.08) => {
      const a = ensure();
      if (!a) return;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const s = a.createBufferSource();
      const g = a.createGain();
      g.gain.value = vol;
      s.buffer = buf;
      s.connect(g).connect(a.destination);
      s.start();
    };
    const fx = {
      select: () => tone(880, 0.05, { vol: 0.04 }),
      confirm: () => { tone(660, 0.06); tone(990, 0.08, { delay: 0.06 }); },
      back: () => tone(440, 0.06, { slide: -120, vol: 0.04 }),
      hit: () => { noise(0.12, 0.09); tone(160, 0.1, { type: 'triangle', slide: -80 }); },
      superHit: () => { noise(0.18, 0.12); tone(220, 0.16, { type: 'sawtooth', slide: -150, vol: 0.05 }); },
      weakHit: () => noise(0.07, 0.05),
      faint: () => tone(520, 0.5, { type: 'triangle', slide: -460, vol: 0.07 }),
      heal: () => [523, 659, 784].forEach((f, i) => tone(f, 0.09, { type: 'triangle', delay: i * 0.08 })),
      mega: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { delay: i * 0.07 })),
      boot: () => [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.14, { type: 'square', delay: i * 0.09, vol: 0.05 })),
      win: () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { delay: i * 0.13 })),
      lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.28, { type: 'triangle', delay: i * 0.24 }))
    };
    document.addEventListener('visibilitychange', () => { if (ctx && document.hidden) ctx.suspend(); });
    return {
      play: (name) => { try { fx[name] && fx[name](); } catch (_) { /* audio is optional */ } },
      get muted() { return muted; },
      setMuted(on) {
        muted = on;
        try { window.localStorage.setItem('pdosVrMuted', on ? '1' : '0'); } catch (_) { /* private mode */ }
        if (on && ctx) ctx.suspend();
      },
      close() { if (ctx) { ctx.close(); ctx = null; } }
    };
  })();

  // ---------- The champion's avatar: an original, non-photographic pixel figure ----------
  const AVATAR = [
    '.....KKKKKK.....', '....KKKKKKKK....', '...KKKKKKKKKK...', '...KKSSSSSSKK...', '...KSSKSSKSSK...', '...KSSSSSSSSK...',
    '....SSSMMSSS....', '.....SSSSSS.....', '...NNNNWWNNNN...', '..NNNNNWWNNNNN..', '..NNYNNWWNNYNN..', '..NNNNNGGNNNNN..',
    '..NNNNNGGNNNNN..', '..SSNNNNNNNNSS..', '..SS.NNNNNN.SS..', '.....DDDDDD.....', '.....DD..DD.....', '.....DD..DD.....', '....KKK..KKK....'
  ];
  const AVATAR_COL = { K: '#1b1b22', S: '#e8b98f', M: '#b56b55', N: '#1f2a52', W: '#f4f3ef', Y: '#f7c947', G: '#f7c947', D: '#2b2b33' };
  function avatarSvg() {
    const cells = [];
    AVATAR.forEach((row, y) => row.split('').forEach((c, x) => { if (AVATAR_COL[c]) cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${AVATAR_COL[c]}"/>`); }));
    return `<svg viewBox="0 0 16 19" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${cells.join('')}</svg>`;
  }

  // ---------- Sets ----------
  let setsPromise = null;
  const loadSets = () => {
    if (!setsPromise) setsPromise = fetch('/vr/sets.json?v=1').then((r) => { if (!r.ok) throw new Error('sets'); return r.json(); }).catch((e) => { setsPromise = null; throw e; });
    return setsPromise;
  };

  // ---------- Battle view ----------
  function start(detail, root) {
    const dex = VR.getDex();
    const mods = detail.mods;
    const mult = C.multiplier(mods);
    const rules = C.engineRules(mods);
    let worker = null;
    let ended = false;
    let disposed = false;
    const timers = new Set();

    root.classList.add('is-battling');
    const screen = h('div', { class: 'vr-battle', role: 'region', 'aria-label': 'Victory Road battle' });
    const live = h('p', { class: 'vr-sr-only', 'aria-live': 'polite' });
    const bar = h('div', { class: 'vr-battle-bar' },
      h('span', { class: 'vr-battle-mult', text: `×${mult.toFixed(2)} · ${C.tier(mult)} tier` }),
      h('span', { class: 'vr-battle-tools' },
        h('button', { type: 'button', class: 'vr-tool', 'aria-pressed': String(Sound.muted), text: Sound.muted ? 'Sound off' : 'Sound on', onclick: (e) => { Sound.setMuted(!Sound.muted); e.currentTarget.textContent = Sound.muted ? 'Sound off' : 'Sound on'; e.currentTarget.setAttribute('aria-pressed', String(Sound.muted)); } }),
        h('button', { type: 'button', class: 'vr-tool', text: 'Exit battle', onclick: () => exit() })));
    const stage = h('div', { class: 'vr-stage' });
    const textbox = h('div', { class: 'vr-textbox' }, h('p', { class: 'vr-text' }));
    const menu = h('div', { class: 'vr-menu' });
    screen.append(bar, h('div', { class: 'vr-frame' }, stage, textbox), menu, live,
      h('p', { class: 'vr-disclaimer', text: 'Unofficial fan project, not affiliated with or endorsed by Nintendo, Game Freak, Creatures, The Pokémon Company or Takuma Yamazaki. The champion’s team is his official 2026 Worlds team sheet; stat spreads are a community reconstruction and the AI is a heuristic, not his play.' }));
    root.append(screen);
    const textEl = textbox.querySelector('.vr-text');

    // ----- message box -----
    let skip = null;
    const advance = () => { if (skip) skip(); };
    screen.addEventListener('click', (e) => { if (!e.target.closest('button')) advance(); });
    const onKey = (e) => {
      if (disposed) return;
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, input')) { e.preventDefault(); advance(); }
    };
    document.addEventListener('keydown', onKey);
    async function say(text, hold = 650) {
      if (disposed || !text) return;
      live.textContent = text;
      textEl.textContent = '';
      let done = false;
      await new Promise((resolve) => {
        skip = () => { done = true; textEl.textContent = text; };
        if (reduceMotion.matches) { textEl.textContent = text; resolve(); return; }
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
      await new Promise((resolve) => {
        if (disposed) return resolve();
        const t = window.setTimeout(resolve, done ? 120 : hold);
        timers.add(t);
        skip = () => { window.clearTimeout(t); resolve(); };
      });
      skip = null;
    }

    // ----- arena -----
    const slots = {};
    ['p2a', 'p2b', 'p1a', 'p1b'].forEach((pos) => {
      const sprite = h('img', { class: 'vr-mon-sprite', alt: '', width: 96, height: 96, decoding: 'async' });
      const name = h('span', { class: 'vr-hp-name' });
      const lvl = h('span', { class: 'vr-hp-lv' });
      const fill = h('span', { class: 'vr-hp-fill' });
      const nums = h('span', { class: 'vr-hp-nums' });
      const status = h('span', { class: 'vr-hp-status' });
      const box = h('div', { class: 'vr-hpbox', hidden: true },
        h('div', { class: 'vr-hp-top' }, name, lvl),
        h('div', { class: 'vr-hp-row' }, h('span', { class: 'vr-hp-label', text: 'HP' }), h('span', { class: 'vr-hp-bar' }, fill)),
        h('div', { class: 'vr-hp-bottom' }, status, nums));
      const spot = h('div', { class: `vr-spot vr-spot--${pos}` }, h('span', { class: 'vr-platform', 'aria-hidden': 'true' }), sprite);
      stage.append(spot, h('div', { class: `vr-hpslot vr-hpslot--${pos}` }, box));
      slots[pos] = { sprite, name, lvl, fill, nums, status, box, spot, ident: '', species: '', hp: 0, max: 0 };
    });
    const trainer = h('div', { class: 'vr-trainer', hidden: true });
    trainer.innerHTML = avatarSvg();
    const trainerLabel = h('p', { class: 'vr-trainer-label', text: CHAMP.label, hidden: true });
    stage.append(trainer, trainerLabel);

    const entryOf = (species) => dex.byId[toId(species)] || dex.byId[toId(String(species).split('-')[0])] || null;
    const shinyKinds = new Set();
    function setSprite(pos, species, shiny) {
      const s = slots[pos];
      const entry = entryOf(species);
      const kind = pos.startsWith('p1') ? (shiny ? 'back-shiny' : 'back') : (shiny ? 'shiny' : 'front');
      const url = entry ? VR.spriteUrl(entry, kind) : '';
      s.sprite.classList.remove('is-missing', 'is-fainted');
      if (url) s.sprite.src = url; else { s.sprite.removeAttribute('src'); s.sprite.classList.add('is-missing'); }
      s.sprite.onerror = () => { s.sprite.removeAttribute('src'); s.sprite.classList.add('is-missing'); };
    }
    const parseIdent = (ident) => { const m = /^(p\d)([ab])?: (.*)$/.exec(ident || ''); return m ? { side: m[1], pos: m[2] ? m[1] + m[2] : '', name: m[3] } : { side: '', pos: '', name: ident }; };
    const display = (ident) => { const p = parseIdent(ident); return p.side === 'p2' ? `the opposing ${p.name}` : p.name; };
    const Display = (ident) => { const t = display(ident); return t.charAt(0).toUpperCase() + t.slice(1); };
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
      s.fill.style.transition = animate && !reduceMotion.matches ? '' : 'none';
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
      const level = (rest.find((x) => /^L\d+/.test(x)) || 'L50').slice(1);
      const gender = rest.includes('M') ? ' ♂' : rest.includes('F') ? ' ♀' : '';
      s.ident = ident.replace(/^(p\d)[ab]:/, '$1:');
      s.species = species;
      s.name.textContent = p.name + gender;
      s.lvl.textContent = `Lv${level}`;
      s.box.hidden = false;
      setSprite(p.pos, species, rest.includes('shiny'));
      drawHp(p.pos, readHp(hpText), false);
    }
    const posOf = (ident) => parseIdent(ident).pos;

    async function anim(pos, cls, ms) {
      const el = slots[pos] && slots[pos].spot;
      if (!el || reduceMotion.matches) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      await sleep(ms);
      el.classList.remove(cls);
    }

    const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
    const STATUS = { brn: 'was burned', par: 'is paralyzed! It may be unable to move', slp: 'fell asleep', psn: 'was poisoned', tox: 'was badly poisoned', frz: 'was frozen solid' };
    const from = (parts) => { const f = parts.find((x) => x && x.startsWith('[from]')); return f ? f.replace('[from] ', '').replace(/^(item|ability|move): /, '') : ''; };

    // One log line -> animation + narration. Unknown lines are skipped.
    async function handle(line) {
      const parts = line.split('|');
      const cmd = parts[1];
      switch (cmd) {
        case 'switch': case 'drag': case 'replace': {
          const p = parseIdent(parts[2]);
          placeMon(parts[2], parts[3], parts[4]);
          Sound.play('select');
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
          Sound.play('mega');
          anim(posOf(parts[2]), 'is-mega', 700);
          await say(`${Display(parts[2])}’s ${parts[4]} is reacting! ${Display(parts[2])} has Mega Evolved!`, 900);
          break;
        }
        case 'move': {
          const pos = posOf(parts[2]);
          if (parts[3] === 'Potion') { await say(`You used a Potion!`); break; }
          anim(pos, pos.startsWith('p1') ? 'is-lunge-up' : 'is-lunge-down', 260);
          await say(`${Display(parts[2])} used ${parts[3]}!`, 500);
          break;
        }
        case '-damage': {
          const pos = posOf(parts[2]);
          const hp = readHp(parts[3]);
          const src = from(parts);
          if (!src) { Sound.play('hit'); anim(pos, 'is-hit', 420); }
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
          drawHp(pos, readHp(parts[3]));
          Sound.play('heal');
          const src = from(parts);
          if (src === 'Potion') await say(`${Display(parts[2])}’s HP was restored.`);
          else if (src) await say(`${Display(parts[2])} restored HP using ${src === 'Grassy Terrain' ? 'the Grassy Terrain' : `its ${src}`}!`, 450);
          break;
        }
        case '-sethp': drawHp(posOf(parts[2]), readHp(parts[3])); break;
        case 'faint': {
          const pos = posOf(parts[2]);
          Sound.play('faint');
          if (slots[pos]) { slots[pos].sprite.classList.add('is-fainted'); drawHp(pos, { cur: 0, max: slots[pos].max, pct: 0, status: '' }); }
          await say(`${Display(parts[2])} fainted!`, 700);
          if (slots[pos]) slots[pos].box.hidden = true;
          break;
        }
        case '-supereffective': Sound.play('superHit'); await say('It’s super effective!'); break;
        case '-resisted': await say('It’s not very effective…'); break;
        case '-immune': await say(`It doesn’t affect ${display(parts[2])}…`); break;
        case '-crit': await say('A critical hit!'); break;
        case '-miss': await say(`${Display(parts[3] || parts[2])} avoided the attack!`); break;
        case '-fail': await say(parts[3] === 'move: Potion' ? (line.includes('full HP') ? 'It won’t have any effect.' : 'The bag is empty!') : 'But it failed!'); break;
        case '-hitcount': await say(`The Pokémon was hit ${parts[3]} time${parts[3] === '1' ? '' : 's'}!`); break;
        case '-boost': case '-unboost': {
          const n = Number(parts[4]);
          const how = n >= 3 ? ' drastically' : n === 2 ? ' sharply' : '';
          await say(`${Display(parts[2])}’s ${STAT[parts[3]] || parts[3]} ${cmd === '-boost' ? 'rose' : 'fell'}${n >= 3 && cmd === '-boost' ? ' drastically' : how}!`, 450);
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
        case '-sidestart': await say(`${parts[3].replace('move: ', '')} started on ${parts[2].startsWith('p1') ? 'your' : 'the opposing'} side!`, 450); break;
        case '-sideend': await say(`${parts[3].replace('move: ', '')} ended on ${parts[2].startsWith('p1') ? 'your' : 'the opposing'} side.`, 400); break;
        case '-start': if (parts[3] === 'confusion') await say(`${Display(parts[2])} became confused!`); break;
        case 'vr-chaos': await say('Chaotic replacement! Your next Pokémon was picked at random.'); break;
        case 'turn': textEl.textContent = ''; break;
        default: break;
      }
    }

    let queue = Promise.resolve();
    const playLines = (lines) => { queue = queue.then(async () => { for (const l of lines) { if (disposed) return; await handle(l); } }); return queue; };

    // ----- menus -----
    const clearMenu = () => menu.replaceChildren();
    function menuButton(label, onClick, attrs = {}) {
      return h('button', { type: 'button', class: 'vr-cmd', ...attrs, onclick: (e) => { Sound.play(attrs['data-back'] ? 'back' : 'select'); onClick(e); } }, ...[].concat(label));
    }
    function showMenu(title, buttons, cols = 2) {
      clearMenu();
      menu.append(h('p', { class: 'vr-menu-title', text: title }), h('div', { class: `vr-menu-grid vr-menu-grid--${cols}`, role: 'group', 'aria-label': title }, buttons));
      const first = menu.querySelector('button:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }

    // Team preview: pick four, in order; the first two lead.
    function teamPreview(req) {
      const picks = [];
      const mons = req.side.pokemon;
      const foes = previewFoes.slice();
      const render = () => {
        const buttons = mons.map((p, i) => {
          const species = p.details.split(',')[0];
          const entry = entryOf(species);
          const n = picks.indexOf(i + 1);
          const img = h('img', { class: 'vr-sprite', alt: '', width: 96, height: 96, src: entry ? VR.spriteUrl(entry, p.details.includes('shiny') ? 'shiny' : 'front') : null });
          return menuButton([img, h('span', { text: p.ident.replace(/^p1: /, '') }), h('span', { class: 'vr-pick-n', text: n >= 0 ? (n < 2 ? `Lead ${n + 1}` : `Back ${n - 1}`) : '' })], () => {
            const at = picks.indexOf(i + 1);
            if (at >= 0) picks.splice(at, 1); else if (picks.length < 4) picks.push(i + 1);
            render();
            menu.querySelectorAll('.vr-pick')[i]?.focus();
          }, { class: 'vr-cmd vr-pick', 'aria-pressed': String(n >= 0), 'aria-label': `${p.ident.replace(/^p1: /, '')}${n >= 0 ? `, picked ${n + 1}` : ''}` });
        });
        const confirm = menuButton(picks.length === 4 ? 'Confirm team ▸' : `Pick ${4 - picks.length} more`, () => { Sound.play('confirm'); send(`team ${picks.join('')}`); }, { class: 'vr-cmd vr-cmd--go' });
        confirm.disabled = picks.length !== 4;
        clearMenu();
        menu.append(
          h('p', { class: 'vr-menu-title', text: 'Team preview: bring four. The first two you pick lead.' }),
          h('p', { class: 'vr-preview-foes', text: `${CHAMP.short} brought: ${foes.join(', ')}` }),
          h('div', { class: 'vr-menu-grid vr-menu-grid--3 vr-preview', role: 'group', 'aria-label': 'Your team' }, buttons),
          h('div', { class: 'vr-menu-foot' }, confirm));
      };
      render();
      menu.querySelector('.vr-pick')?.focus({ preventScroll: true });
    }

    function targetsFor(move, slot, req) {
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

    // Player's turn: one command per active slot, then submit together.
    function command(req) {
      const choices = [];
      const actives = req.side.pokemon.filter((p) => p.active);
      let megaTaken = false;
      const next = (slot) => {
        if (slot >= req.active.length) { send(choices.join(', ')); return; }
        const act = req.active[slot];
        const mon = actives[slot];
        if (!mon || mon.condition.endsWith(' fnt') || act.commanding) { choices[slot] = 'pass'; next(slot + 1); return; }
        const name = mon.ident.replace(/^p1: /, '');
        const back = slot > 0 ? () => { choices.length = slot - 1; megaTaken = choices.some((c) => / mega$/.test(c)); next(slot - 1); } : null;
        const top = () => {
          const potions = req.vr ? req.vr.potions : 0;
          const canSwitch = !act.trapped && !(req.vr && req.vr.noSwitch) && req.side.pokemon.some((p) => !p.active && !p.condition.endsWith(' fnt'));
          const buttons = [
            menuButton('Fight', () => fight()),
            menuButton(`Bag${potions ? ` (${potions})` : ''}`, () => bag(), { disabled: !potions }),
            menuButton('Pokémon', () => party(), { disabled: !canSwitch }),
            back ? menuButton('Back', back, { 'data-back': '1' }) : menuButton('Forfeit', () => forfeit(), { 'data-back': '1' })
          ];
          showMenu(`What will ${name} do?`, buttons);
        };
        const pickTarget = (label, list, done) => {
          if (!list) return done('');
          if (list.length === 1) return done(` ${list[0].loc}`);
          showMenu(`${label}: choose a target`, [...list.map((x) => menuButton(slots[x.pos].name.textContent + (x.pos.startsWith('p1') ? (x.loc === -(slot + 1) ? ' (self)' : ' (partner)') : ''), () => done(` ${x.loc}`))), menuButton('Back', () => top(), { 'data-back': '1' })]);
        };
        const fight = () => {
          let mega = false;
          const moves = act.moves.map((m, i) => ({ ...m, n: i + 1 })).filter((m) => m.id !== 'potion');
          const render = () => {
            const buttons = moves.map((m) => {
              const info = { type: ((req.vr && req.vr.moveTypes) || {})[m.id] || '' };
              return menuButton([h('span', { class: 'vr-move-name', text: m.move }), h('span', { class: 'vr-move-meta', text: `${info ? info.type : ''}${m.pp != null ? ` · PP ${m.pp}/${m.maxpp}` : ''}` })], () => {
                pickTarget(m.move, targetsFor(m, slot, req), (tgt) => {
                  choices[slot] = `move ${m.n}${tgt}${mega ? ' mega' : ''}`;
                  if (mega) megaTaken = true;
                  next(slot + 1);
                });
              }, { disabled: m.disabled || m.pp === 0, class: 'vr-cmd vr-move', 'data-type': info.type });
            });
            if (act.canMegaEvo && !megaTaken) buttons.push(menuButton(mega ? 'Mega Evolution: ON' : 'Mega Evolve', () => { mega = !mega; render(); }, { class: 'vr-cmd vr-cmd--mega', 'aria-pressed': String(mega) }));
            buttons.push(menuButton('Back', () => top(), { 'data-back': '1' }));
            showMenu(`${name}: choose a move`, buttons);
          };
          render();
        };
        const bag = () => {
          const slotN = act.moves.findIndex((m) => m.id === 'potion') + 1;
          showMenu(`Bag: ${req.vr.potions} Potion${req.vr.potions === 1 ? '' : 's'} (restores half of max HP)`, [
            menuButton('Use Potion', () => pickTarget('Potion', targetsFor({ target: 'adjacentAllyOrSelf' }, slot, req), (tgt) => { choices[slot] = `move ${slotN}${tgt}`; next(slot + 1); }), { disabled: !slotN }),
            menuButton('Back', () => top(), { 'data-back': '1' })
          ]);
        };
        const party = () => {
          const taken = choices.filter((c) => /^switch /.test(c)).map((c) => Number(c.split(' ')[1]));
          const buttons = req.side.pokemon.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => !p.active).map(({ p, n }) => {
            const hp = readHp(p.condition);
            return menuButton(`${p.ident.replace(/^p1: /, '')} · ${hp.status === 'fnt' ? 'fainted' : `${hp.cur}/${hp.max}`}`, () => { choices[slot] = `switch ${n}`; next(slot + 1); }, { disabled: hp.status === 'fnt' || taken.includes(n) });
          });
          buttons.push(menuButton('Back', () => top(), { 'data-back': '1' }));
          showMenu(`Switch ${name} for…`, buttons);
        };
        top();
      };
      next(0);
    }

    function forcedSwitch(req) {
      const choices = [];
      const taken = new Set();
      const next = (slot) => {
        if (slot >= req.forceSwitch.length) { send(choices.join(', ')); return; }
        if (!req.forceSwitch[slot]) { choices[slot] = 'pass'; next(slot + 1); return; }
        const bench = req.side.pokemon.map((p, i) => ({ p, n: i + 1 })).filter(({ p, n }) => !p.active && !p.condition.endsWith(' fnt') && !taken.has(n));
        if (!bench.length) { choices[slot] = 'pass'; next(slot + 1); return; }
        showMenu('Choose your next Pokémon', bench.map(({ p, n }) => menuButton(`${p.ident.replace(/^p1: /, '')} · ${p.condition}`, () => { taken.add(n); choices[slot] = `switch ${n}`; next(slot + 1); })));
      };
      next(0);
    }

    function forfeit() {
      showMenu('Forfeit the battle?', [menuButton('Yes, forfeit', () => finish('p2', true)), menuButton('Keep battling', () => command(lastRequest), { 'data-back': '1' })]);
    }

    // ----- engine plumbing -----
    let lastRequest = null;
    let previewFoes = [];
    function send(choice) {
      clearMenu();
      if (!worker || ended) return;
      worker.postMessage({ t: 'choose', choice });
    }
    function onRequest(req) {
      lastRequest = req;
      playLines([]).then(() => {
        if (disposed || ended) return;
        if (req.wait) return;
        if (req.teamPreview) { textEl.textContent = 'Choose four Pokémon to bring.'; teamPreview(req); return; }
        if (req.forceSwitch) { forcedSwitch(req); return; }
        textEl.textContent = '';
        command(req);
      });
    }
    async function finish(winner, forfeited) {
      if (ended) return;
      ended = true;
      await playLines([]);
      if (disposed) return;
      clearMenu();
      const won = winner === 'p1';
      Sound.play(won ? 'win' : 'lose');
      screen.classList.add(won ? 'is-won' : 'is-lost');
      await say(won ? `You defeated ${CHAMP.name}!` : forfeited ? 'You forfeited the battle.' : `You lost to ${CHAMP.name}…`, 900);
      showMenu(won ? `Victory! Reward ×${mult.toFixed(2)} · ${C.tier(mult)} tier` : 'Defeat. Your setup is saved: try again?', [
        menuButton('Battle again', () => { dispose(); start(detail, root); }, { class: 'vr-cmd vr-cmd--go' }),
        menuButton('Back to setup', () => exit(), { 'data-back': '1' })
      ]);
      if (worker) { worker.terminate(); worker = null; }
    }

    function dispose() {
      disposed = true;
      skip = null;
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('vr:dispose', dispose);
      if (worker) { worker.terminate(); worker = null; }
      screen.remove();
      root.classList.remove('is-battling');
    }
    function exit() {
      dispose();
      root.querySelector('.pdos-cr-cta')?.focus();
    }
    root.addEventListener('vr:dispose', dispose);

    // ----- boot -> intro -> battle -----
    (async () => {
      const boot = h('div', { class: 'vr-boot', 'aria-hidden': 'true' }, h('span', { class: 'vr-boot-ball' }), h('span', { class: 'vr-boot-title', text: 'VICTORY ROAD' }), h('span', { class: 'vr-boot-sub', text: 'Unofficial fan cartridge · press any key' }));
      stage.append(boot);
      live.textContent = 'Victory Road is loading.';
      Sound.play('boot');
      let sets;
      try {
        [sets] = await Promise.all([loadSets(), sleep(1300)]);
      } catch (_) {
        boot.remove();
        await say('The battle data didn’t load. Exit and try again.');
        showMenu('Couldn’t start the battle', [menuButton('Back to setup', () => exit())]);
        return;
      }
      if (disposed) return;
      boot.remove();
      const team = detail.team.map((id) => C.toSet(dex.byId[id], sets.sets[id], { shiny: mods.shiny }));
      trainer.hidden = false;
      trainerLabel.hidden = false;
      await say(`${CHAMP.name} would like to battle!`, 900);
      if (disposed) return;
      try {
        worker = new Worker(ENGINE_URL);
      } catch (_) {
        await say('Your browser couldn’t start the battle engine.');
        showMenu('Couldn’t start the battle', [menuButton('Back to setup', () => exit())]);
        return;
      }
      worker.onerror = () => { if (!ended) say('The battle engine stopped unexpectedly.').then(() => showMenu('Battle stopped', [menuButton('Back to setup', () => exit())])); };
      worker.onmessage = (event) => {
        const msg = event.data || {};
        if (disposed) return;
        if (msg.t === 'log') {
          const lines = msg.lines;
          lines.forEach((l) => { if (l.startsWith('|poke|p2|')) previewFoes.push(l.split('|')[3].split(',')[0]); });
          if (lines.some((l) => l.startsWith('|switch|') || l.startsWith('|start'))) { trainer.hidden = true; trainerLabel.hidden = true; }
          playLines(lines);
        } else if (msg.t === 'request') onRequest(msg.request);
        else if (msg.t === 'error') playLines([]).then(() => say(msg.message).then(() => lastRequest && onRequest(lastRequest)));
        else if (msg.t === 'end') finish(msg.winner);
        else if (msg.t === 'fatal') say('The battle engine hit an error.').then(() => showMenu('Battle stopped', [menuButton('Back to setup', () => exit())]));
      };
      worker.postMessage({ t: 'start', config: { seed: C.newSeed(), player: { name: 'You', team }, rules } });
    })();
  }

  VR.onEnterBattle = (detail, root) => {
    root.dispatchEvent(new CustomEvent('vr:dispose'));
    start(detail, root);
  };
  VR.disposeBattle = (root) => root.dispatchEvent(new CustomEvent('vr:dispose'));
}());

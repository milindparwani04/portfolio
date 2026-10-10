// The Very Best: the game shell. Everything from Insert cartridge to the result happens inside one
// game screen (#tvbRoot in the cartridge window); the portfolio page around it never hosts game
// controls. This file owns the state machine, the boot, title and name screens, the Settings and
// Credits panels, in-game confirmations, the Escape hierarchy and the window lifecycle.
// vr-setup.js adds the party builder, member editor, modifiers and battle preview; vr-battle.js
// the battle. Pure rules live in vr-core.js (window.VRCore).
//
// States and legal transitions (anything else is refused):
//   closed -> boot -> title -> name -> builder <-> editor, builder/editor <-> modifiers -> preview
//   -> battle (intro, battle, championship escalation, phase two and result live inside it)
//   -> battle (rematch) | builder | title. Preview can also jump back to the builder (Fix party).   Back from any screen goes one level up.
(function () {
  'use strict';

  const C = window.VRCore;
  const A = window.TVBAudio;
  const ART = window.TVBArt;
  const SPRITES = '/assets/vr/sprites';
  const DATA = [
    ['dex', '/vr/dex.json?v=1', 'Pokédex'],
    ['species', '/vr/species.json?v=2', 'species data'],
    ['sets', '/vr/sets.json?v=2', 'default sets'],
    ['learnsets', '/vr/learnsets.json?v=1', 'move catalog'],
    ['items', '/vr/items.json?v=1', 'item catalog']
  ];
  const TRANSITIONS = {
    closed: ['boot'], boot: ['title'], title: ['name'], name: ['title', 'builder'],
    builder: ['title', 'editor', 'modifiers'], editor: ['builder', 'modifiers'], modifiers: ['builder', 'editor', 'preview'],
    preview: ['modifiers', 'battle', 'builder'], battle: ['battle', 'builder', 'title']
  };

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

  // ---------- Shared state ----------
  const G = {
    root: null, state: 'closed', cat: null, draft: null, name: '', screens: {}, onBack: null,
    modal: null, abort: null, raw: {}, savedNote: '', session: 0
  };
  const motion = () => {
    let pref = 'system';
    try { pref = window.localStorage.getItem('pdosTvbMotion') || 'system'; } catch (_) { /* private mode */ }
    return ['system', 'reduce', 'full'].includes(pref) ? pref : 'system';
  };
  const reduced = () => motion() === 'reduce' || (motion() === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const applyMotion = () => { if (G.root) G.root.classList.toggle('is-reduced', reduced()); };

  function save() {
    try { window.localStorage.setItem(C.STORE, C.serialize(G.draft)); G.savedNote = ''; } catch (_) { G.savedNote = 'Your browser isn’t saving: this party lasts until the window closes.'; }
  }

  // ---------- Sprites ----------
  const KIND_INDEX = { front: 0, back: 1, shiny: 2, 'back-shiny': 3 };
  function spriteUrl(entry, kind) {
    const order = { 'back-shiny': ['back-shiny', 'back', 'shiny', 'front'], back: ['back', 'front'], shiny: ['shiny', 'front'], front: ['front'] }[kind];
    for (const k of order) if (entry.has[KIND_INDEX[k]] === '1') return `${SPRITES}/${k}/${entry.id}.png`;
    const base = G.cat.baseByNum[entry.num];
    return base && base !== entry ? spriteUrl(base, kind) : '';
  }
  function sprite(entry, kind, cls, eager) {
    const url = entry ? spriteUrl(entry, kind) : '';
    const img = h('img', { class: cls, src: url || null, alt: '', width: 96, height: 96, loading: eager ? null : 'lazy', decoding: 'async' });
    const fail = () => { img.removeAttribute('src'); img.classList.add('is-missing'); };
    if (!url) fail();
    img.addEventListener('error', fail, { once: true });
    return img;
  }

  // ---------- Type chips ----------
  // One treatment everywhere a Pokémon's or a move's type is shown: the type name as text, with its
  // colour as a bar on the left (the text never sits on the colour, so contrast holds).
  const TYPE_COLOURS = {
    Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#d9b416', Grass: '#5fae3e', Ice: '#6cc8c4', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#c9a75a',
    Flying: '#8f7fd9', Psychic: '#f95587', Bug: '#8d9c1b', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#8a8aa3', Fairy: '#d685ad', Stellar: '#40b5a5'
  };
  const typeChip = (type) => h('span', { class: 'tvb-type', style: `--type:${TYPE_COLOURS[type] || '#777'}`, text: type });
  // A Pokémon's types as a row of chips (both for dual types).
  const typeRow = (types, cls = '') => h('span', { class: `tvb-types ${cls}`.trim() }, (types || []).map(typeChip));

  // ---------- Screen plumbing ----------
  const live = () => G.root.querySelector('.tvb-live');
  function announce(text) {
    const el = live();
    if (!el) return;
    el.textContent = '';
    window.setTimeout(() => { el.textContent = text; }, 30);
  }
  function go(next, arg) {
    if (!(TRANSITIONS[G.state] || []).includes(next)) return false;
    if (!G.screens[next]) return false;
    closeModal();
    unmount();
    const prev = G.state;
    G.state = next;
    G.onBack = null;
    G.root.dataset.state = next;
    const screen = h('div', { class: `tvb-screen tvb-screen--${next}`, 'data-screen': next });
    G.root.querySelector('.tvb-screen')?.replaceWith(screen);
    if (!G.root.querySelector('.tvb-screen')) G.root.prepend(screen);
    if (['title', 'name', 'builder', 'editor', 'modifiers', 'preview'].includes(next) && A.music.wanted !== 'menu') A.music.start('menu');
    G.screens[next](screen, arg, prev);
    return true;
  }
  // A screen with timers or listeners sets G.unmount; it runs when the screen is replaced or closed.
  function unmount() {
    if (G.unmount) { const fn = G.unmount; G.unmount = null; fn(); }
  }
  // Re-renders the current screen (after a reset).
  function refresh() {
    unmount();
    const screen = h('div', { class: `tvb-screen tvb-screen--${G.state}`, 'data-screen': G.state });
    G.root.querySelector('.tvb-screen').replaceWith(screen);
    G.screens[G.state](screen);
  }
  // A screen header: Back, the title, and the Settings button. Back is also what Escape does.
  function header(title, onBack, extra) {
    G.onBack = onBack;
    return h('div', { class: 'tvb-head' },
      onBack ? h('button', { type: 'button', class: 'tvb-btn tvb-btn--back', 'data-back': '', onclick: () => { A.play('back'); onBack(); } }, h('span', { 'aria-hidden': 'true', text: '◂ ' }), 'Back') : h('span'),
      h('h3', { class: 'tvb-head-title', text: title }),
      h('span', { class: 'tvb-head-tools' }, extra || null, h('button', { type: 'button', class: 'tvb-btn tvb-btn--icon', 'aria-label': 'Settings', onclick: () => { A.play('select'); openSettings(); } }, h('span', { 'aria-hidden': 'true', text: '⚙' }))));
  }
  function btn(label, onClick, attrs = {}) {
    return h('button', { type: 'button', class: 'tvb-btn', ...attrs, onclick: (e) => { A.play(attrs['data-sound'] || 'select'); onClick(e); } }, ...[].concat(label));
  }

  // ---------- Modal panels (inside the game screen) ----------
  function openModal(title, body, { onClose, role = 'dialog' } = {}) {
    closeModal();
    const returnTo = document.activeElement;
    const panel = h('div', { class: 'tvb-modal', role, 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'tvb-modal-card' }, h('p', { class: 'tvb-modal-title', text: title }), body));
    G.root.append(panel);
    G.modal = { panel, onClose, returnTo };
    const first = panel.querySelector('button, input, select, [tabindex="0"]');
    if (first) first.focus();
    return panel;
  }
  function closeModal(silent) {
    if (!G.modal) return false;
    const { panel, onClose, returnTo } = G.modal;
    G.modal = null;
    panel.remove();
    if (onClose && !silent) onClose();
    if (returnTo && document.contains(returnTo)) returnTo.focus();
    return true;
  }
  // An in-game yes/no. Resolves true for yes.
  function confirm(title, text, yes, no = 'Cancel') {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; closeModal(true); resolve(v); };
      openModal(title, h('div', {},
        h('p', { class: 'tvb-modal-text', text }),
        h('div', { class: 'tvb-row' }, btn(no, () => finish(false), { 'data-sound': 'back' }), btn(yes, () => finish(true), { class: 'tvb-btn tvb-btn--go' }))),
      { role: 'alertdialog', onClose: () => finish(false) });
      const el = G.modal && G.modal.panel.querySelector('.tvb-btn');
      if (el) el.focus();
    });
  }

  function slider(label, kind) {
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(A.settings[kind] * 100)), 'aria-label': `${label} volume` });
    const out = h('output', { text: `${input.value}%` });
    input.addEventListener('input', () => { A.setLevel(kind, Number(input.value) / 100); out.textContent = `${input.value}%`; });
    input.addEventListener('change', () => { if (kind === 'sfx') A.play('select'); });
    return h('label', { class: 'tvb-setting' }, h('span', { text: label }), input, out);
  }
  function openSettings() {
    const mute = h('button', { type: 'button', class: 'tvb-btn', 'aria-pressed': String(A.settings.muted), text: A.settings.muted ? 'Sound: off' : 'Sound: on' });
    mute.addEventListener('click', () => { A.setMuted(!A.settings.muted); mute.textContent = A.settings.muted ? 'Sound: off' : 'Sound: on'; mute.setAttribute('aria-pressed', String(A.settings.muted)); if (!A.settings.muted) A.play('select'); });
    const motionSel = h('select', { 'aria-label': 'Motion' }, ...[['system', 'Match my system'], ['reduce', 'Reduced'], ['full', 'Full']].map(([v, t]) => h('option', { value: v, text: t, selected: motion() === v })));
    motionSel.addEventListener('change', () => { try { window.localStorage.setItem('pdosTvbMotion', motionSel.value); } catch (_) { /* private mode */ } applyMotion(); A.play('select'); });
    const reset = btn('Reset saved party…', async () => {
      const ok = await confirm('Reset saved party?', 'This clears your party, moves, items and modifiers from this browser. Your trainer name is never stored.', 'Reset', 'Keep it');
      if (!ok) { openSettings(); return; }
      try { window.localStorage.removeItem(C.STORE); C.LEGACY_STORES.forEach((k) => window.localStorage.removeItem(k)); } catch (_) { /* private mode */ }
      G.draft = C.blankDraft();
      announce('Saved party cleared.');
      if (['builder', 'editor', 'modifiers', 'preview'].includes(G.state)) refresh();
      else openSettings();
    });
    openModal('Settings', h('div', { class: 'tvb-settings' },
      h('div', { class: 'tvb-row' }, mute),
      slider('Music', 'music'), slider('Effects', 'sfx'), slider('Crowd', 'crowd'),
      h('label', { class: 'tvb-setting' }, h('span', { text: 'Motion' }), motionSel),
      h('p', { class: 'tvb-modal-text tvb-dim', text: 'Battle music and effects are synthesised. The championship cutscene and final round share the supplied Marnie remix. Music volume and master mute control the track. Settings are remembered in this browser.' }),
      h('div', { class: 'tvb-row' }, reset, btn('Done', () => closeModal(), { class: 'tvb-btn tvb-btn--go' }))));
  }
  function openCredits() {
    const p = (text) => h('p', { class: 'tvb-modal-text', text });
    openModal('Credits', h('div', { class: 'tvb-credits' },
      p('The Very Best — a game by Milind Parwani for PARWANI-DOS. Unofficial fan project, not affiliated with or endorsed by Nintendo, Game Freak, Creatures or The Pokémon Company. Pokémon names and sprites © The Pokémon Company; sprites from the PokeAPI sprites project.'),
      p('Champion team: Takuma Yamazaki’s official 2026 Pokémon VGC Masters World Championship team sheet (species, items, abilities, natures, moves). Stat points: a community reconstruction (ChampionsDex). Ren Kestrel is an original fictional character; Ren’s dialogue, strategy and move variations are this game’s fiction, not statements or strategies of Takuma Yamazaki.'),
      p('Battle engine: Pokémon Showdown simulator (MIT licence, © Guangcong Luo and contributors), commit c046106c. The AI is a heuristic written for this game.'),
      p('Battle music and effects, Ren’s pixel sprite, court, stadium and interface are original. The championship cinematic uses AI-generated pixel art and Pokémon sprites. Championship music: Marnie Battle Theme remix by GlitchxCity featuring Scottay, supplied by Milind. Source and rights notes are in /vr/NOTICE.md.'),
      h('div', { class: 'tvb-row' }, btn('Done', () => closeModal(), { class: 'tvb-btn tvb-btn--go' }))));
  }

  // ---------- Boot ----------
  // ui-v2.js shows the boot screen and loads the scripts (0-40%); this loads the game data
  // (40-100%). Readiness is the data, not the animation: the boot text runs for at least 1.4 s
  // unless skipped, but never stands in for loading.
  function fetchJson(url, signal) {
    return fetch(url, { signal, credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
  }
  function boot(progress) {
    G.state = 'boot';
    G.root.dataset.state = 'boot';
    const bootEl = G.root.querySelector('.tvb-boot');
    const log = bootEl.querySelector('.tvb-boot-log');
    const actions = bootEl.querySelector('.tvb-boot-actions');
    actions.replaceChildren();
    let skipped = reduced();
    const skip = () => { skipped = true; };
    G.root.addEventListener('pointerdown', skip, { once: true });
    const minTime = new Promise((resolve) => {
      const started = performance.now();
      const tick = () => { if (G.state !== 'boot') return; if (skipped || performance.now() - started > 1400) resolve(); else window.setTimeout(tick, 50); };
      tick();
    });
    G.bootSkip = skip;
    A.ensure();
    A.play('boot');
    const session = G.session;
    G.abort = new AbortController();
    let done = 0;
    let failed = false;
    const load = DATA.map(([key, url, label]) => (G.raw[key] ? Promise.resolve(G.raw[key]) : fetchJson(url, G.abort.signal)).then((json) => {
      G.raw[key] = json;
      done += 1;
      // A file that lands after another failed must not overwrite the error.
      if (!failed && session === G.session) progress(0.4 + 0.6 * (done / DATA.length), `Loaded ${label}`);
      return json;
    }));
    Promise.all(load).then(() => minTime).then(() => {
      if (session !== G.session) return;
      G.cat = C.catalog(G.raw);
      if (!G.draft) {
        let raw = null;
        let legacy = null;
        try { raw = window.localStorage.getItem(C.STORE); legacy = C.LEGACY_STORES.map((k) => window.localStorage.getItem(k)).find(Boolean) || null; } catch (_) { /* private mode */ }
        const restored = C.restore(raw, G.cat, raw ? null : legacy);
        G.draft = restored.draft;
        G.restoreNotes = restored.notes;
        if (restored.migrated) save();
      }
      progress(1, 'Ready');
      go('title');
    }).catch((error) => {
      if (session !== G.session || (error && error.name === 'AbortError')) return;
      failed = true;
      log.textContent ='Cartridge read error: the game data didn’t load. Check your connection.';
      actions.replaceChildren(btn('Retry', () => boot(progress), { class: 'tvb-btn tvb-btn--go' }));
      actions.querySelector('button').focus();
    });
  }

  // ---------- Title ----------
  // Design handoff "Retro Main Menu", option 1b (2026-10-10): a 960 x 540 field-and-dialog-box
  // artboard, scaled uniformly (whole numbers when it's at least full size, pixelated) and
  // letterboxed in ink. Narrow portrait screens get a 405 x 720 arrangement of the same parts, since
  // the 16:9 board would shrink its text below readable sizes there. One 450 ms tick drives the
  // sprite's bob and the advance arrow's blink; reduced motion holds both still.
  const TITLE_ITEMS = [
    ['Play', () => go('name'), 'confirm'],
    ['Settings', () => openSettings(), 'select'],
    ['Credits', () => openCredits(), 'select'],
    ['Quit', () => window.VictoryRoad.close && window.VictoryRoad.close(), 'back']
  ];
  G.screens.title = (screen) => {
    G.onBack = null;
    let sel = 0;
    let tick = 0;
    const trainer = h('div', { class: 'tvb-tm-trainer' }, ART.trainer('tvb-tm-sprite'));
    const items = TITLE_ITEMS.map(([label], i) => h('button', { type: 'button', class: 'tvb-tm-item', 'data-i': i },
      h('span', { class: 'tvb-tm-cursor', 'aria-hidden': 'true', text: '▶' }), h('span', { text: label.toUpperCase() })));
    const arrow = h('span', { class: 'tvb-tm-next', 'aria-hidden': 'true', text: '▼' });
    const board = h('div', { class: 'tvb-tm-board' },
      ['sky1', 'sky2', 'haze', 'grass', 'grass-hi', 'grass-lo', 'platform'].map((k) => h('div', { class: `tvb-tm-${k}`, 'aria-hidden': 'true' })),
      trainer,
      h('div', { class: 'tvb-tm-title' },
        h('p', { class: 'tvb-tm-eyebrow', text: 'CARTRIDGE 07 · DOUBLES' }),
        h('h3', { class: 'tvb-tm-name' }, h('span', { class: 'tvb-tm-the', text: 'THE VERY' }), h('span', { class: 'tvb-tm-best', text: 'BEST' }))),
      h('div', { class: 'tvb-tm-menu', role: 'group', 'aria-label': 'Main menu' }, items),
      h('div', { class: 'tvb-tm-desc' }, h('p', { text: 'Build a party from every generation, then take on Ren Kestrel, the reigning champion.' }), arrow));
    const frame = h('div', { class: 'tvb-tm-frame' }, board);
    const legal = h('p', { class: 'tvb-tm-legal', text: 'Unofficial fan project. Pokémon © The Pokémon Company.' });
    screen.append(h('div', { class: 'tvb-tm' }, frame, legal));

    const select = (i, focus) => {
      if (i !== sel) A.play('move');
      sel = i;
      items.forEach((b, n) => b.classList.toggle('is-selected', n === sel));
      if (focus && document.activeElement !== items[sel]) items[sel].focus({ preventScroll: true });
    };
    const activate = (i) => { const [, run, sound] = TITLE_ITEMS[i]; A.play(sound); run(); };
    items.forEach((b, i) => {
      b.addEventListener('mouseenter', () => select(i, true));
      b.addEventListener('focus', () => select(i, false));
      b.addEventListener('click', (e) => { e.preventDefault(); activate(i); });
    });
    // Arrows move (and wrap); Enter, Space or Z activate the selected item.
    const onKey = (e) => {
      if (G.state !== 'title' || G.modal || e.defaultPrevented) return;
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); select((sel + d + 4) % 4, true); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); activate(sel); }
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setInterval(() => {
      tick += 1;
      trainer.classList.toggle('is-up', tick % 2 === 1);
      arrow.classList.toggle('is-off', tick % 2 === 1);
    }, 450);
    // Fit the board: whole-number scale at or above full size, otherwise the largest that fits.
    const fit = () => {
      const w = frame.clientWidth;
      const hgt = frame.clientHeight;
      if (!w || !hgt) return;
      const portrait = w < 640 && hgt > w;
      board.classList.toggle('is-portrait', portrait);
      const [bw, bh] = portrait ? [405, 720] : [960, 540];
      let s = Math.min(w / bw, hgt / bh);
      // Within 4% of full size, draw at 1x and let the frame crop a few pixels of sky and grass
      // margin (no content sits that close to the edges): crisp pixel fonts beat a 0.99 blur.
      if (s >= 0.96 && s < 1) s = 1;
      if (s >= 1) s = Math.floor(s);
      board.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(frame); else window.addEventListener('resize', fit);
    fit();
    G.unmount = () => {
      window.clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
    };
    select(0, true);
    announce('The Very Best. Main menu.');
  };

  // ---------- Name entry ----------
  G.screens.name = (screen) => {
    const input = h('input', { class: 'tvb-input', type: 'text', id: 'tvbName', maxlength: '60', autocomplete: 'off', spellcheck: 'false', value: G.name || '', placeholder: C.DEFAULT_NAME, 'aria-describedby': 'tvbNameHint tvbNameError' });
    const error = h('p', { class: 'tvb-error', id: 'tvbNameError', role: 'alert' });
    const submit = () => {
      const { name, error: problem } = C.cleanName(input.value);
      if (problem) { error.textContent = problem; A.play('error'); input.focus(); return; }
      G.name = name;
      A.play('confirm');
      go('builder');
    };
    const form = h('form', { class: 'tvb-name', onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('label', { for: 'tvbName', class: 'tvb-label', text: 'Your trainer name' }),
      input,
      h('p', { class: 'tvb-dim', id: 'tvbNameHint', text: `Up to 20 characters. Leave it empty to battle as ${C.DEFAULT_NAME}. Kept only while this window is open.` }),
      error,
      h('div', { class: 'tvb-row' }, h('button', { type: 'submit', class: 'tvb-btn tvb-btn--go' }, 'Continue ▸')));
    screen.append(header('New challenger', () => go('title')), h('div', { class: 'tvb-center' }, form));
    input.focus();
    input.select();
  };

  // ---------- Keys: Escape goes back one level, never past the title ----------
  function onKey(e) {
    if (G.state === 'closed') return;
    if (G.state === 'boot' && G.bootSkip) G.bootSkip();
    // Arrow keys move the focus between buttons in a menu grid.
    const grid = e.target.closest && e.target.closest('[data-grid]');
    if (grid && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const items = [...grid.querySelectorAll(':scope > button:not(:disabled), :scope > * > button:not(:disabled)')].filter((b) => b.offsetParent !== null);
      const i = items.indexOf(e.target);
      if (i >= 0) {
        const cols = Math.max(1, window.getComputedStyle(grid).gridTemplateColumns.split(' ').length);
        const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
        const next = items[Math.max(0, Math.min(items.length - 1, i + d))];
        if (next && next !== e.target) { e.preventDefault(); A.play('move'); next.focus(); }
        return;
      }
    }
    if (e.key !== 'Escape') return;
    let handled = false;
    if (G.modal) handled = closeModal();
    else if (G.escapeHook && G.escapeHook()) handled = true;
    else if (G.onBack) { A.play('back'); G.onBack(); handled = true; }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // ---------- Lifecycle (called by ui-v2.js) ----------
  function start(root, progress) {
    G.session += 1;
    G.root = root;
    applyMotion();
    document.addEventListener('keydown', onKey, true);
    boot(progress);
  }
  // Closing the window ends everything: battle worker, timers, audio, listeners. The draft
  // stays saved; the trainer name stays in memory until the page reloads.
  function dispose() {
    G.session += 1;
    if (G.abort) G.abort.abort();
    if (window.VictoryRoad.disposeBattle) window.VictoryRoad.disposeBattle();
    closeModal(true);
    unmount();
    document.removeEventListener('keydown', onKey, true);
    A.close();
    G.state = 'closed';
    G.onBack = null;
    G.escapeHook = null;
    if (G.root) {
      G.root.querySelector('.tvb-screen')?.remove();
      delete G.root.dataset.state;
    }
  }
  // The window's ✕, the scrim and an unhandled Escape ask here first. A battle in progress asks
  // for confirmation inside the game; anything else closes straight away.
  function beforeClose(close) {
    if (G.state === 'battle' && G.battleActive && G.battleActive()) {
      confirm('Quit the battle?', 'This battle can’t be resumed. Your party and modifiers stay saved.', 'Quit', 'Keep battling').then((yes) => { if (yes) close(); });
      return false;
    }
    return true;
  }

  window.TVB = { G, C, A, ART, h, btn, header, go, sprite, spriteUrl, typeChip, typeRow, TYPE_COLOURS, announce, save, confirm, openModal, closeModal, openSettings, reduced };
  window.VictoryRoad = Object.assign(window.VictoryRoad || {}, { start, dispose, beforeClose });
}());

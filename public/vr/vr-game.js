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
    ['species', '/vr/species.json?v=1', 'species data'],
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
  // Re-renders the current screen (after a reset).
  function refresh() {
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
      h('p', { class: 'tvb-modal-text tvb-dim', text: 'Music, effects and crowd are original and synthesised in your browser. Volumes and motion are remembered in this browser.' }),
      h('div', { class: 'tvb-row' }, reset, btn('Done', () => closeModal(), { class: 'tvb-btn tvb-btn--go' }))));
  }
  function openCredits() {
    const p = (text) => h('p', { class: 'tvb-modal-text', text });
    openModal('Credits', h('div', { class: 'tvb-credits' },
      p('The Very Best — a game by Milind Parwani for PARWANI-DOS. Unofficial fan project, not affiliated with or endorsed by Nintendo, Game Freak, Creatures or The Pokémon Company. Pokémon names and sprites © The Pokémon Company; sprites from the PokeAPI sprites project.'),
      p('Champion team: Takuma Yamazaki’s official 2026 Pokémon VGC Masters World Championship team sheet (species, items, abilities, natures, moves). Stat points: a community reconstruction (ChampionsDex). Ren Kestrel is an original fictional character; Ren’s dialogue, strategy and move variations are this game’s fiction, not statements or strategies of Takuma Yamazaki.'),
      p('Battle engine: Pokémon Showdown simulator (MIT licence, © Guangcong Luo and contributors), commit c046106c. The AI is a heuristic written for this game.'),
      p('Music, sound effects, crowd, the champion illustration, the capsule and the interface are original. The requested licensed tracks are not included until they are cleared for game use.'),
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
  G.screens.title = (screen) => {
    G.onBack = null;
    const art = h('div', { class: 'tvb-title-art', 'aria-hidden': 'true' });
    art.innerHTML = ART.champion('tvb-title-champ');
    const menu = h('div', { class: 'tvb-menu', role: 'group', 'aria-label': 'Main menu' },
      btn('Play', () => go('name'), { class: 'tvb-btn tvb-btn--go tvb-btn--big' }),
      btn('Settings', () => openSettings()),
      btn('Credits', () => openCredits()),
      btn('Quit', () => window.VictoryRoad.close && window.VictoryRoad.close(), { 'data-sound': 'back' }));
    screen.append(
      h('div', { class: 'tvb-title' },
        h('div', { class: 'tvb-title-copy' },
          h('p', { class: 'tvb-kicker', text: 'Cartridge 07 · Doubles challenge' }),
          h('h3', { class: 'tvb-wordmark' }, h('span', { text: 'The' }), h('span', { text: 'Very' }), h('span', { text: 'Best' })),
          h('p', { class: 'tvb-title-sub', text: 'Build a party from every generation, then take on Ren Kestrel, the reigning champion.' }),
          menu,
          h('p', { class: 'tvb-fine', text: 'Unofficial fan project. Pokémon © The Pokémon Company.' })),
        art));
    menu.querySelector('button').focus();
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

  window.TVB = { G, C, A, ART, h, btn, header, go, sprite, spriteUrl, announce, save, confirm, openModal, closeModal, openSettings, reduced };
  window.VictoryRoad = Object.assign(window.VictoryRoad || {}, { start, dispose, beforeClose });
}());

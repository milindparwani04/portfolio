// Victory Road setup window (Phase 1): the full Gen I-IX pool with pixel sprites, a six-slot team
// with remove buttons, pointer and keyboard reordering, a hidden random team, and the nine
// modifiers. Loaded on demand by ui-v2.js the first time the window opens; mount() renders into
// the window's .pdos-cr container. Pure logic lives in vr-core.js (window.VRCore).
(function () {
  'use strict';

  const C = window.VRCore;
  const STORE = 'pdosVictoryRoad';
  const LEGACY_STORE = 'pdosChampionRun';
  const SPRITES = '/assets/vr/sprites';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  // 9x9 pixel X in a pixel circle, and a 6x9 pixel question mark (1 = filled cell).
  const X_ICON = ['..#####..', '.#.....#.', '#.X...X.#', '#..X.X..#', '#...X...#', '#..X.X..#', '#.X...X.#', '.#.....#.', '..#####..'];
  const Q_ICON = ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..', '..##..'];
  function pixelSvg(rows, colours, cls) {
    const cells = [];
    rows.forEach((row, y) => row.split('').forEach((c, x) => {
      if (colours[c]) cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[c]}"/>`);
    }));
    return `<svg class="${cls}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${cells.join('')}</svg>`;
  }
  const X_SVG = pixelSvg(X_ICON, { '#': '#1c1c1c', X: '#e3350d' }, 'vr-x-icon');
  const Q_SVG = pixelSvg(Q_ICON, { '#': '#ffd43b' }, 'vr-q-icon');

  let dex = null;
  let dexPromise = null;
  function loadDex() {
    if (!dexPromise) {
      dexPromise = fetch('/vr/dex.json?v=1').then((r) => {
        if (!r.ok) throw new Error('dex');
        return r.json();
      }).then((data) => {
        const rows = (list) => list.map(([id, name, num, gen, form, types, has]) => ({ id, name, num, gen, form, types, has }));
        const pool = rows(data.pool);
        const battle = rows(data.battle);
        const byId = {};
        const baseByNum = {};
        [...pool, ...battle].forEach((e) => { byId[e.id] = e; });
        pool.forEach((e) => { if (!e.form) baseByNum[e.num] = e; });
        dex = { pool, battle, byId, baseByNum };
        return dex;
      });
    }
    return dexPromise;
  }

  // Sprite path for one entry; kind is front / back / shiny / back-shiny. A missing kind falls back
  // (shiny -> normal, back -> front, form -> base species) before an image is ever requested.
  const KIND_INDEX = { front: 0, back: 1, shiny: 2, 'back-shiny': 3 };
  function spriteUrl(entry, kind) {
    const order = { 'back-shiny': ['back-shiny', 'back', 'shiny', 'front'], back: ['back', 'front'], shiny: ['shiny', 'front'], front: ['front'] }[kind];
    for (const k of order) if (entry.has[KIND_INDEX[k]] === '1') return `${SPRITES}/${k}/${entry.id}.png`;
    const base = dex.baseByNum[entry.num];
    return base && base !== entry ? spriteUrl(base, kind) : '';
  }
  function sprite(entry, kind, cls) {
    const url = spriteUrl(entry, kind);
    const img = h('img', { class: cls, src: url || null, alt: '', width: 96, height: 96, loading: 'lazy', decoding: 'async' });
    const fail = () => { img.removeAttribute('src'); img.classList.add('is-missing'); };
    if (!url) fail();
    img.addEventListener('error', fail, { once: true });
    return img;
  }
  const formLabel = (entry) => `Gen ${C.ROMAN[entry.gen]}${entry.form ? ` · ${entry.form.replace(/-/g, ' ')}` : ''}`;

  function mount(root) {
    if (root.dataset.vrMounted) return;
    root.dataset.vrMounted = '1';
    // index.html keeps the title row (lockup + multiplier); everything below it is rendered here.
    const loading = h('p', { class: 'vr-loading', 'data-vr': 'loading', text: 'Loading the Pokédex…' });
    root.append(loading);
    loadDex().then(() => build(root)).catch(() => {
      loading.textContent = 'The Pokédex didn’t load. Close the window and open it again to retry.';
      delete root.dataset.vrMounted;
      dexPromise = null;
      window.setTimeout(() => loading.remove(), 6000);
    });
  }

  function build(root) {
    let legacy = null;
    try { legacy = window.localStorage.getItem(STORE) || window.localStorage.getItem(LEGACY_STORE); } catch (_) { /* private mode */ }
    const st = C.restore(legacy, dex.byId);
    // The hidden random team lives only here, never in the DOM, storage or console.
    let hidden = [];
    let query = '';
    let lifted = null; // keyboard reorder: index of the slot being moved

    const nodes = {};
    root.querySelector('[data-vr="loading"]').remove();
    const grid = h('div', { class: 'pdos-cr-grid' });
    root.append(grid);

    // 01 Pool
    nodes.search = h('input', { class: 'vr-search', type: 'search', placeholder: 'Search by name or number', 'aria-label': 'Search Pokémon', autocomplete: 'off', spellcheck: 'false' });
    nodes.gens = h('div', { class: 'pdos-cr-gens', role: 'group', 'aria-label': 'Generations' });
    nodes.modeBtns = ['single', 'cross'].map((mode) => h('button', { type: 'button', 'data-cr-mode': mode, text: mode === 'single' ? 'One generation' : 'Cross-generation' }));
    nodes.poolNote = h('span');
    nodes.pool = h('div', { class: 'vr-pool', role: 'group', 'aria-label': 'Pokémon pool' });
    nodes.poolCount = h('p', { class: 'vr-pool-count', 'aria-live': 'polite' });
    grid.append(h('section', { class: 'pdos-cr-box pdos-cr-pool', 'aria-labelledby': 'vrPoolLabel' },
      h('div', { class: 'pdos-cr-label' }, h('span', { id: 'vrPoolLabel', text: '01 / Pokémon pool' }), nodes.poolNote),
      h('div', { class: 'vr-pool-tools' }, h('div', { class: 'pdos-cr-toggle', role: 'group', 'aria-label': 'Pool mode' }, nodes.modeBtns), nodes.search),
      nodes.gens, nodes.pool, nodes.poolCount));

    // 02 Team, 03 Modifiers, CTA
    nodes.teamLabel = h('span', { id: 'vrTeamLabel' });
    nodes.reroll = h('button', { type: 'button', class: 'pdos-cr-reroll', hidden: true, text: 'Reroll ↻' });
    nodes.team = h('ol', { class: 'vr-team', 'aria-labelledby': 'vrTeamLabel' });
    nodes.teamHint = h('p', { class: 'vr-team-hint', id: 'vrTeamHint', text: 'Drag a Pokémon by its grip to reorder, or focus the grip and press Space, then the arrow keys.' });
    nodes.mods = h('div', { class: 'vr-mods' });
    nodes.modNotes = h('p', { class: 'vr-mod-notes' });
    nodes.cta = h('button', { type: 'button', class: 'pdos-cr-cta' }, h('span', { 'data-vr': 'cta' }), h('span', { 'aria-hidden': 'true', text: '↵' }));
    nodes.status = h('p', { class: 'pdos-cr-status', role: 'status' });
    nodes.live = h('p', { class: 'vr-sr-only', 'aria-live': 'assertive' });
    grid.append(h('div', { class: 'pdos-cr-side' },
      h('section', { class: 'pdos-cr-box vr-team-box', 'aria-labelledby': 'vrTeamLabel' }, h('div', { class: 'pdos-cr-label' }, nodes.teamLabel, nodes.reroll), nodes.team, nodes.teamHint),
      h('section', { class: 'pdos-cr-box pdos-cr-mods', 'aria-labelledby': 'vrModsLabel' }, h('div', { class: 'pdos-cr-label' }, h('span', { id: 'vrModsLabel', text: '03 / Modifiers' }), h('span', { text: 'Rewards multiply' })), nodes.mods, nodes.modNotes),
      nodes.cta, nodes.status, nodes.live));
    root.append(h('p', { class: 'vr-disclaimer', text: 'Victory Road is an unofficial fan project. It is not affiliated with or endorsed by Nintendo, Game Freak, Creatures, The Pokémon Company, Takuma Yamazaki or Mojang. Pokémon sprites and names © The Pokémon Company.' }));

    const say = (text) => { nodes.status.textContent = text; };
    const announce = (text) => { nodes.live.textContent = ''; window.setTimeout(() => { nodes.live.textContent = text; }, 30); };
    const team = () => (st.mods.random ? hidden : st.team);
    const save = () => { try { window.localStorage.setItem(STORE, C.serialize(st)); } catch (_) { /* private mode */ } };
    const rerollHidden = () => { hidden = C.rollTeam(C.eligible(dex.pool, st), C.rng(C.newSeed())); };
    const activeGens = () => (st.mode === 'single' ? [st.gen] : st.gens);
    if (st.mods.random) rerollHidden();

    // --- Pool: built once, then filtered by toggling `hidden` (1,127 buttons, sprites lazy-load).
    const poolButtons = dex.pool.map((entry) => {
      const button = h('button', { type: 'button', class: 'vr-mon', 'aria-pressed': 'false', 'data-num': entry.num },
        sprite(entry, 'front', 'vr-sprite'),
        h('span', { class: 'vr-mon-name', text: entry.name }),
        h('span', { class: 'vr-mon-meta', text: `#${String(entry.num).padStart(4, '0')} · ${formLabel(entry)}` }));
      button.addEventListener('click', () => {
        if (st.mods.random) return;
        if (st.team.includes(entry.id)) { removeAt(st.team.indexOf(entry.id)); return; }
        const result = C.addToTeam(st.team, entry, dex.byId);
        if (result.error) { say(result.error); return; }
        st.team = result.team;
        announce(`${entry.name} added to slot ${st.team.length}.`);
        update();
      });
      return { entry, button, key: `${entry.name.toLowerCase()} ${entry.num} ${String(entry.num).padStart(4, '0')}` };
    });
    nodes.pool.append(...poolButtons.map((p) => p.button));

    function renderPool() {
      const gens = activeGens();
      const q = query.trim().toLowerCase().replace(/^#/, '');
      let shown = 0;
      poolButtons.forEach(({ entry, button, key }) => {
        const visible = gens.includes(entry.gen) && (!q || key.includes(q));
        button.hidden = !visible;
        if (visible) shown += 1;
        button.setAttribute('aria-pressed', String(!st.mods.random && st.team.includes(entry.id)));
        button.disabled = st.mods.random;
      });
      nodes.pool.classList.toggle('is-locked', st.mods.random);
      nodes.poolCount.textContent = st.mods.random ? 'Pool locked: random team is on.' : `${shown} Pokémon shown`;
      nodes.poolNote.textContent = st.mode === 'single' ? `Gen ${C.ROMAN[st.gen]} only` : `${gens.length} of 9 gens`;
      nodes.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.crMode === st.mode)));
      nodes.gens.replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => h('button', {
        type: 'button', 'aria-pressed': String(gens.includes(g)), text: `Gen ${C.ROMAN[g]}`,
        onclick: () => {
          if (st.mode === 'single') st.gen = g;
          else {
            st.gens = st.gens.includes(g) ? st.gens.filter((x) => x !== g) : [...st.gens, g].sort((a, b) => a - b);
            if (!st.gens.length) st.gens = [g];
          }
          if (st.mods.random) rerollHidden();
          else st.team = st.team.filter((id) => activeGens().includes(dex.byId[id].gen));
          update();
        }
      })));
    }

    // --- Team slots
    function slotNode(i) {
      const slot = h('li', { class: 'vr-slot', 'data-slot': i, style: `--i:${i}` });
      const number = h('span', { class: 'vr-slot-n', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') });
      if (st.mods.random) {
        slot.classList.add('is-hidden');
        slot.append(number, h('span', { class: 'vr-bob', role: 'img', 'aria-label': `Hidden random Pokémon, slot ${i + 1}` }), h('span', { class: 'vr-slot-name', 'aria-hidden': 'true', text: '???' }));
        slot.querySelector('.vr-bob').innerHTML = Q_SVG;
        return slot;
      }
      const id = st.team[i];
      if (!id) {
        slot.classList.add('is-empty');
        slot.append(number, h('span', { class: 'vr-slot-name', text: `Slot ${i + 1}: empty` }));
        return slot;
      }
      const entry = dex.byId[id];
      const grip = h('button', { type: 'button', class: 'vr-grip', 'aria-describedby': 'vrTeamHint', 'aria-label': `Move ${entry.name}, slot ${i + 1}` });
      grip.innerHTML = '<span aria-hidden="true"></span>';
      const remove = h('button', { type: 'button', class: 'vr-remove', 'aria-label': `Remove ${entry.name} from slot ${i + 1}` });
      remove.innerHTML = X_SVG;
      remove.addEventListener('click', () => removeAt(i));
      const bob = h('span', { class: 'vr-bob' }, sprite(entry, st.mods.shiny ? 'shiny' : 'front', 'vr-sprite'));
      slot.classList.add('is-filled');
      if (lifted === i) slot.classList.add('is-lifted');
      slot.append(number, grip, remove, bob, h('span', { class: 'vr-slot-name', text: entry.name }));
      grip.addEventListener('keydown', (event) => onGripKey(event, i));
      grip.addEventListener('pointerdown', (event) => startDrag(event, i, slot));
      return slot;
    }

    function renderTeam() {
      const count = team().length;
      nodes.teamLabel.textContent = `02 / Team ${count}/${C.TEAM_SIZE}`;
      nodes.reroll.hidden = !st.mods.random;
      nodes.teamHint.hidden = st.mods.random || st.team.length < 2;
      nodes.team.replaceChildren(...Array.from({ length: C.TEAM_SIZE }, (_, i) => slotNode(i)));
    }

    function removeAt(i) {
      const entry = dex.byId[st.team[i]];
      st.team = st.team.filter((_, n) => n !== i);
      announce(`${entry.name} removed from slot ${i + 1}.`);
      update();
      // Keep focus in the team: the next filled slot's remove button, else the pool search.
      const next = nodes.team.querySelectorAll('.vr-remove')[Math.min(i, st.team.length - 1)];
      (next || nodes.search).focus();
    }

    function move(from, to, how) {
      if (to === from || to < 0 || to >= st.team.length) return false;
      const entry = dex.byId[st.team[from]];
      st.team = C.moveSlot(st.team, from, to);
      announce(`${entry.name} moved from slot ${from + 1} to slot ${to + 1}.`);
      if (how !== 'keyboard') update();
      return true;
    }

    // Keyboard reorder: Space/Enter lifts, arrows move, Space/Enter drops, Escape puts it back.
    let liftedFrom = null;
    function onGripKey(event, i) {
      const cols = 3;
      const keys = { ArrowLeft: -1, ArrowUp: -cols, ArrowRight: 1, ArrowDown: cols };
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (lifted === null) {
          lifted = i; liftedFrom = i;
          announce(`${dex.byId[st.team[i]].name} lifted from slot ${i + 1}. Use the arrow keys to move it, Space to drop, Escape to cancel.`);
        } else {
          announce(`${dex.byId[st.team[lifted]].name} dropped in slot ${lifted + 1}.`);
          lifted = null; liftedFrom = null;
          save();
        }
        renderTeam();
        focusGrip(i);
        return;
      }
      if (lifted !== null && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // don't close the window
        st.team = C.moveSlot(st.team, lifted, liftedFrom);
        announce(`Move cancelled. ${dex.byId[st.team[liftedFrom]].name} is back in slot ${liftedFrom + 1}.`);
        const back = liftedFrom;
        lifted = null; liftedFrom = null;
        renderTeam();
        focusGrip(back);
        return;
      }
      if (lifted !== null && keys[event.key]) {
        event.preventDefault();
        const to = lifted + keys[event.key];
        if (move(lifted, to, 'keyboard')) { lifted = to; renderTeam(); focusGrip(to); }
      }
    }
    const focusGrip = (i) => nodes.team.querySelector(`[data-slot="${i}"] .vr-grip`)?.focus();

    // Pointer drag (mouse, touch, pen): a ghost follows the pointer; the slot under it is the drop target.
    function startDrag(event, from, slot) {
      if (event.button !== 0) return;
      event.preventDefault();
      const grip = event.currentTarget;
      grip.setPointerCapture(event.pointerId);
      const rect = slot.getBoundingClientRect();
      const ghost = slot.cloneNode(true);
      ghost.classList.add('vr-ghost');
      ghost.removeAttribute('data-slot');
      ghost.querySelectorAll('button').forEach((b) => b.remove());
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
      document.body.append(ghost);
      slot.classList.add('is-dragging');
      const dx = event.clientX - rect.left;
      const dy = event.clientY - rect.top;
      let target = from;
      const place = (e) => {
        ghost.style.transform = `translate(${e.clientX - dx}px, ${e.clientY - dy}px)`;
        ghost.hidden = true;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.vr-slot.is-filled');
        ghost.hidden = false;
        const next = over && nodes.team.contains(over) ? Number(over.dataset.slot) : from;
        if (next !== target) {
          nodes.team.querySelector('.is-target')?.classList.remove('is-target');
          target = next;
          if (target !== from) nodes.team.querySelector(`[data-slot="${target}"]`)?.classList.add('is-target');
        }
      };
      place(event);
      const end = (e) => {
        grip.removeEventListener('pointermove', place);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        ghost.remove();
        slot.classList.remove('is-dragging');
        if (e.type === 'pointerup' && target !== from) move(from, target, 'pointer');
        else renderTeam();
      };
      grip.addEventListener('pointermove', place);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    }

    // --- Modifiers
    function renderMods() {
      nodes.mods.replaceChildren(...C.MODS.map((m) => h('button', {
        type: 'button', class: 'pdos-cr-mod', 'aria-pressed': String(st.mods[m.k]),
        onclick: () => {
          st.mods = { ...st.mods, [m.k]: !st.mods[m.k] };
          if (m.k === 'random') {
            if (st.mods.random) rerollHidden(); else hidden = [];
          }
          update();
        }
      }, h('span', { class: 'pdos-cr-mod-box', 'aria-hidden': 'true' }),
      h('span', { class: 'pdos-cr-mod-text' }, h('span', { text: m.label }), h('span', { text: m.note })),
      h('span', { class: 'pdos-cr-mod-x', text: `×${m.m.toFixed(2)}` }))));
      const notes = C.modNotes(st.mods);
      nodes.modNotes.textContent = notes.join(' ');
      nodes.modNotes.hidden = !notes.length;
      const mult = C.multiplier(st.mods);
      const multEl = document.getElementById('pdosCrMult');
      multEl.textContent = `×${mult.toFixed(2)}`;
      multEl.classList.toggle('is-up', mult > 1 && mult < 2.5);
      multEl.classList.toggle('is-gold', mult >= 2.5);
      document.getElementById('pdosCrTier').textContent = `Reward multiplier · ${C.tier(mult)} tier`;
    }

    function renderCta() {
      const count = team().length;
      const ready = count === C.TEAM_SIZE;
      root.querySelector('[data-vr="cta"]').textContent = ready ? 'Enter battle' : `Pick ${C.TEAM_SIZE - count} more Pokémon`;
      nodes.cta.disabled = !ready;
    }

    function update() {
      say('');
      save();
      renderPool();
      renderTeam();
      renderMods();
      renderCta();
    }

    nodes.modeBtns.forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.crMode;
      if (st.mode === 'single' && !st.gens.includes(st.gen)) st.gen = st.gens[0];
      if (st.mods.random) rerollHidden();
      else st.team = st.team.filter((id) => activeGens().includes(dex.byId[id].gen));
      update();
    }));
    nodes.search.addEventListener('input', () => { query = nodes.search.value; renderPool(); });
    nodes.reroll.addEventListener('click', () => { rerollHidden(); announce('New hidden team rolled.'); renderTeam(); });
    nodes.cta.addEventListener('click', () => {
      if (team().length !== C.TEAM_SIZE) return;
      const detail = { team: team().slice(), mods: { ...st.mods }, setup: { mode: st.mode, gen: st.gen, gens: st.gens.slice() } };
      if (window.VictoryRoad.onEnterBattle) window.VictoryRoad.onEnterBattle(detail, root);
      else say('The battle arrives in the next build. Your setup is saved.');
    });
    update();
  }

  window.VictoryRoad = Object.assign(window.VictoryRoad || {}, { mount, loadDex, spriteUrl: (entry, kind) => spriteUrl(entry, kind), getDex: () => dex, esc });
}());

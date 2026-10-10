// The Very Best: party builder, member editor, modifiers and battle preview — screens inside the
// game viewport, registered on the shell (vr-game.js). The draft party lives in TVB.G.draft and is
// saved on every change; battle-only overrides (random team, moves, items) are applied to a copy at
// Enter Battle (VRCore.battleLoadout), never to the draft.
(function () {
  'use strict';

  const T = window.TVB;
  const { G, C, A, h, btn, header, go, sprite, announce, save, typeChip, typeRow } = T;
  const STAT_LABEL = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
  const classBadge = (id) => {
    const cls = C.classOf(G.cat, id);
    if (cls === 'L') return h('span', { class: 'tvb-badge tvb-badge--l', text: '★ Legendary' });
    if (cls === 'M') return h('span', { class: 'tvb-badge tvb-badge--m', text: '✦ Mythical' });
    if (cls === 'U') return h('span', { class: 'tvb-badge', text: 'Ultra Beast' });
    if (cls === 'P') return h('span', { class: 'tvb-badge', text: 'Paradox' });
    return null;
  };
  const formLabel = (entry) => `#${String(entry.num).padStart(4, '0')} · Gen ${C.ROMAN[entry.gen]}${entry.form ? ` · ${entry.form.replace(/-/g, ' ')}` : ''}`;
  const level = () => (G.draft.mods.cap ? 45 : 50);
  const entryOf = (m) => G.cat.byId[m.id];
  const commit = (party) => { G.draft.party = party; save(); };

  // ======================= Party builder =======================
  // The catalog is built once per open (1,127 buttons, sprites lazy-load) and filtered in place.
  G.screens.builder = (screen) => {
    const cat = G.cat;
    let query = '';
    let lifted = null;
    let liftedFrom = null;
    const nodes = {};
    nodes.filters = h('div', { class: 'tvb-chips', role: 'group', 'aria-label': 'Show generation' });
    nodes.search = h('input', { class: 'tvb-input tvb-search', type: 'search', placeholder: 'Search by name, number or type', 'aria-label': 'Search Pokémon by name, number or type (for example: fire)', autocomplete: 'off', spellcheck: 'false' });
    nodes.pool = h('div', { class: 'tvb-pool', role: 'group', 'aria-label': 'Pokémon catalog' });
    nodes.count = h('p', { class: 'tvb-dim tvb-count', 'aria-live': 'polite' });
    nodes.party = h('ol', { class: 'tvb-party', 'aria-labelledby': 'tvbPartyLabel' });
    nodes.partyLabel = h('span', { id: 'tvbPartyLabel' });
    nodes.status = h('p', { class: 'tvb-status', role: 'status' });
    nodes.note = h('p', { class: 'tvb-note' });
    nodes.moves = h('ol', { class: 'tvb-pm-list', 'aria-labelledby': 'tvbPmLabel' });
    nodes.movesNote = h('p', { class: 'tvb-note tvb-pm-note' });
    nodes.edit = btn('Edit members ▸', () => go('editor', G.draft.party[0] && G.draft.party[0].uid));
    nodes.next = btn('Modifiers ▸', () => go('modifiers'), { class: 'tvb-btn tvb-btn--go' });
    screen.append(header(`Party · ${G.name}`, () => go('title')),
      h('div', { class: 'tvb-builder' },
        h('section', { class: 'tvb-panel tvb-catalog', 'aria-label': 'Catalog' },
          h('div', { class: 'tvb-panel-head' }, h('span', { text: 'Catalog · all generations' }), nodes.count),
          nodes.filters, nodes.search, nodes.pool),
        h('section', { class: 'tvb-panel tvb-party-panel', 'aria-labelledby': 'tvbPartyLabel' },
          h('div', { class: 'tvb-panel-head' }, nodes.partyLabel, h('span', { class: 'tvb-dim', text: 'Tap a member to edit' })),
          nodes.party,
          h('p', { class: 'tvb-dim tvb-hint', id: 'tvbPartyHint', text: 'Reorder: drag a grip, or focus it and press Space, then the arrow keys.' }),
          nodes.note, nodes.status,
          h('section', { class: 'tvb-pm', 'aria-labelledby': 'tvbPmLabel' },
            h('div', { class: 'tvb-panel-head' }, h('span', { id: 'tvbPmLabel', text: 'Party moves' }), h('span', { class: 'tvb-dim', text: 'Move types shown' })),
            nodes.movesNote, nodes.moves),
          h('div', { class: 'tvb-row tvb-row--end' }, nodes.edit, nodes.next))));

    const say = (text, sound) => { nodes.status.textContent = text; if (sound) A.play(sound); };

    // Catalog cards, in generation then National Dex order (dex.json is already sorted that way).
    const cards = cat.pool.map((entry) => {
      const button = h('button', { type: 'button', class: 'tvb-mon', 'aria-pressed': 'false', tabindex: '-1' },
        sprite(entry, 'front', 'tvb-sprite'),
        h('span', { class: 'tvb-mon-name', text: entry.name }),
        h('span', { class: 'tvb-mon-meta', text: formLabel(entry) }),
        typeRow(entry.types, 'tvb-types--card'),
        classBadge(entry.id));
      button.addEventListener('click', () => {
        const at = G.draft.party.find((m) => m.id === entry.id);
        if (at) { removeMember(at.uid, false); return; }
        const result = C.addMember(cat, G.draft.party, entry);
        if (result.error) { say(result.error, 'error'); return; }
        commit(result.party);
        A.play('confirm');
        announce(`${entry.name} joined your party, slot ${G.draft.party.length}.`);
        say('');
        renderParty();
        markPool();
      });
      return { entry, button };
    });
    nodes.pool.append(...cards.map((c) => c.button));

    function renderFilters() {
      const chip = (g, label) => h('button', { type: 'button', 'aria-pressed': String(G.draft.filterGen === g), text: label, onclick: () => { A.play('select'); G.draft.filterGen = g; save(); renderFilters(); filterPool(); } });
      nodes.filters.replaceChildren(chip(0, 'All'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => chip(g, C.ROMAN[g])));
    }
    // Filtering changes what's shown, never the party.
    function filterPool() {
      const type = C.typeQuery(query);
      let shown = 0;
      cards.forEach(({ entry, button }) => {
        const visible = C.matches(entry, query, G.draft.filterGen);
        button.hidden = !visible;
        if (visible) shown += 1;
      });
      const where = G.draft.filterGen ? ` in Gen ${C.ROMAN[G.draft.filterGen]}` : '';
      if (type) nodes.count.textContent = shown ? `${shown} ${type}-type shown${where}` : `No ${type}-type Pokémon${where}. Try All generations.`;
      else nodes.count.textContent = shown ? `${shown} shown` : 'No Pokémon match. Try another name, number, type or generation.';
      setRoving(cards.find((c) => c.button.tabIndex === 0 && !c.button.hidden)?.button || null);
    }
    function markPool() {
      const ids = new Set(G.draft.party.map((m) => m.id));
      cards.forEach(({ entry, button }) => button.setAttribute('aria-pressed', String(ids.has(entry.id))));
    }
    // One Tab stop for the whole catalog (roving tabindex): arrows, Home and End move.
    const visibleCards = () => cards.filter((c) => !c.button.hidden).map((c) => c.button);
    function setRoving(target) {
      cards.forEach(({ button }) => { button.tabIndex = -1; });
      const card = target || visibleCards()[0];
      if (card) card.tabIndex = 0;
      return card;
    }
    nodes.pool.addEventListener('focusin', (e) => { if (e.target.classList.contains('tvb-mon')) setRoving(e.target); });
    nodes.pool.addEventListener('keydown', (e) => {
      const list = visibleCards();
      const i = list.indexOf(e.target);
      if (i < 0) return;
      const cols = Math.max(1, window.getComputedStyle(nodes.pool).gridTemplateColumns.split(' ').length);
      const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols, Home: 0, End: list.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      A.play('move');
      setRoving(list[Math.max(0, Math.min(list.length - 1, to))]).focus();
    });
    nodes.search.addEventListener('input', () => { query = nodes.search.value; filterPool(); });
    nodes.search.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'Enter') return;
      const first = setRoving();
      if (first) { e.preventDefault(); first.focus(); }
    });

    // ----- Party slots -----
    const X_SVG = '<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="#1c1c1c" d="M2 0h5v1H2zM1 1h1v1H1zM7 1h1v1H7zM0 2h1v5H0zM8 2h1v5H8zM1 7h1v1H1zM7 7h1v1H7zM2 8h5v1H2z"/><path fill="#e3350d" d="M2 2h1v1H2zM6 2h1v1H6zM3 3h1v1H3zM5 3h1v1H5zM4 4h1v1H4zM3 5h1v1H3zM5 5h1v1H5zM2 6h1v1H2zM6 6h1v1H6z"/></svg>';
    function slotNode(i) {
      const m = G.draft.party[i];
      const slot = h('li', { class: 'tvb-slot', 'data-slot': i, style: `--i:${i}` });
      const n = h('span', { class: 'tvb-slot-n', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') });
      if (!m) {
        slot.classList.add('is-empty');
        slot.append(n, h('span', { class: 'tvb-slot-name tvb-dim', text: 'Empty' }));
        return slot;
      }
      const entry = entryOf(m);
      const grip = h('button', { type: 'button', class: 'tvb-grip', 'aria-describedby': 'tvbPartyHint', 'aria-label': `Move ${entry.name}, slot ${i + 1}` }, h('span', { 'aria-hidden': 'true' }));
      const remove = h('button', { type: 'button', class: 'tvb-remove', 'aria-label': `Remove ${entry.name} from slot ${i + 1}` });
      remove.innerHTML = X_SVG;
      remove.addEventListener('click', () => removeMember(m.uid, true));
      const problems = C.memberProblems(G.cat, m).length;
      const open = h('button', { type: 'button', class: 'tvb-slot-open', 'aria-label': `Edit ${entry.name}${problems ? ', needs attention' : ''}`, onclick: () => { A.play('select'); go('editor', m.uid); } },
        h('span', { class: 'tvb-bob' }, sprite(entry, G.draft.mods.shiny ? 'shiny' : 'front', 'tvb-sprite', true)),
        h('span', { class: 'tvb-slot-name', text: entry.name }),
        typeRow(entry.types, 'tvb-types--sm'),
        problems ? h('span', { class: 'tvb-warn', 'aria-hidden': 'true', text: '!' }) : null);
      slot.classList.add('is-filled');
      if (lifted === i) slot.classList.add('is-lifted');
      slot.append(n, open, grip, remove);
      grip.addEventListener('keydown', (e) => onGripKey(e, i));
      grip.addEventListener('pointerdown', (e) => startDrag(e, i, slot));
      return slot;
    }
    function renderParty() {
      const p = G.draft.party;
      nodes.partyLabel.textContent = `Party ${p.length}/${C.TEAM_SIZE}`;
      nodes.party.replaceChildren(...Array.from({ length: C.TEAM_SIZE }, (_, i) => slotNode(i)));
      nodes.edit.disabled = !p.length;
      const notes = [];
      if (G.draft.mods.random) notes.push('Random team is on: a hidden six battles instead of this party (it stays saved).');
      else if (p.length && p.length < C.MIN_BATTLE) notes.push(`Doubles needs at least ${C.MIN_BATTLE} Pokémon to battle.`);
      else if (p.length > C.BRING) notes.push(`You’ll pick ${C.BRING} of these ${p.length} at team preview.`);
      if (G.restoreNotes && G.restoreNotes.length) { notes.push(`Some saved Pokémon were left out: ${G.restoreNotes[0]}`); G.restoreNotes = []; }
      if (G.savedNote) notes.push(G.savedNote);
      nodes.note.textContent = notes.join(' ');
      nodes.note.hidden = !notes.length;
      renderMoves();
    }
    // Party moves: each member's saved moves, in party order, with move types. Only real members
    // and real moves; battle-only overrides are explained, never shown as if chosen, and a hidden
    // random team is never listed.
    function renderMoves() {
      const p = G.draft.party;
      const mods = G.draft.mods;
      const notes = [];
      if (mods.random) notes.push('Random team is on: a hidden team battles instead, and its moves appear in the battle. Below is your saved party.');
      if (mods.moves) notes.push('Random moves is on: these saved moves are replaced with random ones for the battle only, and stay saved.');
      nodes.movesNote.textContent = notes.join(' ');
      nodes.movesNote.hidden = !notes.length;
      if (!p.length) {
        nodes.moves.replaceChildren(h('li', { class: 'tvb-pm-empty tvb-dim', text: 'No Pokémon yet. Add some from the catalog and their moves show here.' }));
        return;
      }
      nodes.moves.replaceChildren(...p.map((m, i) => {
        const entry = entryOf(m);
        const moves = m.moves.map((n) => G.cat.moveByName[n]).filter(Boolean);
        return h('li', { class: 'tvb-pm-item', 'data-uid': m.uid },
          h('button', { type: 'button', class: 'tvb-pm-head', 'aria-label': `Edit ${entry.name}, slot ${i + 1}`, onclick: () => { A.play('select'); go('editor', m.uid); } },
            h('span', { class: 'tvb-pm-n', 'aria-hidden': 'true', text: String(i + 1) }),
            h('span', { class: 'tvb-pm-name', text: entry.name }),
            typeRow(entry.types, 'tvb-types--sm')),
          moves.length
            ? h('ul', { class: 'tvb-pm-moves', 'aria-label': `${entry.name}’s moves` }, moves.map((mv) => h('li', {}, typeChip(mv.type), h('span', { class: 'tvb-pm-move', text: mv.name }))))
            : h('p', { class: 'tvb-dim tvb-pm-none', text: 'No moves chosen yet.' }));
      }));
    }
    function removeMember(uid, focusParty) {
      const i = G.draft.party.findIndex((m) => m.uid === uid);
      if (i < 0) return;
      const entry = entryOf(G.draft.party[i]);
      commit(C.removeMember(G.draft.party, uid));
      A.play('back');
      announce(`${entry.name} left your party.`);
      renderParty();
      markPool();
      if (focusParty) (nodes.party.querySelectorAll('.tvb-remove')[Math.min(i, G.draft.party.length - 1)] || nodes.search).focus();
    }
    function moveTo(from, to) {
      if (to === from || to < 0 || to >= G.draft.party.length) return false;
      const entry = entryOf(G.draft.party[from]);
      commit(C.moveSlot(G.draft.party, from, to));
      announce(`${entry.name} moved from slot ${from + 1} to slot ${to + 1}.`);
      return true;
    }
    const focusGrip = (i) => nodes.party.querySelector(`[data-slot="${i}"] .tvb-grip`)?.focus();
    // Keyboard reorder: Space/Enter lifts, arrows move, Space/Enter drops, Escape puts it back.
    function onGripKey(e, i) {
      const cols = 3;
      const keys = { ArrowLeft: -1, ArrowUp: -cols, ArrowRight: 1, ArrowDown: cols };
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (lifted === null) { lifted = i; liftedFrom = i; A.play('select'); announce(`${entryOf(G.draft.party[i]).name} lifted. Arrow keys move it, Space drops, Escape cancels.`); }
        else { announce(`${entryOf(G.draft.party[lifted]).name} dropped in slot ${lifted + 1}.`); lifted = null; liftedFrom = null; A.play('confirm'); }
        renderParty();
        focusGrip(i);
        return;
      }
      if (lifted !== null && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        commit(C.moveSlot(G.draft.party, lifted, liftedFrom));
        const back = liftedFrom;
        lifted = null; liftedFrom = null;
        announce('Move cancelled.');
        renderParty();
        focusGrip(back);
        return;
      }
      if (lifted !== null && keys[e.key]) {
        e.preventDefault();
        const to = lifted + keys[e.key];
        if (moveTo(lifted, to)) { lifted = to; A.play('move'); renderParty(); focusGrip(to); }
      }
    }
    // Pointer drag (mouse, touch, pen): a ghost follows the pointer; the slot under it is the target.
    function startDrag(event, from, slot) {
      if (event.button !== 0) return;
      event.preventDefault();
      const grip = event.currentTarget;
      grip.setPointerCapture(event.pointerId);
      const rect = slot.getBoundingClientRect();
      const ghost = slot.cloneNode(true);
      ghost.classList.add('tvb-ghost');
      ghost.querySelectorAll('button').forEach((b) => b.replaceWith(...b.childNodes));
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
      G.root.append(ghost);
      slot.classList.add('is-dragging');
      const dx = event.clientX - rect.left;
      const dy = event.clientY - rect.top;
      let target = from;
      const place = (e) => {
        ghost.style.transform = `translate(${e.clientX - dx}px, ${e.clientY - dy}px)`;
        ghost.hidden = true;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tvb-slot.is-filled');
        ghost.hidden = false;
        const next = over && nodes.party.contains(over) ? Number(over.dataset.slot) : from;
        if (next !== target) {
          nodes.party.querySelector('.is-target')?.classList.remove('is-target');
          target = next;
          if (target !== from) nodes.party.querySelector(`[data-slot="${target}"]`)?.classList.add('is-target');
        }
      };
      place(event);
      const end = (e) => {
        grip.removeEventListener('pointermove', place);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        ghost.remove();
        if (e.type === 'pointerup' && target !== from) moveTo(from, target);
        renderParty();
      };
      grip.addEventListener('pointermove', place);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    }

    renderFilters();
    renderParty();
    markPool();
    filterPool();
    nodes.search.focus({ preventScroll: true });
  };

  // ======================= Member editor =======================
  function statsBlock(m) {
    const sp = G.cat.species[m.id];
    const lv = level();
    const stats = C.memberStats(G.cat, m, lv);
    const { nature, points } = C.spreadOf(G.cat, m.id);
    const rows = C.STATS.map((s) => h('tr', {},
      h('th', { scope: 'row', text: STAT_LABEL[s] }),
      h('td', { text: String(sp.base[s]) }),
      h('td', { text: String(points[s]) }),
      h('td', { class: 'tvb-stat-val', text: String(stats[s]) }),
      h('td', { class: 'tvb-stat-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.min(100, (stats[s] / (s === 'hp' ? 260 : 230)) * 100).toFixed(1)}%` }))));
    const total = C.STATS.reduce((a, s) => a + sp.base[s], 0);
    // Radar of the battle stats (the table beside it carries the numbers).
    const max = Math.max(...C.STATS.map((s) => stats[s]), 120);
    const pts = C.STATS.map((s, i) => {
      const ang = (-90 + i * 60) * Math.PI / 180;
      const r = 42 * (stats[s] / max);
      return `${(50 + r * Math.cos(ang)).toFixed(1)},${(50 + r * Math.sin(ang)).toFixed(1)}`;
    }).join(' ');
    const ring = (k) => C.STATS.map((_, i) => { const ang = (-90 + i * 60) * Math.PI / 180; return `${(50 + 42 * k * Math.cos(ang)).toFixed(1)},${(50 + 42 * k * Math.sin(ang)).toFixed(1)}`; }).join(' ');
    const radar = h('div', { class: 'tvb-radar', 'aria-hidden': 'true' });
    radar.innerHTML = `<svg viewBox="0 0 100 100"><polygon points="${ring(1)}" class="tvb-radar-ring"/><polygon points="${ring(0.5)}" class="tvb-radar-ring"/><polygon points="${pts}" class="tvb-radar-fill"/></svg>`;
    return h('section', { class: 'tvb-stats', 'aria-label': 'Stats' },
      h('table', { class: 'tvb-stat-table' },
        h('caption', { text: `Battle stats at Lv ${lv} · ${nature} nature · stat points from the default spread` }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Stat' }), h('th', { scope: 'col', text: 'Base' }), h('th', { scope: 'col', text: 'Points' }), h('th', { scope: 'col', text: `Lv ${lv}` }), h('td'))),
        h('tbody', {}, rows),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', text: 'Base total' }), h('td', { text: String(total) }), h('td', { colspan: '3' })))),
      radar);
  }
  const moveMeta = (mv) => `${mv.category} · ${mv.power ? `Power ${mv.power}` : 'No power'} · ${mv.accuracy ? `Acc ${mv.accuracy}%` : 'Never misses'} · PP ${mv.pp}${mv.priority ? ` · Priority ${mv.priority > 0 ? '+' : ''}${mv.priority}` : ''}`;

  G.screens.editor = (screen, uid) => {
    let current = uid && G.draft.party.some((m) => m.uid === uid) ? uid : (G.draft.party[0] && G.draft.party[0].uid);
    if (!current) { go('builder'); return; }
    let view = 'summary';
    let moveSlotN = 0;
    const list = h('ul', { class: 'tvb-members', 'aria-label': 'Party members' });
    const main = h('div', { class: 'tvb-editor-main' });
    screen.append(header('Member editor', () => go('builder'), btn('Modifiers ▸', () => go('modifiers'), { class: 'tvb-btn tvb-btn--go' })),
      h('div', { class: 'tvb-editor' }, h('nav', { class: 'tvb-panel tvb-members-panel', 'aria-label': 'Members' }, list), h('section', { class: 'tvb-panel tvb-editor-panel', 'aria-live': 'off' }, main)));
    // Escape inside a picker returns to the summary before leaving the editor.
    G.escapeHook = () => { if (G.state !== 'editor') { G.escapeHook = null; return false; } if (view !== 'summary') { A.play('back'); view = 'summary'; render(); return true; } return false; };
    const member = () => G.draft.party.find((m) => m.uid === current);
    const patch = (p) => { commit(C.updateMember(G.draft.party, current, p)); };

    function renderList() {
      list.replaceChildren(...G.draft.party.map((m) => {
        const entry = entryOf(m);
        const problems = C.memberProblems(G.cat, m).length;
        return h('li', {}, h('button', { type: 'button', class: 'tvb-member', 'aria-current': m.uid === current ? 'true' : null, onclick: () => { A.play('select'); current = m.uid; view = 'summary'; render(); main.querySelector('h4')?.focus(); } },
          sprite(entry, G.draft.mods.shiny ? 'shiny' : 'front', 'tvb-sprite', true), h('span', { text: entry.name }), problems ? h('span', { class: 'tvb-warn', text: '!', 'aria-label': 'needs attention' }) : null));
      }));
    }
    function summary() {
      const m = member();
      const entry = entryOf(m);
      const sp = G.cat.species[m.id];
      const ab = G.cat.abilities.find((a) => a.name === m.ability);
      const abilitySel = h('select', { class: 'tvb-select', id: 'tvbAbility' }, sp.abilities.map((a) => h('option', { value: a, text: a, selected: a === m.ability })));
      abilitySel.addEventListener('change', () => { A.play('select'); patch({ ability: abilitySel.value }); render(); main.querySelector('#tvbAbility')?.focus(); });
      const item = m.item ? G.cat.itemByName[m.item] : null;
      const moves = Array.from({ length: 4 }, (_, i) => {
        const name = m.moves[i];
        const mv = name ? G.cat.moveByName[name] : null;
        const open = h('button', { type: 'button', class: 'tvb-move-slot', 'aria-label': name ? `Move ${i + 1}: ${name}. Change` : `Move ${i + 1}: empty. Choose a move`, onclick: () => { A.play('select'); view = 'moves'; moveSlotN = Math.min(i, m.moves.length); render(); } },
          mv ? [h('span', { class: 'tvb-move-name', text: mv.name }), typeChip(mv.type), h('span', { class: 'tvb-move-meta', text: moveMeta(mv) }), h('span', { class: 'tvb-move-desc', text: mv.desc })]
            : h('span', { class: 'tvb-dim', text: '— Empty: choose a move —' }));
        const remove = name && m.moves.length > 1 ? h('button', { type: 'button', class: 'tvb-btn tvb-btn--small', 'aria-label': `Remove ${name}`, onclick: () => { A.play('back'); patch({ moves: m.moves.filter((_, k) => k !== i) }); render(); } }, '✕') : null;
        return h('li', { class: 'tvb-move-row' }, open, remove);
      });
      const problems = C.memberProblems(G.cat, m);
      main.replaceChildren(
        h('div', { class: 'tvb-summary' },
          h('div', { class: 'tvb-summary-art' }, sprite(entry, G.draft.mods.shiny ? 'shiny' : 'front', 'tvb-sprite tvb-sprite--big', true)),
          h('div', { class: 'tvb-summary-id' },
            h('h4', { tabindex: '-1', text: entry.name }),
            h('p', { class: 'tvb-dim', text: `${formLabel(entry)} · Lv ${level()}` }),
            h('p', { class: 'tvb-row' }, entry.types.map(typeChip), classBadge(entry.id)),
            h('label', { class: 'tvb-label', for: 'tvbAbility', text: 'Ability' }), abilitySel,
            h('p', { class: 'tvb-desc', text: ab ? ab.desc : '' }),
            h('p', { class: 'tvb-label', text: 'Held item' }),
            h('button', { type: 'button', class: 'tvb-item-slot', onclick: () => { A.play('select'); view = 'items'; render(); } },
              h('span', { class: 'tvb-move-name', text: item ? item.name : 'None' }), h('span', { class: 'tvb-move-desc', text: item ? item.desc : 'Choose a held item' })))),
        h('h5', { class: 'tvb-label', text: `Moves ${m.moves.length}/4` }),
        h('ol', { class: 'tvb-moves' }, moves),
        problems.length ? h('ul', { class: 'tvb-problems', role: 'status' }, problems.map((p) => h('li', { text: p }))) : h('p', { class: 'tvb-ok', role: 'status', text: 'Ready to battle.' }),
        statsBlock(m),
        G.draft.mods.moves || G.draft.mods.items ? h('p', { class: 'tvb-note', text: C.overrides(G.draft.mods).filter((t) => /moves|items/.test(t)).join(' ') + ' What you set here is what you keep.' }) : null);
    }
    // Move picker: every move this Pokémon can legally learn.
    function movesPicker() {
      const m = member();
      const entry = entryOf(m);
      const legal = [...C.legalMoves(G.cat, m.id)].map((n) => G.cat.moveByName[n]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
      const search = h('input', { class: 'tvb-input tvb-search', type: 'search', placeholder: 'Search moves, types or effects', 'aria-label': 'Search moves', autocomplete: 'off' });
      const out = h('ul', { class: 'tvb-pick-list', role: 'list' });
      const count = h('p', { class: 'tvb-dim', 'aria-live': 'polite' });
      const replacing = m.moves[moveSlotN];
      const fill = () => {
        const q = search.value.trim().toLowerCase();
        const shown = legal.filter((mv) => !q || `${mv.name} ${mv.type} ${mv.category} ${mv.desc}`.toLowerCase().includes(q));
        count.textContent = shown.length ? `${shown.length} of ${legal.length} legal moves` : 'No legal move matches that search.';
        out.replaceChildren(...shown.map((mv) => {
          const taken = m.moves.includes(mv.name) && mv.name !== replacing;
          return h('li', {}, h('button', { type: 'button', class: 'tvb-pick', disabled: taken, onclick: () => {
            const next = m.moves.slice();
            next[moveSlotN] = mv.name;
            patch({ moves: next.filter(Boolean) });
            A.play('confirm');
            announce(`${entry.name} learned ${mv.name}.`);
            view = 'summary';
            render();
          } }, h('span', { class: 'tvb-move-name', text: mv.name + (taken ? ' (chosen)' : '') }), typeChip(mv.type), h('span', { class: 'tvb-move-meta', text: moveMeta(mv) }), h('span', { class: 'tvb-move-desc', text: mv.desc })));
        }));
      };
      search.addEventListener('input', fill);
      main.replaceChildren(
        h('div', { class: 'tvb-row' }, btn('◂ Back', () => { view = 'summary'; render(); }, { 'data-sound': 'back' }), h('h4', { tabindex: '-1', text: replacing ? `Replace ${replacing}` : `Move ${moveSlotN + 1} for ${entry.name}` })),
        search, count, out);
      fill();
      search.focus();
    }
    // Item picker: items this Pokémon can use; Item Clause greys out ones held by a teammate.
    function itemsPicker() {
      const m = member();
      const entry = entryOf(m);
      const held = {};
      G.draft.party.forEach((x) => { if (x.uid !== m.uid && x.item) held[x.item] = entryOf(x).name; });
      const usable = G.cat.items.filter((it) => !C.itemProblem(G.cat, m.id, it.name, null));
      const search = h('input', { class: 'tvb-input tvb-search', type: 'search', placeholder: 'Search items', 'aria-label': 'Search items', autocomplete: 'off' });
      const out = h('ul', { class: 'tvb-pick-list', role: 'list' });
      const choose = (name) => {
        const problem = C.itemProblem(G.cat, m.id, name, m.moves);
        if (problem) { A.play('error'); announce(problem); out.before(h('p', { class: 'tvb-error', role: 'alert', text: problem })); return; }
        patch({ item: name });
        A.play('confirm');
        view = 'summary';
        render();
      };
      const fill = () => {
        const q = search.value.trim().toLowerCase();
        const shown = usable.filter((it) => !q || `${it.name} ${it.desc}`.toLowerCase().includes(q));
        out.replaceChildren(h('li', {}, h('button', { type: 'button', class: 'tvb-pick', onclick: () => choose('') }, h('span', { class: 'tvb-move-name', text: 'None' }), h('span', { class: 'tvb-move-desc', text: 'Hold nothing.' }))),
          ...shown.map((it) => h('li', {}, h('button', { type: 'button', class: 'tvb-pick', disabled: !!held[it.name], onclick: () => choose(it.name) },
            h('span', { class: 'tvb-move-name', text: it.name + (held[it.name] ? ` (held by ${held[it.name]})` : '') + (it.name === m.item ? ' · current' : '') }),
            it.kind === 'mega' ? h('span', { class: 'tvb-badge', text: 'Mega Stone' }) : null,
            h('span', { class: 'tvb-move-desc', text: it.desc })))));
      };
      search.addEventListener('input', fill);
      main.replaceChildren(
        h('div', { class: 'tvb-row' }, btn('◂ Back', () => { view = 'summary'; render(); }, { 'data-sound': 'back' }), h('h4', { tabindex: '-1', text: `Held item for ${entry.name}` })),
        h('p', { class: 'tvb-dim', text: 'Item Clause: no two Pokémon may hold the same item. Mega Stones and species items are listed only for the Pokémon that can use them.' }),
        search, out);
      fill();
      search.focus();
    }
    function render() {
      if (!member()) current = G.draft.party[0] && G.draft.party[0].uid;
      if (!current) { G.escapeHook = null; go('builder'); return; }
      renderList();
      if (view === 'moves') movesPicker();
      else if (view === 'items') itemsPicker();
      else summary();
    }
    render();
    (main.querySelector('h4') || list.querySelector('[aria-current]'))?.focus();
  };

  // ======================= Modifiers =======================
  G.screens.modifiers = (screen, _, prev) => {
    G.escapeHook = null;
    const list = h('div', { class: 'tvb-mods', role: 'group', 'aria-label': 'Modifiers' });
    const meter = h('div', { class: 'tvb-spectrum', role: 'meter', 'aria-label': 'Difficulty', 'aria-valuemin': '0', 'aria-valuemax': '100' },
      h('span', { class: 'tvb-spectrum-fill' }), h('span', { class: 'tvb-spectrum-zero', 'aria-hidden': 'true' }));
    const label = h('p', { class: 'tvb-spectrum-label' });
    const reward = h('p', { class: 'tvb-reward' });
    const notes = h('ul', { class: 'tvb-notes' });
    const back = prev === 'editor' ? () => go('editor') : () => go('builder');
    screen.append(header('Modifiers', back),
      h('div', { class: 'tvb-modifiers' },
        h('section', { class: 'tvb-panel' }, h('div', { class: 'tvb-panel-head' }, h('span', { text: 'Handicaps' }), h('span', { class: 'tvb-dim', text: 'Rewards multiply' })), list),
        h('section', { class: 'tvb-panel tvb-mod-summary' },
          h('div', { class: 'tvb-panel-head' }, h('span', { text: 'Difficulty' })), meter, label, reward, notes,
          h('div', { class: 'tvb-row tvb-row--end' }, btn('Battle preview ▸', () => go('preview'), { class: 'tvb-btn tvb-btn--go' })))));
    function render(focusKey) {
      const mods = G.draft.mods;
      list.replaceChildren(...C.MODS.map((m) => h('button', { type: 'button', class: 'tvb-mod', 'aria-pressed': String(!!mods[m.k]), 'data-k': m.k, onclick: () => {
        G.draft.mods = { ...mods, [m.k]: !mods[m.k] };
        save();
        A.play(G.draft.mods[m.k] ? 'confirm' : 'back');
        render(m.k);
      } }, h('span', { class: 'tvb-check', 'aria-hidden': 'true' }), h('span', { class: 'tvb-mod-text' }, h('span', { class: 'tvb-mod-name', text: m.label }), h('span', { class: 'tvb-dim', text: m.note })), h('span', { class: 'tvb-mod-x', text: m.cosmetic ? 'Cosmetic' : `×${m.m.toFixed(2)}` }))));
      const p = C.difficulty(mods);
      const pct = Math.round(p * 100);
      const name = C.difficultyLabel(p);
      // The gradient is fixed to the full track; only its visible width changes.
      meter.style.setProperty('--fill', `${(p * 100).toFixed(2)}%`);
      meter.setAttribute('aria-valuenow', String(pct));
      meter.setAttribute('aria-valuetext', `${name}, ${pct}% of the maximum handicap`);
      label.textContent = `${name} · ${pct}%`;
      const mult = C.multiplier(mods);
      reward.textContent = `Reward ×${mult.toFixed(2)} · ${C.tier(mult)} tier`;
      const items = [...C.overrides(mods), ...C.modNotes(mods, G.draft.party.length)];
      notes.replaceChildren(...items.map((t) => h('li', { text: t })));
      notes.hidden = !items.length;
      if (focusKey) list.querySelector(`[data-k="${focusKey}"]`)?.focus();
    }
    render();
    list.querySelector('button').focus();
  };

  // ======================= Battle preview =======================
  // An original versus screen: your party on the blue side, Ren's on the red side, both as vertical
  // rosters (sprite, name, types) on solid panels over a low-resolution ray pattern, with a pixel
  // lightning bolt and VS at the seam. No portrait of Ren here (Milind, 2026-10-10). Rules, reward
  // and Enter battle sit in a compact footer. A hidden random team stays hidden: placeholder rows only.
  const CHAMP_IDS = ['floetteeternal', 'basculegion', 'kingambit', 'dragonite', 'garchomp', 'sneasler'];
  const BOLT = '<svg viewBox="0 0 16 40" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="#16121f" d="M7 0h9l-5 15h5L4 40l3-19H2z"/><path fill="#f7c947" d="M8 2h5l-5 14h5L6 33l2-14H4z"/><path fill="#fff3c4" d="M8 2h2L7 16H6z"/></svg>';
  G.screens.preview = (screen) => {
    G.escapeHook = null;
    const mods = G.draft.mods;
    const problems = mods.random ? [] : C.partyProblems(G.cat, G.draft.party);
    const row = (entry, kind, i) => h('li', { class: 'tvb-vsb-row', style: `--i:${i}` },
      h('span', { class: 'tvb-vsb-sprite' }, sprite(entry, kind, 'tvb-sprite', true)),
      h('span', { class: 'tvb-vsb-id' }, h('span', { class: 'tvb-vsb-name', text: entry.name }), typeRow(entry.types, 'tvb-types--sm')));
    const ours = mods.random
      ? Array.from({ length: C.TEAM_SIZE }, (_, i) => h('li', { class: 'tvb-vsb-row is-hidden', style: `--i:${i}` },
        h('span', { class: 'tvb-vsb-sprite' }, h('span', { class: 'tvb-q', 'aria-hidden': 'true', text: '?' })),
        h('span', { class: 'tvb-vsb-id' }, h('span', { class: 'tvb-vsb-name', text: `Hidden Pokémon ${i + 1}` }), h('span', { class: 'tvb-dim tvb-vsb-sub', text: 'Revealed at team preview' }))))
      : G.draft.party.map((m, i) => row(entryOf(m), mods.shiny ? 'shiny' : 'front', i));
    const champTeam = CHAMP_IDS.map((id) => G.cat.byId[id]).filter(Boolean);
    const mult = C.multiplier(mods);
    const p = C.difficulty(mods);
    const bring = mods.random ? C.BRING : Math.min(C.BRING, G.draft.party.length);
    const enter = btn('Enter battle ▸', () => {
      if (problems.length) return;
      A.play('confirm');
      go('battle', { seed: C.newSeed() });
    }, { class: 'tvb-btn tvb-btn--go tvb-btn--big', disabled: !!problems.length });
    const side = (cls, id, title, sub, rows) => h('section', { class: `tvb-vsb-side ${cls}`, 'aria-labelledby': id },
      h('div', { class: 'tvb-vsb-head' }, h('h4', { id, class: 'tvb-vsb-title', text: title }), h('p', { class: 'tvb-vsb-sub', text: sub })),
      h('ol', { class: 'tvb-vsb-roster' }, rows));
    const bolt = h('div', { class: 'tvb-vsb-mid', 'aria-hidden': 'true' }, h('span', { class: 'tvb-vsb-bolt' }), h('span', { class: 'tvb-vsb-vs', text: 'VS' }));
    bolt.firstChild.innerHTML = BOLT;
    screen.append(header('Battle preview', () => go('modifiers')),
      h('div', { class: 'tvb-vsb' },
        h('div', { class: 'tvb-vsb-bg', 'aria-hidden': 'true' }, h('span', { class: 'tvb-vsb-blue' }), h('span', { class: 'tvb-vsb-red' })),
        side('tvb-vsb-side--you', 'tvbVsYou', G.name, mods.random ? 'Random team · hidden until team preview' : `${G.draft.party.length} Pokémon · bring ${bring}`, ours),
        bolt,
        side('tvb-vsb-side--ren', 'tvbVsRen', 'Ren Kestrel', 'Reigning Champion · brings 4 of 6', champTeam.map((e, i) => row(e, 'front', i)))),
      h('div', { class: 'tvb-vsb-foot' },
        h('div', { class: 'tvb-vsb-rules' },
          h('p', { text: `Doubles · Lv ${mods.cap ? '45 (Ren: Lv 50)' : 50} · Species Clause · Item Clause · ${mods.nopotions ? 'No Potions' : '2 Potions'} · Reward ×${mult.toFixed(2)} · ${C.tier(mult)} tier · ${C.difficultyLabel(p)}` }),
          ...C.overrides(mods).map((t) => h('p', { class: 'tvb-note', text: t })),
          h('p', { class: 'tvb-dim', text: 'Ren’s moves change every battle and stay hidden until used. A championship surprise waits once two of Ren’s Pokémon have fainted.' }),
          problems.length ? h('ul', { class: 'tvb-problems', role: 'alert' }, problems.map((t) => h('li', { text: t }))) : null),
        h('div', { class: 'tvb-vsb-actions' }, problems.length ? btn('Fix party ▸', () => go('builder')) : null, enter)));
    (problems.length ? screen.querySelector('.tvb-vsb-actions .tvb-btn') : enter).focus();
  };
}());

/* Parwani-DOS pixel icons (Phase 8). The sprite grids and drawing functions below are ported
   verbatim from design_handoff_parwani_dos/Portfolio Scroll Mockup.dc.html (lines 521-878); only
   React.createElement is swapped for the small DOM builder E(). Each function returns a DOM tree for
   one state (P = pixel size, on = hovered). initIcons() renders the idle tree, and on hover builds the
   'on' tree once and copies its inline styles onto the live nodes, so the CSS transitions in the
   sprites play exactly as in the mockup. */
(function () {
  'use strict';

  const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'lineHeight']);
  function E(tag, props, ...kids) {
    const el = document.createElement(tag);
    const style = props && props.style;
    if (style) {
      Object.keys(style).forEach((k) => {
        const v = style[k];
        if (v === undefined || v === null) return;
        el.style[k] = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : String(v);
      });
    }
    kids.flat(Infinity).forEach((kid) => { if (kid) el.appendChild(kid); });
    return el;
  }

  const cellsOf = (rows, col, P, trans) => {
    const out = [];
    rows.forEach((row, r) => row.split('').forEach((c, ci) => {
      if (c !== '.' && col[c]) out.push(E('div', { key: r + '_' + ci, style: { position: 'absolute', left: ci * P, top: r * P, width: P, height: P, background: col[c], transition: trans || 'none' } }));
    }));
    return out;
  };
  const frame = (w, h, style, ...kids) => E('div', { style: { position: 'relative', width: w, height: h, flex: '0 0 auto', ...style } }, ...kids);
  
  const BALL = ['.....KKKK.....','...KKRRRRKK...','..KRRRRRRSSK..','.KRRRRRRRRSSK.','.KDRRRRRRRRRK.','KDDRRKKKKRRRRK','KKKKKKWWKKKKKK','KWWWWKWWKWWWWK','KWWWWKKKKWWWWK','.KWWWWWWWWWWK.','.KWWWWWWWWWGK.','..KWWWWWWGGK..','...KKWWWWKK...','.....KKKK.....'];
  const BALL_COL = { K: '#1c1c1c', R: '#e3350d', D: '#a8240a', S: '#ffd2c4', W: '#f4f3ef', G: '#bdbab0' };
  function makeBall(P, open) {
    const px = P * 14;
    const top = E('div', { style: { position: 'absolute', left: 0, top: 0, width: px, height: 7 * P, transformOrigin: `${2 * P}px ${7 * P}px`, transform: open ? `translate(${-P}px,${-3 * P}px) rotate(-30deg)` : 'none', transition: 'transform .24s steps(3)' } }, cellsOf(BALL.slice(0, 7), BALL_COL, P));
    const bottom = E('div', { style: { position: 'absolute', left: 0, top: 7 * P, width: px, height: 7 * P } }, cellsOf(BALL.slice(7), BALL_COL, P));
    const glow = E('div', { style: { position: 'absolute', left: 3 * P, width: 8 * P, top: 6 * P, height: 2 * P, background: '#fff3a0', boxShadow: `0 0 ${3 * P}px ${P}px rgba(255,236,140,.85)`, opacity: open ? 1 : 0, transition: 'opacity .24s steps(3)' } });
    const rim = 'var(--fg,#f4f3ef)';
    const bob = E('div', { style: { position: 'absolute', left: 0, top: Math.round(px * 0.18), width: px, height: px, animation: 'crbob 1.6s ease-in-out infinite', filter: `drop-shadow(${P}px 0 0 ${rim}) drop-shadow(-${P}px 0 0 ${rim}) drop-shadow(0 ${P}px 0 ${rim}) drop-shadow(0 -${P}px 0 ${rim})` } }, bottom, glow, top);
    const shadow = E('div', { style: { position: 'absolute', left: '18%', width: '64%', bottom: 0, height: Math.max(2, P), background: 'rgba(0,0,0,.45)', animation: 'crshadow 1.6s ease-in-out infinite' } });
    return frame(px, Math.round(px * 1.4), {}, bob, shadow);
  }
  
  const SAFE = ['KKKKKKKKKKKKKKKK','KFFFFFFFFFFFFFFK','KFIIIIIIIIIIIIFK','KFIIIIIIIIIIIIFK','KFIIIIIIIIIIIIFK','KFIIIIIIIIIIIIFK','KFIIIIIIIIIIIIFK','KFIIIIIIIIIIIIFK','KFIIIYYYIIIIIIFK','KFIIYYYYYIIYYIFK','KFIYYYYYYYYYYIFK','KFFFFFFFFFFFFFFK','KKKKKKKKKKKKKKKK','.KK..........KK.'];
  const SAFE_DOOR = ['EEEEEEEEEEEE','EDDDDDDDDDDE','EDDDKKKKDDDE','EDDKLLLLKDHE','EDDKLKKLKDHE','EDDKLLLLKDHE','EDDDKKKKDDDE','EDDDDDDDDDDE','EEEEEEEEEEEE'];
  function iconSafe(P, open) {
    const base = cellsOf(SAFE, { K: '#1c1c1c', F: '#6b7078', I: '#0e0e10', Y: '#f2c14e' }, P);
    const door = E('div', { style: { position: 'absolute', left: 2 * P, top: 2 * P, width: 12 * P, height: 9 * P, transformOrigin: 'left center', transform: open ? 'perspective(260px) rotateY(-80deg)' : 'none', transition: 'transform .36s steps(4)' } }, cellsOf(SAFE_DOOR, { E: '#4a4f57', D: '#9aa0a8', K: '#1c1c1c', L: '#d9dde2', H: '#f2c14e' }, P));
    const sparkle = E('div', { style: { position: 'absolute', left: 5 * P, top: 7 * P, width: P, height: P, background: '#fff', boxShadow: `${3 * P}px ${-2 * P}px 0 #fff, ${6 * P}px ${P}px 0 #fff`, opacity: open ? 1 : 0, transition: 'opacity .2s steps(2) .3s' } });
    return frame(16 * P, 14 * P, {}, ...base, sparkle, door);
  }
  
  const MON = ['.KKKKKKKKKKKKKK.','KGGGGGGGGGGGGGGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGSSSSSSSSSSSSGK','KGGGGGGGGGGGGGGK','.KKKKKKKKKKKKKK.','......KKKK......','....KKKKKKKK....'];
  const CODE = [[0, 7], [2, 5], [2, 8], [0, 4], [1, 9], [3, 6], [3, 4], [1, 7], [0, 10], [2, 3], [2, 6], [0, 5], [1, 8], [4, 5], [1, 4], [0, 9]];
  function iconTerminal(P, on) {
    const base = cellsOf(MON, { K: '#1c1c1c', G: '#8a8f98', S: '#0b140d' }, P);
    const green = '#6dff8e';
    const prompt = E('div', { style: { position: 'absolute', inset: 0, opacity: on ? 0 : 1 } },
      E('div', { style: { position: 'absolute', left: P, top: P, width: P, height: P, background: green, boxShadow: `${P}px ${P}px 0 ${green}, 0 ${2 * P}px 0 ${green}` } }),
      E('div', { style: { position: 'absolute', left: 4 * P, top: 2 * P, width: 2 * P, height: 2 * P, background: green, animation: 'pxblink 1s steps(1) infinite' } }));
    const lines = [...CODE, ...CODE].map(([ind, w], i) => E('div', { key: i, style: { marginLeft: ind * P, width: Math.min(w, 12 - ind) * P, height: P, marginBottom: P, background: i % 5 === 3 ? '#f7c947' : green } }));
    const code = E('div', { style: { position: 'absolute', left: 0, top: 0, width: 12 * P, animation: 'pxscroll 2.4s steps(16) infinite', animationPlayState: on ? 'running' : 'paused', opacity: on ? 1 : 0 } }, ...lines);
    const screen = E('div', { style: { position: 'absolute', left: 2 * P, top: 2 * P, width: 12 * P, height: 8 * P, overflow: 'hidden' } }, prompt, code);
    return frame(16 * P, 14 * P, {}, ...base, screen);
  }
  
  const BULB = ['....KKKK....','..KKGGGGKK..','.KGGGGGGGGK.','KGGGGGGGGGGK','KGGGFGGFGGGK','KGGGGFFGGGGK','KGGGGFFGGGGK','.KGGGFFGGGK.','..KGGFFGGK..','...KGFFGK...','...KMMMMK...','...KNNNNK...','...KMMMMK...','...KNNNNK...','....KKKK....','.....KK.....'];
  function iconBulb(P, on) {
    const col = on ? { K: '#1c1c1c', G: '#ffe066', F: '#fffbe0', M: '#a3a3a3', N: '#6e6e6e' } : { K: '#1c1c1c', G: '#4a4a44', F: '#6a675e', M: '#a3a3a3', N: '#6e6e6e' };
    const glow = E('div', { style: { position: 'absolute', left: -6 * P, top: -5 * P, width: 24 * P, height: 20 * P, background: 'radial-gradient(circle at 50% 38%, rgba(255,224,102,.75), rgba(255,224,102,0) 55%)', opacity: on ? 1 : 0, transition: 'opacity .2s steps(2)' } });
    const ray = (x, y) => E('div', { key: x + '_' + y, style: { position: 'absolute', left: x * P, top: y * P, width: P, height: P, background: '#ffe066', opacity: on ? 1 : 0, transition: 'opacity .2s steps(2)' } });
    return frame(12 * P, 16 * P, {}, glow, ...cellsOf(BULB, col, P, 'background .18s steps(2)'), ray(-2, 4), ray(13, 4), ray(-1, 0), ray(12, 0), ray(5.5, -2.5));
  }
  
  const BUILD = [[0, 4, 8], [4, 5, 12], [9, 3, 6], [12, 5, 14], [17, 3, 9], [20, 4, 11]];
  function iconSkyline(P, on) {
    const W = 24, H = 14, kids = [];
    let wi = 0;
    BUILD.forEach(([x, w, h], bi) => {
      kids.push(E('div', { key: 'b' + bi, style: { position: 'absolute', left: x * P, top: (H - h) * P, width: w * P, height: h * P, background: bi % 2 ? '#2a2a33' : '#33333d' } }));
      for (let r = H - h + 1; r < H - 1; r += 2) for (let c = x + 1; c < x + w - 1; c += 2) {
        const lit = on && ((wi * 7 + bi * 3) % 4 !== 0);
        kids.push(E('div', { key: 'w' + wi, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: lit ? '#ffd34d' : '#16161b', transition: `background 0s linear ${on ? (wi % 13) * 45 : 0}ms` } }));
        wi++;
      }
    });
    const moon = E('div', { style: { position: 'absolute', left: P, top: P, width: 2 * P, height: 2 * P, background: '#f4f3ef', opacity: on ? 1 : 0.3, transition: 'opacity .2s steps(2)' } });
    const stars = [[5, 1], [8, 3], [10, 0], [18, 2], [22, 1]].map(([x, y]) => E('div', { key: 's' + x, style: { position: 'absolute', left: x * P, top: y * P, width: P, height: P, background: '#f4f3ef', opacity: on ? 0.9 : 0.15 } }));
    return frame(W * P, H * P, {}, moon, ...stars, ...kids);
  }
  
  const MAP = ['OOOLLLOOOOOOOOLLLLOOOOOO','OOLLLLLOOOOOOLLLLLLOOOOO','OLLLLLLLOOOOOLLLLLLLOOOO','OLLLLLLOOOOOOOLLLLLLOOLO','OOLLLLOOOOOOOOOLLLLOOLLO','OOOLLOOOOLLOOOOOLLOOOLLO','OOOOLLOOOLLLOOOOOOOOOOOO','OOOOLLLOOOLLLOOOOOOLLOOO','OOOOOLLOOOLLOOOOOOLLLLOO','OOOOOLOOOOOLOOOOOOOLLOOO','OOOOOOOOOOOOOOOOOOOOOOOO','OOOOOOOOOOOOOOOOOOOOOOOO'];
  function globeMask() {
    const ext = [];
    for (let r = 0; r < 12; r++) { let l = 12, rr = -1; for (let c = 0; c < 12; c++) if ((c - 5.5) ** 2 + (r - 5.5) ** 2 <= 34) { l = Math.min(l, c); rr = Math.max(rr, c); } ext.push([l, rr + 1]); }
    const pts = [];
    ext.forEach(([l, r], i) => { pts.push([r, i], [r, i + 1]); });
    for (let i = 11; i >= 0; i--) { const [l] = ext[i]; pts.push([l, i + 1], [l, i]); }
    return 'polygon(' + pts.map(([x, y]) => `${(x / 12 * 100).toFixed(2)}% ${(y / 12 * 100).toFixed(2)}%`).join(',') + ')';
  }
  const GLOBE_MASK = globeMask();
  function iconGlobe(P, spin) {
    const land = [];
    for (let r = 0; r < 12; r++) for (let c = 0; c < 48; c++) if ((MAP[r] || '')[c % 24] === 'L') land.push(E('div', { key: r + '_' + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: '#4caf50' } }));
    const strip = E('div', { style: { position: 'absolute', left: 0, top: 0, width: 48 * P, height: 12 * P, animation: 'pxspin 2.6s steps(24) infinite', animationPlayState: spin ? 'running' : 'paused' } }, ...land);
    const shade = [];
    for (let r = 0; r < 12; r++) for (let c = 8; c < 12; c++) if ((c - 5.5) ** 2 + (r - 5.5) ** 2 <= 34) shade.push(E('div', { key: 'sh' + r + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: 'rgba(0,0,0,.28)' } }));
    const globe = E('div', { style: { position: 'absolute', left: 2 * P, top: P, width: 12 * P, height: 12 * P, background: '#2f6fd6', clipPath: GLOBE_MASK, overflow: 'hidden' } }, strip, ...shade);
    const stand = [];
    for (let r = 0; r < 18; r++) for (let c = 0; c < 16; c++) {
      const d = Math.sqrt((c - 7.5) ** 2 + (r - 6.5) ** 2);
      let col = null;
      if (d >= 6.6 && d < 7.6 && c >= 7 && r <= 14) col = '#c9a227';
      if ((r === 14 || r === 15) && (c === 7 || c === 8)) col = '#8b5a2b';
      if (r === 16 && c >= 4 && c <= 11) col = '#8b5a2b';
      if (r === 17 && c >= 3 && c <= 12) col = '#5e3a1a';
      if (col) stand.push(E('div', { key: 'st' + r + '_' + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: col } }));
    }
    return frame(16 * P, 18 * P, {}, globe, ...stand);
  }
  
  function iconEq(P, on) {
    const idle = [2, 3, 2, 4, 3, 5, 3, 2, 3];
    const bars = idle.map((h, i) => E('div', { key: i, style: { width: P, height: 8 * P, transformOrigin: 'bottom', background: `repeating-linear-gradient(to top, currentColor 0 ${P - 1}px, transparent ${P - 1}px ${P}px)`, transform: on ? undefined : `scaleY(${h / 8})`, animation: on ? `pxeq ${0.6 + (i % 3) * 0.18}s steps(4) ${i * 0.07}s infinite alternate` : 'none' } }));
    return frame(9 * P + 8 * P, 8 * P, { display: 'flex', alignItems: 'flex-end', gap: P }, ...bars);
  }
  
  
  const BOOK_C = ['KKKKKKKKKKKKK.','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','KDRRYYYYYYRRWK','KDRRYYYYYYRRWK','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','KDRRRRRRRRRRWK','.KKKKKKKKKKKKK'];
  const BOOK_O = ['.KKKKKKKKKK..KKKKKKKKKK.','KWWWWWWWWWWKKWWWWWWWWWWK','KWLLLLLLLWWKKWLLLLLLLLWK','KWWWWWWWWWWKKWWWWWWWWWWK','KWLLLLLLWWWKKWLLLLLLWWWK','KWWWWWWWWWWKKWWWWWWWWWWK','KWLLLLLLLLWKKWLLLLLWWWWK','KWWWWWWWWWWKKWWWWWWWWWWK','KWLLLLLWWWWKKWLLLLLLLLWK','KWWWWWWWWWWKKWWWWWWWWWWK','RKKKKKKKKKKRRKKKKKKKKKKR','.RRRRRRRRRRRRRRRRRRRRRR.'];
  function iconBook(P, on) {
    const closed = E('div', { style: { position: 'absolute', left: 5 * P, top: 0, width: 14 * P, height: 12 * P, opacity: on ? 0 : 1, transition: 'opacity .15s steps(2)' } }, cellsOf(BOOK_C, { K: '#1c1c1c', D: '#7a2a1d', R: '#b8432f', Y: '#f2c14e', W: '#f4f3ef' }, P));
    const cells = [];
    BOOK_O.forEach((row, r) => row.split('').forEach((c, ci) => {
      if (c === '.') return;
      const col = { K: '#1c1c1c', W: '#f4f3ef', R: '#b8432f' }[c];
      if (c === 'L') {
        const page = ci < 12 ? 0 : 1, order = page * 60 + r * 8 + ci;
        cells.push(E('div', { key: r + '_' + ci, style: { position: 'absolute', left: ci * P, top: r * P, width: P, height: P, background: on ? '#3a3a3a' : '#f4f3ef', transition: on ? `background 0s linear ${order * 14}ms` : 'none' } }));
      } else cells.push(E('div', { key: r + '_' + ci, style: { position: 'absolute', left: ci * P, top: r * P, width: P, height: P, background: col } }));
    }));
    const open = E('div', { style: { position: 'absolute', left: 0, top: 0, width: 24 * P, height: 12 * P, opacity: on ? 1 : 0, transition: 'opacity .15s steps(2)' } }, ...cells);
    return frame(24 * P, 12 * P, {}, closed, open);
  }
  
  function iconBoard(P, on) {
    const W = 28, H = 13, base = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      let col = null;
      if (r <= 10 && (r === 0 || r === 10 || c === 0 || c === W - 1)) col = '#8a8f98';
      else if (r >= 1 && r <= 9 && c >= 1 && c <= W - 2) col = '#f4f3ef';
      else if (r === 11 && c >= 3 && c <= W - 4) col = '#6b7078';
      else if (r === 12 && (c === 4 || c === W - 5)) col = '#6b7078';
      if (col) base.push(E('div', { key: 'b' + r + '_' + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: col } }));
    }
    const ink = [];
    const put = (c, r, col) => ink.push(E('div', { key: 'i' + r + '_' + c + ink.length, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: col || '#141414' } }));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const d = Math.hypot(c - 4, r - 4); const a = Math.atan2(r - 4, c - 4);
      if (d > 2.6 && d <= 3.6) put(c, r);
      else if (d <= 2.6 && a > -1.7 && a < 0.1) put(c, r, '#e3350d');
    }
    for (let r = 1; r <= 8; r++) put(10, r);
    for (let c = 10; c <= 16; c++) put(c, 8);
    [[12, 3], [14, 5], [16, 7]].forEach(([c, h]) => { for (let r = 8 - h; r < 8; r++) put(c, r); });
    ['K.K.KKK', '.K....K', 'K.K..K.', '....KKK', '.......', 'KKK.K.K', '..K..K.', '.K..K.K', 'KKK....'].forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'K') put(18 + c, r); }));
    const layer = E('div', { style: { position: 'absolute', left: P, top: P, width: 26 * P, height: 9 * P, clipPath: on ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)', transition: on ? 'clip-path .9s steps(13)' : 'clip-path .1s steps(1)' } }, ...ink);
    return frame(W * P, H * P, {}, ...base, layer);
  }
  
  const TB_LID = ['.....KKKKKK.....','.....K....K.....','KKKKKKKKKKKKKKKK','KRRRRRRRRRRRRRRK','KDDDDDDDDDDDDDDK'];
  const TB_BODY = ['KRRRRRRYYRRRRRRK','KRRRRRRRRRRRRRRK','KRRRRRRRRRRRRRRK','KRRRRRRRRRRRRRRK','KRRRRRRRRRRRRRRK','KDDDDDDDDDDDDDDK','KKKKKKKKKKKKKKKK'];
  const TB_TOOLS = ['..MM.......YY...', '..M.M......YY...', '...MM......YY...', '....M......SS...', '....M......SS...', '....M......SS...'];
  function iconToolbox(P, on) {
    const col = { K: '#1c1c1c', R: '#d63a2a', D: '#9a2418', Y: '#f2c14e', M: '#c9ccd1', S: '#9aa0a8' };
    const tools = E('div', { style: { position: 'absolute', left: 0, top: 2 * P, width: 16 * P, height: 6 * P, opacity: on ? 1 : 0, transform: on ? `translateY(${-2 * P}px)` : 'none', transition: 'transform .3s steps(3) .08s, opacity .1s steps(1)' } }, cellsOf(TB_TOOLS, col, P));
    const body = E('div', { style: { position: 'absolute', left: 0, top: 7 * P, width: 16 * P, height: 7 * P } }, cellsOf(TB_BODY, col, P));
    const lid = E('div', { style: { position: 'absolute', left: 0, top: 2 * P, width: 16 * P, height: 5 * P, transformOrigin: `${16 * P}px ${5 * P}px`, transform: on ? `translate(${3 * P}px,${-2 * P}px) rotate(38deg)` : 'none', transition: 'transform .28s steps(3)' } }, cellsOf(TB_LID, col, P));
    return frame(16 * P, 14 * P, {}, tools, body, lid);
  }
  
  function iconProjector(P, on) {
    const W = 31, H = 14, cells = [];
    const put = (c, r, col, k) => cells.push(E('div', { key: k || ('p' + r + '_' + c), style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: col, transition: 'background .15s steps(2)' } }));
    const reel = (cx, key) => {
      const kids = [];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
        const d = Math.hypot(c - 2.5, r - 2.5);
        if (d > 2.9) continue;
        const hole = (r === 1 && c === 2) || (r === 4 && c === 3) || (r === 2 && c === 4) || (r === 3 && c === 1);
        if (hole) continue;
        kids.push(E('div', { key: r + '_' + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: d > 2.1 ? '#1c1c1c' : (d < 0.8 ? '#1c1c1c' : '#9aa0a8') } }));
      }
      return E('div', { key, style: { position: 'absolute', left: cx * P, top: 0, width: 6 * P, height: 6 * P, animation: 'pxrot 1.2s steps(8) infinite', animationPlayState: on ? 'running' : 'paused' } }, ...kids);
    };
    for (let r = 6; r <= 12; r++) for (let c = 1; c <= 13; c++) {
      const edge = r === 6 || r === 12 || c === 1 || c === 13;
      put(c, r, edge ? '#1c1c1c' : (r === 7 ? '#5d636d' : '#3a3f47'));
    }
    [[4, 9], [6, 9], [8, 9], [4, 10], [6, 10], [8, 10]].forEach(([c, r]) => put(c, r, '#22262c', 'v' + c + r));
    put(11, 9, on ? '#e3350d' : '#5a1d16', 'led');
    for (let r = 8; r <= 10; r++) { put(14, r, '#1c1c1c', 'lb' + r); put(15, r, '#6b7078', 'lc' + r); }
    for (let r = 7; r <= 11; r++) put(16, r, '#1c1c1c', 'ld' + r);
    for (let r = 8; r <= 10; r++) put(17, r, on ? '#fff7c2' : '#2a3a4a', 'lg' + r);
    [[3, 13], [4, 13], [10, 13], [11, 13]].forEach(([c, r]) => put(c, r, '#1c1c1c', 'leg' + c));
    put(5, 5, '#1c1c1c', 'arm1'); put(6, 4, '#1c1c1c', 'arm2'); put(9, 4, '#1c1c1c', 'arm3'); put(10, 5, '#1c1c1c', 'arm4');
    const beam = [];
    for (let c = 18; c < W; c++) {
      const spread = Math.floor((c - 18) / 2.2);
      for (let r = 8 - spread; r <= 10 + spread; r++) {
        if (r < 0 || r >= H) continue;
        const edge = r === 8 - spread || r === 10 + spread;
        beam.push(E('div', { key: 'b' + c + '_' + r, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: edge ? 'rgba(255,240,170,.35)' : 'rgba(255,240,170,.62)' } }));
      }
    }
    const beamLayer = E('div', { style: { position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: 'opacity .18s steps(3)', animation: on ? 'pxflick 1.6s steps(1) infinite' : 'none' } }, ...beam);
    return frame(W * P, H * P, {}, beamLayer, ...cells, reel(2, 'r1'), reel(8, 'r2'));
  }
  
  function iconSpotifySym(P, on) {
    const cells = [], N = 16, cx = 7.5;
    const arcs = [[4, 4, 11], [7, 5, 10], [10, 6, 9]];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = Math.hypot(c - cx, r - cx);
      if (d > 7.7) continue;
      let col = d > 6.9 ? '#0e0e0e' : (on ? '#1ed760' : '#1d6b3a');
      arcs.forEach(([ar, a0, a1]) => {
        if (r === ar && c >= a0 && c <= a1) col = '#0e0e0e';
        if (r === ar + 1 && (c === a0 - 1 || c === a1 + 1)) col = '#0e0e0e';
      });
      cells.push(E('div', { key: r + '_' + c, style: { position: 'absolute', left: c * P, top: r * P, width: P, height: P, background: col, transition: 'background .2s steps(2)' } }));
    }
    return frame(N * P, N * P, { animation: on ? 'pxglow 1.2s steps(4) infinite' : 'none' }, ...cells);
  }
  
  function iconGuitar3(P, on) {
    const OY = 2, W = 24, H = 25;
    const g = new Map();
    const set = (x, y, c) => { if (x >= 0 && x < W && y + OY >= 0 && y + OY < H) g.set(x + ',' + (y + OY), c); };
    for (let x = 0; x <= 13; x++) for (let y = 8; y <= 22; y++) {
      const inA = ((x - 5) ** 2) / (5.2 ** 2) + ((y - 16) ** 2) / (4.6 ** 2) <= 1;
      const inB = (x - 8.6) ** 2 + (y - 12.4) ** 2 <= 9;
      const notch = (x - 10.2) ** 2 + (y - 15.6) ** 2 <= 2.4;
      if ((inA || inB) && !notch) set(x, y, 'R');
    }
    for (let x = 0; x <= 13; x++) for (let y = 8; y <= 22; y++) if (g.get(x + ',' + (y + OY)) === 'R' && (x - 6.6) ** 2 + (y - 15.2) ** 2 <= 5.2) set(x, y, 'W');
    [[6, 14], [7, 15], [4, 16], [5, 17]].forEach(([x, y]) => set(x, y, 'P'));
    [[2, 18], [3, 19]].forEach(([x, y]) => set(x, y, 'B'));
    [[1, 15], [2, 16]].forEach(([x, y]) => set(x, y, 'O'));
    for (let t = 0; t <= 10; t++) { const x = 9 + t, y = 12 - t; set(x, y, 'N'); set(x + 1, y, t % 3 === 1 ? 'f' : 'N'); }
    [[20, 1], [21, 1], [22, 1], [21, 0], [22, 0], [23, 0], [22, -1], [23, -1]].forEach(([x, y]) => set(x, y, 'H'));
    [[20, 0], [21, -1], [23, 1], [22, -2]].forEach(([x, y]) => set(x, y, 'T'));
    const solid = new Set(g.keys());
    const outline = new Set();
    solid.forEach(k => { const [x, y] = k.split(',').map(Number); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const kk = (x + dx) + ',' + (y + dy); if (!solid.has(kk)) outline.add(kk); }); });
    const sil = new Set([...solid, ...outline]);
    const COL = { R: '#e3350d', W: '#f4f3ef', P: '#1c1c1c', B: '#1c1c1c', O: '#c9ccd1', N: '#8b5a2b', f: '#d9dde2', H: '#2a2a2a', T: '#c9ccd1' };
    const body = [];
    outline.forEach(k => { const [x, y] = k.split(',').map(Number); body.push(E('div', { key: 'o' + k, style: { position: 'absolute', left: x * P, top: y * P, width: P, height: P, background: '#1c1c1c' } })); });
    g.forEach((c, k) => { const [x, y] = k.split(',').map(Number); body.push(E('div', { key: 's' + k, style: { position: 'absolute', left: x * P, top: y * P, width: P, height: P, background: COL[c] } })); });
    const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };
    const tops = {};
    sil.forEach(k => { const [x, y] = k.split(',').map(Number); if (tops[x] === undefined || y < tops[x]) tops[x] = y; });
    const near = (x, y) => { let d = 9; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (sil.has((x + dx) + ',' + (y + dy))) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); return d; };
    const layers = [0, 1, 2].map(i => {
      const cells = new Map();
      const add = (x, y, col) => { const k = x + ',' + y; if (!sil.has(k) && !cells.has(k)) cells.set(k, col); };
      for (let y = -10; y < H + 3; y++) for (let x = -4; x < W + 4; x++) {
        if (sil.has(x + ',' + y)) continue;
        const d = near(x, y);
        if (d === 1) add(x, y, '#ffe14d');
        else if (d === 2 && hash(x, y, i) % 5) add(x, y, '#ff8a1a');
        else if (d === 3 && hash(x, y, i + 7) % 3 === 0) add(x, y, '#ff3b1f');
      }
      Object.entries(tops).forEach(([xs, top]) => {
        const x = +xs, h = 3 + hash(x, i, 3) % 7;
        for (let s = 1; s <= h; s++) {
          const y = top - s; if (s > 2 && hash(x, y, i) % 4 === 0) continue;
          const col = s <= 1 ? '#fff6c2' : s <= 3 ? '#ffd43b' : s <= 5 ? '#ff8a1a' : '#ff3b1f';
          add(x, y, col);
          if (s <= h - 2 && hash(x, y, i + 2) % 3 === 0) add(x + (hash(x, y, i) % 2 ? 1 : -1), y, s <= 3 ? '#ffd43b' : '#ff8a1a');
        }
        if (hash(x, i, 9) % 4 === 0) add(x, top - h - 2 - hash(x, i, 5) % 3, '#fff6c2');
      });
      const kids = [];
      cells.forEach((col, k) => { const [x, y] = k.split(',').map(Number); kids.push(E('div', { key: k, style: { position: 'absolute', left: x * P, top: y * P, width: P, height: P, background: col } })); });
      return E('div', { key: 'L' + i, style: { position: 'absolute', left: 0, top: 0, width: W * P, height: H * P, animation: `pxfr .33s steps(1) ${-i * 0.11}s infinite` } }, ...kids);
    });
    const glow = E('div', { style: { position: 'absolute', left: -8 * P, top: -10 * P, width: (W + 16) * P, height: (H + 16) * P, background: 'radial-gradient(ellipse at 50% 55%, rgba(255,150,30,.65), rgba(255,60,20,.25) 40%, rgba(255,60,20,0) 65%)', animation: 'pxfirepulse .5s steps(3) infinite alternate' } });
    const aura = E('div', { style: { position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: 'opacity .12s steps(2)', pointerEvents: 'none' } }, glow, ...layers);
    const guitar = E('div', { style: { position: 'absolute', inset: 0, animation: on ? 'pxshake .16s steps(2) infinite' : 'none' } }, ...body);
    return frame(W * P, H * P, {}, aura, guitar);
  }

  /* ---------- controller ---------- */
  // name -> [draw function, the mockup's pixel size]. The mockup's size is the cap; a smaller box
  // gets the largest whole pixel size that fits it.
  const ICONS = {
    book: [iconBook, 5], board: [iconBoard, 4], toolbox: [iconToolbox, 4], projector: [iconProjector, 4],
    spotify: [iconSpotifySym, 4], guitar: [iconGuitar3, 3], safe: [iconSafe, 5], ball: [makeBall, 6],
    eq: [iconEq, 6], skyline: [iconSkyline, 4], globe: [iconGlobe, 5], bulb: [iconBulb, 5], terminal: [iconTerminal, 5]
  };
  const units = {};
  function unitSize(name) {
    if (!units[name]) {
      const root = ICONS[name][0](1, false);
      units[name] = [parseFloat(root.style.width) || 1, parseFloat(root.style.height) || 1];
    }
    return units[name];
  }

  // Copy the target tree's inline styles onto the live tree. Same shape -> in-place (transitions
  // play); a different shape -> swap in a copy.
  function sync(live, target) {
    if (live.childNodes.length !== target.childNodes.length) {
      const copy = target.cloneNode(true);
      live.replaceWith(copy);
      return copy;
    }
    if (live.style.cssText !== target.style.cssText) live.style.cssText = target.style.cssText;
    for (let i = 0; i < live.childNodes.length; i += 1) sync(live.childNodes[i], target.childNodes[i]);
    return live;
  }

  const states = new Map();
  function pixelSize(el, name) {
    const fixed = parseInt(el.dataset.iconP, 10);
    if (fixed > 0) return fixed;
    const [w, h] = unitSize(name);
    const cap = parseInt(el.dataset.iconMax, 10) || ICONS[name][1];
    const fit = Math.floor(Math.min(el.clientWidth / w, el.clientHeight / h));
    return Math.max(1, Math.min(cap, fit || 1));
  }

  function render(el) {
    const name = el.dataset.icon;
    if (!ICONS[name]) return;
    const P = pixelSize(el, name);
    const prev = states.get(el);
    if (prev && prev.P === P) return;
    const fn = ICONS[name][0];
    const off = fn(P, false);
    const st = { P, fn, off, on: null, live: off.cloneNode(true), hovered: prev ? prev.hovered : false };
    el.setAttribute('aria-hidden', 'true');
    el.replaceChildren(st.live);
    states.set(el, st);
    if (st.hovered) setOn(el, true);
  }

  function setOn(el, on) {
    const st = states.get(el);
    if (!st) return;
    st.hovered = on;
    if (on && !st.on) st.on = st.fn(st.P, true);
    st.live = sync(st.live, on ? st.on : st.off);
  }

  function hostOf(el) {
    return el.closest('[data-icon-host]') || el.parentElement;
  }

  function init() {
    const icons = [...document.querySelectorAll('.pdos-icon[data-icon]')];
    const hosts = new Set();
    icons.forEach((el) => {
      render(el);
      hosts.add(hostOf(el));
    });
    hosts.forEach((host) => {
      const mine = icons.filter((el) => hostOf(el) === host);
      const set = (on) => mine.forEach((el) => setOn(el, on));
      host.addEventListener('mouseenter', () => set(true));
      host.addEventListener('mouseleave', () => { if (!host.contains(document.activeElement)) set(false); });
      host.addEventListener('focusin', () => set(true));
      host.addEventListener('focusout', (event) => { if (!host.contains(event.relatedTarget) && !host.matches(':hover')) set(false); });
    });
    let frame = 0;
    window.addEventListener('resize', () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => icons.forEach(render));
    });
    // Fitted icons whose box was hidden (0x0) at first render get sized once they appear.
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver((entries) => entries.forEach((entry) => render(entry.target)));
      icons.filter((el) => !el.dataset.iconP).forEach((el) => ro.observe(el));
    }
  }

  window.pdosIcons = { render, setOn };
  const start = () => (window.requestIdleCallback ? window.requestIdleCallback(init, { timeout: 1200 }) : window.setTimeout(init, 200));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
}());

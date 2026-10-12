// The Very Best: the victory certificate (design handoff "Victory Certificates", 2026-10-12).
// Standard ("1b Pixel Relic", Champion Crest recoloured by tier) for every win; Master ("3a", the
// winged Void Crest with glow, light sweep and drifting particles) only when every gameplay
// modifier is on. It opens as an in-game modal; Download PNG repaints the same layout, measured from
// the modal, onto a 1920 x 1280 canvas (glow at its peak, sweep hidden), and Print prints that PNG.
// A local keepsake: nothing is sent to a server. Serials are a per-browser win count.
(function () {
  'use strict';
  const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@900&family=Cormorant+Garamond&family=Silkscreen&display=swap';
  const W = 960;
  const H = 640;
  const EXPORT_SCALE = 2;
  const PX = 11; // crest pixel size

  const CREST = [
    'ooooooooooooo', 'oGGGGGGGGGGGo', 'oGdddddddddGo', 'oGddddWddddGo', 'oGdddWWWdddGo', 'oGWWWWWWWWWGo',
    'oGdWWWWWWWdGo', 'oGddWWWWWddGo', 'oGddWWdWWddGo', 'oGdWWdddWWdGo', '.oGdddddddGo.', '..oGdddddGo..',
    '...oGdddGo...', '....oGdGo....', '.....oGo.....', '......o......'
  ];
  const VOID_CREST = [
    '....P....P....P....', '....PP..PPP..PP....', '....PPPPPPPPPPP....', '....GGGGGGGGGGG....',
    'ww..ooooooooooo..ww', 'www.oddddWddddo.www', '.wwwodddWWWdddowww.', '..wwoddWWVWWddoww..',
    '...woddWVVVWddow...', '....oddWWVWWddo....', '.....odddWdddo.....', '......odddddo......',
    '.......odddo.......', '........odo........', '.........o.........'
  ];
  const TIER_COLOURS = { Bronze: '#c08a52', Silver: '#c9cdd6', Gold: '#d9b86a', Master: '#d9b86a' };
  const THEMES = {
    standard: { bg: '#15171f', frame: '#d8cba6', outer: '#6e6654', divider: '#3a3d48', rule: '#2c2f3a', title: '#efe6cc', body: '#bdb49b', value: '#ece3c8', muted: '#8a8577', accent: '#d8cba6', status: '#8fb3a4' },
    master: { bg: '#120f1c', frame: '#c4a8ff', outer: '#6b4fa8', divider: '#3a2f55', rule: '#2a2340', title: '#f4efe0', body: '#c8bedf', value: '#f4efe0', muted: '#9a8fb5', accent: '#c4a8ff', status: '#c4a8ff' }
  };
  const VOID_PALETTE = { P: '#e6dcff', G: '#c4a8ff', o: '#8a6bd6', d: '#241c38', W: '#c4a8ff', V: '#fff6e0', w: '#6b4fa8' };
  const MOTE = '#c4a8ff';

  const h = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    kids.flat().forEach((kid) => { if (kid != null) node.append(kid); });
    return node;
  };

  // ---------- Data ----------
  // Serials count wins in this browser: TVB-0001 for standard certificates, MTR-0001 for Master.
  function serial(master) {
    const prefix = master ? 'MTR' : 'TVB';
    const key = `pdosTvbSerial${prefix}`;
    let n = 1;
    try {
      n = (parseInt(window.localStorage.getItem(key), 10) || 0) + 1;
      window.localStorage.setItem(key, String(n));
    } catch (_) { /* private mode: every certificate is 0001 */ }
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }
  const formatTime = (ms) => {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    const hr = Math.floor(s / 3600);
    const min = Math.floor((s % 3600) / 60);
    if (hr) return `${hr}h ${min}m`;
    if (min) return `${min}m ${String(s % 60).padStart(2, '0')}s`;
    return `${s}s`;
  };
  const formatDate = (d) => (d instanceof Date ? d : new Date(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const seedOf = (text) => [...String(text)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 233280, 7);

  // The record the battle hands over: { name, rival, team[], turns, kos: [yours, rival's], timeMs,
  // difficulty, master, tier, multiplier (number), rules[], date, serial }.
  function view(record) {
    const master = !!record.master;
    const theme = THEMES[master ? 'master' : 'standard'];
    const rows = [
      ['TURNS', String(record.turns)],
      ['KOs', `You ${record.kos[0]} · ${record.rival.split(' ')[0]} ${record.kos[1]}`],
      ['TIME', formatTime(record.timeMs)],
      ['DIFFICULTY', record.difficulty]
    ];
    return {
      master, theme, rows,
      unlock: master ? 'VOID CREST UNLOCKED' : 'CREST UNLOCKED',
      sub: master ? 'MASTER · RARE' : `${String(record.tier).toUpperCase()} · ×${Number(record.multiplier).toFixed(2)}`,
      status: master ? '> MASTER RUN COMPLETE' : '> CHAMPION RUN COMPLETE',
      grid: master ? VOID_CREST : CREST,
      palette: master ? VOID_PALETTE : { o: '#4a4638', G: TIER_COLOURS[record.tier] || TIER_COLOURS.Bronze, d: '#252836', W: '#ece3c8' },
      date: formatDate(record.date),
      alt: `Victory certificate. ${record.name} defeated ${record.rival} on ${record.difficulty} difficulty` +
        `${master ? '' : `, ${record.tier} tier, reward ×${Number(record.multiplier).toFixed(2)}`}, with ${record.team.join(', ')}. ` +
        `Rules: ${record.rules.length ? record.rules.join(', ') : 'standard'}. ${rows.map((r) => `${r[0]} ${r[1]}`).join('. ')}. ${formatDate(record.date)}. Serial ${record.serial}.`
    };
  }

  // Particles: the handoff's seeded LCG, seeded from the serial so each certificate keeps its field.
  function motes(seedText) {
    let r = seedOf(seedText);
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 26 }, () => {
      const size = 2 + rnd() * 3;
      return { size, left: rnd() * 100, top: 40 + rnd() * 65, dur: 6 + rnd() * 8, delay: -rnd() * 14 };
    });
  }

  // ---------- DOM (the 960 x 640 artboard) ----------
  function crestSvg(grid, palette, cls) {
    const w = grid[0].length;
    const rects = [];
    grid.forEach((row, y) => [...row].forEach((ch, x) => {
      if (palette[ch]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[ch]}"/>`);
    }));
    const span = h('span', { class: cls, 'aria-hidden': 'true' });
    span.innerHTML = `<svg width="${w * PX}" height="${grid.length * PX}" viewBox="0 0 ${w} ${grid.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
    return span;
  }

  function stage(record) {
    const v = view(record);
    const vars = Object.entries(v.theme).map(([k, c]) => `--c-${k}:${c}`).join(';');
    const t = (cls, text) => h('span', { class: cls, 'data-t': '', text });
    const row = ([label, value], last) => h('div', { class: `tvb-cert-row${last ? ' tvb-cert-row--last' : ''}`, 'data-rule': last ? null : '' },
      t('tvb-cert-label', label), t('tvb-cert-value', value));
    return h('div', { class: `tvb-cert${v.master ? ' tvb-cert--master' : ''}`, style: vars, role: 'img', 'aria-label': v.alt, 'data-seed': record.serial },
      v.master ? h('div', { class: 'tvb-cert-motes', 'aria-hidden': 'true' }, motes(record.serial).map((m) => h('i', {
        style: `left:${m.left}%;top:${m.top}%;width:${m.size}px;height:${m.size}px;box-shadow:0 0 ${m.size * 3}px ${MOTE};animation-duration:${m.dur}s;animation-delay:${m.delay}s`
      }))) : null,
      h('div', { class: 'tvb-cert-scan', 'aria-hidden': 'true' }),
      h('div', { class: 'tvb-cert-frame', 'aria-hidden': 'true' },
        h('div', { class: 'tvb-cert-badge' },
          crestSvg(v.grid, v.palette, 'tvb-cert-crest'),
          t('tvb-cert-unlock', v.unlock),
          t('tvb-cert-sub', v.sub)),
        h('div', { class: 'tvb-cert-body' },
          t('tvb-cert-status', v.status),
          h('div', { class: 'tvb-cert-title' }, t('', 'THE VERY'), t('', 'BEST')),
          h('div', { class: 'tvb-cert-certified' }, t('', 'Certified:'), ' ', t('tvb-cert-player', record.name)),
          h('div', { class: 'tvb-cert-team' }, record.team.map((name) => t('', name))),
          h('div', { class: 'tvb-cert-stats' }, v.rows.map((r) => row(r, false)), row([v.date, record.serial], true))),
        v.master ? h('div', { class: 'tvb-cert-sweep' }, h('i')) : null));
  }

  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) {
      fontsReady = new Promise((resolve) => {
        const link = h('link', { rel: 'stylesheet', href: FONTS });
        link.addEventListener('load', resolve);
        link.addEventListener('error', resolve);
        document.head.append(link);
      }).then(() => Promise.all(['900 50px Cinzel', '22px "Cormorant Garamond"', '400 16px Silkscreen']
        .map((f) => document.fonts.load(f).catch(() => null))));
    }
    return fontsReady;
  }

  // ---------- Canvas export ----------
  function paintGrid(ctx, grid, palette, x, y, px) {
    grid.forEach((row, gy) => [...row].forEach((ch, gx) => {
      if (!palette[ch]) return;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x + gx * px, y + gy * px, px, px);
    }));
  }
  function drawText(ctx, text, x, y, spacing) {
    if (!spacing) { ctx.fillText(text, x, y); return; }
    if ('letterSpacing' in ctx) { ctx.letterSpacing = `${spacing}px`; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; return; }
    [...text].forEach((ch) => { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; });
  }

  // Paints the mounted artboard `el` (any CSS scale) at 1920 x 1280.
  async function paint(el, record) {
    await loadFonts();
    const v = view(record);
    const th = v.theme;
    const S = EXPORT_SCALE;
    const base = el.getBoundingClientRect();
    const k = W / base.width;
    const box = (node) => { const r = node.getBoundingClientRect(); return { x: (r.left - base.left) * k, y: (r.top - base.top) * k, w: r.width * k, h: r.height * k }; };

    // Measure text: a zero-size inline-block at the start of each run sits on its baseline.
    const texts = [...el.querySelectorAll('[data-t]')].map((node) => {
      const probe = h('i', { style: 'display:inline-block;width:0;height:0;vertical-align:baseline' });
      node.prepend(probe);
      const p = box(probe);
      probe.remove();
      const cs = getComputedStyle(node);
      return { text: node.textContent, x: p.x, y: p.y + p.h, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, colour: cs.color, spacing: parseFloat(cs.letterSpacing) || 0 };
    });
    const frame = box(el.querySelector('.tvb-cert-frame'));
    const badge = box(el.querySelector('.tvb-cert-badge'));
    const crest = box(el.querySelector('.tvb-cert-crest svg'));
    const rules = [...el.querySelectorAll('[data-rule]')].map(box);

    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    if (v.master) {
      // Particles at t = 0 of their (negative-delay) loops.
      motes(record.serial).forEach((m) => {
        const p = ((-m.delay) % m.dur) / m.dur;
        const alpha = p < 0.2 ? (p / 0.2) * 0.9 : 0.9 * (1 - (p - 0.2) / 0.8);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = MOTE;
        ctx.shadowColor = MOTE;
        ctx.shadowBlur = m.size * 3 * S;
        ctx.beginPath();
        ctx.arc(m.left / 100 * W + m.size / 2, m.top / 100 * H - 200 * p + m.size / 2, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (let y = H - 2; y > -2; y -= 4) ctx.fillRect(0, y, W, 2);

    // Frame: glow (Master), the two outer rings, then the 8px border.
    if (v.master) {
      ctx.save();
      const clip = new Path2D();
      clip.rect(-100, -100, W + 200, H + 200);
      clip.rect(frame.x, frame.y, frame.w, frame.h);
      ctx.clip(clip, 'evenodd');
      ctx.shadowColor = 'rgba(196,168,255,.2)';
      ctx.shadowBlur = 60 * S;
      ctx.shadowOffsetX = 10000 * S;
      ctx.fillStyle = '#000';
      ctx.fillRect(frame.x - 10000, frame.y, frame.w, frame.h);
      ctx.restore();
    }
    const ring = (inset, colour) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.rect(frame.x - inset, frame.y - inset, frame.w + inset * 2, frame.h + inset * 2);
      ctx.rect(frame.x, frame.y, frame.w, frame.h);
      ctx.fill('evenodd');
    };
    ring(16, th.outer);
    ring(8, th.bg);
    ctx.fillStyle = th.frame;
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.rect(frame.x + 8, frame.y + 8, frame.w - 16, frame.h - 16);
    ctx.fill('evenodd');

    if (v.master) {
      const cx = badge.x + (badge.w - 4) / 2;
      const cy = badge.y + badge.h * 0.42;
      const far = Math.hypot(Math.max(cx - badge.x, badge.x + badge.w - 4 - cx), Math.max(cy - badge.y, badge.y + badge.h - cy));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, far * 0.6);
      g.addColorStop(0, 'rgba(196,168,255,.14)');
      g.addColorStop(1, 'rgba(196,168,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(badge.x, badge.y, badge.w, badge.h);
    }

    // The 4px dashed divider (12px dashes, 12px gaps, centred like the browser's border).
    ctx.fillStyle = th.divider;
    const dx = badge.x + badge.w - 4;
    const count = Math.max(1, Math.round((badge.h + 12) / 24));
    const dash = (badge.h - (count - 1) * 12) / count;
    for (let i = 0; i < count; i += 1) ctx.fillRect(dx, badge.y + i * (dash + 12), 4, dash);

    rules.forEach((r) => { ctx.fillStyle = th.rule; ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2); });

    // Crest: drawn crisp offscreen, then placed (Master with its glow at peak).
    const cols = v.grid[0].length;
    const off = document.createElement('canvas');
    off.width = cols * PX * S;
    off.height = v.grid.length * PX * S;
    paintGrid(off.getContext('2d'), v.grid, v.palette, 0, 0, PX * S);
    ctx.save();
    if (v.master) { ctx.shadowColor = 'rgba(196,168,255,.95)'; ctx.shadowBlur = 24 * S; }
    ctx.drawImage(off, crest.x, crest.y, cols * PX, v.grid.length * PX);
    ctx.restore();

    texts.forEach((t) => {
      ctx.font = t.font;
      ctx.fillStyle = t.colour;
      ctx.textBaseline = 'alphabetic';
      drawText(ctx, t.text, t.x, t.y, t.spacing);
    });
    return canvas;
  }

  const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));

  async function download(el, record) {
    const url = URL.createObjectURL(await toBlob(await paint(el, record)));
    const a = h('a', { href: url, download: `the-very-best-certificate-${record.serial}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Prints the PNG from a hidden frame: landscape, scaled to fit, dark background kept.
  async function print(el, record) {
    const url = URL.createObjectURL(await toBlob(await paint(el, record)));
    const frame = h('iframe', { title: 'Certificate print', 'aria-hidden': 'true', style: 'position:fixed;width:0;height:0;border:0;opacity:0' });
    const cleanup = () => { frame.remove(); URL.revokeObjectURL(url); };
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><title>The Very Best — Victory certificate</title>' +
      '<style>@page{size:landscape;margin:0}html,body{margin:0;height:100%;background:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      `body{display:grid;place-items:center}img{max-width:100vw;max-height:100vh;object-fit:contain}</style><img src="${url}" alt="">`;
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      const img = win.document.querySelector('img');
      const go = () => { win.addEventListener('afterprint', () => window.setTimeout(cleanup, 0), { once: true }); win.focus(); win.print(); window.setTimeout(cleanup, 60000); };
      if (img.complete) go(); else img.addEventListener('load', go, { once: true });
    }, { once: true });
    document.body.append(frame);
  }

  // ---------- The in-game modal ----------
  function open(record) {
    const T = window.TVB;
    loadFonts();
    const art = stage(record);
    const fit = h('div', { class: 'tvb-cert-fit' }, art);
    const status = h('p', { class: 'tvb-modal-text tvb-cert-note', role: 'status' });
    const busy = (label, job) => async () => {
      status.textContent = `${label}…`;
      try { await job(art, record); status.textContent = label === 'Saving' ? 'Certificate saved as a PNG.' : ''; } catch (_) { status.textContent = 'That didn’t work. Try again.'; }
    };
    const panel = T.openModal('Victory certificate', h('div', { class: 'tvb-cert-view' },
      fit,
      h('div', { class: 'tvb-row tvb-cert-actions' },
        T.btn('Download PNG', busy('Saving', download), { class: 'tvb-btn tvb-btn--go' }),
        T.btn('Print', busy('Preparing print', print)),
        T.btn('Close', () => T.closeModal(), { 'data-sound': 'back' })),
      status));
    panel.classList.add('tvb-modal--cert');
    const resize = () => {
      const s = Math.min(fit.clientWidth / W, fit.clientHeight / H) || 0;
      art.style.transform = `translate(${(fit.clientWidth - W * s) / 2}px, ${(fit.clientHeight - H * s) / 2}px) scale(${s})`;
    };
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(fit);
    return true;
  }

  window.TVBCertificate = { open, stage, paint, serial, formatTime };
}());

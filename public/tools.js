// Toolbox tools (image converter, password generator, tempo tap, QR code, key/BPM lookup, sample finder,
// signature creator, audio trimmer, PDF editor). Loaded by ensureTools() in ui-v2.js the first time the
// Toolbox comes near the screen or a tool opens, so none of this runs during page start-up. Each tool
// listens for toolmodalopen / toolmodalclose, which initToolbox dispatches on the modal it borrows.
// qrcode.js (QR Code Generator for JavaScript, (c) 2009 Kazuhiko Arase, MIT) is loaded alongside it.
/* ============ TOOL MODALS (generic open/close) ============ */
function closeToolModal(modal){
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.dispatchEvent(new CustomEvent('toolmodalclose'));
}
document.querySelectorAll('.tool-modal').forEach(modal => {
  modal.querySelectorAll('[data-close-tool]').forEach(btn => {
    btn.addEventListener('click', () => closeToolModal(modal));
  });
});
document.addEventListener('keydown', (e) => {
  if(e.key !== 'Escape') return;
  document.querySelectorAll('.tool-modal.open').forEach(modal => closeToolModal(modal));
});

/* ============ IMAGE CONVERTER ============ */
(() => {
  const FORMAT_MIME = { png:'image/png', jpeg:'image/jpeg', webp:'image/webp' };
  const FORMAT_EXT = { png:'png', jpeg:'jpg', webp:'webp' };

  const drop = document.getElementById('convDrop');
  const fileInput = document.getElementById('convFileInput');
  const list = document.getElementById('convList');
  const formatOpts = document.getElementById('convFormatOpts');
  const qualityWrap = document.getElementById('convQualityWrap');
  const qualityInput = document.getElementById('convQuality');
  const qualityVal = document.getElementById('convQualityVal');

  if(!drop) return; // converter markup not on this page

  let format = 'png';
  const items = new Map(); // id -> { file, img, thumbEl, sizeEl, statusEl, downloadEl, convertedUrl }
  let nextId = 0;

  function formatBytes(bytes){
    if(bytes < 1024) return bytes + ' B';
    if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setFormat(f){
    format = f;
    formatOpts.querySelectorAll('.conv-format-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.format === f));
    qualityWrap.hidden = (f === 'png');
    items.forEach(item => convertItem(item));
  }

  formatOpts.querySelectorAll('.conv-format-btn').forEach(btn => {
    btn.addEventListener('click', () => setFormat(btn.dataset.format));
  });

  qualityInput.addEventListener('input', () => {
    qualityVal.textContent = Math.round(qualityInput.value * 100) + '%';
  });
  qualityInput.addEventListener('change', () => {
    items.forEach(item => convertItem(item));
  });

  function convertItem(item){
    item.statusEl.textContent = 'Converting…';
    item.downloadEl.setAttribute('aria-disabled', 'true');
    const canvas = document.createElement('canvas');
    canvas.width = item.img.naturalWidth;
    canvas.height = item.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if(format === 'jpeg'){ // jpeg has no alpha channel — flatten onto white first
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(item.img, 0, 0);
    const quality = Number(qualityInput.value);
    canvas.toBlob((blob) => {
      if(!blob){ item.statusEl.textContent = 'Conversion failed'; return; }
      if(item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
      item.convertedUrl = URL.createObjectURL(blob);
      const ext = FORMAT_EXT[format];
      const baseName = item.file.name.replace(/\.[^.]+$/, '');
      item.downloadEl.href = item.convertedUrl;
      item.downloadEl.download = `${baseName}.${ext}`;
      item.downloadEl.removeAttribute('aria-disabled');
      item.statusEl.textContent = '';
      item.sizeEl.textContent = `${formatBytes(item.file.size)} → ${formatBytes(blob.size)}`;
    }, FORMAT_MIME[format], format === 'png' ? undefined : quality);
  }

  function addFiles(fileList){
    Array.from(fileList).filter(f => f.type.startsWith('image/')).forEach(file => {
      const id = nextId++;
      const el = document.createElement('div');
      el.className = 'conv-item';
      el.innerHTML = `
        <img class="conv-item-thumb" alt="">
        <div class="conv-item-meta">
          <span class="conv-item-name"></span>
          <span class="conv-item-size"></span>
        </div>
        <div class="conv-item-actions">
          <span class="conv-item-status">Loading…</span>
          <a class="conv-item-download" aria-disabled="true">Download</a>
          <button class="conv-item-remove" aria-label="Remove">&#10005;</button>
        </div>`;
      list.appendChild(el);

      const thumbEl = el.querySelector('.conv-item-thumb');
      const nameEl = el.querySelector('.conv-item-name');
      const sizeEl = el.querySelector('.conv-item-size');
      const statusEl = el.querySelector('.conv-item-status');
      const downloadEl = el.querySelector('.conv-item-download');
      const removeBtn = el.querySelector('.conv-item-remove');

      nameEl.textContent = file.name;
      const originalUrl = URL.createObjectURL(file);
      thumbEl.src = originalUrl;

      const item = { file, img:null, thumbEl, nameEl, sizeEl, statusEl, downloadEl, convertedUrl:null };
      items.set(id, item);

      removeBtn.addEventListener('click', () => {
        if(item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
        URL.revokeObjectURL(originalUrl);
        items.delete(id);
        el.remove();
      });

      const img = new Image();
      img.onload = () => { item.img = img; convertItem(item); };
      img.onerror = () => { statusEl.textContent = 'Could not read image'; };
      img.src = originalUrl;
    });
  }

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

  ['dragenter', 'dragover'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if(e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // stop stray drags outside the drop zone from navigating the whole page away
  ['dragover', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => { if(e.target !== drop) e.preventDefault(); });
  });
})();

/* ============ PASSWORD GENERATOR ============ */
(() => {
  const valueEl = document.getElementById('pwgenValue');
  const copyBtn = document.getElementById('pwgenCopy');
  const lengthInput = document.getElementById('pwgenLength');
  const lengthVal = document.getElementById('pwgenLengthVal');
  const regenBtn = document.getElementById('pwgenRegenerate');
  const upperEl = document.getElementById('pwgenUpper');
  const lowerEl = document.getElementById('pwgenLower');
  const numEl = document.getElementById('pwgenNumbers');
  const symEl = document.getElementById('pwgenSymbols');
  if(!valueEl) return;

  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  function randomInt(max){
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  function generate(){
    const pools = [];
    if(upperEl.checked) pools.push(SETS.upper);
    if(lowerEl.checked) pools.push(SETS.lower);
    if(numEl.checked) pools.push(SETS.numbers);
    if(symEl.checked) pools.push(SETS.symbols);
    if(!pools.length){ valueEl.textContent = 'Select at least one character type'; return; }

    const alphabet = pools.join('');
    const length = Math.max(Number(lengthInput.value), pools.length);
    const out = Array.from({ length }, () => alphabet[randomInt(alphabet.length)]);

    // guarantee at least one char from each selected pool, then shuffle
    pools.forEach((pool, i) => { out[i] = pool[randomInt(pool.length)]; });
    for(let i = out.length - 1; i > 0; i--){
      const j = randomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }

    valueEl.textContent = out.join('');
  }

  lengthInput.addEventListener('input', () => { lengthVal.textContent = lengthInput.value; generate(); });
  [upperEl, lowerEl, numEl, symEl].forEach(el => el.addEventListener('change', generate));
  regenBtn.addEventListener('click', generate);

  document.getElementById('passwordGenModal').addEventListener('toolmodalopen', generate);

  copyBtn.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(valueEl.textContent);
      copyBtn.textContent = 'Copied';
    }catch(e){
      copyBtn.textContent = 'Failed';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
  });

  generate();
})();

/* ============ TEMPO TAP ============ */
(() => {
  const modal = document.getElementById('tempoTapModal');
  const pad = document.getElementById('tempoPad');
  const bpmEl = document.getElementById('tempoBpm');
  const tapsEl = document.getElementById('tempoTaps');
  const resetBtn = document.getElementById('tempoReset');
  if(!modal) return;

  const RESET_GAP_MS = 2000;
  const MAX_SAMPLES = 8;
  let taps = [];
  let tapCount = 0;
  let resetTimer = null;

  function resetState(){
    taps = [];
    tapCount = 0;
    bpmEl.textContent = '—';
    tapsEl.textContent = '0 taps';
    clearTimeout(resetTimer);
  }

  function tap(){
    const now = performance.now();
    if(taps.length && now - taps[taps.length - 1] > RESET_GAP_MS){
      taps = [];
      tapCount = 0;
    }
    taps.push(now);
    if(taps.length > MAX_SAMPLES) taps.shift();
    tapCount++;

    if(taps.length >= 2){
      const intervals = [];
      for(let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      bpmEl.textContent = Math.round(60000 / avg);
    }
    tapsEl.textContent = `${tapCount} tap${tapCount === 1 ? '' : 's'}`;

    pad.classList.remove('pulse');
    void pad.offsetWidth;
    pad.classList.add('pulse');

    clearTimeout(resetTimer);
    resetTimer = setTimeout(resetState, RESET_GAP_MS);
  }

  pad.addEventListener('click', tap);
  resetBtn.addEventListener('click', resetState);

  document.addEventListener('keydown', (e) => {
    if(!modal.classList.contains('open')) return;
    if(e.key === ' ' || e.code === 'Space'){
      e.preventDefault();
      tap();
    }
  });

  document.getElementById('tempoTapModal').addEventListener('toolmodalopen', resetState);
})();

/* ============ QR CODE GENERATOR ============ */
(() => {
  const modal = document.getElementById('qrGenModal');
  const input = document.getElementById('qrInput');
  const canvas = document.getElementById('qrCanvas');
  const emptyState = document.getElementById('qrEmptyState');
  const downloadBtn = document.getElementById('qrDownload');
  if(!modal) return;

  const CELL_SIZE = 6;
  const MARGIN = 2;
  let debounceTimer = null;

  function render(){
    const text = input.value.trim();
    if(!text){
      canvas.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = 'Paste something above to generate a code';
      downloadBtn.disabled = true;
      return;
    }

    try{
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();

      const moduleCount = qr.getModuleCount();
      const size = (moduleCount + MARGIN * 2) * CELL_SIZE;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for(let row = 0; row < moduleCount; row++){
        for(let col = 0; col < moduleCount; col++){
          if(qr.isDark(row, col)){
            ctx.fillRect((col + MARGIN) * CELL_SIZE, (row + MARGIN) * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          }
        }
      }

      canvas.hidden = false;
      emptyState.hidden = true;
      downloadBtn.disabled = false;
    }catch(e){
      canvas.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = 'Too much text to encode — try something shorter';
      downloadBtn.disabled = true;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  });

  downloadBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'qr-code.png';
    a.click();
  });

  document.getElementById('qrGenModal').addEventListener('toolmodalopen', () => setTimeout(() => input.focus(), 50));
})();

/* ============ KEY / BPM LOOKUP ============ */
(() => {
  const modal = document.getElementById('bpmLookupModal');
  const form = document.getElementById('bpmSearchForm');
  const input = document.getElementById('bpmQueryInput');
  const searchBtn = document.getElementById('bpmSearchBtn');
  const results = document.getElementById('bpmResults');
  if(!modal) return;

  function setMessage(text){
    results.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'bpm-empty';
    span.textContent = text;
    results.appendChild(span);
  }

  function renderResults(songs){
    results.innerHTML = '';
    if(!songs.length){
      setMessage('No matches — try a different title or spelling');
      return;
    }
    songs.forEach(song => {
      const row = document.createElement('div');
      row.className = 'bpm-item';

      const info = document.createElement('div');
      info.className = 'bpm-item-info';
      const title = document.createElement('div');
      title.className = 'bpm-item-title';
      title.textContent = song.title || 'Untitled';
      const artist = document.createElement('div');
      artist.className = 'bpm-item-artist';
      artist.textContent = song.artist || '';
      info.append(title, artist);

      const stats = document.createElement('div');
      stats.className = 'bpm-item-stats';

      const bpmStat = document.createElement('div');
      bpmStat.className = 'bpm-stat';
      bpmStat.innerHTML = `${song.tempo != null ? song.tempo : '&mdash;'}<span>BPM</span>`;

      const keyStat = document.createElement('div');
      keyStat.className = 'bpm-stat';
      keyStat.innerHTML = `${song.key || '&mdash;'}<span>Key</span>`;

      stats.append(bpmStat, keyStat);
      row.append(info, stats);
      results.appendChild(row);
    });
  }

  async function search(){
    const q = input.value.trim();
    if(!q) return;

    searchBtn.disabled = true;
    setMessage('Searching…');

    try{
      const res = await fetch(`/api/bpm-lookup?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
      renderResults(data.results || []);
    }catch(e){
      setMessage('Lookup unavailable right now — try again in a moment');
    }finally{
      searchBtn.disabled = false;
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    search();
  });

  document.getElementById('bpmLookupModal').addEventListener('toolmodalopen', () => setTimeout(() => input.focus(), 50));
})();

/* ============ SAMPLE FINDER ============ */
(() => {
  const modal = document.getElementById('sampleFinderModal');
  const form = document.getElementById('sampleSearchForm');
  const input = document.getElementById('sampleQueryInput');
  const bpmMin = document.getElementById('sampleBpmMin');
  const bpmMax = document.getElementById('sampleBpmMax');
  const searchBtn = document.getElementById('sampleSearchBtn');
  const results = document.getElementById('sampleResults');
  const modeBtns = modal ? modal.querySelectorAll('.sample-mode-btn') : [];
  if(!modal) return;

  let mode = 'vocals';

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      modeBtns.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    });
  });

  function setMessage(text){
    results.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'bpm-empty';
    span.textContent = text;
    results.appendChild(span);
  }

  function renderResults(samples){
    results.innerHTML = '';
    if(!samples.length){
      setMessage('No matches — try a different keyword or BPM range');
      return;
    }
    samples.forEach(sample => {
      const row = document.createElement('div');
      row.className = 'sample-item';

      const head = document.createElement('div');
      head.className = 'sample-item-head';
      const name = document.createElement('div');
      name.className = 'sample-item-name';
      name.textContent = sample.name || 'Untitled';
      const user = document.createElement('div');
      user.className = 'sample-item-user';
      user.textContent = sample.username || '';
      head.append(name, user);
      row.appendChild(head);

      if(sample.tags && sample.tags.length){
        const tags = document.createElement('div');
        tags.className = 'sample-item-tags';
        tags.textContent = sample.tags.join(', ');
        row.appendChild(tags);
      }

      const meta = document.createElement('div');
      meta.className = 'sample-item-meta';
      if(sample.duration){
        const d = document.createElement('span');
        d.className = 'sample-badge';
        d.textContent = sample.duration;
        meta.appendChild(d);
      }
      if(sample.bpm){
        const b = document.createElement('span');
        b.className = 'sample-badge';
        b.textContent = `${sample.bpm} BPM`;
        meta.appendChild(b);
      }
      if(sample.license){
        const l = document.createElement('span');
        l.className = 'sample-badge';
        l.textContent = sample.license;
        meta.appendChild(l);
      }
      row.appendChild(meta);

      if(sample.previewUrl){
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = sample.previewUrl;
        row.appendChild(audio);
      }

      if(sample.pageUrl){
        const link = document.createElement('a');
        link.className = 'sample-item-link';
        link.href = sample.pageUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'View on Freesound →';
        row.appendChild(link);
      }

      results.appendChild(row);
    });
  }

  async function search(){
    searchBtn.disabled = true;
    setMessage('Searching…');

    try{
      const params = new URLSearchParams({ mode, q: input.value.trim() });
      if(bpmMin.value) params.set('bpm_min', bpmMin.value);
      if(bpmMax.value) params.set('bpm_max', bpmMax.value);
      const res = await fetch(`/api/sample-search?${params.toString()}`);
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
      renderResults(data.results || []);
    }catch(e){
      setMessage('Lookup unavailable right now — try again in a moment');
    }finally{
      searchBtn.disabled = false;
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    search();
  });

  document.getElementById('sampleFinderModal').addEventListener('toolmodalopen', () => setTimeout(() => input.focus(), 50));
})();

/* ============ SIGNATURE CREATOR ============ */
(() => {
  const modal = document.getElementById('sigCreatorModal');
  const input = document.getElementById('sigNameInput');
  const preview = document.getElementById('sigPreview');
  const regenBtn = document.getElementById('sigRegenerateBtn');
  const downloadBtn = document.getElementById('sigDownloadBtn');
  const status = document.getElementById('sigStatus');
  if(!modal) return;

  // Curated for a loose, illegible, loop-heavy "professional scrawl" — not tidy readable
  // script. Trimmed to fonts sharing WindSong/Mrs Saint Delafield's thin, fast-flowing DNA
  // (user's explicit favorites) — Beau Rivage (too formal/calligraphic) and Meddon (too bold/
  // heavy) dropped for not matching that register. Verified each exists on Google Fonts before
  // picking (fonts.googleapis.com/css2 returned 200 for all) rather than trusting names from memory.
  const SIG_FONTS = ['Kristi', 'WindSong', 'Herr Von Muellerhoff', 'Mrs Saint Delafield'];

  const fontCache = new Map();
  let opentypeReady = null;
  let wawoffReady = null;
  let currentSvgMarkup = '';
  let debounceTimer = null;

  function loadScriptOnce(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function ensureOpentype(){
    if(!opentypeReady){
      opentypeReady = (typeof window.opentype !== 'undefined')
        ? Promise.resolve()
        : loadScriptOnce('lib/opentype.min.js');
    }
    return opentypeReady;
  }

  // opentype.js can't parse WOFF2 (Brotli) directly — decompress to TTF first via wawoff2's
  // WASM build (vendored, WASM is base64-embedded so this is fully self-contained, no runtime
  // CDN dependency). Pattern matches the library's own officially documented WOFF2 recipe.
  function ensureWawoff2(){
    if(!wawoffReady){
      wawoffReady = new Promise((resolve, reject) => {
        if(window.Module && typeof window.Module.decompress === 'function'){ resolve(); return; }
        window.Module = { onRuntimeInitialized: resolve };
        loadScriptOnce('lib/wawoff2.decompress.js').catch(reject);
      });
    }
    return wawoffReady;
  }

  async function loadSigFont(family){
    if(fontCache.has(family)) return fontCache.get(family);
    await Promise.all([ensureOpentype(), ensureWawoff2()]);

    const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`);
    if(!cssRes.ok) throw new Error(`Font CSS fetch failed (${cssRes.status})`);
    const css = await cssRes.text();
    // Google's css2 response lists one @font-face block per unicode-range subset (latin,
    // latin-ext, vietnamese, ...), NOT always with "latin" first — grabbing the first url()
    // blindly can land on a subset missing basic A-Z glyphs entirely (hit this live: Meddon
    // lists latin-ext before latin, so the naive first-match font had zero letters). Target
    // the block Google tags "/* latin */" specifically, since that's the one guaranteed to
    // cover basic ASCII; fall back to scanning for the U+0000-00FF unicode-range if the
    // comment isn't present, then to the first match as a last resort.
    const latinBlock = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{[^}]*\}/i.exec(css);
    const rangeBlock = !latinBlock && /@font-face\s*\{[^}]*U\+0000-00FF[^}]*\}/i.exec(css);
    const scope = (latinBlock && latinBlock[0]) || (rangeBlock && rangeBlock[0]) || css;
    const match = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(scope);
    if(!match) throw new Error('No woff2 URL found in font CSS');

    const woff2Buf = await (await fetch(match[1])).arrayBuffer();
    const ttfBuf = window.Module.decompress(woff2Buf);
    if(ttfBuf === false || !ttfBuf) throw new Error('WOFF2 decompression failed');

    const font = window.opentype.parse(ttfBuf);
    fontCache.set(family, font);
    return font;
  }

  function randRange(min, max){ return min + Math.random() * (max - min); }
  function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  // Walks the raw glyph path commands to find where the pen actually starts and finishes —
  // the first M and the last drawn point. Anchoring the flourish to these exact coordinates
  // (rather than numbers derived purely from the bounding box) is what makes it read as one
  // continuous stroke instead of a decorative shape bolted on nearby; a real fast signature's
  // trailing dash leaves from the literal end of the last letter, not from "somewhere near it."
  function getPathEndpoints(path){
    const cmds = path.commands;
    let start = null, end = null;
    for(const c of cmds){
      if(c.type === 'M' && !start) start = { x: c.x, y: c.y };
      if(typeof c.x === 'number') end = { x: c.x, y: c.y };
    }
    return { start: start || {x:0,y:0}, end: end || {x:0,y:0} };
  }

  // Fast, careless "signed a thousand of these today" scribble — a delivery-driver or
  // celebrity-signing-line signature, not elegant calligraphy. Real fast signatures are
  // built from a small number of DECISIVE strokes, each one continuous with the letters
  // (no separate geometric shapes floating nearby), and end in a quick flick or flat dash
  // rather than a big double loop. Every stroke below starts or ends at the glyph path's
  // own real start/end point for exactly that reason.
  function buildFlourish(bbox, fontSize, startPt, endPt){
    const w = Math.max(bbox.x2 - bbox.x1, fontSize);
    const paths = [];

    // terminal stroke — leaves from the literal last point of the last letter, whips up or
    // down fast, and either trails off flat or (sometimes) flicks back in one tight motion.
    // This is the single most important stroke for the "just signed it fast" read.
    const dir = Math.random() < 0.5 ? 1 : -1;
    const reach = fontSize * randRange(1.1, 1.9);
    const midX = endPt.x + reach * 0.4;
    const midY = endPt.y + dir * fontSize * randRange(0.35, 0.7);
    const tailX = endPt.x + reach;
    const tailY = endPt.y - dir * fontSize * randRange(0.05, 0.3);

    paths.push(
      `M ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)} ` +
      `Q ${midX.toFixed(1)} ${midY.toFixed(1)}, ${tailX.toFixed(1)} ${tailY.toFixed(1)}`
    );

    // occasionally the trail whips back into one small, tight terminal loop instead of
    // trailing straight off — never a second big loop, just a quick flick-back
    if(Math.random() < 0.35){
      const r = fontSize * randRange(0.16, 0.28);
      paths.push(
        `M ${tailX.toFixed(1)} ${tailY.toFixed(1)} ` +
        `C ${(tailX + r*1.3).toFixed(1)} ${(tailY - dir*r).toFixed(1)}, ${(tailX + r*0.1).toFixed(1)} ${(tailY - dir*r*1.6).toFixed(1)}, ${(tailX - r*0.6).toFixed(1)} ${(tailY - dir*r*0.5).toFixed(1)}`
      );
    }

    // entry lead-in — a short quick dash straight into the first letter's actual start
    // point, not a decorative loop hovering near it
    if(Math.random() < 0.5){
      const backX = startPt.x - fontSize * randRange(0.3, 0.55);
      const backY = startPt.y - fontSize * randRange(0.15, 0.4) * (Math.random() < 0.5 ? 1 : -1);
      paths.push(
        `M ${backX.toFixed(1)} ${backY.toFixed(1)} ` +
        `Q ${(backX + fontSize*0.18).toFixed(1)} ${(startPt.y - fontSize*0.05).toFixed(1)}, ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)}`
      );
    }

    // a fast, mostly-flat dash under the name — thin and slightly wavy, not a big dipping
    // swoop that loops back on itself. This is the quick underline-slash real signatures
    // almost always end with.
    if(Math.random() < 0.7){
      const uY = bbox.y2 + fontSize * randRange(0.12, 0.28);
      const uStartX = bbox.x1 + w * randRange(-0.02, 0.08);
      const uEndX = bbox.x2 + w * randRange(0.04, 0.16);
      const bow = fontSize * randRange(0.08, 0.22) * (Math.random() < 0.5 ? 1 : -1);
      paths.push(
        `M ${uStartX.toFixed(1)} ${uY.toFixed(1)} ` +
        `Q ${((uStartX+uEndX)/2).toFixed(1)} ${(uY+bow).toFixed(1)}, ${uEndX.toFixed(1)} ${(uY - fontSize*0.05).toFixed(1)}`
      );
    }

    return paths.join(' ');
  }

  function buildSignatureSVG(text, font, fontSize, skewDeg, squeezeX){
    const path = font.getPath(text, 0, 0, fontSize, { kerning: true, features: { liga: true, rlig: true } });
    const bbox = path.getBoundingBox();
    const glyphD = path.toPathData(2);
    const { start, end } = getPathEndpoints(path);

    // flourish is positioned against the squeezed bbox/endpoints so it hugs the text as it
    // actually renders (post letter-compression), not the wider pre-squeeze layout
    const sBbox = { x1: bbox.x1 * squeezeX, x2: bbox.x2 * squeezeX, y1: bbox.y1, y2: bbox.y2 };
    const sStart = { x: start.x * squeezeX, y: start.y };
    const sEnd = { x: end.x * squeezeX, y: end.y };
    const flourishD = buildFlourish(sBbox, fontSize, sStart, sEnd);

    const pad = fontSize * 1.5;
    const vbX = (sBbox.x1 - pad).toFixed(1);
    const vbY = (sBbox.y1 - pad*1.5).toFixed(1);
    const vbW = ((sBbox.x2 - sBbox.x1) + pad*3.2).toFixed(1);
    const vbH = ((sBbox.y2 - sBbox.y1) + pad*3.0).toFixed(1);
    const strokeW = (fontSize * 0.045).toFixed(2);

    return `<svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">` +
      `<g transform="skewX(${skewDeg.toFixed(1)})">` +
      `<g transform="scale(${squeezeX.toFixed(2)},1)"><path d="${glyphD}" fill="#000"/></g>` +
      `<path d="${flourishD}" fill="none" stroke="#000" stroke-width="${strokeW}" stroke-linecap="round"/>` +
      `</g></svg>`;
  }

  function setStatus(text){ status.textContent = text; }

  function showEmpty(text){
    preview.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'sig-preview-empty';
    span.textContent = text;
    preview.appendChild(span);
    downloadBtn.disabled = true;
    currentSvgMarkup = '';
  }

  async function regenerate(){
    const name = input.value.trim();
    if(!name){ showEmpty('Type a name above to generate a signature'); setStatus(''); return; }

    regenBtn.disabled = true;
    setStatus('Loading font…');

    try{
      const family = pick(SIG_FONTS);
      const font = await loadSigFont(family);
      const fontSize = randRange(70, 92);
      const skew = randRange(-10, 3);
      const squeezeX = randRange(0.68, 0.85);
      const svg = buildSignatureSVG(name, font, fontSize, skew, squeezeX);
      preview.innerHTML = svg;
      currentSvgMarkup = svg;
      downloadBtn.disabled = false;
      setStatus(family);
    }catch(e){
      setStatus('Could not generate — try again');
    }finally{
      regenBtn.disabled = false;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const name = input.value.trim();
    if(!name){ showEmpty('Type a name above to generate a signature'); setStatus(''); return; }
    debounceTimer = setTimeout(regenerate, 500);
  });

  regenBtn.addEventListener('click', regenerate);

  downloadBtn.addEventListener('click', () => {
    if(!currentSvgMarkup) return;
    const blob = new Blob([currentSvgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = input.value.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'signature';
    a.href = url;
    a.download = `${safeName}-signature.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById('sigCreatorModal').addEventListener('toolmodalopen', () => setTimeout(() => input.focus(), 50));
})();

/* ============ AUDIO TRIMMER ============ */
(() => {
  const modal = document.getElementById('audioTrimModal');
  const drop = document.getElementById('trimDrop');
  const dropText = document.getElementById('trimDropText');
  const fileInput = document.getElementById('trimFileInput');
  const editor = document.getElementById('trimEditor');
  const waveWrap = document.getElementById('trimWaveWrap');
  const waveCanvas = document.getElementById('trimWave');
  const shadeLeft = document.getElementById('trimShadeLeft');
  const shadeRight = document.getElementById('trimShadeRight');
  const handleStart = document.getElementById('trimHandleStart');
  const handleEnd = document.getElementById('trimHandleEnd');
  const startVal = document.getElementById('trimStartVal');
  const endVal = document.getElementById('trimEndVal');
  const selLength = document.getElementById('trimSelLength');
  const playBtn = document.getElementById('trimPlay');
  const loopBtn = document.getElementById('trimLoop');
  const downloadBtn = document.getElementById('trimDownload');
  if(!modal) return;

  const MIN_GAP = 0.05;
  let audioCtx = null;
  let decodedBuffer = null;
  let playingSource = null;
  let playMode = null; // null | 'once' | 'loop'
  let selStart = 0;
  let selEnd = 0;
  let dragging = null;

  function formatTime(sec){
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  function drawWaveform(buffer){
    const ctx = waveCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = waveWrap.clientWidth;
    const height = waveWrap.clientHeight;
    waveCanvas.width = width * dpr;
    waveCanvas.height = height * dpr;
    waveCanvas.style.width = width + 'px';
    waveCanvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const data = buffer.getChannelData(0);
    const step = data.length / width;
    const mid = height / 2;

    // Peak-normalise the display: scale so the loudest sample reaches HEADROOM of the
    // half-height. Quiet tracks get amplified up to be legible; loud/compressed tracks
    // get pulled in from the edges. Kept well under 1 so even peaks sit clear of the
    // top/bottom edges and the peaks/troughs stay readable within the zone.
    const HEADROOM = 0.7;
    let peak = 0;
    for(let i = 0; i < data.length; i++){
      const a = data[i] < 0 ? -data[i] : data[i];
      if(a > peak) peak = a;
    }
    const scale = peak > 0 ? (HEADROOM / peak) : 1;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#F2F2F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x = 0; x < width; x++){
      let min = 1, max = -1;
      const from = Math.floor(x * step);
      const to = Math.max(from + 1, Math.floor((x + 1) * step));
      for(let i = from; i < to && i < data.length; i++){
        const v = data[i];
        if(v < min) min = v;
        if(v > max) max = v;
      }
      if(min > max){ min = 0; max = 0; }
      ctx.moveTo(x + 0.5, mid + min * mid * scale);
      ctx.lineTo(x + 0.5, mid + max * mid * scale);
    }
    ctx.stroke();
  }

  function updateLabels(){
    startVal.textContent = formatTime(selStart);
    endVal.textContent = formatTime(selEnd);
    selLength.textContent = `Selection: ${formatTime(Math.max(0, selEnd - selStart))}`;
  }

  function updateHandlePositions(){
    if(!decodedBuffer) return;
    const duration = decodedBuffer.duration;
    const width = waveWrap.clientWidth;
    const startX = (selStart / duration) * width;
    const endX = (selEnd / duration) * width;
    handleStart.style.left = startX + 'px';
    handleEnd.style.left = endX + 'px';
    shadeLeft.style.width = startX + 'px';
    shadeRight.style.width = (width - endX) + 'px';
    handleStart.setAttribute('aria-valuemax', String(duration));
    handleStart.setAttribute('aria-valuenow', String(selStart));
    handleEnd.setAttribute('aria-valuemax', String(duration));
    handleEnd.setAttribute('aria-valuenow', String(selEnd));
  }

  function refreshPlayButtons(){
    if(playMode === 'once'){ playBtn.textContent = 'Stop'; playBtn.classList.add('active'); }
    else { playBtn.textContent = 'Play'; playBtn.classList.remove('active'); }
    if(playMode === 'loop'){ loopBtn.textContent = '● Looping'; loopBtn.classList.add('looping'); }
    else { loopBtn.textContent = 'Loop'; loopBtn.classList.remove('looping'); }
  }

  function stopPlayback(){
    if(playingSource){
      playingSource.onended = null;
      try{ playingSource.stop(); }catch(e){}
      playingSource = null;
    }
    playMode = null;
    refreshPlayButtons();
  }

  function startPlayback(loop){
    if(!decodedBuffer) return;
    if(playingSource){
      playingSource.onended = null;
      try{ playingSource.stop(); }catch(e){}
      playingSource = null;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = getTrimmedBuffer();
    source.loop = loop;
    source.connect(audioCtx.destination);
    source.onended = () => {
      if(playingSource === source){ playingSource = null; playMode = null; refreshPlayButtons(); }
    };
    source.start();
    playingSource = source;
    playMode = loop ? 'loop' : 'once';
    refreshPlayButtons();
  }

  function loadFile(file){
    if(!file || !file.type.startsWith('audio/')) return;
    dropText.textContent = `Decoding ${file.name}…`;

    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    file.arrayBuffer()
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(buffer => {
        stopPlayback();
        decodedBuffer = buffer;
        dropText.textContent = `Loaded: ${file.name}`;
        editor.hidden = false;

        selStart = 0;
        selEnd = buffer.duration;

        updateLabels();
        drawWaveform(buffer);
        updateHandlePositions();
      })
      .catch(() => {
        dropText.textContent = 'Could not decode that file — try a different audio file.';
        editor.hidden = true;
        decodedBuffer = null;
      });
  }

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => { if(fileInput.files[0]) loadFile(fileInput.files[0]); });

  ['dragenter', 'dragover'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if(e.dataTransfer && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  function timeFromClientX(clientX){
    const rect = waveWrap.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * decodedBuffer.duration;
  }

  function onPointerMove(e){
    if(!dragging || !decodedBuffer) return;
    const t = timeFromClientX(e.clientX);
    if(dragging === 'start'){
      selStart = Math.max(0, Math.min(t, selEnd - MIN_GAP));
    } else {
      selEnd = Math.min(decodedBuffer.duration, Math.max(t, selStart + MIN_GAP));
    }
    updateLabels();
    updateHandlePositions();
  }

  function stopDragging(){
    if(!dragging) return;
    dragging = null;
    handleStart.classList.remove('dragging');
    handleEnd.classList.remove('dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
  }

  function startDragging(which){
    return (e) => {
      if(!decodedBuffer) return;
      e.preventDefault();
      dragging = which;
      stopPlayback();
      (which === 'start' ? handleStart : handleEnd).classList.add('dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopDragging);
    };
  }

  handleStart.addEventListener('pointerdown', startDragging('start'));
  handleEnd.addEventListener('pointerdown', startDragging('end'));

  function nudge(which, deltaSec){
    if(!decodedBuffer) return;
    if(which === 'start'){
      selStart = Math.min(Math.max(0, selStart + deltaSec), selEnd - MIN_GAP);
    } else {
      selEnd = Math.max(Math.min(decodedBuffer.duration, selEnd + deltaSec), selStart + MIN_GAP);
    }
    updateLabels();
    updateHandlePositions();
    // keep audio in sync while fine-tuning, so you hear each 0.1s adjustment
    if(playMode) startPlayback(playMode === 'loop');
  }
  handleStart.addEventListener('keydown', (e) => {
    if(e.key === 'ArrowLeft'){ e.preventDefault(); nudge('start', -0.1); }
    if(e.key === 'ArrowRight'){ e.preventDefault(); nudge('start', 0.1); }
  });
  handleEnd.addEventListener('keydown', (e) => {
    if(e.key === 'ArrowLeft'){ e.preventDefault(); nudge('end', -0.1); }
    if(e.key === 'ArrowRight'){ e.preventDefault(); nudge('end', 0.1); }
  });

  modal.querySelectorAll('.trim-nudge-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      nudge(btn.dataset.edge, 0.1 * Number(btn.dataset.dir));
    });
  });

  window.addEventListener('resize', () => {
    if(decodedBuffer && !editor.hidden){
      drawWaveform(decodedBuffer);
      updateHandlePositions();
    }
  });

  function getTrimmedBuffer(){
    const sampleRate = decodedBuffer.sampleRate;
    const startSample = Math.floor(selStart * sampleRate);
    const endSample = Math.floor(selEnd * sampleRate);
    const frameCount = Math.max(1, endSample - startSample);

    const trimmed = audioCtx.createBuffer(decodedBuffer.numberOfChannels, frameCount, sampleRate);
    for(let ch = 0; ch < decodedBuffer.numberOfChannels; ch++){
      const srcData = decodedBuffer.getChannelData(ch);
      const destData = trimmed.getChannelData(ch);
      destData.set(srcData.subarray(startSample, startSample + frameCount));
    }
    return trimmed;
  }

  playBtn.addEventListener('click', () => {
    if(!decodedBuffer) return;
    if(playMode === 'once') stopPlayback();
    else startPlayback(false);
  });

  loopBtn.addEventListener('click', () => {
    if(!decodedBuffer) return;
    if(playMode === 'loop') stopPlayback();
    else startPlayback(true);
  });

  modal.addEventListener('toolmodalclose', stopPlayback);

  function encodeWav(buffer){
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const blockAlign = numChannels * 2;
    const dataSize = numFrames * blockAlign;

    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset, str){
      for(let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData = [];
    for(let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

    let offset = 44;
    for(let i = 0; i < numFrames; i++){
      for(let ch = 0; ch < numChannels; ch++){
        let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  downloadBtn.addEventListener('click', () => {
    if(!decodedBuffer) return;
    const trimmed = getTrimmedBuffer();
    const blob = encodeWav(trimmed);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trimmed-clip.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  document.getElementById('audioTrimModal').addEventListener('toolmodalopen', stopPlayback);
})();

/* ============ PDF EDITOR ============ */
(() => {
  const modal = document.getElementById('pdfEditorModal');
  const drop = document.getElementById('pdfedDrop');
  const dropText = document.getElementById('pdfedDropText');
  const fileInput = document.getElementById('pdfedFileInput');
  const insertInput = document.getElementById('pdfedInsertInput');
  const warning = document.getElementById('pdfedWarning');
  const editor = document.getElementById('pdfedEditor');
  const thumbsEl = document.getElementById('pdfedThumbs');
  const stageEl = document.getElementById('pdfedStage');
  const pageEl = document.getElementById('pdfedPage');
  const stageCanvas = document.getElementById('pdfedCanvas');
  const overlayEl = document.getElementById('pdfedOverlay');
  const rotateBtn = document.getElementById('pdfedRotate');
  const deleteBtn = document.getElementById('pdfedDelete');
  const eraseBtn = document.getElementById('pdfedErase');
  const moveBtn = document.getElementById('pdfedMove');
  const imageBtn = document.getElementById('pdfedImage');
  const imageInput = document.getElementById('pdfedImageInput');
  const undoBtn = document.getElementById('pdfedUndo');
  const clearBtn = document.getElementById('pdfedClear');
  const exportBtn = document.getElementById('pdfedExport');
  const insertBtn = document.getElementById('pdfedInsert');
  const filenameInput = document.getElementById('pdfedFilename');
  const pageInput = document.getElementById('pdfedPageInput');
  const pageTotal = document.getElementById('pdfedPageTotal');
  const hintEl = document.getElementById('pdfedHint');
  if(!modal) return;

  const LARGE_PAGE_WARNING = 50;
  const THUMB_WIDTH = 120;
  const actionBtns = [eraseBtn, moveBtn, imageBtn, rotateBtn, deleteBtn, clearBtn, exportBtn];
  const panel = modal.querySelector('.pdf-editor-panel');

  // pdf.js (Apache-2.0) ships ES-module-only dist builds as of v6 — no classic global to guard
  // synchronously like the other vendored libs, so it's fetched lazily via dynamic import().
  let pdfjsReady = null;
  function ensurePdfjs(){
    if(!pdfjsReady){
      const pdfLibReady = typeof PDFLib !== 'undefined' ? Promise.resolve() : new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'lib/pdf-lib.min.js';
        script.onload = resolve;
        script.onerror = () => { pdfjsReady = null; script.remove(); reject(new Error('pdf-lib failed to load')); };
        document.head.appendChild(script);
      });
      pdfjsReady = Promise.all([import('./lib/pdf.min.mjs'), pdfLibReady]).then(([mod]) => {
        mod.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';
        return mod;
      });
    }
    return pdfjsReady;
  }
  document.getElementById('pdfEditorModal').addEventListener('toolmodalopen', ensurePdfjs);

  const sourceDocs = new Map(); // sourceId -> { file, pdfLibDoc, pdfjsDoc, name }
  let pages = []; // [{ id, sourceId, pageIndex, intrinsicRotation, userRotation, edits:{erasures:[],textEdits:[],images:[]} }]
  let nextSourceId = 0;
  let nextPageId = 0;
  let selectedPageId = null;
  let undoStack = []; // one snapshot per edit — undo steps back one action at a time, to the loaded state
  let stageRenderToken = 0;
  let thumbsRenderToken = 0; // guards against interleaved async thumb rebuilds scrambling the rail order
  let thumbsBuilding = false;
  let dragJustHappened = false; // suppresses the click that fires right after a drag-reorder
  let moveJustHappened = false; // same, for the click that trails a move-drag on the overlay
  let mode = 'select'; // 'select' | 'erase' | 'move'
  let currentRender = null; // { entry, viewport, dpr, ctx, styles, items:[{item,pdfBox,css}] } for the shown stage page
  let editing = null; // active inline text edit — { entry, isNew, rec | teId, input, ... }
  let nextEditId = 0; // unique per committed textEdit; removal is id-based so double-fires no-op
  let activeImageId = null; // the inserted image currently showing move/resize handles
  let draggingImageId = null; // an image mid drag/resize — skipped from the bake, shown live instead
  let nextImageId = 0;
  const stageTask = { task: null }; // in-flight pdf.js render on the stage canvas, cancellable

  function totalRotationOf(entry){
    return ((entry.intrinsicRotation + entry.userRotation) % 360 + 360) % 360;
  }

  function clonePages(list){
    return list.map(p => ({ ...p, edits: { erasures:[...p.edits.erasures], textEdits:[...p.edits.textEdits], images:[...p.edits.images] } }));
  }
  function snapshotForUndo(){
    undoStack.push(clonePages(pages));
    if(undoStack.length > 100) undoStack.shift(); // cap memory; 100 steps is plenty
    undoBtn.disabled = false;
  }
  function setEditorEnabled(on){
    actionBtns.forEach(b => b.disabled = !on);
    editor.hidden = !on;
  }
  // ordering + per-page rotation — when unchanged by an undo, the (expensive, async) thumb
  // rebuild is skipped and only the stage re-renders (covers/edits live in the overlay).
  function structuralSig(list){ return list.map(p => `${p.id}:${p.userRotation}`).join('|'); }
  function performUndo(){
    if(!undoStack.length) return;
    cancelTextEdit();
    const before = structuralSig(pages);
    pages = undoStack.pop();
    undoBtn.disabled = undoStack.length === 0;
    if(!pages.find(p => p.id === selectedPageId)) selectedPageId = pages.length ? pages[0].id : null;
    setEditorEnabled(pages.length > 0);
    if(structuralSig(pages) !== before){
      renderThumbs();
      renderStage();
    } else {
      thumbsEl.querySelectorAll('.pdfed-thumb').forEach(t => t.classList.toggle('active', Number(t.dataset.pageId) === selectedPageId));
      // only overlay edits changed — rebind to the restored page object and repaint the overlay
      // without re-rendering the canvas, which used to flash the unedited document each undo
      const cur = currentRender && pages.find(p => p.id === currentRender.entry.id);
      if(cur && cur.id === selectedPageId){
        currentRender.entry = cur;
        paintOverlay();
      } else {
        renderStage();
      }
    }
  }
  undoBtn.addEventListener('click', performUndo);

  async function getPdfjsPage(entry){
    const src = sourceDocs.get(entry.sourceId);
    return src.pdfjsDoc.getPage(entry.pageIndex + 1);
  }

  // pdf.js's render() defaults to requestAnimationFrame-paced scheduling for intent:"display",
  // which never advances in a backgrounded/hidden tab (rAF is throttled to near-zero there) —
  // intent:"print" switches it to microtask scheduling so a render can't silently hang forever.
  // `holder` (optional) tracks the in-flight render task so a newer render on the SAME canvas
  // can cancel the old one first — pdf.js throws if two renders target one canvas concurrently.
  async function renderPageToCanvas(pdfjsPage, canvas, targetWidth, rotation, holder){
    if(holder && holder.task){ try{ holder.task.cancel(); }catch(e){} holder.task = null; }
    const dpr = window.devicePixelRatio || 1;
    const unscaled = pdfjsPage.getViewport({ scale: 1, rotation });
    const scale = targetWidth / unscaled.width;
    const viewport = pdfjsPage.getViewport({ scale, rotation });
    canvas.width = Math.ceil(viewport.width * dpr);
    canvas.height = Math.ceil(viewport.height * dpr);
    canvas.style.width = Math.ceil(viewport.width) + 'px';
    canvas.style.height = Math.ceil(viewport.height) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = pdfjsPage.render({ canvasContext: ctx, viewport, intent: 'print' });
    if(holder) holder.task = task;
    try{
      await task.promise;
    }catch(err){
      if(err && err.name === 'RenderingCancelledException') return null; // superseded, not a failure
      throw err;
    }finally{
      if(holder && holder.task === task) holder.task = null;
    }
    return viewport;
  }

  /* ---- text-layer geometry + colour sampling (Phase 2) ---- */
  // 2D affine apply — [a,b,c,d,e,f] · (x,y). pdf.js exports Util.applyTransform but this keeps
  // the mapping self-contained and independent of the vendored module's surface.
  function applyTransform(p, m){ return [ m[0]*p[0] + m[2]*p[1] + m[4], m[1]*p[0] + m[3]*p[1] + m[5] ]; }
  // linear part of the inverse — enough to map CSS-pixel drag deltas back into PDF points
  function inverseLinear(m){
    const det = m[0] * m[3] - m[1] * m[2] || 1;
    return [ m[3] / det, -m[1] / det, -m[2] / det, m[0] / det ];
  }
  // full affine inverse — maps a screen point back to a PDF-space point (used for image placement)
  function invertTransform(m){
    const det = m[0] * m[3] - m[1] * m[2] || 1;
    const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
    return [ia, ib, ic, id, -(ia * m[4] + ic * m[5]), -(ib * m[4] + id * m[5])];
  }
  // a screen-space (CSS px) rect -> an axis-aligned PDF box (bottom-left origin, y-up)
  function screenRectToPdfBox(rect, viewport){
    const inv = invertTransform(viewport.transform);
    const a = applyTransform([rect.left, rect.top], inv);
    const b = applyTransform([rect.left + rect.width, rect.top + rect.height], inv);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  }

  // pdf.js groups text into runs that are often whole lines, not words. The eraser works a word
  // at a time, so each run is split on whitespace into per-word boxes in the PDF's unrotated user
  // space (origin bottom-left, y-up). Word x-offsets come from canvas measureText, then normalised
  // so their total matches the run's real advance width — correcting for font-metric mismatch.
  // Height uses the font's measured ascent/descent from getTextContent's styles map, not a guess.
  const measureCtx = document.createElement('canvas').getContext('2d');
  function itemWords(item, styles, loadedName){
    const t = item.transform;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
    const st = (styles && styles[item.fontName]) || {};
    const ascent = (typeof st.ascent === 'number' ? st.ascent : 0.75) * size;
    const descent = (typeof st.descent === 'number' ? Math.abs(st.descent) : 0.25) * size;
    const padX = size * 0.04;
    const blen = Math.hypot(t[0], t[1]) || 1;
    const ux = t[0] / blen, uy = t[1] / blen; // baseline direction (handles rotated runs positionally)
    // Measure with the document's own embedded font when pdf.js has loaded it as a FontFace
    // (its `loadedName`) — generic-font metrics drift a few points per word, which is exactly
    // what made covers trespass into neighbouring words on real documents.
    measureCtx.font = `${Math.max(1, size)}px ${loadedName ? `"${loadedName}", ` : ''}${st.fontFamily || 'sans-serif'}`;
    const total = measureCtx.measureText(item.str).width || 1;
    const k = item.width / total;
    const words = [];
    const re = /\S+/g; let m;
    while((m = re.exec(item.str))){
      const x0 = measureCtx.measureText(item.str.slice(0, m.index)).width * k;
      const x1 = measureCtx.measureText(item.str.slice(0, m.index + m[0].length)).width * k;
      words.push({
        str: m[0],
        size,
        baseline: { x: t[4] + x0 * ux, y: t[5] + x0 * uy }, // where replacement text gets drawn
        pdfBox: { x: t[4] + x0 * ux - padX, y: t[5] + x0 * uy - descent, w: (x1 - x0) + padX * 2, h: ascent + descent }
      });
    }
    return words;
  }

  // The whole run (visual line/fragment) as one record — the unit of text editing and moving.
  // Same box math as itemWords, spanning the run's full advance width.
  function runRecFor(item, styles){
    const t = item.transform;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
    const st = (styles && styles[item.fontName]) || {};
    const ascent = (typeof st.ascent === 'number' ? st.ascent : 0.75) * size;
    const descent = (typeof st.descent === 'number' ? Math.abs(st.descent) : 0.25) * size;
    const padX = size * 0.04;
    return {
      str: item.str, size,
      baseline: { x: t[4], y: t[5] },
      pdfBox: { x: t[4] - padX, y: t[5] - descent, w: item.width + padX * 2, h: ascent + descent },
      asc: typeof st.ascent === 'number' ? st.ascent : 0.8
    };
  }

  // Map a PDF-space box through the current viewport to an axis-aligned CSS-pixel rect.
  function pdfBoxToCssRect(box, viewport){
    const c = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]
      .map(p => applyTransform(p, viewport.transform));
    const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  function readPixel(ctx, dpr, x, y){
    const dx = Math.round(x * dpr), dy = Math.round(y * dpr);
    if(dx < 0 || dy < 0 || dx >= ctx.canvas.width || dy >= ctx.canvas.height) return null;
    try{ const d = ctx.getImageData(dx, dy, 1, 1).data; return [d[0], d[1], d[2]]; }catch(e){ return null; }
  }

  // Sample the ring just outside a glyph box; return the median colour if the background reads
  // solid, else fall back to white — the honest limit of covering text over textured art.
  function sampleBackgroundColor(ctx, dpr, r){
    const pad = 4;
    const pts = [
      [r.left - pad, r.top + r.height / 2], [r.left + r.width + pad, r.top + r.height / 2],
      [r.left + r.width / 2, r.top - pad], [r.left + r.width / 2, r.top + r.height + pad],
      [r.left - pad, r.top - pad], [r.left + r.width + pad, r.top - pad],
      [r.left - pad, r.top + r.height + pad], [r.left + r.width + pad, r.top + r.height + pad]
    ];
    const s = pts.map(p => readPixel(ctx, dpr, p[0], p[1])).filter(Boolean);
    if(!s.length) return { r: 255, g: 255, b: 255 };
    const med = ch => { const v = s.map(p => p[ch]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    const m = [med(0), med(1), med(2)];
    const dev = Math.max(...s.map(p => Math.max(Math.abs(p[0] - m[0]), Math.abs(p[1] - m[1]), Math.abs(p[2] - m[2]))));
    if(dev > 40) return { r: 255, g: 255, b: 255 }; // ambiguous background
    return { r: m[0], g: m[1], b: m[2] };
  }

  function toHex(c){ return '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''); }

  // Measure a text item's own colour from the pixels: the glyph pixel that deviates most from
  // the background. Returns a hex string, never a guess.
  function detectTextColor(ctx, dpr, r, bg){
    let best = null, bestDist = -1;
    const gx = 14, gy = 8;
    for(let i = 1; i < gx; i++) for(let j = 1; j < gy; j++){
      const c = readPixel(ctx, dpr, r.left + r.width * i / gx, r.top + r.height * j / gy);
      if(!c) continue;
      const dist = Math.abs(c[0] - bg.r) + Math.abs(c[1] - bg.g) + Math.abs(c[2] - bg.b);
      if(dist > bestDist){ bestDist = dist; best = c; }
    }
    return best ? { r: best[0], g: best[1], b: best[2] } : { r: 0, g: 0, b: 0 };
  }

  // The real font behind a text item, via pdf.js's commonObjs (resolved once the page has
  // rendered): `name` is the true PostScript name (e.g. "AAAAAE+Aptos-Bold" — subset prefix +
  // family + weight), `loadedName` the FontFace family pdf.js registered the embedded font
  // under, `fallbackName` pdf.js's own serif/sans/monospace classification from the font flags.
  // item.fontName itself is an opaque id like "g_d1_f2" on real documents — useless for style.
  function fontMetaFor(pdfjsPage, fontName){
    try{
      const f = pdfjsPage.commonObjs.get(fontName);
      if(f) return { name: f.name || '', loadedName: f.loadedName || '', fallbackName: f.fallbackName || '' };
    }catch(e){}
    return { name: '', loadedName: '', fallbackName: '' };
  }

  // Underline is drawn ink (a rule/rectangle in the content stream), not a font attribute, so it
  // can't be read from pdf.js's font metadata the way bold/italic can — it has to be measured from
  // pixels, same as colour. A real underline sits in a narrow band just below the baseline (within
  // the box's own descent allowance) and runs near-continuously across the word/line; an individual
  // glyph's own descender (g, y, p) is narrow and only covers a slice of that width. Sample several
  // x-positions in that band and require most of them to be inked before calling it underlined —
  // this is a best-effort measurement, not a certainty, same spirit as the colour/background sampling.
  function detectUnderline(ctx, dpr, cssRect, bg){
    const n = 10;
    const ys = [0.78, 0.86].map(f => cssRect.top + cssRect.height * f); // within the descent zone, above the very bottom edge
    let hit = 0;
    for(let i = 0; i < n; i++){
      const x = cssRect.left + cssRect.width * (i + 0.5) / n;
      const inked = ys.some(y => {
        const c = readPixel(ctx, dpr, x, y);
        if(!c) return false;
        return Math.abs(c[0] - bg.r) + Math.abs(c[1] - bg.g) + Math.abs(c[2] - bg.b) > 60;
      });
      if(inked) hit++;
    }
    return hit >= n * 0.75;
  }

  // Full style read for a selected item — size, family/weight/style, colour hex, underline. Feeds Phase 3.
  function detectItemStyle(item, styles, ctx, dpr, cssRect, meta){
    const t = item.transform;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 12;
    const st = (styles && styles[item.fontName]) || {};
    const nameL = ((meta && meta.name) || '').toLowerCase();
    const fb = (((meta && meta.fallbackName) || st.fontFamily) || '').toLowerCase();
    let family = fb.includes('mono') ? 'mono' : (fb.includes('serif') && !fb.includes('sans')) ? 'serif' : 'sans';
    if(nameL){ // the real font name is the strongest signal when present
      if(/courier|consolas|menlo|mono/.test(nameL)) family = 'mono';
      else if(/times|georgia|garamond|cambria|book|roman|palatino|century|constantia|minion|caslon/.test(nameL)) family = 'serif';
    }
    const bold = /bold|black|heavy|semibold|demi/.test(nameL);
    const italic = /italic|oblique/.test(nameL);
    const bg = sampleBackgroundColor(ctx, dpr, cssRect);
    const color = detectTextColor(ctx, dpr, cssRect, bg);
    const underline = detectUnderline(ctx, dpr, cssRect, bg);
    return { size: Math.round(size * 10) / 10, family, bold, italic, colorHex: toHex(color), color, underline };
  }

  function updateThumbLabels(){
    thumbsEl.querySelectorAll('.pdfed-thumb').forEach((el, i) => {
      el.querySelector('.pdfed-thumb-label').textContent = `Page ${i + 1}`;
      const entry = pages[i];
      if(entry){
        const src = sourceDocs.get(entry.sourceId);
        const prev = pages[i - 1];
        el.classList.toggle('source-start', !!prev && prev.sourceId !== entry.sourceId);
        el.title = src ? `${src.name} — page ${entry.pageIndex + 1}` : '';
      }
    });
    updatePageIndicator();
  }

  function setActiveThumb(id){
    selectedPageId = id;
    thumbsEl.querySelectorAll('.pdfed-thumb').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.pageId) === id);
    });
    updatePageIndicator();
    renderStage();
  }

  // page indicator: total count + the current page's position in the working order
  function updatePageIndicator(){
    pageTotal.textContent = '/ ' + pages.length;
    pageInput.max = pages.length || 1;
    const idx = pages.findIndex(p => p.id === selectedPageId);
    if(document.activeElement !== pageInput) pageInput.value = idx === -1 ? '' : (idx + 1);
  }
  function jumpToPage(n){
    if(!pages.length) return;
    n = Math.max(1, Math.min(pages.length, Math.round(n) || 1));
    const id = pages[n - 1].id;
    setActiveThumb(id);
    const el = thumbsEl.querySelector(`.pdfed-thumb[data-page-id="${id}"]`);
    if(el) el.scrollIntoView({ block: 'nearest' });
  }
  pageInput.addEventListener('change', () => jumpToPage(parseInt(pageInput.value, 10)));
  pageInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // don't let Enter/Escape reach the modal
    if(e.key === 'Enter'){ jumpToPage(parseInt(pageInput.value, 10)); pageInput.blur(); }
  });

  function wireThumbDrag(el){
    el.addEventListener('pointerdown', (e) => {
      if(e.target.closest('.pdfed-thumb-delete')) return;
      if(e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const srcCanvas = el.querySelector('canvas');
      let ghost = null, moved = false, dropTarget = null;

      function positionGhost(x, y){
        ghost.style.left = (x + 12) + 'px';
        ghost.style.top = (y + 12) + 'px';
      }
      // a clone of the thumb that trails the cursor; cloneNode doesn't copy canvas pixels,
      // so the page image is re-blitted onto the clone's canvas by hand.
      function makeGhost(){
        const rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true);
        ghost.classList.add('pdfed-thumb-ghost');
        ghost.classList.remove('active');
        ghost.style.width = rect.width + 'px';
        const gc = ghost.querySelector('canvas');
        if(gc && srcCanvas){
          gc.width = srcCanvas.width; gc.height = srcCanvas.height;
          gc.style.width = srcCanvas.style.width; gc.style.height = srcCanvas.style.height;
          gc.getContext('2d').drawImage(srcCanvas, 0, 0);
        }
        document.body.appendChild(ghost);
        positionGhost(e.clientX, e.clientY);
      }
      function clearIndicators(){
        thumbsEl.querySelectorAll('.drop-before, .drop-after').forEach(t => t.classList.remove('drop-before', 'drop-after'));
      }
      // recompute which thumb the drop indicator sits on, from a viewport point
      let lastX = e.clientX, lastY = e.clientY, rafId = null;
      function updateDropTarget(x, y){
        const target = document.elementFromPoint(x, y); // ghost is pointer-events:none, so it won't shadow this
        const overThumb = target && target.closest('.pdfed-thumb');
        clearIndicators();
        if(overThumb && overThumb !== el && overThumb.parentElement === thumbsEl){
          const rect = overThumb.getBoundingClientRect();
          const column = getComputedStyle(thumbsEl).flexDirection === 'column';
          const before = column ? (y < rect.top + rect.height / 2) : (x < rect.left + rect.width / 2);
          overThumb.classList.add(before ? 'drop-before' : 'drop-after');
          dropTarget = { thumb: overThumb, before };
        } else {
          dropTarget = null;
        }
      }
      // while the cursor sits near an edge of the (scrollable) rail, keep scrolling it so
      // pages that started off-screen can be reached without letting go of the drag. Uses a
      // timer rather than requestAnimationFrame: rAF is throttled to near-zero in a background
      // tab, which would silently freeze the auto-scroll — the same trap that hangs pdf.js.
      const EDGE = 44, SPEED = 10;
      function autoScrollTick(){
        const rect = thumbsEl.getBoundingClientRect();
        const column = getComputedStyle(thumbsEl).flexDirection === 'column';
        let delta = 0;
        if(column){
          if(lastY < rect.top + EDGE) delta = -SPEED;
          else if(lastY > rect.bottom - EDGE) delta = SPEED;
          if(delta) thumbsEl.scrollTop += delta;
        } else {
          if(lastX < rect.left + EDGE) delta = -SPEED;
          else if(lastX > rect.right - EDGE) delta = SPEED;
          if(delta) thumbsEl.scrollLeft += delta;
        }
        if(delta) updateDropTarget(lastX, lastY); // content moved under a possibly-stationary cursor
      }
      function onMove(ev){
        if(!moved){
          if(Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return; // ignore jitter; this is still a click
          moved = true;
          el.classList.add('dragging');
          makeGhost();
          rafId = setInterval(autoScrollTick, 16);
        }
        lastX = ev.clientX; lastY = ev.clientY;
        positionGhost(ev.clientX, ev.clientY);
        updateDropTarget(ev.clientX, ev.clientY);
      }
      function onUp(){
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if(rafId) clearInterval(rafId);
        el.classList.remove('dragging');
        if(ghost){ ghost.remove(); ghost = null; }
        clearIndicators();
        if(moved && dropTarget){
          snapshotForUndo();
          thumbsEl.insertBefore(el, dropTarget.before ? dropTarget.thumb : dropTarget.thumb.nextSibling);
          const newOrder = Array.from(thumbsEl.querySelectorAll('.pdfed-thumb')).map(n => Number(n.dataset.pageId));
          pages.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
          updateThumbLabels();
        }
        if(moved){ dragJustHappened = true; setTimeout(() => { dragJustHappened = false; }, 0); }
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Token-guarded: rebuilding is async (one page render at a time), so without the guard two
  // overlapping rebuilds interleave their appends and scramble the rail's visible order — this
  // was the "page 32 became page 4" bug. A stale loop stops the moment a newer rebuild starts.
  async function renderThumbs(){
    const myToken = ++thumbsRenderToken;
    thumbsBuilding = true;
    thumbsEl.innerHTML = '';
    for(const entry of pages){
      if(myToken !== thumbsRenderToken) return; // superseded — the newer rebuild owns the rail now
      const wrap = document.createElement('div');
      wrap.className = 'pdfed-thumb' + (entry.id === selectedPageId ? ' active' : '');
      wrap.dataset.pageId = entry.id;
      wrap.innerHTML = `
        <canvas></canvas>
        <span class="pdfed-thumb-label"></span>
        <button class="pdfed-thumb-delete" type="button" aria-label="Delete page">&#10005;</button>
      `;
      thumbsEl.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        if(e.target.closest('.pdfed-thumb-delete')) return;
        if(dragJustHappened) return; // this click is the tail end of a drag, not a select
        setActiveThumb(entry.id);
      });
      wrap.querySelector('.pdfed-thumb-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deletePage(entry.id);
      });
      wireThumbDrag(wrap);

      const canvas = wrap.querySelector('canvas');
      const pdfjsPage = await getPdfjsPage(entry);
      if(myToken !== thumbsRenderToken) return;
      await renderPageToCanvas(pdfjsPage, canvas, THUMB_WIDTH, totalRotationOf(entry));
    }
    if(myToken === thumbsRenderToken){
      thumbsBuilding = false;
      updateThumbLabels();
    }
  }

  async function renderStage(){
    cancelTextEdit(); // the overlay is about to be rebuilt; an open inline editor can't survive it
    const entry = pages.find(p => p.id === selectedPageId);
    const myToken = ++stageRenderToken;
    overlayEl.innerHTML = '';
    currentRender = null;
    if(!entry){
      stageCanvas.width = 0; stageCanvas.height = 0;
      pageEl.style.width = ''; pageEl.style.height = '';
      return;
    }
    const pdfjsPage = await getPdfjsPage(entry);
    if(myToken !== stageRenderToken) return; // superseded by a newer selection/edit
    const targetWidth = Math.max(280, stageEl.clientWidth - 32);
    const viewport = await renderPageToCanvas(pdfjsPage, stageCanvas, targetWidth, totalRotationOf(entry), stageTask);
    if(!viewport || myToken !== stageRenderToken) return; // null = render was cancelled mid-flight
    pageEl.style.width = stageCanvas.style.width;
    pageEl.style.height = stageCanvas.style.height;
    await buildOverlay(entry, pdfjsPage, viewport, myToken);
  }

  // Build the per-word/per-run text index for the shown page (async: getTextContent + font
  // resolution), keep a pristine copy of the render, then paint.
  async function buildOverlay(entry, pdfjsPage, viewport, token){
    let textContent;
    try{ textContent = await pdfjsPage.getTextContent(); }catch(e){ return; }
    if(token !== stageRenderToken) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = stageCanvas.getContext('2d');
    // pristine copy of the pdf.js render, so covers/edits can be re-baked onto the canvas
    // without an expensive (and flash-prone) pdf.js re-render.
    const clean = document.createElement('canvas');
    clean.width = stageCanvas.width; clean.height = stageCanvas.height;
    clean.getContext('2d').drawImage(stageCanvas, 0, 0);
    const fontMeta = new Map(); // fontName -> { name, loadedName, fallbackName }, resolved once
    currentRender = { entry, viewport, dpr, ctx, clean, styles: textContent.styles, fontMeta, items: [], runs: [] };

    textContent.items.forEach(item => {
      if(!item.str || !item.str.trim()) return;
      if(!fontMeta.has(item.fontName)) fontMeta.set(item.fontName, fontMetaFor(pdfjsPage, item.fontName));
      const meta = fontMeta.get(item.fontName);
      const st = textContent.styles[item.fontName] || {};
      // run-level record: the unit for editing (select) and moving (move mode)
      const run = runRecFor(item, textContent.styles);
      const key = runKey(run);
      currentRender.runs.push({ ...run, item, loadedName: meta.loadedName, css: pdfBoxToCssRect(run.pdfBox, viewport), key });
      // word-level records: the unit for the eraser
      itemWords(item, textContent.styles, meta.loadedName).forEach(word => {
        currentRender.items.push({
          item, str: word.str, size: word.size, baseline: word.baseline, pdfBox: word.pdfBox,
          css: pdfBoxToCssRect(word.pdfBox, viewport),
          loadedName: meta.loadedName, runKey: key,
          asc: typeof st.ascent === 'number' ? st.ascent : 0.8
        });
      });
    });
    paintOverlay();
  }

  // stable identity for an original run across re-renders — lets us tell which runs have been
  // consumed by an edit/move (so we stop offering the original as an independent target).
  function runKey(run){ return Math.round(run.baseline.x) + ':' + Math.round(run.baseline.y) + ':' + run.str; }

  // Preview text in the document's own embedded font while the chosen family still matches the
  // original — the closest possible match. Changing family switches to the mapped export font.
  function previewFontStack(family, origFamily, loadedName){
    const mapped = FONT_CSS[family] || FONT_CSS.sans;
    return (loadedName && family === origFamily) ? `"${loadedName}", ${mapped}` : mapped;
  }
  function teFontStr(te, scale){
    return `${te.italic ? 'italic ' : ''}${te.bold ? '700 ' : '400 '}${te.size * scale}px ${previewFontStack(te.family, te.origFamily, te.loadedName)}`;
  }

  // covers + replacement text are BAKED onto the stage canvas — pixel-identical to the export
  // pipeline, so the preview can't drift out of alignment the way separate overlay elements can.
  function bakeCover(ctx, er, viewport){
    const c = pdfBoxToCssRect(er, viewport);
    ctx.fillStyle = `rgb(${er.color.r},${er.color.g},${er.color.b})`;
    ctx.fillRect(c.left, c.top, c.width, c.height);
  }
  function bakeText(ctx, te, viewport, scale){
    const base = applyTransform([te.x, te.y], viewport.transform);
    ctx.save();
    ctx.fillStyle = `rgb(${te.color.r},${te.color.g},${te.color.b})`;
    ctx.font = teFontStr(te, scale);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(te.text, base[0], base[1]);
    if(te.underline){
      // matches the export's rectangle exactly: same 0.12·size gap below baseline, same 0.06·size
      // thickness — canvas measureText and pdf-lib's widthOfTextAtSize can differ by a hair, but
      // that's imperceptible for a stroke, unlike it would be for cover-box alignment.
      const w = ctx.measureText(te.text).width;
      const sizeCss = te.size * scale;
      const thickness = Math.max(1, sizeCss * 0.06);
      ctx.fillRect(base[0], base[1] + sizeCss * 0.12, w, thickness);
    }
    ctx.restore();
  }
  // interactive box over a committed edit's CURRENT text position (moves with the text, unlike
  // its cover which stays put over the original)
  function editHitBox(te, viewport, scale){
    const base = applyTransform([te.x, te.y], viewport.transform);
    measureCtx.font = teFontStr(te, scale);
    const w = measureCtx.measureText(te.text).width;
    const asc = (te.asc || 0.8) * te.size * scale, desc = 0.28 * te.size * scale;
    return { left: base[0], top: base[1] - asc, width: Math.max(w, 8), height: asc + desc };
  }
  function mkHit(cls, box){
    const d = document.createElement('div');
    d.className = cls;
    d.style.left = box.left + 'px'; d.style.top = box.top + 'px';
    d.style.width = box.width + 'px'; d.style.height = box.height + 'px';
    return d;
  }

  // Repaint: bake the canvas (pristine render + covers + text) then rebuild the invisible hit
  // layer. No pdf.js re-render, so edits/erases/moves/undo never flash the original document.
  function paintOverlay(){
    if(!currentRender) return;
    const { entry, viewport, dpr, ctx, clean } = currentRender;
    const scale = cssScaleOf(viewport);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(clean, 0, 0);                 // restore pristine render (device pixels)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);      // draw covers/text in CSS/viewport pixels
    entry.edits.erasures.forEach(er => bakeCover(ctx, er, viewport));
    entry.edits.textEdits.forEach(te => {
      bakeCover(ctx, te.cover, viewport);
      if(!te.text) return;
      if(editing && !editing.isNew && editing.teId === te.id) return; // being edited — the input shows it
      bakeText(ctx, te, viewport, scale);
    });
    bakeImages(ctx, entry, viewport); // inserted images sit on top of the page + text edits

    overlayEl.innerHTML = '';
    overlayEl.classList.toggle('erasing', mode === 'erase');
    overlayEl.classList.toggle('moving', mode === 'move');
    const consumed = new Set(entry.edits.textEdits.filter(te => te.srcKey).map(te => te.srcKey));

    // run (line) hits — edit in select mode, drag in move mode; skipped once consumed by an edit
    currentRender.runs.forEach(run => {
      if(consumed.has(run.key)) return;
      const rh = mkHit('pdfed-run-hit', run.css);
      rh.addEventListener('click', () => { if(mode === 'select' && !moveJustHappened) beginTextEdit(run); });
      rh.addEventListener('pointerdown', (e) => { if(mode === 'move') startMoveDrag(e, run.css, (dx, dy) => moveOriginalRun(run, dx, dy)); });
      overlayEl.appendChild(rh);
    });
    // word hits — eraser targets
    currentRender.items.forEach((rec, idx) => {
      if(consumed.has(rec.runKey)) return;
      const hit = mkHit('pdfed-text-hit', rec.css);
      hit.dataset.idx = idx;
      hit.addEventListener('click', () => onTextHitClick(rec, hit));
      overlayEl.appendChild(hit);
    });
    // edit hits — over each committed edit's current text position (re-edit / move / erase)
    entry.edits.textEdits.forEach(te => {
      if(!te.text) return;
      const box = editHitBox(te, viewport, scale);
      const eh = mkHit('pdfed-edit-hit', box);
      eh.dataset.teId = te.id;
      eh.addEventListener('click', () => {
        if(moveJustHappened) return;
        if(mode === 'erase'){ eraseCommittedEdit(entry, te.id); return; }
        if(mode !== 'select') return;
        openTextEditor({
          entry, isNew: false, teId: te.id,
          text: te.text, size: te.size, family: te.family, bold: te.bold, italic: te.italic, underline: te.underline,
          colorHex: toHex(te.color), origFamily: te.origFamily, loadedName: te.loadedName, css: box
        });
      });
      eh.addEventListener('pointerdown', (e) => { if(mode === 'move') startMoveDrag(e, box, (dx, dy) => moveCommittedEdit(entry, te.id, dx, dy)); });
      overlayEl.appendChild(eh);
    });
    paintImageBoxes(entry, viewport); // image move/resize handles sit above every other layer
  }

  // word hits only respond in erase mode — line-level run hits own selecting/moving
  function onTextHitClick(rec){
    if(mode === 'erase') eraseItem(rec);
  }

  /* ---- move tool: drag a line (or a committed edit) to reposition it ---- */
  function startMoveDrag(e, cssRect, onDrop){
    if(e.button !== 0 || !currentRender) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let ghost = null;
    function onMove(ev){
      if(!ghost){
        if(Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return; // still a click
        ghost = document.createElement('div');
        ghost.className = 'pdfed-move-ghost';
        ghost.style.left = cssRect.left + 'px'; ghost.style.top = cssRect.top + 'px';
        ghost.style.width = cssRect.width + 'px'; ghost.style.height = cssRect.height + 'px';
        overlayEl.appendChild(ghost);
      }
      ghost.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;
    }
    function onUp(ev){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if(!ghost) return; // never left the click threshold
      ghost.remove();
      // map the CSS-pixel delta back to PDF points through the viewport's inverse — the
      // translation terms cancel for deltas, so the linear part is all that's needed
      const inv = inverseLinear(currentRender.viewport.transform);
      const dxCss = ev.clientX - startX, dyCss = ev.clientY - startY;
      const dx = inv[0] * dxCss + inv[2] * dyCss;
      const dy = inv[1] * dxCss + inv[3] * dyCss;
      moveJustHappened = true; setTimeout(() => { moveJustHappened = false; }, 0);
      if(dxCss || dyCss) onDrop(dx, dy);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Moving an original line = cover it where it was, redraw the same text (measured style) at
  // the destination — one undoable step, same rasterize+patch mechanics as editing.
  function moveOriginalRun(run, dx, dy){
    const entry = currentRender.entry;
    snapshotForUndo();
    const meta = currentRender.fontMeta.get(run.item.fontName);
    const sctx = currentRender.clean.getContext('2d'); // sample the pristine render, not baked pixels
    const style = detectItemStyle(run.item, currentRender.styles, sctx, currentRender.dpr, run.css, meta);
    const bg = sampleBackgroundColor(sctx, currentRender.dpr, run.css);
    entry.edits.textEdits.push({
      id: nextEditId++, srcKey: run.key, // marks the original run consumed
      cover: { ...grownBoxFor(run), color: bg },
      x: run.baseline.x + dx, y: run.baseline.y + dy,
      text: toWinAnsi(fixLigatures(run.str)), size: style.size, family: style.family, bold: style.bold, italic: style.italic,
      underline: style.underline, color: style.color, asc: run.asc, loadedName: run.loadedName, origFamily: style.family
    });
    paintOverlay();
  }

  function moveCommittedEdit(entry, teId, dx, dy){
    const i = entry.edits.textEdits.findIndex(t => t.id === teId);
    if(i === -1) return;
    snapshotForUndo();
    const te = entry.edits.textEdits[i];
    entry.edits.textEdits[i] = { ...te, x: te.x + dx, y: te.y + dy }; // replace, never mutate — undo holds the old ref
    paintOverlay();
  }

  /* ---- image insertion (Phase 4): drop a PNG/JPG (signatures, stamps), drag to place, resize ---- */
  imageBtn.addEventListener('click', () => { if(!imageBtn.disabled) imageInput.click(); });
  imageInput.addEventListener('change', () => { if(imageInput.files[0]) insertImage(imageInput.files[0]); imageInput.value = ''; });

  async function insertImage(file){
    if(!currentRender) return;
    const isPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
    const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    if(!isPng && !isJpg){ hintEl.textContent = 'Images must be PNG or JPG.'; return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(new Blob([bytes], { type: isPng ? 'image/png' : 'image/jpeg' }));
    const img = new Image();
    try{ await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }); }
    catch(e){ hintEl.textContent = 'Could not read that image.'; return; }

    const vp = currentRender.viewport, scale = cssScaleOf(vp);
    const pageWpts = vp.width / scale, pageHpts = vp.height / scale;
    // default: ~35% of the page width, aspect-preserved, centred on the page
    const wPts = pageWpts * 0.35;
    const hPts = wPts * (img.naturalHeight / img.naturalWidth);
    const box = { x: (pageWpts - wPts) / 2, y: (pageHpts - hPts) / 2, w: wPts, h: hPts };

    snapshotForUndo();
    const id = nextImageId++;
    currentRender.entry.edits.images.push({ id, fmt: isPng ? 'png' : 'jpg', bytes, img, ...box });
    activeImageId = id;
    setMode('select'); // images are handled independently of the text modes
    paintOverlay();
  }

  function bakeImages(ctx, entry, viewport){
    entry.edits.images.forEach(im => {
      if(im.id === draggingImageId) return; // shown live via the drag box instead
      const c = pdfBoxToCssRect(im, viewport);
      try{ ctx.drawImage(im.img, c.left, c.top, c.width, c.height); }catch(e){}
    });
  }

  function paintImageBoxes(entry, viewport){
    entry.edits.images.forEach(im => {
      const c = pdfBoxToCssRect(im, viewport);
      const boxEl = document.createElement('div');
      boxEl.className = 'pdfed-image-box' + (im.id === activeImageId ? ' active' : '');
      boxEl.style.left = c.left + 'px'; boxEl.style.top = c.top + 'px';
      boxEl.style.width = c.width + 'px'; boxEl.style.height = c.height + 'px';
      if(im.id === draggingImageId){ // live preview follows the pointer during a drag/resize
        const live = document.createElement('img');
        live.className = 'pdfed-image-live'; live.src = im.img.src;
        boxEl.appendChild(live);
      }
      boxEl.addEventListener('pointerdown', (e) => {
        if(e.target.closest('.pdfed-image-del')) return;
        if(activeImageId !== im.id){ activeImageId = im.id; paintOverlay(); return; }
        const kind = e.target.closest('.pdfed-image-handle') ? 'resize' : 'move';
        startImageDrag(e, im, kind, c);
      });
      if(im.id === activeImageId){
        const handle = document.createElement('div'); handle.className = 'pdfed-image-handle';
        const del = document.createElement('button'); del.className = 'pdfed-image-del'; del.type = 'button';
        del.innerHTML = '&#10005;'; del.setAttribute('aria-label', 'Delete image');
        del.addEventListener('click', (e) => { e.stopPropagation(); deleteImage(im.id); });
        boxEl.appendChild(handle); boxEl.appendChild(del);
      }
      overlayEl.appendChild(boxEl);
    });
  }

  // Screen-space drag so placement/resize stays correct regardless of scale; the resulting screen
  // rect is converted back to a PDF box once, on drop, via the viewport's full inverse transform.
  function startImageDrag(e, im, kind, startRect){
    if(e.button !== 0 || !currentRender) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const aspect = startRect.width / startRect.height;
    draggingImageId = im.id;
    paintOverlay(); // re-render so the dragging image is skipped from the bake, shown live
    const boxEl = overlayEl.querySelector('.pdfed-image-box'); // the (only) active box is the dragging one
    let moved = false, curRect = { ...startRect };
    function onMove(ev){
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if(!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      if(kind === 'move'){
        curRect = { left: startRect.left + dx, top: startRect.top + dy, width: startRect.width, height: startRect.height };
      } else {
        const w = Math.max(16, startRect.width + dx);
        curRect = { left: startRect.left, top: startRect.top, width: w, height: w / aspect }; // keep aspect
      }
      if(boxEl){ boxEl.style.left = curRect.left + 'px'; boxEl.style.top = curRect.top + 'px'; boxEl.style.width = curRect.width + 'px'; boxEl.style.height = curRect.height + 'px'; }
    }
    function onUp(){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      draggingImageId = null;
      if(moved){
        snapshotForUndo();
        const i = currentRender.entry.edits.images.findIndex(x => x.id === im.id);
        if(i !== -1){
          const box = screenRectToPdfBox(curRect, currentRender.viewport);
          currentRender.entry.edits.images[i] = { ...currentRender.entry.edits.images[i], ...box };
        }
      }
      paintOverlay();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function deleteImage(id){
    const entry = currentRender && currentRender.entry;
    if(!entry) return;
    const i = entry.edits.images.findIndex(x => x.id === id);
    if(i === -1) return;
    snapshotForUndo();
    entry.edits.images.splice(i, 1);
    if(activeImageId === id) activeImageId = null;
    paintOverlay();
  }

  // Shared by the eraser and text edits: the cover box grown a little past the measured glyph
  // box on every side — the font's nominal ascent/descent doesn't include anti-aliased edge
  // pixels or the odd tall mark (apostrophes, bars), which otherwise survive as faint traces.
  function grownBoxFor(rec){
    const s = rec.size || 12;
    // horizontal margin stays small — with real-font word boundaries, a fat margin is what
    // trespassed into neighbouring words; vertical stays generous for ascenders/descenders.
    const mx = s * 0.06, mTop = s * 0.14, mBot = s * 0.10;
    const b = rec.pdfBox;
    return { x: b.x - mx, y: b.y - mBot, w: b.w + mx * 2, h: b.h + mTop + mBot };
  }

  function eraseItem(rec){
    const entry = pages.find(p => p.id === selectedPageId);
    if(!entry || !currentRender) return;
    const box = grownBoxFor(rec);
    // don't stack a second cover on a word that's already erased or replaced
    const sameBox = o => Math.abs(o.x - box.x) < 0.5 && Math.abs(o.y - box.y) < 0.5 && Math.abs(o.w - box.w) < 0.5;
    if(entry.edits.erasures.some(sameBox) || entry.edits.textEdits.some(te => sameBox(te.cover))) return;
    snapshotForUndo(); // one snapshot per word, so undo restores word by word even after a drag
    // sample the pristine render, not the live canvas — a prior bake may have painted a cover there
    const sctx = currentRender.clean.getContext('2d');
    const color = sampleBackgroundColor(sctx, currentRender.dpr, rec.css);
    entry.edits.erasures.push({ ...box, color });
    paintOverlay();
  }

  // Hold-and-drag erasing: while erase mode is on and the left button is down, every word the
  // cursor passes over gets erased. elementFromPoint keeps it robust regardless of which layer
  // the pointer events land on.
  function eraseAtPoint(x, y){
    const el = document.elementFromPoint(x, y);
    if(!el || !el.classList) return;
    if(el.classList.contains('pdfed-text-edit')){ // committed edits are erasable too
      const entry = pages.find(p => p.id === selectedPageId);
      if(entry) eraseCommittedEdit(entry, Number(el.dataset.teId));
      return;
    }
    if(!el.classList.contains('pdfed-text-hit')) return;
    const rec = currentRender && currentRender.items[Number(el.dataset.idx)];
    if(rec) eraseItem(rec);
  }
  stageEl.addEventListener('pointerdown', (e) => {
    if(mode !== 'erase' || e.button !== 0) return;
    eraseAtPoint(e.clientX, e.clientY);
    const move = (ev) => { if(ev.buttons & 1) eraseAtPoint(ev.clientX, ev.clientY); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  // clicking bare canvas (no hit div / image box intercepted it) deselects the active image
  stageCanvas.addEventListener('pointerdown', () => { if(activeImageId != null){ activeImageId = null; paintOverlay(); } });

  // id-based and idempotent: the click that follows a pointerdown drag-erase resolves to the
  // same edit, so the second call must find nothing and no-op rather than splice a neighbour.
  function eraseCommittedEdit(entry, teId){
    const i = entry.edits.textEdits.findIndex(t => t.id === teId);
    if(i === -1) return;
    snapshotForUndo();
    const te = entry.edits.textEdits[i];
    entry.edits.textEdits.splice(i, 1);
    entry.edits.erasures.push({ x: te.cover.x, y: te.cover.y, w: te.cover.w, h: te.cover.h, color: te.cover.color }); // original stays hidden
    paintOverlay();
  }

  /* ---- inline text editing (Phase 3) ---- */
  const FONT_VARIANTS = { // pdf-lib StandardFonts keys, grep-verified against the vendored dist
    sans:  { regular: 'Helvetica',  bold: 'HelveticaBold',  italic: 'HelveticaOblique',  boldItalic: 'HelveticaBoldOblique' },
    serif: { regular: 'TimesRoman', bold: 'TimesRomanBold', italic: 'TimesRomanItalic',  boldItalic: 'TimesRomanBoldItalic' },
    mono:  { regular: 'Courier',    bold: 'CourierBold',    italic: 'CourierOblique',    boldItalic: 'CourierBoldOblique' }
  };
  const FONT_CSS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", monospace' };

  const textbar = document.getElementById('pdfedTextbar');
  const familySel = document.getElementById('pdfedFontFamily');
  const boldBtn = document.getElementById('pdfedBoldBtn');
  const italicBtn = document.getElementById('pdfedItalicBtn');
  const underlineBtn = document.getElementById('pdfedUnderlineBtn');
  const sizeInput = document.getElementById('pdfedFontSize');
  const colorInput = document.getElementById('pdfedFontColor');
  const applyBtn = document.getElementById('pdfedApplyText');
  const cancelBtn = document.getElementById('pdfedCancelText');

  function cssScaleOf(viewport){ return Math.hypot(viewport.transform[0], viewport.transform[1]) || 1; }
  function hexToRgb(h){
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if(!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  // pdf-lib's built-in standard fonts only encode WinAnsi — swap anything outside it for '?'
  // at commit time rather than throwing (or silently corrupting) at export time.
  function toWinAnsi(s){
    return s.replace(/[^ -~ -ÿ–—‘’‚“”„†‡•…‰‹›€™]/g, '?');
  }
  // Word subset fonts often ship a broken ToUnicode map: real f-ligatures come through either as
  // their Unicode ligature codepoint (fixable losslessly) or, worse, as a stray digit — "Affect"
  // extracts as "A6ect". The digit case is only substituted when unmistakably mid-word (letter
  // before, lowercase letter after) so acronyms/formulas like H2O, MP3, B2B, COVID19 are spared.
  // Best-guess "ff" (the most common f-ligature) — may be wrong for a fi/fl word, but it's a
  // prefill the user is already editing. No regex lookbehind — that throws on older Safari.
  function fixLigatures(s){
    s = s.replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
         .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/ﬅ/g, 'ft').replace(/ﬆ/g, 'st');
    s = s.replace(/([A-Za-z])[0-9]([a-z])/g, '$1ff$2');
    return s;
  }
  const toggleOn = btn => btn.getAttribute('aria-pressed') === 'true';
  function setToggle(btn, on){
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('active', on);
  }
  boldBtn.addEventListener('click', () => { setToggle(boldBtn, !toggleOn(boldBtn)); refreshEditingPreview(); });
  italicBtn.addEventListener('click', () => { setToggle(italicBtn, !toggleOn(italicBtn)); refreshEditingPreview(); });
  underlineBtn.addEventListener('click', () => { setToggle(underlineBtn, !toggleOn(underlineBtn)); refreshEditingPreview(); });
  familySel.addEventListener('change', refreshEditingPreview);
  sizeInput.addEventListener('input', refreshEditingPreview);
  colorInput.addEventListener('input', refreshEditingPreview);
  applyBtn.addEventListener('click', () => commitTextEdit());
  cancelBtn.addEventListener('click', () => cancelTextEdit());
  // keep keystrokes in the format bar from reaching the document-level Escape-closes-modal handler
  textbar.addEventListener('keydown', (e) => { e.stopPropagation(); if(e.key === 'Escape') cancelTextEdit(); });

  // Editing an existing word measures its style first (size from the transform, colour sampled
  // from the rendered pixels as hex) so the controls start from what's actually on the page.
  function beginTextEdit(rec){
    if(!currentRender) return;
    activeImageId = null; // clicking text deselects any active image
    if(editing){ commitTextEdit(); return; } // commit the pending edit; its rebuild invalidates this click's overlay
    const meta = currentRender.fontMeta.get(rec.item.fontName);
    const sctx = currentRender.clean.getContext('2d'); // measure style from the pristine render
    const style = detectItemStyle(rec.item, currentRender.styles, sctx, currentRender.dpr, rec.css, meta);
    openTextEditor({
      entry: currentRender.entry, isNew: true, rec, srcKey: rec.key,
      text: fixLigatures(rec.str), size: style.size, family: style.family, bold: style.bold, italic: style.italic,
      underline: style.underline, colorHex: style.colorHex, css: rec.css,
      origFamily: style.family, loadedName: rec.loadedName
    });
  }

  function openTextEditor(o){
    if(editing) cancelTextEdit();
    familySel.value = o.family in FONT_VARIANTS ? o.family : 'sans';
    setToggle(boldBtn, !!o.bold);
    setToggle(italicBtn, !!o.italic);
    setToggle(underlineBtn, !!o.underline);
    sizeInput.value = o.size;
    colorInput.value = o.colorHex;
    editing = { ...o };
    paintOverlay(); // rebake so the edit being replaced is hidden behind the input, not doubled
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pdfed-edit-input';
    input.value = o.text;
    input.style.left = o.css.left + 'px';
    input.style.top = o.css.top + 'px';
    input.style.minWidth = Math.max(o.css.width + 30, 90) + 'px';
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Escape cancels the edit, not the whole modal
      if(e.key === 'Enter') commitTextEdit();
      else if(e.key === 'Escape') cancelTextEdit();
    });
    overlayEl.appendChild(input); // added after paintOverlay's innerHTML reset
    editing.input = input;
    refreshEditingPreview();
    textbar.hidden = false;
    input.focus();
    input.select();
  }

  // live preview: the inline input mirrors the controls so what you type looks like the result
  function refreshEditingPreview(){
    if(!editing || !currentRender) return;
    const scale = cssScaleOf(currentRender.viewport);
    const i = editing.input;
    i.style.fontFamily = previewFontStack(familySel.value, editing.origFamily, editing.loadedName);
    i.style.fontSize = ((parseFloat(sizeInput.value) || editing.size) * scale) + 'px';
    i.style.fontWeight = toggleOn(boldBtn) ? '700' : '400';
    i.style.fontStyle = toggleOn(italicBtn) ? 'italic' : 'normal';
    i.style.textDecoration = toggleOn(underlineBtn) ? 'underline' : 'none';
    i.style.color = colorInput.value;
  }

  function teardownTextEditor(){
    if(editing && editing.input) editing.input.remove();
    editing = null;
    textbar.hidden = true;
    overlayEl.querySelectorAll('.pdfed-run-hit.selected, .pdfed-text-hit.selected').forEach(el => el.classList.remove('selected'));
  }
  function cancelTextEdit(){ const had = !!editing; teardownTextEditor(); if(had && currentRender) paintOverlay(); }

  function commitTextEdit(){
    if(!editing || !currentRender) return;
    const entry = editing.entry;
    const vals = {
      text: toWinAnsi(editing.input.value),
      size: parseFloat(sizeInput.value) || editing.size,
      family: familySel.value in FONT_VARIANTS ? familySel.value : 'sans',
      bold: toggleOn(boldBtn),
      italic: toggleOn(italicBtn),
      underline: toggleOn(underlineBtn),
      color: hexToRgb(colorInput.value)
    };
    snapshotForUndo();
    if(editing.isNew){
      const box = grownBoxFor(editing.rec);
      const bg = sampleBackgroundColor(currentRender.clean.getContext('2d'), currentRender.dpr, editing.rec.css);
      entry.edits.textEdits.push({
        id: nextEditId++, srcKey: editing.srcKey, cover: { ...box, color: bg },
        x: editing.rec.baseline.x, y: editing.rec.baseline.y,
        asc: editing.rec.asc, loadedName: editing.rec.loadedName, origFamily: editing.origFamily,
        ...vals
      });
    } else {
      // replace rather than mutate: undo snapshots hold references to the old object
      const i = entry.edits.textEdits.findIndex(t => t.id === editing.teId);
      if(i !== -1) entry.edits.textEdits[i] = { ...entry.edits.textEdits[i], ...vals };
    }
    teardownTextEditor();
    paintOverlay(); // overlay-only — no canvas re-render, no flash
  }

  function setMode(m){
    mode = m;
    if(m !== 'select'){ cancelTextEdit(); activeImageId = null; } // erase/move don't act on images
    eraseBtn.classList.toggle('active', m === 'erase');
    eraseBtn.setAttribute('aria-pressed', m === 'erase' ? 'true' : 'false');
    eraseBtn.textContent = m === 'erase' ? 'Erasing…' : 'Erase text';
    moveBtn.classList.toggle('active', m === 'move');
    moveBtn.setAttribute('aria-pressed', m === 'move' ? 'true' : 'false');
    moveBtn.textContent = m === 'move' ? 'Moving…' : 'Move text';
    overlayEl.classList.toggle('erasing', m === 'erase');
    overlayEl.classList.toggle('moving', m === 'move');
    hintEl.textContent = m === 'erase'
      ? 'Erase mode on: click a word — or hold and drag across several — to cover them. Click "Erasing…" again to stop.'
      : m === 'move'
      ? 'Move mode on: drag any line of text (or previously edited text) to reposition it. Click "Moving…" again to stop.'
      : 'Tip: click a line of text to edit it. Drag pages in the sidebar to reorder.';
  }
  eraseBtn.addEventListener('click', () => { if(!eraseBtn.disabled) setMode(mode === 'erase' ? 'select' : 'erase'); });
  moveBtn.addEventListener('click', () => { if(!moveBtn.disabled) setMode(mode === 'move' ? 'select' : 'move'); });

  rotateBtn.addEventListener('click', async () => {
    const entry = pages.find(p => p.id === selectedPageId);
    if(!entry) return;
    snapshotForUndo();
    entry.userRotation = (entry.userRotation + 90) % 360;
    renderStage();
    // only the affected thumb re-renders — a full rail rebuild here is what used to let
    // overlapping async rebuilds scramble the page order
    rotateBtn.disabled = true;
    try{
      const el = thumbsEl.querySelector(`.pdfed-thumb[data-page-id="${entry.id}"]`);
      if(el && !thumbsBuilding){
        const pdfjsPage = await getPdfjsPage(entry);
        await renderPageToCanvas(pdfjsPage, el.querySelector('canvas'), THUMB_WIDTH, totalRotationOf(entry));
      } else {
        renderThumbs(); // rail still building (or thumb missing) — restart the rebuild cleanly
      }
    }catch(e){}
    rotateBtn.disabled = pages.length === 0;
  });

  function deletePage(id){
    const idx = pages.findIndex(p => p.id === id);
    if(idx === -1) return;
    snapshotForUndo();
    pages.splice(idx, 1);
    if(selectedPageId === id){
      selectedPageId = pages.length ? pages[Math.min(idx, pages.length - 1)].id : null;
    }
    setEditorEnabled(pages.length > 0);
    if(!pages.length){
      panel.classList.remove('has-doc'); // last page gone — restore the full drop box
      dropText.textContent = 'Drag & drop a PDF here, or click to browse';
      warning.hidden = true;
    }
    if(thumbsBuilding){
      renderThumbs(); // a rebuild is mid-flight; surgical removal would race it
    } else {
      const el = thumbsEl.querySelector(`.pdfed-thumb[data-page-id="${id}"]`);
      if(el) el.remove();
      thumbsEl.querySelectorAll('.pdfed-thumb').forEach(t => t.classList.toggle('active', Number(t.dataset.pageId) === selectedPageId));
      updateThumbLabels();
    }
    renderStage();
  }
  deleteBtn.addEventListener('click', () => { if(selectedPageId != null) deletePage(selectedPageId); });

  // `append` distinguishes the two entry points: loading via the drop zone REPLACES whatever's
  // open (a fresh document), while the Insert PDF button appends to merge — so a second file only
  // ever coexists with the first when it was explicitly inserted.
  async function loadPdfFile(file, append){
    // some Windows apps drag-drop PDFs with an empty MIME type, so accept by extension too
    if(!file || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''))){
      dropText.textContent = 'Could not read that file — try a PDF.';
      return;
    }
    dropText.textContent = `Loading ${file.name}…`;
    try{
      const pdfjsLib = await ensurePdfjs();
      const arrayBuffer = await file.arrayBuffer();
      const bytesForPdfLib = new Uint8Array(arrayBuffer.slice(0));
      const bytesForPdfjs = new Uint8Array(arrayBuffer.slice(0));

      const pdfLibDoc = await PDFLib.PDFDocument.load(bytesForPdfLib);
      const pdfjsDoc = await pdfjsLib.getDocument({ data: bytesForPdfjs }).promise;

      if(!append){
        // replace: drop the current document entirely before loading the new one
        sourceDocs.clear();
        pages = [];
        undoStack = [];
        undoBtn.disabled = true;
      }
      const wasEmpty = pages.length === 0;

      const sourceId = nextSourceId++;
      sourceDocs.set(sourceId, { file, pdfLibDoc, pdfjsDoc, name: file.name });

      const newPages = [];
      for(let i = 0; i < pdfjsDoc.numPages; i++){
        const pdfjsPage = await pdfjsDoc.getPage(i + 1);
        newPages.push({
          id: nextPageId++,
          sourceId,
          pageIndex: i,
          intrinsicRotation: pdfjsPage.rotate || 0,
          userRotation: 0,
          edits: { erasures: [], textEdits: [], images: [] }
        });
      }

      // Appending into an existing doc is undoable; a replace/first load instead seeds the editor
      // (default filename, initial selection, clean undo).
      if(append && !wasEmpty) snapshotForUndo();
      if(append && !wasEmpty){
        // insert after the page the user has open, not always at the very end — matches where
        // they're looking when they hit Insert PDF
        const afterIdx = Math.max(0, pages.findIndex(p => p.id === selectedPageId) + 1) || pages.length;
        pages.splice(afterIdx, 0, ...newPages);
      } else {
        pages = pages.concat(newPages);
      }
      if(wasEmpty){
        selectedPageId = pages.length ? pages[0].id : null;
        filenameInput.value = file.name.replace(/\.pdf$/i, '') || 'edited';
        setMode('select');
      } else if(append){
        // jump to the first newly-merged page so the result of the merge is immediately visible
        selectedPageId = newPages[0].id;
      }

      if(append && !wasEmpty){
        dropText.textContent = `Inserted ${newPages.length} page${newPages.length === 1 ? '' : 's'} from ${file.name} · drop another PDF here to replace it`;
      } else {
        dropText.textContent = `Loaded: ${file.name} · drop another PDF here to replace it`;
      }
      panel.classList.add('has-doc'); // slims the drop box, frees space for the preview
      setEditorEnabled(pages.length > 0);
      warning.hidden = pages.length <= LARGE_PAGE_WARNING;
      if(!warning.hidden) warning.textContent = `${pages.length} pages loaded — large files may render slower, since everything runs in your browser.`;

      await renderThumbs();
      await renderStage();
    }catch(err){
      dropText.textContent = 'Could not read that PDF — it may be corrupted or password-protected.';
    }
  }

  // Clear everything and return the editor to its just-opened state.
  function resetEditor(){
    cancelTextEdit();
    if(stageTask.task){ try{ stageTask.task.cancel(); }catch(e){} stageTask.task = null; }
    stageRenderToken++; thumbsRenderToken++;
    sourceDocs.clear();
    pages = [];
    undoStack = [];
    selectedPageId = null;
    currentRender = null;
    nextSourceId = 0; nextPageId = 0; nextEditId = 0; nextImageId = 0;
    activeImageId = null; draggingImageId = null;
    setMode('select');
    undoBtn.disabled = true;
    setEditorEnabled(false);
    panel.classList.remove('has-doc');
    thumbsEl.innerHTML = '';
    overlayEl.innerHTML = '';
    stageCanvas.width = 0; stageCanvas.height = 0;
    pageEl.style.width = ''; pageEl.style.height = '';
    warning.hidden = true;
    filenameInput.value = 'edited';
    updatePageIndicator();
    dropText.textContent = 'Drag & drop a PDF here, or click to browse';
  }
  clearBtn.addEventListener('click', resetEditor);

  async function buildOutputPdf(pageList){
    const out = await PDFLib.PDFDocument.create();
    const fontCache = new Map(); // one embed per StandardFont variant per export
    async function fontFor(family, bold, italic){
      const variant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
      const key = family + ':' + variant;
      if(!fontCache.has(key)){
        const name = (FONT_VARIANTS[family] || FONT_VARIANTS.sans)[variant];
        fontCache.set(key, await out.embedFont(PDFLib.StandardFonts[name]));
      }
      return fontCache.get(key);
    }
    for(const entry of pageList){
      const src = sourceDocs.get(entry.sourceId);
      const [copied] = await out.copyPages(src.pdfLibDoc, [entry.pageIndex]);
      // erasure covers: opaque rectangles drawn over the original glyphs (in unrotated content
      // space, so they rotate with the page). The underlying text token isn't removed — this is
      // the disclosed limit of every browser PDF editor — but it's visually gone in the output.
      for(const er of entry.edits.erasures){
        copied.drawRectangle({ x: er.x, y: er.y, width: er.w, height: er.h, color: PDFLib.rgb(er.color.r / 255, er.color.g / 255, er.color.b / 255) });
      }
      // text edits: cover the original word, then draw the replacement at the same baseline
      for(const te of entry.edits.textEdits){
        copied.drawRectangle({ x: te.cover.x, y: te.cover.y, width: te.cover.w, height: te.cover.h, color: PDFLib.rgb(te.cover.color.r / 255, te.cover.color.g / 255, te.cover.color.b / 255) });
        if(te.text){
          const rgb = PDFLib.rgb(te.color.r / 255, te.color.g / 255, te.color.b / 255);
          const font = await fontFor(te.family, te.bold, te.italic);
          copied.drawText(te.text, { x: te.x, y: te.y, size: te.size, font, color: rgb });
          // underline is drawn ink, not a font property — pdf-lib/StandardFonts have no
          // underline flag, so match the canvas preview's approach: a filled bar under the
          // baseline, matching text colour and width (font.widthOfTextAtSize is exact, unlike
          // canvas measureText, since it's the same metrics drawText itself used).
          if(te.underline){
            const w = font.widthOfTextAtSize(te.text, te.size);
            const thickness = Math.max(0.75, te.size * 0.06);
            // pdf-lib's (x,y) is the rect's bottom-left corner — offset down from the baseline by
            // the same 0.12·size gap the canvas preview uses, so preview and export line up.
            copied.drawRectangle({ x: te.x, y: te.y - te.size * 0.12 - thickness, width: w, height: thickness, color: rgb });
          }
        }
      }
      // inserted images: embed once, draw at the stored PDF box (bottom-left origin, y-up)
      for(const im of entry.edits.images){
        const embedded = im.fmt === 'png' ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
        copied.drawImage(embedded, { x: im.x, y: im.y, width: im.w, height: im.h });
      }
      copied.setRotation(PDFLib.degrees(totalRotationOf(entry)));
      out.addPage(copied);
    }
    return out.save();
  }

  exportBtn.addEventListener('click', async () => {
    if(!pages.length) return;
    exportBtn.disabled = true;
    const label = exportBtn.textContent;
    exportBtn.textContent = 'Exporting…';
    try{
      const bytes = await buildOutputPdf(pages);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (filenameInput.value || 'edited').trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'edited';
      a.download = safeName + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      warning.hidden = false;
      warning.textContent = 'Export failed — please try again.';
    }finally{
      exportBtn.disabled = false;
      exportBtn.textContent = label;
    }
  });

  // Two dedicated file inputs, not one shared input with a mode flag: a flag can go stale (e.g.
  // an Insert picker cancelled leaves it set) and makes replace-vs-append nondeterministic.
  // Each input has exactly one meaning — #pdfedFileInput replaces, #pdfedInsertInput appends.
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); } });
  insertBtn.addEventListener('click', () => insertInput.click());
  fileInput.addEventListener('change', () => {
    if(fileInput.files[0]) loadPdfFile(fileInput.files[0], false);
    fileInput.value = '';
  });
  insertInput.addEventListener('change', () => {
    if(insertInput.files[0]) loadPdfFile(insertInput.files[0], true);
    insertInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if(e.dataTransfer && e.dataTransfer.files[0]) loadPdfFile(e.dataTransfer.files[0], false); // dropping on the zone replaces
  });
  ['dragover', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => { if(e.target !== drop) e.preventDefault(); });
  });

  modal.addEventListener('toolmodalclose', () => {
    stageRenderToken++;
    if(stageTask.task){ try{ stageTask.task.cancel(); }catch(e){} stageTask.task = null; }
    cancelTextEdit();
    if(mode !== 'select') setMode('select'); // reopening mid-erase/move-mode would be confusing
  });
})();

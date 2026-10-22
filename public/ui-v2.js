(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Headlines window (Parwani-DOS spec): the largest headline size from 72px down to 14px at which
  // the whole panel (headline + summary) stops overflowing; the summary is 0.36x the headline,
  // clamped to 12-20px.
  function fitHeadline() {
    const title = byId('v2HeadlineTitle');
    const desc = byId('v2HeadlineDesc');
    const box = title?.parentElement;
    if (!title || !box || !box.clientHeight || !box.clientWidth) return;
    const apply = (size) => {
      title.style.fontSize = `${size}px`;
      if (desc) desc.style.fontSize = `${Math.min(20, Math.max(12, size * .36))}px`;
    };
    const fits = () => box.scrollHeight <= box.clientHeight + 1 && title.scrollWidth <= title.clientWidth + 1;
    const search = () => {
      let low = 14;
      let high = 72;
      let best = low;
      for (let i = 0; i < 9; i += 1) {
        const size = (low + high) / 2;
        apply(size);
        if (fits()) {
          best = size;
          low = size;
        } else {
          high = size;
        }
      }
      apply(best);
    };
    if (desc) desc.hidden = false;
    search();
    // Still overflowing at the minimum: the summary goes before the headline does.
    if (desc && !fits()) {
      desc.hidden = true;
      search();
    }
  }

  // Shrinks [data-fit] titles until they fit their box in data-fit lines (1 or 2), down to 70%
  // of the CSS size. Titles with data-fit-max may then take extra lines, shrinking to 55%.
  // Re-run whenever a title's text changes or the window resizes.
  function fitText(scope = document) {
    const targets = scope.matches?.('[data-fit]') ? [scope] : scope.querySelectorAll('[data-fit]');
    targets.forEach((el) => {
      el.style.fontSize = '';
      if (!el.clientWidth) return;
      el.classList.add('is-fitting');
      const lines = Number(el.dataset.fit) || 1;
      const maxLines = Number(el.dataset.fitMax) || lines;
      const max = parseFloat(getComputedStyle(el).fontSize);
      let size = max;
      // Count rendered lines from the text's line boxes; Anton's tall glyphs make height checks unreliable.
      const range = document.createRange();
      range.selectNodeContents(el);
      const lineCount = () => new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      const fits = (budget) => el.scrollWidth <= el.clientWidth + 1 && lineCount() <= budget;
      const shrink = (budget, floor) => {
        while (!fits(budget) && size > floor) {
          size = Math.max(floor, size * 0.95);
          el.style.fontSize = `${size}px`;
        }
      };
      shrink(lines, maxLines > lines ? max * 0.7 : max * 0.55);
      if (!fits(lines) && maxLines > lines) shrink(maxLines, max * 0.55);
      el.classList.remove('is-fitting');
    });
  }

  // Home's canvas scale (see .pdos-stage in ui-v2.css): the mockup's 1440-wide design scaled to
  // the space under the nav (900 design px tall, the proportions of the Claude Design preview), never below .75 so the small print stays readable.
  const pagedQuery = window.matchMedia('(min-width: 721px) and (min-height: 620px)');
  function scaleHome() {
    const home = byId('v2-home');
    if (!home || !pagedQuery.matches) return;
    const scale = Math.max(0.75, Math.min(home.clientWidth / 1440, (home.clientHeight - 40) / 900));
    document.documentElement.style.setProperty('--pdos-s', scale.toFixed(4));
  }
  scaleHome();

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      scaleHome();
      fitHeadline();
      fitText();
    });
  });
  document.fonts?.ready.then(() => {
    fitHeadline();
    fitText();
  });
  // headlines.feed takes the right column's leftover height, which changes whenever another
  // widget fills with data, so refit whenever its box changes size (fitting never resizes it).
  const headlineBox = byId('v2HeadlineTitle')?.parentElement;
  if (headlineBox && 'ResizeObserver' in window) {
    let headlineFrame = 0;
    new ResizeObserver(() => {
      window.cancelAnimationFrame(headlineFrame);
      headlineFrame = window.requestAnimationFrame(fitHeadline);
    }).observe(headlineBox);
  }

  // Dubai date at the foot of the About card; a minute tick is enough to roll over at midnight.
  const dubaiDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  function updateDubaiDate() {
    if (byId('v2Date')) byId('v2Date').textContent = dubaiDate.format(new Date()).toUpperCase();
  }

  updateDubaiDate();
  window.setInterval(updateDubaiDate, 60000);


  const fallbackHeadlines = [
    { title: 'Global markets steady as new data arrives', description: 'Investors assess the latest economic data as markets turn their attention to the months ahead.' },
    { title: 'Technology and culture continue to reshape modern work', description: 'A preview of the stories and ideas shaping work, technology and daily life.' },
    { title: 'New ideas move from sketchbook to browser', description: 'Projects take shape through small experiments, practical tools and steady iteration.' },
    { title: 'A rotating view of the stories shaping the day', description: 'The featured headline changes automatically while this panel keeps its dimensions.' }
  ];
  let headlines = fallbackHeadlines;
  let headlineIndex = 0;

  function restartHeadlineProgress() {
    const progress = byId('v2HeadlineProgress');
    if (!progress) return;
    progress.style.animation = 'none';
    void progress.offsetWidth;
    progress.style.animation = '';
  }

  function renderHeadline() {
    const title = byId('v2HeadlineTitle');
    const count = byId('v2HeadlineCount');
    if (title) title.textContent = headlines[headlineIndex].title;
    byId('v2HeadlineDesc').textContent = headlines[headlineIndex].description;
    if (count) count.textContent = `${String(headlineIndex + 1).padStart(2, '0')} / ${String(headlines.length).padStart(2, '0')}`;
    fitHeadline();
    restartHeadlineProgress();
  }

  async function loadHeadlines() {
    try {
      const response = await fetch('/api/news');
      if (!response.ok) throw new Error('Headline request failed');
      const payload = await response.json();
      if (!Array.isArray(payload.headlines) || !payload.headlines.length) throw new Error('No headlines');
      headlines = payload.headlines.map((headline) => ({
        title: String(headline),
        description: 'The latest story from BBC World. Headlines rotate automatically every ten seconds.'
      })).slice(0, 12);
      headlineIndex = 0;
      byId('v2HeadlineSource').textContent = '[ BBC WORLD ]';
    } catch (_) {
      headlines = fallbackHeadlines;
      byId('v2HeadlineSource').textContent = '[ PREVIEW ]';
    }
    renderHeadline();
  }

  loadHeadlines();
  window.setInterval(() => {
    headlineIndex = (headlineIndex + 1) % headlines.length;
    renderHeadline();
  }, 10000);

  const weatherLabels = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
    75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };

  async function loadWeather() {
    try {
      const endpoint = 'https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FDubai&forecast_days=1';
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Weather request failed');
      const payload = await response.json();
      const current = Math.round(payload.current.temperature_2m);
      const high = Math.round(payload.daily.temperature_2m_max[0]);
      const low = Math.round(payload.daily.temperature_2m_min[0]);
      const code = Number(payload.current.weather_code);
      byId('v2WeatherTemp').textContent = `${current}°C`;
      byId('v2WeatherLabel').textContent = weatherLabels[code] || 'Current conditions';
      byId('v2WeatherHighLow').textContent = `High ${high}° / Low ${low}°`;
      byId('v2WeatherExtras').textContent = `Humidity ${Math.round(payload.current.relative_humidity_2m)}% / Wind ${Math.round(payload.current.wind_speed_10m)} km/h`;
      const icon = byId('v2WeatherIcon');
      if (code >= 51) {
        icon.innerHTML = '<path d="M15 40a13 13 0 0 1 4-25 18 18 0 0 1 34 8 10 10 0 0 1-1 20H16" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 48l-3 8M33 48l-3 8M46 48l-3 8" stroke="currentColor" stroke-width="3"/>';
        icon.setAttribute('aria-label', 'Rain icon');
      } else if (code >= 2) {
        icon.innerHTML = '<path d="M15 43a13 13 0 0 1 4-25 18 18 0 0 1 34 8 10 10 0 0 1-1 20H16" fill="none" stroke="currentColor" stroke-width="3"/>';
        icon.setAttribute('aria-label', 'Cloud icon');
      } else {
        icon.innerHTML = '<circle cx="32" cy="32" r="10" fill="currentColor"/><g stroke="currentColor" stroke-width="3"><path d="M32 3v10M32 51v10M3 32h10M51 32h10M11.5 11.5l7 7M45.5 45.5l7 7M52.5 11.5l-7 7M18.5 45.5l-7 7"/></g>';
        icon.setAttribute('aria-label', 'Sun icon');
      }
    } catch (_) {
      byId('v2WeatherTemp').textContent = '--°C';
      byId('v2WeatherLabel').textContent = 'Weather unavailable';
      byId('v2WeatherHighLow').textContent = 'High --° / Low --°';
      byId('v2WeatherExtras').textContent = 'Humidity --% / Wind -- km/h';
    }
  }

  loadWeather();
  window.setInterval(loadWeather, 30 * 60 * 1000);

  const GIG_CATEGORY_LABELS = { comedy: 'Comedy', musical: 'Musical', concert: 'Concert', dj: 'DJ', 'film-score': 'Film score', major: 'Big event' };

  // "12 OCT", "25–29 NOV", "30 NOV – 02 DEC"; the year is added when it isn't this year.
  function formatGigDate(value, endValue) {
    const start = new Date(`${value}T12:00:00`);
    if (Number.isNaN(start.getTime())) return value || 'Date TBC';
    const end = endValue ? new Date(`${endValue}T12:00:00`) : null;
    const day = (d) => String(d.getDate()).padStart(2, '0');
    const month = (d) => new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
    const last = end && !Number.isNaN(end.getTime()) && end > start ? end : start;
    const year = last.getFullYear() !== new Date().getFullYear() ? ` ${last.getFullYear()}` : '';
    if (last === start) return `${day(start)} ${month(start)}${year}`;
    if (start.getMonth() === last.getMonth()) return `${day(start)}–${day(last)} ${month(last)}${year}`;
    return `${day(start)} ${month(start)} – ${day(last)} ${month(last)}${year}`;
  }

  // Six-at-a-time card rail shared by the Gig Finder and the Media tracker: batch counter,
  // prev / pause / next, a 10-second countdown that holds on hover or focus, and an honest empty
  // state. `ids` are the element ids of one section; `renderCard(item, number)` returns a card.
  const RAIL_SECONDS = 10;
  const RAIL_SIZE = 6;
  // filter (optional): { group: id of the chip group, test(item, key), label(key) }. The chips'
  // data-filter keys pick a subset; "all" shows everything. Changing it restarts at batch 1.
  function createCardRail({ url, ids, noun, renderCard, filter }) {
    const list = byId(ids.list);
    if (!list) return;
    let all = [];
    let items = [];
    let filterKey = 'all';
    let loading = true;
    let batch = 0;
    let paused = false;
    let hover = false;
    let tick = 0;

    function renderTick() {
      const tickEl = byId(ids.tick);
      const progress = byId(ids.progress);
      if (tickEl) tickEl.textContent = `${String(tick).padStart(2, '0')} / ${RAIL_SECONDS}`;
      if (progress) progress.style.width = `${(tick / RAIL_SECONDS) * 100}%`;
    }

    function render() {
      if (!items.length) {
        const what = filter && filterKey !== 'all' ? filter.label(filterKey) : noun;
        const message = loading ? `Loading ${noun}&hellip;` : `No ${what} to show right now. Check back soon.`;
        list.innerHTML = `<div class="v2-panel v2-gig-empty">${message}</div>`;
        byId(ids.batch).textContent = 'Batch 00 of 00';
        tick = 0;
        renderTick();
        return;
      }
      const batchCount = Math.max(1, Math.ceil(items.length / RAIL_SIZE));
      batch = (batch + batchCount) % batchCount;
      list.innerHTML = items.slice(batch * RAIL_SIZE, (batch + 1) * RAIL_SIZE).map((item, index) => renderCard(item, batch * RAIL_SIZE + index + 1)).join('');
      fitText(list);
      byId(ids.batch).textContent = `Batch ${String(batch + 1).padStart(2, '0')} of ${String(batchCount).padStart(2, '0')}`;
      tick = 0;
      renderTick();
    }

    async function load() {
      render();
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} failed`);
        const payload = await response.json();
        if (!Array.isArray(payload) || !payload.length) throw new Error('Empty');
        all = payload;
        applyFilter();
        batch = 0;
      } catch (_) {
        all = [];
        items = [];
      }
      loading = false;
      render();
    }

    function applyFilter() {
      items = filter && filterKey !== 'all' ? all.filter((item) => filter.test(item, filterKey)) : all;
    }
    const chips = filter ? [...(byId(filter.group)?.querySelectorAll('[data-filter]') || [])] : [];
    chips.forEach((chip) => chip.addEventListener('click', () => {
      filterKey = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      applyFilter();
      batch = 0;
      render();
    }));

    byId(ids.prev)?.addEventListener('click', () => { batch -= 1; render(); });
    byId(ids.next)?.addEventListener('click', () => { batch += 1; render(); });
    byId(ids.pause)?.addEventListener('click', (event) => {
      paused = !paused;
      event.currentTarget.textContent = paused ? '▶︎' : '‖';
      event.currentTarget.setAttribute('aria-label', paused ? `Resume ${noun} rotation` : `Pause ${noun} rotation`);
    });
    // "Hover or focus pauses": the countdown holds while the pointer or keyboard focus is on a card.
    list.addEventListener('pointerenter', () => { hover = true; });
    list.addEventListener('pointerleave', () => { hover = false; });
    list.addEventListener('focusin', () => { hover = true; });
    list.addEventListener('focusout', (event) => { if (!list.contains(event.relatedTarget)) hover = false; });

    load();
    window.setInterval(() => {
      if (paused || hover || document.hidden) return;
      tick += 1;
      if (tick >= RAIL_SECONDS) {
        batch += 1;
        render();
      } else {
        renderTick();
      }
    }, 1000);
  }

  createCardRail({
    url: '/api/gigs',
    noun: 'upcoming gigs',
    filter: {
      group: 'pdosGigFilter',
      test: (gig, key) => (/abu dhabi/i.test(gig.venue || '') ? 'abu-dhabi' : 'dubai') === key,
      label: (key) => (key === 'abu-dhabi' ? 'Abu Dhabi gigs' : 'Dubai gigs')
    },
    ids: { list: 'v2GigList', batch: 'v2GigBatch', tick: 'v2GigTick', progress: 'v2GigProgress', prev: 'v2GigPrev', next: 'v2GigNext', pause: 'v2GigPause' },
    renderCard(gig, number) {
      // Artist photo and ticket page from the API; a plain grey block when there is no photo.
      const image = /^https:\/\//.test(gig.image || '') ? gig.image : '';
      const link = /^https:\/\//.test(gig.url || '')
        ? gig.url
        : `https://www.google.com/search?q=${encodeURIComponent(`${gig.artist} ${gig.venue} tickets`)}`;
      return `<article class="v2-panel v2-gig">
        <div class="v2-index-row"><span>${String(number).padStart(2, '0')}</span><span class="v2-tag">[ ${escapeHtml(GIG_CATEGORY_LABELS[gig.category] || 'Event')} ]</span></div>
        <div class="v2-gig-art">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(gig.artist)}" loading="lazy" decoding="async">` : ''}${image && gig.credit && /^https:\/\//.test(gig.credit.url || '') ? `<a class="v2-gig-credit" href="${escapeHtml(gig.credit.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(gig.credit.text)}</a>` : ''}</div>
        <h3 data-fit="2" title="${escapeHtml(gig.artist)}">${escapeHtml(gig.artist)}</h3>
        <p class="v2-gig-venue" title="${escapeHtml(gig.venue)}">${escapeHtml(gig.venue)}</p><p class="v2-gig-date">${escapeHtml(formatGigDate(gig.date, gig.endDate))}</p>
        <a class="v2-gig-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open details &#8599;</a>
      </article>`;
    },
  });

  // Media tracker: posters and game covers are portrait, so the art panel shows the whole image
  // over a blurred copy of itself instead of cropping it square. No links — information only.
  function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  createCardRail({
    url: '/api/media',
    noun: 'releases',
    filter: {
      group: 'pdosMediaFilter',
      test: (item, key) => item.kind === key,
      label: (key) => (key === 'game' ? 'game releases' : 'films')
    },
    ids: { list: 'v2MediaList', batch: 'v2MediaBatch', tick: 'v2MediaTick', progress: 'v2MediaProgress', prev: 'v2MediaPrev', next: 'v2MediaNext', pause: 'v2MediaPause' },
    renderCard(item, number) {
      const image = /^(https:\/\/|\/assets\/media\/)/.test(item.image || '') ? item.image : '';
      const isGame = item.kind === 'game';
      const tag = isGame ? 'Game' : item.rerelease ? 'Re-release' : 'Film';
      const detail = isGame ? item.platforms : item.location || item.language || '';
      const today = todayIso();
      let status;
      if (isGame) status = item.date <= today ? 'Out now' : 'Coming soon';
      else if (item.rerelease || item.endDate || item.location) status = 'Limited run';
      else status = item.date <= today ? 'In cinemas' : 'Coming soon';
      return `<article class="v2-panel v2-gig v2-media">
        <div class="v2-index-row"><span>${String(number).padStart(2, '0')}</span><span class="v2-tag">[ ${tag} ]</span></div>
        <div class="v2-gig-art v2-media-art">${image ? `<img class="v2-media-blur" src="${escapeHtml(image)}" alt="" aria-hidden="true" loading="lazy" decoding="async"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)} ${isGame ? 'cover' : 'poster'}" loading="lazy" decoding="async">` : ''}</div>
        <h3 data-fit="2" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
        <p class="v2-gig-venue" title="${escapeHtml(detail)}">${escapeHtml(detail)}</p><p class="v2-gig-date">${escapeHtml(formatGigDate(item.date, item.endDate))}</p>
        <span class="v2-gig-link v2-media-status">${status}</span>
      </article>`;
    },
  });

  // Live listening data (dashboard Spotify card, playlist cards, Top Tracks / Artists). Each
  // panel keeps its static empty state, or its last good data, when its route fails.
  const safeUrl = (value) => (typeof value === 'string' && /^https:\/\//.test(value) ? value : '');

  function timeAgo(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  }

  async function loadNowPlaying() {
    const title = byId('v2NowTitle');
    const state = byId('v2NowState');
    const statusLine = byId('v2NowStatus');
    const cover = byId('v2NowCover');
    if (!title || !state || !cover) return;
    try {
      const response = await fetch('/api/now-playing', { cache: 'no-store' });
      if (!response.ok) throw new Error('Now-playing request failed');
      const payload = await response.json();
      const track = payload.track;
      if (!track || !track.name) return;
      let status = 'Paused';
      if (payload.isPlaying) status = 'Now playing';
      else if (payload.playedAt) status = `Last played ${timeAgo(payload.playedAt)}`.trim();
      const artists = (track.artists || []).join(', ');
      title.textContent = track.name;
      title.title = track.name;
      fitText(title);
      state.textContent = artists || 'Unknown artist';
      if (statusLine) statusLine.textContent = status;
      const image = safeUrl(track.image);
      if (image && cover.getAttribute('src') !== image) cover.src = image;
      cover.alt = `${track.album || track.name} album artwork`;
    } catch (_) {
      // Keep whatever is showing.
    }
  }

  // Spotify playlist descriptions arrive HTML-escaped and may contain links; keep text only.
  function descriptionText(html) {
    return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '').trim();
  }

  async function loadPlaylists() {
    const cards = document.querySelectorAll('.v2-playlist');
    try {
      const response = await fetch('/api/playlists');
      if (!response.ok) throw new Error('Playlists request failed');
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('Unexpected playlists payload');
      payload.forEach((playlist, index) => {
        const card = cards[index];
        if (!card || !playlist) return;
        const heading = card.querySelector('h3');
        const text = card.querySelector('.v2-playlist-copy p');
        const image = card.querySelector('.v2-playlist-cover');
        const link = card.querySelector('.v2-card-foot a');
        const tag = card.querySelector('.v2-tag');
        if (playlist.name && heading) {
          heading.textContent = playlist.name;
          fitText(heading);
        }
        const description = descriptionText(playlist.description);
        if (description && text) text.textContent = description;
        const imageUrl = safeUrl(playlist.image);
        if (imageUrl && image) {
          image.src = imageUrl;
          image.alt = `${playlist.name || 'Playlist'} cover`;
        }
        const url = safeUrl(playlist.url);
        if (url && link) link.href = url;
        if (Number.isFinite(playlist.trackCount) && tag) tag.textContent = `[ ${playlist.trackCount} Tracks ]`;
      });
    } catch (_) {
      // Static cards already link to the right playlists.
    }
  }

  let listening = null;
  let topMode = 'tracks';

  function renderTop() {
    const table = byId('v2TopTable');
    if (!table || !listening) return;
    const artistsMode = topMode === 'artists';
    const items = (artistsMode ? listening.artists : listening.tracks) || [];
    const fromLog = listening.source === 'log';
    const maxPlays = Math.max(1, ...items.map((item) => item.plays || 0));
    const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', month: 'long' }).format(new Date());
    byId('v2TopTitle').textContent = fromLog ? 'Top this month' : 'Top last 4 weeks';
    byId('v2TopPeriod').textContent = `[ ${fromLog ? month : 'Last 4 weeks'} / ${artistsMode ? 'Artists' : 'Tracks'} ]`;
    table.setAttribute('aria-label', `Top ${topMode} ${fromLog ? 'this month' : 'over the last 4 weeks'}`);
    const header = `<div class="v2-track-row v2-track-header" role="row"><span role="columnheader">${artistsMode ? 'Artist' : 'Track'}</span><span role="columnheader">${artistsMode ? '' : 'Artist'}</span><span></span><span role="columnheader">Plays</span></div>`;
    const rows = Array.from({ length: 5 }, (_, index) => {
      const item = items[index];
      if (!item) {
        return '<div class="v2-track-row" role="row"><span role="cell">Not enough listening yet</span><span role="cell">--</span><span class="v2-track-bar" aria-hidden="true"><i></i></span><span role="cell">--</span></div>';
      }
      const url = safeUrl(item.url);
      const name = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a>`
        : escapeHtml(item.name);
      const second = artistsMode ? '' : escapeHtml((item.artists || []).join(', '));
      const hasPlays = Number.isFinite(item.plays);
      // No bar without real play counts — a rank-shaped bar would imply numbers we don't have.
      const width = hasPlays ? Math.round((item.plays / maxPlays) * 100) : 0;
      return `<div class="v2-track-row" role="row"><span role="cell">${name}</span><span role="cell">${second}</span><span class="v2-track-bar" aria-hidden="true"><i style="width:${width}%"></i></span><span role="cell">${hasPlays ? item.plays : '--'}</span></div>`;
    });
    table.innerHTML = header + rows.join('');
  }

  async function loadListening() {
    try {
      const response = await fetch('/api/listening');
      if (!response.ok) throw new Error('Listening request failed');
      const payload = await response.json();
      if (!Array.isArray(payload.tracks) || !Array.isArray(payload.artists)) throw new Error('Unexpected listening payload');
      listening = payload;
      renderTop();
      const toggle = byId('v2TopToggle');
      if (toggle) toggle.hidden = false;
    } catch (_) {
      // Keep the "Awaiting listening data" rows.
    }
  }

  document.querySelectorAll('[data-top]').forEach((button) => {
    button.addEventListener('click', () => {
      topMode = button.dataset.top;
      document.querySelectorAll('[data-top]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      renderTop();
    });
  });

  // Health card: latest Fitbit heart rate via /api/heart-rate. Readings only reach Google when
  // the tracker syncs with the phone, so the foot always says how old the reading is.
  const MOTION_LABELS = { SEDENTARY: 'At rest', ACTIVE: 'Active' };

  let heartReading = null;

  // Re-rendered on every tick, so "4m ago" keeps counting between new readings.
  function renderHeartFoot() {
    const foot = byId('v2HeartFoot');
    if (!foot || !heartReading) return;
    const parts = ['Latest reading'];
    const age = heartReading.sampledAt ? timeAgo(heartReading.sampledAt) : '';
    if (age) parts.push(age);
    if (MOTION_LABELS[heartReading.motion]) parts.push(MOTION_LABELS[heartReading.motion]);
    foot.textContent = parts.join(' / ');
  }

  async function loadHeartRate() {
    const value = byId('v2HeartValue');
    const foot = byId('v2HeartFoot');
    if (!value || !foot) return;
    try {
      // no-store: the browser's HTTP cache otherwise answered every poll with the first reading.
      // The Worker's own edge cache still limits calls to Google.
      const response = await fetch('/api/heart-rate', { cache: 'no-store' });
      if (!response.ok) throw new Error('Heart-rate request failed');
      const payload = await response.json();
      if (!Number.isFinite(payload.bpm)) {
        if (!heartReading) foot.textContent = 'No reading in the last 24 h';
        return;
      }
      heartReading = payload;
      const unit = document.createElement('small');
      unit.textContent = ' BPM';
      value.replaceChildren(String(payload.bpm), unit);
      value.classList.remove('v2-placeholder');
      renderHeartFoot();
    } catch (_) {
      renderHeartFoot();
    }
  }

  // Steps card: today's total via /api/steps against a 10,000 goal. The markup holds the fixed
  // "/10,000"; only the count, goal line and bar change.
  const STEPS_GOAL = 10000;
  const stepsNumber = new Intl.NumberFormat('en-GB');

  async function loadSteps() {
    const card = byId('v2Steps');
    const value = byId('v2StepsValue');
    const goal = byId('v2StepsGoal');
    const bar = byId('v2StepsBar');
    if (!card || !value || !goal || !bar) return;
    try {
      const response = await fetch('/api/steps', { cache: 'no-store' });
      if (!response.ok) throw new Error('Steps request failed');
      const payload = await response.json();
      if (!Number.isFinite(payload.steps)) throw new Error('Steps missing');
      const done = payload.steps >= STEPS_GOAL;
      const percent = Math.min(100, Math.floor((payload.steps / STEPS_GOAL) * 100));
      value.textContent = stepsNumber.format(payload.steps);
      value.parentElement.classList.remove('v2-placeholder');
      goal.textContent = done ? 'Daily goal reached' : `${percent}% of daily goal`;
      bar.style.width = `${percent}%`;
      card.classList.toggle('v2-steps--done', done);
    } catch (_) {
      // Keep the last good total on a failed poll.
    }
  }

  // Game card: whichever of PlayStation and Steam is running a game, else the one played most
  // recently, via /api/game. Keeps the last good game on a failed poll.
  const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  let currentGame = null;

  function renderGameState() {
    const state = byId('v2GameState');
    if (!state || !currentGame) return;
    const platform = currentGame.platform || '';
    const age = currentGame.lastPlayedAt ? timeAgo(currentGame.lastPlayedAt) : '';
    state.textContent = currentGame.isPlaying
      ? ['Playing now', platform].filter(Boolean).join(' / ')
      : ['Last played', age, platform].filter(Boolean).join(' / ');
  }

  // Steam covers are portrait; a missing cover falls back to the landscape header, cropped square.
  function setGameArt(art, game) {
    const image = safeUrl(game.image);
    if (!image || art.dataset.src === image) return;
    art.dataset.src = image;
    art.dataset.fallback = safeUrl(game.imageFallback);
    art.classList.toggle('v2-game-art--portrait', game.source === 'steam');
    art.onerror = () => {
      const fallback = art.dataset.fallback;
      art.dataset.fallback = '';
      art.classList.remove('v2-game-art--portrait');
      art.src = fallback || BLANK_IMAGE;
    };
    art.src = image;
    art.alt = `${game.title} art`;
  }

  async function loadGame() {
    const title = byId('v2GameTitle');
    const art = byId('v2GameArt');
    if (!title || !art) return;
    try {
      const response = await fetch('/api/game', { cache: 'no-store' });
      if (!response.ok) throw new Error('Game request failed');
      const payload = await response.json();
      if (!payload.title) throw new Error('No game');
      if (!currentGame || currentGame.title !== payload.title) {
        title.textContent = payload.title;
        fitText(title);
      }
      setGameArt(art, payload);
      currentGame = payload;
    } catch (_) {
      // Keep the last good game.
    }
    renderGameState();
  }

  loadNowPlaying();
  loadPlaylists();
  loadListening();
  loadHeartRate();
  loadSteps();
  loadGame();
  window.setInterval(() => {
    if (document.hidden) return;
    loadNowPlaying();
    loadHeartRate();
    loadSteps();
    loadGame();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    loadNowPlaying();
    loadHeartRate();
    loadSteps();
    loadGame();
  });

  // Parwani-DOS shell: native CSS scroll-snap (see the paging media query in ui-v2.css)
  // handles wheel/touch/scrollbar movement and in-page anchor links on its own, via the
  // site-wide `html{scroll-behavior:smooth}`. This just drives the chrome that sits on top:
  // an IntersectionObserver toggles .is-active per section (CSS does the CRT power-on/off),
  // keeps the top bar's typed command line, section counter and clock current, handles the
  // 1-8 jump keys and Esc, and runs the Mono/Paper/Night theme switcher. Phones fall outside
  // the paging media query, so the CRT wrappers stay inert there (see .pdos-crt-* in the CSS)
  // and this still safely updates the (hidden) top bar state as the user scrolls past.
  function initShell() {
    const root = document.querySelector('.portfolio-v2');
    const sections = Array.from(document.querySelectorAll('.v2-section[data-sec]'));
    if (!root || !sections.length) return;
    const SECS = [
      ['home', 'Home'], ['about', 'About'], ['journal', 'Journal'], ['projects', 'Projects'], ['toolbox', 'Toolbox'],
      ['media', 'Media'], ['playlists', 'Playlists'], ['gigs', 'Gigs']
    ];
    const THEMES = { mono: 'Mono', paper: 'Paper', night: 'Night' };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cmdEl = byId('pdosCmd');
    const secLabelEl = byId('pdosSecLabel');
    const clockEl = byId('pdosClock');
    const themeBtn = byId('pdosThemeBtn');
    const themeMenu = byId('pdosThemeMenu');
    const themeLabelEl = byId('pdosThemeLabel');
    const themeCaretEl = byId('pdosThemeCaret');

    let activeKey = null;
    let typeTimer = null;
    // The section a number key or in-page link is heading to, so About knows it was jumped to
    // (it then opens on its Summary) rather than scrolled up into from Journal (its last stop).
    let jumpKey = null;

    function typeCmd(key) {
      if (typeTimer) window.clearInterval(typeTimer);
      if (!cmdEl) return;
      const target = key === 'home' ? 'cd \\' : `cd ${key}`;
      if (reduceMotion.matches) { cmdEl.textContent = target; return; }
      let i = 0;
      cmdEl.textContent = '';
      typeTimer = window.setInterval(() => {
        i += 1;
        cmdEl.textContent = target.slice(0, i);
        if (i >= target.length) window.clearInterval(typeTimer);
      }, 45);
    }

    function activate(section) {
      const key = section.getAttribute('data-sec');
      if (key === activeKey) return;
      const index = SECS.findIndex(([k]) => k === key);
      if (index < 0) return;
      const prev = activeKey;
      activeKey = key;
      const jumped = jumpKey === key;
      if (jumped) jumpKey = null;
      document.dispatchEvent(new CustomEvent('pdos:section', { detail: { key, prev, prevIndex: SECS.findIndex(([k]) => k === prev), jumped } }));
      if (secLabelEl) secLabelEl.textContent = `${String(index + 1).padStart(2, '0')} / 08 · ${SECS[index][1]}`;
      typeCmd(key);
      // Keep the URL in sync so a direct link or the browser back/forward button still lands
      // on the right section (SH-09), now that there's no nav link to carry aria-current.
      const id = section.id;
      const hash = id === 'v2-home' ? '' : `#${id}`;
      if (location.hash !== hash) history.replaceState(null, '', hash ? hash : location.pathname + location.search);
    }

    function tickClock() {
      if (!clockEl) return;
      const now = new Date();
      clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    // Mono reproduces the site's previously-locked greyscale palette exactly; Night is the
    // default for a new visitor. Persisted so a returning visitor keeps their choice.
    function applyTheme(theme) {
      if (!THEMES[theme]) theme = 'night';
      root.setAttribute('data-theme', theme);
      try { window.localStorage.setItem('pdosTheme', theme); } catch (_) { /* private mode */ }
      if (themeLabelEl) themeLabelEl.textContent = THEMES[theme];
      document.querySelectorAll('.pdos-theme-opt').forEach((opt) => {
        const match = opt.getAttribute('data-theme') === theme;
        opt.setAttribute('aria-selected', String(match));
        const mark = opt.querySelector('.pdos-theme-opt-mark');
        if (mark) mark.textContent = match ? '■' : '';
      });
    }

    function openThemeMenu(open) {
      if (!themeMenu || !themeBtn) return;
      themeMenu.hidden = !open;
      themeBtn.setAttribute('aria-expanded', String(open));
      if (themeCaretEl) themeCaretEl.textContent = open ? '−' : '+';
    }

    let savedTheme = 'night';
    try { savedTheme = window.localStorage.getItem('pdosTheme') || 'night'; } catch (_) { /* private mode */ }
    applyTheme(savedTheme);

    if (themeBtn) {
      themeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openThemeMenu(Boolean(themeMenu && themeMenu.hidden));
      });
    }
    document.querySelectorAll('.pdos-theme-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        applyTheme(opt.getAttribute('data-theme'));
        openThemeMenu(false);
      });
    });
    document.addEventListener('click', (event) => {
      if (themeMenu && !themeMenu.hidden && !(event.target instanceof Element && event.target.closest('.pdos-theme'))) openThemeMenu(false);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          entry.target.classList.add('is-active');
          activate(entry.target);
        } else {
          entry.target.classList.remove('is-active');
        }
      });
    }, { threshold: [0.55] });
    sections.forEach((section) => observer.observe(section));

    tickClock();
    window.setInterval(tickClock, 15000);

    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#v2-"]') : null;
      const target = link && document.getElementById(link.getAttribute('href').slice(1));
      if (target && target.hasAttribute('data-sec')) jumpKey = target.getAttribute('data-sec');
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.target instanceof Element && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.target instanceof Element && event.target.closest('[contenteditable="true"]')) return;
      if (event.key === 'Escape') { openThemeMenu(false); return; }
      const n = parseInt(event.key, 10);
      if (!(n >= 1 && n <= 8)) return;
      // An open window locks the page: no section jumps until it is closed.
      if (document.documentElement.classList.contains('pdos-locked')) return;
      const target = sections[n - 1];
      if (target) jumpKey = target.getAttribute('data-sec');
      if (target) target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // On phones the Journal reader and the Toolbox panel cover the screen, so the back gesture should
  // close them rather than leave the site: opening pushes a history entry, closing pops it.
  function backCloses(close) {
    const phone = window.matchMedia('(max-width: 720px), (max-width: 960px) and (max-height: 619px)');
    let pushed = false;
    window.addEventListener('popstate', () => { if (pushed) { pushed = false; close(); } });
    return {
      opened() { if (phone.matches && !pushed) { history.pushState({ pdosPanel: true }, ''); pushed = true; } },
      closed() { if (pushed) { pushed = false; history.back(); } },
    };
  }

  // Journal: a grid of headline cards with the same slide-in side panel as the Toolbox. Pressing
  // the open card again, ✕ or Esc closes it; while it is open the page is locked like the Toolbox.
  function initJournal(setLock, overlayOpen) {
    const journal = document.querySelector('.pdos-journal');
    const reader = byId('pdosJournalReader');
    if (!journal || !reader) return;
    const cards = [...journal.querySelectorAll('.pdos-journal-card')];
    const entries = [...reader.querySelectorAll('.pdos-journal-entry')];
    const body = reader.querySelector('.pdos-journal-reader-body');
    const exeEl = byId('pdosJournalExe');
    const back = backCloses(() => close());
    let current = null;

    // Fewer than three entries still fill the width: one column per entry up to three.
    journal.style.setProperty('--journal-cols', String(Math.min(Math.max(cards.length, 1), 3)));
    reader.inert = true;
    reader.setAttribute('aria-hidden', 'true');
    const hideEntries = () => { if (!current) entries.forEach((entry) => { entry.hidden = true; }); };
    // The entry stays drawn while the panel slides shut, then is hidden once the slide ends.
    reader.addEventListener('transitionend', (event) => {
      if (event.target === reader && (event.propertyName === 'width' || event.propertyName === 'transform')) hideEntries();
    });

    function open(card) {
      current = card;
      const entry = byId(card.getAttribute('aria-controls'));
      const title = entry.querySelector('h3');
      entries.forEach((panel) => { panel.hidden = panel !== entry; });
      cards.forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
      exeEl.textContent = `${card.dataset.slug}.log — ref. 01.${card.dataset.n}`;
      reader.setAttribute('aria-label', title.textContent);
      body.scrollTop = 0;
      journal.classList.add('is-open');
      reader.inert = false;
      reader.removeAttribute('aria-hidden');
      setLock(true);
      back.opened();
      title.focus({ preventScroll: true });
    }

    function close() {
      if (!current) return;
      const card = current;
      current = null;
      cards.forEach((c) => c.setAttribute('aria-pressed', 'false'));
      journal.classList.remove('is-open');
      reader.inert = true;
      reader.setAttribute('aria-hidden', 'true');
      if (parseFloat(getComputedStyle(reader).transitionDuration) === 0) hideEntries();
      setLock(false);
      back.closed();
      card.focus({ preventScroll: true });
    }

    cards.forEach((card) => {
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', () => (current === card ? close() : open(card)));
    });
    byId('pdosJournalClose').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && current && !overlayOpen()) close();
    });
  }

  // About (02, design_handoff_about_section README §02 About + Revision 2): stop 0 is the Summary,
  // stops 1-7 the timeline tapes. On desktop (paging mode) a single wheel listener turns vertical
  // ticks into one stop per gesture and lets the page snap on to Home / Journal only at either end;
  // phones get a native horizontal snap row instead. The detail window is a page overlay that
  // initWindows owns (detail.open / close / isOpen); it counts as a lock like the project windows.
  function initAbout(detail) {
    const win = document.querySelector('.pdos-window--about');
    const track = byId('pdosAboutTrack');
    if (!win || !track) return null;
    const cards = [...win.querySelectorAll('.pdos-about-card')];
    const LAST = cards.length;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const rm = () => reduceMotion.matches;
    const desk = () => pagedQuery.matches;
    const locked = () => document.documentElement.classList.contains('pdos-locked');
    const icons = () => window.pdosIcons;
    const pad2 = (n) => String(n).padStart(2, '0');
    const pos = (t) => `${((t - 2015) / 12 * 100).toFixed(2)}%`;
    const typedEl = byId('pdosAboutTyped');
    const restEl = byId('pdosAboutRest');
    const sinceEl = byId('pdosAboutSince');
    const STATEMENT = typedEl.textContent;
    // Transport icons are drawn, not ▶ / ‖ characters, which iPhones show as colour emoji.
    const TRANSPORT = {
      play: '<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" focusable="false"><path d="M4 0 13 5 4 10Z"/></svg>',
      pause: '<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" focusable="false"><path d="M4 0h3v10H4zM9 0h3v10H9z"/></svg>',
    };
    // Logo sprites keep their size; the drawn ones grow a little on phones and in the detail window.
    const SCALES = new Set(['dess', 'torii', 'till', 'perfume']);
    const stops = cards.map((card, i) => ({
      card,
      n: pad2(i + 1),
      tc: card.dataset.tc,
      t0: Number(card.dataset.t0),
      t1: Number(card.dataset.t1),
      row: Number(card.dataset.row),
      lane: card.dataset.lane,
      title: card.querySelector('.pdos-about-card-title').textContent,
      icon: card.querySelector('.pdos-icon'),
    }));
    stops.forEach((s) => { s.icon.dataset.iconBase = s.icon.dataset.iconP; });

    // Ruler (ticks, labels, one bar per stop) and rail (one dot per stop) come from the cards.
    const years = byId('pdosAboutYears');
    for (let y = 2015; y <= 2026; y += 1) {
      const tick = document.createElement('div');
      tick.className = 'pdos-about-tick';
      tick.style.left = pos(y);
      const label = document.createElement('div');
      label.className = 'pdos-about-year';
      label.style.left = pos(y);
      label.textContent = String(y);
      years.insertBefore(label, byId('pdosAboutProgress'));
      years.insertBefore(tick, label);
    }
    const bars = stops.map((s, i) => {
      const bar = document.createElement('div');
      bar.className = 'pdos-about-bar';
      bar.title = `${s.title} · ${s.card.querySelector('.pdos-about-dates span').textContent}`;
      bar.style.left = pos(s.t0);
      bar.style.width = `${((s.t1 - s.t0) / 12 * 100).toFixed(2)}%`;
      bar.style.top = s.lane === 'Education' ? (s.row ? '34px' : '14px') : '72px';
      bar.addEventListener('click', () => go(i + 1));
      years.insertBefore(bar, byId('pdosAboutPlayhead'));
      return bar;
    });
    const rail = byId('pdosAboutRail');
    const dots = [{ title: 'Summary' }, ...stops].map((s, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.title = s.title;
      dot.setAttribute('aria-label', `Stop ${pad2(i + 1)}: ${s.title}`);
      dot.addEventListener('click', () => go(i));
      rail.appendChild(dot);
      return dot;
    });

    let stop = 0;
    let active = false;
    let fromScroll = false;
    let lockUntil = 0;
    let gestureUsed = false;
    let lastWheel = 0;
    let lastDy = 0;
    const timers = { enter: 0, type: 0, since: 0, play: 0, tc: 0 };
    const stopTimers = (...keys) => keys.forEach((k) => { window.clearTimeout(timers[k]); window.clearInterval(timers[k]); timers[k] = 0; });

    function setIcon(el, on) {
      const api = icons();
      if (api) api.setOn(el, on);
    }

    // Phones draw the scalable sprites 15% larger; switching layout redraws them.
    function sizeIcons() {
      const api = icons();
      stops.forEach((s) => {
        const base = Number(s.icon.dataset.iconBase);
        const p = !desk() && SCALES.has(s.icon.dataset.icon) ? Math.max(2, Math.round(base * 1.15)) : base;
        if (String(p) !== s.icon.dataset.iconP) {
          s.icon.dataset.iconP = String(p);
          if (api) api.render(s.icon);
        }
      });
    }

    function render() {
      const cur = stops[Math.max(0, stop - 1)];
      const centre = Math.max(0, stop - 1);
      const still = rm();
      win.classList.toggle('is-timeline', stop > 0);
      byId('pdosAboutLane').textContent = stop === 0 ? 'Profile' : cur.lane;
      dots.forEach((dot, i) => { if (i === stop) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current'); });
      bars.forEach((bar, i) => bar.classList.toggle('is-active', i + 1 === stop));
      const lineW = stop === 0 ? '0%' : pos(cur.t0);
      byId('pdosAboutProgress').style.width = lineW;
      byId('pdosAboutPlayhead').style.left = lineW;
      stops.forEach((s, i) => {
        const d = i - centre;
        const ad = Math.abs(d);
        const centred = d === 0;
        const card = s.card;
        card.classList.toggle('is-centre', centred);
        card.style.transform = still ? 'translate(-50%, -50%)' : `translate(-50%, -50%) translateX(${d * 330}px) translateZ(${-ad * 240}px) rotateY(${d * 30}deg)`;
        card.style.opacity = String(still ? (centred ? 1 : 0) : ([1, 0.55, 0.22][ad] ?? 0));
        card.style.zIndex = String(10 - ad);
        const reachable = !desk() || (still ? centred : ad <= 2);
        card.style.pointerEvents = reachable ? '' : 'none';
        card.tabIndex = reachable ? 0 : -1;
        // A sprite plays only while its card is the one in view.
        setIcon(s.icon, active && !still && (desk() ? stop >= 1 && centred : stop === i + 1));
      });
    }

    function scrollPhoneTo(i, smooth) {
      if (desk()) return;
      track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !rm() ? 'smooth' : 'auto' });
    }

    function go(i) {
      const lo = detail.isOpen() ? 1 : 0;
      i = Math.max(lo, Math.min(LAST, i));
      if (i === stop) return;
      lockUntil = performance.now() + 650;
      stop = i;
      render();
      if (detail.isOpen()) fillDetail();
      if (!fromScroll) scrollPhoneTo(i, true);
    }

    function setTyped(n) {
      typedEl.textContent = STATEMENT.slice(0, n);
      restEl.textContent = STATEMENT.slice(n);
    }

    function stopPlay() {
      stopTimers('play');
      byId('pdosAboutPlay').innerHTML = TRANSPORT.play;
      byId('pdosAboutPlay').setAttribute('aria-label', 'Play the timeline');
    }

    function togglePlay() {
      if (timers.play) { stopPlay(); return; }
      if (stop >= LAST) go(1);
      byId('pdosAboutPlay').innerHTML = TRANSPORT.pause;
      byId('pdosAboutPlay').setAttribute('aria-label', 'Pause the timeline');
      timers.play = window.setInterval(() => { if (stop >= LAST) stopPlay(); else go(stop + 1); }, 2600);
    }

    // Entry: the statement types in, the [Now] rows step in and the start year counts up.
    function enter(at) {
      stopTimers('enter', 'type', 'since');
      stopPlay();
      active = true;
      lockUntil = performance.now() + 800;
      gestureUsed = true;
      stop = at;
      win.classList.remove('is-in');
      render();
      window.setTimeout(() => scrollPhoneTo(at, false), 60);
      if (rm()) { setTyped(STATEMENT.length); sinceEl.textContent = '2026'; win.classList.add('is-in'); return; }
      setTyped(0);
      sinceEl.textContent = '2015';
      timers.enter = window.setTimeout(() => {
        win.classList.add('is-in');
        let n = 0;
        timers.type = window.setInterval(() => { n += 2; setTyped(Math.min(n, STATEMENT.length)); if (n >= STATEMENT.length) stopTimers('type'); }, 22);
        let y = 2015;
        timers.since = window.setInterval(() => { y += 1; sinceEl.textContent = String(y); if (y >= 2026) stopTimers('since'); }, 60);
      }, 650);
    }

    function leave() {
      stopTimers('enter', 'type', 'since');
      stopPlay();
      active = false;
      setTyped(STATEMENT.length);
      sinceEl.textContent = '2026';
      if (detail.isOpen()) detail.close();
      render();
    }

    const dIcon = byId('pdosAboutDIcon');
    function fillDetail() {
      const s = stops[stop - 1];
      const card = s.card;
      byId('pdosAboutDFile').textContent = `${card.querySelector('.pdos-about-card-foot span').textContent} — stop ${s.n} / 07`;
      byId('pdosAboutDTape').textContent = `Tape ${s.n} · TC ${s.tc}`;
      byId('pdosAboutDLane').textContent = `[${s.lane}]`;
      byId('pdosAboutDTitle').textContent = s.title;
      byId('pdosAboutDRole').textContent = card.querySelector('.pdos-about-role').textContent;
      byId('pdosAboutDWhen').textContent = `${card.querySelector('.pdos-about-dates span').textContent} · ${card.querySelector('.pdos-about-place').textContent}`;
      byId('pdosAboutDHl').replaceChildren(...[...card.querySelectorAll('.pdos-about-hl > span')].map((h) => {
        const li = document.createElement('li');
        li.textContent = h.textContent;
        return li;
      }));
      const link = byId('pdosAboutDLink');
      link.hidden = !card.dataset.link;
      if (card.dataset.link) { link.href = card.dataset.link; link.textContent = card.dataset.linkLabel; }
      const name = s.icon.dataset.icon;
      const base = Number(s.icon.dataset.iconBase);
      dIcon.dataset.icon = name;
      dIcon.dataset.iconP = String(SCALES.has(name) ? Math.max(2, Math.round(base * (desk() ? 1.7 : 1.2))) : base);
      const api = icons();
      if (api) { api.render(dIcon); api.setOn(dIcon, !rm()); }
    }

    function openDetail() {
      if (stop < 1 || detail.isOpen()) return;
      stopPlay();
      fillDetail();
      detail.open();
      byId('pdosAboutDClose').focus();
    }

    cards.forEach((card, i) => card.addEventListener('click', () => {
      if (!desk()) { go(i + 1); openDetail(); return; }
      if (stop === i + 1) openDetail();
      else go(i + 1);
    }));
    win.querySelectorAll('[data-goto]').forEach((btn) => btn.addEventListener('click', () => {
      go(btn.dataset.goto === 'next' ? stop + 1 : Number(btn.dataset.goto));
    }));
    byId('pdosAboutPrev').addEventListener('click', () => go(stop - 1));
    byId('pdosAboutNext').addEventListener('click', () => go(stop + 1));
    byId('pdosAboutPlay').addEventListener('click', togglePlay);
    byId('pdosAboutDNav').addEventListener('click', () => go(stop >= LAST ? 1 : stop + 1));

    document.addEventListener('pdos:section', (event) => {
      const { key, prev, prevIndex, jumped } = event.detail;
      if (key === 'about') enter(!jumped && prevIndex > 1 ? LAST : 0);
      else if (prev === 'about') leave();
    });

    // Scroll capture (README "Scroll capture"): only while About is the active section on a paging
    // layout and nothing is open. Each move locks for 650ms (800ms on entry) and spends the gesture,
    // so trackpad momentum never skips a stop and the flick that arrived never carries on out. At
    // either end the event is left alone and native scroll-snap moves on to the next section.
    window.addEventListener('wheel', (event) => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const dy = (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
      // The input's own time, so a busy main thread can't make one gesture look like two.
      const t = event.timeStamp || performance.now();
      // A fresh gesture: a pause, a change of direction or a sudden burst of speed (a new swipe
      // during momentum). A steady wheel spin or a momentum tail stays one gesture. Tracked in every
      // section, so the gesture that scrolled into About is still recognised once it is active.
      const fresh = t - lastWheel > 200 || (Math.abs(dy) >= 4 && (Math.sign(dy) !== Math.sign(lastDy) || (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(lastDy) * 1.6)));
      lastWheel = t;
      if (Math.abs(dy) >= 4) lastDy = dy;
      if (!active || !desk() || locked()) return;
      if (fresh) gestureUsed = false;
      if (t < lockUntil || Math.abs(dy) < 4 || gestureUsed) { event.preventDefault(); return; }
      if (dy > 0 && stop < LAST) { event.preventDefault(); gestureUsed = true; go(stop + 1); }
      else if (dy < 0 && stop > 0) { event.preventDefault(); gestureUsed = true; go(stop - 1); }
    }, { passive: false });

    // Tablets on the paging layout: a horizontal swipe moves one stop; vertical swipes page as usual.
    let touch = null;
    const body = byId('pdosAboutBody');
    body.addEventListener('touchstart', (event) => { const p = event.touches[0]; touch = { x: p.clientX, y: p.clientY }; }, { passive: true });
    body.addEventListener('touchend', (event) => {
      if (!touch || !desk()) { touch = null; return; }
      const p = event.changedTouches[0];
      const dx = p.clientX - touch.x;
      const dy = p.clientY - touch.y;
      touch = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(stop + (dx < 0 ? 1 : -1));
    });

    // Phones: the snap row itself is the control; the stop follows whichever panel is in view.
    track.addEventListener('scroll', () => {
      if (desk() || !track.clientWidth) return;
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== stop) { fromScroll = true; go(i); fromScroll = false; }
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
      if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (locked() && !detail.isOpen()) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        go(stop + (event.key === 'ArrowRight' ? 1 : -1));
      } else if (event.key === 'Enter' && !detail.isOpen() && stop > 0 && !(event.target instanceof Element && event.target.closest('button, a'))) {
        // Otherwise the same keypress would activate the ✕ that openDetail has just focused.
        event.preventDefault();
        openDetail();
      }
    });

    const relayout = () => { sizeIcons(); render(); scrollPhoneTo(stop, false); };
    pagedQuery.addEventListener('change', relayout);
    reduceMotion.addEventListener('change', render);
    // pdos-icons.js is deferred, so the sprites are sized and switched on once it has run.
    if (document.readyState === 'complete') sizeIcons();
    else window.addEventListener('load', () => { sizeIcons(); render(); });
    win.classList.add('is-ready', 'is-in');
    render();

    return { closed() { setIcon(dIcon, false); } };
  }

  // Windows over the page (Parwani-DOS Phases 4-6): project windows, the Champion Run setup window,
  // the Toolbox panel and the Journal reader. While any of them is open the page is locked
  // (html.pdos-locked: no scrolling, no 1-8 keys, no in-page jump links) until it is closed with ✕, the scrim or Esc.
  const PDOS_PROJECTS = {
    music: { n: '01', tag: 'Music', title: 'Sounds Like', desc: 'A similarity engine for music discovery. Turn text into personalised playlists.', status: 'Phase 02 / Similarity engine', color: '#1ed760', file: 'sounds_like.vol' },
    where: { n: '03', tag: 'Tool', title: 'Where Next', desc: 'A simple tool for exploring new destinations.', status: 'Planned · In development', color: 'oklch(0.88 0.07 85)', file: 'where_next.vol' },
    speed: { n: '04', tag: 'Game', title: 'Speed Round', desc: 'A fast-paced trivia game for curious minds.', status: 'Planned · In development', color: 'oklch(0.74 0.16 0)', file: 'speed_round.exe' },
    terminal: { n: '05', tag: 'Game', title: 'Untitled Terminal Adventure', desc: 'A text-based experiment in choice and consequence.', status: 'Planned · In development', color: 'oklch(0.75 0.16 40)', file: 'terminal_adventure.exe' },
    crack: { n: '06', tag: 'Game', title: 'Crack', desc: 'Visual experiments with fracture, distortion and decay.', status: 'Playable', color: '#f4f3ef', file: 'crack.exe' }
  };

  function initWindows() {
    const root = document.querySelector('.portfolio-v2');
    const projectOverlay = byId('pdosProjectOverlay');
    const champOverlay = byId('pdosChampOverlay');
    const crackOverlay = byId('pdosCrackOverlay');
    const aboutOverlay = byId('pdosAboutOverlay');
    if (!root || !projectOverlay || !champOverlay || !crackOverlay) return;
    // Sections clip and transform their content for the CRT effect, which would trap a fixed
    // overlay inside them, so the overlays live at the end of the page root instead.
    root.appendChild(projectOverlay);
    root.appendChild(champOverlay);
    root.appendChild(crackOverlay);
    if (aboutOverlay) root.appendChild(aboutOverlay);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const locks = { window: false, tool: false, journal: false };
    const setLock = (key, on) => {
      locks[key] = on;
      document.documentElement.classList.toggle('pdos-locked', locks.window || locks.tool || locks.journal);
    };
    let openOverlay = null;
    let returnFocus = null;
    let about = null;

    const focusables = (el) => [...el.querySelectorAll('button:not(:disabled), a[href], iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.offsetParent !== null || node === document.activeElement);

    const openVictoryRoad = initChampionRun(champOverlay);
    const crack = initCrack(crackOverlay, () => openOverlay === crackOverlay);

    function showOverlay(overlay) {
      if (openOverlay) hideOverlay({ restoreFocus: false });
      returnFocus = document.activeElement;
      overlay.hidden = false;
      openOverlay = overlay;
      setLock('window', true);
      overlay.querySelector('.pdos-dialog').focus();
    }

    function hideOverlay({ restoreFocus = true } = {}) {
      if (!openOverlay) return;
      openOverlay.hidden = true;
      // The Very Best lives only while its window is open: closing ends the battle, audio and timers.
      if (openOverlay === champOverlay && window.VictoryRoad && window.VictoryRoad.dispose) window.VictoryRoad.dispose();
      // Crack likewise: closing stops the dial and its key listener; reopening starts fresh.
      if (openOverlay === crackOverlay) crack.close();
      if (openOverlay === aboutOverlay && about) about.closed();
      openOverlay = null;
      setLock('window', false);
      if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
    }

    // ✕, the scrim and Escape: the game may ask first (a battle in progress confirms inside the
    // game screen, then closes through the callback).
    function requestClose() {
      const game = window.VictoryRoad;
      if (openOverlay === champOverlay && game && game.beforeClose && !game.beforeClose(() => hideOverlay())) return;
      hideOverlay();
    }
    window.VictoryRoad = Object.assign(window.VictoryRoad || {}, { close: () => { if (openOverlay === champOverlay) hideOverlay(); } });

    function openProject(key) {
      if (key === 'champion') { showOverlay(champOverlay); openVictoryRoad(); return; }
      if (key === 'crack') { showOverlay(crackOverlay); crack.open(); return; }
      const p = PDOS_PROJECTS[key];
      if (!p) return;
      projectOverlay.querySelector('.pdos-dialog').style.setProperty('--dialog-bar', p.color);
      byId('pdosProjectFile').textContent = `${p.file} — project ${p.n}`;
      byId('pdosProjectNum').textContent = p.n;
      byId('pdosProjectTag').textContent = `[ ${p.tag} ]`;
      byId('pdosProjectTitle').textContent = p.title;
      byId('pdosProjectDesc').textContent = p.desc;
      byId('pdosProjectStatus').textContent = p.status;
      // Projects only ever open as this overlay: no embedded preview, no full-screen / new-tab link.
      byId('pdosProjectStage').textContent = 'Planned — nothing to run yet. It will run here, inside this window.';
      showOverlay(projectOverlay);
    }

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('[data-close-window]') && openOverlay) { requestClose(); return; }
      const opener = target.closest('[data-open-project]');
      if (opener && !document.documentElement.classList.contains('pdos-locked')) {
        event.preventDefault();
        // Home's extras open their window in Projects: go there first, then open it.
        if (opener.tagName === 'A') {
          const projects = byId('v2-projects');
          if (projects) projects.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        }
        openProject(opener.getAttribute('data-open-project'));
        return;
      }
      // Locked: in-page jump links do nothing until the window is closed.
      if (document.documentElement.classList.contains('pdos-locked') && target.closest('a[href^="#"]') && !target.closest('.pdos-dialog, .pdos-tool-panel')) {
        event.preventDefault();
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (!openOverlay) return;
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
      if (event.key !== 'Tab') return;
      // Keep keyboard focus inside the open window.
      const dialog = openOverlay.querySelector('.pdos-dialog');
      const items = focusables(dialog);
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    if (aboutOverlay) {
      about = initAbout({
        open: () => showOverlay(aboutOverlay),
        close: () => hideOverlay(),
        isOpen: () => openOverlay === aboutOverlay,
      });
    }
    initToolbox((on) => setLock('tool', on), () => Boolean(openOverlay));
    initJournal((on) => setLock('journal', on), () => Boolean(openOverlay));
  }

  // Crack (project 06): its own overlay in the original site's theme. Nothing loads with the page;
  // the first open fetches the old theme's fonts and /crack-game.js,
  // then mounts the game into the overlay. Each open is a fresh mount, each close disposes it.
  const CRACK_VERSION = '1';
  function initCrack(overlay, isOpen) {
    const status = overlay.querySelector('[data-ck="status"]');
    let loading = null;
    let game = null;
    const load = () => {
      if (window.CrackGame) return Promise.resolve();
      if (loading) return loading;
      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;600&display=swap';
      document.head.appendChild(fonts);
      loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `/crack-game.js?v=${CRACK_VERSION}`;
        script.onload = resolve;
        script.onerror = () => { script.remove(); loading = null; reject(new Error('crack-game.js failed to load')); };
        document.head.appendChild(script);
      });
      return loading;
    };
    const close = () => { if (game) { game.dispose(); game = null; } };
    return {
      open() {
        close();
        load().then(() => {
          // Closed again before the script arrived: nothing to mount.
          if (isOpen() && !game) game = window.CrackGame.mount(overlay);
        }, () => { if (status) status.textContent = 'Could not load the game — close and try again'; });
      },
      close
    };
  }

  // The Very Best (project 07, formerly Victory Road). Nothing loads with the page. Insert
  // cartridge opens the window and paints the boot screen at once; the game's CSS and scripts load
  // next (the first 40% of the bar), then the game loads its data (/vr/vr-game.js, the rest). The
  // battle engine loads only when a battle starts. Technical paths keep the old "vr" name.
  const VR_VERSION = '35';
  const VR_FILES = ['/vr/vr-core.js', '/vr/vr-audio.js', '/vr/vr-art.js', '/vr/vr-game.js', '/vr/vr-setup.js', '/vr/vr-cinematic.js', '/vr/vr-field.js', '/vr/vr-certificate.js', '/vr/vr-battle.js'];

  let vrLoading = null;
  let vrCss = null;
  function loadVictoryRoad(progress) {
    if (!vrCss) {
      vrCss = document.createElement('link');
      vrCss.rel = 'stylesheet';
      vrCss.href = `/vr/vr.css?v=${VR_VERSION}`;
      document.head.appendChild(vrCss);
      // The title screen's pixel fonts (Retro Main Menu handoff), only once the game opens.
      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@700&display=swap';
      document.head.appendChild(fonts);
    }
    if (!vrLoading) {
      let done = 0;
      const script = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${src}?v=${VR_VERSION}`;
        s.onload = () => { done += 1; progress(0.4 * done / VR_FILES.length, 'Loading game code'); resolve(); };
        s.onerror = () => { s.remove(); reject(new Error(src)); };
        document.body.appendChild(s);
      });
      vrLoading = VR_FILES.reduce((chain, src) => chain.then(() => script(src)), Promise.resolve()).catch((error) => { vrLoading = null; throw error; });
    } else progress(0.4, 'Game code ready');
    return vrLoading;
  }
  // The boot screen: a pixelated copy of the site icon (/favicon.svg drawn small, scaled up
  // without smoothing), a loading bar that shows real progress, and a log line. Fixed markup only.
  function paintBoot(root) {
    root.querySelector('.tvb-screen')?.remove();
    const screen = document.createElement('div');
    screen.className = 'tvb-screen tvb-screen--boot';
    screen.dataset.screen = 'boot';
    screen.innerHTML = '<div class="tvb-boot"><canvas class="tvb-boot-logo" width="20" height="20" aria-hidden="true"></canvas>'
      + '<p class="tvb-boot-name">PARWANI-DOS &middot; Cartridge 07</p><p class="tvb-boot-title">The Very Best</p>'
      + '<div class="tvb-boot-bar" role="progressbar" aria-label="Loading The Very Best" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>'
      + '<p class="tvb-boot-log" aria-live="polite">Reading cartridge&hellip;</p><div class="tvb-boot-actions"></div></div>';
    root.prepend(screen);
    const canvas = screen.querySelector('canvas');
    const img = new Image();
    img.onload = () => { const c = canvas.getContext('2d'); c.clearRect(0, 0, 20, 20); c.drawImage(img, 0, 0, 20, 20); };
    img.src = '/favicon.svg';
    const bar = screen.querySelector('.tvb-boot-bar');
    const log = screen.querySelector('.tvb-boot-log');
    let shown = 0;
    return (fraction, text) => {
      shown = Math.max(shown, Math.min(1, fraction));
      bar.firstChild.style.width = `${(shown * 100).toFixed(1)}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
      if (text) log.textContent = text;
    };
  }
  function initChampionRun(overlay) {
    const root = overlay.querySelector('#tvbRoot');
    return function open() {
      const progress = paintBoot(root);
      loadVictoryRoad(progress).then(() => {
        if (overlay.hidden) return;
        window.VictoryRoad.start(root, progress);
      }).catch(() => {
        if (overlay.hidden) return;
        progress(0, 'Cartridge read error: the game didn’t load. Check your connection.');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'tvb-btn tvb-btn--go';
        retry.textContent = 'Retry';
        retry.addEventListener('click', open);
        root.querySelector('.tvb-boot-actions').replaceChildren(retry);
        retry.focus();
      });
    };
  }

  // Toolbox (Phase 6): picking a tool shrinks the grid and slides in a panel. Working tools borrow
  // their legacy .tool-modal (and with it every id and listener) into the panel while open.
  function initToolbox(setLock, overlayOpen) {
    const box = document.querySelector('.pdos-toolbox');
    const panel = byId('pdosToolPanel');
    const slot = byId('pdosToolSlot');
    const soon = byId('pdosToolSoon');
    if (!box || !panel || !slot || !soon) return;
    const buttons = [...box.querySelectorAll('.pdos-tool')];
    const statusEl = byId('pdosToolStatus');
    const nameEl = byId('pdosToolName');
    const exeEl = byId('pdosToolExe');
    const footEl = panel.querySelector('.pdos-tool-panel-foot');
    let borrowed = null;
    let home = null;
    let current = null;
    const back = backCloses(() => close());

    panel.hidden = false;
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');

    // Every tool's behaviour lives in tools.js (plus qrcode.js), kept out of page start-up. It loads
    // when the Toolbox comes within a screen of view, or at the latest when a tool opens; the tool
    // then gets toolmodalopen. A failed script is forgotten so the next open retries it.
    const loads = new Map();
    function loadScript(src) {
      if (!loads.has(src)) {
        loads.set(src, new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = false;
          script.onload = resolve;
          script.onerror = () => { loads.delete(src); script.remove(); reject(new Error(`${src} failed to load`)); };
          document.head.appendChild(script);
        }));
      }
      return loads.get(src);
    }
    const ensureTools = () => Promise.all(['/lib/qrcode.js', '/tools.js?v=1'].map(loadScript));
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near.disconnect();
        ensureTools().catch(() => {});
      }, { rootMargin: '100% 0px' });
      near.observe(box);
    }

    function giveBack() {
      if (!borrowed) return;
      if (borrowed.classList.contains('open')) {
        borrowed.classList.remove('open');
        borrowed.dispatchEvent(new CustomEvent('toolmodalclose'));
      }
      borrowed.setAttribute('aria-hidden', 'true');
      if (home) home.parent.insertBefore(borrowed, home.next);
      borrowed = null;
      home = null;
    }

    function open(btn) {
      if (current === btn) return;
      giveBack();
      current = btn;
      const id = btn.dataset.tool;
      const name = btn.dataset.toolName;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      nameEl.textContent = name;
      exeEl.textContent = `${name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}.exe — ref. 03.${btn.dataset.toolN}`;
      if (statusEl) statusEl.textContent = `${name} open`;
      const modal = id !== 'soon' ? byId(id) : null;
      soon.hidden = Boolean(modal);
      if (modal) {
        home = { parent: modal.parentNode, next: modal.nextSibling };
        slot.appendChild(modal);
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        borrowed = modal;
        ensureTools().then(() => { if (borrowed === modal) modal.dispatchEvent(new CustomEvent('toolmodalopen')); }, () => {});
      } else {
        byId('pdosToolSoonText').textContent = btn.dataset.toolLong || '';
      }
      // Key / BPM Lookup asks the Worker (Spotify catalogue), so the "nothing leaves" line is false there.
      if (footEl) footEl.hidden = id === 'bpmLookupModal';
      box.classList.add('is-open');
      panel.inert = false;
      panel.removeAttribute('aria-hidden');
      setLock(true);
      back.opened();
      nameEl.focus({ preventScroll: true });
    }

    function close() {
      if (!current) return;
      const btn = current;
      giveBack();
      current = null;
      buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (statusEl) statusEl.textContent = '9 tools · click one to open';
      box.classList.remove('is-open');
      panel.inert = true;
      panel.setAttribute('aria-hidden', 'true');
      setLock(false);
      back.closed();
      btn.focus({ preventScroll: true });
    }

    buttons.forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-controls', 'pdosToolPanel');
      btn.addEventListener('click', () => (current === btn ? close() : open(btn)));
    });
    byId('pdosToolClose').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && current && !overlayOpen()) close();
    });
  }

  initShell();
  initWindows();
}());

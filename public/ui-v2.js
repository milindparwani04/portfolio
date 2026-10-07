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
      event.currentTarget.textContent = paused ? '▶' : '‖';
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
  const pad2 = (value) => String(value).padStart(2, '0');

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
  // 1-7 jump keys and Esc, and runs the Mono/Paper/Night theme switcher. Phones fall outside
  // the paging media query, so the CRT wrappers stay inert there (see .pdos-crt-* in the CSS)
  // and this still safely updates the (hidden) top bar state as the user scrolls past.
  function initShell() {
    const root = document.querySelector('.portfolio-v2');
    const sections = Array.from(document.querySelectorAll('.v2-section[data-sec]'));
    if (!root || !sections.length) return;
    const SECS = [
      ['home', 'Home'], ['journal', 'Journal'], ['projects', 'Projects'], ['toolbox', 'Toolbox'],
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
      activeKey = key;
      if (secLabelEl) secLabelEl.textContent = `${String(index + 1).padStart(2, '0')} / 07 · ${SECS[index][1]}`;
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

    document.addEventListener('keydown', (event) => {
      if (event.target instanceof Element && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.target instanceof Element && event.target.closest('[contenteditable="true"]')) return;
      if (event.key === 'Escape') { openThemeMenu(false); return; }
      const n = parseInt(event.key, 10);
      if (!(n >= 1 && n <= 7)) return;
      // An open window locks the page: no section jumps until it is closed.
      if (document.documentElement.classList.contains('pdos-locked')) return;
      const target = sections[n - 1];
      if (target) target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // Journal (Phase 3): each list row is a tab for one entry panel. Selecting a row shows its
  // panel and resets that panel's article to the top; arrow keys / Home / End move along the list
  // (roving tabindex). On phones, where the list sits above the entry, the entry scrolls into view.
  function initJournal() {
    const tabs = [...document.querySelectorAll('.pdos-journal-row[role="tab"]')];
    if (!tabs.length) return;
    const phone = window.matchMedia('(max-width: 720px)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function select(index, { focus = false, reveal = false } = {}) {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        const panel = byId(tab.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !on;
        const article = panel.querySelector('.pdos-journal-article');
        if (on && article) article.scrollTop = 0;
        if (on && reveal && phone.matches) panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      });
      if (focus) tabs[index].focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, { reveal: true }));
      tab.addEventListener('keydown', (event) => {
        const last = tabs.length - 1;
        const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(Math.max(0, Math.min(last, next)), { focus: true });
      });
    });
  }

  // Windows over the page (Parwani-DOS Phases 4-6): project windows, the Champion Run setup window
  // and the Toolbox panel. While any of them is open the page is locked (html.pdos-locked: no
  // scrolling, no 1-7 keys, no in-page jump links) until it is closed with ✕, the scrim or Esc.
  const PDOS_PROJECTS = {
    music: { n: '01', tag: 'Music', title: 'Sounds Like + Prompt Playlist', desc: 'A similarity engine for music discovery. Turn text into personalised playlists.', status: 'Phase 02 / Similarity engine', color: '#1ed760', file: 'sounds_like.vol', src: '/sounds-like.html' },
    today: { n: '02', tag: 'Experiment', title: 'Today Somewhere', desc: 'A collection of places, moments and photographs.', status: 'Planned · In development', color: 'oklch(0.78 0.1 265)', file: 'today_somewhere.vol' },
    where: { n: '03', tag: 'Tool', title: 'Where Next', desc: 'A simple tool for exploring new destinations.', status: 'Planned · In development', color: 'oklch(0.88 0.07 85)', file: 'where_next.vol' },
    speed: { n: '04', tag: 'Game', title: 'Speed Round', desc: 'A fast-paced trivia game for curious minds.', status: 'Planned · In development', color: 'oklch(0.74 0.16 0)', file: 'speed_round.exe' },
    terminal: { n: '05', tag: 'Game', title: 'Untitled Terminal Adventure', desc: 'A text-based experiment in choice and consequence.', status: 'Planned · In development', color: 'oklch(0.75 0.16 40)', file: 'terminal_adventure.exe' },
    crack: { n: '06', tag: 'Game', title: 'Crack', desc: 'Visual experiments with fracture, distortion and decay.', status: 'Playable', color: '#f4f3ef', file: 'crack.exe', src: '/crack.html' }
  };

  function initWindows() {
    const root = document.querySelector('.portfolio-v2');
    const projectOverlay = byId('pdosProjectOverlay');
    const champOverlay = byId('pdosChampOverlay');
    if (!root || !projectOverlay || !champOverlay) return;
    // Sections clip and transform their content for the CRT effect, which would trap a fixed
    // overlay inside them, so the overlays live at the end of the page root instead.
    root.appendChild(projectOverlay);
    root.appendChild(champOverlay);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const locks = { window: false, tool: false };
    const setLock = (key, on) => {
      locks[key] = on;
      document.documentElement.classList.toggle('pdos-locked', locks.window || locks.tool);
    };
    let openOverlay = null;
    let returnFocus = null;

    const focusables = (el) => [...el.querySelectorAll('button:not(:disabled), a[href], iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.offsetParent !== null || node === document.activeElement);

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
      // Stop anything running inside the window (Crack, Sounds Like) by unloading its frame.
      openOverlay.querySelectorAll('iframe').forEach((frame) => frame.remove());
      openOverlay = null;
      setLock('window', false);
      if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
    }

    function openProject(key) {
      if (key === 'champion') { showOverlay(champOverlay); return; }
      const p = PDOS_PROJECTS[key];
      if (!p) return;
      projectOverlay.querySelector('.pdos-dialog').style.setProperty('--dialog-bar', p.color);
      byId('pdosProjectFile').textContent = `${p.file} — project ${p.n}`;
      byId('pdosProjectNum').textContent = p.n;
      byId('pdosProjectTag').textContent = `[ ${p.tag} ]`;
      byId('pdosProjectTitle').textContent = p.title;
      byId('pdosProjectDesc').textContent = p.desc;
      byId('pdosProjectStatus').textContent = p.status;
      const stage = byId('pdosProjectStage');
      const link = byId('pdosProjectLink');
      stage.replaceChildren();
      link.replaceChildren();
      if (p.src) {
        const frame = document.createElement('iframe');
        frame.src = p.src;
        frame.title = p.title;
        frame.loading = 'lazy';
        stage.appendChild(frame);
        const a = document.createElement('a');
        a.href = p.src;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Open full screen ↗';
        link.appendChild(a);
      } else {
        stage.textContent = 'Planned — nothing to run yet. It will run here, inside this window.';
      }
      showOverlay(projectOverlay);
    }

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('[data-close-window]') && openOverlay) { hideOverlay(); return; }
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
      if (event.key === 'Escape') { event.preventDefault(); hideOverlay(); return; }
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

    initChampionRun(champOverlay);
    initToolbox((on) => setLock('tool', on), () => Boolean(openOverlay));
  }

  // Champion Run setup (Phase 5): pool mode, generations, a team of up to 6, modifiers and the
  // reward tier they add up to. The battle itself is a later spec; the setup is remembered.
  function initChampionRun(overlay) {
    const DEX = {
      1: ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Gengar', 'Dragonite', 'Snorlax', 'Lapras'],
      2: ['Chikorita', 'Cyndaquil', 'Totodile', 'Ampharos', 'Scizor', 'Tyranitar', 'Umbreon', 'Heracross'],
      3: ['Treecko', 'Torchic', 'Mudkip', 'Gardevoir', 'Aggron', 'Salamence', 'Metagross', 'Milotic'],
      4: ['Turtwig', 'Chimchar', 'Piplup', 'Lucario', 'Garchomp', 'Togekiss', 'Weavile', 'Roserade'],
      5: ['Snivy', 'Tepig', 'Oshawott', 'Excadrill', 'Hydreigon', 'Volcarona', 'Chandelure', 'Zoroark'],
      6: ['Chespin', 'Fennekin', 'Froakie', 'Greninja', 'Aegislash', 'Sylveon', 'Talonflame', 'Goodra'],
      7: ['Rowlet', 'Litten', 'Popplio', 'Mimikyu', 'Toxapex', 'Kommo-o', 'Decidueye', 'Lycanroc'],
      8: ['Grookey', 'Scorbunny', 'Sobble', 'Dragapult', 'Corviknight', 'Toxtricity', 'Grimmsnarl', 'Cinderace'],
      9: ['Sprigatito', 'Fuecoco', 'Quaxly', 'Kingambit', 'Gholdengo', 'Tinkaton', 'Baxcalibur', 'Annihilape']
    };
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    const MODS = [
      { k: 'random', label: 'Random team — all generations', note: 'Six Pokémon drawn from Gen I–IX. Pool locked.', m: 1.4 },
      { k: 'moves', label: 'Random moves', note: 'Every moveset is rerolled.', m: 1.5 },
      { k: 'potions', label: 'No potions', note: 'No healing items in battle.', m: 1.3 },
      { k: 'cap', label: 'Level cap 50', note: 'Your team is capped. The champion is not.', m: 1.2 },
      { k: 'noswitch', label: 'No switching', note: 'A Pokémon stays in until it faints.', m: 1.25 }
    ];
    const TIERS = [['Master', 4], ['Gold', 2.5], ['Silver', 1.75], ['Bronze', 1]];
    const ALL = Object.values(DEX).flat();
    const genOf = (name) => Number(Object.keys(DEX).find((g) => DEX[g].includes(name)));
    const STORE = 'pdosChampionRun';

    let st = { mode: 'cross', gen: 4, gens: [1, 4, 9], team: [], mods: { random: false, moves: false, potions: false, cap: false, noswitch: false } };
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORE) || 'null');
      if (saved && Array.isArray(saved.team) && Array.isArray(saved.gens)) st = { ...st, ...saved, mods: { ...st.mods, ...saved.mods } };
    } catch (_) { /* private mode or bad data: start fresh */ }

    const el = {
      gens: byId('pdosCrGens'), pool: byId('pdosCrPool'), poolNote: byId('pdosCrPoolNote'), team: byId('pdosCrTeam'),
      teamLabel: byId('pdosCrTeamLabel'), reroll: byId('pdosCrReroll'), mods: byId('pdosCrMods'), mult: byId('pdosCrMult'),
      tier: byId('pdosCrTier'), cta: byId('pdosCrCta'), ctaText: byId('pdosCrCtaText'), status: byId('pdosCrStatus')
    };
    if (Object.values(el).some((node) => !node)) return;

    const active = () => (st.mode === 'single' ? [st.gen] : st.gens);
    const fitTeam = (team, gens) => (st.mods.random ? team : team.filter((n) => gens.includes(genOf(n))));
    const rollTeam = () => [...ALL].sort(() => Math.random() - 0.5).slice(0, 6);
    const button = (cls, html, onClick, pressed) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (cls) b.className = cls;
      b.innerHTML = html;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', onClick);
      return b;
    };
    const say = (text) => { el.status.textContent = text; };

    function render() {
      const gens = active();
      const random = st.mods.random;
      overlay.querySelectorAll('[data-cr-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.crMode === st.mode)));
      el.gens.replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => button('', `Gen ${ROMAN[g]}`, () => {
        if (st.mode === 'single') { st.gen = g; st.team = fitTeam(st.team, [g]); }
        else {
          st.gens = st.gens.includes(g) ? st.gens.filter((x) => x !== g) : [...st.gens, g].sort((a, b) => a - b);
          if (!st.gens.length) st.gens = [g];
          st.team = fitTeam(st.team, st.gens);
        }
        update();
      }, gens.includes(g))));
      el.pool.classList.toggle('is-locked', random);
      el.poolNote.textContent = random ? 'Locked — random team is on' : (st.mode === 'single' ? `Gen ${ROMAN[st.gen]} only` : `${gens.length} gens mixed`);
      el.pool.replaceChildren(...gens.flatMap((g) => DEX[g].map((name) => {
        const b = button('', `<span>${escapeHtml(name)}</span><span>${ROMAN[g]}</span>`, () => {
          if (st.team.includes(name)) st.team = st.team.filter((x) => x !== name);
          else if (st.team.length < 6) st.team = [...st.team, name];
          else { say('Team is full — remove one first.'); return; }
          update();
        }, st.team.includes(name));
        b.disabled = random;
        return b;
      })));
      el.teamLabel.textContent = `02 / Team ${st.team.length}/6`;
      el.reroll.hidden = !random;
      el.team.replaceChildren(...Array.from({ length: 6 }, (_, i) => {
        const name = st.team[i];
        const b = button(name ? 'is-filled' : '', `<span>${String(i + 1).padStart(2, '0')}</span><span>${name ? `${escapeHtml(name)} · ${ROMAN[genOf(name)]}` : 'Empty'}</span>`, () => {
          if (!name || random) return;
          st.team = st.team.filter((x) => x !== name);
          update();
        });
        b.setAttribute('aria-label', name ? `Slot ${i + 1}: ${name}${random ? '' : ', remove'}` : `Slot ${i + 1}: empty`);
        return b;
      }));
      el.mods.replaceChildren(...MODS.map((m) => button('pdos-cr-mod', `<span class="pdos-cr-mod-box" aria-hidden="true"></span><span class="pdos-cr-mod-text"><span>${m.label}</span><span>${m.note}</span></span><span class="pdos-cr-mod-x">×${m.m}</span>`, () => {
        st.mods = { ...st.mods, [m.k]: !st.mods[m.k] };
        if (m.k === 'random') st.team = st.mods.random ? rollTeam() : [];
        update();
      }, st.mods[m.k])));
      const mult = MODS.reduce((acc, m) => acc * (st.mods[m.k] ? m.m : 1), 1);
      el.mult.textContent = `×${mult.toFixed(2)}`;
      el.mult.classList.toggle('is-up', mult > 1 && mult < 2.5);
      el.mult.classList.toggle('is-gold', mult >= 2.5);
      el.tier.textContent = `Reward multiplier · ${TIERS.find((t) => mult >= t[1])[0]} tier`;
      el.ctaText.textContent = st.team.length ? `Enter battle · ${st.team.length} Pokémon` : 'Pick at least one Pokémon';
      el.cta.disabled = !st.team.length;
    }

    function update() {
      say('');
      try { window.localStorage.setItem(STORE, JSON.stringify(st)); } catch (_) { /* private mode */ }
      render();
    }

    overlay.querySelectorAll('[data-cr-mode]').forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.crMode;
      st.team = fitTeam(st.team, active());
      update();
    }));
    el.reroll.addEventListener('click', () => { st.team = rollTeam(); update(); });
    el.cta.addEventListener('click', () => say('The battle isn’t built yet — your setup is saved for when it is.'));
    render();
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

    panel.hidden = false;
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');

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
      } else {
        byId('pdosToolSoonText').textContent = btn.dataset.toolLong || '';
      }
      // Key / BPM Lookup asks the Worker (Spotify catalogue), so the "nothing leaves" line is false there.
      if (footEl) footEl.hidden = id === 'bpmLookupModal';
      box.classList.add('is-open');
      panel.inert = false;
      panel.removeAttribute('aria-hidden');
      setLock(true);
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
      btn.focus({ preventScroll: true });
    }

    buttons.forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-controls', 'pdosToolPanel');
      btn.addEventListener('click', () => open(btn));
    });
    byId('pdosToolClose').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && current && !overlayOpen()) close();
    });
  }

  initShell();
  initJournal();
  initWindows();
}());

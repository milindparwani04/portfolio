(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function fitHeadline() {
    const title = byId('v2HeadlineTitle');
    if (!title || !title.clientHeight || !title.clientWidth) return;
    let low = 18;
    let high = Math.max(76, Math.min(120, window.innerHeight * .1));
    let best = low;
    for (let i = 0; i < 9; i += 1) {
      const size = (low + high) / 2;
      title.style.fontSize = `${size}px`;
      if (title.scrollHeight <= title.clientHeight + 1 && title.scrollWidth <= title.clientWidth + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }
    title.style.fontSize = `${best}px`;
  }

  function fitPortfolioTitle() {
    const title = document.querySelector('.v2-display');
    if (!title) return;
    if (window.innerWidth <= 720) {
      title.style.fontSize = '';
      return;
    }
    let low = 48;
    // Capped by height too, so the title never pushes the dashboard out of the home section.
    let high = Math.min(window.innerWidth * .15, window.innerHeight * .26, 300);
    let best = low;
    for (let i = 0; i < 10; i += 1) {
      const size = (low + high) / 2;
      title.style.fontSize = `${size}px`;
      if (title.scrollWidth <= title.clientWidth + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }
    title.style.fontSize = `${best}px`;
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

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      fitPortfolioTitle();
      fitHeadline();
      fitText();
    });
  });
  document.fonts?.ready.then(() => {
    fitPortfolioTitle();
    fitHeadline();
    fitText();
  });

  // Dubai has no common abbreviation in Intl ("GMT+4"), so its label stays GST in the markup.
  // London (GMT/BST) and Sydney (AEST/AEDT) follow daylight saving from Intl.
  const clockCities = [
    { timeZone: 'Asia/Dubai', time: 'v2TimeDubai' },
    { timeZone: 'Europe/London', time: 'v2TimeLondon', zone: 'v2ZoneLondon', locale: 'en-GB' },
    { timeZone: 'Australia/Sydney', time: 'v2TimeSydney', zone: 'v2ZoneSydney', locale: 'en-AU' }
  ].map((city) => ({
    ...city,
    timeFormat: new Intl.DateTimeFormat('en-GB', { timeZone: city.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }),
    zoneFormat: city.zone ? new Intl.DateTimeFormat(city.locale, { timeZone: city.timeZone, timeZoneName: 'short' }) : null
  }));

  function updateDubaiClock() {
    const now = new Date();
    clockCities.forEach((city) => {
      const time = byId(city.time);
      if (time) time.textContent = city.timeFormat.format(now);
      const zone = city.zone && byId(city.zone);
      const name = city.zoneFormat && city.zoneFormat.formatToParts(now).find((part) => part.type === 'timeZoneName');
      if (zone && name) zone.textContent = name.value.toUpperCase();
    });
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(now).toUpperCase();
    if (byId('v2Date')) byId('v2Date').textContent = date;
  }

  updateDubaiClock();
  window.setInterval(updateDubaiClock, 1000);

  async function loadLastUpdated() {
    const target = byId('v2LastUpdated');
    if (!target) return;
    try {
      const response = await fetch('/api/last-updated');
      if (!response.ok) throw new Error('Last-updated request failed');
      const payload = await response.json();
      const date = new Date(payload.lastUpdated);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid last-updated value');
      target.textContent = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(date).toUpperCase();
    } catch (_) {
      target.textContent = 'LOCAL PREVIEW';
    }
    fitText(target);
  }

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
    window.requestAnimationFrame(fitHeadline);
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

  // Five-at-a-time card rail shared by the Gig Finder and the Media tracker: batch counter,
  // prev / pause / next, a 10-second countdown that holds on hover or focus, and an honest empty
  // state. `ids` are the element ids of one section; `renderCard(item, number)` returns a card.
  const RAIL_SECONDS = 10;
  function createCardRail({ url, ids, noun, renderCard }) {
    const list = byId(ids.list);
    if (!list) return;
    let items = [];
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
        const message = loading ? `Loading ${noun}&hellip;` : `No ${noun} to show right now. Check back soon.`;
        list.innerHTML = `<div class="v2-panel v2-gig-empty">${message}</div>`;
        byId(ids.batch).textContent = 'Batch 00 of 00';
        tick = 0;
        renderTick();
        return;
      }
      const batchCount = Math.max(1, Math.ceil(items.length / 5));
      batch = (batch + batchCount) % batchCount;
      list.innerHTML = items.slice(batch * 5, batch * 5 + 5).map((item, index) => renderCard(item, batch * 5 + index + 1)).join('');
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
        items = payload;
        batch = 0;
      } catch (_) {
        items = [];
      }
      loading = false;
      render();
    }

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

  loadNowPlaying();
  loadPlaylists();
  loadListening();
  loadHeartRate();
  window.setInterval(() => {
    if (document.hidden) return;
    loadNowPlaying();
    loadHeartRate();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    loadNowPlaying();
    loadHeartRate();
  });

  loadLastUpdated();

  // One wheel gesture or key press moves exactly one section. CSS scroll-snap handles touch
  // swipes and scrollbar drags; this handles wheel/trackpad (so momentum can't skip sections)
  // and keyboard. Only active when the paging media query matches (desktop/tablet).
  function initSectionPager() {
    const sections = Array.from(document.querySelectorAll('.v2-section'));
    if (!sections.length) return;
    const paging = window.matchMedia('(min-width: 721px) and (min-height: 620px)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const navLinks = Array.from(document.querySelectorAll('.v2-links a'));
    const root = document.documentElement;

    function currentIndex() {
      let best = 0;
      let bestDistance = Infinity;
      sections.forEach((section, index) => {
        const distance = Math.abs(section.getBoundingClientRect().top);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      return best;
    }

    // Moves are driven by a critically damped spring rather than a fixed-length easing curve:
    // it responds on the first frame, settles softly (~0.6 s) and, when a new gesture arrives
    // mid-move, retargets from the current position and velocity instead of waiting or jumping.
    // Scroll-snap is switched off while the spring runs so the browser doesn't fight it.
    const OMEGA = 14;
    let animating = false;
    let jumping = false;
    let targetIndex = 0;
    let targetY = 0;
    let position = 0;
    let velocity = 0;
    let lastFrame = 0;
    let animationFrame = 0;

    const sectionTop = (section) => Math.round(section.getBoundingClientRect().top + window.scrollY);
    const clampIndex = (index) => Math.max(0, Math.min(sections.length - 1, index));
    // While a move is in flight, the next step counts from where it is heading, not where it is.
    const baseIndex = () => (animating || jumping ? targetIndex : currentIndex());

    function step(now) {
      const dt = Math.min(.034, (now - lastFrame) / 1000);
      lastFrame = now;
      for (let i = 0; i < 4; i += 1) {
        const h = dt / 4;
        velocity += (OMEGA * OMEGA * (targetY - position) - 2 * OMEGA * velocity) * h;
        position += velocity * h;
      }
      if (Math.abs(targetY - position) < .5 && Math.abs(velocity) < 30) {
        window.scrollTo({ top: targetY, behavior: 'instant' });
        stop();
        return;
      }
      window.scrollTo({ top: position, behavior: 'instant' });
      animationFrame = window.requestAnimationFrame(step);
    }

    function stop() {
      window.cancelAnimationFrame(animationFrame);
      animating = false;
      if (!jumping) root.style.scrollSnapType = '';
    }

    function springTo(index) {
      targetIndex = index;
      targetY = sectionTop(sections[index]);
      if (reduceMotion.matches) {
        stop();
        window.scrollTo({ top: targetY, behavior: 'instant' });
        return;
      }
      if (animating) return;
      position = window.scrollY;
      velocity = 0;
      animating = true;
      root.style.scrollSnapType = 'none';
      lastFrame = performance.now();
      animationFrame = window.requestAnimationFrame(step);
    }

    // Jumps of more than one section (nav links, Home/End) would otherwise blur through every
    // section in between, so the sections fade out, the page moves to the target's neighbour,
    // and the sections fade back in while the spring carries it the last section.
    const FADE_MS = 150;
    function goTo(index) {
      index = clampIndex(index);
      if (jumping) { targetIndex = index; return; }
      const from = baseIndex();
      if (index === from && !animating) return;
      const distance = Math.abs(index - currentIndex());
      if (distance <= 1 || reduceMotion.matches) { springTo(index); return; }
      jumping = true;
      targetIndex = index;
      root.style.scrollSnapType = 'none';
      root.classList.add('v2-jump-out');
      window.setTimeout(() => {
        const land = targetIndex;
        const dir = Math.sign(land - currentIndex()) || 1;
        stop();
        window.scrollTo({ top: sectionTop(sections[clampIndex(land - dir)]), behavior: 'instant' });
        jumping = false;
        root.classList.remove('v2-jump-out');
        springTo(land);
      }, FADE_MS);
    }

    // A touch or scrollbar drag during a move hands control back to the user.
    const interrupt = () => { if (animating && !jumping) stop(); };
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('mousedown', (event) => { if (event.clientX >= root.clientWidth) interrupt(); });

    // In-page links (nav, scroll cues, back to top) use the same motion.
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element && event.target.closest('a[href^="#v2-"]');
      if (!paging.matches || !link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const index = sections.findIndex((section) => `#${section.id}` === link.getAttribute('href'));
      if (index < 0) return;
      event.preventDefault();
      goTo(index);
    });

    function blockedTarget(target) {
      return document.querySelector('.tool-modal.open') ||
        (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'));
    }

    // One gesture moves one section. A gesture starts after a 200 ms pause, on a change of
    // direction, or when the wheel delta jumps well above the decaying trackpad momentum (a new
    // swipe while the last one is still coasting) — so quick repeated swipes each count, like a
    // feed, while one long flick or a fast wheel spin still moves only once.
    let lastWheelAt = 0;
    let lastWheelSize = 0;
    let lastWheelDir = 0;
    let lastStepAt = 0;
    window.addEventListener('wheel', (event) => {
      if (!paging.matches || event.ctrlKey || blockedTarget(event.target)) return;
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? window.innerHeight : 1;
      const size = Math.abs(event.deltaY * scale);
      if (size < 1) return;
      const dir = Math.sign(event.deltaY);
      const now = performance.now();
      const fresh = now - lastWheelAt > 200 || dir !== lastWheelDir ||
        (size > lastWheelSize * 1.6 && size > 20 && now - lastStepAt > 250);
      lastWheelAt = now;
      lastWheelSize = size;
      lastWheelDir = dir;
      if (!fresh || size < 4) return;
      lastStepAt = now;
      goTo(baseIndex() + dir);
    }, { passive: false });

    document.addEventListener('keydown', (event) => {
      if (!paging.matches || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (blockedTarget(event.target) || (event.target instanceof Element && event.target.closest('button, a') && event.key === ' ')) return;
      const keys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
      let move = keys[event.key];
      if (event.key === ' ') move = event.shiftKey ? -1 : 1;
      if (event.key === 'Home') { event.preventDefault(); goTo(0); return; }
      if (event.key === 'End') { event.preventDefault(); goTo(sections.length - 1); return; }
      if (!move) return;
      event.preventDefault();
      // A held key steps once per landing rather than racing through every section.
      if (event.repeat && (animating || jumping)) return;
      goTo(baseIndex() + move);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
        if (paging.matches && location.hash !== `#${id}`) history.replaceState(null, '', id === 'v2-home' ? location.pathname + location.search : `#${id}`);
      });
    }, { threshold: 0.55 });
    sections.forEach((section) => observer.observe(section));
  }

  initSectionPager();
}());

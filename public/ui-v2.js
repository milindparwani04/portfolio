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

  window.addEventListener('resize', () => {
    fitPortfolioTitle();
    fitHeadline();
  });
  document.fonts?.ready.then(() => {
    fitPortfolioTitle();
    fitHeadline();
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

  const gigFallback = [
    { artist: 'Palace', venue: 'O2 Academy Brixton, London', date: '2026-10-07' },
    { artist: 'Parcels', venue: 'Roundhouse, London', date: '2026-10-12' },
    { artist: 'Men I Trust', venue: 'Troxy, London', date: '2026-10-18' },
    { artist: 'Khruangbin', venue: 'Alexandra Palace, London', date: '2026-10-24' },
    { artist: 'Fontaines D.C.', venue: 'Victoria Park, London', date: '2026-11-02' },
    { artist: 'Jungle', venue: 'Wembley Arena, London', date: '2026-11-08' },
    { artist: 'Alvvays', venue: 'EartH, London', date: '2026-11-15' },
    { artist: 'Beabadoobee', venue: 'Brixton Academy, London', date: '2026-11-21' },
    { artist: 'King Krule', venue: 'Troxy, London', date: '2026-12-02' },
    { artist: 'The Midnight', venue: 'Forum, London', date: '2026-12-09' }
  ];
  const gigImages = [
    '/assets/ui/gig-city-arena-hd.jpg',
    '/assets/ui/gig-harbour-stage-hd.jpg',
    '/assets/ui/gig-blue-room-hd.jpg',
    '/assets/ui/gig-river-hall-hd.jpg',
    '/assets/ui/gig-central-live-hd.jpg'
  ];
  let gigs = gigFallback;
  let gigBatch = 0;
  let gigPaused = false;

  function formatGigDate(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value || 'Date TBC';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date).toUpperCase();
  }

  function renderGigs() {
    const list = byId('v2GigList');
    if (!list) return;
    const batchCount = Math.max(1, Math.ceil(gigs.length / 5));
    gigBatch = (gigBatch + batchCount) % batchCount;
    let batch = gigs.slice(gigBatch * 5, gigBatch * 5 + 5);
    if (batch.length < 5) batch = batch.concat(gigs.slice(0, 5 - batch.length));
    list.innerHTML = batch.map((gig, index) => {
      // Ticketmaster listing photo and ticket page when the API has them; stock art and a
      // search link otherwise (fallback data, or listings without images).
      const listingImage = /^https:\/\//.test(gig.image || '') ? gig.image : '';
      const image = listingImage || gigImages[index];
      const alt = listingImage ? `${gig.artist} performing` : 'Illustrative concert venue atmosphere';
      const link = /^https:\/\//.test(gig.url || '')
        ? gig.url
        : `https://www.google.com/search?q=${encodeURIComponent(`${gig.artist} ${gig.venue} tickets`)}`;
      return `<article class="v2-panel v2-gig">
        <div class="v2-index-row"><span>${String(index + 1).padStart(2, '0')}</span><span class="v2-tag">[ Event ]</span></div>
        <img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
        <h3>${escapeHtml(gig.artist)}</h3>
        <p>${escapeHtml(gig.venue)}</p><p>${escapeHtml(formatGigDate(gig.date))}</p>
        <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open details &#8599;</a>
      </article>`;
    }).join('');
    byId('v2GigBatch').textContent = `Batch ${String(gigBatch + 1).padStart(2, '0')} of ${String(batchCount).padStart(2, '0')}`;
    gigTick = 0;
    renderGigTick();
  }

  const GIG_SECONDS = 10;
  let gigTick = 0;
  let gigHover = false;

  function renderGigTick() {
    const tick = byId('v2GigTick');
    const progress = byId('v2GigProgress');
    if (tick) tick.textContent = `${String(gigTick).padStart(2, '0')} / ${GIG_SECONDS}`;
    if (progress) progress.style.width = `${(gigTick / GIG_SECONDS) * 100}%`;
  }

  async function loadGigs() {
    renderGigs();
    try {
      const response = await fetch('/api/gigs');
      if (!response.ok) throw new Error('Gig request failed');
      const payload = await response.json();
      if (!Array.isArray(payload) || !payload.length) throw new Error('No gigs');
      gigs = payload;
      gigBatch = 0;
      renderGigs();
    } catch (_) {
      gigs = gigFallback;
    }
  }

  byId('v2GigPrev')?.addEventListener('click', () => { gigBatch -= 1; renderGigs(); });
  byId('v2GigNext')?.addEventListener('click', () => { gigBatch += 1; renderGigs(); });
  byId('v2GigPause')?.addEventListener('click', (event) => {
    gigPaused = !gigPaused;
    event.currentTarget.textContent = gigPaused ? '▶' : '‖';
    event.currentTarget.setAttribute('aria-label', gigPaused ? 'Resume gig rotation' : 'Pause gig rotation');
  });

  // "Hover or focus pauses": the countdown holds while the pointer or keyboard focus is on a card.
  const gigList = byId('v2GigList');
  gigList?.addEventListener('pointerenter', () => { gigHover = true; });
  gigList?.addEventListener('pointerleave', () => { gigHover = false; });
  gigList?.addEventListener('focusin', () => { gigHover = true; });
  gigList?.addEventListener('focusout', (event) => { if (!gigList.contains(event.relatedTarget)) gigHover = false; });

  loadGigs();
  window.setInterval(() => {
    if (gigPaused || gigHover || document.hidden) return;
    gigTick += 1;
    if (gigTick >= GIG_SECONDS) {
      gigBatch += 1;
      renderGigs();
    } else {
      renderGigTick();
    }
  }, 1000);

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
        const image = card.querySelector('.v2-playlist-body img');
        const link = card.querySelector('.v2-tool-action');
        const tag = card.querySelector('.v2-tag');
        if (playlist.name && heading) heading.textContent = playlist.name;
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
    byId('v2TopTitle').textContent = artistsMode ? 'Top Artists' : 'Top Tracks';
    byId('v2TopPeriod').textContent = `${fromLog ? 'This month' : 'Last 4 weeks'} / Top 5 ${artistsMode ? 'artists' : 'songs'}`;
    table.setAttribute('aria-label', `Top ${topMode} ${fromLog ? 'this month' : 'over the last 4 weeks'}`);
    const header = `<div class="v2-track-row v2-track-header" role="row"><span role="columnheader">#</span><span></span><span role="columnheader">${artistsMode ? 'Artist' : 'Track'}</span><span role="columnheader">${artistsMode ? '' : 'Artist'}</span><span role="columnheader">Plays</span><span></span></div>`;
    const rows = Array.from({ length: 5 }, (_, index) => {
      const item = items[index];
      if (!item) {
        return `<div class="v2-track-row" role="row"><span role="cell">${pad2(index + 1)}</span><span class="v2-track-art"></span><span role="cell">Not enough listening yet</span><span role="cell">--</span><span role="cell">--</span><span class="v2-track-bar"><i></i></span></div>`;
      }
      const url = safeUrl(item.url);
      const image = safeUrl(item.image);
      const name = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a>`
        : escapeHtml(item.name);
      const second = artistsMode ? '' : escapeHtml((item.artists || []).join(', '));
      const hasPlays = Number.isFinite(item.plays);
      // No bar without real play counts — a rank-shaped bar would imply numbers we don't have.
      const width = hasPlays ? Math.round((item.plays / maxPlays) * 100) : 0;
      return `<div class="v2-track-row" role="row"><span role="cell">${pad2(index + 1)}</span><span class="v2-track-art">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : ''}</span><span role="cell">${name}</span><span role="cell">${second}</span><span role="cell">${hasPlays ? item.plays : '--'}</span><span class="v2-track-bar"><i style="width:${width}%"></i></span></div>`;
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
    let moving = false;
    let quietUntil = 0;
    let landedAt = 0;
    let moveTimer = 0;

    function currentIndex() {
      let best = 0;
      let bestDistance = Infinity;
      sections.forEach((section, index) => {
        const distance = Math.abs(section.getBoundingClientRect().top);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      return best;
    }

    function goTo(index) {
      const target = sections[Math.max(0, Math.min(sections.length - 1, index))];
      if (!target || target === sections[currentIndex()]) return;
      moving = true;
      target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      // Unlock when the smooth scroll lands; the timeout covers browsers without `scrollend`.
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(release, reduceMotion.matches ? 80 : 1000);
    }

    function release() {
      window.clearTimeout(moveTimer);
      if (moving) landedAt = performance.now();
      moving = false;
    }
    window.addEventListener('scrollend', release);

    function blockedTarget(target) {
      return document.querySelector('.tool-modal.open') ||
        (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'));
    }

    window.addEventListener('wheel', (event) => {
      if (!paging.matches || event.ctrlKey || blockedTarget(event.target)) return;
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = performance.now();
      // Trackpad momentum keeps firing wheel events after the gesture ends; treat any event
      // within 180 ms of the previous one as part of the same gesture.
      const sameGesture = now < quietUntil;
      quietUntil = now + 180;
      // A short cooldown after landing stops one long spin of the wheel chaining into several moves.
      if (moving || sameGesture || now - landedAt < 400 || Math.abs(event.deltaY) < 4) return;
      goTo(currentIndex() + (event.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    document.addEventListener('keydown', (event) => {
      if (!paging.matches || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (blockedTarget(event.target) || (event.target instanceof Element && event.target.closest('button, a') && event.key === ' ')) return;
      const keys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
      let step = keys[event.key];
      if (event.key === ' ') step = event.shiftKey ? -1 : 1;
      if (event.key === 'Home') { event.preventDefault(); goTo(0); return; }
      if (event.key === 'End') { event.preventDefault(); goTo(sections.length - 1); return; }
      if (!step) return;
      event.preventDefault();
      if (!moving) goTo(currentIndex() + step);
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

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function updateDubaiClock() {
    const now = new Date();
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(now).toUpperCase();
    if (byId('v2Time')) byId('v2Time').textContent = time;
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
    'Global markets steady as new data arrives',
    'Technology and culture continue to reshape modern work',
    'New ideas move from sketchbook to browser',
    'A rotating view of the stories shaping the day'
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
    if (title) title.textContent = headlines[headlineIndex];
    if (count) count.textContent = `${String(headlineIndex + 1).padStart(2, '0')} / ${String(headlines.length).padStart(2, '0')}`;
    restartHeadlineProgress();
  }

  async function loadHeadlines() {
    try {
      const response = await fetch('/api/news');
      if (!response.ok) throw new Error('Headline request failed');
      const payload = await response.json();
      if (!Array.isArray(payload.headlines) || !payload.headlines.length) throw new Error('No headlines');
      headlines = payload.headlines.map(String).slice(0, 12);
      headlineIndex = 0;
    } catch (_) {
      headlines = fallbackHeadlines;
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
      const endpoint = 'https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FDubai&forecast_days=1';
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
    } catch (_) {
      byId('v2WeatherTemp').textContent = '--°C';
      byId('v2WeatherLabel').textContent = 'Weather unavailable';
      byId('v2WeatherHighLow').textContent = 'High --° / Low --°';
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
    '/assets/ui/gig-city-arena.jpg',
    '/assets/ui/gig-harbour-stage.jpg',
    '/assets/ui/gig-blue-room.jpg',
    '/assets/ui/gig-river-hall.jpg',
    '/assets/ui/gig-central-live.jpg'
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
      const search = encodeURIComponent(`${gig.artist} ${gig.venue} tickets`);
      return `<article class="v2-panel v2-gig">
        <div class="v2-index-row"><span>${String(index + 1).padStart(2, '0')}</span><span class="v2-tag">[ Event ]</span></div>
        <img src="${gigImages[index]}" alt="${escapeHtml(gig.venue)}">
        <h3>${escapeHtml(gig.artist)}</h3>
        <p>${escapeHtml(gig.venue)}</p><p>${escapeHtml(formatGigDate(gig.date))}</p>
        <a href="https://www.google.com/search?q=${search}" target="_blank" rel="noopener noreferrer">Open details &#8599;</a>
      </article>`;
    }).join('');
    byId('v2GigBatch').textContent = `Batch ${String(gigBatch + 1).padStart(2, '0')} / ${String(batchCount).padStart(2, '0')}`;
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

  loadGigs();
  window.setInterval(() => {
    if (!gigPaused) {
      gigBatch += 1;
      renderGigs();
    }
  }, 10000);

  loadLastUpdated();
}());

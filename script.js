/* =========================================================
   Weather app — HTML/CSS/JS + AJAX (fetch)
   Data source: Open-Meteo (no API key required)
     - Geocoding:  https://open-meteo.com/en/docs/geocoding-api
     - Forecast:   https://open-meteo.com/en/docs
   ========================================================= */

const el = (id) => document.getElementById(id);

const cityInput   = el('cityInput');
const searchForm  = el('searchForm');
const locateBtn   = el('locateBtn');
const statusBox   = el('status');
const heroSection = el('hero');
const hourlySection = el('hourly');
const dailySection  = el('daily');
const emptyState  = el('emptyState');
const sky         = el('sky');
const recentsBox  = el('recents');
const unitToggle  = el('unitToggle');

let currentUnit = 'C';        // 'C' or 'F'
let lastData = null;          // cache last successful fetch for unit re-render

/* ---------- WMO weather code -> {label, family} ---------- */
function describeCode(code) {
  const map = {
    0: ['Clear sky', 'clear'],
    1: ['Mainly clear', 'clear'],
    2: ['Partly cloudy', 'cloudy'],
    3: ['Overcast', 'cloudy'],
    45: ['Fog', 'fog'], 48: ['Depositing rime fog', 'fog'],
    51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Dense drizzle', 'rain'],
    56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
    61: ['Slight rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
    66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
    71: ['Slight snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
    77: ['Snow grains', 'snow'],
    80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
    85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
    95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm w/ hail', 'storm'], 99: ['Thunderstorm w/ hail', 'storm'],
  };
  return map[code] || ['Unknown', 'cloudy'];
}

/* ---------- Inline SVG icon set (no external assets) ---------- */
function iconSvg(family, isDay) {
  const stroke = 'currentColor';
  const sun = `<circle cx="12" cy="12" r="4.5" fill="${stroke}"/><g stroke="${stroke}" stroke-width="1.6" stroke-linecap="round">
      <line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/>
      <line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/>
      <line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/>
      <line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></g>`;
  const moon = `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="${stroke}"/>`;
  const cloud = `<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 11.5a3.5 3.5 0 0 1-.5 6.5H7z" fill="${stroke}" opacity="0.9"/>`;
  const cloudSmall = `<path d="M8 16.5a3 3 0 0 1-.3-5.98 4 4 0 0 1 7.7.48 2.6 2.6 0 0 1-.3 5.5H8z" fill="${stroke}" opacity="0.85"/>`;
  const rainDrops = `<g stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"><line x1="8" y1="20" x2="7" y2="22.5"/><line x1="12" y1="20" x2="11" y2="22.5"/><line x1="16" y1="20" x2="15" y2="22.5"/></g>`;
  const snowDots = `<g fill="${stroke}"><circle cx="8" cy="20.5" r="1"/><circle cx="12" cy="21.5" r="1"/><circle cx="16" cy="20.5" r="1"/></g>`;
  const bolt = `<path d="M13 11h4l-6 9 1.5-6.5H8.5L13 4z" fill="#ffd76a"/>`;
  const fogLines = `<g stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" opacity="0.85"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="13" x2="20" y2="13"/><line x1="4" y1="17" x2="20" y2="17"/></g>`;

  switch (family) {
    case 'clear': return svgWrap(isDay ? sun : moon);
    case 'cloudy': return svgWrap((isDay ? sun : moon) + cloudSmall);
    case 'rain': return svgWrap(cloud + rainDrops);
    case 'snow': return svgWrap(cloud + snowDots);
    case 'storm': return svgWrap(cloud + bolt);
    case 'fog': return svgWrap(fogLines);
    default: return svgWrap(cloud);
  }
}
function svgWrap(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

/* ---------- Sky theme: the signature "living sky" ---------- */
function applySkyTheme(family, isDay) {
  sky.setAttribute('data-theme', `${family}-${isDay ? 'day' : 'night'}`);
}

/* ---------- Status / error messaging ---------- */
function setStatus(message, isError = false) {
  if (!message) {
    statusBox.hidden = true;
    statusBox.textContent = '';
    return;
  }
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.classList.toggle('error', isError);
}

/* ---------- AJAX calls (fetch = modern AJAX) ---------- */
async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if (!data.results || data.results.length === 0) throw new Error('City not found');
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, label: r.name, region: [r.admin1, r.country].filter(Boolean).join(', ') };
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '6',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather request failed');
  return res.json();
}

async function reverseGeocode(lat, lon) {
  // Best-effort label for coordinate-based lookups; falls back silently.
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results && data.results[0] ? data.results[0] : null;
  } catch { return null; }
}

/* ---------- Unit conversion ---------- */
const toF = (c) => (c * 9) / 5 + 32;
function fmtTemp(celsius) {
  const v = currentUnit === 'C' ? celsius : toF(celsius);
  return Math.round(v);
}

/* ---------- Rendering ---------- */
function render(place, data) {
  lastData = { place, data };
  const cur = data.current;
  const [label, family] = describeCode(cur.weather_code);
  const isDay = !!cur.is_day;

  applySkyTheme(family, isDay);

  el('placeName').textContent = place.label;
  el('placeMeta').textContent = place.region || 'Current location';
  el('temp').textContent = fmtTemp(cur.temperature_2m) + '°';
  el('condition').textContent = label;
  el('feelsLike').textContent = fmtTemp(cur.apparent_temperature) + '°';
  el('humidity').textContent = cur.relative_humidity_2m + '%';
  el('wind').textContent = Math.round(cur.wind_speed_10m) + ' km/h';
  el('iconWrap').innerHTML = iconSvg(family, isDay);
  unitToggle.textContent = '°' + currentUnit;

  renderHourly(data);
  renderDaily(data);

  heroSection.hidden = false;
  hourlySection.hidden = false;
  dailySection.hidden = false;
  emptyState.hidden = true;
}

function renderHourly(data) {
  const strip = el('hourlyStrip');
  strip.innerHTML = '';
  const now = new Date();
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const codes = data.hourly.weather_code;

  let startIdx = times.findIndex((t) => new Date(t) >= now);
  if (startIdx === -1) startIdx = 0;

  for (let i = startIdx; i < Math.min(startIdx + 24, times.length); i += 3) {
    const d = new Date(times[i]);
    const [, family] = describeCode(codes[i]);
    const chip = document.createElement('div');
    chip.className = 'hour-chip';
    chip.innerHTML = `
      <span class="hour-time">${d.getHours()}:00</span>
      ${iconSvg(family, d.getHours() >= 6 && d.getHours() < 19)}
      <span class="hour-temp">${fmtTemp(temps[i])}°</span>`;
    strip.appendChild(chip);
  }
}

function renderDaily(data) {
  const list = el('dailyList');
  list.innerHTML = '';
  const days = data.daily.time;
  const codes = data.daily.weather_code;
  const maxT = data.daily.temperature_2m_max;
  const minT = data.daily.temperature_2m_min;

  for (let i = 0; i < days.length; i++) {
    const d = new Date(days[i] + 'T12:00:00');
    const dayName = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' });
    const [, family] = describeCode(codes[i]);
    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <span class="day-name">${dayName}</span>
      ${iconSvg(family, true)}
      <span></span>
      <span class="day-range"><b>${fmtTemp(maxT[i])}°</b> / ${fmtTemp(minT[i])}°</span>`;
    list.appendChild(row);
  }
}

/* ---------- Recent searches (localStorage) ---------- */
function getRecents() {
  try { return JSON.parse(localStorage.getItem('recentCities') || '[]'); }
  catch { return []; }
}
function saveRecent(label) {
  let recents = getRecents().filter((c) => c.toLowerCase() !== label.toLowerCase());
  recents.unshift(label);
  recents = recents.slice(0, 5);
  localStorage.setItem('recentCities', JSON.stringify(recents));
  renderRecents();
}
function renderRecents() {
  const recents = getRecents();
  recentsBox.innerHTML = '';
  recents.forEach((c) => {
    const chip = document.createElement('button');
    chip.className = 'recent-chip';
    chip.type = 'button';
    chip.textContent = c;
    chip.addEventListener('click', () => searchCity(c));
    recentsBox.appendChild(chip);
  });
}

/* ---------- Main flows ---------- */
async function searchCity(name) {
  setStatus(`Looking up ${name}…`);
  try {
    const place = await geocodeCity(name);
    const data = await fetchWeather(place.lat, place.lon);
    render(place, data);
    saveRecent(place.label);
    setStatus(null);
  } catch (err) {
    setStatus(err.message || 'Something went wrong. Try another city.', true);
  }
}

async function searchByCoords(lat, lon) {
  setStatus('Finding weather for your location…');
  try {
    const [data, place] = await Promise.all([
      fetchWeather(lat, lon),
      reverseGeocode(lat, lon),
    ]);
    const label = place ? place.name : 'Your location';
    const region = place ? [place.admin1, place.country].filter(Boolean).join(', ') : '';
    render({ label, region }, data);
    setStatus(null);
  } catch (err) {
    setStatus(err.message || 'Could not load weather for your location.', true);
  }
}

/* ---------- Event wiring ---------- */
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = cityInput.value.trim();
  if (val) searchCity(val);
});

locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by this browser.', true);
    return;
  }
  setStatus('Requesting location access…');
  navigator.geolocation.getCurrentPosition(
    (pos) => searchByCoords(pos.coords.latitude, pos.coords.longitude),
    () => setStatus('Location access denied. Try searching a city instead.', true)
  );
});

unitToggle.addEventListener('click', () => {
  currentUnit = currentUnit === 'C' ? 'F' : 'C';
  if (lastData) render(lastData.place, lastData.data);
});

/* ---------- Init ---------- */
renderRecents();

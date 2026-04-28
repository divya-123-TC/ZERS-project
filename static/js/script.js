/**
 * ZERS v2 — Main Frontend Script
 * Features: Auto safe routing, SOS Pole mode, Voice guidance,
 *           Danger banner, real-time polling, AI-driven routing
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = '';  // Same origin

// ─── STATE ────────────────────────────────────────────────────────────────────
let userLat = 12.9716, userLng = 77.5946;  // Default: Bengaluru MG Road
let poleMode = false;
const POLE_LOCATION = { lat: 12.9716, lng: 77.5946 };  // Fixed SOS pole coords

let mapsLoaded = false;
let map = null;
let directionsRenderer = null;
let userMapMarker = null;
let alertMarkers = [];
let dangerCircles = [];
let alerts = [];
let lastAlertCount = 0;
let lastRouteType = null;

let voiceTranscript = '';
let isRecording = false;
let recognition = null;
let demoMode = false;

// ─── SAFE ZONES — hardcoded destinations ──────────────────────────────────────
const SAFE_ZONES = {
  hospital:    { name: 'City Hospital',     lat: 12.9800, lng: 77.5900, icon: '🏥' },
  open_ground: { name: 'Central Park',      lat: 12.9650, lng: 77.6020, icon: '🏞' },
  high_ground: { name: 'School High Ground',lat: 12.9580, lng: 77.5870, icon: '🏫' },
  relief:      { name: 'Relief Camp Alpha', lat: 12.9750, lng: 77.6100, icon: '⛺' },
};

// Route destination by emergency type (AI override or fallback)
function getSafeDestination(emergencyType, aiSafePlace) {
  // AI gives us safe_place — use it first
  const place = aiSafePlace && SAFE_ZONES[aiSafePlace] ? aiSafePlace : null;
  if (place) return { key: place, ...SAFE_ZONES[place] };

  // Fallback rules
  const map = {
    FIRE:       'open_ground',
    FLOOD:      'high_ground',
    EARTHQUAKE: 'open_ground',
    DISTRESS:   'hospital',
  };
  const key = map[emergencyType] || 'open_ground';
  return { key, ...SAFE_ZONES[key] };
}

// Simulated extra users on map
const SIM_USERS = [
  { id: 'u2', lat: 12.9740, lng: 77.5960 },
  { id: 'u3', lat: 12.9700, lng: 77.5880 },
  { id: 'u4', lat: 12.9680, lng: 77.6010 },
];

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  getUserLocation();
  setupSOS();
  setupPoleMode();
  setupVoice();
  setupSensorSimulation();
  setupClearRoute();
  pollAlerts();
  setInterval(pollAlerts, 5000);
  setInterval(randomInfraFlicker, 12000);
});

// ─── GEOLOCATION ─────────────────────────────────────────────────────────────
function getUserLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      toast('📍 Location acquired', 'success');
      if (mapsLoaded && map) {
        map.setCenter({ lat: userLat, lng: userLng });
        if (userMapMarker) userMapMarker.setPosition({ lat: userLat, lng: userLng });
      }
    },
    () => toast('📍 Using default location (Bengaluru)', 'warn')
  );
}

// ─── GOOGLE MAPS LOADER ───────────────────────────────────────────────────────

window.initGoogleMap = function () {
  mapsLoaded = true;
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: userLat, lng: userLng },
    zoom: 14,
    styles: DARK_MAP_STYLE,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    polylineOptions: { strokeColor: '#00ff88', strokeWeight: 5, strokeOpacity: 0.9 },
    suppressMarkers: false,
  });

  // User marker
  userMapMarker = new google.maps.Marker({
    position: { lat: userLat, lng: userLng },
    map,
    title: 'You',
    zIndex: 100,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#00d4ff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
    },
  });

  // Simulated other users
  SIM_USERS.forEach(u => {
    new google.maps.Marker({
      position: { lat: u.lat, lng: u.lng }, map,
      title: `User ${u.id}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#5AC8FA',
        fillOpacity: 0.8,
        strokeColor: '#fff',
        strokeWeight: 1.5,
      },
    });
  });

  // Safe zone markers
  Object.values(SAFE_ZONES).forEach(sz => {
    const m = new google.maps.Marker({
      position: { lat: sz.lat, lng: sz.lng }, map,
      title: sz.name,
      label: { text: sz.icon, fontSize: '20px' },
    });
    const iw = new google.maps.InfoWindow({
      content: `<div style="font-family:sans-serif;font-weight:bold">${sz.icon} ${sz.name}</div>
                <div style="color:#22c55e;font-size:12px">✅ Safe Zone</div>`,
    });
    m.addListener('click', () => iw.open(map, m));
  });

  // Render any existing alerts
  renderMapMarkers(alerts);
  toast('🗺 Google Maps ready!', 'success');
};

// ─── DEMO MAP ─────────────────────────────────────────────────────────────────
function initDemoMap() {
  const mapDiv = document.getElementById('map');
  mapDiv.innerHTML = `<div class="demo-map" id="demoMapInner"><div class="demo-map-grid"></div></div>`;
  renderDemoMap();
}

function renderDemoMap() {
  const inner = document.getElementById('demoMapInner');
  if (!inner) return;
  inner.querySelectorAll('.demo-marker,.demo-user,.demo-safe-zone,.demo-danger-circle,.demo-route,.demo-pole-marker').forEach(e => e.remove());

  const W = inner.offsetWidth || 700;
  const H = inner.offsetHeight || 500;

  function toXY(lat, lng) {
    const latR = [12.950, 12.990], lngR = [77.578, 77.620];
    return {
      x: ((lng - lngR[0]) / (lngR[1] - lngR[0])) * W,
      y: H - ((lat - latR[0]) / (latR[1] - latR[0])) * H,
    };
  }

  // Safe zones
  Object.values(SAFE_ZONES).forEach(sz => {
    const { x, y } = toXY(sz.lat, sz.lng);
    const zone = document.createElement('div');
    zone.className = 'demo-safe-zone';
    zone.style.cssText = `left:${x}px;top:${y}px;width:90px;height:90px;margin-left:-45px;margin-top:-45px;`;
    inner.appendChild(zone);
    const m = document.createElement('div');
    m.className = 'demo-marker';
    m.style.cssText = `left:${x}px;top:${y}px;`;
    m.innerHTML = `<div class="demo-marker-dot" style="background:#30D158;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:14px;border-radius:50%;">${sz.icon}</div>
      <div class="demo-marker-label" style="color:#30D158">${sz.name}</div>`;
    inner.appendChild(m);
  });

  // Alert markers + danger circles
  alerts.forEach(a => {
    const { x, y } = toXY(a.lat, a.lng);
    const color = typeColor(a.emergency_type);
    const icon = typeIcon(a.emergency_type);
    const r = 65;
    const circle = document.createElement('div');
    circle.className = 'demo-danger-circle';
    circle.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${r*2}px;height:${r*2}px;
      margin-left:-${r}px;margin-top:-${r}px;border-radius:50%;
      border:1.5px dashed ${color};background:${color}15;pointer-events:none;animation:zone-pulse 3s infinite;`;
    inner.appendChild(circle);

    const el = document.createElement('div');
    el.className = 'demo-marker';
    el.style.cssText = `left:${x}px;top:${y}px;z-index:5;cursor:pointer;`;
    el.innerHTML = `
      <div class="demo-marker-dot" style="background:${color};width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:50%;">${icon}</div>
      <div class="demo-marker-ring" style="border-color:${color};position:absolute;inset:-8px;border-radius:50%;border:1.5px solid;animation:ring-pulse 2s infinite;pointer-events:none;"></div>
      <div class="demo-marker-label" style="color:${color}">${a.emergency_type} · ${a.severity}</div>`;
    el.title = `${a.emergency_type}: ${a.reason}`;
    inner.appendChild(el);
  });

  // Simulated users
  SIM_USERS.forEach(u => {
    const { x, y } = toXY(u.lat, u.lng);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:12px;height:12px;
      border-radius:50%;background:#5AC8FA;border:2px solid #fff;transform:translate(-50%,-50%);
      box-shadow:0 0 8px #5AC8FA;z-index:8;`;
    inner.appendChild(el);
  });

  // User / pole marker
  const activeLat = poleMode ? POLE_LOCATION.lat : userLat;
  const activeLng = poleMode ? POLE_LOCATION.lng : userLng;
  const { x: ux, y: uy } = toXY(activeLat, activeLng);
  const userEl = document.createElement('div');
  userEl.className = poleMode ? 'demo-pole-marker' : 'demo-user';
  userEl.style.cssText = `position:absolute;left:${ux}px;top:${uy}px;z-index:10;
    width:${poleMode ? 18 : 14}px;height:${poleMode ? 18 : 14}px;
    border-radius:50%;background:${poleMode ? '#FFD60A' : '#00d4ff'};
    border:2.5px solid #fff;transform:translate(-50%,-50%);
    box-shadow:0 0 12px ${poleMode ? '#FFD60A' : '#00d4ff'};`;
  userEl.title = poleMode ? '📡 SOS Pole' : 'You';
  inner.appendChild(userEl);
}

// ─── SENSOR SIMULATION ────────────────────────────────────────────────────────
function setupSensorSimulation() {
  setInterval(() => updateSensorUI(generateSensorData(false)), 10000);
  updateSensorUI(generateSensorData(false));
  document.getElementById('triggerSensorBtn').addEventListener('click', () => {
    const data = generateSensorData(true);
    updateSensorUI(data);
    sendSensorData(data);
    toast('⚡ Sensor spike triggered — AI analyzing…', 'warn');
  });
}

function generateSensorData(spike) {
  if (spike) {
    const type = ['fire', 'flood', 'earthquake'][Math.floor(Math.random() * 3)];
    if (type === 'fire')       return { temperature: rand(75,120), smoke: rand(400,900), water_level: rand(0,5),   sound: rand(40,80)  };
    if (type === 'flood')      return { temperature: rand(22,30),  smoke: rand(5,15),    water_level: rand(90,200),sound: rand(60,100) };
    if (type === 'earthquake') return { temperature: rand(20,32),  smoke: rand(10,40),   water_level: rand(5,25),  sound: rand(100,160)};
  }
  return { temperature: rand(25,38), smoke: rand(3,25), water_level: rand(2,12), sound: rand(20,50) };
}

function rand(min, max) { return Math.round(Math.random() * (max - min) + min); }

function updateSensorUI(data) {
  document.getElementById('s-temp').textContent  = `${data.temperature}°C`;
  document.getElementById('s-smoke').textContent = `${data.smoke}ppm`;
  document.getElementById('s-water').textContent = `${data.water_level}cm`;
  document.getElementById('s-sound').textContent = `${data.sound}dB`;
  document.getElementById('b-temp').style.width  = `${Math.min(100, data.temperature / 110 * 100)}%`;
  document.getElementById('b-smoke').style.width = `${Math.min(100, data.smoke / 1000 * 100)}%`;
  document.getElementById('b-water').style.width = `${Math.min(100, data.water_level / 200 * 100)}%`;
  document.getElementById('b-sound').style.width = `${Math.min(100, data.sound / 160 * 100)}%`;
}

async function sendSensorData(data) {
  try {
    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, source: 'sensor', lat: userLat, lng: userLng }),
    });
    handleAlertResult(await res.json());
  } catch { toast('Backend unreachable', 'error'); }
}

// ─── SOS (personal — uses GPS location) ──────────────────────────────────────
function setupSOS() {
  const btn = document.getElementById('sosBtn');
  let holdTimer = null, holdStart = null;

  const start = () => {
    holdStart = Date.now();
    btn.style.transform = 'scale(0.93)';
    holdTimer = setTimeout(() => { btn.style.transform = ''; sendSOS(); }, 1500);
  };
  const cancel = () => {
    clearTimeout(holdTimer);
    btn.style.transform = '';
    if (holdStart && Date.now() - holdStart < 1500) toast('Hold SOS for 1.5s to activate', 'warn');
    holdStart = null;
  };

  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, { passive: true });
  btn.addEventListener('mouseup', cancel);
  btn.addEventListener('mouseleave', cancel);
  btn.addEventListener('touchend', cancel);
}

async function sendSOS() {
  toast('🚨 SOS ALERT SENT!', 'error');
  speak('SOS activated. Emergency alert sent. Help is on the way.');
  try {
    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'sos',
        message: 'SOS — Emergency! Immediate assistance required.',
        lat: userLat, lng: userLng,
      }),
    });
    handleAlertResult(await res.json());
  } catch { toast('Backend unreachable — SOS logged locally', 'error'); }
}

// ─── SOS POLE MODE (zero-device simulation) ───────────────────────────────────
function setupPoleMode() {
  document.getElementById('poleBtn').addEventListener('click', activatePoleMode);
}

async function activatePoleMode() {
  poleMode = true;
  setModeLabel('📡 ZERO-DEVICE (SOS POLE)', true);
  document.getElementById('poleStatus').style.display = 'flex';

  toast('📡 SOS POLE MODE — Fixed location alert sent!', 'warn');
  speak('Zero device SOS pole activated. Emergency signal sent from fixed location.');

  try {
    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'sos_pole',
        message: 'SOS POLE ACTIVATED — Emergency at fixed pole location. Immediate help needed.',
        lat: POLE_LOCATION.lat,
        lng: POLE_LOCATION.lng,
      }),
    });
    const result = await res.json();
    handleAlertResult(result, POLE_LOCATION.lat, POLE_LOCATION.lng);
  } catch {
    toast('Backend unreachable — pole alert logged locally', 'error');
    // Still auto-route from pole location in demo
    autoRouteFromLocation('DISTRESS', 'hospital', POLE_LOCATION.lat, POLE_LOCATION.lng,
      'SOS pole triggered — hospital is nearest help');
  }

  // Re-render demo map to show pole marker
  if (demoMode) renderDemoMap();
}

function setModeLabel(text, isPole) {
  const pill = document.getElementById('modePill');
  const label = document.getElementById('modeLabel');
  label.textContent = text;
  pill.querySelector('.dot').className = `dot ${isPole ? 'yellow' : 'green'}`;
}

// ─── VOICE INPUT ─────────────────────────────────────────────────────────────
function setupVoice() {
  const micBtn   = document.getElementById('micBtn');
  const sendBtn  = document.getElementById('sendVoiceBtn');
  const statusEl = document.getElementById('voiceStatus');
  const transcEl = document.getElementById('voiceTranscript');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    statusEl.textContent = '⚠ Speech API not supported in this browser';
    micBtn.disabled = true;
    return;
  }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add('recording');
    statusEl.textContent = '🔴 Recording… speak now';
    statusEl.className = 'voice-status active';
  };
  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    voiceTranscript = final || interim;
    transcEl.textContent = voiceTranscript;
    if (final) sendBtn.disabled = false;
  };
  recognition.onerror = (e) => {
    statusEl.textContent = `⚠ Error: ${e.error}`;
    statusEl.className = 'voice-status';
    micBtn.classList.remove('recording');
    isRecording = false;
  };
  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    statusEl.textContent = voiceTranscript ? '✓ Done — click Send Message' : 'Press MIC to speak';
    statusEl.className = 'voice-status';
    if (voiceTranscript) sendBtn.disabled = false;
  };

  micBtn.addEventListener('click', () => {
    if (isRecording) { recognition.stop(); return; }
    voiceTranscript = '';
    transcEl.textContent = 'Listening…';
    sendBtn.disabled = true;
    recognition.start();
  });

  sendBtn.addEventListener('click', async () => {
    if (!voiceTranscript) return;
    sendBtn.disabled = true;
    toast(`🎤 Sending: "${voiceTranscript.slice(0, 45)}…"`, 'success');
    try {
      const res = await fetch(`${API}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'voice', message: voiceTranscript, lat: userLat, lng: userLng }),
      });
      handleAlertResult(await res.json());
      transcEl.textContent = 'Your message will appear here...';
      voiceTranscript = '';
      document.getElementById('voiceStatus').textContent = 'Press MIC to speak';
    } catch {
      toast('Backend unreachable', 'error');
      sendBtn.disabled = false;
    }
  });
}

// ─── HANDLE ALERT RESULT ─────────────────────────────────────────────────────
function handleAlertResult(result, overrideLat, overrideLng) {
  updateGuidance(result);

  if (result.emergency_type && result.emergency_type !== 'NORMAL') {
    const fromLat = overrideLat ?? userLat;
    const fromLng = overrideLng ?? userLng;

    // Auto-route based on AI safe_place
    autoRouteFromLocation(result.emergency_type, result.safe_place, fromLat, fromLng, result.safe_place_reason);

    // Voice announcement
    const dest = getSafeDestination(result.emergency_type, result.safe_place);
    speak(`${result.emergency_type} emergency detected. ${result.suggested_action}. Routing you to ${dest.name}.`);

    toast(`🚨 ${result.emergency_type} — ${result.severity} severity detected`, 'error');
  }

  pollAlerts();  // Immediately refresh
}

// ─── AUTO ROUTE — picks destination from AI or rules ─────────────────────────
function autoRouteFromLocation(emergencyType, aiSafePlace, fromLat, fromLng, safeReason) {
  const dest = getSafeDestination(emergencyType, aiSafePlace);
  lastRouteType = emergencyType;

  // Update route panel
  document.getElementById('routeAutoInfo').style.display = 'none';
  const display = document.getElementById('routeDestDisplay');
  display.style.display = 'flex';
  document.getElementById('routeDestIcon').textContent = dest.icon;
  document.getElementById('routeDestName').textContent = dest.name;
  document.getElementById('routeDestReason').textContent = safeReason || `Recommended for ${emergencyType}`;

  if (mapsLoaded && map) {
    // Use Google Maps Directions API
    const ds = new google.maps.DirectionsService();
    ds.route({
      origin: { lat: fromLat, lng: fromLng },
      destination: { lat: dest.lat, lng: dest.lng },
      travelMode: google.maps.TravelMode.WALKING,
    }, (result, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        document.getElementById('routeInfo').textContent =
          `🛣 ${dest.icon} ${dest.name} — ${leg.distance.text}, ~${leg.duration.text} walk`;
        document.getElementById('routeInfo').className = 'route-info active';
      } else {
        document.getElementById('routeInfo').textContent = `Route: ${dest.name} (${status})`;
      }
    });
  } else if (demoMode) {
    // Demo SVG route
    renderDemoRoute({ lat: dest.lat, lng: dest.lng }, fromLat, fromLng);
    const d = haversine(fromLat, fromLng, dest.lat, dest.lng);
    document.getElementById('routeInfo').textContent =
      `🛣 ${dest.icon} ${dest.name} — ~${(d * 1000).toFixed(0)}m away`;
    document.getElementById('routeInfo').className = 'route-info active';
  }
}

function setupClearRoute() {
  document.getElementById('clearRouteBtn').addEventListener('click', () => {
    if (mapsLoaded && directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    const inner = document.getElementById('demoMapInner');
    if (inner) inner.querySelectorAll('.demo-route').forEach(e => e.remove());
    document.getElementById('routeInfo').textContent = 'Waiting for emergency detection…';
    document.getElementById('routeInfo').className = 'route-info';
    document.getElementById('routeAutoInfo').style.display = '';
    document.getElementById('routeDestDisplay').style.display = 'none';
    lastRouteType = null;
  });
}

// ─── DEMO SVG ROUTE ───────────────────────────────────────────────────────────
function renderDemoRoute(dest, fromLat, fromLng) {
  const inner = document.getElementById('demoMapInner');
  if (!inner) return;
  inner.querySelectorAll('.demo-route').forEach(e => e.remove());

  const W = inner.offsetWidth || 700, H = inner.offsetHeight || 500;
  function toXY(lat, lng) {
    const latR = [12.950, 12.990], lngR = [77.578, 77.620];
    return {
      x: ((lng - lngR[0]) / (lngR[1] - lngR[0])) * W,
      y: H - ((lat - latR[0]) / (latR[1] - latR[0])) * H,
    };
  }
  const from = toXY(fromLat, fromLng);
  const to   = toXY(dest.lat, dest.lng);
  // Midpoint for a slight curve
  const mx = (from.x + to.x) / 2 + (to.y - from.y) * 0.15;
  const my = (from.y + to.y) / 2 - (to.x - from.x) * 0.15;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('demo-route');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;';
  svg.innerHTML = `
    <defs>
      <marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#00ff88"/>
      </marker>
      <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path d="M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}"
      stroke="#00ff88" stroke-width="3.5" stroke-dasharray="10 5" fill="none"
      marker-end="url(#arr)" filter="url(#glow)" opacity="0.92"/>`;
  inner.appendChild(svg);
}

// ─── POLL ALERTS — real-time refresh ─────────────────────────────────────────
async function pollAlerts() {
  try {
    const res = await fetch(`${API}/api/alerts`);
    alerts = await res.json();
    renderAlertFeed(alerts);
    document.getElementById('alertCount').textContent = alerts.length;
    checkSafety(alerts);
    if (mapsLoaded) renderMapMarkers(alerts);
    if (demoMode) renderDemoMap();

    // Auto-route if a new HIGH alert appeared and we don't have a route yet
    if (!lastRouteType && alerts.length > lastAlertCount) {
      const newest = alerts[0];
      if (newest && newest.emergency_type !== 'NORMAL') {
        autoRouteFromLocation(newest.emergency_type, newest.safe_place,
          poleMode ? POLE_LOCATION.lat : userLat,
          poleMode ? POLE_LOCATION.lng : userLng,
          newest.safe_place_reason);
      }
    }
    lastAlertCount = alerts.length;
  } catch { /* silent */ }
}

// ─── ALERT FEED ───────────────────────────────────────────────────────────────
function renderAlertFeed(list) {
  const feed = document.getElementById('alertFeed');
  if (!list.length) { feed.innerHTML = '<div class="empty-state">No alerts yet</div>'; return; }

  // Sort: HIGH first, newest within same severity
  const sorted = [...list].sort((a, b) => {
    const s = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (s[a.severity] ?? 3) - (s[b.severity] ?? 3) || b.id - a.id;
  });

  feed.innerHTML = sorted.slice(0, 20).map(a => `
    <div class="alert-item ${a.emergency_type}" onclick="focusAlert(${a.id})">
      <div class="alert-row1">
        <span class="alert-type-badge">${typeIcon(a.emergency_type)} ${a.emergency_type}</span>
        <span class="alert-sev sev-${a.severity}">${a.severity}</span>
        <span class="alert-src">${a.source || ''}</span>
      </div>
      <div class="alert-msg">${a.reason || '—'}</div>
      ${a.message ? `<div class="alert-voice">"${a.message.slice(0, 60)}${a.message.length > 60 ? '…' : ''}"</div>` : ''}
      <div class="alert-time">${formatTime(a.created_at)}</div>
    </div>`).join('');
}

// ─── FOCUS ALERT ─────────────────────────────────────────────────────────────
function focusAlert(id) {
  const a = alerts.find(x => x.id === id);
  if (!a) return;
  if (mapsLoaded && map) { map.panTo({ lat: a.lat, lng: a.lng }); map.setZoom(15); }
  updateGuidance(a);
  if (a.emergency_type !== 'NORMAL') {
    autoRouteFromLocation(a.emergency_type, a.safe_place, userLat, userLng, a.safe_place_reason);
  }
}

// ─── SAFETY CHECK — shows/hides danger banner ─────────────────────────────────
function checkSafety(alertList) {
  const badge  = document.getElementById('safetyBadge');
  const banner = document.getElementById('dangerBanner');
  const bannerSub = document.getElementById('dangerBannerSub');
  const RADIUS = 0.5; // km

  const checkLat = poleMode ? POLE_LOCATION.lat : userLat;
  const checkLng = poleMode ? POLE_LOCATION.lng : userLng;

  const dangerAlert = alertList.find(a => {
    if (a.emergency_type === 'NORMAL') return false;
    return haversine(checkLat, checkLng, a.lat, a.lng) <= RADIUS;
  });

  if (dangerAlert) {
    badge.className = 'safety-badge danger';
    badge.innerHTML = '<span class="safety-icon">⚠</span><span class="safety-text">DANGER</span>';
    banner.style.display = 'flex';
    bannerSub.textContent = `${typeIcon(dangerAlert.emergency_type)} ${dangerAlert.emergency_type} nearby — follow safe route immediately`;
  } else {
    badge.className = 'safety-badge';
    badge.innerHTML = '<span class="safety-icon">✓</span><span class="safety-text">SAFE</span>';
    banner.style.display = 'none';
  }
}

// ─── GUIDANCE UPDATE ─────────────────────────────────────────────────────────
const GUIDANCE_TEXT = {
  FIRE:       { msg: 'Fire/smoke detected nearby!',       action: 'Move away from smoke. Cover mouth. Evacuate upwind.' },
  FLOOD:      { msg: 'Rising water levels detected!',     action: 'Move to higher ground immediately. Avoid flood water.' },
  EARTHQUAKE: { msg: 'Seismic activity detected!',        action: 'Drop, Cover, Hold On. Move to open areas.' },
  DISTRESS:   { msg: 'Distress signal received!',         action: 'Stay calm. Rescue team has been notified.' },
  NORMAL:     { msg: 'All systems nominal.',              action: 'Continue monitoring. Help is always nearby.' },
};
const TYPE_COLORS = { FIRE:'#FF3B30', FLOOD:'#007AFF', EARTHQUAKE:'#BF5AF2', DISTRESS:'#FF9F0A', NORMAL:'#00ff88' };

function updateGuidance(result) {
  const g = GUIDANCE_TEXT[result.emergency_type] || GUIDANCE_TEXT.NORMAL;
  const box = document.getElementById('guidanceBox');
  box.querySelector('.guidance-type').textContent = result.emergency_type || 'MONITORING';
  box.querySelector('.guidance-msg').textContent = result.reason || g.msg;
  box.querySelector('.guidance-action').textContent = result.suggested_action || g.action;
  box.querySelector('.guidance-type').style.color = TYPE_COLORS[result.emergency_type] || '#00ff88';
}

// ─── GOOGLE MAP MARKERS ───────────────────────────────────────────────────────
function renderMapMarkers(alertList) {
  alertMarkers.forEach(m => m.setMap(null));
  dangerCircles.forEach(c => c.setMap(null));
  alertMarkers = []; dangerCircles = [];
  alertList.forEach(a => addAlertMarker(a));
}

function addAlertMarker(a) {
  if (!mapsLoaded || !map) return;
  const color = typeColor(a.emergency_type);

  const marker = new google.maps.Marker({
    position: { lat: a.lat, lng: a.lng }, map,
    title: `${a.emergency_type} — ${a.severity}`,
    zIndex: a.severity === 'HIGH' ? 50 : 20,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: a.severity === 'HIGH' ? 13 : 10,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: '#fff',
      strokeWeight: 2,
    },
  });
  alertMarkers.push(marker);

  // Danger zone circle
  const circle = new google.maps.Circle({
    map, center: { lat: a.lat, lng: a.lng }, radius: 500,
    fillColor: color, fillOpacity: 0.07,
    strokeColor: color, strokeOpacity: 0.5, strokeWeight: 1.5,
  });
  dangerCircles.push(circle);

  // Rich info window
  const iw = new google.maps.InfoWindow({
    content: `
      <div style="font-family:'Exo 2',sans-serif;padding:6px;min-width:220px">
        <div style="font-weight:800;font-size:15px;color:${color}">${typeIcon(a.emergency_type)} ${a.emergency_type}</div>
        <div style="display:flex;gap:8px;margin:4px 0">
          <span style="background:${color}22;color:${color};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700">${a.severity}</span>
          <span style="color:#666;font-size:11px">${a.source || ''}</span>
          <span style="color:#999;font-size:10px;margin-left:auto">${formatTime(a.created_at)}</span>
        </div>
        <div style="font-size:12px;color:#333;margin-bottom:4px"><b>Reason:</b> ${a.reason || '—'}</div>
        <div style="font-size:12px;color:#22c55e;margin-bottom:4px"><b>Action:</b> ${a.suggested_action || '—'}</div>
        ${a.message ? `<div style="font-size:11px;color:#777;border-top:1px solid #eee;padding-top:4px;margin-top:4px;font-style:italic">"${a.message}"</div>` : ''}
        ${a.safe_place && a.safe_place !== 'none' ? `<div style="font-size:11px;color:#3b82f6;margin-top:4px">🛣 Route to: ${a.safe_place?.replace('_',' ')}</div>` : ''}
      </div>`,
  });
  marker.addListener('click', () => iw.open(map, marker));
}

// ─── VOICE GUIDANCE (public announcement) ────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-IN';
  utt.rate = 0.95;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  window.speechSynthesis.speak(utt);
}

// ─── INFRA FLICKER ───────────────────────────────────────────────────────────
function randomInfraFlicker() {
  const nodeC = document.getElementById('nodeC');
  const online = Math.random() > 0.35;
  nodeC.className = `infra-item ${online ? 'online' : 'offline'}`;
  nodeC.querySelector('.infra-status').textContent = online ? 'ONLINE' : 'OFFLINE';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function typeColor(type) {
  return { FIRE:'#FF3B30', FLOOD:'#007AFF', EARTHQUAKE:'#BF5AF2', DISTRESS:'#FF9F0A', NORMAL:'#30D158', SOS:'#FFD60A' }[type] || '#888';
}
function typeIcon(type) {
  return { FIRE:'🔥', FLOOD:'🌊', EARTHQUAKE:'🌍', DISTRESS:'🆘', NORMAL:'✅', SOS:'🚨' }[type] || '⚠️';
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString();
}
function toast(msg, type='success') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── DARK GOOGLE MAPS STYLE ───────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType:'geometry', stylers:[{color:'#1a1f2e'}] },
  { elementType:'labels.text.stroke', stylers:[{color:'#1a1f2e'}] },
  { elementType:'labels.text.fill', stylers:[{color:'#8892a4'}] },
  { featureType:'road', elementType:'geometry', stylers:[{color:'#2d3748'}] },
  { featureType:'road', elementType:'geometry.stroke', stylers:[{color:'#111827'}] },
  { featureType:'road.highway', elementType:'geometry', stylers:[{color:'#374151'}] },
  { featureType:'water', elementType:'geometry', stylers:[{color:'#0c1220'}] },
  { featureType:'poi', elementType:'geometry', stylers:[{color:'#1f2937'}] },
  { featureType:'poi.park', elementType:'geometry', stylers:[{color:'#1a2e1a'}] },
  { featureType:'transit', elementType:'geometry', stylers:[{color:'#1f2937'}] },
  { featureType:'administrative', elementType:'geometry.stroke', stylers:[{color:'#374151'}] },
];

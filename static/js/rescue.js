/**
 * ZERS — Rescue Team Dashboard Script
 * Handles: Alert table, filtering, detail panel, AI insights, messages, chart
 */

const API = '';
let allAlerts = [];
let selectedAlertId = null;

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setInterval(loadAll, 5000);
  setupFilters();
  document.getElementById('refreshBtn').addEventListener('click', loadAll);
});

async function loadAll() {
  await Promise.all([loadAlerts(), loadMessages(), loadStats()]);
}

// ─── LOAD ALERTS ──────────────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const res = await fetch(`${API}/api/alerts`);
    allAlerts = await res.json();
    renderTable(allAlerts);
  } catch (e) {
    document.getElementById('alertsBody').innerHTML =
      '<tr><td colspan="8" class="empty-row">⚠ Backend not reachable — start Flask server</td></tr>';
  }
}

// ─── RENDER TABLE ─────────────────────────────────────────────────────────────
function renderTable(list) {
  const typeF   = document.getElementById('filterType').value;
  const sevF    = document.getElementById('filterSeverity').value;
  const statF   = document.getElementById('filterStatus').value;

  const filtered = list.filter(a =>
    (!typeF || a.emergency_type === typeF) &&
    (!sevF  || a.severity === sevF) &&
    (!statF || a.status === statF)
  );

  // Sort: HIGH first, then newest
  filtered.sort((a, b) => {
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const s = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    if (s !== 0) return s;
    return b.id - a.id;
  });

  const tbody = document.getElementById('alertsBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No incidents match filters</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr class="${a.id === selectedAlertId ? 'selected' : ''}" onclick="selectAlert(${a.id})">
      <td style="font-family:var(--font-mono);color:var(--text-dim)">#${a.id}</td>
      <td><span class="type-chip type-${a.emergency_type}">${typeIcon(a.emergency_type)} ${a.emergency_type}</span></td>
      <td><span class="sev-chip sev-${a.severity}">${a.severity}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">${a.source || '—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-secondary)">${a.message || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);white-space:nowrap">${formatTime(a.created_at)}</td>
      <td>
        <select class="select-input sm status-select" data-id="${a.id}" onchange="updateStatus(${a.id}, this.value)" onclick="event.stopPropagation()">
          ${['Assigned','En Route','Completed'].map(s =>
            `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <span class="status-badge status-${a.status}">${a.status}</span>
      </td>
    </tr>`).join('');
}

// ─── SELECT ALERT ─────────────────────────────────────────────────────────────
function selectAlert(id) {
  selectedAlertId = id;
  const a = allAlerts.find(x => x.id === id);
  if (!a) return;

  renderTable(allAlerts);

  const color = typeColor(a.emergency_type);

  // Full detail panel
  document.getElementById('detailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value" style="font-family:var(--font-mono)">#${a.id}</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value"><span class="type-chip type-${a.emergency_type}">${typeIcon(a.emergency_type)} ${a.emergency_type}</span></span></div>
      <div class="detail-row"><span class="detail-label">Severity</span><span class="detail-value"><span class="sev-chip sev-${a.severity}">${a.severity}</span></span></div>
      <div class="detail-row"><span class="detail-label">Source</span><span class="detail-value" style="font-family:var(--font-mono);text-transform:uppercase">${a.source || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value" style="font-family:var(--font-mono)">${a.lat?.toFixed(5)}, ${a.lng?.toFixed(5)}</span></div>
      <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value" style="font-family:var(--font-mono)">${formatTime(a.created_at)}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="status-badge status-${a.status}">${a.status}</span></span></div>
      ${a.safe_place && a.safe_place !== 'none' ? `<div class="detail-row"><span class="detail-label">Safe Route</span><span class="detail-value" style="color:var(--accent)">→ ${a.safe_place?.replace(/_/g,' ')}</span></div>` : ''}
      ${a.message ? `<div class="detail-row" style="flex-direction:column;gap:3px">
        <span class="detail-label">Message</span>
        <span class="detail-value" style="font-style:italic;color:var(--text-secondary);border-left:2px solid ${color};padding-left:8px">"${a.message}"</span>
      </div>` : ''}
    </div>`;

  // AI Insights panel
  document.getElementById('aiInsights').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="ai-box">
        <div class="ai-box-label">DETECTION REASON</div>
        <div class="ai-box-val">${a.reason || 'No reason provided'}</div>
      </div>
      <div class="ai-box">
        <div class="ai-box-label">SUGGESTED ACTION</div>
        <div class="ai-box-val" style="color:var(--warn)">${a.suggested_action || '—'}</div>
      </div>
      ${a.safe_place && a.safe_place !== 'none' ? `
      <div class="ai-box">
        <div class="ai-box-label">AI ROUTING DECISION</div>
        <div class="ai-box-val" style="color:var(--accent)">→ ${a.safe_place?.replace(/_/g,' ').toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${a.safe_place_reason || ''}</div>
      </div>` : ''}
      <div class="ai-box">
        <div class="ai-box-label">RESCUE TEAM GUIDANCE</div>
        <div class="ai-box-val" style="color:var(--accent2);font-size:11px">${getContextGuidance(a.emergency_type)}</div>
      </div>
    </div>`;
}

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────
async function updateStatus(id, status) {
  try {
    await fetch(`${API}/api/alerts/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    toast(`Alert #${id} → ${status}`, 'success');
    await loadAlerts();
  } catch (e) {
    toast('Failed to update status', 'error');
  }
}

// ─── LOAD MESSAGES ────────────────────────────────────────────────────────────
async function loadMessages() {
  try {
    const res = await fetch(`${API}/api/messages`);
    const msgs = await res.json();
    const feed = document.getElementById('msgFeed');
    if (!msgs.length) { feed.innerHTML = '<div class="empty-state">No messages yet</div>'; return; }
    feed.innerHTML = msgs.slice(0, 15).map(m => `
      <div class="msg-item">
        <div class="msg-source">📍 ${m.lat?.toFixed(3)},${m.lng?.toFixed(3)} · ${m.source?.toUpperCase()} · ${formatTime(m.created_at)}</div>
        <div class="msg-content">${m.content}</div>
      </div>`).join('');
  } catch (e) {}
}

// ─── LOAD STATS ───────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const s = await res.json();
    document.getElementById('statTotal').textContent  = s.total;
    document.getElementById('statHigh').textContent   = s.high;
    document.getElementById('statActive').textContent = s.active;
    renderChart(s.by_type);
  } catch (e) {}
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function renderChart(byType) {
  const area = document.getElementById('chartArea');
  if (!byType || !byType.length) { area.innerHTML = '<div class="empty-state">No data yet</div>'; return; }

  const max = Math.max(...byType.map(b => b.cnt), 1);
  const colors = { FIRE:'#FF3B30', FLOOD:'#007AFF', EARTHQUAKE:'#BF5AF2', DISTRESS:'#FF9F0A', NORMAL:'#30D158' };

  area.innerHTML = `<div class="chart-bars">
    ${byType.map(b => `
      <div class="chart-bar-wrap">
        <div class="chart-bar-val" style="color:${colors[b.emergency_type]||'#888'}">${b.cnt}</div>
        <div class="chart-bar" style="background:${colors[b.emergency_type]||'#888'};height:${Math.round((b.cnt/max)*60)+4}px"></div>
        <div class="chart-bar-label">${b.emergency_type?.slice(0,4)}</div>
      </div>`).join('')}
  </div>`;
}

// ─── FILTERS ──────────────────────────────────────────────────────────────────
function setupFilters() {
  ['filterType','filterSeverity','filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => renderTable(allAlerts));
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function typeColor(type) {
  return { FIRE:'#FF3B30', FLOOD:'#007AFF', EARTHQUAKE:'#BF5AF2', DISTRESS:'#FF9F0A', NORMAL:'#30D158' }[type] || '#888';
}
function typeIcon(type) {
  return { FIRE:'🔥', FLOOD:'🌊', EARTHQUAKE:'🌍', DISTRESS:'🆘', NORMAL:'✅', SOS:'🚨' }[type] || '⚠️';
}
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString();
}
function getContextGuidance(type) {
  return {
    FIRE:       '🔥 Dispatch fire units. Ensure wind direction noted. Evacuate radius 500m.',
    FLOOD:      '🌊 Alert water rescue teams. Mark high ground shelters. Monitor water rise rate.',
    EARTHQUAKE: '🌍 Check structural damage reports. Deploy search & rescue. Aftershock risk.',
    DISTRESS:   '🆘 Immediate response required. Locate user. First-aid unit dispatch.',
    NORMAL:     '✅ Situation normal. Continue monitoring. No action required.',
  }[type] || 'Monitor situation. Await further data.';
}
function toast(msg, type='success') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* =============================================
   Main App — app.js
   ============================================= */

const AppState = {
  connected: false,
  partnerId: null,
  ks: null,
  serviceUrl: 'https://www.kaltura.com',
  uiconfId: null,
  currentReviewTask: null, // { taskId, entryId }
};

// ---- DOM refs -------------------------------------------------------

const dom = {
  ksInput:       () => document.getElementById('ks-input'),
  serviceUrl:    () => document.getElementById('service-url'),
  uiconfId:      () => document.getElementById('uiconf-id'),
  connectBtn:    () => document.getElementById('connect-btn'),
  statusDot:     () => document.getElementById('status-dot'),
  statusText:    () => document.getElementById('status-text'),
  partnerInfo:   () => document.getElementById('partner-info'),
};

// ---- Tab management -------------------------------------------------

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });

  // Notify tab modules
  if (tabName === 'tasks'  && typeof TasksTab  !== 'undefined') TasksTab.onActivate();
  if (tabName === 'review' && typeof ReviewTab !== 'undefined') ReviewTab.onActivate();
}

// ---- Connect / KS flow ---------------------------------------------

async function connect() {
  const ks         = dom.ksInput().value.trim();
  const serviceUrl = dom.serviceUrl().value.trim() || 'https://www.kaltura.com';
  const uiconfId   = dom.uiconfId().value.trim();

  if (!ks) {
    showStatus('disconnected', 'Enter a KS to connect');
    return;
  }

  showStatus('connecting', 'Connecting…');
  dom.connectBtn().disabled = true;

  try {
    KalturaAPI.configure({ baseUrl: serviceUrl, ks });

    const session = await KalturaAPI.sessionGet();

    AppState.connected  = true;
    AppState.ks         = ks;
    AppState.serviceUrl = serviceUrl;
    AppState.partnerId  = session.partnerId;
    AppState.uiconfId   = uiconfId || null;

    showStatus('connected', `Connected — Partner ${session.partnerId}`);
    dom.partnerInfo().textContent = `Partner: ${session.partnerId}`;

    // Persist to sessionStorage so page refreshes don't lose state
    sessionStorage.setItem('kaltura_ks',         ks);
    sessionStorage.setItem('kaltura_service_url', serviceUrl);
    sessionStorage.setItem('kaltura_uiconf_id',   uiconfId);

    // Auto-activate tasks tab after connect
    switchTab('tasks');

  } catch (err) {
    showStatus('error', err.message || 'Connection failed');
    console.error('[KalturaApp] Connect error:', err);
  } finally {
    dom.connectBtn().disabled = false;
  }
}

function disconnect() {
  AppState.connected = false;
  AppState.ks = null;
  AppState.partnerId = null;
  KalturaAPI.configure({ ks: null });
  showStatus('disconnected', 'Disconnected');
  dom.partnerInfo().textContent = '';
  sessionStorage.removeItem('kaltura_ks');
}

function showStatus(state, text) {
  const dot  = dom.statusDot();
  const span = dom.statusText();
  dot.className = 'status-dot';
  if (state === 'connected')   dot.classList.add('connected');
  if (state === 'error')       dot.classList.add('error');
  if (state === 'connecting')  dot.classList.add('connecting');
  span.textContent = text;
}

// ---- Utility helpers -----------------------------------------------

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function openReview(taskId, entryId) {
  AppState.currentReviewTask = { taskId, entryId };
  switchTab('review');
  if (typeof ReviewTab !== 'undefined') {
    ReviewTab.loadReview(taskId, entryId);
  }
}

// ---- Init ----------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Wire connect button
  dom.connectBtn().addEventListener('click', connect);

  // Allow Enter key in KS field
  dom.ksInput().addEventListener('keydown', e => {
    if (e.key === 'Enter') connect();
  });

  // Restore from sessionStorage
  const savedKs      = sessionStorage.getItem('kaltura_ks');
  const savedUrl     = sessionStorage.getItem('kaltura_service_url');
  const savedUiconf  = sessionStorage.getItem('kaltura_uiconf_id');

  if (savedKs) {
    dom.ksInput().value    = savedKs;
    dom.serviceUrl().value = savedUrl  || 'https://www.kaltura.com';
    dom.uiconfId().value   = savedUiconf || '';
    connect(); // auto-reconnect
  }

  showStatus('disconnected', 'Not connected');
});

// Expose globally
window.AppState  = AppState;
window.openReview = openReview;
window.switchTab  = switchTab;
window.escapeHtml = escapeHtml;
window.formatDate = formatDate;

/* ==========================================================================
   PulseRoute — AI Emergency Response Corridor
   Hacknauts 2.0 · Team Brain Bytes · GNDEC Ludhiana
   Vanilla JS. No build step. State lives in localStorage.
   ========================================================================== */
(function () {
  'use strict';

  /* ————————————————————————————————————————————————
     Constants
     ———————————————————————————————————————————————— */
  const STORE_KEY = 'pulseroute.state.v2';
  const SESSION_KEY = 'pulseroute.session.v2';
  const MAX_AUDIT = 120;
  const MAX_INCIDENTS = 24;

  const ROLES = {
    admin: { label: 'Municipal Traffic Admin', short: 'Traffic Admin', icon: 'traffic' },
    emt: { label: 'Ambulance EMT', short: 'Ambulance EMT', icon: 'ambulance' },
    hospital: { label: 'Hospital Trauma Staff', short: 'Trauma Staff', icon: 'hospital' }
  };

  const PERMISSIONS = {
    admin: ['incident:create', 'incident:resolve', 'signal:override', 'fallback:toggle', 'consent:toggle', 'readiness:toggle'],
    emt: ['incident:create'],
    hospital: ['consent:toggle', 'readiness:toggle']
  };

  const TYPE_META = {
    cardiac: {
      label: 'Cardiac emergency', triage: 'STEMI · critical', icon: 'heart',
      profile: { hr: 96, spo2: 94, bpSys: 132, bpDia: 86, resp: 21, hrTrend: 'Sinus tachycardia', spo2Trend: '2L O₂ · nasal cannula', bpTrend: 'MAP 101', respTrend: 'Mild distress' }
    },
    trauma: {
      label: 'Road trauma', triage: 'Polytrauma · critical', icon: 'ambulance',
      profile: { hr: 112, spo2: 96, bpSys: 108, bpDia: 68, resp: 23, hrTrend: 'Compensatory tachy', spo2Trend: 'Room air', bpTrend: 'MAP 81', respTrend: 'Guarded breathing' }
    },
    stroke: {
      label: 'Stroke / neuro', triage: 'CVA · time-critical', icon: 'brain',
      profile: { hr: 84, spo2: 97, bpSys: 158, bpDia: 94, resp: 18, hrTrend: 'Sinus rhythm', spo2Trend: 'Room air', bpTrend: 'MAP 115', respTrend: 'Spontaneous' }
    },
    respiratory: {
      label: 'Respiratory distress', triage: 'Hypoxia · urgent', icon: 'lungs',
      profile: { hr: 104, spo2: 89, bpSys: 128, bpDia: 78, resp: 28, hrTrend: 'Sinus tachycardia', spo2Trend: 'High-flow O₂', bpTrend: 'MAP 95', respTrend: 'Accessory muscle use' }
    },
    maternity: {
      label: 'Maternity emergency', triage: 'Obstetric · urgent', icon: 'user',
      profile: { hr: 92, spo2: 98, bpSys: 124, bpDia: 76, resp: 19, hrTrend: 'Sinus rhythm', spo2Trend: 'Room air', bpTrend: 'MAP 92', respTrend: 'Spontaneous' }
    },
    pediatric: {
      label: 'Pediatric emergency', triage: 'Pediatric · critical', icon: 'heart',
      profile: { hr: 128, spo2: 95, bpSys: 96, bpDia: 60, resp: 26, hrTrend: 'Age-appropriate tachy', spo2Trend: 'Room air', bpTrend: 'MAP 72', respTrend: 'Mild distress' }
    }
  };

  const READINESS_ITEMS = [
    { key: 'traumaBay', label: 'Trauma bay 1 prepared', detail: 'Resus bay · team briefed' },
    { key: 'bloodBank', label: 'Blood bank on standby', detail: '2 units O-negative reserved' },
    { key: 'imaging', label: 'CT / imaging cleared', detail: 'Radiology slot held' },
    { key: 'surgicalTeam', label: 'Specialist team paged', detail: 'On-call lead + anaesthesia' },
    { key: 'icu', label: 'ICU bed reserved', detail: 'Bed 4 · ventilator checked' }
  ];

  const SIGNALS = [
    { id: 'SIG-LDH-101', name: 'Gill Road / GNDEC Gate', lat: 30.868626, lng: 75.859057, route: 0.12 },
    { id: 'SIG-LDH-102', name: 'Gill Road / Sherpur Chowk', lat: 30.883506, lng: 75.858606, route: 0.28 },
    { id: 'SIG-LDH-103', name: 'GT Road / Jalandhar Bypass', lat: 30.899126, lng: 75.858085, route: 0.46 },
    { id: 'SIG-LDH-104', name: 'Hambran Road / Jawaddi', lat: 30.913275, lng: 75.849575, route: 0.64 },
    { id: 'SIG-LDH-105', name: 'Hambran Road / DMC Approach', lat: 30.916076, lng: 75.833653, route: 0.82 }
  ];

  /* OSRM driving route GNDEC → DMC & Hospital, simplified to 24 points. */
  const ROUTE = [
    [30.86015, 75.86213], [30.86014, 75.86103], [30.86067, 75.86102], [30.86067, 75.85937],
    [30.86562, 75.85910], [30.90034, 75.85810], [30.90047, 75.85806], [30.90216, 75.85537],
    [30.90323, 75.85434], [30.90922, 75.85149], [30.90949, 75.85123], [30.91574, 75.84848],
    [30.91587, 75.84786], [30.91641, 75.84718], [30.91675, 75.84632], [30.91634, 75.84028],
    [30.91586, 75.83873], [30.91577, 75.83782], [30.91671, 75.82412], [30.91245, 75.82500],
    [30.91228, 75.82372], [30.91313, 75.82354], [30.91323, 75.82416], [30.91423, 75.82394]
  ];

  const PAGE_META = {
    dashboard: { kicker: 'Command center', title: 'Live corridor' },
    hospital: { kicker: 'Trauma sync', title: 'Patient & vitals' },
    overview: { kicker: 'Program brief', title: 'Project overview' }
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector));
  const icon = (name, cls) => '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);

  const now = () => Date.now();

  const formatClock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formatWindow = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function formatRelative(ts) {
    const delta = Math.max(0, Math.floor((now() - ts) / 1000));
    if (delta < 8) return 'just now';
    if (delta < 60) return delta + 's ago';
    if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
    if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  /* ————————————————————————————————————————————————
     Route geometry helpers
     ———————————————————————————————————————————————— */
  function haversine(a, b) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(sa));
  }

  const ROUTE_CUM = (function buildCumulative() {
    const out = [0];
    for (let i = 1; i < ROUTE.length; i += 1) out.push(out[i - 1] + haversine(ROUTE[i - 1], ROUTE[i]));
    return out;
  })();
  const ROUTE_LENGTH = ROUTE_CUM[ROUTE_CUM.length - 1];

  function pointAt(fraction) {
    const f = clamp(Number(fraction) || 0, 0, 1);
    const target = f * ROUTE_LENGTH;
    for (let i = 1; i < ROUTE.length; i += 1) {
      if (target <= ROUTE_CUM[i]) {
        const span = ROUTE_CUM[i] - ROUTE_CUM[i - 1] || 1;
        const t = (target - ROUTE_CUM[i - 1]) / span;
        return [
          ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t,
          ROUTE[i - 1][1] + (ROUTE[i][1] - ROUTE[i - 1][1]) * t
        ];
      }
    }
    return ROUTE[ROUTE.length - 1].slice();
  }

  function routeTo(fraction) {
    const f = clamp(Number(fraction) || 0, 0, 1);
    if (f <= 0) return [ROUTE[0].slice()];
    if (f >= 1) return ROUTE.map((p) => p.slice());
    const target = f * ROUTE_LENGTH;
    const out = [ROUTE[0].slice()];
    for (let i = 1; i < ROUTE.length; i += 1) {
      if (ROUTE_CUM[i] <= target) {
        out.push(ROUTE[i].slice());
      } else {
        const span = ROUTE_CUM[i] - ROUTE_CUM[i - 1] || 1;
        const t = (target - ROUTE_CUM[i - 1]) / span;
        out.push([
          ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t,
          ROUTE[i - 1][1] + (ROUTE[i][1] - ROUTE[i - 1][1]) * t
        ]);
        break;
      }
    }
    return out;
  }

  /* ————————————————————————————————————————————————
     Persistent state
     ———————————————————————————————————————————————— */
  function makeDemoIncident() {
    const stamp = now();
    return {
      id: 'INC-2401',
      type: 'cardiac',
      severity: 'Critical',
      pickup: 'GNDEC Main Gate, Gill Road',
      destination: 'DMC & Hospital, Tagore Nagar',
      ambulance: 'AMB-17 · ALS',
      etaMinutes: 7,
      condition: 'Cardiac · male 54 · chest pain, diaphoresis',
      patientLabel: 'Patient A-2087 · Male, 54',
      triage: 'STEMI · critical',
      status: 'active',
      progress: 0.06,
      createdAt: stamp,
      startedAt: stamp,
      arrivedAt: null,
      closedAt: null
    };
  }

  function seedState() {
    const stamp = now();
    const incident = makeDemoIncident();
    return {
      version: 2,
      incidents: [incident],
      activeIncidentId: incident.id,
      consent: { granted: true, updatedAt: stamp },
      signals: SIGNALS.map((s) => Object.assign({}, s, { state: 'normal', manual: false, manualState: 'normal' })),
      readiness: { traumaBay: true, bloodBank: true, imaging: false, surgicalTeam: false, icu: false },
      fallbacks: { networkOutage: false, humanOverride: false },
      audit: [{
        id: 'audit-' + stamp + '-seed',
        ts: stamp,
        role: 'system',
        action: 'Demo workspace initialised',
        detail: 'GNDEC → DMC corridor loaded with five connected junctions.',
        tone: 'info'
      }],
      settings: { speed: 6 },
      nextIncidentSeq: 2402
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') return seedState();
    const incidents = Array.isArray(raw.incidents)
      ? raw.incidents.filter((item) => item && typeof item === 'object' && typeof item.id === 'string').slice(0, MAX_INCIDENTS)
      : [];

    let activeId = raw.activeIncidentId || null;
    const active = incidents.find((item) => item.id === activeId && (item.status === 'active' || item.status === 'arrived'));
    activeId = active ? active.id : null;
    if (active) {
      active.progress = clamp(Number(active.progress) || 0, 0, 1);
      active.etaMinutes = clamp(Number(active.etaMinutes) || 7, 1, 60);
      if (active.progress >= 1 && active.status === 'active') {
        active.progress = 1;
        active.status = 'arrived';
        active.arrivedAt = active.arrivedAt || now();
      }
    }

    const savedSignals = Array.isArray(raw.signals) ? raw.signals : [];
    const signals = SIGNALS.map((def) => {
      const hit = savedSignals.find((item) => item && item.id === def.id) || {};
      return Object.assign({}, def, {
        state: hit.state === 'priority' ? 'priority' : 'normal',
        manual: Boolean(hit.manual),
        manualState: hit.manualState === 'priority' ? 'priority' : 'normal'
      });
    });

    const readiness = {};
    READINESS_ITEMS.forEach((item) => {
      readiness[item.key] = raw.readiness && typeof raw.readiness[item.key] === 'boolean'
        ? raw.readiness[item.key]
        : item.key === 'traumaBay' || item.key === 'bloodBank';
    });

    const audit = Array.isArray(raw.audit)
      ? raw.audit.filter((item) => item && item.action).slice(0, MAX_AUDIT).map((item, i) => Object.assign({
        id: 'audit-restored-' + i + '-' + (item.ts || 0),
        ts: Number(item.ts) || now(),
        role: item.role || 'system',
        detail: item.detail || '',
        tone: item.tone || 'info'
      }, item))
      : [];

    const maxSequence = incidents.reduce((max, inc) => {
      const digits = parseInt(String(inc.id).replace(/\D/g, ''), 10);
      return Number.isFinite(digits) ? Math.max(max, digits) : max;
    }, 2401);

    return {
      version: 2,
      incidents,
      activeIncidentId: activeId,
      consent: {
        granted: !(raw.consent && raw.consent.granted === false),
        updatedAt: Number(raw.consent && raw.consent.updatedAt) || now()
      },
      signals,
      readiness,
      fallbacks: {
        networkOutage: Boolean(raw.fallbacks && raw.fallbacks.networkOutage),
        humanOverride: Boolean(raw.fallbacks && raw.fallbacks.humanOverride)
      },
      audit,
      settings: {
        speed: raw.settings && [1, 6, 12].indexOf(Number(raw.settings.speed)) !== -1 ? Number(raw.settings.speed) : 6
      },
      nextIncidentSeq: Number(raw.nextIncidentSeq) > 2401 ? Number(raw.nextIncidentSeq) : maxSequence + 1
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        const fresh = seedState();
        localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      return seedState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      /* Storage can be unavailable in private modes; the app still runs in memory. */
    }
  }

  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveState();
    }, 700);
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && ROLES[parsed.role]) return parsed;
    } catch (error) {
      /* ignore corrupted session */
    }
    return null;
  }

  function saveSession(role) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ role, since: now() }));
    } catch (error) { /* noop */ }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (error) { /* noop */ }
  }

  let state = loadState();
  let session = loadSession();
  let currentPage = 'dashboard';
  let confirmCallback = null;

  const sim = {
    running: false,
    speed: state.settings.speed,
    timer: null
  };

  let vitals = {
    base: Object.assign({}, TYPE_META.cardiac.profile),
    hr: 96,
    spo2: 94,
    bpSys: 132,
    bpDia: 86,
    resp: 21
  };

  let map = null;
  let mapLayers = null;
  let ambulanceMarker = null;
  let signalMarkers = {};
  let signalMarkerKeys = {};
  let ecgRaf = null;
  let ecgCtx = null;
  let ecgDpr = 1;

  function can(permission) {
    if (!session || !ROLES[session.role]) return false;
    return (PERMISSIONS[session.role] || []).indexOf(permission) !== -1;
  }

  function getActiveIncident() {
    if (!state.activeIncidentId) return null;
    return state.incidents.find((inc) => inc.id === state.activeIncidentId && (inc.status === 'active' || inc.status === 'arrived')) || null;
  }

  function isSignalGreen(signal) {
    return signal.manual ? signal.manualState === 'priority' : signal.state === 'priority';
  }

  function greenSignalCount() {
    return state.signals.filter(isSignalGreen).length;
  }

  function remainingSeconds(incident) {
    if (!incident) return 0;
    if (incident.status === 'arrived' || incident.progress >= 1) return 0;
    return Math.max(0, (1 - incident.progress) * (Number(incident.etaMinutes) || 7) * 60);
  }

  function readinessPercent() {
    const done = READINESS_ITEMS.filter((item) => state.readiness[item.key]).length;
    return Math.round((done / READINESS_ITEMS.length) * 100);
  }

  /* ————————————————————————————————————————————————
     Audit trail
     ———————————————————————————————————————————————— */
  function pushAudit(action, detail, tone) {
    state.audit.unshift({
      id: 'audit-' + now() + '-' + Math.random().toString(36).slice(2, 7),
      ts: now(),
      role: session ? session.role : 'system',
      action: action,
      detail: detail || '',
      tone: tone || 'info'
    });
    if (state.audit.length > MAX_AUDIT) state.audit.length = MAX_AUDIT;
    saveState();
    renderAudit();
  }

  function roleLabel(role) {
    return ROLES[role] ? ROLES[role].label : (role === 'system' ? 'System' : 'Unknown role');
  }

  function auditToneIcon(tone) {
    if (tone === 'green') return 'check';
    if (tone === 'amber') return 'alert';
    if (tone === 'rose') return 'siren';
    if (tone === 'privacy') return 'lock';
    return 'clipboard';
  }

  function renderAudit() {
    const count = state.audit.length;
    ['#auditCount', '#auditCountSide'].forEach((selector) => {
      const el = $(selector);
      if (el) el.textContent = String(count);
    });

    const stream = $('#eventStream');
    if (stream) {
      const latest = state.audit.slice(0, 5);
      stream.innerHTML = latest.length ? latest.map((item) => {
        const cls = item.tone === 'green' ? 'is-green' : item.tone === 'amber' ? 'is-amber' : (item.tone === 'rose' || item.tone === 'privacy') ? 'is-rose' : '';
        return '<div class="stream-item">' +
          '<span class="stream-icon ' + cls + '">' + icon(auditToneIcon(item.tone)) + '</span>' +
          '<div class="stream-copy"><p class="stream-title">' + escapeHtml(item.action) + '</p>' +
          '<p class="stream-meta">' + escapeHtml(roleLabel(item.role)) + ' · ' + escapeHtml(formatRelative(item.ts)) + (item.detail ? ' · ' + escapeHtml(item.detail) : '') + '</p></div></div>';
      }).join('') : '<div class="p-6 text-center text-[0.65rem] text-slate-600">No audited actions yet.</div>';
    }

    const list = $('#auditList');
    if (list) {
      list.innerHTML = state.audit.length ? state.audit.map((item) => {
        const dot = item.tone === 'green' ? 'green' : item.tone === 'amber' ? 'amber' : (item.tone === 'rose' || item.tone === 'privacy') ? 'rose' : '';
        return '<div class="audit-item"><span class="audit-dot ' + dot + ' mt-1.5"></span><div class="audit-copy">' +
          '<p class="audit-action">' + escapeHtml(item.action) + '</p>' +
          (item.detail ? '<p class="audit-detail">' + escapeHtml(item.detail) + '</p>' : '') +
          '<p class="audit-meta">' + escapeHtml(roleLabel(item.role)) + ' · ' + escapeHtml(formatRelative(item.ts)) + ' · ' + escapeHtml(new Date(item.ts).toLocaleString()) + '</p>' +
          '</div></div>';
      }).join('') : '<div class="px-3 py-8 text-center text-[0.65rem] text-slate-600">No audit events yet.</div>';
    }
  }

  /* ————————————————————————————————————————————————
     Navigation / session
     ———————————————————————————————————————————————— */
  function showLogin() {
    stopSimulation(false);
    stopEcg();
    const app = $('#appShell');
    const login = $('#loginScreen');
    if (app) app.classList.add('hidden');
    if (login) login.classList.remove('hidden');
    document.body.classList.remove('modal-open');
  }

  function enterApp(role, silent) {
    if (!ROLES[role]) return;
    session = { role: role, since: now() };
    saveSession(role);
    const login = $('#loginScreen');
    const app = $('#appShell');
    if (login) login.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    document.body.dataset.role = role;
    renderRoleUI();
    renderAll();
    setPage(role === 'hospital' ? 'hospital' : 'dashboard', true);
    window.scrollTo(0, 0);
    if (!silent) {
      pushAudit('Session opened', roleLabel(role) + ' authenticated through the demo role gate.', 'info');
      toast('Signed in as ' + ROLES[role].short + '.', 'info');
    }
    const incident = getActiveIncident();
    if (incident && incident.status === 'active') startSimulation();
  }

  function login(role, options) {
   enterApp(role, Boolean(options && options.silent));
  }

  function logout() {
    if (session) {
      pushAudit('Session ended', roleLabel(session.role) + ' signed out of the corridor.', 'info');
    }
    stopSimulation(false);
    clearSession();
    session = null;
    document.body.removeAttribute('data-role');
    showLogin();
    toast('Session locked. Choose a role to continue.', 'info');
  }

  function setPage(page, silent) {
    if (!PAGE_META[page]) page = 'dashboard';
    currentPage = page;
    $$('[data-page-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.getAttribute('data-page-panel') !== page);
    });
    $$('[data-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-page') === page);
    });
    const meta = PAGE_META[page];
    const kicker = $('#topbarKicker');
    const title = $('#topbarTitle');
    if (kicker) kicker.textContent = meta.kicker;
    if (title) title.textContent = meta.title;

    if (page === 'dashboard') {
      requestAnimationFrame(() => {
        initMap();
        if (map) setTimeout(() => map.invalidateSize(), 100);
        updateMapTelemetry();
      });
    }
    if (page === 'hospital') {
      requestAnimationFrame(() => {
        resizeEcg();
        syncEcg();
        renderHospital();
      });
    }
    if (page === 'overview') renderOverview();

    if (!silent) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function defaultPageForRole() {
    return session && session.role === 'hospital' ? 'hospital' : 'dashboard';
  }

  /* ————————————————————————————————————————————————
     Rendering — role & incident
     ———————————————————————————————————————————————— */
  function renderRoleUI() {
    if (!session || !ROLES[session.role]) return;
    const meta = ROLES[session.role];
    const sidebarRole = $('#sidebarRole');
    const topbarRole = $('#topbarRole');
    const topbarRoleLong = $('#topbarRoleLong');
    if (sidebarRole) sidebarRole.textContent = meta.label;
    if (topbarRole) topbarRole.textContent = meta.short;
    if (topbarRoleLong) topbarRoleLong.textContent = meta.label;
    const avatar = $('#topbarAvatar');
    const sideAvatar = $('#sidebarAvatar');
    if (avatar) avatar.innerHTML = icon(meta.icon);
    if (sideAvatar) sideAvatar.innerHTML = icon(meta.icon);
    const createBtn = $('#createIncidentBtn');
    if (createBtn) createBtn.classList.toggle('hidden', !can('incident:create'));
    const resolveBtn = $('#resolveIncidentBtn');
    if (resolveBtn) resolveBtn.classList.toggle('hidden', !can('incident:resolve'));
    const restartBtn = $('#restartRunBtn');
    if (restartBtn) restartBtn.disabled = !getActiveIncident();
  }

  function statusChip(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = 'chip ' + (cls || '');
  }

  function renderIncident() {
    const incident = getActiveIncident();
    const has = Boolean(incident);
    const green = greenSignalCount();
    const ready = readinessPercent();

    const statusChip = $('#incidentStatusChip');
    if (statusChip) {
      statusChip.className = 'chip ' + (has ? (incident.status === 'arrived' ? 'chip-green' : 'chip-rose') : '');
      statusChip.innerHTML = has
        ? '<span class="live-dot ' + (incident.status === 'arrived' ? '' : 'rose') + ' !h-1 !w-1"></span> ' + (incident.status === 'arrived' ? 'Arrived at hospital' : 'Active emergency')
        : 'Standby';
    }
    statusChip && statusChip.setAttribute('data-state', has ? incident.status : 'standby');

    const severity = $('#incidentSeverity');
    if (severity) severity.textContent = has ? (incident.severity || 'Critical') : 'Awaiting dispatch';

    const idChip = $('#incidentIdChip');
    if (idChip) idChip.textContent = has ? incident.id : '—';

    const type = $('#incidentType');
    if (type) type.textContent = has ? (TYPE_META[incident.type] || {}).label || 'Emergency response' : 'No active emergency';

    const route = $('#incidentRoute');
    if (route) route.textContent = has ? incident.pickup + ' → ' + incident.destination : 'Create an incident to launch the corridor simulation';

    const ambulance = $('#incidentAmbulance');
    if (ambulance) ambulance.textContent = has ? incident.ambulance : '—';

    const patient = $('#incidentPatient');
    if (patient) patient.textContent = has ? (state.consent.granted ? incident.condition : 'Consent withdrawn · clinical data masked') : 'No patient attached';

    const corridor = $('#incidentCorridor');
    if (corridor) corridor.textContent = has ? green + ' / 5 junctions green' : '5 connected junctions';

    const readiness = $('#incidentReadiness');
    if (readiness) readiness.textContent = has ? ready + '% ready · trauma bay' : '—';

    const eta = has ? formatDuration(remainingSeconds(incident)) : '--:--';
    const progress = has ? Math.round(incident.progress * 100) : 0;
    const distance = has ? ((1 - incident.progress) * (ROUTE_LENGTH / 1000)).toFixed(1) + ' km' : (ROUTE_LENGTH / 1000).toFixed(1) + ' km';

    const heroEta = $('#heroEta');
    if (heroEta) heroEta.textContent = eta;
    const bar = $('#heroProgressBar');
    if (bar) bar.style.width = progress + '%';
    const pct = $('#heroProgressPct');
    if (pct) pct.textContent = progress + '%';
    const dist = $('#heroDistance');
    if (dist) dist.textContent = distance;
    const speedChip = $('#simSpeedChip');
    if (speedChip) speedChip.textContent = sim.speed + '× sim';

    const mapSignalChip = $('#mapSignalChip');
    if (mapSignalChip) mapSignalChip.textContent = green + '/5 green';
    const navBadge = $('#navSignalBadge');
    if (navBadge) navBadge.textContent = String(green);
    const signalSummary = $('#signalSummaryChip');
    if (signalSummary) signalSummary.textContent = green + ' / 5 green';
    const mapEtaChip = $('#mapEtaChip');
    if (mapEtaChip) mapEtaChip.textContent = has ? (incident.status === 'arrived' ? 'Arrived' : 'ETA ' + eta) : 'ETA --:--';

    const sideType = $('#sidebarIncidentType');
    if (sideType) sideType.textContent = has ? (TYPE_META[incident.type] || {}).label || 'Emergency response' : 'Standby';
    const sideRoute = $('#sidebarIncidentRoute');
    if (sideRoute) sideRoute.textContent = has ? incident.pickup + ' → ' + (incident.destination || '').split(',')[0] : 'No active emergency';
    const sideId = $('#sidebarIncidentId');
    if (sideId) sideId.textContent = has ? incident.id : '—';
    const sideEta = $('#sidebarIncidentEta');
    if (sideEta) sideEta.textContent = has ? (incident.status === 'arrived' ? 'ARRIVED' : eta) : '--:--';

    const resolveBtn = $('#resolveIncidentBtn');
    if (resolveBtn) resolveBtn.disabled = !has || incident.status === 'resolved';

    renderEta();
    renderHospitalPatient();
  }

  function renderSignals() {
    const list = $('#signalList');
    if (!list) return;
    const editable = can('signal:override');
    list.innerHTML = state.signals.map((signal) => {
      const green = isSignalGreen(signal);
      const chipClass = signal.manual ? 'chip-amber' : green ? 'chip-green' : 'chip-rose';
      const label = signal.manual ? (green ? 'Manual green' : 'Manual hold') : green ? 'Priority' : 'Red / hold';
      return '<div class="signal-row ' + (green ? 'is-green ' : '') + (signal.manual ? 'is-manual' : '') + '" data-signal="' + escapeHtml(signal.id) + '">' +
        '<span class="signal-index">' + escapeHtml(signal.id.slice(-3)) + '</span>' +
        '<div class="signal-copy"><span class="signal-id">' + escapeHtml(signal.id) + '</span><span class="signal-name">' + escapeHtml(signal.name) + '</span></div>' +
        '<span class="signal-state"><span class="chip ' + chipClass + '">' + label + '</span></span>' +
        '<button type="button" class="sig-switch ' + (green ? 'is-on' : '') + '" role="switch" aria-checked="' + (green ? 'true' : 'false') + '" data-signal-toggle="' + escapeHtml(signal.id) + '" aria-label="Toggle ' + escapeHtml(signal.id) + ' priority"' + (editable ? '' : ' disabled') + '><span></span></button>' +
        (signal.manual && editable ? '<button type="button" class="mini-btn" data-signal-auto="' + escapeHtml(signal.id) + '" title="Return to automatic priority" aria-label="Return ' + escapeHtml(signal.id) + ' to auto">' + icon('rotate') + '</button>' : '') +
        '</div>';
    }).join('');
    updateSignalFooter();
  }

  function syncSignalDom() {
    state.signals.forEach((signal) => {
      const row = $('[data-signal="' + signal.id + '"]');
      if (!row) return;
      const green = isSignalGreen(signal);
      row.classList.toggle('is-green', green);
      row.classList.toggle('is-manual', signal.manual);
      const chip = $('.signal-state .chip', row);
      if (chip) {
        chip.className = 'chip ' + (signal.manual ? 'chip-amber' : green ? 'chip-green' : 'chip-rose');
        chip.textContent = signal.manual ? (green ? 'Manual green' : 'Manual hold') : green ? 'Priority' : 'Red / hold';
      }
      const toggle = $('[data-signal-toggle]', row);
      if (toggle) {
        toggle.classList.toggle('is-on', green);
        toggle.setAttribute('aria-checked', green ? 'true' : 'false');
      }
    });
    updateSignalFooter();
  }

  function updateSignalFooter() {
    const note = $('#signalModeNote');
    if (!note) return;
    if (state.fallbacks.humanOverride) {
      note.innerHTML = '<strong class="text-amber-300">Human override active.</strong> Automatic priority is suspended. An admin must switch each junction manually.';
    } else if (!can('signal:override')) {
      note.innerHTML = 'Read-only for your role. The Municipal Traffic Admin can override any junction.';
    } else {
      note.innerHTML = 'Auto priority grants a green wave as the ambulance enters the <span class="text-teal-300">400 m approach window</span>. Toggle a junction to override it; use <span class="font-mono">↻</span> to return to auto.';
    }
  }

  function renderSimControls() {
    const incident = getActiveIncident();
    const running = sim.running && incident && incident.status === 'active';
    const arrived = incident && incident.status === 'arrived';
    $$('[data-sim-label]').forEach((el, index) => {
      el.textContent = !incident || arrived ? (arrived ? 'Replay run' : 'Awaiting incident') : running ? (index === 0 ? 'Pause run' : 'Pause') : (index === 0 ? 'Resume run' : 'Resume');
    });
    $$('[data-sim-icon]').forEach((el) => {
      el.innerHTML = '<use href="#i-' + (running ? 'pause' : 'play') + '"></use>';
    });
    $$('[data-speed]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.getAttribute('data-speed')) === sim.speed);
    });
    const status = $('#simStatusPill');
    if (status) {
      status.className = 'status-pill ' + (running ? 'is-live' : arrived ? 'is-warn' : 'is-warn');
      status.innerHTML = '<span class="live-dot ' + (running ? '' : 'amber') + '"></span> ' + (running ? 'Running' : arrived ? 'Arrived' : incident ? 'Paused' : 'Standby');
    }
    const speedChip = $('#simSpeedChip');
    if (speedChip) speedChip.textContent = sim.speed + '× sim';
    const restart = $('#restartRunBtn');
    if (restart) restart.disabled = !incident;
  }

  function renderAll() {
    if (!session) return;
    renderRoleUI();
    renderIncident();
    renderSignals();
    renderSimControls();
    renderHospital();
    renderOverview();
    renderFallbacks();
    renderAudit();
    updateMapTelemetry();
    renderNetworkState();
  }

  /* ————————————————————————————————————————————————
     Rendering — fallbacks, network & overview
     ———————————————————————————————————————————————— */
  function setSwitch(el, on) {
    if (!el) return;
    el.classList.toggle('is-on', Boolean(on));
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function renderFallbacks() {
    const fallbacks = state.fallbacks;
    setSwitch($('#netOutageToggle'), fallbacks.networkOutage);
    setSwitch($('#humanOverrideToggle'), fallbacks.humanOverride);
    const netState = $('#netOutageState');
    if (netState) {
      netState.textContent = fallbacks.networkOutage ? 'Active' : 'Off';
      netState.className = 'chip !text-[0.48rem] ' + (fallbacks.networkOutage ? 'chip-amber' : 'chip-green');
    }
    const overrideState = $('#overrideState');
    if (overrideState) {
      overrideState.textContent = fallbacks.humanOverride ? 'Active' : 'Off';
      overrideState.className = 'chip !text-[0.48rem] ' + (fallbacks.humanOverride ? 'chip-amber' : 'chip-green');
    }
    const modeChip = $('#fallbackModeChip');
    if (modeChip) {
      const both = fallbacks.networkOutage && fallbacks.humanOverride;
      modeChip.textContent = both ? 'Full manual fallback' : fallbacks.networkOutage ? 'Offline fallback' : fallbacks.humanOverride ? 'Manual override' : 'All systems nominal';
      modeChip.className = 'chip ' + (fallbacks.networkOutage || fallbacks.humanOverride ? 'chip-amber' : 'chip-green');
    }
    const disable = !can('fallback:toggle');
    ['#netOutageToggle', '#humanOverrideToggle'].forEach((selector) => {
      const el = $(selector);
      if (el) el.disabled = disable;
    });
    const note = $('#fallbackPermissionNote');
    if (note) {
      note.textContent = disable
        ? 'Read-only for your role. Only the Municipal Traffic Admin can change fallback modes.'
        : 'Only the Municipal Traffic Admin can change fallback modes. Changes are written to the local audit log.';
    }
    renderNetworkState();
  }

  function renderNetworkState() {
    const outage = state.fallbacks.networkOutage;
    const pill = $('#networkPill');
    const text = $('#networkPillText');
    if (pill) {
      pill.className = 'status-pill ' + (outage ? 'is-warn' : 'is-live');
      const dot = pill.querySelector('.live-dot');
      if (dot) dot.classList.toggle('amber', outage);
    }
    if (text) text.textContent = outage ? 'Offline fallback' : 'Cloud link';

    const banner = $('#networkBanner');
    if (banner) banner.classList.toggle('hidden', !outage);
    const hospitalBanner = $('#hospitalNetworkBanner');
    if (hospitalBanner) hospitalBanner.classList.toggle('hidden', !outage);
    const overrideBanner = $('#overrideBanner');
    if (overrideBanner) overrideBanner.classList.toggle('hidden', !state.fallbacks.humanOverride);

    const mapMode = $('#mapModeChip');
    if (mapMode) {
      mapMode.innerHTML = '<span class="live-dot ' + (outage || state.fallbacks.humanOverride ? 'amber' : '') + ' !h-1 !w-1"></span> ' +
        (outage ? 'Offline · local edge' : state.fallbacks.humanOverride ? 'Manual override' : 'Auto priority');
    }
    const mapStatus = $('#mapStatusPill');
    if (mapStatus) {
      mapStatus.className = 'status-pill ' + (outage ? 'is-warn' : 'is-live');
      mapStatus.innerHTML = '<span class="live-dot ' + (outage ? 'amber' : '') + '"></span> ' + (outage ? 'Offline GPS' : 'Live GPS');
    }
    const linkPill = $('#hospitalLinkPill');
    if (linkPill) {
      linkPill.className = 'status-pill ' + (outage ? 'is-warn' : 'is-live');
      linkPill.innerHTML = '<span class="live-dot ' + (outage ? 'amber' : '') + '"></span> ' + (outage ? 'Radio / SMS fallback' : 'Linked to corridor');
    }
    updateSignalFooter();
  }

  function renderOverview() {
    const activeCount = state.incidents.filter((inc) => inc.status === 'active' || inc.status === 'arrived').length;
    const signalsEl = $('#ovSignalsGreen');
    if (signalsEl) signalsEl.textContent = String(greenSignalCount());
    const activeEl = $('#ovActiveIncidents');
    if (activeEl) activeEl.textContent = String(activeCount);
    const auditEl = $('#ovAuditCount');
    if (auditEl) auditEl.textContent = String(state.audit.length);
    renderFallbacks();
  }

  /* ————————————————————————————————————————————————
     Hospital, vitals & consent
     ———————————————————————————————————————————————— */
  function applyClinicalProfile(type) {
    const meta = TYPE_META[type] || TYPE_META.cardiac;
    vitals.base = Object.assign({}, meta.profile);
    vitals.hr = vitals.base.hr;
    vitals.spo2 = vitals.base.spo2;
    vitals.bpSys = vitals.base.bpSys;
    vitals.bpDia = vitals.base.bpDia;
    vitals.resp = vitals.base.resp;
  }

  function jitterVitals() {
    const b = vitals.base;
    vitals.hr = clamp(b.hr + randomInt(-3, 3), 42, 168);
    vitals.spo2 = clamp(b.spo2 + randomInt(-1, 1), 82, 100);
    vitals.bpSys = clamp(b.bpSys + randomInt(-3, 3), 78, 190);
    vitals.bpDia = clamp(b.bpDia + randomInt(-2, 2), 48, 120);
    vitals.resp = clamp(b.resp + randomInt(-1, 2), 10, 38);
  }

  function renderHospital() {
    renderHospitalPatient();
    renderConsent();
    renderEta();
    renderReadiness();
  }

  function renderHospitalPatient() {
    const incident = getActiveIncident();
    const patientId = $('#patientId');
    const patientCondition = $('#patientCondition');
    const patientTriage = $('#patientTriage');
    const patientRef = $('#patientIncidentRef');
    const consentChip = $('#patientConsentChip');

    if (incident) {
      const masked = !state.consent.granted;
      if (patientId) patientId.textContent = masked ? 'Patient identity masked' : (incident.patientLabel || 'Patient ' + incident.id);
      if (patientCondition) patientCondition.textContent = masked ? 'Clinical details are masked until consent is restored.' : (incident.condition || 'De-identified emergency patient en route.');
      if (patientTriage) {
        patientTriage.textContent = masked ? 'Privacy lock' : (incident.triage || ((TYPE_META[incident.type] || {}).triage || 'Acute · critical'));
        patientTriage.className = 'chip ' + (masked ? 'chip-amber' : incident.severity === 'Stable' ? 'chip-green' : incident.severity === 'Urgent' ? 'chip-amber' : 'chip-rose');
      }
      if (patientRef) patientRef.textContent = incident.id + ' · ' + incident.ambulance;
    } else {
      if (patientId) patientId.textContent = 'No patient attached';
      if (patientCondition) patientCondition.textContent = 'Awaiting an active transfer. Create an incident from the corridor to begin pre-arrival sync.';
      if (patientTriage) {
        patientTriage.textContent = 'Standby';
        patientTriage.className = 'chip';
      }
      if (patientRef) patientRef.textContent = '—';
    }

    if (consentChip) {
      consentChip.className = 'consent-state ' + (state.consent.granted ? 'ok' : 'off');
      consentChip.innerHTML = '<span class="live-dot ' + (state.consent.granted ? '' : 'amber') + ' !h-1 !w-1"></span> ' + (state.consent.granted ? 'Consent verified' : 'Consent withdrawn');
    }

    const patientCard = $('#patientCard');
    const vitalsGrid = $('#vitalsGrid');
    if (patientCard) patientCard.classList.toggle('is-masked', !state.consent.granted);
    if (vitalsGrid) vitalsGrid.classList.toggle('is-masked', !state.consent.granted);
    renderVitals();
  }

  function renderVitals() {
    const incident = getActiveIncident();
    const available = Boolean(incident) && state.consent.granted;
    const set = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };

    set('#hrValue', available ? String(vitals.hr) : '--');
    set('#spo2Value', available ? String(vitals.spo2) : '--');
    set('#bpValue', available ? vitals.bpSys + '/' + vitals.bpDia : '--/--');
    set('#respValue', available ? String(vitals.resp) : '--');

    if (!available) {
      setText('#hrTrend', state.consent.granted ? 'Standby' : 'Masked');
      setText('#hrZone', state.consent.granted ? '—' : 'Privacy');
      setText('#spo2Trend', state.consent.granted ? 'Standby' : 'Masked');
      setText('#spo2Zone', state.consent.granted ? '—' : 'Privacy');
      setText('#bpTrend', state.consent.granted ? 'Standby' : 'Masked');
      setText('#bpZone', state.consent.granted ? '—' : 'Privacy');
      setText('#respTrend', state.consent.granted ? 'Standby' : 'Masked');
      setText('#respZone', state.consent.granted ? '—' : 'Privacy');
      return;
    }

    setText('#hrTrend', vitals.hr > 105 ? 'Sinus tachycardia' : vitals.hr < 60 ? 'Bradycardic trend' : vitals.base.hrTrend);
    setText('#hrZone', vitals.hr > 105 ? 'Elevated' : 'Target');
    setText('#spo2Trend', vitals.base.spo2Trend);
    setText('#spo2Zone', vitals.spo2 < 92 ? 'Low' : 'Stable');
    setText('#bpTrend', 'MAP ' + Math.round((vitals.bpSys + 2 * vitals.bpDia) / 3));
    setText('#bpZone', vitals.bpSys < 100 ? 'Monitor' : 'Stable');
    setText('#respTrend', vitals.base.respTrend);
    setText('#respZone', vitals.resp > 26 ? 'Elevated' : 'Stable');
  }

  function renderConsent() {
    const granted = state.consent.granted;
    const toggle = $('#consentToggle');
    const stateEl = $('#consentState');
    const updated = $('#consentUpdated');
    const badge = $('#consentBadge');
    const note = $('#consentNote');
    const mask = $('#ecgMask');

    if (toggle) {
      toggle.classList.toggle('is-on', granted);
      toggle.setAttribute('aria-checked', granted ? 'true' : 'false');
      toggle.disabled = !can('consent:toggle');
      toggle.setAttribute('aria-label', granted ? 'Withdraw patient consent' : 'Grant patient consent');
    }
    if (stateEl) {
      stateEl.className = 'consent-state ' + (granted ? 'ok' : 'off');
      stateEl.innerHTML = '<span class="live-dot ' + (granted ? '' : 'amber') + ' !h-1 !w-1"></span> ' + (granted ? 'Consent granted' : 'Consent withdrawn');
    }
    if (updated) updated.textContent = (granted ? 'Verified ' : 'Withdrawn ') + formatRelative(state.consent.updatedAt);
    if (badge) {
      badge.textContent = granted ? 'Explicit' : 'Locked';
      badge.className = 'chip ' + (granted ? 'chip-amber' : 'chip-rose');
    }
    if (note) {
      if (!can('consent:toggle')) {
        note.textContent = 'Read-only for your role. Only hospital trauma staff or the traffic admin can change consent in this demo.';
      } else if (granted) {
        note.textContent = 'Consent covers live vitals and pre-arrival handover only. Withdrawing it immediately masks all patient-identifying and clinical values on this screen.';
      } else {
        note.textContent = 'Vitals are masked and the ECG feed is stopped. Restore consent to resume patient sync — the change is written to the audit trail.';
      }
    }
    if (mask) mask.classList.toggle('hidden', granted);
    syncEcg();
  }

  function renderEta() {
    const incident = getActiveIncident();
    const eta = $('#hospitalEta');
    const label = $('#hospitalEtaLabel');
    const bar = $('#hospitalProgressBar');
    const pct = $('#hospitalProgressPct');
    const distance = $('#hospitalDistance');
    const etaStatus = $('#etaStatusPill');
    const corridorChip = $('#hospitalCorridorChip');
    const incidentId = $('#hospitalIncidentId');
    const arrival = $('#hospitalArrivalWindow');

    if (!incident) {
      if (eta) eta.textContent = '--:--';
      if (label) label.textContent = 'No active transfer';
      if (bar) bar.style.width = '0%';
      if (pct) pct.textContent = '0%';
      if (distance) distance.textContent = (ROUTE_LENGTH / 1000).toFixed(1) + ' km';
      if (etaStatus) {
        etaStatus.className = 'status-pill is-warn';
        etaStatus.innerHTML = '<span class="live-dot amber"></span> Standby';
      }
      if (corridorChip) {
        corridorChip.textContent = 'Standby';
        corridorChip.className = 'chip';
      }
      if (incidentId) incidentId.textContent = '—';
      if (arrival) arrival.textContent = '--:--';
      return;
    }

    const progress = Math.round(incident.progress * 100);
    const remaining = remainingSeconds(incident);
    if (eta) eta.textContent = formatDuration(remaining);
    if (label) label.textContent = incident.status === 'arrived' ? 'Arrived · handover in progress' : incident.id + ' · ' + incident.ambulance;
    if (bar) bar.style.width = progress + '%';
    if (pct) pct.textContent = progress + '%';
    if (distance) distance.textContent = ((1 - incident.progress) * (ROUTE_LENGTH / 1000)).toFixed(1) + ' km';
    if (etaStatus) {
      etaStatus.className = 'status-pill ' + (incident.status === 'arrived' ? 'is-live' : 'is-live');
      etaStatus.innerHTML = '<span class="live-dot"></span> ' + (incident.status === 'arrived' ? 'Arrived' : 'Inbound');
    }
    if (corridorChip) {
      corridorChip.textContent = incident.status === 'arrived' ? 'Handover' : 'Inbound · priority';
      corridorChip.className = 'chip ' + (incident.status === 'arrived' ? 'chip-green' : 'chip-sky');
    }
    if (incidentId) incidentId.textContent = incident.id;
    if (arrival) arrival.textContent = incident.status === 'arrived' ? 'Now' : formatWindow(now() + remaining * 1000);
  }

  function renderReadiness() {
    const list = $('#readinessList');
    const percent = readinessPercent();
    const bar = $('#readinessBar');
    const pct = $('#readinessPct');
    const note = $('#readinessNote');
    const editable = can('readiness:toggle');
    if (bar) bar.style.width = percent + '%';
    if (pct) pct.textContent = percent + '%';
    if (note) {
      note.textContent = editable
        ? 'Toggling an item writes readiness state to localStorage and audits the update.'
        : 'Read-only for your role. Hospital trauma staff and admin can update the checklist.';
    }
    if (!list) return;
    list.innerHTML = READINESS_ITEMS.map((item) => {
      const done = Boolean(state.readiness[item.key]);
      return '<button type="button" class="readiness-item ' + (done ? 'is-done' : '') + '" data-readiness="' + item.key + '" aria-pressed="' + done + '"' + (editable ? '' : ' disabled') + '>' +
        '<span class="readiness-check">' + icon('check') + '</span>' +
        '<span class="min-w-0 flex-1"><span class="readiness-label">' + escapeHtml(item.label) + '</span><span class="readiness-detail">' + escapeHtml(item.detail) + '</span></span>' +
        '</button>';
    }).join('');
    const incidentReady = $('#incidentReadiness');
    if (incidentReady && getActiveIncident()) incidentReady.textContent = percent + '% ready · trauma bay';
  }

  /* ————————————————————————————————————————————————
     ECG monitor
     ———————————————————————————————————————————————— */
  function ecgWave(t, hr) {
    const beat = (t * hr) / 60;
    const p = beat - Math.floor(beat);
    const g = (x, center, width) => Math.exp(-((x - center) * (x - center)) / (2 * width * width));
    return (g(p, 0.12, 0.018) * 0.12) -
      (g(p, 0.19, 0.008) * 0.16) +
      (g(p, 0.205, 0.009) * 1.0) -
      (g(p, 0.225, 0.011) * 0.3) +
      (g(p, 0.42, 0.04) * 0.2);
  }

  function resizeEcg() {
    const canvas = $('#ecgCanvas');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ecgDpr = dpr;
    ecgCtx = canvas.getContext('2d');
    if (!ecgCtx) return false;
    ecgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function clearEcg() {
    const canvas = $('#ecgCanvas');
    if (!canvas || !ecgCtx) return;
    ecgCtx.clearRect(0, 0, canvas.width / ecgDpr, canvas.height / ecgDpr);
  }

  function drawFlatline() {
    const canvas = $('#ecgCanvas');
    if (!canvas) return;
    if (!resizeEcg()) return;
    const w = canvas.width / ecgDpr;
    const h = canvas.height / ecgDpr;
    ecgCtx.clearRect(0, 0, w, h);
    ecgCtx.beginPath();
    ecgCtx.moveTo(0, h * 0.58);
    ecgCtx.lineTo(w, h * 0.58);
    ecgCtx.strokeStyle = 'rgba(52, 211, 153, 0.22)';
    ecgCtx.lineWidth = 1.4;
    ecgCtx.stroke();
  }

  function drawEcg(timestamp) {
    const canvas = $('#ecgCanvas');
    if (!canvas || !ecgCtx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    ecgCtx.clearRect(0, 0, w, h);
    const scroll = timestamp / 1000;
    const windowSeconds = 4.4;
    ecgCtx.beginPath();
    for (let x = 0; x <= w; x += 1.5) {
      const sampleTime = scroll + (x / w) * windowSeconds;
      const value = ecgWave(sampleTime, vitals.hr);
      const y = h * 0.58 - value * h * 0.36;
      if (x === 0) ecgCtx.moveTo(x, y);
      else ecgCtx.lineTo(x, y);
    }
    ecgCtx.strokeStyle = '#34d399';
    ecgCtx.lineWidth = 1.8;
    ecgCtx.lineJoin = 'round';
    ecgCtx.shadowColor = 'rgba(52, 211, 153, 0.85)';
    ecgCtx.shadowBlur = 10;
    ecgCtx.stroke();
    ecgCtx.shadowBlur = 0;

    const sweepX = ((scroll / windowSeconds) % 1) * w;
    const gradient = ecgCtx.createLinearGradient(sweepX - 30, 0, sweepX, 0);
    gradient.addColorStop(0, 'rgba(94, 234, 212, 0)');
    gradient.addColorStop(1, 'rgba(94, 234, 212, 0.48)');
    ecgCtx.fillStyle = gradient;
    ecgCtx.fillRect(Math.max(0, sweepX - 30), 0, Math.min(30, sweepX), h);
    ecgCtx.fillStyle = 'rgba(94, 234, 212, 0.85)';
    ecgCtx.fillRect(sweepX, 0, 1.2, h);
  }

  function startEcg() {
    if (ecgRaf) return;
    if (!state.consent.granted || currentPage !== 'hospital' || !getActiveIncident()) return;
    if (!resizeEcg()) return;
    let lastDraw = 0;
    const loop = (ts) => {
      if (!state.consent.granted || currentPage !== 'hospital' || !getActiveIncident()) {
        ecgRaf = null;
        return;
      }
      if (ts - lastDraw >= 33) {
        drawEcg(ts);
        lastDraw = ts;
      }
      ecgRaf = requestAnimationFrame(loop);
    };
    ecgRaf = requestAnimationFrame(loop);
  }

  function stopEcg(clear) {
    if (ecgRaf) cancelAnimationFrame(ecgRaf);
    ecgRaf = null;
    if (clear) clearEcg();
  }

  function setEcgStatus(text, tone) {
    const status = $('#ecgStatus');
    if (!status) return;
    status.className = 'status-pill ' + (tone === 'warn' ? 'is-warn' : tone === 'danger' ? 'is-danger' : tone === 'idle' ? '' : 'is-live');
    status.innerHTML = '<span class="live-dot ' + (tone === 'warn' || tone === 'danger' ? 'amber' : tone === 'idle' ? '' : '') + '"></span> ' + text;
  }

  function syncEcg() {
    const incident = getActiveIncident();
    if (!state.consent.granted) {
      stopEcg(false);
      clearEcg();
      setEcgStatus('Privacy lock', 'danger');
      return;
    }
    const mask = $('#ecgMask');
    if (mask) mask.classList.add('hidden');
    if (!incident) {
      stopEcg(false);
      drawFlatline();
      setEcgStatus('Standby', 'idle');
      return;
    }
    if (currentPage !== 'hospital') {
      stopEcg(false);
      return;
    }
    startEcg();
    setEcgStatus(incident.status === 'arrived' ? 'Arrived · monitor live' : 'Waveform live', 'live');
  }

  /* ————————————————————————————————————————————————
     Leaflet corridor map
     ———————————————————————————————————————————————— */
  function showMapFallback(message) {
    const fallback = $('#mapFallback');
    if (!fallback) return;
    fallback.innerHTML = '<div>' + icon('wifi-off', 'icon icon-lg mx-auto text-amber-300') +
      '<p class="mt-2 text-sm font-semibold">' + escapeHtml(message || 'Map tiles unavailable') + '</p>' +
      '<p class="mt-1 text-xs text-slate-500">Corridor logic continues on local state. Reconnect to restore the street map.</p></div>';
    fallback.classList.add('is-visible');
  }

  function makeSignalIcon(signal) {
    const green = isSignalGreen(signal);
    const classes = 'signal-pin' + (green ? ' priority' : '') + (signal.manual ? ' manual' : '');
    return window.L.divIcon({
      className: '',
      html: '<div class="' + classes + '"><span class="signal-pin__ring"></span><span class="signal-pin__core">' + escapeHtml(signal.id.slice(-3)) + '</span></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -17]
    });
  }

  function makeAmbulanceIcon() {
    return window.L.divIcon({
      className: '',
      html: '<div class="ambulance-pin"><span class="ambulance-pin__pulse"></span><span class="ambulance-pin__core">' + icon('ambulance') + '</span></div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });
  }

  function signalPopup(signal) {
    const green = isSignalGreen(signal);
    return '<div><p style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6f849e">' + escapeHtml(signal.id) + '</p>' +
      '<p style="margin-top:3px;font-weight:700;color:#e8eefb">' + escapeHtml(signal.name) + '</p>' +
      '<p style="margin-top:4px;color:' + (green ? '#6ee7b7' : signal.manual ? '#fcd34d' : '#fda4af') + '">' +
      (signal.manual ? (green ? 'Manual priority · override engaged' : 'Manual hold · override engaged') : green ? 'Automatic priority green' : 'Red / normal operation') + '</p></div>';
  }

  function initMap() {
    if (map) return;
    const host = $('#corridorMap');
    if (!host) return;
    if (!window.L) {
      showMapFallback('Leaflet could not load');
      return;
    }
    try {
      map = window.L.map(host, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 11,
        maxZoom: 18,
        preferCanvas: true
      });
      map.zoomControl.setPosition('topright');
      const tiles = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Esri, DeLorme, NAVTEQ'
      });
      tiles.addTo(map);
      window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.9
      }).addTo(map);

      const latlngs = ROUTE.map((p) => [p[0], p[1]]);
      window.L.polyline(latlngs, { color: '#0f766e', weight: 10, opacity: 0.24, lineCap: 'round' }).addTo(map);
      window.L.polyline(latlngs, { color: '#2dd4bf', weight: 3, opacity: 0.82, lineCap: 'round', className: 'route-line-glow' }).addTo(map);
      const completed = window.L.polyline([], { color: '#a7f3d0', weight: 4.5, opacity: 0.95, lineCap: 'round' }).addTo(map);
      mapLayers = { completed: completed };

      const endpointIcon = (label, destination) => window.L.divIcon({
        className: '',
        html: '<div class="map-endpoint' + (destination ? ' destination' : '') + '">' + label + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -13]
      });
      window.L.marker(ROUTE[0], { icon: endpointIcon('GN'), keyboard: false, zIndexOffset: 300 })
        .addTo(map)
        .bindPopup('<div><p style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6f849e">Corridor start</p><p style="margin-top:3px;font-weight:700">GNDEC Main Gate</p><p style="margin-top:3px;color:#7dd3fc">Pickup · Gill Road</p></div>');
      window.L.marker(ROUTE[ROUTE.length - 1], { icon: endpointIcon('DM', true), keyboard: false, zIndexOffset: 300 })
        .addTo(map)
        .bindPopup('<div><p style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6f849e">Corridor destination</p><p style="margin-top:3px;font-weight:700">DMC &amp; Hospital</p><p style="margin-top:3px;color:#5eead4">Trauma bay · Tagore Nagar</p></div>');

      state.signals.forEach((signal) => {
        const marker = window.L.marker([signal.lat, signal.lng], {
          icon: makeSignalIcon(signal),
          keyboard: false,
          zIndexOffset: 500
        }).addTo(map);
        marker.bindPopup(function () { return signalPopup(signal); });
        signalMarkers[signal.id] = marker;
        signalMarkerKeys[signal.id] = isSignalGreen(signal) + '-' + signal.manual;
      });

      map.fitBounds(latlngs, { padding: [28, 28] });
      updateMapTelemetry();
    } catch (error) {
      showMapFallback('Map could not initialise');
    }
  }

  function updateMapTelemetry() {
    if (!map || !window.L) return;
    const incident = getActiveIncident();
    if (mapLayers && mapLayers.completed) {
      mapLayers.completed.setLatLngs(incident ? routeTo(incident.progress) : []);
    }
    if (incident) {
      const point = pointAt(incident.progress);
      if (!ambulanceMarker) {
        ambulanceMarker = window.L.marker(point, { icon: makeAmbulanceIcon(), keyboard: false, zIndexOffset: 900 }).addTo(map);
      } else {
        ambulanceMarker.setLatLng(point);
      }
    } else if (ambulanceMarker) {
      map.removeLayer(ambulanceMarker);
      ambulanceMarker = null;
    }

    state.signals.forEach((signal) => {
      const marker = signalMarkers[signal.id];
      if (!marker) return;
      const key = isSignalGreen(signal) + '-' + signal.manual;
      if (signalMarkerKeys[signal.id] !== key) {
        marker.setIcon(makeSignalIcon(signal));
        signalMarkerKeys[signal.id] = key;
      }
    });

    const mapSignalChip = $('#mapSignalChip');
    if (mapSignalChip) mapSignalChip.textContent = greenSignalCount() + '/5 green';
  }

  /* ————————————————————————————————————————————————
     Corridor simulation
     ———————————————————————————————————————————————— */
  function refreshAutoSignals() {
    const incident = getActiveIncident();
    let changed = false;
    state.signals.forEach((signal) => {
      if (signal.manual) return;
      let next = 'normal';
      if (incident && incident.status === 'active' && !state.fallbacks.humanOverride) {
        const approach = 0.14;
        const pass = 0.035;
        if (incident.progress >= signal.route - approach && incident.progress <= signal.route + pass) {
          next = 'priority';
        }
      }
      if (signal.state !== next) {
        signal.state = next;
        changed = true;
      }
    });
    if (changed) {
      scheduleSave();
      syncSignalDom();
      updateMapTelemetry();
      renderIncident();
      renderOverview();
    }
    return changed;
  }

  function simulationTick() {
    if (!sim.running) return;
    const incident = getActiveIncident();
    if (!incident || incident.status !== 'active') {
      stopSimulation(false);
      return;
    }

    const perSecond = sim.speed / Math.max(30, incident.etaMinutes * 60);
    incident.progress = Math.min(1, incident.progress + perSecond);

    if (incident.progress >= 1) {
      incident.progress = 1;
      incident.status = 'arrived';
      incident.arrivedAt = now();
      sim.running = false;
      if (sim.timer) clearInterval(sim.timer);
      sim.timer = null;
      state.signals.forEach((signal) => {
        if (!signal.manual) signal.state = 'normal';
      });
      saveState();
      pushAudit('Ambulance arrived at DMC', incident.id + ' · corridor handover started.', 'green');
      toast('Ambulance arrived. Trauma team handover is live.', 'green');
      renderAll();
      updateMapTelemetry();
      if (currentPage === 'hospital') syncEcg();
      return;
    }

    refreshAutoSignals();
    renderIncident();
    updateMapTelemetry();
    renderSimControls();
    scheduleSave();
  }

  function startSimulation() {
    const incident = getActiveIncident();
    if (!incident || incident.status !== 'active') {
      renderSimControls();
      return;
    }
    if (sim.running) return;
    sim.running = true;
    if (sim.timer) clearInterval(sim.timer);
    sim.timer = setInterval(simulationTick, 1000);
    renderSimControls();
  }

  function stopSimulation(save) {
    sim.running = false;
    if (sim.timer) clearInterval(sim.timer);
    sim.timer = null;
    if (save !== false) saveState();
    renderSimControls();
  }

  function toggleSimulation() {
    const incident = getActiveIncident();
    if (!incident) {
      if (can('incident:create')) {
        openIncidentModal();
      } else {
        toast('No active incident to simulate. Ask dispatch to create one.', 'amber');
      }
      return;
    }
    if (incident.status === 'arrived') {
      restartRun();
      return;
    }
    if (sim.running) {
      stopSimulation(true);
      toast('Simulation paused. Corridor state is preserved.', 'info');
    } else {
      startSimulation();
      toast('Simulation resumed at ' + sim.speed + '× speed.', 'green');
    }
  }

  function setSpeed(speed) {
    const next = Number(speed);
    if ([1, 6, 12].indexOf(next) === -1) return;
    sim.speed = next;
    state.settings.speed = next;
    saveState();
    renderSimControls();
    renderIncident();
  }

  function restartRun() {
    const incident = getActiveIncident();
    if (!incident) {
      toast('There is no active incident to restart.', 'amber');
      return;
    }
    if (!can('incident:create') && !can('signal:override')) {
      toast('Your role cannot restart the corridor run.', 'amber');
      return;
    }
    stopSimulation(false);
    incident.progress = 0.01;
    incident.status = 'active';
    incident.arrivedAt = null;
    incident.startedAt = now();
    state.signals.forEach((signal) => {
      if (!signal.manual) signal.state = 'normal';
    });
    saveState();
    pushAudit('Corridor run restarted', incident.id + ' · ambulance returned to the pickup point.', 'amber');
    refreshAutoSignals();
    renderAll();
    updateMapTelemetry();
    startSimulation();
    toast('Corridor run restarted from the pickup point.', 'green');
  }

  /* ————————————————————————————————————————————————
     Incident actions
     ———————————————————————————————————————————————— */
  function openIncidentModal() {
    if (!can('incident:create')) {
      toast('Only dispatch and EMT roles can create an emergency.', 'amber');
      return;
    }
    const form = $('#incidentForm');
    if (form) form.reset();
    const setValue = (id, value) => {
      const el = $(id);
      if (el) el.value = value;
    };
    setValue('#incidentTypeInput', 'cardiac');
    setValue('#severityInput', 'Critical');
    setValue('#pickupInput', 'GNDEC Main Gate, Gill Road');
    setValue('#destinationInput', 'DMC & Hospital, Tagore Nagar');
    setValue('#ambulanceInput', 'AMB-17 · ALS');
    setValue('#etaInput', '7');
    setValue('#conditionInput', 'Cardiac · male 54 · chest pain, diaphoresis');
    openDialog('incidentModal');
  }

  function handleIncidentSubmit(event) {
    event.preventDefault();
    if (!can('incident:create')) {
      toast('Your role cannot launch an incident.', 'amber');
      return;
    }
    const type = $('#incidentTypeInput') ? $('#incidentTypeInput').value : 'cardiac';
    const severity = $('#severityInput') ? $('#severityInput').value : 'Critical';
    const pickup = $('#pickupInput') ? $('#pickupInput').value.trim() : '';
    const destination = $('#destinationInput') ? $('#destinationInput').value : 'DMC & Hospital, Tagore Nagar';
    const ambulance = $('#ambulanceInput') ? $('#ambulanceInput').value.trim() : '';
    const etaMinutes = clamp(Number($('#etaInput') ? $('#etaInput').value : 7) || 7, 3, 20);
    const condition = $('#conditionInput') ? $('#conditionInput').value.trim() : '';
    if (!pickup || !ambulance || !condition) {
      toast('Pickup, ambulance and clinical note are required.', 'amber');
      return;
    }

    state.incidents.forEach((inc) => {
      if (inc.status === 'active' || inc.status === 'arrived') {
        inc.status = 'superseded';
        inc.closedAt = now();
      }
    });

    const id = 'INC-' + state.nextIncidentSeq;
    state.nextIncidentSeq += 1;
    const meta = TYPE_META[type] || TYPE_META.cardiac;
    const incident = {
      id: id,
      type: type,
      severity: severity,
      pickup: pickup,
      destination: destination,
      ambulance: ambulance,
      etaMinutes: etaMinutes,
      condition: condition,
      patientLabel: 'Patient A-' + id.slice(-4) + ' · de-identified',
      triage: meta.triage,
      status: 'active',
      progress: 0.01,
      createdAt: now(),
      startedAt: now(),
      arrivedAt: null,
      closedAt: null
    };

    state.incidents.unshift(incident);
    if (state.incidents.length > MAX_INCIDENTS) state.incidents.length = MAX_INCIDENTS;
    state.activeIncidentId = incident.id;
    state.signals.forEach((signal) => {
      signal.state = 'normal';
      signal.manual = false;
      signal.manualState = 'normal';
    });
    state.consent = { granted: false, updatedAt: now() };
    state.settings.speed = 6;
    sim.speed = 6;
    applyClinicalProfile(type);
    saveState();

    stopSimulation(false);
    closeDialog('incidentModal');
    pushAudit('Emergency corridor launched', id + ' · ' + pickup + ' → ' + destination + ' · ' + ambulance, 'rose');
    pushAudit('Patient consent required', 'New patient attached; vitals stay masked until trauma staff verify consent.', 'privacy');
    renderAll();
    setPage('dashboard');
    startSimulation();
    toast('Corridor launched for ' + id + '. Five junctions are re-arming.', 'green');
  }

  function resolveActiveIncident() {
    const incident = getActiveIncident();
    if (!incident) {
      toast('There is no active transfer to complete.', 'amber');
      return;
    }
    if (!can('incident:resolve')) {
      toast('Only the traffic admin can close the corridor.', 'amber');
      return;
    }
    openConfirm(
      'Complete this transfer?',
      'This closes ' + incident.id + ', returns all junctions to normal operation, and keeps the record in the local audit trail.',
      'Complete transfer',
      function () {
        stopSimulation(false);
        incident.status = 'resolved';
        incident.closedAt = now();
        state.activeIncidentId = null;
        state.signals.forEach((signal) => {
          signal.state = 'normal';
          signal.manual = false;
          signal.manualState = 'normal';
        });
        saveState();
        pushAudit('Transfer completed', incident.id + ' · corridor returned to normal operation.', 'green');
        renderAll();
        updateMapTelemetry();
        syncEcg();
        toast('Transfer closed. Corridor is back to normal operation.', 'green');
      }
    );
  }

  function toggleSignal(signalId, returnToAuto) {
    if (!can('signal:override')) {
      toast('Manual signal control is restricted to the Municipal Traffic Admin.', 'amber');
      return;
    }
    const signal = state.signals.find((item) => item.id === signalId);
    if (!signal) return;

    if (returnToAuto) {
      signal.manual = false;
      signal.manualState = 'normal';
      signal.state = 'normal';
      refreshAutoSignals();
      pushAudit('Signal returned to automatic priority', signal.id + ' · ' + signal.name, 'green');
      toast(signal.id + ' returned to automatic priority.', 'green');
    } else {
      const currentlyGreen = isSignalGreen(signal);
      signal.manual = true;
      signal.manualState = currentlyGreen ? 'normal' : 'priority';
      pushAudit(
        'Manual signal override',
        signal.id + ' · ' + signal.name + ' set to ' + (currentlyGreen ? 'hold' : 'priority green') + '.',
        currentlyGreen ? 'rose' : 'green'
      );
      toast(signal.id + ' manually set to ' + (currentlyGreen ? 'HOLD' : 'PRIORITY GREEN') + '.', currentlyGreen ? 'amber' : 'green');
    }
    saveState();
    renderSignals();
    renderIncident();
    updateMapTelemetry();
    renderOverview();
    renderFallbacks();
  }

  /* ————————————————————————————————————————————————
     Hospital actions
     ———————————————————————————————————————————————— */
  function toggleConsent() {
    if (!can('consent:toggle')) {
      toast('Consent can only be changed by hospital trauma staff or the traffic admin.', 'amber');
      return;
    }
    state.consent.granted = !state.consent.granted;
    state.consent.updatedAt = now();
    saveState();
    pushAudit(
      state.consent.granted ? 'Patient consent granted' : 'Patient consent withdrawn',
      state.consent.granted ? 'Vitals, ECG and pre-arrival handover re-enabled.' : 'Vitals and ECG immediately masked for privacy.',
      state.consent.granted ? 'green' : 'privacy'
    );
    renderHospitalPatient();
    renderConsent();
    renderIncident();
    toast(
      state.consent.granted ? 'Consent restored. Vitals are live again.' : 'Consent withdrawn. All vitals are now masked.',
      state.consent.granted ? 'green' : 'amber'
    );
  }

  function toggleReadiness(key) {
    if (!can('readiness:toggle')) {
      toast('Readiness editing is restricted to trauma staff and admin.', 'amber');
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(state.readiness, key)) return;
    state.readiness[key] = !state.readiness[key];
    const item = READINESS_ITEMS.find((entry) => entry.key === key);
    const percent = readinessPercent();
    saveState();
    pushAudit(
      'Readiness updated',
      (item ? item.label : key) + ' · ' + (state.readiness[key] ? 'marked ready' : 'marked not ready') + ' · ' + percent + '% complete.',
      state.readiness[key] ? 'green' : 'amber'
    );
    renderReadiness();
    renderIncident();
    renderOverview();
    if (percent === 100) toast('Trauma bay readiness is now 100%. Handover team is fully prepared.', 'green');
  }

  function toggleFallback(key) {
    if (!can('fallback:toggle')) {
      toast('Fallback modes are restricted to the Municipal Traffic Admin.', 'amber');
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(state.fallbacks, key)) return;
    state.fallbacks[key] = !state.fallbacks[key];
    saveState();
    if (key === 'humanOverride') {
      refreshAutoSignals();
      pushAudit(
        'Human override ' + (state.fallbacks.humanOverride ? 'engaged' : 'released'),
        state.fallbacks.humanOverride ? 'Automatic pre-emption suspended; manual signal control only.' : 'Automatic approach-aware signal priority restored.',
        state.fallbacks.humanOverride ? 'amber' : 'green'
      );
      toast(state.fallbacks.humanOverride ? 'Human override engaged. Automatic priority is suspended.' : 'Human override released. Automatic priority restored.', state.fallbacks.humanOverride ? 'amber' : 'green');
    } else {
      pushAudit(
        'Network outage fallback ' + (state.fallbacks.networkOutage ? 'engaged' : 'released'),
        state.fallbacks.networkOutage ? 'Cloud link marked offline; local edge logic and radio/SMS handover active.' : 'Cloud link restored; live corridor telemetry resumed.',
        state.fallbacks.networkOutage ? 'amber' : 'green'
      );
      toast(state.fallbacks.networkOutage ? 'Offline fallback active. Local edge logic is holding the corridor.' : 'Cloud link restored.', state.fallbacks.networkOutage ? 'amber' : 'green');
    }
    renderFallbacks();
    renderSignals();
    renderIncident();
    renderOverview();
  }

  /* ————————————————————————————————————————————————
     Demo helpers and audit drawer
     ———————————————————————————————————————————————— */
  function ensureDemoCorridor() {
    if (getActiveIncident()) return;
    const id = 'INC-' + state.nextIncidentSeq;
    state.nextIncidentSeq += 1;
    const stamp = now();
    const incident = {
      id: id,
      type: 'cardiac',
      severity: 'Critical',
      pickup: 'GNDEC Main Gate, Gill Road',
      destination: 'DMC & Hospital, Tagore Nagar',
      ambulance: 'AMB-17 · ALS',
      etaMinutes: 7,
      condition: 'Cardiac · male 54 · chest pain, diaphoresis',
      patientLabel: 'Patient A-' + id.slice(-4) + ' · de-identified',
      triage: 'STEMI · critical',
      status: 'active',
      progress: 0.04,
      createdAt: stamp,
      startedAt: stamp,
      arrivedAt: null,
      closedAt: null
    };
    state.incidents.unshift(incident);
    if (state.incidents.length > MAX_INCIDENTS) state.incidents.length = MAX_INCIDENTS;
    state.activeIncidentId = id;
    state.consent = { granted: true, updatedAt: stamp };
    state.settings.speed = 6;
    sim.speed = 6;
    state.signals.forEach((signal) => {
      signal.state = 'normal';
      signal.manual = false;
      signal.manualState = 'normal';
    });
    applyClinicalProfile('cardiac');
    saveState();
    pushAudit('Demo corridor armed', id + ' · GNDEC → DMC · AMB-17 ALS.', 'green');
  }

  function handleDemoLogin() {
    ensureDemoCorridor();
    login('admin');
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
    refreshBodyLock();
    const focusTarget = dialog.querySelector('button, input, select, textarea, [href]');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 40);
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    if (id === 'confirmModal') confirmCallback = null;
    refreshBodyLock();
  }

  function refreshBodyLock() {
    const open = $$('.modal:not(.hidden), .drawer:not(.hidden)').length;
    document.body.classList.toggle('modal-open', open > 0);
  }

  function openAudit() {
    renderAudit();
    openDialog('auditDrawer');
  }

  function openConfirm(title, text, label, callback) {
    const titleEl = $('#confirmTitle');
    const textEl = $('#confirmText');
    const ok = $('#confirmOkBtn');
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (ok) ok.textContent = label || 'Confirm';
    confirmCallback = callback;
    openDialog('confirmModal');
  }

  function handleConfirm() {
    const callback = confirmCallback;
    confirmCallback = null;
    closeDialog('confirmModal');
    if (typeof callback === 'function') callback();
  }

  function exportAudit() {
    const payload = {
      project: 'PulseRoute — AI Emergency Response Corridor',
      team: 'Team Brain Bytes · GNDEC',
      exportedAt: new Date().toISOString(),
      exportedBy: session ? session.role : 'unknown',
      locale: navigator.language,
      audit: state.audit
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pulseroute-audit-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Audit trail exported as JSON.', 'green');
    } catch (error) {
      toast('Export failed in this browser.', 'amber');
    }
  }

  function resetDemo() {
    openConfirm(
      'Reset the entire demo?',
      'This clears incidents, signal overrides, consent state, readiness, fallback modes, the audit trail and the saved role from this browser. The page will reload with a fresh corridor.',
      'Reset demo',
      function () {
        try {
          localStorage.removeItem(STORE_KEY);
          localStorage.removeItem(SESSION_KEY);
        } catch (error) { /* noop */ }
        window.location.reload();
      }
    );
  }

  /* ————————————————————————————————————————————————
     Toasts, clock & misc UI
     ———————————————————————————————————————————————— */
  function toast(message, tone) {
    const stack = $('#toastStack');
    if (!stack) return;
    while (stack.children.length >= 4) stack.removeChild(stack.firstElementChild);
    const el = document.createElement('div');
    el.className = 'toast' + (tone === 'amber' ? ' is-amber' : tone === 'rose' ? ' is-rose' : '');
    const iconName = tone === 'amber' ? 'alert' : tone === 'rose' ? 'siren' : tone === 'green' ? 'check' : 'clipboard';
    el.innerHTML = icon(iconName) + '<div class="min-w-0 flex-1">' + escapeHtml(message) + '</div>';
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity .22s ease, transform .22s ease';
      setTimeout(() => el.remove(), 240);
    }, 4200);
  }

  function tickClock() {
    const clock = $('#liveClock');
    if (!clock) return;
    clock.textContent = formatClock(now());
    clock.title = new Date().toLocaleString();
    if (currentPage === 'hospital') {
      const consentUpdated = $('#consentUpdated');
      if (consentUpdated) {
        consentUpdated.textContent = (state.consent.granted ? 'Verified ' : 'Withdrawn ') + formatRelative(state.consent.updatedAt);
      }
    }
  }

  function updateVitalsLoop() {
    if (!state.consent.granted || !getActiveIncident()) return;
    jitterVitals();
    if (currentPage === 'hospital') renderVitals();
  }

  /* ————————————————————————————————————————————————
     Events
     ———————————————————————————————————————————————— */
  function handleDelegatedClick(event) {
    const pageBtn = event.target.closest('[data-page]');
    if (pageBtn) {
      event.preventDefault();
      setPage(pageBtn.getAttribute('data-page'));
      return;
    }

    const pageLink = event.target.closest('[data-page-link]');
    if (pageLink) {
      event.preventDefault();
      setPage(pageLink.getAttribute('data-page-link'));
      return;
    }

    const closer = event.target.closest('[data-close]');
    if (closer) {
      event.preventDefault();
      closeDialog(closer.getAttribute('data-close'));
      return;
    }

    const simToggle = event.target.closest('[data-sim-toggle]');
    if (simToggle) {
      event.preventDefault();
      toggleSimulation();
      return;
    }

    const speedBtn = event.target.closest('[data-speed]');
    if (speedBtn) {
      event.preventDefault();
      setSpeed(speedBtn.getAttribute('data-speed'));
      return;
    }

    const signalToggle = event.target.closest('[data-signal-toggle]');
    if (signalToggle) {
      event.preventDefault();
      toggleSignal(signalToggle.getAttribute('data-signal-toggle'), false);
      return;
    }

    const signalAuto = event.target.closest('[data-signal-auto]');
    if (signalAuto) {
      event.preventDefault();
      toggleSignal(signalAuto.getAttribute('data-signal-auto'), true);
      return;
    }

    const readiness = event.target.closest('[data-readiness]');
    if (readiness) {
      event.preventDefault();
      toggleReadiness(readiness.getAttribute('data-readiness'));
    }
  }

  function on(selector, eventName, handler) {
    const el = $(selector);
    if (el) el.addEventListener(eventName, handler);
  }

  function bindEvents() {
    $$('#loginScreen [data-role]').forEach((button) => {
      button.addEventListener('click', () => login(button.getAttribute('data-role')));
    });
    on('#demoLoginBtn', 'click', handleDemoLogin);
    on('#incidentForm', 'submit', handleIncidentSubmit);
    on('#createIncidentBtn', 'click', openIncidentModal);
    on('#resolveIncidentBtn', 'click', resolveActiveIncident);
    on('#restartRunBtn', 'click', restartRun);
    on('#consentToggle', 'click', toggleConsent);
    on('#netOutageToggle', 'click', () => toggleFallback('networkOutage'));
    on('#humanOverrideToggle', 'click', () => toggleFallback('humanOverride'));
    on('#auditBtnTop', 'click', openAudit);
    on('#auditBtnSide', 'click', openAudit);
    on('#auditBtnStream', 'click', openAudit);
    on('#auditExportBtn', 'click', exportAudit);
    on('#logoutBtnTop', 'click', logout);
    on('#logoutBtnSide', 'click', logout);
    on('#resetDemoBtn', 'click', resetDemo);
    on('#confirmOkBtn', 'click', handleConfirm);
    on('#confirmCancelBtn', 'click', function () {
      confirmCallback = null;
      closeDialog('confirmModal');
    });

    document.addEventListener('click', handleDelegatedClick);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        const open = $('.drawer:not(.hidden), .modal:not(.hidden)');
        if (open) {
          closeDialog(open.id);
          event.preventDefault();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const open = $('.drawer:not(.hidden), .modal:not(.hidden)');
      if (!open) return;
      const focusables = $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', open)
        .filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (currentPage === 'hospital') {
        resizeEcg();
        if (state.consent.granted && getActiveIncident() && !ecgRaf) startEcg();
      }
    });
    window.addEventListener('pagehide', function () {
      saveState();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveState();
    });
  }

  /* ————————————————————————————————————————————————
     Boot
     ———————————————————————————————————————————————— */
  function init() {
    bindEvents();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(updateVitalsLoop, 2800);
    const active = getActiveIncident();
    if (active) applyClinicalProfile(active.type);
    if (session && ROLES[session.role]) {
      enterApp(session.role, true);
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

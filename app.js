'use strict';
/* Fitness-App: liest Plan/Coach aus dem Vault-Repo und schreibt Einheiten dorthin zurück.
   Alles wird lokal zwischengespeichert, damit die App im Gym auch offline läuft. */

const DEFAULTS = {
  owner: '',
  repo: '',
  branch: 'main',
  dir: '03 Bereiche/Looksmaxxing/Training/Daten',
  token: ''
};
const LS = { settings: 'fa.settings', cache: 'fa.cache', draft: 'fa.draft', outbox: 'fa.outbox' };

const load = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let settings = { ...DEFAULTS, ...load(LS.settings, {}) };
let cache = load(LS.cache, { plan: null, coach: null, sessions: {} }); // sessions: {filename: session}
let outbox = load(LS.outbox, []);
let draft = load(LS.draft, null);

const $ = (s) => document.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtKg = (kg) => (kg == null || kg === '' ? '–' : String(+kg).replace('.', ','));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ---------------- GitHub ---------------- */
const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const pathUrl = (p) => `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/` +
  `${settings.dir}/${p}`.split('/').filter(Boolean).map(encodeURIComponent).join('/');

async function gh(path, opts = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
  const url = pathUrl(path) + (opts.method ? '' : `?ref=${encodeURIComponent(settings.branch)}&t=${Date.now()}`);
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, cache: 'no-store' });
  if (!res.ok) { const e = new Error(`GitHub ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}
const ghJson = async (path) => JSON.parse(b64decode((await gh(path)).content));

async function uploadSession(s) {
  const body = {
    message: `Training ${s.date.slice(0, 10)} Tag ${s.day}`,
    content: b64encode(JSON.stringify(s, null, 2) + '\n'),
    branch: settings.branch
  };
  try {
    await gh(`Einheiten/${s.file}`, { method: 'PUT', body: JSON.stringify(body) });
  } catch (e) {
    if (e.status === 422) return; // Datei existiert schon → wurde bereits hochgeladen
    throw e;
  }
}

function setSync(state, text) { const el = $('#syncState'); el.className = 'sync ' + state; el.textContent = text; }

async function sync({ quiet = false } = {}) {
  if (!settings.token) { setSync('err', 'kein Token'); return; }
  if (!navigator.onLine) { setSync('pending', outbox.length ? `offline · ${outbox.length} offen` : 'offline'); return; }
  setSync('', 'sync …');
  try {
    while (outbox.length) {
      const s = outbox[0];
      await uploadSession(s);
      cache.sessions[s.file] = s; outbox.shift(); save(LS.outbox, outbox); save(LS.cache, cache);
    }
    const [plan, coach, list] = await Promise.all([
      ghJson('plan.json'),
      ghJson('coach.json'),
      gh('Einheiten').catch((e) => (e.status === 404 ? [] : Promise.reject(e)))
    ]);
    cache.plan = plan; cache.coach = coach;
    const files = list.filter((f) => f.type === 'file' && f.name.endsWith('.json')).map((f) => f.name);
    const missing = files.filter((f) => !cache.sessions[f]).sort().slice(-60);
    for (const f of missing) cache.sessions[f] = await ghJson(`Einheiten/${f}`);
    cache.fetchedAt = new Date().toISOString();
    save(LS.cache, cache);
    setSync('ok', 'synchron');
    if (!quiet) render();
  } catch (e) {
    console.error(e);
    const msg = e.status === 401 ? 'Token ungültig' : e.status === 404 ? 'Pfad nicht gefunden' : 'Sync-Fehler';
    setSync(outbox.length ? 'pending' : 'err', outbox.length ? `${msg} · ${outbox.length} offen` : msg);
    if (!quiet) render();
  }
}

/* ---------------- Logik ---------------- */
const sessionsSorted = () => Object.values(cache.sessions).sort((a, b) => a.date.localeCompare(b.date));
const allSessions = () => { const s = sessionsSorted(); outbox.forEach((o) => { if (!cache.sessions[o.file]) s.push(o); }); return s; };

function lastEntry(exId) {
  const s = allSessions();
  for (let i = s.length - 1; i >= 0; i--) {
    const e = s[i].entries.find((x) => x.id === exId);
    if (e && e.sets.length) return { date: s[i].date, sets: e.sets };
  }
  return null;
}

// Vorgabe: Coach (falls neuer als letzte Einheit der Übung) → sonst Double Progression → sonst Startgewicht
function targetFor(ex) {
  const last = lastEntry(ex.id);
  const coach = cache.coach;
  const ct = coach?.targets?.[ex.id];
  if (ct && (!last || coach.setAt > last.date)) return { kg: ct.kg ?? null, reps: ct.reps ?? ex.repsMin, note: ct.note || '', src: 'Coach' };
  if (last) {
    const kg = Math.max(...last.sets.map((s) => +s.kg || 0)) || null;
    const atKg = last.sets.filter((s) => (+s.kg || 0) === (kg || 0));
    const allTop = atKg.length >= ex.sets && atKg.every((s) => s.reps >= ex.repsMax);
    if (allTop && kg != null) {
      const step = kg >= 100 ? Math.max(5, ex.step || 5) : ex.step || 2.5;
      return { kg: kg + step, reps: ex.repsMin, note: 'Obere Range geschafft → mehr Gewicht', src: 'Auto' };
    }
    const minReps = Math.min(...atKg.map((s) => s.reps));
    return { kg, reps: Math.min(ex.repsMax, Math.max(ex.repsMin, minReps + 1)), note: '', src: 'Auto' };
  }
  return { kg: ex.startKg ?? null, reps: ex.repsMin, note: ex.startKg == null ? 'Gewicht selbst finden' : '', src: 'Start' };
}

function suggestedDay() {
  const days = Object.keys(cache.plan?.days || {});
  const s = allSessions();
  if (!s.length || !days.length) return days[0];
  const i = days.indexOf(s[s.length - 1].day);
  return days[(i + 1) % days.length];
}

/* ---------------- Rest-Timer & Wake Lock ---------------- */
let restEnd = 0, restTimer = null, wakeLock = null;
function startRest(sec) {
  restEnd = Date.now() + sec * 1000; $('#restBar').classList.remove('hidden', 'over');
  clearInterval(restTimer); restTimer = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  const left = Math.round((restEnd - Date.now()) / 1000);
  const a = Math.abs(left);
  $('#restTime').textContent = (left < 0 ? '+' : '') + `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
  if (left <= 0 && !$('#restBar').classList.contains('over')) {
    $('#restBar').classList.add('over'); navigator.vibrate?.([200, 100, 200]);
  }
}
function stopRest() { clearInterval(restTimer); $('#restBar').classList.add('hidden'); }
$('#restSkip').onclick = stopRest;
$('#restPlus').onclick = () => { restEnd += 15000; $('#restBar').classList.remove('over'); tickRest(); };
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* egal */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && draft) keepAwake(); });

/* ---------------- Views ---------------- */
let route = draft ? 'workout' : 'home', routeArg = null, clockTimer = null;
function go(r, arg = null) { route = r; routeArg = arg; render(); window.scrollTo(0, 0); }
$('#navBack').onclick = () => go('home');

function render() {
  clearInterval(clockTimer);
  $('#navBack').classList.toggle('hidden', route === 'home');
  if (!settings.token && route !== 'settings') return renderSettings(true);
  ({ home: renderHome, preview: renderPreview, workout: renderWorkout, history: renderHistory, settings: renderSettings, done: renderDone }[route] || renderHome)();
}

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const elapsedMin = () => Math.max(0, Math.floor((Date.now() - new Date(draft.startedAt)) / 60000));
function runningInfo() {
  const sets = draft.entries.reduce((n, e) => n + e.sets.filter((s) => s.ok).length, 0);
  const all = draft.entries.reduce((n, e) => n + e.sets.length, 0);
  return `seit ${fmtTime(draft.startedAt)} Uhr · <span class="elapsed">${elapsedMin()}</span> min · ${sets}/${all} Sätze`;
}
function tickClock() { clearInterval(clockTimer); clockTimer = setInterval(() => document.querySelectorAll('.elapsed').forEach((el) => (el.textContent = elapsedMin())), 20000); }

function renderHome() {
  $('#title').textContent = 'Training';
  const plan = cache.plan;
  if (!plan) { view.innerHTML = `<div class="card">Noch keine Daten. Verbindung prüfen und neu laden.</div><button class="btn" id="retry">Neu laden</button>${footer()}`; $('#retry').onclick = () => sync(); bindFooter(); return; }
  const sug = suggestedDay();
  const s = allSessions(); const last = s[s.length - 1];
  const coach = cache.coach?.message ? `<div class="card coach"><div class="label">Coach</div>${esc(cache.coach.message)}</div>` : '';
  const running = draft ? `<div class="card live"><div class="live-head"><span class="dot"></span><strong>Tag ${esc(draft.day)} läuft</strong></div>
      <div class="muted">${runningInfo()}</div>
      <button class="btn good" id="resume" style="margin:10px 0 0">Weiter trainieren</button></div>` : '';
  const dayBtns = Object.entries(plan.days).map(([k, d]) => {
    const isRun = draft?.day === k, mark = draft ? (isRun ? ' · läuft' : '') : (k === sug ? ' · dran' : '');
    const cls = isRun ? 'good' : !draft && k === sug ? 'primary suggest' : '';
    return `<button class="btn day-btn ${cls}" data-day="${k}">Tag ${k}<small>${d.exercises.length} Übungen${mark}</small></button>`;
  }).join('');
  view.innerHTML = `${running}${coach}
    <div class="row2">${dayBtns}</div>
    <div class="card" id="week"></div>
    <div class="card"><div class="muted">Letzte Einheit</div>${last ? `${fmtDate(last.date)} · Tag ${esc(last.day)}` : 'noch keine'}</div>
    <button class="btn" id="toHist">📈 Verlauf</button>${footer()}`;
  view.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => go(draft?.day === b.dataset.day ? 'workout' : 'preview', b.dataset.day)));
  if (draft) { $('#resume').onclick = () => go('workout'); tickClock(); }
  $('#toHist').onclick = () => go('history');
  renderWeek();
  bindFooter();
}

// Vorschau eines Tages: Übungen + Ziele ansehen, dann bewusst "Start" drücken
function renderPreview() {
  const day = routeArg, d = cache.plan?.days?.[day];
  if (!d) return go('home');
  $('#title').textContent = `Tag ${day}`;
  const blocked = draft && draft.day !== day;
  const list = d.exercises.map((ex) => {
    const t = targetFor(ex);
    return `<tr><td>${esc(ex.name)}</td><td>${ex.sets}× ${fmtKg(t.kg)} kg × ${t.reps}</td></tr>`;
  }).join('');
  view.innerHTML = `
    ${blocked ? `<div class="card live"><div class="live-head"><span class="dot"></span><strong>Tag ${esc(draft.day)} läuft noch</strong></div>
      <div class="muted">Erst Tag ${esc(draft.day)} speichern oder verwerfen, dann kannst du Tag ${esc(day)} starten.</div>
      <button class="btn good" id="resume" style="margin:10px 0 0">Zu Tag ${esc(draft.day)}</button></div>` : ''}
    <div class="card"><h2>${esc(d.title || 'Tag ' + day)}</h2><div class="muted">${d.exercises.length} Übungen · Ziele für heute</div>
      <table class="hist plan" style="margin-top:8px">${list}</table></div>
    ${blocked ? '' : '<button class="btn primary" id="start">▶ Start</button>'}`;
  if (blocked) $('#resume').onclick = () => go('workout');
  else $('#start').onclick = () => startWorkout(day);
}

/* ---------------- Wochenkalender ---------------- */
let weekOffset = 0, weekSel = null;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function mondayOf(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
function kw(d) { // ISO-Kalenderwoche
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
function renderWeek() {
  const box = $('#week'); if (!box) return;
  const mon = mondayOf(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  const byDay = {};
  allSessions().forEach((x) => { const k = dayKey(new Date(x.date)); (byDay[k] = byDay[k] || []).push(x); });
  const today = dayKey(new Date());
  const count = days.reduce((n, d) => n + (byDay[dayKey(d)]?.length || 0), 0);
  const sun = days[6];
  const label = weekOffset === 0 ? 'Diese Woche' : weekOffset === -1 ? 'Letzte Woche' : `KW ${kw(mon)}`;
  const range = `${mon.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${sun.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
  const sel = weekSel && days.some((d) => dayKey(d) === weekSel) ? weekSel : null;
  box.innerHTML = `
    <div class="wk-head">
      <button class="wk-nav" data-w="-1" aria-label="Vorherige Woche">‹</button>
      <div class="wk-title"><strong>${label}</strong><span class="muted">KW ${kw(mon)} · ${range}</span></div>
      <button class="wk-nav" data-w="1" aria-label="Nächste Woche" ${weekOffset >= 0 ? 'disabled' : ''}>›</button>
    </div>
    <div class="wk-grid">${days.map((d) => {
      const k = dayKey(d), ses = byDay[k] || [];
      const cls = ['wk-day', k === today ? 'today' : '', ses.length ? 'trained' : '', k === sel ? 'sel' : '', k > today ? 'future' : ''].join(' ');
      return `<button class="${cls}" data-k="${k}">
        <span class="wk-wd">${d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</span>
        <span class="wk-dn">${d.getDate()}</span>
        <span class="wk-tags">${ses.map((x) => `<b class="tag tag-${esc(x.day)}">${esc(x.day)}</b>`).join('') || '<i>·</i>'}</span>
      </button>`;
    }).join('')}</div>
    <div class="wk-sum muted">${count} Einheit${count === 1 ? '' : 'en'} ${weekOffset === 0 ? 'diese Woche' : 'in dieser Woche'}</div>
    ${sel ? `<div class="wk-detail">${(byDay[sel] || []).map((x) => `
      <div><strong>Tag ${esc(x.day)}</strong> · ${new Date(x.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr${x.durationMin ? ` · ${x.durationMin} min` : ''} · ${x.entries.length} Übung${x.entries.length === 1 ? "" : "en"}${x.note ? `<div class="muted">${esc(x.note)}</div>` : ''}</div>`).join('') || '<span class="muted">Kein Training an diesem Tag.</span>'}</div>` : ''}`;
  box.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { weekOffset = Math.min(0, weekOffset + +b.dataset.w); weekSel = null; renderWeek(); }));
  box.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { weekSel = weekSel === b.dataset.k ? null : b.dataset.k; renderWeek(); }));
}
const footer = () => `<div class="foot"><button class="link" id="toSettings">Einstellungen</button> · <button class="link" id="doSync">Jetzt synchronisieren</button></div>`;
function bindFooter() { $('#toSettings').onclick = () => go('settings'); $('#doSync').onclick = () => sync(); }

function startWorkout(day) {
  const d = cache.plan.days[day];
  draft = {
    day, startedAt: new Date().toISOString(), note: '',
    entries: d.exercises.map((ex) => {
      const t = targetFor(ex);
      return { id: ex.id, name: ex.name, target: t, sets: Array.from({ length: ex.sets }, () => ({ kg: t.kg, reps: t.reps, ok: false })) };
    })
  };
  save(LS.draft, draft); keepAwake(); go('workout');
}

function renderWorkout() {
  if (!draft) return go('home');
  const plan = cache.plan.days[draft.day];
  $('#title').textContent = `Tag ${draft.day} · läuft`;
  const exById = Object.fromEntries(plan.exercises.map((e) => [e.id, e]));
  view.innerHTML = `<div class="card live sticky-live"><div class="live-row"><div><div class="live-head"><span class="dot"></span><strong>Tag ${esc(draft.day)} läuft</strong></div><div class="muted">${runningInfo()}</div></div><button class="btn good small" id="finishTop">Speichern</button></div></div>` + draft.entries.map((en, i) => {
    const ex = exById[en.id] || { repsMin: '', repsMax: '', rest: 90, hint: '' };
    const last = lastEntry(en.id);
    const t = en.target;
    const allOk = en.sets.length && en.sets.every((s) => s.ok);
    return `<div class="card ex ${allOk ? 'done' : ''}" data-i="${i}">
      <div class="ex-head"><h2>${esc(en.name)}</h2><span class="muted">${en.sets.length}×${ex.repsMin}–${ex.repsMax}</span></div>
      <div class="target">Ziel: ${fmtKg(t.kg)} kg × ${t.reps}${t.note ? ' · ' + esc(t.note) : ''}</div>
      <div class="last">${last ? `Letztes Mal (${fmtDate(last.date)}): ${last.sets.map((s) => `${fmtKg(s.kg)}×${s.reps}`).join(', ')}` : 'Noch kein Verlauf'}</div>
      ${en.sets.map((s, j) => `
        <div class="set ${s.ok ? 'ok' : ''}" data-j="${j}">
          <span class="n">${j + 1}</span>
          <div class="val"><div class="stepper"><button data-act="kg-">−</button><input inputmode="decimal" data-f="kg" value="${s.kg ?? ''}" placeholder="kg"><button data-act="kg+">+</button></div><span class="unit">kg</span></div>
          <div class="val"><div class="stepper"><button data-act="r-">−</button><input inputmode="numeric" data-f="reps" value="${s.reps ?? ''}"><button data-act="r+">+</button></div><span class="unit">Wdh.</span></div>
          <button class="check" data-act="ok">✓</button>
        </div>`).join('')}
      <div class="ex-actions"><button class="chip" data-act="add">+ Satz</button>${en.sets.length > 1 ? '<button class="chip" data-act="del">− Satz</button>' : ''}<button class="chip" data-act="hint">Technik</button></div>
      <div class="hint hidden">${esc(ex.hint)}</div>
    </div>`;
  }).join('') + `
    <div class="card"><label for="note">Notiz zur Einheit</label><textarea id="note" rows="2" placeholder="z. B. Beine schwer, schlecht geschlafen">${esc(draft.note)}</textarea></div>
    <button class="btn good" id="finish">Einheit speichern</button>
    <button class="btn small" id="cancel">Einheit verwerfen</button>`;

  view.querySelectorAll('.ex').forEach((card) => {
    const i = +card.dataset.i, en = draft.entries[i], ex = exById[en.id] || {};
    card.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act, row = b.closest('.set'), s = row ? en.sets[+row.dataset.j] : null;
      const step = ex.step || 2.5;
      if (act === 'kg+') s.kg = +((+s.kg || 0) + step).toFixed(2);
      if (act === 'kg-') s.kg = Math.max(0, +((+s.kg || 0) - step).toFixed(2));
      if (act === 'r+') s.reps = (+s.reps || 0) + 1;
      if (act === 'r-') s.reps = Math.max(0, (+s.reps || 0) - 1);
      if (act === 'ok') { s.ok = !s.ok; if (s.ok) { startRest(ex.rest || 90); const nxt = en.sets.find((x) => !x.ok); if (nxt && nxt !== s && (nxt.kg == null)) nxt.kg = s.kg; } }
      if (act === 'add') { const l = en.sets[en.sets.length - 1]; en.sets.push({ kg: l.kg, reps: l.reps, ok: false }); }
      if (act === 'del') en.sets.pop();
      if (act === 'hint') { card.querySelector('.hint').classList.toggle('hidden'); return; }
      save(LS.draft, draft); const y = window.scrollY; renderWorkout(); window.scrollTo(0, y);
    });
    card.addEventListener('change', (ev) => {
      const inp = ev.target.closest('input[data-f]'); if (!inp) return;
      const s = en.sets[+inp.closest('.set').dataset.j];
      const v = inp.value.replace(',', '.').trim();
      s[inp.dataset.f] = v === '' ? null : +v;
      save(LS.draft, draft);
    });
  });
  $('#note').oninput = (e) => { draft.note = e.target.value; save(LS.draft, draft); };
  $('#finish').onclick = finishWorkout;
  $('#finishTop').onclick = finishWorkout;
  tickClock();
  $('#cancel').onclick = () => { if (confirm('Einheit wirklich verwerfen? Die eingetragenen Sätze gehen verloren.')) { draft = null; localStorage.removeItem(LS.draft); stopRest(); go('home'); } };
}

function finishWorkout() {
  const entries = draft.entries
    .map((en) => ({ id: en.id, name: en.name, sets: en.sets.filter((s) => s.ok && s.reps > 0).map((s) => ({ kg: s.kg ?? 0, reps: s.reps })) }))
    .filter((en) => en.sets.length);
  if (!entries.length) { toast('Noch kein Satz abgehakt (✓).'); return; }
  const open = draft.entries.reduce((n, en) => n + en.sets.filter((s) => !s.ok).length, 0);
  if (open && !confirm(`${open} Satz/Sätze sind nicht abgehakt und werden nicht gespeichert. Trotzdem speichern?`)) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const s = {
    file: `${local}_${pad(now.getHours())}${pad(now.getMinutes())}_${draft.day}.json`,
    date: now.toISOString(), day: draft.day, startedAt: draft.startedAt,
    durationMin: Math.round((now - new Date(draft.startedAt)) / 60000),
    entries, note: draft.note.trim()
  };
  outbox.push(s); save(LS.outbox, outbox);
  draft = null; localStorage.removeItem(LS.draft); stopRest();
  try { wakeLock?.release(); } catch { /* egal */ }
  go('done', s);
  sync({ quiet: true }).then(() => { if (route === 'done') renderDone(); });
}

function renderDone() {
  const s = routeArg; $('#title').textContent = 'Gespeichert';
  const pending = outbox.some((o) => o.file === s.file);
  const vol = s.entries.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.kg * x.reps, 0), 0);
  view.innerHTML = `<div class="card"><h2>Stark! 💪 Tag ${esc(s.day)} erledigt</h2>
    <div class="muted">${s.durationMin} min · ${s.entries.length} Übungen · ${s.entries.reduce((a, e) => a + e.sets.length, 0)} Sätze · ${Math.round(vol).toLocaleString('de-DE')} kg bewegt</div>
    <p>${pending ? '⏳ Noch nicht im Vault – wird hochgeladen, sobald Netz da ist.' : '✅ Im Vault gespeichert. Sag Claude Bescheid, dann gibt es neue Vorgaben.'}</p></div>
    <button class="btn primary" id="home">Fertig</button>`;
  $('#home').onclick = () => go('home');
}

function renderHistory() {
  $('#title').textContent = 'Verlauf';
  const plan = cache.plan; const s = allSessions();
  if (!s.length) { view.innerHTML = '<div class="card">Noch keine Einheiten gespeichert.</div>'; return; }
  const sections = Object.entries(plan.days).map(([k, d]) => `<h2 style="margin:18px 4px 8px;font-size:16px">Tag ${k}</h2>` + d.exercises.map((ex) => {
    const rows = s.filter((x) => x.entries.some((e) => e.id === ex.id)).slice(-8).reverse()
      .map((x) => { const e = x.entries.find((y) => y.id === ex.id); return { date: x.date, sets: e.sets, top: Math.max(...e.sets.map((z) => z.kg)) }; });
    if (!rows.length) return '';
    const trend = rows.length > 1 ? rows[0].top - rows[rows.length - 1].top : 0;
    return `<div class="card"><div class="ex-head"><h2>${esc(ex.name)}</h2>${trend ? `<span class="${trend > 0 ? 'trend-up' : 'trend-down'}">${trend > 0 ? '+' : ''}${fmtKg(trend)} kg</span>` : ''}</div>
      <table class="hist">${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.sets.map((z) => `${fmtKg(z.kg)}×${z.reps}`).join(', ')}</td></tr>`).join('')}</table></div>`;
  }).join('')).join('');
  const recent = s.slice(-10).reverse().map((x) => `<tr><td>${fmtDate(x.date)}</td><td>Tag ${esc(x.day)} · ${x.durationMin ?? '?'} min${x.note ? ' · ' + esc(x.note) : ''}</td></tr>`).join('');
  view.innerHTML = `<div class="card"><h2>Letzte Einheiten</h2><table class="hist">${recent}</table></div>${sections}`;
}

function renderSettings(first = false) {
  $('#title').textContent = first ? 'Einrichten' : 'Einstellungen';
  $('#navBack').classList.toggle('hidden', first);
  view.innerHTML = `<div class="card">
    ${first ? '<p>Einmalig den GitHub-Token eintragen. Er bleibt nur auf diesem Handy gespeichert.</p>' : ''}
    <label for="tok">GitHub-Token (fine-grained, nur Vault-Repo, Contents: Read &amp; Write)</label>
    <input type="password" id="tok" value="${esc(settings.token)}" autocomplete="off" placeholder="github_pat_…">
    <label for="own">Repo</label>
    <input type="text" id="own" value="${settings.owner ? esc(settings.owner) + "/" + esc(settings.repo) : ""}" placeholder="name/repo" autocapitalize="off" autocorrect="off">
    <label for="br">Branch</label><input type="text" id="br" value="${esc(settings.branch)}">
    <label for="dir">Ordner im Vault</label><input type="text" id="dir" value="${esc(settings.dir)}">
  </div>
  <button class="btn primary" id="saveSet">Speichern &amp; verbinden</button>
  ${outbox.length ? `<div class="card muted">${outbox.length} Einheit(en) warten auf Upload.</div>` : ''}
  <button class="btn small" id="clearCache">Lokalen Zwischenspeicher leeren</button>`;
  $('#saveSet').onclick = async () => {
    const [owner, repo] = $('#own').value.trim().split('/').map((x) => (x || '').trim());
    if (!owner || !repo) { toast('Repo bitte als name/repo eintragen.'); return; }
    if (!$('#tok').value.trim()) { toast('Bitte den Token eintragen.'); return; }
    settings = { ...settings, token: $('#tok').value.trim(), owner, repo, branch: $('#br').value.trim() || 'main', dir: $('#dir').value.trim().replace(/^\/|\/$/g, '') };
    save(LS.settings, settings);
    route = 'home'; cache = { plan: null, coach: null, sessions: {} }; save(LS.cache, cache);
    await sync();
  };
  $('#clearCache').onclick = () => { if (confirm('Plan und Verlauf lokal neu laden? (Nicht hochgeladene Einheiten bleiben erhalten.)')) { cache = { plan: null, coach: null, sessions: {} }; save(LS.cache, cache); sync(); } };
}

/* ---------------- Start ---------------- */
window.addEventListener('online', () => sync({ quiet: route === 'workout' }));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
sync({ quiet: !!draft });

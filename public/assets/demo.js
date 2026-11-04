// Demo-Zugang: Rollen wechseln ohne Passwort (nur aktiv mit DEMO_ZUGANG=1, siehe README)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function api(method, path, body) {
    const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Fehler ' + r.status);
    return d;
  }
  const msg = (t) => { $('demo-msg').textContent = t || ''; };
  const run = (fn) => async (e) => { try { msg(''); await fn(e); } catch (err) { msg(err.message); } };

  async function load() {
    const s = await api('GET', 'demo/status').catch(() => ({ enabled: false }));
    $('demo-loading').hidden = true;
    $('demo-off').hidden = s.enabled;
    if (s.blocked) $('demo-off-text').textContent = 'Der Demo-Zugang funktioniert nur in einer eigenen Testdatenbank ohne echte Schulträger. Auf dieser Instanz bleibt er darum geschlossen.';
    $('demo-start').hidden = !s.enabled || !!s.traeger;
    $('demo-active').hidden = !s.enabled || !s.traeger;
    if (!s.enabled || !s.traeger) return;
    $('demo-name').textContent = s.traeger.name;
    $('sl-empty').hidden = s.schools.length > 0;
    $('sl-list').innerHTML = s.schools.map((x) => `<button class="btn secondary" type="button" data-school="${esc(x.id)}">Schulleitung ${esc(x.name)}</button>`).join('');
    $('lp-empty').hidden = s.links.length > 0;
    $('lp-list').innerHTML = s.links.map((l) => `<li><a href="/t/${esc(l.token)}">${esc(l.title)} · ${esc(l.school)}</a></li>`).join('');
  }

  document.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', run(async () => {
    await api('POST', 'demo/start', { kind: b.dataset.start });
    location.href = '/leitung';
  })));
  $('btn-rektorat').addEventListener('click', run(async () => { await api('POST', 'demo/rektorat'); location.href = '/leitung'; }));
  $('sl-list').addEventListener('click', run(async (e) => {
    const b = e.target.closest('[data-school]');
    if (!b) return;
    await api('POST', 'demo/schulleitung', { school: b.dataset.school });
    location.href = '/leitung';
  }));
  $('btn-new').addEventListener('click', run(async () => { await api('POST', 'demo/ende'); await load(); }));
  $('btn-end').addEventListener('click', run(async () => { await api('POST', 'demo/ende'); location.href = '/'; }));
  load();
})();

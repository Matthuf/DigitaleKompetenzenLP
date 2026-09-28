// AVS-Verwaltung: Schulträger, Schulen und Zugänge, Runden sowie die kantonale Auswertung ohne Schulbezug.
(function () {
  'use strict';
  const { $, $$, esc, date, api, confirmButton, copyText } = UI;
  let traeger = [];
  let current = null;
  let rounds = [];
  let filter = '';
  const KIND = { primar: 'Gemeinde · Primarstufe', sek: 'Bezirk · Sekundarstufe' };

  /* ---------- Reiter ---------- */
  function route() {
    const tab = decodeURIComponent(location.hash.slice(1)).split('/')[0];
    const name = ['traeger', 'runden', 'auswertung'].includes(tab) ? tab : 'traeger';
    $$('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false'));
    ['traeger', 'runden', 'auswertung'].forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    if (name === 'runden') loadRounds();
    if (name === 'auswertung') openKanton();
  }
  window.addEventListener('hashchange', route);

  /* ---------- Schulträger ---------- */
  async function loadTraeger() {
    traeger = await api('GET', 'admin/traeger');
    renderTraeger();
    if (current) renderPanel();
  }
  function renderTraeger() {
    const t = $('#tr-table');
    const shown = traeger.filter((x) => !filter || x.name.toLowerCase().includes(filter) || x.schools.some((s) => s.name.toLowerCase().includes(filter)));
    t.innerHTML = !traeger.length ? `<tbody><tr><td class="muted">Noch kein Schulträger erfasst.</td></tr></tbody>` : !shown.length ? `<tbody><tr><td class="muted">Nichts gefunden.</td></tr></tbody>`
      : `<thead><tr><th scope="col">Schulträger</th><th scope="col">Stufe</th><th scope="col">Schulen</th><th scope="col" class="num">Zugänge Rektorat</th><th scope="col" class="num">Zugänge Schulleitung</th><th scope="col" class="num">Erhebungen</th><th scope="col" class="num">Teilnehmende</th><th scope="col"></th></tr></thead>
      <tbody>${shown.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${KIND[x.kind]}</td><td class="small">${x.schools.map((s) => esc(s.name)).join(', ') || '–'}</td>
        <td class="num">${x.rektorat}</td><td class="num">${x.schools.reduce((a, s) => a + s.users, 0)}</td><td class="num">${x.campaigns}</td><td class="num">${x.participants}</td>
        <td><button class="btn ${current === x.id ? '' : 'secondary'}" type="button" data-tr="${x.id}">Verwalten</button></td></tr>`).join('')}</tbody>`;
    $$('[data-tr]').forEach((b) => b.addEventListener('click', () => {
      if (current !== b.dataset.tr) $('#pw-once').hidden = true;
      current = b.dataset.tr; renderTraeger(); renderPanel();
      $('#tr-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  async function renderPanel() {
    const t = traeger.find((x) => x.id === current);
    if (!t) { $('#tr-panel').hidden = true; return; }
    $('#tr-panel').hidden = false;
    $('#tr-title').textContent = t.name;
    $('#tr-kind-label').textContent = KIND[t.kind];
    $('#sc-list').innerHTML = t.schools.length ? t.schools.map((s) => `<li class="row" style="justify-content:space-between"><span>${esc(s.name)} <span class="small muted">· ${s.users} Zugang${s.users === 1 ? '' : 'e'}</span></span><span class="confirm" data-scdel="${s.id}"></span></li>`).join('') : '<li class="muted">Noch keine Schule.</li>';
    $$('[data-scdel]').forEach((el) => {
      const s = t.schools.find((x) => x.id === el.dataset.scdel);
      confirmButton(el, 'Entfernen', `«${s.name}» mit allen Links, Antworten und Zugängen löschen?`, 'Ja, löschen', async () => { await api('DELETE', `admin/schools/${s.id}`); loadTraeger(); }, 'btn quiet small');
    });
    $('#user-scope').innerHTML = `<option value="">Rektorat / Hauptschulleitung (ganzer Träger)</option>` + t.schools.map((s) => `<option value="${s.id}">Schulleitung ${esc(s.name)}</option>`).join('');
    const users = await api('GET', `admin/traeger/${t.id}/users`);
    $('#user-table').innerHTML = users.length ? `<thead><tr><th scope="col">Benutzername</th><th scope="col">Rolle</th><th scope="col">Name</th><th scope="col">Letzte Anmeldung</th><th scope="col"></th></tr></thead>
      <tbody>${users.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.must_change_password ? ' <span class="status draft">Startpasswort</span>' : ''}</td>
        <td>${u.role === 'traeger' ? 'Rektorat' : 'Schulleitung ' + esc(u.school_name || '')}</td><td>${esc(u.display_name || '')}</td><td>${u.last_login ? date(u.last_login) : '–'}</td>
        <td><div class="row" style="gap:4px"><button class="btn quiet" type="button" data-reset="${u.id}">Passwort zurücksetzen</button><span class="confirm" data-del="${u.id}"></span></div></td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="muted">Noch kein Zugang für diesen Schulträger.</td></tr></tbody>`;
    $$('[data-reset]').forEach((b) => b.addEventListener('click', async () => showPw(await api('POST', `admin/users/${b.dataset.reset}/reset`))));
    $$('[data-del]').forEach((el) => confirmButton(el, 'Löschen', 'Zugang löschen?', 'Ja, löschen', async () => { await api('DELETE', `admin/users/${el.dataset.del}`); loadTraeger(); }, 'btn quiet'));
    confirmButton($('#tr-delete'), 'Schulträger löschen', `«${t.name}» mit allen Schulen, Erhebungen und Antworten endgültig löschen?`, 'Ja, endgültig löschen', async () => {
      await api('DELETE', `admin/traeger/${t.id}`); current = null; loadTraeger(); $('#tr-panel').hidden = true;
    });
  }

  function showPw(r) {
    const box = $('#pw-once');
    box.hidden = false;
    box.innerHTML = `<p><b>Startpasswort für ${esc(r.username)}:</b> <code id="pw-value" style="font-size:1.1rem">${esc(r.password)}</code>
      <button class="btn quiet" type="button" id="btn-copy-pw">Kopieren</button></p>
      <p class="small">Wird nur jetzt angezeigt. Beim ersten Anmelden unter /leitung muss ein eigenes Passwort festgelegt werden. Falls es verloren geht: «Passwort zurücksetzen».</p>
      <div><button class="btn quiet" type="button" id="btn-pw-done">Notiert, ausblenden</button></div>`;
    $('#btn-copy-pw').addEventListener('click', (e) => copyText(r.password, e.currentTarget));
    $('#btn-pw-done').addEventListener('click', () => { box.hidden = true; });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    loadTraeger();
  }

  $('#tr-filter').addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); renderTraeger(); });
  $('#form-traeger').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#tr-msg').textContent = '';
    try { const r = await api('POST', 'admin/traeger', { name: $('#tr-new').value, kind: $('#tr-kind').value }); $('#tr-new').value = ''; current = r.id; await loadTraeger(); }
    catch (err) { $('#tr-msg').textContent = err.message; }
  });
  $('#form-school').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#school-msg').textContent = '';
    try { await api('POST', `admin/traeger/${current}/schools`, { name: $('#school-new').value }); $('#school-new').value = ''; await loadTraeger(); }
    catch (err) { $('#school-msg').textContent = err.message; }
  });
  $('#form-user').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#user-msg').textContent = '';
    try {
      const r = await api('POST', `admin/traeger/${current}/users`, { username: $('#user-new').value, display_name: $('#user-new-name').value, schoolId: $('#user-scope').value || undefined });
      $('#user-new').value = ''; $('#user-new-name').value = '';
      showPw(r);
    } catch (err) { $('#user-msg').textContent = err.message; }
  });

  /* ---------- Runden ---------- */
  async function loadRounds() {
    rounds = await api('GET', 'admin/rounds');
    $('#round-table').innerHTML = rounds.length ? `<thead><tr><th scope="col">Runde</th><th scope="col">Status</th><th scope="col" class="num">Schulen</th><th scope="col" class="num">Abgeschlossen</th><th scope="col">Erfasst</th><th scope="col"></th></tr></thead>
      <tbody>${rounds.map((r) => `<tr><td><b>${esc(r.title)}</b></td><td><span class="status ${r.active ? 'open' : 'closed'}">${r.active ? 'wählbar' : 'nicht mehr wählbar'}</span></td>
        <td class="num">${r.schools}</td><td class="num">${r.submitted}</td><td>${date(r.created_at)}</td>
        <td><button class="btn quiet" type="button" data-round="${r.id}" data-active="${r.active ? 1 : 0}">${r.active ? 'Nicht mehr wählbar machen' : 'Wieder wählbar machen'}</button></td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="muted">Noch keine Runde. Die erste kantonale Runde hier erfassen.</td></tr></tbody>`;
    $$('[data-round]').forEach((b) => b.addEventListener('click', async () => { await api('PATCH', `admin/rounds/${b.dataset.round}`, { active: b.dataset.active !== '1' }); loadRounds(); }));
  }
  $('#form-round').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#round-msg').textContent = '';
    try { await api('POST', 'admin/rounds', { title: $('#round-new').value }); $('#round-new').value = ''; loadRounds(); }
    catch (err) { $('#round-msg').textContent = err.message; }
  });

  /* ---------- Kantonale Auswertung ---------- */
  const k = { round: null, zyklus: '' };
  async function openKanton() {
    rounds = await api('GET', 'admin/rounds');
    if (k.round === null) k.round = rounds.length ? rounds[rounds.length - 1].id : '';
    $('#k-round').innerHTML = rounds.map((r) => `<option value="${r.id}" ${r.id === k.round ? 'selected' : ''}>${esc(r.title)}</option>`).join('') + `<option value="" ${k.round === '' ? 'selected' : ''}>Alle Erhebungen (jüngste Teilnahme je Person)</option>`;
    loadKanton();
  }
  async function loadKanton() {
    const out = $('#k-out');
    out.innerHTML = '<p class="muted">Wird geladen …</p>';
    let data;
    try { data = await api('GET', `admin/aggregate?round=${encodeURIComponent(k.round)}${k.zyklus ? '&zyklus=' + encodeURIComponent(k.zyklus) : ''}`); }
    catch (err) {
      if (err.status === 403 && k.zyklus) { k.zyklus = ''; return loadKanton(); }
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`; return;
    }
    $('#k-zyklus').innerHTML = `<option value="">Alle Zyklen</option>` + data.zyklen.map((z) => `<option ${z.zyklus === k.zyklus ? 'selected' : ''}>${esc(z.zyklus)}</option>`).join('');
    const roundTitle = k.round ? (rounds.find((r) => r.id === k.round) || {}).title : 'Alle Erhebungen';
    Analysis.render(out, data, null, {
      title: roundTitle,
      org: 'Kanton Schwyz · alle Schulen',
      filterText: k.zyklus,
      extraText: data.tooFew ? '' : `aus ${data.schoolCount} Schule${data.schoolCount === 1 ? '' : 'n'} von ${data.traegerCount} Schulträger${data.traegerCount === 1 ? '' : 'n'}`,
      profileTitle: 'Profil des Kantons',
      reportTitle: 'Digitale Kompetenzen der Lehrpersonen im Kanton Schwyz',
      reportFoot: 'Zusammengefasste Selbsteinschätzungen nach DigCompEdu, ohne Angaben zu Schulen oder Schulträgern.',
      exportText: 'Für Gremien, Weiterbildungsplanung und Berichterstattung.',
      groups: [['zyklen', 'Zyklen im Vergleich', ''], ['erfahrung', 'Berufserfahrung im Vergleich', ''], ['funktion', 'Funktionen im Vergleich', '']],
      showCustom: false,
    });
  }
  $('#k-round').addEventListener('change', (e) => { k.round = e.target.value; k.zyklus = ''; loadKanton(); });
  $('#k-zyklus').addEventListener('change', (e) => { k.zyklus = e.target.value; loadKanton(); });

  Staff.start('admin', async () => { await loadTraeger(); route(); });
})();

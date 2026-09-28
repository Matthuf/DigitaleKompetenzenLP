// AVS-Verwaltung: Schulen erfassen, Zugänge für Schulleitungen verwalten. Keine Einsicht in Antworten.
(function () {
  'use strict';
  const { $, $$, esc, date, api, confirmButton, copyText } = UI;
  let schools = [];
  let current = null;

  let filter = '';
  async function loadSchools() {
    schools = await api('GET', 'admin/schools');
    renderSchools();
  }
  function renderSchools() {
    const t = $('#school-table');
    const shown = schools.filter((s) => !filter || s.name.toLowerCase().includes(filter));
    t.innerHTML = !schools.length ? `<tbody><tr><td class="muted">Noch keine Schule erfasst.</td></tr></tbody>` : !shown.length ? `<tbody><tr><td class="muted">Keine Schule gefunden.</td></tr></tbody>` : `<thead><tr><th scope="col">Schule</th><th scope="col">Erfasst</th><th scope="col" class="num">Zugänge</th><th scope="col" class="num">Erhebungen</th><th scope="col" class="num">Teilnehmende</th><th scope="col"></th></tr></thead>
      <tbody>${shown.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${date(s.created_at)}</td><td class="num">${s.users}</td><td class="num">${s.campaigns}</td><td class="num">${s.participants}</td>
        <td><button class="btn ${current === s.id ? '' : 'secondary'}" type="button" data-school="${s.id}">Zugänge verwalten</button></td></tr>`).join('')}</tbody>`
      ;
    $$('[data-school]').forEach((b) => b.addEventListener('click', () => {
      if (current !== b.dataset.school) $('#pw-once').hidden = true;
      current = b.dataset.school; renderSchools(); loadUsers();
      $('#users-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  async function loadUsers() {
    const s = schools.find((x) => x.id === current);
    if (!s) { $('#users-panel').hidden = true; return; }
    $('#users-panel').hidden = false;
    $('#users-title').textContent = s.name;
    const users = await api('GET', `admin/schools/${s.id}/users`);
    $('#user-table').innerHTML = users.length ? `<thead><tr><th scope="col">Benutzername</th><th scope="col">Name</th><th scope="col">Erstellt</th><th scope="col">Letzte Anmeldung</th><th scope="col"></th></tr></thead>
      <tbody>${users.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.must_change_password ? ' <span class="status draft">Startpasswort</span>' : ''}</td><td>${esc(u.display_name || '')}</td><td>${date(u.created_at)}</td><td>${u.last_login ? date(u.last_login) : '–'}</td>
        <td><div class="row" style="gap:4px"><button class="btn quiet" type="button" data-reset="${u.id}">Passwort zurücksetzen</button><span class="confirm" data-del="${u.id}"></span></div></td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="muted">Noch kein Zugang für diese Schule.</td></tr></tbody>`;
    $$('[data-reset]').forEach((b) => b.addEventListener('click', async () => showPw(await api('POST', `admin/users/${b.dataset.reset}/reset`))));
    $$('[data-del]').forEach((el) => confirmButton(el, 'Löschen', 'Zugang löschen?', 'Ja, löschen', async () => { await api('DELETE', `admin/users/${el.dataset.del}`); loadUsers(); loadSchools(); }, 'btn quiet'));
    confirmButton($('#school-delete'), 'Schule löschen', `«${s.name}» mit allen Erhebungen und Antworten endgültig löschen?`, 'Ja, endgültig löschen', async () => {
      await api('DELETE', `admin/schools/${s.id}`); current = null; loadSchools(); loadUsers();
    });
  }

  function showPw(r) {
    const box = $('#pw-once');
    box.hidden = false;
    box.innerHTML = `<p><b>Startpasswort für ${esc(r.username)}:</b> <code id="pw-value" style="font-size:1.1rem">${esc(r.password)}</code>
      <button class="btn quiet" type="button" id="btn-copy-pw">Kopieren</button></p>
      <p class="small">Wird nur jetzt angezeigt. Beim ersten Anmelden muss die Schulleitung ein eigenes Passwort festlegen. Falls es verloren geht: «Passwort zurücksetzen».</p>
      <div><button class="btn quiet" type="button" id="btn-pw-done">Notiert, ausblenden</button></div>`;
    $('#btn-copy-pw').addEventListener('click', (e) => copyText(r.password, e.currentTarget));
    $('#btn-pw-done').addEventListener('click', () => { box.hidden = true; });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    loadUsers();
  }

  $('#school-filter').addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); renderSchools(); });
  $('#form-school').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#school-msg').textContent = '';
    try { const r = await api('POST', 'admin/schools', { name: $('#school-new').value }); $('#school-new').value = ''; current = r.id; await loadSchools(); loadUsers(); }
    catch (err) { $('#school-msg').textContent = err.message; }
  });
  $('#form-user').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#user-msg').textContent = '';
    try {
      const r = await api('POST', `admin/schools/${current}/users`, { username: $('#user-new').value, display_name: $('#user-new-name').value });
      $('#user-new').value = ''; $('#user-new-name').value = '';
      showPw(r); loadSchools();
    } catch (err) { $('#user-msg').textContent = err.message; }
  });

  Staff.start('admin', () => loadSchools());
})();

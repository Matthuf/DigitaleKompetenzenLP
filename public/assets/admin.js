// AVS-Verwaltung: Schulträger, Schulen und Zugänge, Runden sowie die kantonale Auswertung ohne Schulbezug.
(function () {
  'use strict';
  const { $, $$, esc, date, api, confirmButton, copyText } = UI;
  let traeger = [];
  let current = null;
  let rounds = [];
  let filter = '';
  const KIND = { primar: 'Primarstufe', sek: 'Sekundarstufe', gesamt: 'Primar- und Sekundarstufe' };
  const zyklenText = (z) => (z.length === 3 ? 'Zyklus 1–3' : z.join(', ').replace(/, Zyklus /g, ', '));
  // Stufe aus der Importliste: «beide», «gesamt», «Primar und Sek» → gesamt; Sek/Bezirk → sek; sonst primar
  const parseKind = (v) => (/beide|gesamt|alle|primar.*sek|sek.*primar|1\s*[-–]\s*3/i.test(v || '') ? 'gesamt' : /sek|bezirk|zyklus\s*3/i.test(v || '') ? 'sek' : 'primar');

  /* ---------- Reiter ---------- */
  const TABS = ['traeger', 'import', 'runden', 'auswertung', 'protokoll'];
  function route() {
    const tab = decodeURIComponent(location.hash.slice(1)).split('/')[0];
    const name = TABS.includes(tab) ? tab : 'traeger';
    $$('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false'));
    TABS.forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    if (name === 'runden') loadRounds();
    if (name === 'auswertung') openKanton();
    if (name === 'protokoll') loadAudit();
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
    $('#sc-list').innerHTML = t.schools.length ? t.schools.map((s) => `<li class="row" style="justify-content:space-between"><span>${esc(s.name)} <span class="small muted">· ${esc(zyklenText(s.zyklen))} · ${s.users} Zugang${s.users === 1 ? '' : 'e'}</span></span><span class="row" style="gap:6px"><button class="btn quiet small" type="button" data-zyk="${s.id}">Zyklen</button><span class="confirm" data-scdel="${s.id}"></span></span></li>`).join('') : '<li class="muted">Noch keine Schule.</li>';
    $$('#sc-list [data-zyk]').forEach((b) => b.addEventListener('click', () => {
      const li = b.closest('li'); const s = t.schools.find((x) => x.id === b.dataset.zyk);
      li.innerHTML = `<fieldset class="inline-edit" style="border:0;padding:0;margin:0"><legend class="small"><b>Zyklen ${esc(s.name)}</b></legend>
        ${['Zyklus 1', 'Zyklus 2', 'Zyklus 3'].map((z) => `<label class="check small"><input type="checkbox" value="${z}" ${s.zyklen.includes(z) ? 'checked' : ''}><span>${z}</span></label>`).join('')}
        <button class="btn secondary small" type="button">Speichern</button><button class="btn quiet small" type="button">Abbrechen</button><span class="error small"></span></fieldset>`;
      const [save, cancel] = li.querySelectorAll('button');
      save.addEventListener('click', async () => {
        try { await api('PATCH', 'admin/schools/' + s.id, { zyklen: [...li.querySelectorAll('input:checked')].map((i) => i.value) }); loadTraeger(); }
        catch (err) { li.querySelector('.error').textContent = err.message; }
      });
      cancel.addEventListener('click', () => renderPanel());
    }));
    $$('[data-scdel]').forEach((el) => {
      const s = t.schools.find((x) => x.id === el.dataset.scdel);
      confirmButton(el, 'Entfernen', `«${s.name}» mit allen Links, Antworten und Zugängen löschen?`, 'Ja, löschen', async () => { await api('DELETE', `admin/schools/${s.id}`); loadTraeger(); }, 'btn quiet small');
    });
    $('#user-scope').innerHTML = `<option value="">Schulträger: Rektorat / Hauptschulleitung</option>` + t.schools.map((s) => `<option value="${s.id}">Schulleitung ${esc(s.name)}</option>`).join('');
    const [users, invs] = await Promise.all([api('GET', `admin/traeger/${t.id}/users`), api('GET', `admin/traeger/${t.id}/invitations`)]);
    $('#user-table').innerHTML = users.length ? `<thead><tr><th scope="col">Person</th><th scope="col">Rolle</th><th scope="col">E-Mail</th><th scope="col">Letzte Anmeldung</th><th scope="col"></th></tr></thead>
      <tbody>${users.map((u) => `<tr><td><b>${esc(u.display_name || u.username)}</b><br><span class="small muted">${esc(u.username)}</span></td>
        <td>${u.role === 'traeger' ? 'Schulträger' : 'Schulleitung ' + esc(u.school_name || '')}</td><td class="small">${esc(u.email || '–')}</td><td>${u.last_login ? date(u.last_login) : '–'}</td>
        <td><div class="row" style="gap:4px"><button class="btn quiet" type="button" data-reset="${u.id}">Link für neues Passwort</button><span class="confirm" data-del="${u.id}"></span></div></td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="muted">Noch kein Zugang für diesen Schulträger.</td></tr></tbody>`;
    $('#inv-open').innerHTML = invs.length ? `<h3>Offene Einladungen</h3><ul class="list-plain team-list">${invs.map((i) => `<li><span>${esc(i.name || i.email || 'Ohne Namen')} <span class="small muted">· ${esc(i.email || '')} · ${i.role === 'traeger' ? 'Schulträger' : 'Schulleitung ' + esc(i.school_name || '')} · ${i.expired ? '<b>abgelaufen</b>' : 'gültig bis ' + date(i.expires_at)}</span></span>
      <span class="row" style="gap:6px"><button class="btn quiet small" type="button" data-irenew="${i.id}">Neuer Link</button><span class="confirm" data-idel="${i.id}"></span></span></li>`).join('')}</ul>` : '';
    const roleText = (i) => (i.role === 'traeger' || !i.school_name ? 'Schulträger ' + t.name : 'Schulleitung ' + i.school_name);
    $$('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
      const u = users.find((x) => x.id === b.dataset.reset);
      const r = await api('POST', `admin/users/${u.id}/reset`);
      UI.invitePanel($('#pw-once'), { ...r, reset: true, name: u.display_name, from: 'Amt für Volksschulen und Sport' });
    }));
    $$('[data-del]').forEach((el) => confirmButton(el, 'Löschen', 'Zugang löschen?', 'Ja, löschen', async () => { await api('DELETE', `admin/users/${el.dataset.del}`); loadTraeger(); }, 'btn quiet'));
    $$('[data-irenew]').forEach((b) => b.addEventListener('click', async () => {
      const i = invs.find((x) => x.id === b.dataset.irenew);
      const r = await api('POST', `admin/invitations/${i.id}/renew`);
      await renderPanel();
      UI.invitePanel($('#pw-once'), { ...r, email: i.email, name: i.name, roleText: roleText(i), from: 'Amt für Volksschulen und Sport' });
    }));
    $$('[data-idel]').forEach((el) => confirmButton(el, 'Zurückziehen', 'Einladung zurückziehen?', 'Ja, zurückziehen', async () => { await api('DELETE', `admin/invitations/${el.dataset.idel}`); renderPanel(); }, 'btn quiet small'));
    confirmButton($('#tr-delete'), 'Schulträger löschen', `«${t.name}» mit allen Schulen, Erhebungen und Antworten endgültig löschen?`, 'Ja, endgültig löschen', async () => {
      await api('DELETE', `admin/traeger/${t.id}`); current = null; loadTraeger(); $('#tr-panel').hidden = true;
    });
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
    const t = traeger.find((x) => x.id === current);
    const schoolId = $('#user-scope').value || undefined;
    const body = { name: $('#user-new-name').value.trim(), email: $('#user-new').value.trim(), schoolId };
    if (!body.name && !body.email) { $('#user-msg').textContent = 'Bitte mindestens Name oder E-Mail angeben.'; return; }
    try {
      const r = await api('POST', `admin/traeger/${current}/invitations`, body);
      $('#user-new').value = ''; $('#user-new-name').value = '';
      await renderPanel();
      const school = schoolId ? t.schools.find((s) => s.id === schoolId) : null;
      UI.invitePanel($('#pw-once'), { ...r, email: body.email, name: body.name, roleText: school ? 'Schulleitung ' + school.name : 'Schulträger ' + t.name, from: 'Amt für Volksschulen und Sport' });
    } catch (err) { $('#user-msg').textContent = err.message; }
  });

  /* ---------- Liste importieren ---------- */
  let parsed = [];
  function parseList(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const split = (l) => {
      // einfache CSV-Regeln: Felder in Anführungszeichen dürfen das Trennzeichen enthalten
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((x) => x.trim());
    };
    const rows = lines.map(split);
    if (/träger|traeger/i.test(rows[0][0] || '')) rows.shift();
    return rows.filter((r) => r[0]).map((r) => ({
      traeger: r[0], kind: parseKind(r[1]), name: r[2] || '', email: r[3] || '',
      schools: (r[4] || '').split(delim === ',' ? /[;|]/ : /[,;|]/).map((x) => x.trim()).filter(Boolean),
    }));
  }
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  function preview() {
    parsed = parseList($('#imp-text').value);
    $('#imp-msg').textContent = parsed.length ? '' : 'Keine Zeilen erkannt.';
    if (!parsed.length) { $('#imp-out').innerHTML = ''; return; }
    const known = new Set(traeger.map((t) => t.name.toLowerCase()));
    $('#imp-out').innerHTML = `<h3>Vorschau: ${parsed.length} Schulträger</h3>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Vorschau Import"><table class="list">
        <thead><tr><th scope="col">Schulträger</th><th scope="col">Stufe</th><th scope="col">Rektorat</th><th scope="col">E-Mail</th><th scope="col">Schulhäuser</th><th scope="col">Hinweis</th></tr></thead>
        <tbody>${parsed.map((r) => `<tr><td><b>${esc(r.traeger)}</b></td><td>${KIND[r.kind]}</td><td>${esc(r.name)}</td><td class="small">${esc(r.email)}</td><td class="small">${esc(r.schools.join(', ') || '–')}</td>
          <td class="small">${[known.has(r.traeger.toLowerCase()) ? 'bereits vorhanden, wird ergänzt' : '', validEmail(r.email) ? '' : '<b>keine gültige E-Mail, keine Einladung</b>'].filter(Boolean).join(' · ') || 'neu'}</td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button class="btn" type="button" id="imp-run">${parsed.length} Schulträger importieren und Einladungen erstellen</button></div>`;
    $('#imp-run').addEventListener('click', runImport);
  }
  async function runImport() {
    $('#imp-run').disabled = true;
    let res;
    try { res = await api('POST', 'admin/import', { rows: parsed }); }
    catch (err) { $('#imp-msg').textContent = err.message; $('#imp-run').disabled = false; return; }
    await loadTraeger();
    const withLink = res.rows.filter((r) => r.token);
    $('#imp-out').innerHTML = `<div class="box box--success"><b>Import abgeschlossen.</b> ${withLink.length} Einladung${withLink.length === 1 ? '' : 'en'} erstellt. Die Links werden nur jetzt angezeigt: jetzt per E-Mail verschicken oder die Liste für einen Serienbrief speichern. Später lässt sich pro Schulträger ein neuer Link erzeugen.</div>
      <div class="row"><button class="btn" type="button" id="imp-csv">Einladungen als CSV (Serienbrief)</button></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Ergebnis Import"><table class="list">
        <thead><tr><th scope="col">Schulträger</th><th scope="col">Rektorat</th><th scope="col">Ergebnis</th><th scope="col"></th></tr></thead>
        <tbody>${res.rows.map((r, k) => `<tr><td><b>${esc(r.traeger)}</b></td><td class="small">${esc(r.name || '')}<br>${esc(r.email || '')}</td><td class="small">${esc(r.status)}</td>
          <td>${r.token ? `<div class="row" style="gap:4px"><button class="btn quiet small" type="button" data-icopy="${k}">Link kopieren</button><a class="btn secondary small" data-imail="${k}" href="#">E-Mail öffnen</a></div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const mailOf = (r) => UI.inviteMail({ token: r.token, expires_at: r.expires_at, name: r.name, roleText: 'Schulträger ' + r.traeger, from: 'Amt für Volksschulen und Sport' });
    $$('[data-icopy]').forEach((b) => b.addEventListener('click', () => copyText(UI.inviteLink(res.rows[b.dataset.icopy].token), b)));
    $$('[data-imail]').forEach((a) => { const r = res.rows[a.dataset.imail]; const m = mailOf(r); a.href = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`; });
    $('#imp-csv').addEventListener('click', () => {
      // Formelzeichen am Anfang entschärfen (Schutz vor Formel-Ausführung in Excel)
      const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
      const rows = [['Schulträger', 'Name', 'E-Mail', 'Einladungslink', 'Gültig bis']].concat(withLink.map((r) => [r.traeger, r.name, r.email, UI.inviteLink(r.token), date(r.expires_at)]));
      UI.download(`Einladungen_Schultraeger_${UI.today()}.csv`, '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
    });
  }
  $('#imp-preview').addEventListener('click', preview);
  $('#imp-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; $('#imp-text').value = await f.text(); e.target.value = ''; preview(); });
  $('#imp-template').addEventListener('click', () => UI.download('Vorlage_Schultraeger.csv', '﻿' + 'Schulträger;Stufe;Name Rektorat;E-Mail;Schulhäuser\r\nGemeinde Musterdorf;Primar;Maria Muster;rektorat@musterdorf.ch;Schulhaus Dorf, Schulhaus Berg\r\nBezirk Muster;Sek;Hans Beispiel;hauptschulleitung@bezirk-muster.ch;Schulhaus Nord, Schulhaus Süd\r\nBezirk Beispiel;beide;Eva Beispiel;rektorat@bezirk-beispiel.ch;Schulhaus Dorf, Oberstufenzentrum\r\n', 'text/csv;charset=utf-8'));

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
    if (!rounds.length) { $('#k-round').innerHTML = ''; $('#k-out').innerHTML = '<div class="box box--info">Noch keine Runde erfasst. Die kantonale Auswertung erfolgt pro Runde (Reiter «Runden»).</div>'; return; }
    if (!k.round || !rounds.some((r) => r.id === k.round)) k.round = rounds[rounds.length - 1].id;
    $('#k-round').innerHTML = rounds.map((r) => `<option value="${r.id}" ${r.id === k.round ? 'selected' : ''}>${esc(r.title)}</option>`).join('');
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
    const roundTitle = (rounds.find((r) => r.id === k.round) || {}).title || 'Runde';
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

  /* ---------- Protokoll ---------- */
  const ACTION = {
    anmeldung: 'Anmeldung', anmeldung_fehlgeschlagen: 'Anmeldung fehlgeschlagen', passwort_geaendert: 'Passwort geändert',
    passwort_link_erstellt: 'Passwort-Link erstellt', passwort_link_eingeloest: 'Passwort-Link eingelöst',
    einladung_erstellt: 'Einladung erstellt', einladung_angenommen: 'Einladung angenommen', zugang_geloescht: 'Zugang gelöscht',
    schule_erfasst: 'Schule erfasst', schule_geloescht: 'Schule gelöscht', schultraeger_geloescht: 'Schulträger gelöscht', import: 'Liste importiert',
    erhebung_eroeffnet: 'Erhebung eröffnet', erhebung_abgeschlossen: 'Erhebung abgeschlossen', erhebung_geoeffnet: 'Erhebung wieder geöffnet',
    auswertung_angesehen: 'Auswertung angesehen', kantonsauswertung_angesehen: 'Kantonale Auswertung angesehen',
  };
  const ROLE = { admin: 'AVS', traeger: 'Schulträger', leitung: 'Schulleitung' };
  async function loadAudit() {
    const t = $('#audit-table');
    t.innerHTML = '<tbody><tr><td class="muted">Wird geladen …</td></tr></tbody>';
    let rows;
    try { rows = await api('GET', 'admin/audit?limit=300'); } catch (err) { t.innerHTML = `<tbody><tr><td class="error">${esc(err.message)}</td></tr></tbody>`; return; }
    const who = (r) => r.username ? `${esc(r.display_name || r.username)}<br><span class="small muted">${esc(ROLE[r.actor_role] || r.actor_role || '')}${r.school_name ? ' · ' + esc(r.school_name) : r.traeger_name ? ' · ' + esc(r.traeger_name) : ''}</span>` : '<span class="muted">unbekannt</span>';
    t.innerHTML = rows.length ? `<thead><tr><th scope="col">Zeit</th><th scope="col">Wer</th><th scope="col">Aktion</th><th scope="col">Betrifft</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="small">${esc(new Date(r.at).toLocaleString('de-CH'))}</td><td>${who(r)}</td><td>${esc(ACTION[r.action] || r.action)}</td><td class="small">${esc(r.target || '')}</td></tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="muted">Noch keine Einträge.</td></tr></tbody>';
  }

  Staff.start('admin', async () => { await loadTraeger(); route(); });
})();

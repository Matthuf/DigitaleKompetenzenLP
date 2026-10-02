// Dashboard für Rektorat (ganzer Schulträger) und Schulleitung (eigene Schule):
// Reiter Erhebungen (mit eigenen Fragen pro Erhebung), Auswertung und Schulen/Zugänge.
(function () {
  'use strict';
  const { $, $$, esc, date, api, download, copyText, confirmButton } = UI;
  let ctx = null;          // { role, traeger, schools, rounds, min }
  let campaigns = [];
  let an = { src: '', compare: '', school: '', zyklus: '' };

  const isRektorat = () => ctx && ctx.role === 'traeger';
  const linkFor = (l) => `${location.origin}/t/${l.token}`;
  const byId = (id) => campaigns.find((c) => c.id === id);
  const linkById = (id) => campaigns.flatMap((c) => c.links.map((l) => ({ ...l, campaign: c }))).find((l) => l.id === id);
  const orgName = () => (isRektorat() ? ctx.traeger.name : (ctx.schools[0] ? ctx.schools[0].name : ''));
  // Absender in E-Mail-Vorlagen: Name der angemeldeten Person (falls erfasst) und Funktion
  function signature() {
    const u = window.StaffUser || {};
    const name = u.display_name && u.display_name !== u.username ? u.display_name + '\n' : '';
    return name + (isRektorat() ? 'Rektorat/Hauptschulleitung ' + ctx.traeger.name : 'Schulleitung ' + orgName());
  }

  /* ---------- Reiter mit eigener Adresse (Zurück-Knopf funktioniert) ----------
   * #erhebungen[/id] · #auswertung[/quelle] · #team. Alte Adresse #fragen/id führt zur Karte der Erhebung. */
  const TABS = ['erhebungen', 'auswertung', 'team'];
  let currentHash = location.hash, skipGuard = false;
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    let [tab, ...rest] = h.split('/');
    let id = rest.join('/');
    if (tab === 'fragen') { tab = 'erhebungen'; if (byId(id)) openQ = id; history.replaceState(null, '', '#erhebungen' + (id ? '/' + id : '')); }
    const name = TABS.includes(tab) ? tab : 'erhebungen';
    $$('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false'));
    TABS.forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    currentHash = location.hash;
    if (name === 'erhebungen') {
      if (openQ && byId(id)) renderCampaigns();
      const card = id && document.getElementById('camp-' + id);
      if (card) { card.scrollIntoView({ block: 'start' }); return; }
    }
    if (name === 'auswertung') openAnalysis(id);
    if (name === 'team') loadTeam();
    window.scrollTo({ top: 0 });
  }
  // Ungespeicherte eigene Fragen: vor dem Verlassen nachfragen
  const leaveOk = () => !Block.isDirty() || confirm('Die eigenen Fragen haben ungespeicherte Änderungen. Ohne Speichern verlassen?');
  window.addEventListener('hashchange', () => {
    if (skipGuard) { skipGuard = false; return; }
    const stay = Block.isDirty() && !location.hash.startsWith('#erhebungen') && !leaveOk();
    if (stay) { skipGuard = true; location.hash = currentHash; return; }
    if (Block.isDirty() && !location.hash.startsWith('#erhebungen')) { Block.discard(); openQ = null; }
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (Block.isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // Reihenfolge: offene vor geschlossenen, Vorgabe des AVS zuerst, dann neueste
  function sortCampaigns(list) {
    return list.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
      || (a.round_id ? 0 : 1) - (b.round_id ? 0 : 1) || String(b.created_at).localeCompare(String(a.created_at)));
  }
  async function loadCampaigns() {
    campaigns = sortCampaigns(await api('GET', 'leitung/campaigns'));
    renderCampaigns();
    fillSelects();
    fillCreateForm();
  }

  /* ---------- Erhebungen ---------- */
  let openQ = null;       // Erhebung, deren eigene Fragen aufgeklappt sind
  let pastOpen = false;   // Bereich «Frühere Erhebungen» aufgeklappt

  function linkRow(c, l) {
    const quote = l.expected ? Math.min(100, Math.round(100 * l.submitted / l.expected)) : null;
    return `<div class="link-row" data-link="${l.id}">
      <div class="link-head">
        <b>${esc(l.school_name)}</b>
        <span class="small"><b>${l.submitted}</b> abgeschlossen · ${l.drafts} in Bearbeitung</span>
        <span class="quote small" data-quote="${l.id}">${quote !== null
          ? `Rücklauf ${quote} % von ${l.expected} <button class="btn quiet small" type="button" data-expected="${l.id}">ändern</button><span class="bar"><span style="width:${quote}%"></span></span>`
          : `<button class="btn quiet small" type="button" data-expected="${l.id}">Anzahl Lehrpersonen eintragen</button>`}</span>
      </div>
      ${l.expected && l.submitted + l.drafts > l.expected ? `<p class="box box--warning small" role="note">Über diesen Link wurden mehr Teilnahmen gestartet (${l.submitted + l.drafts}), als Lehrpersonen erwartet werden (${l.expected}). Möglicherweise wurde der Link über die eigenen Lehrpersonen hinaus weitergegeben. Bei Bedarf die Erhebung abschliessen und eine neue eröffnen.</p>` : ''}
      ${c.status === 'open' ? `<div class="camp-link"><code title="${esc(linkFor(l))}">${esc(linkFor(l))}</code>
        <button class="btn secondary small" type="button" data-copy="${l.id}">Link kopieren</button>
        ${isRektorat() ? `<button class="btn secondary small" type="button" data-slmail="${l.id}">E-Mail an Schulleitung</button>` : ''}
        <button class="btn secondary small" type="button" data-mail="${l.id}">E-Mail an die Lehrpersonen</button>
        <button class="btn secondary small" type="button" data-qr="${l.id}">QR-Code</button></div>
        <div class="share" data-share="${l.id}" hidden></div>` : ''}
    </div>`;
  }

  // Schulhäuser des Trägers, die noch in eine laufende Erhebung aufgenommen werden können
  function missingSchools(c) {
    if (!isRektorat() || c.status !== 'open' || !c.manageable || !c.byTraeger) return []; // Erhebungen einer Schulleitung bleiben bei ihrer Schule
    const inCamp = new Set(c.links.map((l) => l.school_id));
    const inRound = c.round_id ? schoolsInRound(c.round_id) : new Set();
    return ctx.schools.filter((s) => !inCamp.has(s.id) && !inRound.has(s.id));
  }
  const schoolsInRound = (rid) => new Set(campaigns.filter((c) => c.round_id === rid).flatMap((c) => c.links.map((l) => l.school_id)));

  function dueHTML(c) {
    if (c.status !== 'open') return '';
    if (!c.due_date) return c.manageable ? ` · <button class="btn quiet small" type="button" data-due="${c.id}">Zieldatum setzen</button>` : '';
    const past = UI.duePast(c.due_date);
    return ` · <span class="due ${past ? 'past' : ''}">Ausfüllen bis ${esc(UI.dueShort(c.due_date))}${past ? ' (vorbei)' : ''}</span>${c.manageable ? ` <button class="btn quiet small" type="button" data-due="${c.id}">ändern</button>` : ''}`;
  }

  function cardHTML(c) {
    const n = Block.count(c);
    const who = c.byTraeger ? 'durch Rektorat/Hauptschulleitung' : `durch Schulleitung ${esc(c.owner_school_name || '')}`;
    const missing = missingSchools(c);
    const qState = !c.manageable ? 'legt Rektorat/Hauptschulleitung fest' : c.submitted > 0 ? 'nicht mehr änderbar (bereits Teilnahmen)' : n ? 'bearbeiten' : 'ergänzen';
    return `<article class="camp-card ${c.status}" id="camp-${c.id}" data-id="${c.id}">
      <div class="camp-head"><span class="row" style="gap:10px"><h3>${esc(c.title)}</h3>${c.round_id ? `<span class="status round">Vorgabe AVS</span>` : ''}</span>
        <span class="status ${c.status}">${c.status === 'open' ? 'offen' : 'geschlossen'}</span></div>
      <div class="camp-meta" data-meta="${c.id}">Eröffnet am ${date(c.created_at)} ${who}${c.closed_at ? ' · geschlossen am ' + date(c.closed_at) : ''}${dueHTML(c)}</div>
      ${isRektorat() && c.links.length > 1 ? `<p class="small"><b>Total ${c.submitted}</b> abgeschlossen, ${c.drafts} in Bearbeitung · ${c.links.length} Schulen</p>` : ''}
      <div class="links">${c.links.map((l) => linkRow(c, l)).join('')}</div>
      ${missing.length ? `<div class="add-school" data-addschool="${c.id}"><button class="btn quiet small" type="button" data-addopen="${c.id}">Schulhaus aufnehmen</button>
        <span class="small muted">${missing.length === 1 ? esc(missing[0].name) + ' ist' : missing.length + ' Schulhäuser sind'} noch nicht dabei.</span></div>` : ''}
      <div class="camp-actions">
        <a class="btn" href="#auswertung/c:${c.id}">Auswertung ansehen</a>
        ${c.manageable ? `<span class="confirm" data-toggle="${c.id}"></span>` : ''}
      </div>
      <details class="camp-questions" data-q="${c.id}" ${openQ === c.id ? 'open' : ''}>
        <summary>Eigene Fragen <span class="muted small">· ${n ? n + (n === 1 ? ' Frage' : ' Fragen') : 'keine'} · ${qState}</span></summary>
        <div class="q-box" id="q-box-${c.id}"></div>
      </details>
    </article>`;
  }

  /* Erste Schritte (Rektorat ohne Erhebung): kurze Standanzeige, der Weg führt über den Assistenten.
   * Die Checkliste ist die Rückfallebene für alle, die den Assistenten abbrechen oder einzeln nacharbeiten. */
  async function renderSteps() {
    const box = $('#start-steps');
    if (campaigns.length || !isRektorat()) { box.innerHTML = ''; $('#camp-intro').hidden = false; return; }
    $('#camp-intro').hidden = true;
    let t = null;
    try { t = await api('GET', 'leitung/team'); } catch { /* ohne Zahlen weiter */ }
    const n = ctx.schools.length;
    const mitLeitung = t ? ctx.schools.filter((s) => t.users.some((u) => u.role === 'leitung' && u.school_id === s.id) || t.invites.some((i) => i.role === 'leitung' && i.school_id === s.id)).length : 0;
    // Jede Zeile sagt, was zu tun ist und was daraus folgt – nicht nur den Stand
    const schritte = [
      { fertig: n > 0, titel: 'Schulhäuser erfassen',
        was: 'Namen eintragen. Jedes Schulhaus erhält später einen eigenen Teilnahmelink und eine eigene Auswertung.',
        stand: n ? ctx.schools.map((x) => esc(x.name)).join(', ') : 'noch keine erfasst' },
      { fertig: n > 0 && mitLeitung === n, titel: 'Zugänge für die Schulleitungen',
        was: 'Freiwillig. Mit eigenem Zugang verteilt die Schulleitung den Link selbst und sieht die Auswertung ihres Schulhauses.',
        stand: !n ? 'nach den Schulhäusern' : `${mitLeitung} von ${n} ${n === 1 ? 'Schulhaus' : 'Schulhäusern'}` },
      { fertig: false, titel: 'Erhebung eröffnen',
        was: 'Danach erhalten Sie die Links und geben sie weiter.', stand: 'noch nicht eröffnet' },
    ];
    const jetzt = schritte.findIndex((x) => !x.fertig);
    const zeile = (x, i) =>
      `<li class="${x.fertig ? 'done' : ''}${i === jetzt ? ' now' : ''}"><span class="ck" aria-hidden="true">${x.fertig ? '✓' : ''}</span>
        <span><b>${x.titel}</b>${i === jetzt ? ' <span class="now-tag">jetzt</span>' : ''}
          <span class="st">${x.was}</span><span class="st stand">Stand: ${x.stand}</span></span></li>`;
    box.innerHTML = `<section class="panel first-steps stack" style="gap:16px" aria-labelledby="h-steps">
      <div class="stack" style="gap:6px">
        <p class="eyebrow">Schritt ${jetzt + 1} von ${schritte.length}</p>
        <h3 id="h-steps">Selbsteinschätzung einrichten</h3>
        <p style="max-width:74ch">Damit Ihre Lehrpersonen teilnehmen können, braucht es drei Dinge: die Namen Ihrer Schulhäuser, auf Wunsch Zugänge für die Schulleitungen und das Eröffnen der Erhebung.
          Am Schluss erhalten Sie pro Schulhaus einen Link, den Sie weitergeben.
          <b>Sie selbst füllen keinen Fragebogen aus</b> – das tun die Lehrpersonen, in rund 20 Minuten.</p></div>
      <ul class="ck-list">${schritte.map(zeile).join('')}</ul>
      <div class="row" style="gap:14px;align-items:center">
        <button class="btn" type="button" id="btn-wizard">Jetzt einrichten</button>
        <span class="small muted">Dauert etwa zwei Minuten. Abbrechen ist jederzeit möglich, Erfasstes bleibt erhalten.</span>
      </div>
    </section>`;
    $('#btn-wizard').addEventListener('click', () => Wizard.open({
      schools: () => ctx.schools.map((s) => ({ ...s, hatLeitung: !!t && (t.users.some((u) => u.role === 'leitung' && u.school_id === s.id) || t.invites.some((i) => i.role === 'leitung' && i.school_id === s.id)) })),
      traegerName: () => ctx.traeger.name,
      vorgabe: () => ctx.rounds.find((r) => r.active) || null,
      refresh: async () => { await refreshCtx(); try { t = await api('GET', 'leitung/team'); } catch { /* ohne Zahlen weiter */ } },
      reload: () => loadCampaigns(),
    }));
  }

  // Läuft bereits eine Erhebung, soll das Formular nicht zu einer zweiten verleiten
  function setCreateHint(openCount) {
    const el = $('#create-hint');
    if (!el) return;
    el.hidden = !openCount;
    if (openCount) {
      el.textContent = openCount === 1
        ? 'Eine Erhebung läuft bereits. Eine zusätzliche brauchen Sie nur, wenn Sie zu einem anderen Zeitpunkt oder zu einem anderen Zweck erheben möchten. Für weitere Schulhäuser genügt «Schulhaus aufnehmen» in der laufenden Erhebung.'
        : `Es laufen bereits ${openCount} Erhebungen. Eine zusätzliche brauchen Sie nur, wenn Sie zu einem anderen Zeitpunkt oder zu einem anderen Zweck erheben möchten.`;
    }
  }

  function renderCampaigns() {
    const list = $('#camp-list');
    renderSteps();
    if (!campaigns.length) {
      // Beim Rektorat führt der Assistent; das Formular bleibt als zweiter Weg zu, aber vorhanden
      $('#create-box').open = !isRektorat();
      setCreateHint(0);
      list.innerHTML = isRektorat() ? '' : `<p class="muted">Noch keine Erhebung. Unten mit «Neue Erhebung eröffnen» beginnen und den Link an die Lehrpersonen weitergeben.</p>`;
      return;
    }
    const open = campaigns.filter((c) => c.status === 'open');
    setCreateHint(open.length);
    const past = campaigns.filter((c) => c.status !== 'open');
    if (openQ && !byId(openQ)) openQ = null;
    if (openQ && past.some((c) => c.id === openQ)) pastOpen = true;
    list.innerHTML = (open.length ? open.map(cardHTML).join('') : `<p class="muted">Zurzeit ist keine Erhebung offen. Unten mit «Neue Erhebung eröffnen» eine neue beginnen.</p>`) +
      (past.length ? `<details class="past" id="past-box" ${pastOpen || !open.length ? 'open' : ''}><summary>Frühere Erhebungen (${past.length})</summary>
        <div class="stack">${past.map(cardHTML).join('')}</div></details>` : '');
    const pb = $('#past-box');
    if (pb) pb.addEventListener('toggle', () => { pastOpen = pb.open; });

    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(linkFor(linkById(b.dataset.copy)), b)));
    $$('[data-mail]').forEach((b) => b.addEventListener('click', () => showMail(linkById(b.dataset.mail))));
    $$('[data-slmail]').forEach((b) => b.addEventListener('click', () => showLeaderMail(linkById(b.dataset.slmail))));
    $$('[data-qr]').forEach((b) => b.addEventListener('click', () => showQR(linkById(b.dataset.qr))));
    $$('[data-expected]').forEach((b) => b.addEventListener('click', () => editExpected(linkById(b.dataset.expected))));
    $$('[data-due]').forEach((b) => b.addEventListener('click', () => editDue(byId(b.dataset.due))));
    $$('[data-addopen]').forEach((b) => b.addEventListener('click', () => addSchool(byId(b.dataset.addopen))));
    $$('[data-toggle]').forEach((el) => {
      const c = byId(el.dataset.toggle);
      if (c.status === 'open') {
        const q = c.drafts > 0
          ? `Erhebung schliessen? ${c.drafts} Person${c.drafts === 1 ? ' ist' : 'en sind'} noch in Bearbeitung und ${c.drafts === 1 ? 'kann' : 'können'} danach nicht mehr abschliessen.`
          : 'Erhebung schliessen? Danach sind keine neuen Teilnahmen mehr möglich.';
        confirmButton(el, 'Erhebung schliessen', q, 'Ja, schliessen', () => toggle(c, 'closed'), 'btn quiet');
      } else {
        el.innerHTML = '<button class="btn quiet" type="button">Wieder öffnen</button>';
        el.firstChild.addEventListener('click', () => toggle(c, 'open'));
      }
    });
    // Eigene Fragen: immer nur ein Editor offen; ungespeicherte Änderungen nur nach Rückfrage verwerfen
    $$('details.camp-questions > summary').forEach((sm) => sm.addEventListener('click', (e) => {
      e.preventDefault();
      const d = sm.parentElement, id = d.dataset.q;
      if (d.open) {
        if (Block.currentId() === id && !leaveOk()) return;
        if (Block.currentId() === id) Block.discard();
        d.open = false; openQ = null;
        return;
      }
      if (Block.currentId() && Block.currentId() !== id && !leaveOk()) return;
      if (Block.currentId() !== id) Block.discard();
      $$('details.camp-questions[open]').forEach((x) => { x.open = false; });
      openQ = id; d.open = true;
      mountQuestions(id);
    }));
    if (openQ) mountQuestions(openQ);
  }
  function mountQuestions(id, msg) {
    const box = $('#q-box-' + id);
    if (!box) return;
    Block.open(id, { box, campaigns: () => campaigns,
      reload: async (cid, m) => { openQ = cid; await loadCampaigns(); const b = $(`#q-box-${cid} #ed-msg`); if (b) { b.className = 'small ok'; b.textContent = m; } } });
    if (msg) { const b = box.querySelector('#ed-msg'); if (b) { b.className = 'small ok'; b.textContent = msg; } }
  }
  async function toggle(c, status) { await api('PATCH', 'leitung/campaigns/' + c.id, { status }); loadCampaigns(); }

  function editExpected(l) {
    const box = $(`[data-quote="${l.id}"]`);
    box.innerHTML = `<span class="inline-edit"><label class="small" for="exp-${l.id}">Anzahl Lehrpersonen</label>
      <input type="text" inputmode="numeric" id="exp-${l.id}" value="${l.expected || ''}">
      <button class="btn secondary small" type="button">Speichern</button><span class="error small"></span></span>`;
    const inp = box.querySelector('input');
    inp.focus();
    const saveIt = async () => {
      try { await api('PATCH', 'leitung/links/' + l.id, { expected: inp.value.trim() || null }); loadCampaigns(); }
      catch (err) { box.querySelector('.error').textContent = err.message; }
    };
    box.querySelector('button').addEventListener('click', saveIt);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveIt(); } });
  }

  function editDue(c) {
    const meta = $(`[data-meta="${c.id}"]`);
    meta.innerHTML = `<span class="inline-edit"><label class="small" for="due-${c.id}">Ausfüllen bis</label>
      <input type="date" id="due-${c.id}" value="${esc(c.due_date || '')}" style="width:auto">
      <button class="btn secondary small" type="button" data-s>Speichern</button>
      ${c.due_date ? '<button class="btn quiet small" type="button" data-r>Kein Zieldatum</button>' : ''}
      <button class="btn quiet small" type="button" data-c>Abbrechen</button><span class="error small"></span></span>`;
    const inp = meta.querySelector('input');
    inp.focus();
    const put = async (v) => {
      try { await api('PATCH', 'leitung/campaigns/' + c.id, { dueDate: v }); loadCampaigns(); }
      catch (err) { meta.querySelector('.error').textContent = err.message; }
    };
    meta.querySelector('[data-s]').addEventListener('click', () => put(inp.value || null));
    const r = meta.querySelector('[data-r]'); if (r) r.addEventListener('click', () => put(null));
    meta.querySelector('[data-c]').addEventListener('click', renderCampaigns);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); put(inp.value || null); } });
  }

  function addSchool(c) {
    const box = $(`[data-addschool="${c.id}"]`);
    const miss = missingSchools(c);
    box.innerHTML = `<label class="small" for="add-${c.id}"><b>Schulhaus aufnehmen</b></label>
      <select id="add-${c.id}" style="width:auto">${miss.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <button class="btn secondary small" type="button" data-s>Aufnehmen</button><button class="btn quiet small" type="button" data-c>Abbrechen</button>
      <span class="small muted">Das Schulhaus erhält einen eigenen Link für diese Erhebung.</span><span class="error small"></span>`;
    box.querySelector('[data-s]').addEventListener('click', async () => {
      try { await api('POST', `leitung/campaigns/${c.id}/links`, { schoolId: box.querySelector('select').value }); loadCampaigns(); }
      catch (err) { box.querySelector('.error').textContent = err.message; }
    });
    box.querySelector('[data-c]').addEventListener('click', renderCampaigns);
  }

  function mailText(l) {
    const due = l.campaign.due_date ? UI.dueLong(l.campaign.due_date) : '[Datum]';
    return `Liebe Kolleginnen und Kollegen

Im Rahmen der Erhebung «${l.campaign.title}» laden wir Sie ein, die Selbsteinschätzung zu Ihren digitalen Kompetenzen auszufüllen. Sie dauert etwa 20 Minuten und lässt sich jederzeit unterbrechen.

Link zur Selbsteinschätzung für ${l.school_name}:
${linkFor(l)}

Die Teilnahme erfolgt ohne Namen. Nach dem Start erhalten Sie einen persönlichen Code. Bitte bewahren Sie ihn gut auf: Damit können Sie später weiterfahren und Ihr Profil wieder öffnen. Schulleitung sowie Rektorat/Hauptschulleitung sehen nur zusammengefasste Ergebnisse, keine einzelnen Profile.

Bitte schliessen Sie die Selbsteinschätzung bis ${due} ab.

Freundliche Grüsse
${signature()}`;
  }
  function sharePanel(l) {
    $$('[data-share]').forEach((p) => { if (p.dataset.share !== l.id) p.hidden = true; });
    const p = $(`[data-share="${l.id}"]`);
    p.hidden = false;
    return p;
  }
  function showMail(l) {
    const p = sharePanel(l);
    const subject = `Selbsteinschätzung digitale Kompetenzen: ${l.campaign.title}`;
    p.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">E-Mail an die Lehrpersonen${isRektorat() ? ' von ' + esc(l.school_name) : ''}</h4><button class="btn quiet small" type="button" data-close>Schliessen</button></div>
      <p class="small muted">${l.campaign.due_date ? 'Text bei Bedarf anpassen' : 'Text anpassen (zum Beispiel das Datum)'}, dann kopieren oder im E-Mail-Programm öffnen.</p>
      <div class="field"><label for="mail-subj-${l.id}" class="small">Betreff</label><input type="text" id="mail-subj-${l.id}" value="${esc(subject)}"></div>
      <div class="field"><label for="mail-body-${l.id}" class="small">Text</label><textarea id="mail-body-${l.id}">${esc(mailText(l))}</textarea></div>
      <div class="row"><button class="btn secondary" type="button" data-copytext>Text kopieren</button><a class="btn secondary" data-mailto href="#">Im E-Mail-Programm öffnen</a></div>`;
    const upd = () => { p.querySelector('[data-mailto]').href = 'mailto:?subject=' + encodeURIComponent($(`#mail-subj-${l.id}`).value) + '&body=' + encodeURIComponent($(`#mail-body-${l.id}`).value); };
    upd();
    p.querySelectorAll('input, textarea').forEach((x) => x.addEventListener('input', upd));
    p.querySelector('[data-copytext]').addEventListener('click', (e) => copyText($(`#mail-body-${l.id}`).value, e.currentTarget));
    p.querySelector('[data-close]').addEventListener('click', () => { p.hidden = true; });
  }
  /* E-Mail des Rektorats an die Schulleitung eines Schulhauses.
   * Mit Zugang: Hinweis auf Anmeldung (dort Rücklauf, Vorlagen, Auswertung). Ohne Zugang: Link zum Weiterleiten. */
  function leaderMailText(l, leaders) {
    const due = l.campaign.due_date ? UI.dueLong(l.campaign.due_date) : '';
    const greet = leaders.length === 1 && leaders[0].name && !/^[a-z0-9._-]+$/.test(leaders[0].name) ? `Guten Tag ${leaders[0].name}` : 'Guten Tag';
    const intro = `Für die Selbsteinschätzung «Digitale Kompetenzen von Lehrpersonen» ist die Erhebung «${l.campaign.title}» eröffnet. ${l.school_name} nimmt mit einem eigenen Link teil.`;
    const privacy = 'Die Teilnahme dauert etwa 20 Minuten und erfolgt ohne Namen. Schulleitung sowie Rektorat/Hauptschulleitung sehen nur zusammengefasste Ergebnisse, keine einzelnen Profile.';
    const body = leaders.length
      ? `${intro}

Bitte geben Sie den Link an Ihre Lehrpersonen weiter${due ? ` und bitten Sie um Teilnahme bis ${due}` : ''}. Nach der Anmeldung unter ${location.origin}/leitung finden Sie ihn unter «Erhebungen», zusammen mit einer E-Mail-Vorlage für die Lehrpersonen und einem QR-Code. Dort sehen Sie auch den Rücklauf und später die Auswertung Ihres Schulhauses.

Link für die Lehrpersonen von ${l.school_name}:
${linkFor(l)}

${privacy}`
      : `${intro}

Bitte leiten Sie den folgenden Link an Ihre Lehrpersonen weiter${due ? `, mit der Bitte um Teilnahme bis ${due}` : ''}:
${linkFor(l)}

${privacy}`;
    return `${greet}

${body}

Freundliche Grüsse
${signature()}`;
  }
  function showLeaderMail(l) {
    const p = sharePanel(l);
    const school = ctx.schools.find((s) => s.id === l.school_id) || {};
    const leaders = school.leaders || [];
    const to = leaders.map((x) => x.email).filter(Boolean).join(', ');
    const subject = `Erhebung «${l.campaign.title}» eröffnet: ${l.school_name}`;
    p.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">E-Mail an die Schulleitung von ${esc(l.school_name)}</h4><button class="btn quiet small" type="button" data-close>Schliessen</button></div>
      <p class="small muted">${leaders.length
        ? `Die Schulleitung hat einen eigenen Zugang und findet den Link auch nach dem Anmelden. Text bei Bedarf anpassen, dann kopieren oder im E-Mail-Programm öffnen.`
        : `Für ${esc(l.school_name)} ist noch kein Zugang für eine Schulleitung eingerichtet. Die Vorlage enthält darum den Link zum Weiterleiten. Empfänger selbst eintragen oder die Schulleitung unter <a href="#team">Schulen und Zugänge</a> einladen.`}</p>
      <div class="field"><label for="slm-to-${l.id}" class="small">An</label><input type="text" id="slm-to-${l.id}" value="${esc(to)}" placeholder="E-Mail der Schulleitung"></div>
      <div class="field"><label for="slm-subj-${l.id}" class="small">Betreff</label><input type="text" id="slm-subj-${l.id}" value="${esc(subject)}"></div>
      <div class="field"><label for="slm-body-${l.id}" class="small">Text</label><textarea id="slm-body-${l.id}">${esc(leaderMailText(l, leaders))}</textarea></div>
      <div class="row"><button class="btn secondary" type="button" data-copytext>Text kopieren</button><a class="btn secondary" data-mailto href="#">Im E-Mail-Programm öffnen</a></div>`;
    const upd = () => {
      const rcpt = $(`#slm-to-${l.id}`).value.split(/[,;\s]+/).filter(Boolean).map((a) => a.replace(/[?&#%]/g, encodeURIComponent)).join(',');
      p.querySelector('[data-mailto]').href = 'mailto:' + rcpt + '?subject=' + encodeURIComponent($(`#slm-subj-${l.id}`).value) + '&body=' + encodeURIComponent($(`#slm-body-${l.id}`).value);
    };
    upd();
    p.querySelectorAll('input, textarea').forEach((x) => x.addEventListener('input', upd));
    p.querySelector('[data-copytext]').addEventListener('click', (e) => copyText($(`#slm-body-${l.id}`).value, e.currentTarget));
    p.querySelector('[data-close]').addEventListener('click', () => { p.hidden = true; });
  }
  function showQR(l) {
    const p = sharePanel(l);
    let svg = '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(linkFor(l));
      qr.make();
      svg = qr.createSvgTag(6, 4);
    } catch { svg = '<p class="error">Der QR-Code konnte nicht erstellt werden.</p>'; }
    p.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">QR-Code für «${esc(l.campaign.title)}» · ${esc(l.school_name)}</h4><button class="btn quiet small" type="button" data-close>Schliessen</button></div>
      <div class="qr-box"><div class="qr" aria-label="QR-Code zum Link der Erhebung" role="img">${svg}</div>
        <div class="stack" style="gap:10px;max-width:46ch"><p class="small">Für Aushang, Präsentation oder Konferenz. Den Link immer mit abdrucken, damit er auch ohne Scanner nutzbar ist:</p>
          <p class="small"><code>${esc(linkFor(l))}</code></p>
          <div class="row"><button class="btn secondary" type="button" data-png>Als Bild speichern (PNG)</button><button class="btn quiet" type="button" data-svg>Als SVG speichern</button></div></div></div>`;
    p.querySelector('[data-close]').addEventListener('click', () => { p.hidden = true; });
    const svgEl = p.querySelector('.qr svg');
    const fname = `QR_${(l.campaign.title + '_' + l.school_name).replace(/[^\wäöüÄÖÜ-]+/g, '_')}`;
    p.querySelector('[data-svg]').addEventListener('click', () => download(fname + '.svg', svgEl.outerHTML, 'image/svg+xml'));
    p.querySelector('[data-png]').addEventListener('click', () => {
      const img = new Image();
      img.onload = () => {
        const size = 800;
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0, size, size);
        cv.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgEl.outerHTML);
    });
  }

  /* Formular «Neue Erhebung»
   * Die Vorgabe des AVS ist vorgewählt, solange noch ein Schulhaus fehlt; Schulhäuser, die daran schon
   * teilnehmen, sind ausgegraut. So entsteht der Fehler «bereits eröffnet» gar nicht erst. */
  let formBuilt = false;
  function fillCreateForm() {
    if (formBuilt && $('#create-box').open) return; // offenes Formular nicht unter den Händen neu aufbauen
    formBuilt = true;
    const active = ctx.rounds.filter((r) => r.active);
    const mine = isRektorat() ? ctx.schools.map((s) => s.id) : [ctx.schools[0] && ctx.schools[0].id];
    const free = (r) => { const used = schoolsInRound(r.id); return mine.filter((id) => !used.has(id)).length; };
    $('#camp-round-field').hidden = !active.length;
    $('#camp-round').innerHTML = active.map((r) => {
      const f = free(r);
      return `<option value="${r.id}" ${f ? '' : 'disabled'}>${esc(r.title)} (Vorgabe AVS)${f ? '' : isRektorat() ? ' – alle Schulhäuser nehmen bereits teil' : ' – Ihr Schulhaus nimmt bereits teil'}</option>`;
    }).join('') + `<option value="">Eigene, zusätzliche Erhebung</option>`;
    const first = active.find((r) => free(r));
    $('#camp-round').value = first ? first.id : '';
    const noSchool = isRektorat() && !ctx.schools.length;
    $('#form-campaign button[type=submit]').disabled = noSchool;
    if (noSchool) $('#camp-schools').innerHTML = '<p class="small"><b>Zuerst ein Schulhaus erfassen</b> (oben unter «Erste Schritte»).</p>';
    else if (isRektorat()) {
      $('#camp-schools').innerHTML = ctx.schools.map((s) => `<label class="check small"><input type="checkbox" value="${s.id}" checked><span>${esc(s.name)}<span class="muted" data-inround hidden> · nimmt bereits teil</span></span></label>`).join('');
    }
    const syncRound = () => {
      const r = active.find((x) => x.id === $('#camp-round').value);
      $('#camp-title').placeholder = r ? r.title : 'z. B. Herbst 2026';
      $('#camp-round-hint').textContent = r ? 'Vom AVS vorgegeben. Jedes Schulhaus nimmt einmal teil. Der Titel ist freiwillig.' : 'Zusätzlich zur Vorgabe des AVS, zum Beispiel ein Jahr später zum Vergleich.';
      const used = r ? schoolsInRound(r.id) : new Set();
      $$('#camp-schools input').forEach((i) => {
        const u = used.has(i.value);
        i.disabled = u; if (u) i.checked = false; else if (!i.dataset.touched) i.checked = true;
        i.closest('label').querySelector('[data-inround]').hidden = !u;
      });
    };
    $('#camp-round').onchange = syncRound;
    $$('#camp-schools input').forEach((i) => i.addEventListener('change', () => { i.dataset.touched = '1'; }));
    syncRound();
    $('#camp-schools-field').hidden = !isRektorat();
    $('#camp-due').min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('#camp-intro').textContent = isRektorat()
      ? 'Mit einer Erhebung laden Sie Ihre Lehrpersonen zur Selbsteinschätzung ein. Sie bleibt offen, bis Sie sie schliessen. Jede Schule erhält einen eigenen Link. Rektorat bzw. Hauptschulleitung sehen die Auswertung aller Schulen, jede Schulleitung die Auswertung ihrer Schule. Schulleitungen können auch selbst Erhebungen für ihre Schule eröffnen.'
      : 'Mit einer Erhebung laden Sie Ihre Lehrpersonen zur Selbsteinschätzung ein. Sie bleibt offen, bis Sie sie schliessen. Erhebungen von Rektorat/Hauptschulleitung erscheinen hier ebenfalls, mit dem Link für diese Schule. Bei einer späteren Erhebung sehen Lehrpersonen mit ihrem Code den Vergleich zum letzten Mal.';
  }
  $('#create-box').addEventListener('toggle', () => { if (!$('#create-box').open) { formBuilt = false; fillCreateForm(); } });

  function sourcesList() {
    const list = campaigns.map((c) => ({ value: 'c:' + c.id, label: c.title + (c.status === 'closed' ? ' (geschlossen)' : '') }));
    if (isRektorat()) {
      // Vorgabe des AVS als Ganzes: nur sinnvoll, wenn die Schulhäuser daran in mehreren Erhebungen teilnehmen
      ctx.rounds.forEach((r) => {
        const n = campaigns.filter((c) => c.round_id === r.id).length;
        if (n > 1) list.unshift({ value: 'r:' + r.id, label: `${r.title}: alle Schulen (${n} Erhebungen)` });
      });
    }
    return list;
  }
  const sourceTitle = (v) => (sourcesList().find((x) => x.value === v) || { label: '' }).label.replace(/ \(geschlossen\)$/, '');
  // Standard in der Auswertung: die Erhebung mit Ergebnissen, offene und kantonale zuerst, sonst die mit den meisten Teilnahmen
  function defaultSource() {
    const best = campaigns.slice().sort((a, b) => (b.submitted > 0) - (a.submitted > 0)
      || (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
      || (a.round_id ? 0 : 1) - (b.round_id ? 0 : 1) || b.submitted - a.submitted)[0];
    return 'c:' + best.id;
  }

  function fillSelects() {
    const withBlock = campaigns.filter((c) => Block.count(c));
    $('#camp-copy-field').hidden = !withBlock.length;
    $('#camp-copy').innerHTML = `<option value="">Ohne eigene Fragen beginnen</option>` + withBlock.map((c) => `<option value="${c.id}">Eigene Fragen von «${esc(c.title)}» übernehmen</option>`).join('');
    $('#an-campaign').innerHTML = sourcesList().map((x) => `<option value="${x.value}">${esc(x.label)}</option>`).join('');
  }

  $('#form-campaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#camp-msg').textContent = '';
    try {
      const body = { title: $('#camp-title').value, roundId: $('#camp-round-field').hidden ? undefined : ($('#camp-round').value || undefined),
        copyBlockFrom: $('#camp-copy').value || undefined, dueDate: $('#camp-due').value || undefined };
      if (isRektorat()) body.schoolIds = $$('#camp-schools input:checked').map((i) => i.value);
      if (isRektorat() && !body.schoolIds.length) { $('#camp-msg').textContent = 'Bitte mindestens ein Schulhaus auswählen.'; return; }
      await api('POST', 'leitung/campaigns', body);
      $('#camp-title').value = ''; $('#camp-due').value = '';
      $('#create-box').open = false;
      await loadCampaigns();
    } catch (err) { $('#camp-msg').textContent = err.message; }
  });

  /* ---------- Auswertung ---------- */
  function openAnalysis(src) {
    $('#an-filters').hidden = !campaigns.length;
    if (!campaigns.length) { $('#an-out').innerHTML = '<p class="muted">Noch keine Erhebung vorhanden. Unter <a href="#erhebungen">Erhebungen</a> eine eröffnen.</p>'; return; }
    const list = sourcesList();
    const pick = list.find((x) => x.value === src) || list.find((x) => x.value === an.src) || list.find((x) => x.value === defaultSource());
    if (an.src !== pick.value) an = { src: pick.value, compare: '', school: '', zyklus: '' };
    $('#an-campaign').value = pick.value;
    loadAnalysis();
  }
  $('#an-campaign').addEventListener('change', (e) => { location.hash = 'auswertung/' + e.target.value; });

  async function loadAnalysis() {
    const list = sourcesList();
    $('#an-compare').innerHTML = `<option value="">Kein Vergleich</option>` + list.filter((x) => x.value !== an.src).map((x) => `<option value="${x.value}" ${x.value === an.compare ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    const params = (src) => '?source=' + encodeURIComponent(src) + (an.school ? '&school=' + encodeURIComponent(an.school) : '') + (an.zyklus ? '&zyklus=' + encodeURIComponent(an.zyklus) : '');
    const out = $('#an-out');
    out.innerHTML = '<p class="muted">Wird geladen …</p>';
    let data, cmp = null;
    try {
      data = await api('GET', 'leitung/aggregate' + params(an.src));
      if (an.compare) { try { cmp = await api('GET', 'leitung/aggregate' + params(an.compare)); } catch { cmp = { tooFew: true }; } }
    } catch (err) {
      if (err.status === 403 && (an.school || an.zyklus)) { an.school = ''; an.zyklus = ''; return loadAnalysis(); }
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`; return;
    }
    // Filter nur für Gruppen anbieten, die der Server freigibt
    $('#an-school-field').hidden = !isRektorat() || !data.multiSchool;
    $('#an-school').innerHTML = `<option value="">Alle Schulen</option>` + (data.schools || []).map((s) => `<option value="${s.id}" ${s.id === an.school ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#an-school').disabled = !(data.schools || []).length;
    $('#an-zyklus').innerHTML = `<option value="">Alle Zyklen</option>` + data.zyklen.map((z) => `<option ${z.zyklus === an.zyklus ? 'selected' : ''}>${esc(z.zyklus)}</option>`).join('');
    $('#an-zyklus').disabled = !data.zyklen.length && !an.zyklus;
    const schoolName = an.school ? ((data.schools || []).find((s) => s.id === an.school) || {}).name : '';
    const filterText = [schoolName, an.zyklus].filter(Boolean).join(' · ');
    const c = an.src.startsWith('c:') ? byId(an.src.slice(2)) : null;
    Analysis.render(out, data, cmp, {
      title: sourceTitle(an.src),
      cmpTitle: an.compare ? sourceTitle(an.compare) : '',
      org: isRektorat() ? (schoolName ? `${schoolName} · ${ctx.traeger.name}` : ctx.traeger.name) : orgName(),
      filterText,
      profileTitle: isRektorat() && !an.school && data.multiSchool ? 'Profil des Schulträgers' : 'Profil der Schule',
      groups: [['zyklen', 'Zyklen im Vergleich', ''], ['schulen', 'Schulen im Vergleich', 'Dient der Planung der Weiterbildung, nicht als Rangliste.']],
      showCustom: true,
      tooFewHint: c && c.status === 'open' ? `<p class="small">Den Link unter <a href="#erhebungen/${c.id}">Erhebungen</a> an die Lehrpersonen weitergeben.</p>` : '',
    });
  }
  $('#an-compare').addEventListener('change', (e) => { an.compare = e.target.value; loadAnalysis(); });
  $('#an-school').addEventListener('change', (e) => { an.school = e.target.value; an.zyklus = ''; loadAnalysis(); });
  $('#an-zyklus').addEventListener('change', (e) => { an.zyklus = e.target.value; loadAnalysis(); });

  /* ---------- Schulen und Zugänge (Selbstverwaltung) ----------
   * Rektorat/Hauptschulleitung: pro Schulhaus Zyklen, Name und Schulleitung (Status und Einladung in der Zeile).
   * Das Formular unten lädt nur noch Personen für alle Schulhäuser ein (Stellvertretung, Verwaltung).
   * Schulleitung: Personen für das eigene Schulhaus (z. B. Co-Leitung). */
  const zyklenText = (z) => (z.length === 3 ? 'Zyklus 1–3' : z.length === 1 ? z[0] + ' (fest)' : z.join(', ').replace(/, Zyklus /g, ', '));
  const ROLE_LABEL = (u) => (u.role === 'traeger' ? 'Alle Schulhäuser (Ebene Schulträger)' : 'Schulleitung ' + (u.school_name || ''));
  const personName = (x) => x.display_name || x.name || x.email || x.username || 'ohne Namen';

  // «Erneut senden» verschickt einen neuen Link per E-Mail; ohne Versand (oder ohne Adresse) gibt es einen neuen Link zum Weitergeben
  const canMail = (i) => ctx.mail && i.email;
  const inviteActions = (i) => `<button class="btn quiet small" type="button" data-irenew="${i.id}">${canMail(i) ? 'Erneut senden' : 'Neuer Link'}</button><span class="confirm" data-idel="${i.id}"></span>`;
  function schoolLead(s, t) {
    const leads = t.users.filter((u) => u.role === 'leitung' && u.school_id === s.id);
    const inv = t.invites.filter((i) => i.role === 'leitung' && i.school_id === s.id);
    const lines = [];
    leads.forEach((u) => lines.push(`<span>Schulleitung: <b>${esc(personName(u))}</b></span>${UI.userChip(u)}`));
    inv.forEach((i) => lines.push(`<span>Einladung an ${esc(i.name || i.email || 'ohne Namen')}</span>${UI.inviteChip(i)}${inviteActions(i)}`));
    if (!leads.length && !inv.length) lines.push('<span class="warn">Noch keine Schulleitung</span>');
    const any = leads.length || inv.length;
    return `<div class="school-lead small">${lines.map((l) => `<div>${l}</div>`).join('')}
        <div><button class="btn ${any ? 'quiet' : 'secondary'} small" type="button" data-slinv="${s.id}">${any ? 'Weitere Schulleitung einladen' : 'Schulleitung einladen'}</button></div></div>
      <form class="school-inv inline-edit" data-slform="${s.id}" hidden>
        <div class="field"><label for="sl-name-${s.id}" class="small">Name</label><input type="text" id="sl-name-${s.id}" style="width:220px"></div>
        <div class="field"><label for="sl-mail-${s.id}" class="small">E-Mail</label><input type="text" id="sl-mail-${s.id}" inputmode="email" autocomplete="off" style="width:260px"></div>
        <button class="btn small" type="submit">${ctx.mail ? 'Einladung senden' : 'Einladung erstellen'}</button><button class="btn quiet small" type="button" data-slcancel="${s.id}">Abbrechen</button><span class="error small" role="alert"></span>
      </form>
      <div class="box box--success" data-sinv="${s.id}" hidden></div>`;
  }

  async function loadTeam() {
    const box = $('#tab-team');
    let t;
    try { t = await api('GET', 'leitung/team'); } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
    const R = isRektorat();
    const traegerInvites = t.invites.filter((i) => (R ? i.role === 'traeger' : true));
    box.innerHTML = `
      <div class="stack" style="gap:6px"><h2>${R ? 'Schulen und Zugänge' : 'Zugänge'}</h2>
        <p class="muted small" style="max-width:74ch">${R
          ? `Hier verwalten Rektorat bzw. Hauptschulleitung die Schulhäuser und laden Personen ein. Eingeladene legen Benutzername und Passwort selbst fest.`
          : `Hier lädt die Schulleitung weitere Personen für dieses Schulhaus ein, zum Beispiel eine Co-Leitung. Eingeladene legen Benutzername und Passwort selbst fest.`}</p></div>

      ${R ? `<section class="stack" style="gap:12px" aria-labelledby="h-schools">
        <h3 id="h-schools">Schulhäuser</h3>
        <p class="small muted" style="max-width:74ch">Pro Schulhaus die Zyklen festlegen und die Schulleitung einladen${ctx.mail ? ' (die Einladung geht direkt per E-Mail)' : ''}. Wer keine Aufteilung nach Schulhaus braucht, erfasst nur einen Eintrag für die ganze Schule: ein Link, eine gemeinsame Auswertung. Mit eigenem Zugang sieht die Schulleitung Rücklauf und Auswertung ihres Schulhauses und verteilt den Link an ihre Lehrpersonen selbst. Bei einem Zyklus ist er für die Lehrpersonen fest eingestellt; bei mehreren wählen sie selbst, inklusive «zyklusübergreifend».</p>
        <ul class="list-plain team-list school-list">${t.schools.map((s) => `<li data-school="${s.id}">
          <div class="school-main"><span class="team-name">${esc(s.name)} <span class="small muted">· ${esc(zyklenText(s.zyklen))}${s.links ? ' · an Erhebungen beteiligt' : ''}</span></span>
            <span class="row" style="gap:6px"><button class="btn quiet small" type="button" data-zyk="${s.id}">Zyklen ändern</button><button class="btn quiet small" type="button" data-rename="${s.id}">Umbenennen</button>${s.links ? '' : `<span class="confirm" data-sdel="${s.id}"></span>`}</span></div>
          ${schoolLead(s, t)}</li>`).join('')}</ul>
        ${t.schools.some((s) => s.links) ? '<p class="small muted">Schulhäuser, die an einer Erhebung beteiligt sind, lassen sich hier nicht entfernen, damit keine Ergebnisse verloren gehen. Bei Bedarf entfernt sie das AVS.</p>' : ''}
        <form class="row" id="form-team-school" style="align-items:flex-end">
          <div class="field"><label for="team-school-new" class="small">Weiteres Schulhaus</label><input type="text" id="team-school-new" placeholder="z. B. Schulhaus Dorf" style="width:240px"></div>
          <button class="btn secondary" type="submit">Hinzufügen</button><span class="error small" id="team-school-msg" role="alert"></span>
        </form>
      </section>` : ''}

      <section class="stack" style="gap:12px" aria-labelledby="h-users">
        <h3 id="h-users">Personen mit Zugang</h3>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Tabelle der Personen mit Zugang"><table class="list">
          <thead><tr><th scope="col">Person</th><th scope="col">Zugang für</th><th scope="col">E-Mail</th><th scope="col">Letzte Anmeldung</th><th scope="col"><span class="sr-only">Aktionen</span></th></tr></thead>
          <tbody>${t.users.map((u) => `<tr><td><b>${esc(u.display_name || u.username)}</b>${u.display_name && u.display_name !== u.username ? `<br><span class="small muted">${esc(u.username)}</span>` : ''}${u.self ? ' <span class="status open">Sie</span>' : ''}</td>
            <td>${esc(ROLE_LABEL(u))}</td><td class="small">${esc(u.email || '–')}</td><td>${u.last_login ? date(u.last_login) : '–'}</td>
            <td>${u.self || (!R && u.role !== 'leitung') ? '' : `<div class="row" style="gap:4px"><button class="btn quiet small" type="button" data-ureset="${u.id}">Link für neues Passwort</button><span class="confirm" data-udel="${u.id}"></span></div>`}</td></tr>`).join('')}</tbody></table></div>
        <div class="box box--success" id="team-inv-out" hidden></div>
      </section>

      <section class="stack" style="gap:12px" aria-labelledby="h-invite">
        <h3 id="h-invite">${R ? 'Weitere Person für alle Schulhäuser einladen' : 'Weitere Person für dieses Schulhaus einladen'}</h3>
        <p class="small muted" style="max-width:74ch">${R
          ? 'Zum Beispiel eine Stellvertretung oder die Schulverwaltung. Sie erhalten dieselben Rechte wie Rektorat bzw. Hauptschulleitung. Schulleitungen oben beim jeweiligen Schulhaus einladen.'
          : 'Zum Beispiel eine Co-Leitung. Sie erhält dieselben Rechte für dieses Schulhaus.'}</p>
        <form class="stack" id="form-invite" style="gap:10px;max-width:760px">
          <div class="row">
            <div class="field"><label for="inv-name" class="small">Name</label><input type="text" id="inv-name" style="width:240px"></div>
            <div class="field"><label for="inv-email" class="small">E-Mail</label><input type="text" id="inv-email" inputmode="email" autocomplete="off" style="width:280px"></div>
          </div>
          <div class="row"><button class="btn" type="submit">${ctx.mail ? 'Einladung senden' : 'Einladung erstellen'}</button><span class="error small" id="inv-msg" role="alert"></span></div>
          ${ctx.mail ? '<p class="small muted">Die Einladung geht direkt per E-Mail an die angegebene Adresse. Ohne Adresse erscheint ein Link zum Weitergeben.</p>' : ''}
        </form>
      </section>

      ${traegerInvites.length ? `<section class="stack" style="gap:12px" aria-labelledby="h-open">
        <h3 id="h-open">Offene Einladungen${R ? ' für alle Schulhäuser' : ''}</h3>
        <ul class="list-plain team-list">${traegerInvites.map((i) => `<li><span class="row" style="gap:6px 10px"><span class="team-name">${esc(i.name || i.email || 'Ohne Namen')} <span class="small muted">· ${esc(i.role === 'traeger' ? 'Alle Schulhäuser' : 'Schulleitung ' + (i.school_name || ''))}</span></span>${UI.inviteChip(i)}</span>
          <span class="row" style="gap:6px">${inviteActions(i)}</span></li>`).join('')}</ul>
      </section>` : ''}`;

    UI.bindChips(box);
    const out = $('#team-inv-out');
    const from = () => signature();
    const roleText = (i) => (i.role === 'traeger' ? 'Person mit Zugang für alle Schulhäuser von ' + ctx.traeger.name : 'Schulleitung ' + (i.school_name || ''));
    // Einladungs-Panel beim Schulhaus, sonst unter «Personen mit Zugang»
    const panelFor = (i) => (i.role === 'leitung' && R && $(`[data-sinv="${i.school_id}"]`)) || out;
    if (R) {
      $('#form-team-school').addEventListener('submit', async (e) => {
        e.preventDefault(); $('#team-school-msg').textContent = '';
        try { await api('POST', 'leitung/schools', { name: $('#team-school-new').value }); await refreshCtx(); loadTeam(); }
        catch (err) { $('#team-school-msg').textContent = err.message; }
      });
      $$('[data-rename]').forEach((b) => b.addEventListener('click', () => {
        const main = b.closest('li').querySelector('.school-main'); const s = t.schools.find((x) => x.id === b.dataset.rename);
        main.innerHTML = `<span class="inline-edit"><label class="sr-only" for="ren-${s.id}">Neuer Name</label><input type="text" id="ren-${s.id}" value="${esc(s.name)}" style="width:260px">
          <button class="btn secondary small" type="button">Speichern</button><button class="btn quiet small" type="button">Abbrechen</button><span class="error small"></span></span>`;
        const [save, cancel] = main.querySelectorAll('button');
        main.querySelector('input').focus();
        save.addEventListener('click', async () => { try { await api('PATCH', 'leitung/schools/' + s.id, { name: main.querySelector('input').value }); await refreshCtx(); loadTeam(); } catch (err) { main.querySelector('.error').textContent = err.message; } });
        cancel.addEventListener('click', loadTeam);
      }));
      $$('[data-zyk]').forEach((b) => b.addEventListener('click', () => {
        const main = b.closest('li').querySelector('.school-main'); const s = t.schools.find((x) => x.id === b.dataset.zyk);
        main.innerHTML = `<fieldset class="inline-edit" style="border:0;padding:0;margin:0"><legend class="small"><b>Zyklen ${esc(s.name)}</b></legend>
          ${['Zyklus 1', 'Zyklus 2', 'Zyklus 3'].map((z) => `<label class="check small"><input type="checkbox" value="${z}" ${s.zyklen.includes(z) ? 'checked' : ''}><span>${z}</span></label>`).join('')}
          <button class="btn secondary small" type="button">Speichern</button><button class="btn quiet small" type="button">Abbrechen</button><span class="error small"></span></fieldset>`;
        const [save, cancel] = main.querySelectorAll('button');
        save.addEventListener('click', async () => {
          try { await api('PATCH', 'leitung/schools/' + s.id, { zyklen: [...main.querySelectorAll('input:checked')].map((i) => i.value) }); await refreshCtx(); loadTeam(); }
          catch (err) { main.querySelector('.error').textContent = err.message; }
        });
        cancel.addEventListener('click', loadTeam);
      }));
      $$('[data-sdel]').forEach((el) => confirmButton(el, 'Entfernen', 'Schulhaus entfernen?', 'Ja, entfernen', async () => { await api('DELETE', 'leitung/schools/' + el.dataset.sdel); await refreshCtx(); loadTeam(); }, 'btn quiet small'));
      // Schulleitung direkt beim Schulhaus einladen
      $$('[data-slinv]').forEach((b) => b.addEventListener('click', () => {
        const f = $(`[data-slform="${b.dataset.slinv}"]`);
        f.hidden = false; b.hidden = true; f.querySelector('input').focus();
      }));
      $$('[data-slcancel]').forEach((b) => b.addEventListener('click', () => {
        $(`[data-slform="${b.dataset.slcancel}"]`).hidden = true; $(`[data-slinv="${b.dataset.slcancel}"]`).hidden = false;
      }));
      $$('[data-slform]').forEach((f) => f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sid = f.dataset.slform, school = t.schools.find((x) => x.id === sid);
        const body = { role: 'leitung', schoolId: sid, name: $(`#sl-name-${sid}`).value, email: $(`#sl-mail-${sid}`).value };
        const msg = f.querySelector('.error');
        if (!body.email.trim() && !body.name.trim()) { msg.textContent = 'Bitte mindestens Name oder E-Mail angeben.'; return; }
        try {
          const r = await api('POST', 'leitung/invitations', body);
          await loadTeam();
          UI.inviteResult($(`[data-sinv="${sid}"]`), r, { email: body.email.trim(), name: body.name.trim(), roleText: 'Schulleitung ' + school.name, from: from() });
        } catch (err) { msg.textContent = err.message; }
      }));
    }
    $$('[data-ureset]').forEach((b) => b.addEventListener('click', async () => {
      const u = t.users.find((x) => x.id === b.dataset.ureset);
      try { const r = await api('POST', `leitung/users/${u.id}/reset`); UI.invitePanel(out, { ...r, reset: true, name: u.display_name, from: from() }); }
      catch (err) { out.hidden = false; out.textContent = err.message; }
    }));
    $$('[data-udel]').forEach((el) => confirmButton(el, 'Löschen', 'Zugang löschen?', 'Ja, löschen', async () => { await api('DELETE', 'leitung/users/' + el.dataset.udel); await refreshCtx(); loadTeam(); }, 'btn quiet small'));
    $$('[data-irenew]').forEach((b) => b.addEventListener('click', async () => {
      const i = t.invites.find((x) => x.id === b.dataset.irenew);
      const r = await api('POST', `leitung/invitations/${i.id}/renew`);
      await loadTeam();
      UI.inviteResult(panelFor(i), r, { email: i.email, name: i.name, roleText: roleText(i), from: from() });
    }));
    $$('[data-idel]').forEach((el) => confirmButton(el, 'Zurückziehen', 'Einladung zurückziehen?', 'Ja, zurückziehen', async () => { await api('DELETE', 'leitung/invitations/' + el.dataset.idel); loadTeam(); }, 'btn quiet small'));
    $('#form-invite').addEventListener('submit', async (e) => {
      e.preventDefault(); $('#inv-msg').textContent = '';
      const body = R ? { name: $('#inv-name').value, email: $('#inv-email').value, role: 'traeger' }
        : { name: $('#inv-name').value, email: $('#inv-email').value, role: 'leitung', schoolId: ctx.schools[0].id };
      if (!body.email.trim() && !body.name.trim()) { $('#inv-msg').textContent = 'Bitte mindestens Name oder E-Mail angeben.'; return; }
      try {
        const r = await api('POST', 'leitung/invitations', body);
        await loadTeam();
        UI.inviteResult($('#team-inv-out'), r, { email: body.email.trim(), name: body.name.trim(), roleText: roleText({ role: body.role, school_name: R ? '' : orgName() }), from: from() });
      } catch (err) { $('#inv-msg').textContent = err.message; }
    });
  }
  async function refreshCtx() { ctx = await api('GET', 'leitung/context'); formBuilt = false; fillCreateForm(); renderCampaigns(); }

  Staff.start(['traeger', 'leitung'], async () => {
    try {
      ctx = await api('GET', 'leitung/context');
      // Rolle immer ausschreiben: Rektorat (ganzer Träger) oder Schulleitung (ein Schulhaus)
      $('#school-name').textContent = isRektorat() ? `Rektorat/Hauptschulleitung · ${ctx.traeger.name}` : `Schulleitung · ${orgName()}${ctx.traeger.name !== orgName() ? ' · ' + ctx.traeger.name : ''}`;
      $('#tab-team-link').textContent = isRektorat() ? 'Schulen und Zugänge' : 'Zugänge';
      await loadCampaigns();
    } catch (err) { $('#camp-list').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    route();
  });
})();

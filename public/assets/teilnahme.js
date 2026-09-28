// Teilnahme der Lehrperson: Einstieg über Erhebungslink, persönlicher Code, Fragebogen mit automatischem Speichern, Profil.
(function () {
  'use strict';
  const { ITEMS, LV, $, $$, esc, fmt, date, api, radarSVG, meter, badge, download, today, confirmButton, copyText } = UI;
  const SUBS = DKCore.allSubareas(ITEMS);

  const CONTEXT_OPTIONS = {
    stufe: ['Kindergarten', 'Primarstufe 1.–2. Klasse', 'Primarstufe 3.–6. Klasse', 'Sekundarstufe I', 'Stufenübergreifend'],
    funktion: ['Klassenlehrperson', 'Fachlehrperson', 'Schulische Heilpädagogin / Schulischer Heilpädagoge', 'Lehrperson Deutsch als Zweitsprache', 'Andere Funktion'],
    erfahrung: ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'],
  };
  ['ctx', 'ctx2'].forEach((p) => Object.entries(CONTEXT_OPTIONS).forEach(([k, opts]) => {
    $(`#${p}-${k}`).innerHTML = `<option value="">Keine Angabe</option>` + opts.map((o) => `<option>${esc(o)}</option>`).join('');
  }));

  const m = location.pathname.match(/^\/t\/([^/]+)/);
  const TOKEN = m ? decodeURIComponent(m[1]) : null;
  let me = null;          // { school, responses }
  let cur = null;         // aktuelle Teilnahme (Antwortobjekt vom Server)
  let viewing = null;     // im Profil angezeigte Teilnahme
  let areaIdx = 0;

  function show(id) {
    $$('main > .view').forEach((v) => { v.hidden = v.id !== id; });
    $('#userbar').hidden = !me;
    window.scrollTo({ top: 0 });
  }
  function showError(title, text, actions = '') {
    $('#error-title').textContent = title;
    $('#error-text').textContent = text;
    $('#error-actions').innerHTML = actions;
    show('v-error');
  }

  async function loadMe() {
    try { me = await api('GET', 'me'); } catch { me = null; }
    return me;
  }

  async function openCampaignResponse() {
    const r = await api('POST', 'me/responses', { token: TOKEN });
    await loadMe();
    cur = me.responses.find((x) => x.id === r.responseId);
    if (cur.status === 'submitted') { viewing = cur; renderResult(); }
    else { startSurvey(); }
  }

  async function init() {
    if (TOKEN) {
      let camp;
      try { camp = await api('GET', 'c/' + encodeURIComponent(TOKEN)); }
      catch (e) { return showError('Dieser Link funktioniert nicht', e.message); }
      $('#school-name').textContent = camp.school.name;
      $('#campaign-name').textContent = 'Selbsteinschätzung · ' + camp.campaign.title;
      await loadMe();
      if (me) {
        try { return await openCampaignResponse(); }
        catch (e) {
          if (e.status === 403) {
            return showError('Angemeldet mit einem Code einer anderen Schule', 'Für diese Erhebung bitte abmelden und mit dem Code dieser Schule weiterfahren oder neu beginnen.', '<button class="btn" type="button" id="btn-err-logout">Abmelden</button>');
          }
          if (e.status !== 409) return showError('Fehler', e.message);
        }
      }
      if (camp.campaign.status !== 'open') {
        return showError('Diese Erhebung ist abgeschlossen', 'Neue Teilnahmen sind nicht mehr möglich. Frühere Profile lassen sich unter «Mein Profil» mit dem persönlichen Code ansehen.', '<a class="btn" href="/mein-profil">Mein Profil</a>');
      }
      show('v-welcome');
    } else {
      $('#campaign-name').textContent = 'Mein Profil';
      await loadMe();
      renderHome();
    }
  }
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-err-logout') { await api('POST', 'me/logout'); location.reload(); }
  });

  /* ---------- Einstieg ---------- */
  const readCtx = (p) => Object.fromEntries(Object.keys(CONTEXT_OPTIONS).map((k) => [k, $(`#${p}-${k}`).value || null]));
  $('#form-start').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#start-msg').textContent = '';
    try {
      const r = await api('POST', 'c/' + encodeURIComponent(TOKEN) + '/start', { context: readCtx('ctx') });
      await loadMe();
      cur = me.responses.find((x) => x.id === r.responseId);
      $('#code-out').textContent = r.code;
      $('#code-ack').checked = false;
      $('#btn-code-continue').disabled = true;
      show('v-code');
    } catch (err) { $('#start-msg').textContent = err.message; }
  });
  $('#btn-copy-code').addEventListener('click', (e) => copyText($('#code-out').textContent, e.currentTarget));
  $('#code-ack').addEventListener('change', (e) => { $('#btn-code-continue').disabled = !e.target.checked; });
  $('#btn-code-continue').addEventListener('click', () => startSurvey());

  async function codeLogin(input, msgEl, withToken) {
    msgEl.textContent = '';
    try {
      await api('POST', 'code-login', { code: input.value, token: withToken ? TOKEN : undefined });
      input.value = '';
      return true;
    } catch (err) { msgEl.textContent = err.message; return false; }
  }
  $('#form-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await codeLogin($('#code-in'), $('#code-msg'), true))) return;
    try { await openCampaignResponse(); }
    catch (err) {
      await loadMe();
      if (err.status === 409 && me) { renderHome(); } else { $('#code-msg').textContent = err.message; }
    }
  });
  $('#form-code-home').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await codeLogin($('#code-in-home'), $('#code-msg-home'), false))) return;
    await loadMe();
    renderHome();
  });
  $('#btn-logout').addEventListener('click', async () => {
    await api('POST', 'me/logout');
    location.href = TOKEN ? location.pathname : '/';
  });

  /* ---------- Fragebogen ---------- */
  let saveTimer = null, saving = false, pending = false;
  function setSaveState(t, cls = '') { const el = $('#save-state'); el.textContent = t; el.className = 'save-state ' + cls; }
  function scheduleSave() {
    setSaveState('Wird gespeichert …');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  async function save() {
    if (saving) { pending = true; return; }
    saving = true;
    try {
      await api('PUT', 'me/responses/' + cur.id, { answers: cur.answers, context: cur.context });
      setSaveState('Gespeichert um ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) + ' Uhr', 'ok');
    } catch (err) {
      setSaveState('Nicht gespeichert: ' + err.message, 'error');
    } finally {
      saving = false;
      if (pending) { pending = false; save(); }
    }
  }
  async function flush() { clearTimeout(saveTimer); await save(); }

  function startSurvey() {
    const p = DKCore.progress(ITEMS, cur.answers);
    const firstOpen = p.open[0];
    areaIdx = firstOpen ? ITEMS.areas.findIndex((a) => a.id === SUBS.find((s) => s.id === firstOpen).areaId) : 0;
    Object.keys(CONTEXT_OPTIONS).forEach((k) => { $(`#ctx2-${k}`).value = (cur.context && cur.context[k]) || ''; });
    ctxSummary();
    setSaveState(cur.updated_at ? 'Zuletzt gespeichert am ' + date(cur.updated_at) : '');
    show('v-survey');
    renderSurvey();
  }
  function ctxSummary() {
    const vals = Object.values(cur.context || {}).filter(Boolean);
    $('#ctx-summary').textContent = vals.length ? '· ' + vals.join(', ') : '· keine Angaben';
  }
  Object.keys(CONTEXT_OPTIONS).forEach((k) => $(`#ctx2-${k}`).addEventListener('change', () => {
    cur.context = readCtx('ctx2'); ctxSummary(); scheduleSave();
  }));

  function renderAreaNav() {
    $('#areanav').innerHTML = ITEMS.areas.map((a, i) => {
      const done = a.subareas.filter((s) => cur.answers[s.id] !== undefined).length;
      const full = done === a.subareas.length;
      return `<button type="button" data-area="${i}" aria-current="${i === areaIdx ? 'step' : 'false'}">
        <span>${a.id}&nbsp; ${esc(a.title)}</span><span class="cnt ${full ? 'done' : ''}">${full ? '✓' : done + '/' + a.subareas.length}</span></button>`;
    }).join('');
    $$('#areanav button').forEach((b) => b.addEventListener('click', () => { areaIdx = +b.dataset.area; renderSurvey(true); }));
    const p = DKCore.progress(ITEMS, cur.answers);
    $('#progress-fill').style.width = (100 * p.done / p.total) + '%';
    $('#progress-text').textContent = `${p.done} von ${p.total} Fragen beantwortet`;
  }
  function renderSurvey(focus) {
    const a = ITEMS.areas[areaIdx];
    $('#area-eyebrow').textContent = `Bereich ${areaIdx + 1} von ${ITEMS.areas.length}`;
    $('#h-area').textContent = a.title;
    $('#area-desc').textContent = a.description;
    $('#questions').innerHTML = a.subareas.map((s) => {
      const v = cur.answers[s.id];
      return `<fieldset class="q">
        <legend><span class="qid">${s.id}</span><span>${esc(s.title)}${s.ki ? ' <span class="chip">KI</span>' : ''}</span></legend>
        <p class="hint">Welche Aussage beschreibt das eigene Handeln am besten?</p>
        <div class="opts">${s.levels.map((l) => `
          <label class="opt"><input type="radio" name="q-${s.id}" id="q-${s.id}-${l.level}" value="${l.level}" ${v === l.level ? 'checked' : ''}><span>${esc(l.text)}</span></label>`).join('')}
          <label class="opt none"><input type="radio" name="q-${s.id}" id="q-${s.id}-0" value="0" ${v === 0 ? 'checked' : ''}><span>Dazu hatte ich bisher keine Gelegenheit, zum Beispiel wegen fehlender Geräte oder weil es nicht zu meiner Funktion gehört.</span></label>
        </div></fieldset>`;
    }).join('');
    $$('#questions input[type=radio]').forEach((r) => r.addEventListener('change', () => {
      cur.answers[r.name.slice(2)] = +r.value;
      scheduleSave();
      renderAreaNav();
      $('#open-hint').textContent = '';
    }));
    const last = areaIdx === ITEMS.areas.length - 1;
    $('#btn-prev').hidden = areaIdx === 0;
    $('#btn-next').textContent = last ? (cur.status === 'submitted' ? 'Änderungen übernehmen' : 'Abschliessen und Profil anzeigen') : 'Weiter zu «' + ITEMS.areas[areaIdx + 1].title + '»';
    $('#open-hint').textContent = '';
    renderAreaNav();
    if (focus) { window.scrollTo({ top: 0 }); $('#h-area').focus({ preventScroll: true }); }
  }
  $('#btn-prev').addEventListener('click', () => { if (areaIdx > 0) { areaIdx--; renderSurvey(true); } });
  $('#btn-next').addEventListener('click', async () => {
    if (areaIdx < ITEMS.areas.length - 1) { areaIdx++; return renderSurvey(true); }
    const p = DKCore.progress(ITEMS, cur.answers);
    if (p.open.length) {
      $('#open-hint').innerHTML = `<span class="error">Noch offen: ${p.open.join(', ')}.</span> Für den Abschluss braucht es eine Antwort pro Frage. Wo etwas nicht zutrifft, die Option «keine Gelegenheit» wählen.`;
      return;
    }
    await flush();
    try {
      await api('POST', 'me/responses/' + cur.id + '/submit');
      await loadMe();
      cur = me.responses.find((x) => x.id === cur.id);
      viewing = cur;
      renderResult();
    } catch (err) { $('#open-hint').innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });

  /* ---------- Profil ---------- */
  function previousOf(r) {
    const done = me.responses.filter((x) => x.status === 'submitted' && x.id !== r.id && new Date(x.created_at) < new Date(r.created_at));
    return done.length ? done[done.length - 1] : null;
  }
  function renderResult() {
    const r = viewing;
    const answers = r.answers;
    const prev = previousOf(r);
    $('#result-date').textContent = `${r.campaign_title} · ${r.status === 'submitted' ? 'abgeschlossen am ' + date(r.submitted_at) : 'in Bearbeitung'}`;
    const ctx = r.context || {};
    $('#result-chips').innerHTML = Object.values(ctx).filter(Boolean).map((c) => `<span class="chip">${esc(c)}</span>`).join('') || '<span class="small muted">Keine Angaben zum Arbeitsumfeld</span>';
    $('#history').innerHTML = me.responses.length > 1 ? me.responses.map((x) =>
      `<button class="btn ${x.id === r.id ? '' : 'secondary'}" type="button" data-resp="${x.id}">${esc(x.campaign_title)}</button>`).join('') : '';
    $$('#history [data-resp]').forEach((b) => b.addEventListener('click', () => { viewing = me.responses.find((x) => x.id === b.dataset.resp); renderResult(); }));

    const p = DKCore.progress(ITEMS, answers);
    const note = $('#result-note');
    note.hidden = r.status === 'submitted' && !prev;
    if (r.status !== 'submitted') note.innerHTML = `<b>Diese Selbsteinschätzung ist noch nicht abgeschlossen</b> (${p.done} von ${p.total} Fragen). Erst abgeschlossene Teilnahmen fliessen in die Schulauswertung ein.`;
    else if (prev) note.innerHTML = `Zum Vergleich ist die frühere Teilnahme <b>${esc(prev.campaign_title)}</b> gestrichelt dargestellt.`;
    note.className = 'no-print box ' + (r.status !== 'submitted' ? 'box--warning' : 'box--info');

    const scores = DKCore.areaScores(ITEMS, answers);
    const prevScores = prev ? DKCore.areaScores(ITEMS, prev.answers) : null;
    const series = [{ values: scores.map((s) => s.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
    if (prevScores) series.push({ values: prevScores.map((s) => s.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
    $('#radar').innerHTML = radarSVG(series, { valueLabels: true, label: 'Netzdiagramm: Mittelwert der Stufen pro Kompetenzbereich' });
    $('#legend').innerHTML = (prev ? `<span><i style="background:#E2001A"></i>${esc(r.campaign_title)}</span><span><i style="background:#6E6E6E"></i>${esc(prev.campaign_title)}</span>` : '') +
      '<span>Mittelwert der gewählten Stufen pro Bereich (I = 1 bis VI = 6). «Keine Gelegenheit» zählt nicht.</span>';

    const sg = DKCore.strengthsAndGaps(ITEMS, answers, 3);
    $('#list-strengths').innerHTML = sg.strengths.map((x) => `<li class="focus-item">${badge(x.v)}<span><b>${x.s.id}</b> ${esc(x.s.title)}</span></li>`).join('') || '<li class="muted small">Noch keine Angaben.</li>';
    $('#list-gaps').innerHTML = sg.gaps.map((x) => `<li class="focus-item">${badge(x.v)}<span><b>${x.s.id}</b> ${esc(x.s.title)}</span>
      <span class="next">Nächste Stufe ${LV[x.v].roman}: ${esc(x.s.levels[x.v].text)}</span></li>`).join('') || '<li class="muted small">Keine offenen Entwicklungsfelder.</li>';
    $('#noopp-wrap').hidden = sg.noOpp.length === 0;
    $('#list-noopp').innerHTML = sg.noOpp.map((s) => `<li><b>${s.id}</b> ${esc(s.title)}</li>`).join('');

    $('#result-areas').innerHTML = ITEMS.areas.map((a, i) => {
      const sc = scores[i];
      let delta = '';
      if (prevScores && sc.mean !== null && prevScores[i].mean !== null) {
        const d = sc.mean - prevScores[i].mean;
        delta = ` <span class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">(${d > 0 ? '+' : ''}${fmt(d)} seit ${esc(prev.campaign_title)})</span>`;
      }
      return `<div class="area-block"><h3><span>${a.id} ${esc(a.title)}</span><span class="avg">Ø ${fmt(sc.mean)}${sc.mean ? ' · ' + LV[Math.round(sc.mean) - 1].label : ''}${delta}</span></h3>
        ${a.subareas.map((s) => {
          const v = answers[s.id];
          const pv = prev ? prev.answers[s.id] : undefined;
          let body = '';
          if (v === undefined) body = `<p class="muted">Noch nicht beantwortet.</p>`;
          else if (v === 0) body = `<p>Bisher keine Gelegenheit. Zu klären: Sind die Voraussetzungen an der Schule gegeben, etwa Geräte, Plattformen oder ein entsprechender Auftrag?</p>`;
          else {
            body = `<div><h4>Gewählte Aussage · Stufe ${LV[v - 1].roman} ${esc(LV[v - 1].label)}</h4><p>${esc(s.levels[v - 1].text)}</p></div>`;
            if (v < 6) body += `<div><h4>Nächster Schritt · Stufe ${LV[v].roman} ${esc(LV[v].label)}</h4><p>${esc(s.levels[v].text)}</p></div>`;
          }
          if (pv !== undefined) body += `<p class="small muted">Bei «${esc(prev.campaign_title)}»: ${pv === 0 ? 'keine Gelegenheit' : 'Stufe ' + LV[pv - 1].roman + ' ' + esc(LV[pv - 1].label)}</p>`;
          return `<details class="sub"><summary><span class="t">${s.id} ${esc(s.title)}</span>${meter(v)}<span style="text-align:right">${badge(v)}${v >= 1 ? ' <span class="small muted">' + esc(LV[v - 1].label) + '</span>' : ''}</span></summary><div class="sub-body">${body}</div></details>`;
        }).join('')}</div>`;
    }).join('');

    const editable = r.campaign_status === 'open';
    $('#btn-edit').hidden = !editable;
    $('#btn-edit').textContent = r.status === 'submitted' ? 'Antworten bearbeiten' : 'Selbsteinschätzung fortsetzen';
    confirmButton($('#delete-me'), 'Meine Daten löschen', 'Alle Teilnahmen zu diesem Code endgültig löschen?', 'Ja, endgültig löschen', async () => {
      await api('DELETE', 'me'); me = null; location.href = '/';
    });
    show('v-result');
  }
  $('#btn-edit').addEventListener('click', () => { cur = viewing; startSurvey(); });
  $('#btn-print').addEventListener('click', () => {
    $$('details.sub').forEach((d) => { d.dataset.wasOpen = d.open; d.open = true; });
    window.print();
    $$('details.sub').forEach((d) => { d.open = d.dataset.wasOpen === 'true'; });
  });
  $('#btn-save').addEventListener('click', () => {
    const r = viewing;
    const rec = { format: DKCore.FORMAT, formatVersion: 1, instrumentVersion: ITEMS.version, id: r.id, created: r.created_at, updated: r.updated_at, campaign: r.campaign_title, context: r.context, answers: r.answers };
    download(`Kompetenzprofil_SZ_${today()}.json`, JSON.stringify(rec, null, 1), 'application/json');
  });

  /* ---------- Mein Profil ---------- */
  function renderHome() {
    $('#form-code-home').hidden = !!me;
    const list = $('#home-list');
    list.hidden = !me;
    if (me) {
      $('#school-name').textContent = me.school.name;
      const latest = [...me.responses].reverse().find((x) => x.status === 'submitted') || me.responses[me.responses.length - 1];
      if (latest && latest.status === 'submitted') { viewing = latest; return renderResult(); }
      list.innerHTML = `<table class="list"><thead><tr><th>Erhebung</th><th>Status</th><th>Zuletzt bearbeitet</th><th></th></tr></thead><tbody>` +
        me.responses.map((x) => `<tr><td>${esc(x.campaign_title)}</td><td><span class="status ${x.status === 'submitted' ? 'open' : 'draft'}">${x.status === 'submitted' ? 'abgeschlossen' : 'in Bearbeitung'}</span></td><td>${date(x.updated_at)}</td>
          <td><button class="btn quiet" type="button" data-open="${x.id}">Öffnen</button></td></tr>`).join('') + `</tbody></table>
        <p class="small muted">Für eine neue Teilnahme den Link der Schulleitung verwenden.</p>`;
      $$('#home-list [data-open]').forEach((b) => b.addEventListener('click', () => {
        const x = me.responses.find((y) => y.id === b.dataset.open);
        if (x.status !== 'submitted' && x.campaign_status === 'open') { cur = x; startSurvey(); } else { viewing = x; renderResult(); }
      }));
    }
    show('v-home');
  }

  window.addEventListener('beforeunload', (e) => { if (saveTimer && $('#save-state').textContent.startsWith('Wird')) { e.preventDefault(); } });
  init();
})();

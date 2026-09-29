// Teilnahme der Lehrperson: Einstieg über Erhebungslink, persönlicher Code, Fragebogen mit automatischem Speichern, Profil.
(function () {
  'use strict';
  const { ITEMS, LV, $, $$, esc, fmt, date, api, radarSVG, meter, badge, download, today, confirmButton, copyText } = UI;
  const SUBS = DKCore.allSubareas(ITEMS);

  // Werte werden gespeichert, Beschriftungen nur angezeigt. Bezirksschulen: Zyklus 3 fest, das Feld entfällt.
  const CONTEXT_OPTIONS = {
    zyklus: [['Zyklus 1', 'Zyklus 1 (Kindergarten bis 2. Klasse)'], ['Zyklus 2', 'Zyklus 2 (3. bis 6. Klasse)'], ['Zyklus 3', 'Zyklus 3 (Sekundarstufe I)'], ['Zyklusübergreifend', 'Zyklusübergreifend (z. B. SHP, DaZ, Fachlehrperson)']],
    funktion: ['Klassenlehrperson', 'Fachlehrperson', 'Schulische Heilpädagogin / Schulischer Heilpädagoge', 'Lehrperson Deutsch als Zweitsprache', 'Andere Funktion'],
    erfahrung: ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'],
  };
  ['ctx', 'ctx2'].forEach((p) => Object.entries(CONTEXT_OPTIONS).forEach(([k, opts]) => {
    $(`#${p}-${k}`).innerHTML = `<option value="">Keine Angabe</option>` + opts.map((o) => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join('');
  }));
  // Zyklen des Schulhauses: einer = fest (Feld entfällt), mehrere = Auswahl inkl. «zyklusübergreifend»
  let zyklen = ['Zyklus 1', 'Zyklus 2', 'Zyklusübergreifend'];
  function setZyklen(list) {
    if (Array.isArray(list) && list.length) zyklen = list;
    ['ctx', 'ctx2'].forEach((p) => {
      const sel = $(`#${p}-zyklus`);
      const keep = sel.value;
      sel.innerHTML = `<option value="">Keine Angabe</option>` + CONTEXT_OPTIONS.zyklus.filter(([v]) => zyklen.includes(v)).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
      if (zyklen.includes(keep)) sel.value = keep;
    });
    $$('[data-zyklus-field]').forEach((f) => { f.hidden = zyklen.length === 1; });
  }
  setZyklen();

  const m = location.pathname.match(/^\/t\/([^/]+)/);
  const TOKEN = m ? decodeURIComponent(m[1]) : null;
  let me = null;          // { school, responses }
  let cur = null;         // aktuelle Teilnahme (Antwortobjekt vom Server)
  let viewing = null;     // im Profil angezeigte Teilnahme
  let areaIdx = 0;
  let lastCode = null;     // gerade erzeugter Code (für «Zurück» zur Code-Seite)

  /* ---------- Adressen pro Ansicht: «Zurück» im Browser funktioniert ---------- */
  let routing = false, replaceNext = true;
  function setHash(h) {
    if (routing) return;
    const target = '#' + h;
    if (location.hash !== target) history[replaceNext ? 'replaceState' : 'pushState'](null, '', target);
    replaceNext = false;
  }
  async function applyHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    routing = true;
    try {
      let mm;
      if ((mm = h.match(/^fragebogen-(\d+)$/)) && me && cur && cur.campaign_status === 'open') { startSurvey(+mm[1] - 1); return; }
      if ((mm = h.match(/^profil-(.+)$/)) && me) {
        const x = me.responses.find((y) => y.id === mm[1]);
        if (x) { viewing = x; renderResult(); return; }
      }
      if (h === 'code' && lastCode && me) { show('v-code'); return; }
      if (h === 'start' && TOKEN && !me) { show('v-welcome'); return; }
      renderHome();
    } finally { routing = false; }
  }
  window.addEventListener('popstate', () => { applyHash(); });

  function show(id) {
    $$('main > .view').forEach((v) => { v.hidden = v.id !== id; });
    if (!me) $('#code-panel').hidden = true;
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
    const initialHash = location.hash;
    await initViews();
    if (me && /^#(fragebogen|profil)-/.test(initialHash)) { history.replaceState(null, '', initialHash); await applyHash(); }
  }
  async function initViews() {
    if (TOKEN) {
      let camp;
      try { camp = await api('GET', 'c/' + encodeURIComponent(TOKEN)); }
      catch (e) { return showError('Dieser Link funktioniert nicht', e.message); }
      $('#school-name').textContent = camp.school.name;
      setZyklen(camp.school && camp.school.zyklen);
      $('#campaign-name').textContent = 'Selbsteinschätzung · ' + camp.campaign.title;
      await loadMe();
      if (me) {
        try { return await openCampaignResponse(); }
        catch (e) {
          if (e.status === 403) {
            return showError('Angemeldet mit einem Code eines anderen Schulträgers', 'Für diese Erhebung bitte abmelden und mit dem Code dieses Schulträgers weiterfahren oder neu beginnen.', '<button class="btn" type="button" id="btn-err-logout">Abmelden</button>');
          }
          if (e.status !== 409) return showError('Fehler', e.message);
        }
      }
      if (camp.campaign.status !== 'open') {
        return showError('Diese Erhebung ist abgeschlossen', 'Neue Teilnahmen sind nicht mehr möglich. Frühere Profile lassen sich unter «Mein Profil» mit dem persönlichen Code ansehen.', '<a class="btn" href="/mein-profil">Mein Profil</a>');
      }
      show('v-welcome');
      setHash('start');
    } else {
      $('#campaign-name').textContent = 'Mein Profil';
      await loadMe();
      renderHome();
    }
  }
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-err-logout') { await api('POST', 'me/logout'); location.reload(); }
  });

  /* ---------- Persönlichen Code sichern ---------- */
  function codeCardText(code) {
    const school = me && me.school ? me.school.name : $('#school-name').textContent;
    return [
      'Digitale Kompetenzen von Lehrpersonen – persönlicher Code',
      '',
      'Code: ' + code,
      'Schule: ' + school,
      'Profil öffnen: ' + location.origin + '/mein-profil',
      'Gespeichert am: ' + new Date().toLocaleDateString('de-CH'),
      '',
      'Den Code nicht weitergeben. Er ist nicht mit dem Namen verknüpft.',
      'Ohne Code lässt sich das Profil nicht wieder öffnen.',
    ].join('\r\n');
  }
  function codeActions(el, code) {
    const mail = 'mailto:?subject=' + encodeURIComponent('Mein persönlicher Code: Digitale Kompetenzen') + '&body=' + encodeURIComponent(codeCardText(code));
    el.innerHTML = `<button class="btn secondary" type="button" data-a="copy">Code kopieren</button>
      <button class="btn secondary" type="button" data-a="file">Code als Datei speichern</button>
      <a class="btn secondary" href="${esc(mail)}">Code per E-Mail an mich</a>`;
    el.querySelector('[data-a=copy]').addEventListener('click', (e) => copyText(code, e.currentTarget));
    el.querySelector('[data-a=file]').addEventListener('click', () => download('Persoenlicher_Code_DigKomp_SZ.txt', codeCardText(code), 'text/plain;charset=utf-8'));
  }
  $('#btn-show-code').addEventListener('click', async () => {
    const panel = $('#code-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    try {
      const r = await api('GET', 'me/code');
      panel.innerHTML = `<div class="row" style="justify-content:space-between"><h3>Mein persönlicher Code</h3><button class="btn quiet" type="button" id="btn-hide-code">Schliessen</button></div>
        <div><span class="code-display">${esc(r.code)}</span></div><div class="row" id="code-actions-2"></div>`;
      codeActions($('#code-actions-2'), r.code);
      $('#btn-hide-code').addEventListener('click', () => { panel.hidden = true; });
    } catch (err) { panel.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    panel.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- Einstieg ---------- */
  const readCtx = (p) => {
    const c = Object.fromEntries(Object.keys(CONTEXT_OPTIONS).map((k) => [k, $(`#${p}-${k}`).value || null]));
    if (zyklen.length === 1) c.zyklus = zyklen[0];
    return c;
  };
  $('#form-start').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#start-msg').textContent = '';
    try {
      const r = await api('POST', 'c/' + encodeURIComponent(TOKEN) + '/start', { context: readCtx('ctx'), remember: $('#remember-start').checked });
      await loadMe();
      cur = me.responses.find((x) => x.id === r.responseId);
      lastCode = r.code;
      $('#code-out').textContent = r.code;
      codeActions($('#code-actions'), r.code);
      $('#code-ack').checked = false;
      $('#btn-code-continue').disabled = true;
      show('v-code');
      setHash('code');
    } catch (err) { $('#start-msg').textContent = err.message; }
  });
  $('#code-ack').addEventListener('change', (e) => { $('#btn-code-continue').disabled = !e.target.checked; });
  $('#btn-code-continue').addEventListener('click', () => startSurvey());

  async function codeLogin(input, msgEl, withToken, remember) {
    msgEl.textContent = '';
    try {
      await api('POST', 'code-login', { code: input.value, token: withToken ? TOKEN : undefined, remember: !!remember });
      input.value = '';
      return true;
    } catch (err) { msgEl.textContent = err.message; return false; }
  }
  $('#form-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await codeLogin($('#code-in'), $('#code-msg'), true, $('#remember-code').checked))) return;
    try { await openCampaignResponse(); }
    catch (err) {
      await loadMe();
      if (err.status === 409 && me) { renderHome(); } else { $('#code-msg').textContent = err.message; }
    }
  });
  $('#form-code-home').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await codeLogin($('#code-in-home'), $('#code-msg-home'), false, $('#remember-home').checked))) return;
    await loadMe();
    renderHome();
  });
  async function doLogout() {
    await api('POST', 'me/logout');
    location.href = TOKEN ? location.pathname : '/';
  }
  $('#btn-logout').addEventListener('click', async () => {
    const panel = $('#code-panel');
    let code = null;
    try { code = (await api('GET', 'me/code')).code; } catch { code = null; }
    panel.innerHTML = `<h3>Vor dem Abmelden: Ist der persönliche Code gesichert?</h3>
      <p>Ohne Code lässt sich das Profil nicht mehr öffnen, auch nicht durch die Schulleitung oder das Amt.</p>
      ${code ? `<div><span class="code-display">${esc(code)}</span></div><div class="row" id="code-actions-3"></div>` : ''}
      <div class="row"><button class="btn" type="button" id="btn-logout-now">Jetzt abmelden</button><button class="btn quiet" type="button" id="btn-logout-cancel">Abbrechen</button></div>`;
    if (code) codeActions($('#code-actions-3'), code);
    $('#btn-logout-now').addEventListener('click', doLogout);
    $('#btn-logout-cancel').addEventListener('click', () => { panel.hidden = true; });
    panel.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      await api('PUT', 'me/responses/' + cur.id, { answers: cur.answers, context: cur.context, custom_answers: cur.custom_answers || {} });
      setSaveState('Gespeichert ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) + ' Uhr', 'ok');
    } catch (err) {
      setSaveState('Nicht gespeichert: ' + err.message, 'error');
    } finally {
      saving = false;
      if (pending) { pending = false; save(); }
    }
  }
  async function flush() { clearTimeout(saveTimer); await save(); }

  function startSurvey(area) {
    if (Number.isInteger(area)) areaIdx = area;
    else {
      const p = DKCore.progress(ITEMS, cur.answers);
      const firstOpen = p.open[0];
      areaIdx = firstOpen ? ITEMS.areas.findIndex((a) => a.id === SUBS.find((s) => s.id === firstOpen).areaId) : 0;
    }
    setZyklen(cur.zyklen);
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

  /* Schulblock: eigene Fragen der Schulleitung als zusätzlicher Schritt */
  const SCALE = ['Trifft nicht zu', 'Trifft eher nicht zu', 'Trifft eher zu', 'Trifft voll zu'];
  const blockOf = (r) => (r && r.custom_block && Array.isArray(r.custom_block.questions) && r.custom_block.questions.length ? r.custom_block : null);
  const steps = () => ITEMS.areas.length + (blockOf(cur) ? 1 : 0);
  const stepTitle = (i) => (i < ITEMS.areas.length ? ITEMS.areas[i].title : blockOf(cur).title);

  // Unterkapitel des aktuellen Bereichs in der Übersicht; Klick scrollt zur Frage
  function subnav(items) {
    return `<div class="subnav" role="list">${items.map((it) => `<button type="button" role="listitem" data-jump="${esc(it.key)}"><span class="sid">${esc(it.label)}</span><span class="stitle">${esc(it.title)}</span><span class="sdone">${it.done ? '<span aria-hidden="true">✓</span>' : ''}<span class="sr-only">${it.done ? 'beantwortet' : 'offen'}</span></span></button>`).join('')}</div>`;
  }
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;
  const smoothOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Scrollen unter Berücksichtigung der auf dem Handy fixierten Übersichtsleiste
  function scrollToEl(el) {
    const off = isNarrow() ? $('#survey-aside').offsetHeight + 12 : 16;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: smoothOK() ? 'smooth' : 'auto' });
  }
  function jumpTo(key) {
    const el = document.getElementById('fs-' + key);
    if (!el) return;
    closeNav();
    scrollToEl(el);
    const first = el.querySelector('input:checked, input, textarea');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), smoothOK() ? 400 : 0);
  }
  // Nach der ersten Antwort auf eine Frage sanft zur nächsten offenen Frage weiter
  function advanceFrom(fs) {
    const all = $$('#questions fieldset.q');
    const next = all.slice(all.indexOf(fs) + 1).find((f) => !f.querySelector('input:checked') && !(f.querySelector('textarea') && f.querySelector('textarea').value.trim()));
    setTimeout(() => scrollToEl(next || $('.survey-foot')), 300);
  }
  function closeNav() { $('#survey-aside').classList.remove('open'); $('#nav-toggle').setAttribute('aria-expanded', 'false'); }
  $('#nav-toggle').addEventListener('click', () => {
    const open = !$('#survey-aside').classList.contains('open');
    $('#survey-aside').classList.toggle('open', open);
    $('#nav-toggle').setAttribute('aria-expanded', String(open));
  });

  function renderAreaNav() {
    const blk = blockOf(cur);
    const ca = cur.custom_answers || {};
    $('#areanav').innerHTML = ITEMS.areas.map((a, i) => {
      const done = a.subareas.filter((s) => cur.answers[s.id] !== undefined).length;
      const full = done === a.subareas.length;
      return `<button type="button" data-area="${i}" aria-current="${i === areaIdx ? 'step' : 'false'}">
        <span>${a.id}&nbsp; ${esc(a.title)}</span><span class="cnt ${full ? 'done' : ''}">${full ? '✓' : done + '/' + a.subareas.length}</span></button>` +
        (i === areaIdx ? subnav(a.subareas.map((s) => ({ key: s.id, label: s.id, title: s.title, done: cur.answers[s.id] !== undefined }))) : '');
    }).join('') + (blk ? (() => {
      const done = blk.questions.filter((q) => ca[q.id] !== undefined).length;
      const full = done === blk.questions.length;
      return `<button type="button" data-area="${ITEMS.areas.length}" aria-current="${areaIdx === ITEMS.areas.length ? 'step' : 'false'}" style="margin-top:8px;border-top:1px solid var(--line)">
        <span>${esc(blk.title)}</span><span class="cnt ${full ? 'done' : ''}">${full ? '✓' : done + '/' + blk.questions.length}</span></button>` +
        (areaIdx === ITEMS.areas.length ? subnav(blk.questions.map((q, k) => ({ key: q.id, label: String(k + 1), title: q.text, done: ca[q.id] !== undefined }))) : '');
    })() : '');
    $$('#areanav button[data-area]').forEach((b) => b.addEventListener('click', () => { areaIdx = +b.dataset.area; closeNav(); renderSurvey(true); }));
    $$('#areanav [data-jump]').forEach((b) => b.addEventListener('click', () => jumpTo(b.dataset.jump)));
    const p = DKCore.progress(ITEMS, cur.answers);
    $('#progress-fill').style.width = (100 * p.done / p.total) + '%';
    $('#progress-text').innerHTML = `${p.done}<span class="hide-narrow"> von ${p.total} Kompetenzfragen</span><span class="show-narrow">/${p.total}</span> beantwortet`;
    // Kompakte Anzeige auf dem Handy
    if (areaIdx < ITEMS.areas.length) {
      const a = ITEMS.areas[areaIdx];
      const d = a.subareas.filter((s) => cur.answers[s.id] !== undefined).length;
      $('#nav-toggle-text').textContent = `Bereich ${areaIdx + 1} von ${ITEMS.areas.length}: ${a.title} · ${d}/${a.subareas.length}`;
    } else {
      const d = blk.questions.filter((q) => ca[q.id] !== undefined).length;
      $('#nav-toggle-text').textContent = `${blk.title} · ${d}/${blk.questions.length}`;
    }
  }

  function customQuestionHTML(q, i) {
    const v = (cur.custom_answers || {})[q.id];
    const name = 'cq-' + q.id;
    let hint = '', body = '';
    if (q.type === 'scale') {
      hint = 'Wie weit trifft die Aussage zu?';
      body = `<div class="opts inline">${SCALE.map((l, k) => `<label class="opt"><input type="radio" name="${name}" id="${name}-${k + 1}" value="${k + 1}" ${v === k + 1 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <div class="opts"><label class="opt none"><input type="radio" name="${name}" id="${name}-0" value="0" ${v === 0 ? 'checked' : ''}><span>Kann ich nicht beurteilen</span></label></div>`;
    } else if (q.type === 'levels') {
      hint = 'Welche Aussage beschreibt das eigene Handeln am besten?';
      body = `<div class="opts">${q.options.map((o, k) => `<label class="opt"><input type="radio" name="${name}" id="${name}-${k + 1}" value="${k + 1}" ${v === k + 1 ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}
        <label class="opt none"><input type="radio" name="${name}" id="${name}-0" value="0" ${v === 0 ? 'checked' : ''}><span>Dazu hatte ich bisher keine Gelegenheit.</span></label></div>`;
    } else if (q.type === 'choice') {
      hint = q.multiple ? 'Mehrere Antworten möglich.' : 'Eine Antwort wählen.';
      const sel = [].concat(v === undefined ? [] : v);
      body = `<div class="opts">${q.options.map((o, k) => `<label class="opt"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="${name}" id="${name}-${k}" value="${k}" ${sel.includes(k) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
    } else {
      hint = 'Freiwillig. Bitte keine Namen und keine Hinweise, die auf einzelne Personen schliessen lassen. Die Schulleitung sieht Freitexte erst ab fünf abgeschlossenen Teilnahmen und in zufälliger Reihenfolge.';
      body = `<label class="sr-only" for="${name}">Antwort</label><textarea id="${name}" name="${name}" rows="4" maxlength="1000">${esc(v || '')}</textarea>`;
    }
    return `<fieldset class="q" id="fs-${q.id}" data-qtype="${q.type}"><legend><span class="qid">${i + 1}</span><span>${esc(q.text)}</span></legend><p class="hint">${hint}</p>${body}</fieldset>`;
  }

  function renderCustom() {
    const blk = blockOf(cur);
    cur.custom_answers = cur.custom_answers || {};
    $('#area-eyebrow').textContent = 'Fragen der Schule · nicht Teil des Kompetenzprofils';
    $('#h-area').textContent = blk.title;
    $('#area-desc').textContent = blk.intro || 'Diese Fragen hat die Schulleitung ergänzt. Die Antworten fliessen nur in die Schulauswertung ein, ebenfalls erst ab fünf abgeschlossenen Teilnahmen.';
    $('#questions').innerHTML = blk.questions.map(customQuestionHTML).join('');
    blk.questions.forEach((q) => {
      const name = 'cq-' + q.id;
      if (q.type === 'text') {
        $('#' + name).addEventListener('input', (e) => {
          const val = e.target.value.trim();
          if (val) cur.custom_answers[q.id] = val; else delete cur.custom_answers[q.id];
          scheduleSave(); renderAreaNav();
        });
        return;
      }
      $$(`input[name="${name}"]`).forEach((inp) => inp.addEventListener('change', () => {
        if (q.type === 'choice' && q.multiple) {
          const list = $$(`input[name="${name}"]:checked`).map((x) => +x.value);
          if (list.length) cur.custom_answers[q.id] = list; else delete cur.custom_answers[q.id];
        } else {
          const first = cur.custom_answers[q.id] === undefined;
          cur.custom_answers[q.id] = +inp.value;
          if (first) advanceFrom(inp.closest('fieldset'));
        }
        scheduleSave(); renderAreaNav();
      }));
    });
  }

  function renderSurvey(focus) {
    if (areaIdx >= steps()) areaIdx = steps() - 1;
    if (areaIdx === ITEMS.areas.length) renderCustom();
    else {
      const a = ITEMS.areas[areaIdx];
      $('#area-eyebrow').textContent = `Bereich ${areaIdx + 1} von ${ITEMS.areas.length}`;
      $('#h-area').textContent = a.title;
      $('#area-desc').textContent = a.description;
      $('#questions').innerHTML = a.subareas.map((s) => {
        const v = cur.answers[s.id];
        return `<fieldset class="q" id="fs-${s.id}">
          <legend><span class="qid">${s.id}</span><span>${esc(s.title)}${s.ki ? ' <span class="chip">KI</span>' : ''}</span></legend>
          <p class="hint">Welche Aussage beschreibt das eigene Handeln am besten?</p>
          <div class="opts">${s.levels.map((l) => `
            <label class="opt"><input type="radio" name="q-${s.id}" id="q-${s.id}-${l.level}" value="${l.level}" ${v === l.level ? 'checked' : ''}><span>${esc(l.text)}</span></label>`).join('')}
            <label class="opt none"><input type="radio" name="q-${s.id}" id="q-${s.id}-0" value="0" ${v === 0 ? 'checked' : ''}><span>Dazu hatte ich bisher keine Gelegenheit, zum Beispiel wegen fehlender Geräte oder weil es nicht zu meiner Funktion gehört.</span></label>
          </div></fieldset>`;
      }).join('');
      $$('#questions input[type=radio]').forEach((r) => r.addEventListener('change', () => {
        const first = cur.answers[r.name.slice(2)] === undefined;
        cur.answers[r.name.slice(2)] = +r.value;
        if (first) advanceFrom(r.closest('fieldset'));
        scheduleSave();
        renderAreaNav();
        $('#open-hint').textContent = '';
      }));
    }
    const last = areaIdx === steps() - 1;
    $('#ctx-details').hidden = !last;
    $('#btn-prev').hidden = areaIdx === 0;
    $('#btn-next').textContent = last ? (cur.status === 'submitted' ? 'Änderungen übernehmen' : 'Abschliessen und Profil anzeigen') : 'Weiter zu «' + stepTitle(areaIdx + 1) + '»';
    $('#open-hint').textContent = '';
    renderAreaNav();
    setHash('fragebogen-' + (areaIdx + 1));
    if (focus) { window.scrollTo({ top: 0 }); $('#h-area').focus({ preventScroll: true }); }
  }
  $('#btn-prev').addEventListener('click', () => { if (areaIdx > 0) { areaIdx--; renderSurvey(true); } });
  $('#btn-next').addEventListener('click', async () => {
    if (areaIdx < steps() - 1) { areaIdx++; return renderSurvey(true); }
    const p = DKCore.progress(ITEMS, cur.answers);
    if (p.open.length) {
      $('#open-hint').innerHTML = `<span class="error">Noch offen:</span> <span class="open-links">${p.open.map((id) => `<button type="button" data-goto="${id}">${id} ${esc(SUBS.find((s) => s.id === id).title)}</button>`).join('')}</span><br>Für den Abschluss braucht es eine Antwort pro Frage. Wo etwas nicht zutrifft, die Option «keine Gelegenheit» wählen.`;
      $$('#open-hint [data-goto]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.goto;
        areaIdx = ITEMS.areas.findIndex((a) => a.id === SUBS.find((s) => s.id === id).areaId);
        renderSurvey(false);
        setTimeout(() => jumpTo(id), 50);
      }));
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
  function pdLine(sub, level) {
    const t = DKCore.pdThemeFor(ITEMS, sub, level);
    if (!t) return '';
    return `<span class="next pd">Weiterbildung (fobizz-Themenbereich): <b>${esc(t.primary)}</b>${t.entry ? ' · Einstiegsangebote wählen' : ''}${t.secondary ? ' · auch passend: ' + esc(t.secondary) : ''}</span>`;
  }
  function renderResult() {
    const r = viewing;
    const answers = r.answers;
    const prev = previousOf(r);
    $('#result-date').textContent = `${r.school_name || me.school.name} · ${r.campaign_title} · ${r.status === 'submitted' ? 'abgeschlossen am ' + date(r.submitted_at) : 'in Bearbeitung'}`;
    UI.levelsStrip($('#result-levels'));
    $('#btn-toggle-all').textContent = 'Alle öffnen';
    const ctx = r.context || {};
    $('#result-chips').innerHTML = Object.values(ctx).filter(Boolean).map((c) => `<span class="chip">${esc(c)}</span>`).join('') || '<span class="small muted">Keine Angaben zum Arbeitsumfeld</span>';
    $('#history').innerHTML = `<button class="btn secondary" type="button" id="btn-all">Alle meine Teilnahmen${me.responses.length > 1 ? ' (' + me.responses.length + ')' : ''}</button>`;
    $('#btn-all').addEventListener('click', () => renderHome());

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
      '<span>Pro Bereich der Mittelwert der gewählten Stufen, von I Einsteigen (1) bis VI Weitergeben (6). Darunter die gerundete Stufe. «Keine Gelegenheit» zählt nicht.</span>';

    const sg = DKCore.strengthsAndGaps(ITEMS, answers, 3);
    $('#list-strengths').innerHTML = sg.strengths.map((x) => `<li class="focus-item">${badge(x.v)}<span><b>${x.s.id}</b> ${esc(x.s.title)}</span></li>`).join('') || '<li class="muted small">Noch keine Angaben.</li>';
    $('#list-gaps').innerHTML = sg.gaps.map((x) => `<li class="focus-item">${badge(x.v)}<span><b>${x.s.id}</b> ${esc(x.s.title)}</span>
      <span class="next">Nächste Stufe ${LV[x.v].roman}: ${esc(x.s.levels[x.v].text)}</span>${pdLine(x.s, x.v)}</li>`).join('') || '<li class="muted small">Keine offenen Entwicklungsfelder.</li>';
    const themes = DKCore.personalThemes(ITEMS, answers, 3);
    $('#pd-themes').innerHTML = themes.length ? `<p><b>Empfohlene Themenbereiche für die Weiterbildung</b></p>
      <ul class="pd-list">${themes.map((t) => `<li><span class="pd-chip">${esc(t.theme)}</span> <span class="small muted">passt zu ${t.subs.join(', ')}</span></li>`).join('')}</ul>
      <p class="small muted">Die Themenbereiche entsprechen dem Filter «Themenbereiche» in der Kursübersicht von fobizz. Sie ergeben sich aus den Entwicklungsfeldern und den Teilbereichen auf Stufe I.</p>` : '';
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
          return `<details class="sub"><summary><span class="t">${s.id} ${esc(s.title)}</span>${meter(v)}<span style="text-align:right">${badge(v)}${v >= 1 ? ' <span class="small muted">' + esc(LV[v - 1].label) + '</span>' : v === 0 ? ' <span class="small muted">Keine Gelegenheit</span>' : ''}</span></summary><div class="sub-body">${body}</div></details>`;
        }).join('')}</div>`;
    }).join('');

    const blk = blockOf(r);
    const ca = r.custom_answers || {};
    const ansTxt = (q, v) => {
      if (v === undefined) return '<span class="muted">Keine Antwort</span>';
      if (q.type === 'scale') return v === 0 ? 'Kann ich nicht beurteilen' : esc(SCALE[v - 1]);
      if (q.type === 'levels') return v === 0 ? 'Keine Gelegenheit' : `Stufe ${v} von ${q.options.length}: ${esc(q.options[v - 1])}`;
      if (q.type === 'choice') return [].concat(v).map((k) => esc(q.options[k])).join(', ');
      return esc(v);
    };
    $('#result-custom').innerHTML = blk ? `<div class="area-block"><h3><span>${esc(blk.title)}</span><span class="avg">Fragen der Schule, nicht Teil des Kompetenzprofils</span></h3>
      <dl class="custom-list">${blk.questions.map((q) => `<div><dt>${esc(q.text)}</dt><dd>${ansTxt(q, ca[q.id])}</dd></div>`).join('')}</dl></div>` : '';
    const editable = r.campaign_status === 'open';
    $('#btn-edit').hidden = !editable;
    $('#btn-edit').textContent = r.status === 'submitted' ? 'Antworten bearbeiten' : 'Selbsteinschätzung fortsetzen';
    confirmButton($('#delete-me'), 'Meine Daten löschen', 'Alle Teilnahmen zu diesem Code endgültig löschen?', 'Ja, endgültig löschen', async () => {
      await api('DELETE', 'me'); me = null; location.href = '/';
    });
    show('v-result');
    setHash('profil-' + r.id);
  }
  $('#btn-edit').addEventListener('click', () => { cur = viewing; startSurvey(); });
  // Beim Drucken (auch über das Browsermenü) alle Teilbereiche öffnen
  window.addEventListener('beforeprint', () => { $$('details.sub').forEach((d) => { d.dataset.wasOpen = d.open; d.open = true; }); });
  window.addEventListener('afterprint', () => { $$('details.sub').forEach((d) => { if (d.dataset.wasOpen !== undefined) d.open = d.dataset.wasOpen === 'true'; }); });
  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-toggle-all').addEventListener('click', (e) => {
    const all = $$('#result-areas details.sub');
    const open = all.some((d) => !d.open);
    all.forEach((d) => { d.open = open; });
    e.currentTarget.textContent = open ? 'Alle schliessen' : 'Alle öffnen';
  });
  $('#btn-save').addEventListener('click', () => {
    const r = viewing;
    const rec = { format: DKCore.FORMAT, formatVersion: 1, instrumentVersion: ITEMS.version, id: r.id, created: r.created_at, updated: r.updated_at, campaign: r.campaign_title, context: r.context, answers: r.answers, custom: blockOf(r) ? { block: r.custom_block, answers: r.custom_answers } : undefined };
    download(`Kompetenzprofil_SZ_${today()}.json`, JSON.stringify(rec, null, 1), 'application/json');
  });

  /* ---------- Meine Teilnahmen ---------- */
  function renderHome() {
    $('#form-code-home').hidden = !!me;
    const list = $('#home-list');
    list.hidden = !me;
    $('#h-home').textContent = me ? 'Meine Teilnahmen' : 'Mein Profil';
    if (me) {
      $('#school-name').textContent = me.school.name;
      const rows = [...me.responses].reverse();
      list.innerHTML = (rows.length ? `<div class="part-list">${rows.map((x) => {
        const p = DKCore.progress(ITEMS, x.answers);
        const done = x.status === 'submitted';
        const canEdit = x.campaign_status === 'open';
        return `<div class="part-row">
          <div><b>${esc(x.campaign_title)}</b> <span class="status ${done ? 'open' : 'draft'}">${done ? 'abgeschlossen' : 'in Bearbeitung'}</span>
            <div class="meta">${done ? 'Abgeschlossen am ' + date(x.submitted_at) : p.done + ' von ' + p.total + ' Fragen beantwortet'} · zuletzt bearbeitet am ${date(x.updated_at)}${canEdit ? '' : ' · Erhebung geschlossen'}</div></div>
          <div class="acts">
            ${p.done ? `<button class="btn ${done ? '' : 'secondary'}" type="button" data-view="${x.id}">Profil ansehen</button>` : ''}
            ${canEdit ? `<button class="btn ${done ? 'secondary' : ''}" type="button" data-edit="${x.id}">${done ? 'Antworten bearbeiten' : 'Fortsetzen'}</button>` : ''}
          </div></div>`;
      }).join('')}</div>` : '<p class="muted">Noch keine Teilnahme.</p>') +
        `<p class="small muted">Für eine neue Teilnahme den Link der Schulleitung verwenden. Bei einer neuen Erhebung erscheint im Profil der Vergleich mit der letzten Teilnahme.</p>`;
      $$('#home-list [data-view]').forEach((b) => b.addEventListener('click', () => { viewing = me.responses.find((y) => y.id === b.dataset.view); renderResult(); }));
      $$('#home-list [data-edit]').forEach((b) => b.addEventListener('click', () => { cur = me.responses.find((y) => y.id === b.dataset.edit); startSurvey(); }));
    }
    show('v-home');
    setHash(me ? 'teilnahmen' : 'anmelden');
  }
  $('#btn-my').addEventListener('click', () => renderHome());

  window.addEventListener('beforeunload', (e) => { if (saveTimer && $('#save-state').textContent.startsWith('Wird')) { e.preventDefault(); } });
  init();
})();

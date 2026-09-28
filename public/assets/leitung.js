// Dashboard der Schulleitung: Reiter Erhebungen, Auswertung und Eigene Fragen.
(function () {
  'use strict';
  const { ITEMS, $, $$, esc, fmt, date, api, radarSVG, download, today, copyText, heatTable, confirmButton } = UI;
  const SUBS = DKCore.allSubareas(ITEMS);
  let campaigns = [];
  let an = { id: null, compare: '', stufe: '' };
  let schoolName = '';

  const linkFor = (c) => `${location.origin}/t/${c.token}`;
  const byId = (id) => campaigns.find((c) => c.id === id);

  /* ---------- Reiter mit eigener Adresse (Zurück-Knopf funktioniert) ---------- */
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [tab, id] = h.split('/');
    const name = ['erhebungen', 'auswertung', 'fragen'].includes(tab) ? tab : 'erhebungen';
    $$('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === name ? 'page' : 'false'));
    ['erhebungen', 'auswertung', 'fragen'].forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    if (name === 'auswertung') openAnalysis(id);
    if (name === 'fragen') openQuestions(id);
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);

  async function loadCampaigns() {
    campaigns = await api('GET', 'leitung/campaigns');
    renderCampaigns();
    fillSelects();
  }

  /* ---------- Erhebungen ---------- */
  function renderCampaigns() {
    const list = $('#camp-list');
    $('#create-box').open = !campaigns.length;
    if (!campaigns.length) {
      list.innerHTML = `<p class="muted">Noch keine Erhebung. Mit «Neue Erhebung eröffnen» beginnen und den Link ans Kollegium weitergeben.</p>`;
      return;
    }
    list.innerHTML = campaigns.map((c) => {
      const n = Block.count(c);
    const quote = c.expected ? Math.min(100, Math.round(100 * c.submitted / c.expected)) : null;
      return `<article class="camp-card ${c.status}" data-id="${c.id}">
        <div class="camp-head"><h3>${esc(c.title)}</h3><span class="status ${c.status}">${c.status === 'open' ? 'offen' : 'geschlossen'}</span></div>
        <div class="camp-meta">Eröffnet am ${date(c.created_at)}${c.closed_at ? ' · geschlossen am ' + date(c.closed_at) : ''} · Eigene Fragen: ${n ? n : 'keine'}</div>
        <div class="camp-stats">
          <div class="stat"><span class="small muted">Abgeschlossen</span><b>${c.submitted}</b></div>
          <div class="stat"><span class="small muted">In Bearbeitung</span><b>${c.drafts}</b></div>
          <div class="quote" data-quote="${c.id}">
            ${quote !== null ? `<span>Rücklauf ${quote} % von ${c.expected} Lehrpersonen <button class="btn quiet small" type="button" data-expected="${c.id}">ändern</button></span><div class="bar"><span style="width:${quote}%"></span></div>`
              : `<span><button class="btn quiet small" type="button" data-expected="${c.id}">Anzahl Lehrpersonen eintragen</button> für die Rücklaufquote</span>`}
          </div>
        </div>
        ${c.status === 'open' ? `<div class="camp-link"><code>${esc(linkFor(c))}</code>
          <button class="btn secondary small" type="button" data-copy="${c.id}">Link kopieren</button>
          <button class="btn secondary small" type="button" data-mail="${c.id}">E-Mail-Vorlage</button>
          <button class="btn secondary small" type="button" data-qr="${c.id}">QR-Code</button></div>
          <div class="share" data-share="${c.id}" hidden></div>` : ''}
        <div class="camp-actions">
          <a class="btn" href="#auswertung/${c.id}">Auswertung ansehen</a>
          <a class="btn secondary" href="#fragen/${c.id}">${c.submitted > 0 ? 'Eigene Fragen ansehen' : n ? 'Eigene Fragen bearbeiten' : 'Eigene Fragen ergänzen'}</a>
          <span class="confirm" data-toggle="${c.id}"></span>
        </div>
      </article>`;
    }).join('');

    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(linkFor(byId(b.dataset.copy)), b)));
    $$('[data-mail]').forEach((b) => b.addEventListener('click', () => showMail(byId(b.dataset.mail))));
    $$('[data-qr]').forEach((b) => b.addEventListener('click', () => showQR(byId(b.dataset.qr))));
    $$('[data-expected]').forEach((b) => b.addEventListener('click', () => editExpected(byId(b.dataset.expected))));
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
  }
  async function toggle(c, status) { await api('PATCH', 'leitung/campaigns/' + c.id, { status }); loadCampaigns(); }

  function editExpected(c) {
    const box = $(`[data-quote="${c.id}"]`);
    box.innerHTML = `<div class="inline-edit"><label class="small" for="exp-${c.id}">Anzahl Lehrpersonen</label>
      <input type="text" inputmode="numeric" id="exp-${c.id}" value="${c.expected || ''}">
      <button class="btn secondary small" type="button">Speichern</button><span class="error small"></span></div>`;
    const inp = box.querySelector('input');
    inp.focus();
    const saveIt = async () => {
      try { await api('PATCH', 'leitung/campaigns/' + c.id, { expected: inp.value.trim() || null }); loadCampaigns(); }
      catch (err) { box.querySelector('.error').textContent = err.message; }
    };
    box.querySelector('button').addEventListener('click', saveIt);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveIt(); } });
  }

  function mailText(c) {
    return `Liebe Kolleginnen und Kollegen

Im Rahmen der Erhebung «${c.title}» laden wir Sie ein, die Selbsteinschätzung zu Ihren digitalen Kompetenzen auszufüllen. Sie dauert etwa 20 Minuten und lässt sich jederzeit unterbrechen.

Link zur Selbsteinschätzung:
${linkFor(c)}

Die Teilnahme erfolgt ohne Namen. Nach dem Start erhalten Sie einen persönlichen Code. Bitte bewahren Sie ihn gut auf: Damit können Sie später weiterfahren und Ihr Profil wieder öffnen. Die Schulleitung sieht nur zusammengefasste Ergebnisse der ganzen Schule, keine einzelnen Profile.

Bitte schliessen Sie die Selbsteinschätzung bis [Datum] ab.

Freundliche Grüsse
${schoolName ? schoolName : ''}`;
  }
  function sharePanel(c) {
    $$('[data-share]').forEach((p) => { if (p.dataset.share !== c.id) p.hidden = true; });
    const p = $(`[data-share="${c.id}"]`);
    p.hidden = false;
    return p;
  }
  function showMail(c) {
    const p = sharePanel(c);
    const subject = `Selbsteinschätzung digitale Kompetenzen: ${c.title}`;
    p.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">E-Mail an das Kollegium</h4><button class="btn quiet small" type="button" data-close>Schliessen</button></div>
      <p class="small muted">Text anpassen (zum Beispiel das Datum), dann kopieren oder im E-Mail-Programm öffnen.</p>
      <div class="field"><label for="mail-subj-${c.id}" class="small">Betreff</label><input type="text" id="mail-subj-${c.id}" value="${esc(subject)}"></div>
      <div class="field"><label for="mail-body-${c.id}" class="small">Text</label><textarea id="mail-body-${c.id}">${esc(mailText(c))}</textarea></div>
      <div class="row"><button class="btn secondary" type="button" data-copytext>Text kopieren</button><a class="btn secondary" data-mailto href="#">Im E-Mail-Programm öffnen</a></div>`;
    const upd = () => { p.querySelector('[data-mailto]').href = 'mailto:?subject=' + encodeURIComponent($(`#mail-subj-${c.id}`).value) + '&body=' + encodeURIComponent($(`#mail-body-${c.id}`).value); };
    upd();
    p.querySelectorAll('input, textarea').forEach((x) => x.addEventListener('input', upd));
    p.querySelector('[data-copytext]').addEventListener('click', (e) => copyText($(`#mail-body-${c.id}`).value, e.currentTarget));
    p.querySelector('[data-close]').addEventListener('click', () => { p.hidden = true; });
  }
  function showQR(c) {
    const p = sharePanel(c);
    let svg = '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(linkFor(c));
      qr.make();
      svg = qr.createSvgTag(6, 4);
    } catch { svg = '<p class="error">Der QR-Code konnte nicht erstellt werden.</p>'; }
    p.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">QR-Code für «${esc(c.title)}»</h4><button class="btn quiet small" type="button" data-close>Schliessen</button></div>
      <div class="qr-box"><div class="qr" aria-label="QR-Code zum Link der Erhebung" role="img">${svg}</div>
        <div class="stack" style="gap:10px;max-width:46ch"><p class="small">Für Aushang, Präsentation oder Konferenz. Den Link immer mit abdrucken, damit er auch ohne Scanner nutzbar ist:</p>
          <p class="small"><code>${esc(linkFor(c))}</code></p>
          <div class="row"><button class="btn secondary" type="button" data-png>Als Bild speichern (PNG)</button><button class="btn quiet" type="button" data-svg>Als SVG speichern</button></div></div></div>`;
    p.querySelector('[data-close]').addEventListener('click', () => { p.hidden = true; });
    const svgEl = p.querySelector('.qr svg');
    const fname = `QR_${c.title.replace(/[^\wäöüÄÖÜ-]+/g, '_')}`;
    p.querySelector('[data-svg]').addEventListener('click', () => download(fname + '.svg', svgEl.outerHTML, 'image/svg+xml'));
    p.querySelector('[data-png]').addEventListener('click', () => {
      const img = new Image();
      img.onload = () => {
        const size = 800;
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, size, size);
        cv.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgEl.outerHTML);
    });
  }

  function fillSelects() {
    const withBlock = campaigns.filter((c) => Block.count(c));
    $('#camp-copy-field').hidden = !withBlock.length;
    $('#camp-copy').innerHTML = `<option value="">Ohne eigene Fragen beginnen</option>` + withBlock.map((c) => `<option value="${c.id}">Eigene Fragen von «${esc(c.title)}» übernehmen</option>`).join('');
    const opts = campaigns.map((c) => `<option value="${c.id}">${esc(c.title)}${c.status === 'closed' ? ' (geschlossen)' : ''}</option>`).join('');
    $('#an-campaign').innerHTML = opts;
    $('#fq-campaign').innerHTML = opts;
  }

  $('#form-campaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#camp-msg').textContent = '';
    try {
      await api('POST', 'leitung/campaigns', { title: $('#camp-title').value, expected: $('#camp-expected').value.trim() || undefined, copyBlockFrom: $('#camp-copy').value || undefined });
      $('#camp-title').value = ''; $('#camp-expected').value = '';
      await loadCampaigns();
      $('#create-box').open = false;
    } catch (err) { $('#camp-msg').textContent = err.message; }
  });

  /* ---------- Auswertung ---------- */
  function openAnalysis(id) {
    if (!campaigns.length) { $('#an-out').innerHTML = '<p class="muted">Noch keine Erhebung vorhanden.</p>'; return; }
    const c = byId(id) || byId(an.id) || campaigns[0];
    if (an.id !== c.id) an = { id: c.id, compare: '', stufe: '' };
    $('#an-campaign').value = c.id;
    loadAnalysis();
  }
  $('#an-campaign').addEventListener('change', (e) => { location.hash = 'auswertung/' + e.target.value; });

  async function loadAnalysis() {
    const c = byId(an.id);
    if (!c) return;
    $('#an-compare').innerHTML = `<option value="">Kein Vergleich</option>` + campaigns.filter((x) => x.id !== c.id).map((x) => `<option value="${x.id}" ${x.id === an.compare ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
    const qs = an.stufe ? '?stufe=' + encodeURIComponent(an.stufe) : '';
    const out = $('#an-out');
    out.innerHTML = '<p class="muted">Wird geladen …</p>';
    let data, cmp = null;
    try {
      data = await api('GET', `leitung/campaigns/${c.id}/aggregate${qs}`);
      if (an.compare) cmp = await api('GET', `leitung/campaigns/${an.compare}/aggregate${qs}`);
    } catch (err) { out.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
    $('#an-stufe').innerHTML = `<option value="">Alle Stufen</option>` + data.stufen.map((s) => `<option ${s.stufe === an.stufe ? 'selected' : ''}>${esc(s.stufe)}</option>`).join('');
    renderAnalysis(c, data, cmp);
  }
  $('#an-compare').addEventListener('change', (e) => { an.compare = e.target.value; loadAnalysis(); });
  $('#an-stufe').addEventListener('change', (e) => { an.stufe = e.target.value; loadAnalysis(); });

  // Gewählte Darstellung bleibt beim Wechsel von Erhebung oder Stufe erhalten
  const view = { chart: 'radar', level: 'areas', order: 'order' };
  let secObserver = null;
  const CHARTS = [['radar', 'Netz'], ['bars', 'Balken'], ['dist', 'Verteilung'], ['box', 'Boxplot']];
  const seg = (name, label, opts, cur, disabled) => `<div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, t]) =>
    `<button type="button" data-${name}="${v}" aria-pressed="${v === cur}" ${disabled ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
  const saveBtn = (key) => `<button class="btn quiet small no-print" type="button" data-png="${key}">Als Bild speichern</button>`;
  const fileBase = (c) => c.title.replace(/[^\wäöüÄÖÜ-]+/g, '_');

  function chartExplain(chart, level, hasCmp) {
    const cmpNote = hasCmp && (chart === 'dist' || chart === 'box') ? ' Der Vergleich mit der anderen Erhebung erscheint im Netz, bei den Balken und unten unter «Veränderung».' : '';
    if (chart === 'radar') return 'Mittelwert der Teilbereiche pro Bereich. Stufe I = 1 bis VI = 6. «Keine Gelegenheit» zählt nicht mit.';
    if (chart === 'bars') return `Mittelwert pro ${level === 'areas' ? 'Bereich' : 'Teilbereich'}. Stufe I = 1 bis VI = 6. «Keine Gelegenheit» zählt nicht mit.`;
    if (chart === 'dist') return `Anteil der Einschätzungen pro Stufe${level === 'areas' ? ' (alle Teilbereiche eines Bereichs zusammen)' : ''}. «k. G.» = Anzahl «keine Gelegenheit», nicht in den Prozenten enthalten.` + cmpNote;
    return `<span class="box-legend"><span><i class="lg-box"></i>mittlere 50 %</span><span><i class="lg-med"></i>Median</span><span><i class="lg-mean"></i>Mittelwert</span><span><i class="lg-wh"></i>10–90 %</span></span>
      Minimum und Maximum werden zum Schutz einzelner Personen nicht gezeigt.${level === 'areas' ? ' Grundlage pro Bereich: die persönlichen Mittelwerte der Lehrpersonen.' : ''}` + cmpNote;
  }

  function renderAnalysis(c, data, cmp) {
    const out = $('#an-out');
    const testNote = data.testMode ? `<div class="box box--warning"><b>Testmodus:</b> Die Auswertung erscheint schon ab ${data.min === 1 ? 'der ersten abgeschlossenen Teilnahme' : data.min + ' abgeschlossenen Teilnahmen'}. Einzelne Antworten können dadurch erkennbar sein. Vor dem Echtbetrieb in Vercel die Variable <code>MIN_GROUP_SIZE</code> auf 5 setzen.</div>` : '';
    const stufeNote = data.min > 1 ? `<p class="small muted">Eine Filterung nach Schulstufe ist nur für Stufen mit mindestens ${data.min} abgeschlossenen Teilnahmen möglich.</p>` : '';
    if (data.tooFew) {
      const txt = data.n === 0
        ? `Für «${esc(c.title)}» ist noch keine Teilnahme abgeschlossen${an.stufe ? ' in dieser Stufe' : ''}.`
        : `${data.n} von mindestens ${data.min} abgeschlossenen Teilnahmen${an.stufe ? ' in dieser Stufe' : ''}. Die Auswertung erscheint ab ${data.min}, damit keine Rückschlüsse auf einzelne Lehrpersonen möglich sind.`;
      out.innerHTML = testNote + `<div class="box box--info stack" style="gap:8px"><h3>Noch keine Auswertung</h3><p>${txt}</p>
        ${c.status === 'open' ? `<p class="small">Den Link unter <a href="#erhebungen">Erhebungen</a> ans Kollegium weitergeben.</p>` : ''}</div>${stufeNote}`;
      return;
    }
    const agg = data.agg;
    const cagg = cmp && !cmp.tooFew ? cmp.agg : null;
    const cTitle = cmp ? byId(an.compare).title : '';
    const sorted = SUBS.filter((s) => agg.bySub[s.id].mean !== null).sort((a, b) => agg.bySub[a.id].mean - agg.bySub[b.id].mean);
    const deltaTxt = (i) => {
      if (!cagg || agg.areas[i].mean === null || cagg.areas[i].mean === null) return '';
      const d = agg.areas[i].mean - cagg.areas[i].mean;
      return `<span class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d > 0 ? '+' : ''}${fmt(d)}</span>`;
    };
    const item = (s) => `<li class="focus-item"><span class="badge lv${Math.min(6, Math.max(1, Math.round(agg.bySub[s.id].mean)))}">Ø ${fmt(agg.bySub[s.id].mean)}</span><span><b>${s.id}</b> ${esc(s.title)}</span></li>`;
    const pd = DKCore.schoolThemes(ITEMS, agg, 3);
    const quote = c.expected ? ` von ${c.expected} Lehrpersonen (${Math.min(100, Math.round(100 * data.total / c.expected))} %)` : '';
    const noOppSVG = Charts.noOpp(agg);
    const bs = data.byStufe;

    // Abschnitte mit grauem Titelband und Nummer; die Navigation darüber zeigt, wo man gerade ist
    const secs = [['overview', 'Überblick'], ['profil', 'Profil der Schule']];
    if (cagg) secs.push(['change', 'Veränderung']);
    secs.push(['needs', 'Wer braucht was?']);
    if (noOppSVG) secs.push(['noopp', 'Voraussetzungen']);
    if (Array.isArray(bs)) secs.push(['stufen', 'Schulstufen']);
    secs.push(['table', 'Tabelle']);
    if (data.custom) secs.push(['custom', 'Eigene Fragen']);
    const no = (id) => secs.findIndex((x) => x[0] === id) + 1;
    const band = (id, title, tools = '') => `<div class="sec-head"><h3 id="h-${id}"><span class="sec-no">${no(id)}</span>${title}</h3>${tools ? `<div class="sec-tools no-print">${tools}</div>` : ''}</div>`;
    const lvOf = (v) => Math.min(6, Math.max(1, Math.round(v)));
    const mult = pd.multipliers.map((s) => { const d = agg.bySub[s.id], r = d.counts.slice(1).reduce((x, y) => x + y, 0); return { s, share: (d.counts[5] + d.counts[6]) / r }; }).sort((x, y) => y.share - x.share);

    out.innerHTML = testNote + `
      ${cmp && cmp.tooFew ? `<div class="box box--info">Für «${esc(cTitle)}» liegen zu wenige abgeschlossene Teilnahmen vor. Ein Vergleich ist darum nicht möglich.</div>` : ''}
      <nav class="an-nav no-print" aria-label="Abschnitte der Auswertung">
        <div class="an-nav-links">${secs.map(([id, t]) => `<a href="#sec-${id}" data-sec="${id}">${t}</a>`).join('')}</div>
        <button class="btn quiet small" type="button" data-report>Bericht (PDF)</button>
      </nav>

      <section class="an-sec" id="sec-overview" aria-labelledby="h-overview">
        ${band('overview', 'Überblick')}
        <p class="small muted">${data.n} abgeschlossene Teilnahme${data.n === 1 ? '' : 'n'}${an.stufe ? ' in der Stufe «' + esc(an.stufe) + '»' : quote}${cagg ? ` · Veränderung gegenüber «${esc(cTitle)}»` : ''}</p>
        <div class="kpis">
          ${ITEMS.areas.map((a, i) => { const v = agg.areas[i].mean; return `<div class="kpi" style="--kpi:var(--l${v === null ? 0 : lvOf(v)})">
            <span class="kpi-name"><b>${a.id}</b> ${esc(a.short)}</span>
            <span class="kpi-val">${fmt(v)}${deltaTxt(i)}</span>
            <span class="kpi-stage">${v === null ? '' : UI.LV[lvOf(v) - 1].roman + ' ' + esc(UI.LV[lvOf(v) - 1].label)}</span></div>`; }).join('')}
        </div>
        <div class="summary-panel">
          <div class="stack" style="gap:10px"><h4>Handlungsfelder</h4><ul class="list-plain">${sorted.slice(0, 4).map(item).join('')}</ul></div>
          <div class="stack" style="gap:10px"><h4>Stärken des Kollegiums</h4><ul class="list-plain">${sorted.slice(-3).reverse().map(item).join('')}</ul></div>
          <div class="stack" style="gap:10px"><h4>Themen für die Weiterbildung</h4>
            ${pd.themes.length ? `<ul class="pd-list">${pd.themes.map((t) => `<li><span class="pd-chip">${esc(t.theme)}</span> <span class="small muted">passt zu ${t.subs.join(', ')}</span></li>`).join('')}</ul>
            <p class="small muted">fobizz-Themenbereiche, abgeleitet aus den Handlungsfeldern.</p>` : '<p class="small muted">Keine Empfehlung: Alle Teilbereiche sind auf hohem Niveau.</p>'}
          </div>
          ${mult.length || pd.noOpp.length ? `<div class="summary-notes">
            ${mult.length ? `<p class="small"><b>Potenzial für interne Weitergabe:</b> ${mult.slice(0, 5).map((m) => m.s.id).join(', ')}${mult.length > 5 ? ` und ${mult.length - 5} weitere` : ''}. Hier steht mindestens ein Viertel des Kollegiums auf Stufe V oder VI.</p>` : ''}
            ${pd.noOpp.length ? `<p class="small"><b>Voraussetzungen klären:</b> ${pd.noOpp.map((s) => s.id).join(', ')}. Mindestens ein Viertel hatte keine Gelegenheit. Themenbereich für die Schulleitung: ${esc(ITEMS.pd.lead)}.</p>` : ''}
          </div>` : ''}
        </div>
      </section>

      <section class="an-sec" id="sec-profil" aria-labelledby="h-profil">
        ${band('profil', 'Profil der Schule', '<div class="row" id="chart-controls"></div>')}
        <figure tabindex="0" class="chart" id="chart-main"></figure>
      </section>

      ${cagg ? `<section class="an-sec" id="sec-change" aria-labelledby="h-change">
        ${band('change', `Veränderung seit «${esc(cTitle)}»`, saveBtn('change'))}
        <p class="small muted lead-note">Mittelwert pro Teilbereich, nach Veränderung sortiert. <span class="lg-dot lg-dot--cmp"></span> ${esc(cTitle)} · <span class="lg-dot"></span> ${esc(c.title)}</p>
        <figure tabindex="0" class="chart" data-chart="change">${Charts.dumbbell(agg, cagg)}</figure>
        <p class="small muted">Verglichen wird das Kollegium als Ganzes. Personelle Wechsel beeinflussen das Ergebnis.</p>
      </section>` : ''}

      <section class="an-sec" id="sec-needs" aria-labelledby="h-needs">
        ${band('needs', 'Wer braucht was?', `<label class="small" for="needs-order">Sortieren</label><select id="needs-order">
            <option value="order" ${view.order === 'order' ? 'selected' : ''}>nach Teilbereich</option>
            <option value="entry" ${view.order === 'entry' ? 'selected' : ''}>Bedarf an Einstieg zuerst</option>
            <option value="spread" ${view.order === 'spread' ? 'selected' : ''}>gespaltene zuerst</option></select>${saveBtn('needs')}`)}
        <p class="small muted lead-note">Wie viele Lehrpersonen brauchen einen Einstieg, eine Vertiefung oder können ihr Wissen weitergeben?</p>
        <div class="legend"><span><i style="background:${Charts.NEEDCOL[0]}"></i>Einstieg (I–II)</span><span><i style="background:${Charts.NEEDCOL[1]}"></i>Vertiefung (III–IV)</span><span><i style="background:${Charts.NEEDCOL[2]}"></i>Weitergeben (V–VI)</span><span>Zahl im Balken: Anzahl Lehrpersonen</span></div>
        <figure tabindex="0" class="chart" data-chart="needs" id="chart-needs">${Charts.needs(agg, view.order)}</figure>
        <details class="howto"><summary>Was heisst «einig» und «gespalten»?</summary>
          <p class="small"><b>Gespalten:</b> Mindestens je ein Viertel steht auf I–II und auf V–VI. Hier eignen sich Angebote in verschiedenen Niveaus oder Tandems aus erfahrenen und neuen Kolleginnen und Kollegen. <b>Einig:</b> Die Einschätzungen liegen nahe beieinander (Standardabweichung höchstens 0,8). Ein gemeinsames Angebot für alle passt gut. <b>Gemischt:</b> alles dazwischen.</p></details>
      </section>

      ${noOppSVG ? `<section class="an-sec" id="sec-noopp" aria-labelledby="h-noopp">
        ${band('noopp', 'Voraussetzungen', saveBtn('noopp'))}
        <p class="small muted lead-note">Anteil der Lehrpersonen, die in einem Teilbereich bisher <b>keine Gelegenheit</b> hatten. Ab einem Viertel (gestrichelte Linie) lohnt es sich, Voraussetzungen zu klären, zum Beispiel Geräte, Plattformen oder Absprachen im Team.</p>
        <figure tabindex="0" class="chart" data-chart="noopp">${noOppSVG}</figure>
      </section>` : ''}

      ${Array.isArray(bs) ? `<section class="an-sec" id="sec-stufen" aria-labelledby="h-stufen">
        ${band('stufen', 'Schulstufen im Vergleich', saveBtn('stufen'))}
        <p class="small muted lead-note">Mittelwert pro Bereich und Schulstufe. Nur sichtbar, wenn jede Gruppe mindestens ${data.min} Teilnahme${data.min === 1 ? '' : 'n'} umfasst.</p>
        <div class="legend">${Charts.stufenLegend(bs)}</div>
        <figure tabindex="0" class="chart" data-chart="stufen">${Charts.stufen(bs)}</figure>
      </section>` : ''}

      <section class="an-sec" id="sec-table" aria-labelledby="h-table">
        ${band('table', 'Tabelle: Anzahl Lehrpersonen pro Stufe')}
        <p class="small muted lead-note">Je dunkler die Zelle, desto grösser der Anteil. Die gleichen Zahlen enthält der CSV-Export.</p>
        ${heatTable(agg)}
      </section>

      ${data.custom ? `<section class="an-sec" id="sec-custom" aria-labelledby="h-custom">
        ${band('custom', esc(data.custom.block.title || 'Eigene Fragen der Schule'))}
        ${Block.section(data.custom, data.n, { bare: true })}
      </section>` : ''}

      ${bs && bs.hidden ? `<p class="small muted">Der Vergleich der Schulstufen erscheint, sobald jede Stufe (und die Gruppe ohne Stufenangabe) mindestens ${data.min} abgeschlossene Teilnahmen hat.</p>` : ''}
      ${stufeNote}
      <div class="export-bar no-print">
        <div class="stack" style="gap:4px"><b>Ergebnisse weitergeben</b><span class="small muted">Für Schulkonferenz, Schulpflege oder die eigene Ablage.</span></div>
        <div class="row">
          <button class="btn" type="button" id="btn-report">Bericht auf einer Seite (PDF)</button>
          <button class="btn secondary" type="button" id="btn-csv">Zahlen als CSV</button>
        </div>
      </div>`;

    function drawMain() {
      const isRadar = view.chart === 'radar';
      $('#chart-controls').innerHTML = seg('chart', 'Darstellung', CHARTS, view.chart) +
        (isRadar ? '' : seg('level', 'Ebene', [['areas', 'Bereiche'], ['subs', 'Teilbereiche']], view.level)) + saveBtn('main');
      const names = { cur: c.title, cmp: cTitle };
      let svg;
      if (isRadar) {
        const series = [{ values: agg.areas.map((a) => a.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
        if (cagg) series.push({ values: cagg.areas.map((a) => a.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
        const rows = ITEMS.areas.map((a, i) => {
          const v = agg.areas[i].mean, w = cagg ? cagg.areas[i].mean : null;
          const d = v !== null && w !== null ? v - w : null;
          return `<tr><th scope="row"><b>${a.id}</b> ${esc(a.title)}</th><td><b>${fmt(v)}</b></td>${cagg ? `<td>${fmt(w)}</td><td class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d === null ? '–' : (d > 0 ? '+' : '') + fmt(d)}</td>` : ''}<td class="muted">${v === null ? '' : esc(UI.LV[Math.min(6, Math.max(1, Math.round(v))) - 1].label)}</td></tr>`;
        }).join('');
        svg = `<div class="radar-side"><div class="radar-wrap">${radarSVG(series, { valueLabels: true, label: 'Netzdiagramm: Mittelwerte der Schule pro Bereich' })}</div>
          <table class="kv-table"><caption class="sr-only">Mittelwerte pro Bereich</caption><thead><tr><th scope="col">Bereich</th><th scope="col">${esc(c.title)}</th>${cagg ? `<th scope="col">${esc(cTitle)}</th><th scope="col">Δ</th>` : ''}<th scope="col">Stufe</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } else if (view.chart === 'bars') svg = Charts.bars(agg, view.level, cagg, names);
      else if (view.chart === 'dist') svg = Charts.dist(agg, view.level);
      else svg = Charts.boxplot(agg, view.level);
      const cmpLegend = cagg && (isRadar || view.chart === 'bars') ? `<span><i style="background:#E2001A"></i>${esc(c.title)}</span><span><i style="background:#6E6E6E"></i>${esc(cTitle)}</span>` : '';
      const lvLegend = view.chart === 'dist' ? UI.LV.map((l, i) => `<span><i style="background:${Charts.LVCOL[i + 1]}"></i>${l.roman} ${esc(l.label)}</span>`).join('') : '';
      $('#chart-main').className = 'chart' + (isRadar ? ' chart--radar' : '');
      $('#chart-main').innerHTML = svg + `<figcaption class="legend">${cmpLegend}${lvLegend}<span>${chartExplain(view.chart, view.level, !!cagg)}</span></figcaption>`;
      $$('#chart-controls [data-chart]').forEach((b) => b.addEventListener('click', () => { view.chart = b.dataset.chart; drawMain(); $('#chart-controls [aria-pressed=true]').focus(); }));
      $$('#chart-controls [data-level]').forEach((b) => b.addEventListener('click', () => { view.level = b.dataset.level; drawMain(); $(`#chart-controls [data-level=${view.level}]`).focus(); }));
      $('#chart-controls [data-png]').addEventListener('click', () => Charts.png($('#chart-main svg'), `${fileBase(c)}_${CHARTS.find((x) => x[0] === view.chart)[1]}_${today()}`));
    }
    drawMain();

    $('#needs-order').addEventListener('change', (e) => { view.order = e.target.value; $('#chart-needs').innerHTML = Charts.needs(agg, view.order); });
    const pngNames = { change: 'Veraenderung', needs: 'Wer_braucht_was', noopp: 'Voraussetzungen', stufen: 'Schulstufen' };
    $$('#an-out .an-sec [data-png]').filter((b) => b.dataset.png !== 'main').forEach((b) => b.addEventListener('click', () =>
      Charts.png($(`[data-chart=${b.dataset.png}] svg`), `${fileBase(c)}_${pngNames[b.dataset.png]}_${today()}`)));
    $$('.an-nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    // Aktiven Abschnitt in der Navigation markieren
    if (secObserver) secObserver.disconnect();
    if ('IntersectionObserver' in window) {
      secObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) $$('.an-nav a').forEach((a) => a.classList.toggle('active', a.dataset.sec === en.target.id.slice(4))); });
      }, { rootMargin: '-80px 0px -65% 0px' });
      $$('#an-out .an-sec').forEach((sec) => secObserver.observe(sec));
    }
    $('[data-report]').addEventListener('click', () => $('#btn-report').click());
    $('#btn-csv').addEventListener('click', () => download(`Schulauswertung_${fileBase(c)}_${today()}.csv`, '﻿' + DKCore.toCSV(ITEMS, agg) + Block.csv(data.custom), 'text/csv;charset=utf-8'));
    $('#btn-report').addEventListener('click', () => printReport(c, data, agg, cagg, cTitle, sorted, pd));
  }

  /* ---------- Bericht auf einer Seite (Schulkonferenz, Schulpflege) ---------- */
  function printReport(c, data, agg, cagg, cTitle, sorted, pd) {
    const r = $('#report');
    const series = [{ values: agg.areas.map((a) => a.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
    if (cagg) series.push({ values: cagg.areas.map((a) => a.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
    const li = (s) => `<li><b>${s.id}</b> ${esc(s.title)} <span class="muted">(Ø ${fmt(agg.bySub[s.id].mean)})</span></li>`;
    const split = SUBS.filter((s) => DKCore.needGroups(agg.bySub[s.id]).spread === 'gespalten');
    const quote = c.expected && !an.stufe ? ` von ${c.expected} Lehrpersonen (${Math.min(100, Math.round(100 * data.total / c.expected))} %)` : '';
    r.innerHTML = `
      <div class="rp-head"><div><div class="eyebrow">${esc(schoolName)}</div><h2>Digitale Kompetenzen des Kollegiums</h2>
        <p>Erhebung «${esc(c.title)}»${an.stufe ? ' · Stufe «' + esc(an.stufe) + '»' : ''} · ${data.n} abgeschlossene Teilnahme${data.n === 1 ? '' : 'n'}${quote} · Stand ${new Date().toLocaleDateString('de-CH')}</p></div></div>
      <div class="stat-row rp-stats">${ITEMS.areas.map((a, i) => `<div class="stat"><span class="small">${a.id} ${esc(a.short)}</span><b>${fmt(agg.areas[i].mean)}</b>${cagg && agg.areas[i].mean !== null && cagg.areas[i].mean !== null ? `<span class="small">${agg.areas[i].mean - cagg.areas[i].mean >= 0 ? '+' : ''}${fmt(agg.areas[i].mean - cagg.areas[i].mean)}</span>` : ''}</div>`).join('')}</div>
      ${cagg ? `<p class="small">Veränderung gegenüber «${esc(cTitle)}» unter den Werten.</p>` : ''}
      <div class="rp-grid">
        <div>${radarSVG(series, { valueLabels: true, label: 'Netzdiagramm' })}
          <p class="small">Mittelwert pro Bereich, Stufe I = 1 bis VI = 6.${cagg ? ` Rot: ${esc(c.title)}, grau gestrichelt: ${esc(cTitle)}.` : ''}</p></div>
        <div class="rp-lists">
          <h3>Handlungsfelder</h3><ul>${sorted.slice(0, 4).map(li).join('')}</ul>
          <h3>Stärken</h3><ul>${sorted.slice(-3).reverse().map(li).join('')}</ul>
          ${pd.themes.length ? `<h3>Themen für die Weiterbildung</h3><ul>${pd.themes.map((t) => `<li>${esc(t.theme)} <span class="muted">(${t.subs.join(', ')})</span></li>`).join('')}</ul>` : ''}
          ${pd.multipliers.length ? `<p class="small"><b>Interne Weitergabe möglich:</b> ${pd.multipliers.map((s) => s.id).join(', ')}</p>` : ''}
          ${split.length ? `<p class="small"><b>Kollegium gespalten:</b> ${split.map((s) => s.id).join(', ')}</p>` : ''}
          ${pd.noOpp.length ? `<p class="small"><b>Voraussetzungen klären:</b> ${pd.noOpp.map((s) => s.id).join(', ')}</p>` : ''}
        </div>
      </div>
      <h3>Verteilung der Stufen pro Bereich</h3>
      ${Charts.dist(agg, 'areas')}
      <div class="legend">${UI.LV.map((l, i) => `<span><i style="background:${Charts.LVCOL[i + 1]}"></i>${l.roman} ${esc(l.label)}</span>`).join('')}</div>
      <p class="small rp-foot">Zusammengefasste Selbsteinschätzungen der Lehrpersonen nach DigCompEdu. Einzelne Profile sind für die Schulleitung nicht einsehbar. Kanton Schwyz, Amt für Volksschulen und Sport.</p>`;
    document.body.classList.add('print-report');
    const done = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  /* ---------- Eigene Fragen ---------- */
  let fqId = null;
  function openQuestions(id) {
    if (!campaigns.length) { $('#block-editor').innerHTML = '<p class="muted">Zuerst unter «Erhebungen» eine Erhebung eröffnen.</p>'; return; }
    const c = byId(id) || byId(fqId) || campaigns.find((x) => x.status === 'open') || campaigns[0];
    fqId = c.id;
    $('#fq-campaign').value = c.id;
    Block.open(c.id, { campaigns: () => campaigns, reload: loadCampaigns, embedded: true });
  }
  $('#fq-campaign').addEventListener('change', (e) => { location.hash = 'fragen/' + e.target.value; });

  Staff.start('leitung', async (user) => {
    schoolName = user.school_name || '';
    $('#school-name').textContent = schoolName || 'Schulleitung';
    try { await loadCampaigns(); } catch (err) { $('#camp-list').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    route();
  });
})();

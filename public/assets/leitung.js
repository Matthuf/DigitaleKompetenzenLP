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
    const noOpp = SUBS.filter((s) => agg.bySub[s.id].counts[0] > 0).sort((a, b) => agg.bySub[b.id].counts[0] - agg.bySub[a.id].counts[0]).slice(0, 3);
    const series = [{ values: agg.areas.map((a) => a.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
    if (cagg) series.push({ values: cagg.areas.map((a) => a.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
    const deltaTxt = (i) => {
      if (!cagg || agg.areas[i].mean === null || cagg.areas[i].mean === null) return '';
      const d = agg.areas[i].mean - cagg.areas[i].mean;
      return `<span class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d > 0 ? '+' : ''}${fmt(d)}</span>`;
    };
    const item = (s) => `<li class="focus-item"><span class="badge lv${Math.min(6, Math.max(1, Math.round(agg.bySub[s.id].mean)))}">Ø ${fmt(agg.bySub[s.id].mean)}</span><span><b>${s.id}</b> ${esc(s.title)}</span></li>`;
    const quote = c.expected ? ` von ${c.expected} Lehrpersonen (${Math.min(100, Math.round(100 * data.total / c.expected))} %)` : '';

    out.innerHTML = testNote + `
      ${cmp && cmp.tooFew ? `<div class="box box--info">Für «${esc(cTitle)}» liegen zu wenige abgeschlossene Teilnahmen vor. Ein Vergleich ist darum nicht möglich.</div>` : ''}
      <p class="small muted">${data.n} abgeschlossene Teilnahme${data.n === 1 ? '' : 'n'}${an.stufe ? ' in der Stufe «' + esc(an.stufe) + '»' : quote}.</p>
      <div class="stat-row">
        ${ITEMS.areas.map((a, i) => `<div class="stat"><span class="small muted">Bereich ${a.id}</span><b>${fmt(agg.areas[i].mean)}</b>${deltaTxt(i)}</div>`).join('')}
      </div>
      <div class="result-top" style="padding-block:0">
        <div class="stack"><h3>Profil der Schule</h3>
          <div class="radar-wrap">${radarSVG(series, { valueLabels: true, label: 'Netzdiagramm: Mittelwerte der Schule pro Bereich' })}</div>
          <div class="legend">${cagg ? `<span><i style="background:#E2001A"></i>${esc(c.title)}</span><span><i style="background:#6E6E6E"></i>${esc(cTitle)}</span>` : ''}<span>Mittelwert der Teilbereiche pro Bereich, Stufen I = 1 bis VI = 6.</span></div></div>
        <div class="stack" style="gap:28px">
          <div class="stack" style="gap:12px"><h3>Handlungsfelder für die Weiterbildung</h3><ul class="list-plain">${sorted.slice(0, 4).map(item).join('')}</ul></div>
          <div class="stack" style="gap:12px"><h3>Stärken des Kollegiums</h3><ul class="list-plain">${sorted.slice(-3).reverse().map(item).join('')}</ul></div>
          ${noOpp.length ? `<div class="stack" style="gap:12px"><h3>Häufig keine Gelegenheit</h3><p class="small muted">Hinweis auf fehlende Voraussetzungen an der Schule.</p>
            <ul class="list-plain small">${noOpp.map((s) => `<li><b>${s.id}</b> ${esc(s.title)}: ${agg.bySub[s.id].counts[0]} Nennung${agg.bySub[s.id].counts[0] === 1 ? '' : 'en'}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>
      <div class="stack" style="gap:12px">
        <h3>Verteilung pro Teilbereich</h3>
        <p class="small muted">Anzahl Lehrpersonen pro Stufe. Je dunkler, desto grösser der Anteil.</p>
        ${heatTable(agg)}
      </div>
      ${data.custom ? Block.section(data.custom, data.n) : ''}
      ${stufeNote}
      <div class="row"><button class="btn secondary" type="button" id="btn-csv">Auswertung als CSV speichern</button></div>`;
    $('#btn-csv').addEventListener('click', () => download(`Schulauswertung_${c.title.replace(/[^\wäöüÄÖÜ-]+/g, '_')}_${today()}.csv`, '﻿' + DKCore.toCSV(ITEMS, agg) + Block.csv(data.custom), 'text/csv;charset=utf-8'));
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

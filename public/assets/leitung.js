// Dashboard der Schulleitung: Erhebungen verwalten und zusammengefasste Auswertung ansehen.
(function () {
  'use strict';
  const { ITEMS, LV, $, $$, esc, fmt, date, api, radarSVG, download, today, copyText, heatTable } = UI;
  const SUBS = DKCore.allSubareas(ITEMS);
  let campaigns = [];
  let sel = { id: null, compare: '', stufe: '' };

  const linkFor = (c) => `${location.origin}/t/${c.token}`;

  async function loadCampaigns() {
    campaigns = await api('GET', 'leitung/campaigns');
    renderCampaigns();
  }

  function renderCampaigns() {
    const t = $('#camp-table');
    if (!campaigns.length) {
      t.innerHTML = `<tbody><tr><td class="muted">Noch keine Erhebung. Mit «Erstellen» die erste Erhebung anlegen und den Link ans Kollegium weitergeben.</td></tr></tbody>`;
      $('#analysis').hidden = true;
      return;
    }
    t.innerHTML = `<thead><tr><th scope="col">Erhebung</th><th scope="col">Status</th><th scope="col">Erstellt</th><th scope="col" class="num">Abgeschlossen</th><th scope="col" class="num">In Bearbeitung</th><th scope="col">Link für das Kollegium</th><th scope="col"></th></tr></thead>
      <tbody>${campaigns.map((c) => `<tr>
        <td><b>${esc(c.title)}</b></td>
        <td><span class="status ${c.status}">${c.status === 'open' ? 'offen' : 'geschlossen'}</span></td>
        <td>${date(c.created_at)}</td>
        <td class="num">${c.submitted}</td>
        <td class="num">${c.drafts}</td>
        <td>${c.status === 'open' ? `<div class="linkbox"><code>${esc(linkFor(c))}</code><button class="btn quiet" type="button" data-copy="${c.id}">Kopieren</button></div>` : '<span class="small muted">Keine neuen Teilnahmen möglich</span>'}</td>
        <td><div class="row" style="gap:4px">
          <button class="btn ${sel.id === c.id ? '' : 'secondary'}" type="button" data-show="${c.id}">Auswertung</button>
          <button class="btn quiet" type="button" data-toggle="${c.id}">${c.status === 'open' ? 'Schliessen' : 'Wieder öffnen'}</button>
        </div></td></tr>`).join('')}</tbody>`;
    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(linkFor(campaigns.find((c) => c.id === b.dataset.copy)), b)));
    $$('[data-show]').forEach((b) => b.addEventListener('click', () => { sel = { id: b.dataset.show, compare: '', stufe: '' }; renderCampaigns(); loadAnalysis(); }));
    $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const c = campaigns.find((x) => x.id === b.dataset.toggle);
      await api('PATCH', 'leitung/campaigns/' + c.id, { status: c.status === 'open' ? 'closed' : 'open' });
      loadCampaigns();
    }));
    if (!sel.id) { sel.id = campaigns[0].id; loadAnalysis(); }
  }

  $('#form-campaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#camp-msg').textContent = '';
    try {
      const r = await api('POST', 'leitung/campaigns', { title: $('#camp-title').value });
      $('#camp-title').value = '';
      sel = { id: r.id, compare: '', stufe: '' };
      await loadCampaigns();
      loadAnalysis();
    } catch (err) { $('#camp-msg').textContent = err.message; }
  });

  async function loadAnalysis() {
    const c = campaigns.find((x) => x.id === sel.id);
    if (!c) return;
    $('#analysis').hidden = false;
    $('#an-title').textContent = c.title;
    $('#an-compare').innerHTML = `<option value="">Kein Vergleich</option>` + campaigns.filter((x) => x.id !== c.id).map((x) => `<option value="${x.id}" ${x.id === sel.compare ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
    const qs = sel.stufe ? '?stufe=' + encodeURIComponent(sel.stufe) : '';
    const out = $('#an-out');
    out.innerHTML = '<p class="muted">Wird geladen …</p>';
    let data, cmp = null;
    try {
      data = await api('GET', `leitung/campaigns/${c.id}/aggregate${qs}`);
      if (sel.compare) cmp = await api('GET', `leitung/campaigns/${sel.compare}/aggregate${qs}`);
    } catch (err) { out.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
    $('#an-stufe').innerHTML = `<option value="">Alle Stufen</option>` + data.stufen.map((s) => `<option ${s.stufe === sel.stufe ? 'selected' : ''}>${esc(s.stufe)}</option>`).join('');
    renderAnalysis(c, data, cmp);
  }
  $('#an-compare').addEventListener('change', (e) => { sel.compare = e.target.value; loadAnalysis(); });
  $('#an-stufe').addEventListener('change', (e) => { sel.stufe = e.target.value; loadAnalysis(); });

  function renderAnalysis(c, data, cmp) {
    const out = $('#an-out');
    const stufeNote = `<p class="small muted">Eine Filterung nach Schulstufe ist nur für Stufen mit mindestens ${data.min} abgeschlossenen Teilnahmen möglich.</p>`;
    if (data.tooFew) {
      out.innerHTML = `<div class="box box--info stack" style="gap:8px">
        <h3>Noch zu wenige abgeschlossene Teilnahmen</h3>
        <p>${data.n} von mindestens ${data.min} abgeschlossenen Teilnahmen${sel.stufe ? ' in dieser Stufe' : ''}. Die Auswertung erscheint ab ${data.min}, damit keine Rückschlüsse auf einzelne Lehrpersonen möglich sind.</p>
      </div>${stufeNote}`;
      return;
    }
    const agg = data.agg;
    const cagg = cmp && !cmp.tooFew ? cmp.agg : null;
    const cTitle = cmp ? campaigns.find((x) => x.id === sel.compare).title : '';
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

    out.innerHTML = `
      ${cmp && cmp.tooFew ? `<div class="box box--info">Für «${esc(cTitle)}» liegen zu wenige abgeschlossene Teilnahmen vor. Ein Vergleich ist darum nicht möglich.</div>` : ''}
      <div class="stat-row">
        <div class="stat"><span class="small muted">Abgeschlossene Teilnahmen</span><b>${data.n}</b></div>
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
      ${stufeNote}
      <div class="row"><button class="btn secondary" type="button" id="btn-csv">Auswertung als CSV speichern</button></div>`;
    $('#btn-csv').addEventListener('click', () => download(`Schulauswertung_${c.title.replace(/[^\wäöüÄÖÜ-]+/g, '_')}_${today()}.csv`, '﻿' + DKCore.toCSV(ITEMS, agg), 'text/csv;charset=utf-8'));
  }

  Staff.start('leitung', (user) => {
    $('#school-name').textContent = user.school_name || 'Schulleitung';
    loadCampaigns().catch((err) => { $('#camp-msg').textContent = err.message; });
  });
})();

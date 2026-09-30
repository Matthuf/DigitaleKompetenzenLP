// Gemeinsame Darstellung der Auswertung für Rektorat, Schulleitung und AVS (kantonale Sicht).
// render(out, data, cmp, opts) – data kommt von leitung/aggregate bzw. admin/aggregate.
window.Analysis = (function () {
  'use strict';
  const { ITEMS, LV, $, $$, esc, fmt, radarSVG, download, today, heatTable } = UI;
  const SUBS = DKCore.allSubareas(ITEMS);

  // Gewählte Darstellung bleibt beim Wechsel von Erhebung oder Filter erhalten
  const view = { chart: 'radar', level: 'areas', order: 'order' };
  let secObserver = null;
  const CHARTS = [['radar', 'Netz'], ['bars', 'Balken'], ['dist', 'Verteilung'], ['box', 'Boxplot']];
  const seg = (name, label, opts, cur) => `<div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, t]) =>
    `<button type="button" data-${name}="${v}" aria-pressed="${v === cur}">${esc(t)}</button>`).join('')}</div>`;
  const saveBtn = (key) => `<button class="btn quiet small no-print" type="button" data-png="${key}">Als Bild speichern</button>`;
  const safe = (t) => String(t || 'Auswertung').replace(/[^\wäöüÄÖÜ-]+/g, '_');
  const lvOf = (v) => Math.min(6, Math.max(1, Math.round(v)));

  function chartExplain(chart, level, hasCmp) {
    const cmpNote = hasCmp && (chart === 'dist' || chart === 'box') ? ' Der Vergleich erscheint im Netz, bei den Balken und unter «Veränderung».' : '';
    if (chart === 'radar') return 'Mittelwert der Teilbereiche pro Bereich. Stufe I = 1 bis VI = 6. «Keine Gelegenheit» zählt nicht mit.';
    if (chart === 'bars') return `Mittelwert pro ${level === 'areas' ? 'Bereich' : 'Teilbereich'}. Stufe I = 1 bis VI = 6. «Keine Gelegenheit» zählt nicht mit.`;
    if (chart === 'dist') return `Anteil der Einschätzungen pro Stufe${level === 'areas' ? ' (alle Teilbereiche eines Bereichs zusammen)' : ''}. «k. G.» = Anzahl «keine Gelegenheit», nicht in den Prozenten enthalten.` + cmpNote;
    return `<span class="box-legend"><span><i class="lg-box"></i>mittlere 50 %</span><span><i class="lg-med"></i>Median</span><span><i class="lg-mean"></i>Mittelwert</span><span><i class="lg-wh"></i>10–90 %</span></span>
      Minimum und Maximum werden zum Schutz einzelner Personen nicht gezeigt.${level === 'areas' ? ' Grundlage pro Bereich: die persönlichen Mittelwerte der Lehrpersonen.' : ''}` + cmpNote;
  }

  /* opts: title, cmpTitle, org, filterText, groups: [[key, Titel, Hinweis]], tooFewHint, showCustom */
  function render(out, data, cmp, o) {
    if (data.tooFew) {
      const txt = data.reason ? esc(data.reason)
        : `Für «${esc(o.title)}»${o.filterText ? ' (' + esc(o.filterText) + ')' : ''} ist noch keine Teilnahme abgeschlossen.`;
      out.innerHTML = `<div class="box box--info stack" style="gap:8px"><h3>Noch keine Auswertung</h3><p>${txt}</p>${o.tooFewHint || ''}</div>`;
      return;
    }
    const agg = data.agg;
    const cagg = cmp && !cmp.tooFew ? cmp.agg : null;
    const cTitle = o.cmpTitle || '';
    const sorted = SUBS.filter((s) => agg.bySub[s.id].mean !== null).sort((a, b) => agg.bySub[a.id].mean - agg.bySub[b.id].mean);
    const deltaTxt = (i) => {
      if (!cagg || agg.areas[i].mean === null || cagg.areas[i].mean === null) return '';
      const d = agg.areas[i].mean - cagg.areas[i].mean;
      return `<span class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d > 0 ? '+' : ''}${fmt(d)}</span>`;
    };
    const item = (s) => `<li class="focus-item"><span class="badge lv${lvOf(agg.bySub[s.id].mean)}">Ø ${fmt(agg.bySub[s.id].mean)}</span><span><b>${s.id}</b> ${esc(s.title)}</span></li>`;
    const pd = DKCore.schoolThemes(ITEMS, agg, 3);
    const quote = data.expected && data.total !== undefined ? ` von ${data.expected} Lehrpersonen (${Math.min(100, Math.round(100 * data.total / data.expected))} %)` : '';
    const noOppSVG = Charts.noOpp(agg);
    const groups = (o.groups || []).map(([key, title, note]) => ({ key, title, note, g: data.groups && data.groups[key] }));
    const shownGroups = groups.filter((x) => Array.isArray(x.g));
    const custom = o.showCustom && data.custom;

    // Abschnitte mit grauem Titelband und Nummer; die Navigation darüber zeigt, wo man gerade ist
    const secs = [['overview', 'Überblick'], ['profil', 'Profil']];
    if (cagg) secs.push(['change', 'Veränderung']);
    secs.push(['needs', 'Wer braucht was?']);
    if (noOppSVG) secs.push(['noopp', 'Voraussetzungen']);
    shownGroups.forEach((x) => secs.push(['grp-' + x.key, x.title.replace(/ im Vergleich$/, '')]));
    secs.push(['table', 'Tabelle']);
    if (custom) secs.push(['custom', 'Eigene Fragen']);
    const no = (id) => secs.findIndex((x) => x[0] === id) + 1;
    const band = (id, title, tools = '') => `<div class="sec-head"><h3 id="h-${id}"><span class="sec-no">${no(id)}</span>${title}</h3>${tools ? `<div class="sec-tools no-print">${tools}</div>` : ''}</div>`;
    const mult = pd.multipliers.map((s) => { const d = agg.bySub[s.id], r = d.counts.slice(1).reduce((x, y) => x + y, 0); return { s, share: (d.counts[5] + d.counts[6]) / r }; }).sort((x, y) => y.share - x.share);

    out.innerHTML = `
      ${cmp && cmp.tooFew ? `<div class="box box--info">Für «${esc(cTitle)}» ist noch keine Teilnahme abgeschlossen. Ein Vergleich ist darum nicht möglich.</div>` : ''}
      <nav class="an-nav no-print" aria-label="Abschnitte der Auswertung">
        <div class="an-nav-links">${secs.map(([id, t]) => `<a href="#sec-${id}" data-sec="${id}">${t}</a>`).join('')}</div>
        <button class="btn quiet small" type="button" data-report>Bericht (PDF)</button>
      </nav>

      <section class="an-sec" id="sec-overview" aria-labelledby="h-overview">
        ${band('overview', 'Überblick')}
        <p class="small muted">${data.n} abgeschlossene Teilnahme${data.n === 1 ? '' : 'n'}${o.filterText ? ' · ' + esc(o.filterText) : quote}${o.extraText ? ' · ' + esc(o.extraText) : ''}${cagg ? ` · Veränderung gegenüber «${esc(cTitle)}»` : ''}</p>
        <div class="kpis">
          ${ITEMS.areas.map((a, i) => { const v = agg.areas[i].mean; return `<div class="kpi" style="--kpi:var(--l${v === null ? 0 : lvOf(v)})">
            <span class="kpi-name"><b>${a.id}</b> ${esc(a.short)}</span>
            <span class="kpi-val">${fmt(v)}${deltaTxt(i)}</span>
            <span class="kpi-stage">${v === null ? '' : LV[lvOf(v) - 1].roman + ' ' + esc(LV[lvOf(v) - 1].label)}</span></div>`; }).join('')}
        </div>
        <div class="summary-panel">
          <div class="stack" style="gap:10px"><h4>Handlungsfelder</h4><ul class="list-plain">${sorted.slice(0, 4).map(item).join('')}</ul></div>
          <div class="stack" style="gap:10px"><h4>Stärken</h4><ul class="list-plain">${sorted.slice(-3).reverse().map(item).join('')}</ul></div>
          <div class="stack" style="gap:10px"><h4>Themen für die Weiterbildung</h4>
            ${pd.themes.length ? `<ul class="pd-list">${pd.themes.map((t) => `<li><span class="pd-chip">${esc(t.theme)}</span> <span class="small muted">passt zu ${t.subs.join(', ')}</span></li>`).join('')}</ul>
            <p class="small muted">fobizz-Themenbereiche, abgeleitet aus den Handlungsfeldern.</p>` : '<p class="small muted">Keine Empfehlung: Alle Teilbereiche sind auf hohem Niveau.</p>'}
          </div>
          ${mult.length || pd.noOpp.length ? `<div class="summary-notes">
            ${mult.length ? `<p class="small"><b>Potenzial für interne Weitergabe:</b> ${mult.slice(0, 5).map((m) => m.s.id).join(', ')}${mult.length > 5 ? ` und ${mult.length - 5} weitere` : ''}. Hier steht mindestens ein Viertel auf Stufe V oder VI.</p>` : ''}
            ${pd.noOpp.length ? `<p class="small"><b>Voraussetzungen klären:</b> ${pd.noOpp.map((s) => s.id).join(', ')}. Mindestens ein Viertel hatte keine Gelegenheit. Themenbereich für die Schulleitung: ${esc(ITEMS.pd.lead)}.</p>` : ''}
          </div>` : ''}
        </div>
      </section>

      <section class="an-sec" id="sec-profil" aria-labelledby="h-profil">
        ${band('profil', o.profileTitle || 'Profil der Schule', '<div class="row" id="chart-controls"></div>')}
        <figure tabindex="0" class="chart" id="chart-main"></figure>
      </section>

      ${cagg ? `<section class="an-sec" id="sec-change" aria-labelledby="h-change">
        ${band('change', `Veränderung seit «${esc(cTitle)}»`, saveBtn('change'))}
        <p class="small muted lead-note">Mittelwert pro Teilbereich, nach Veränderung sortiert. <span class="lg-dot lg-dot--cmp"></span> ${esc(cTitle)} · <span class="lg-dot"></span> ${esc(o.title)}</p>
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

      ${shownGroups.map((x) => `<section class="an-sec" id="sec-grp-${x.key}" aria-labelledby="h-grp-${x.key}">
        ${band('grp-' + x.key, esc(x.title), saveBtn('grp-' + x.key))}
        <p class="small muted lead-note">Mittelwert pro Bereich. ${x.note ? esc(x.note) + ' ' : ''}</p>
        <div class="legend">${Charts.stufenLegend(x.g)}</div>
        <figure tabindex="0" class="chart" data-chart="grp-${x.key}">${Charts.stufen(x.g)}</figure>
        <div class="table-scroll" tabindex="0" role="region" aria-label="${esc(x.title)} als Tabelle"><table class="kv-table grp-table">
          <thead><tr><th scope="col">Gruppe</th><th scope="col">n</th>${ITEMS.areas.map((a) => `<th scope="col" title="${esc(a.title)}">${a.id}</th>`).join('')}</tr></thead>
          <tbody>${x.g.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${r.n}</td>${r.areas.map((v) => `<td>${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </section>`).join('')}

      <section class="an-sec" id="sec-table" aria-labelledby="h-table">
        ${band('table', 'Tabelle: Anzahl Lehrpersonen pro Stufe')}
        <p class="small muted lead-note">Je dunkler die Zelle, desto grösser der Anteil. Die gleichen Zahlen enthält der CSV-Export.</p>
        ${heatTable(agg)}
      </section>

      ${custom ? `<section class="an-sec" id="sec-custom" aria-labelledby="h-custom">
        ${band('custom', esc(custom.block.title || 'Eigene Fragen der Schule'))}
        ${Block.section(custom, data.n, { bare: true })}
      </section>` : ''}

      ${o.footNote ? `<p class="small muted">${o.footNote}</p>` : ''}
      <div class="export-bar no-print">
        <div class="stack" style="gap:4px"><b>Ergebnisse weitergeben</b><span class="small muted">${esc(o.exportText || 'Für Schulkonferenz, Schulpflege oder die eigene Ablage.')}</span></div>
        <div class="row">
          <button class="btn" type="button" id="btn-report">Bericht auf einer Seite (PDF)</button>
          <button class="btn secondary" type="button" id="btn-csv">Zahlen als CSV</button>
        </div>
      </div>`;

    function drawMain() {
      const isRadar = view.chart === 'radar';
      $('#chart-controls').innerHTML = seg('chart', 'Darstellung', CHARTS, view.chart) +
        (isRadar ? '' : seg('level', 'Ebene', [['areas', 'Bereiche'], ['subs', 'Teilbereiche']], view.level)) + saveBtn('main');
      let svg;
      if (isRadar) {
        const series = [{ values: agg.areas.map((a) => a.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
        if (cagg) series.push({ values: cagg.areas.map((a) => a.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
        const rows = ITEMS.areas.map((a, i) => {
          const v = agg.areas[i].mean, w = cagg ? cagg.areas[i].mean : null;
          const d = v !== null && w !== null ? v - w : null;
          return `<tr><th scope="row"><b>${a.id}</b> ${esc(a.title)}</th><td><b>${fmt(v)}</b></td>${cagg ? `<td>${fmt(w)}</td><td class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d === null ? '–' : (d > 0 ? '+' : '') + fmt(d)}</td>` : ''}<td class="muted">${v === null ? '' : esc(LV[lvOf(v) - 1].label)}</td></tr>`;
        }).join('');
        svg = `<div class="radar-side"><div class="radar-wrap">${radarSVG(series, { valueLabels: true, label: 'Netzdiagramm: Mittelwerte pro Bereich' })}</div>
          <table class="kv-table"><caption class="sr-only">Mittelwerte pro Bereich</caption><thead><tr><th scope="col">Bereich</th><th scope="col">${esc(o.title)}</th>${cagg ? `<th scope="col">${esc(cTitle)}</th><th scope="col">Δ</th>` : ''}<th scope="col">Stufe</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } else if (view.chart === 'bars') svg = Charts.bars(agg, view.level, cagg, { cur: o.title, cmp: cTitle });
      else if (view.chart === 'dist') svg = Charts.dist(agg, view.level);
      else svg = Charts.boxplot(agg, view.level);
      const cmpLegend = cagg && (isRadar || view.chart === 'bars') ? `<span><i style="background:#E2001A"></i>${esc(o.title)}</span><span><i style="background:#6E6E6E"></i>${esc(cTitle)}</span>` : '';
      const lvLegend = view.chart === 'dist' ? LV.map((l, i) => `<span><i style="background:${Charts.LVCOL[i + 1]}"></i>${l.roman} ${esc(l.label)}</span>`).join('') : '';
      $('#chart-main').className = 'chart' + (isRadar ? ' chart--radar' : '');
      $('#chart-main').innerHTML = svg + `<figcaption class="legend">${cmpLegend}${lvLegend}<span>${chartExplain(view.chart, view.level, !!cagg)}</span></figcaption>`;
      $$('#chart-controls [data-chart]').forEach((b) => b.addEventListener('click', () => { view.chart = b.dataset.chart; drawMain(); $('#chart-controls [aria-pressed=true]').focus(); }));
      $$('#chart-controls [data-level]').forEach((b) => b.addEventListener('click', () => { view.level = b.dataset.level; drawMain(); $(`#chart-controls [data-level=${view.level}]`).focus(); }));
      $('#chart-controls [data-png]').addEventListener('click', () => Charts.png($('#chart-main svg'), `${safe(o.title)}_${CHARTS.find((x) => x[0] === view.chart)[1]}_${today()}`));
    }
    drawMain();

    $('#needs-order').addEventListener('change', (e) => { view.order = e.target.value; $('#chart-needs').innerHTML = Charts.needs(agg, view.order); });
    const pngNames = { change: 'Veraenderung', needs: 'Wer_braucht_was', noopp: 'Voraussetzungen' };
    $$('.an-sec [data-png]', out).filter((b) => b.dataset.png !== 'main').forEach((b) => b.addEventListener('click', () =>
      Charts.png($(`[data-chart="${b.dataset.png}"] svg`, out), `${safe(o.title)}_${pngNames[b.dataset.png] || safe(b.dataset.png)}_${today()}`)));
    $$('.an-nav a', out).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    if (secObserver) secObserver.disconnect();
    if ('IntersectionObserver' in window) {
      secObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) $$('.an-nav a', out).forEach((a) => a.classList.toggle('active', a.dataset.sec === en.target.id.slice(4))); });
      }, { rootMargin: '-80px 0px -65% 0px' });
      $$('.an-sec', out).forEach((sec) => secObserver.observe(sec));
    }
    $('#btn-csv', out).addEventListener('click', () => download(`Auswertung_${safe(o.title)}_${today()}.csv`, '﻿' + DKCore.toCSV(ITEMS, agg) + (custom ? Block.csv(custom) : ''), 'text/csv;charset=utf-8'));
    $('#btn-report', out).addEventListener('click', () => printReport(data, agg, cagg, cTitle, sorted, pd, o));
    $('[data-report]', out).addEventListener('click', () => $('#btn-report', out).click());
  }

  /* Bericht auf einer Seite (Schulkonferenz, Schulpflege, AVS) */
  function printReport(data, agg, cagg, cTitle, sorted, pd, o) {
    const r = $('#report');
    const series = [{ values: agg.areas.map((a) => a.mean), fill: 'rgba(226,0,26,0.14)', stroke: '#E2001A' }];
    if (cagg) series.push({ values: cagg.areas.map((a) => a.mean), fill: 'none', stroke: '#6E6E6E', dash: true });
    const li = (s) => `<li><b>${s.id}</b> ${esc(s.title)} <span class="muted">(Ø ${fmt(agg.bySub[s.id].mean)})</span></li>`;
    const split = SUBS.filter((s) => DKCore.needGroups(agg.bySub[s.id]).spread === 'gespalten');
    r.innerHTML = `
      <div class="rp-head"><div><div class="eyebrow">${esc(o.org || '')}</div><h2>${esc(o.reportTitle || 'Digitale Kompetenzen des Kollegiums')}</h2>
        <p>«${esc(o.title)}»${o.filterText ? ' · ' + esc(o.filterText) : ''} · ${data.n} abgeschlossene Teilnahme${data.n === 1 ? '' : 'n'} · Stand ${new Date().toLocaleDateString('de-CH')}</p></div></div>
      ${cagg ? `<p class="small">Veränderung gegenüber «${esc(cTitle)}» unter den Werten.</p>` : ''}
      <div class="stat-row rp-stats">${ITEMS.areas.map((a, i) => `<div class="stat"><span class="small">${a.id} ${esc(a.short)}</span><b>${fmt(agg.areas[i].mean)}</b>${cagg && agg.areas[i].mean !== null && cagg.areas[i].mean !== null ? `<span class="small">${agg.areas[i].mean - cagg.areas[i].mean >= 0 ? '+' : ''}${fmt(agg.areas[i].mean - cagg.areas[i].mean)}</span>` : ''}</div>`).join('')}</div>
      <div class="rp-grid">
        <div>${radarSVG(series, { valueLabels: true, label: 'Netzdiagramm' })}
          <p class="small">Mittelwert pro Bereich, Stufe I = 1 bis VI = 6.${cagg ? ` Rot: ${esc(o.title)}, grau gestrichelt: ${esc(cTitle)}.` : ''}</p></div>
        <div class="rp-lists">
          <h3>Handlungsfelder</h3><ul>${sorted.slice(0, 4).map(li).join('')}</ul>
          <h3>Stärken</h3><ul>${sorted.slice(-3).reverse().map(li).join('')}</ul>
          ${pd.themes.length ? `<h3>Themen für die Weiterbildung</h3><ul>${pd.themes.map((t) => `<li>${esc(t.theme)} <span class="muted">(${t.subs.join(', ')})</span></li>`).join('')}</ul>` : ''}
          ${pd.multipliers.length ? `<p class="small"><b>Interne Weitergabe möglich:</b> ${pd.multipliers.slice(0, 6).map((s) => s.id).join(', ')}${pd.multipliers.length > 6 ? ' …' : ''}</p>` : ''}
          ${split.length ? `<p class="small"><b>Gespalten:</b> ${split.map((s) => s.id).join(', ')}</p>` : ''}
          ${pd.noOpp.length ? `<p class="small"><b>Voraussetzungen klären:</b> ${pd.noOpp.map((s) => s.id).join(', ')}</p>` : ''}
        </div>
      </div>
      <h3>Verteilung der Stufen pro Bereich</h3>
      ${Charts.dist(agg, 'areas')}
      <div class="legend">${LV.map((l, i) => `<span><i style="background:${Charts.LVCOL[i + 1]}"></i>${l.roman} ${esc(l.label)}</span>`).join('')}</div>
      <p class="small rp-foot">${esc(o.reportFoot || 'Zusammengefasste Selbsteinschätzungen der Lehrpersonen nach DigCompEdu. Einzelne Profile sind nicht einsehbar.')} Kanton Schwyz, Amt für Volksschulen und Sport.</p>`;
    document.body.classList.add('print-report');
    const done = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  return { render };
})();

// Diagramme der Schulauswertung (SVG, ohne Bibliothek). Alle Funktionen liefern SVG-Text.
// Skala der Kompetenzstufen: I = 1 bis VI = 6. «Keine Gelegenheit» wird separat ausgewiesen.
(function () {
  'use strict';
  const { ITEMS, LV, esc, fmt } = UI;
  const W = 760, LABEL_W = 300, X0 = 312, X1 = 700;
  const FONT = 'font-family="Helvetica, Arial, sans-serif"';
  const COL = { cur: '#E2001A', cmp: '#6E6E6E', grid: '#D2D2D2', band: '#F4F4F4', head: '#EBEBEB', ink: '#000', ink2: '#464646' };
  const LVCOL = ['#B4B4B4', '#FAD7C8', '#F5AF96', '#EB694B', '#E2001A', '#AF1400', '#780A00'];
  const NEEDCOL = ['#F5AF96', '#E2001A', '#780A00'];
  const pct = (x) => Math.round(x * 100) + ' %';

  function wrap(text, max = 34) {
    const lines = [];
    String(text).split(' ').forEach((w) => {
      if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= max) lines[lines.length - 1] += ' ' + w;
      else lines.push(w);
    });
    if (lines.length > 2) lines.splice(1, lines.length, lines.slice(1).join(' ').slice(0, max - 1) + '…');
    return lines;
  }

  /* Zeilen: Bereiche oder Teilbereiche (mit Zwischentitel pro Bereich) */
  function rowsFor(level) {
    const rows = [];
    if (level === 'areas') ITEMS.areas.forEach((a, i) => rows.push({ type: 'item', kind: 'area', idx: i, id: a.id, label: a.title }));
    else ITEMS.areas.forEach((a) => {
      rows.push({ type: 'head', id: a.id, label: a.id + ' ' + a.title });
      a.subareas.forEach((s) => rows.push({ type: 'item', kind: 'sub', id: s.id, label: s.title }));
    });
    return rows;
  }

  function layout(rows, top) {
    let y = top;
    rows.forEach((r) => {
      r.lines = r.type === 'head' ? [r.label] : wrap(r.label);
      r.h = r.type === 'head' ? 26 : r.lines.length > 1 ? 40 : 30;
      r.y = y; r.cy = y + r.h / 2;
      y += r.h;
    });
    return y;
  }

  function rowBackground(rows) {
    let g = '', k = 0;
    rows.forEach((r) => {
      if (r.type === 'head') { g += `<rect x="0" y="${r.y}" width="${W}" height="${r.h}" fill="${COL.head}"/><text x="8" y="${r.cy + 4.5}" font-size="13" font-weight="700">${esc(r.label)}</text>`; k = 0; return; }
      if (k++ % 2 === 0) g += `<rect x="0" y="${r.y}" width="${W}" height="${r.h}" fill="${COL.band}"/>`;
      const idTxt = `<tspan font-weight="700">${esc(r.id)}</tspan> `;
      g += `<text x="8" y="${r.cy + 4.5 - (r.lines.length - 1) * 7.5}" font-size="13" fill="${COL.ink}">` +
        r.lines.map((l, i) => `<tspan x="${i ? 8 + (r.id.length + 1) * 7.4 : 8}" dy="${i ? 15 : 0}">${i ? '' : idTxt}${esc(l)}</tspan>`).join('') + '</text>';
    });
    return g;
  }

  function levelAxis(xf, top, bottom, from = 1) {
    let g = '';
    for (let v = from; v <= 6; v++) {
      const x = xf(v).toFixed(1);
      g += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${COL.grid}" stroke-width="1"/>`;
      if (v >= 1) g += `<text x="${x}" y="${top - 8}" font-size="12" text-anchor="middle" fill="${COL.ink2}"><tspan font-weight="700">${LV[v - 1].roman}</tspan></text>`;
    }
    return g;
  }
  const svg = (h, body, label) => `<svg viewBox="0 0 ${W} ${Math.ceil(h)}" role="img" aria-label="${esc(label)}" ${FONT} font-size="13">${body}</svg>`;

  /* Werte einer Zeile aus der Aggregation holen */
  const rowMean = (agg, r) => (r.kind === 'area' ? agg.areas[r.idx].mean : agg.bySub[r.id].mean);
  const rowBox = (agg, r) => (r.kind === 'area' ? agg.areas[r.idx].box : agg.bySub[r.id].box);

  /* A1: Balken – Mittelwerte, optional mit Vergleich */
  function bars(agg, level, cagg, names = {}) {
    const rows = rowsFor(level);
    const top = 34, bottom = layout(rows, top);
    const xf = (v) => X0 + (v / 6) * (X1 - X0);
    let g = rowBackground(rows) + levelAxis(xf, top, bottom, 1);
    g += `<line x1="${X0}" y1="${top}" x2="${X0}" y2="${bottom}" stroke="${COL.ink2}" stroke-width="1"/>`;
    rows.filter((r) => r.type === 'item').forEach((r) => {
      const v = rowMean(agg, r), c = cagg ? rowMean(cagg, r) : null;
      const bh = cagg ? 9 : 14, y1 = cagg ? r.cy - bh - 1 : r.cy - bh / 2;
      if (v !== null) g += `<rect x="${X0}" y="${y1.toFixed(1)}" width="${(xf(v) - X0).toFixed(1)}" height="${bh}" fill="${COL.cur}"><title>${esc(names.cur || 'Aktuell')}: ${fmt(v)}</title></rect>
        <text x="${(xf(v) + 6).toFixed(1)}" y="${(y1 + bh / 2 + 4.5).toFixed(1)}" font-size="12" font-weight="700">${fmt(v)}</text>`;
      if (cagg && c !== null) g += `<rect x="${X0}" y="${(r.cy + 1).toFixed(1)}" width="${(xf(c) - X0).toFixed(1)}" height="${bh}" fill="${COL.cmp}"><title>${esc(names.cmp || 'Vergleich')}: ${fmt(c)}</title></rect>
        <text x="${(xf(c) + 6).toFixed(1)}" y="${(r.cy + 1 + bh / 2 + 4.5).toFixed(1)}" font-size="12" fill="${COL.ink2}">${fmt(c)}</text>`;
      if (v === null && c === null) g += `<text x="${X0 + 6}" y="${r.cy + 4.5}" font-size="12" fill="${COL.ink2}">keine Einschätzung</text>`;
    });
    return svg(bottom + 4, g, 'Balkendiagramm: Mittelwerte pro ' + (level === 'areas' ? 'Bereich' : 'Teilbereich'));
  }

  /* A2: Verteilung – 100-%-Balken der Stufen I–VI (ohne «keine Gelegenheit») */
  function dist(agg, level) {
    const rows = rowsFor(level);
    const top = 34, bottom = layout(rows, top);
    const x1 = X1 - 8, xf = (s) => X0 + s * (x1 - X0);
    let g = rowBackground(rows);
    [0, 0.25, 0.5, 0.75, 1].forEach((s) => { g += `<text x="${xf(s).toFixed(1)}" y="${top - 8}" font-size="12" text-anchor="middle" fill="${COL.ink2}">${pct(s)}</text><line x1="${xf(s).toFixed(1)}" y1="${top - 3}" x2="${xf(s).toFixed(1)}" y2="${top}" stroke="${COL.ink2}"/>`; });
    rows.filter((r) => r.type === 'item').forEach((r) => {
      const subs = r.kind === 'area' ? ITEMS.areas[r.idx].subareas.map((s) => agg.bySub[s.id]) : [agg.bySub[r.id]];
      const counts = [0, 1, 2, 3, 4, 5, 6].map((k) => subs.reduce((a, d) => a + d.counts[k], 0));
      const rated = counts.slice(1).reduce((a, b) => a + b, 0);
      let x = X0;
      for (let k = 1; k <= 6; k++) {
        if (!counts[k]) continue;
        const w = (counts[k] / rated) * (x1 - X0);
        g += `<rect x="${x.toFixed(1)}" y="${r.cy - 8}" width="${w.toFixed(1)}" height="16" fill="${LVCOL[k]}" stroke="#fff" stroke-width="1"><title>Stufe ${LV[k - 1].roman}: ${counts[k]} (${pct(counts[k] / rated)})</title></rect>`;
        if (w > 26) g += `<text x="${(x + w / 2).toFixed(1)}" y="${r.cy + 4}" font-size="11" text-anchor="middle" fill="${k >= 4 ? '#fff' : '#000'}">${pct(counts[k] / rated).replace(' ', '')}</text>`;
        x += w;
      }
      if (!rated) g += `<text x="${X0 + 6}" y="${r.cy + 4.5}" font-size="12" fill="${COL.ink2}">keine Einschätzung</text>`;
      if (counts[0]) g += `<text x="${W - 4}" y="${r.cy + 4.5}" font-size="11" text-anchor="end" fill="${COL.ink2}">+${counts[0]}&#160;k.&#160;G.</text>`;
    });
    const note = level === 'areas' ? 'Alle Einschätzungen der Teilbereiche zusammengezählt.' : '';
    return svg(bottom + 4, g, 'Verteilung der Stufen pro ' + (level === 'areas' ? 'Bereich' : 'Teilbereich') + '. ' + note);
  }

  /* A2b: Verteilung nach Lehrpersonen – 100-%-Balken der drei Gruppen.
   * Pro Bereich zählt der persönliche Bereichsmittelwert, pro Teilbereich die einzelne Antwort.
   * Grober als die Stufensicht, dafür ist jede Person genau einmal vertreten. */
  function distPersons(agg, level) {
    const rows = rowsFor(level);
    const top = 34, bottom = layout(rows, top);
    const x1 = X1 - 8, xf = (s) => X0 + s * (x1 - X0);
    const names = ['Einstieg (I–II)', 'Vertiefung (III–IV)', 'Weitergeben (V–VI)'];
    let g = rowBackground(rows);
    [0, 0.25, 0.5, 0.75, 1].forEach((s) => { g += `<text x="${xf(s).toFixed(1)}" y="${top - 8}" font-size="12" text-anchor="middle" fill="${COL.ink2}">${pct(s)}</text><line x1="${xf(s).toFixed(1)}" y1="${top - 3}" x2="${xf(s).toFixed(1)}" y2="${top}" stroke="${COL.ink2}"/>`; });
    rows.filter((r) => r.type === 'item').forEach((r) => {
      const counts = r.kind === 'area' ? agg.areas[r.idx].persons.groups : DKCore.needGroups(agg.bySub[r.id]).counts;
      const noOpp = r.kind === 'area' ? 0 : agg.bySub[r.id].counts[0];
      const total = counts.reduce((a, b) => a + b, 0);
      let x = X0;
      counts.forEach((c, k) => {
        if (!c) return;
        const w = (c / total) * (x1 - X0);
        g += `<rect x="${x.toFixed(1)}" y="${r.cy - 8}" width="${w.toFixed(1)}" height="16" fill="${NEEDCOL[k]}" stroke="#fff" stroke-width="1"><title>${names[k]}: ${c} ${c === 1 ? 'Lehrperson' : 'Lehrpersonen'} (${pct(c / total)})</title></rect>`;
        if (w > 30) g += `<text x="${(x + w / 2).toFixed(1)}" y="${r.cy + 4}" font-size="11" text-anchor="middle" fill="${k ? '#fff' : '#000'}">${c} · ${pct(c / total).replace(' ', '')}</text>`;
        else if (w > 14) g += `<text x="${(x + w / 2).toFixed(1)}" y="${r.cy + 4}" font-size="11" text-anchor="middle" fill="${k ? '#fff' : '#000'}">${c}</text>`;
        x += w;
      });
      if (!total) g += `<text x="${X0 + 6}" y="${r.cy + 4.5}" font-size="12" fill="${COL.ink2}">keine Einschätzung</text>`;
      if (noOpp) g += `<text x="${W - 4}" y="${r.cy + 4.5}" font-size="11" text-anchor="end" fill="${COL.ink2}">+${noOpp}&#160;k.&#160;G.</text>`;
    });
    return svg(bottom + 4, g, 'Verteilung der Lehrpersonen auf die drei Gruppen pro ' + (level === 'areas' ? 'Bereich' : 'Teilbereich'));
  }

  /* A4: Boxplot wie im Beurteilungstool – Box = mittlere 50 %, Antennen = 10.–90. Perzentil */
  function boxplot(agg, level) {
    const rows = rowsFor(level);
    const top = 34, bottom = layout(rows, top);
    const xf = (v) => X0 + ((v - 1) / 5) * (X1 - X0);
    let g = rowBackground(rows) + levelAxis(xf, top, bottom, 1);
    rows.filter((r) => r.type === 'item').forEach((r) => {
      const b = rowBox(agg, r);
      if (!b) { g += `<text x="${X0 + 6}" y="${r.cy + 4.5}" font-size="12" fill="${COL.ink2}">keine Einschätzung</text>`; return; }
      const [p10, q1, md, q3, p90, m] = [b.p10, b.q1, b.median, b.q3, b.p90, b.mean].map(xf);
      const y = r.cy, h = 16;
      const tip = `Median ${fmt(b.median)} · Mittelwert ${fmt(b.mean)} · mittlere 50 %: ${fmt(b.q1)}–${fmt(b.q3)} · 10–90 %: ${fmt(b.p10)}–${fmt(b.p90)} · ${b.n} Einschätzungen`;
      g += `<g><title>${esc(tip)}</title>
        <line x1="${p10.toFixed(1)}" y1="${y}" x2="${q1.toFixed(1)}" y2="${y}" stroke="#000" stroke-width="1.2"/>
        <line x1="${q3.toFixed(1)}" y1="${y}" x2="${p90.toFixed(1)}" y2="${y}" stroke="#000" stroke-width="1.2"/>
        <line x1="${p10.toFixed(1)}" y1="${y - 6}" x2="${p10.toFixed(1)}" y2="${y + 6}" stroke="#000" stroke-width="1.2"/>
        <line x1="${p90.toFixed(1)}" y1="${y - 6}" x2="${p90.toFixed(1)}" y2="${y + 6}" stroke="#000" stroke-width="1.2"/>
        <rect x="${q1.toFixed(1)}" y="${y - h / 2}" width="${Math.max(2, q3 - q1).toFixed(1)}" height="${h}" fill="#FAD7C8" stroke="#000" stroke-width="1.2"/>
        <line x1="${md.toFixed(1)}" y1="${y - h / 2}" x2="${md.toFixed(1)}" y2="${y + h / 2}" stroke="#000" stroke-width="2.5"/>
        <line x1="${m.toFixed(1)}" y1="${y - h / 2 - 3}" x2="${m.toFixed(1)}" y2="${y + h / 2 + 3}" stroke="${COL.cur}" stroke-width="2" stroke-dasharray="2 2"/></g>`;
    });
    return svg(bottom + 4, g, 'Boxplot pro ' + (level === 'areas' ? 'Bereich' : 'Teilbereich'));
  }

  /* A3: Vergleich zweier Erhebungen – Hantel pro Teilbereich, nach Veränderung sortiert */
  function dumbbell(agg, cagg) {
    const items = DKCore.allSubareas(ITEMS).map((s) => ({ id: s.id, label: s.title, a: agg.bySub[s.id].mean, b: cagg.bySub[s.id].mean }))
      .filter((r) => r.a !== null && r.b !== null).map((r) => ({ ...r, d: r.a - r.b })).sort((x, y) => y.d - x.d);
    const rows = items.map((r) => ({ type: 'item', ...r }));
    const top = 34, bottom = layout(rows, top);
    const xe = X1 - 40, xf = (v) => X0 + ((v - 1) / 5) * (xe - X0);
    let g = rowBackground(rows) + levelAxis(xf, top, bottom, 1);
    g += `<text x="${W - 6}" y="${top - 8}" font-size="12" text-anchor="end" fill="${COL.ink2}">Δ</text>`;
    rows.forEach((r) => {
      const xa = xf(r.a), xb = xf(r.b);
      const col = r.d > 0.05 ? '#1f6b33' : r.d < -0.05 ? '#AF1400' : COL.ink2;
      g += `<g><title>${esc(r.id + ' ' + r.label)}: vorher ${fmt(r.b)}, jetzt ${fmt(r.a)}</title>
        <line x1="${xb.toFixed(1)}" y1="${r.cy}" x2="${xa.toFixed(1)}" y2="${r.cy}" stroke="#B4B4B4" stroke-width="3"/>
        <circle cx="${xb.toFixed(1)}" cy="${r.cy}" r="5" fill="#fff" stroke="${COL.cmp}" stroke-width="2"/>
        <circle cx="${xa.toFixed(1)}" cy="${r.cy}" r="5.5" fill="${COL.cur}"/></g>
        <text x="${W - 6}" y="${r.cy + 4.5}" font-size="12" text-anchor="end" font-weight="700" fill="${col}">${r.d > 0 ? '+' : r.d < 0 ? '−' : '±'}${fmt(Math.abs(r.d))}</text>`;
    });
    return svg(bottom + 4, g, 'Veränderung pro Teilbereich zwischen zwei Erhebungen');
  }

  /* B1/B2: Wer braucht was? – Einstieg / Vertiefung / Weitergeben, mit Streuung */
  function needs(agg, order) {
    let subs = DKCore.allSubareas(ITEMS).map((s) => ({ s, g: DKCore.needGroups(agg.bySub[s.id]) }));
    if (order === 'entry') subs.sort((a, b) => b.g.share[0] - a.g.share[0]);
    if (order === 'spread') { const rk = { gespalten: 0, gemischt: 1, einig: 2 }; subs.sort((a, b) => (rk[a.g.spread] ?? 3) - (rk[b.g.spread] ?? 3) || (agg.bySub[b.s.id].sd || 0) - (agg.bySub[a.s.id].sd || 0)); }
    const rows = subs.map(({ s, g }) => ({ type: 'item', id: s.id, label: s.title, g }));
    const top = 34, bottom = layout(rows, top);
    const xe = X1 - 36, xf = (s) => X0 + s * (xe - X0);
    let g = rowBackground(rows);
    [0, 0.5, 1].forEach((s) => { g += `<text x="${xf(s).toFixed(1)}" y="${top - 8}" font-size="12" text-anchor="middle" fill="${COL.ink2}">${pct(s)}</text>`; });
    rows.forEach((r) => {
      let x = X0;
      const names = ['Einstieg (I–II)', 'Vertiefung (III–IV)', 'Weitergeben (V–VI)'];
      r.g.counts.forEach((c, k) => {
        if (!c) return;
        const w = r.g.share[k] * (xe - X0);
        g += `<rect x="${x.toFixed(1)}" y="${r.cy - 8}" width="${w.toFixed(1)}" height="16" fill="${NEEDCOL[k]}" stroke="#fff"><title>${names[k]}: ${c} (${pct(r.g.share[k])})</title></rect>`;
        if (w > 22) g += `<text x="${(x + w / 2).toFixed(1)}" y="${r.cy + 4}" font-size="11" text-anchor="middle" fill="${k ? '#fff' : '#000'}">${c}</text>`;
        x += w;
      });
      if (!r.g.rated) g += `<text x="${X0 + 6}" y="${r.cy + 4.5}" font-size="12" fill="${COL.ink2}">keine Einschätzung</text>`;
      if (r.g.spread) {
        const sym = r.g.spread === 'gespalten' ? '◆' : r.g.spread === 'einig' ? '●' : '';
        g += `<text x="${W - 4}" y="${r.cy + 4.5}" font-size="11" text-anchor="end" fill="${r.g.spread === 'gespalten' ? '#AF1400' : COL.ink2}" ${r.g.spread === 'gespalten' ? 'font-weight="700"' : ''}>${sym ? sym + ' ' : ''}${r.g.spread}</text>`;
      }
    });
    return svg(bottom + 4, g, 'Wer braucht was: Anteile Einstieg, Vertiefung und Weitergeben pro Teilbereich');
  }

  /* B3: Voraussetzungen – Anteil «keine Gelegenheit» */
  function noOpp(agg) {
    const items = DKCore.allSubareas(ITEMS).map((s) => ({ id: s.id, label: s.title, d: agg.bySub[s.id] }))
      .filter((r) => r.d.counts[0] > 0).map((r) => ({ type: 'item', ...r, share: r.d.counts[0] / r.d.answered })).sort((a, b) => b.share - a.share);
    if (!items.length) return '';
    const top = 34, bottom = layout(items, top);
    const xe = X1 - 30, xf = (s) => X0 + s * (xe - X0);
    let g = rowBackground(items);
    [0, 0.25, 0.5, 0.75, 1].forEach((s) => { g += `<text x="${xf(s).toFixed(1)}" y="${top - 8}" font-size="12" text-anchor="middle" fill="${COL.ink2}">${pct(s)}</text><line x1="${xf(s).toFixed(1)}" y1="${top}" x2="${xf(s).toFixed(1)}" y2="${bottom}" stroke="${COL.grid}"/>`; });
    items.forEach((r) => {
      g += `<rect x="${X0}" y="${r.cy - 7}" width="${Math.max(2, xf(r.share) - X0).toFixed(1)}" height="14" fill="${r.share >= 0.25 ? '#6E6E6E' : '#B4B4B4'}"><title>${r.d.counts[0]} von ${r.d.answered}</title></rect>
        <text x="${(xf(r.share) + 6).toFixed(1)}" y="${r.cy + 4.5}" font-size="12">${pct(r.share)} <tspan fill="${COL.ink2}">(${r.d.counts[0]})</tspan></text>`;
    });
    g += `<line x1="${xf(0.25).toFixed(1)}" y1="${top}" x2="${xf(0.25).toFixed(1)}" y2="${bottom}" stroke="#000" stroke-dasharray="4 3"/>`;
    return svg(bottom + 4, g, 'Anteil «keine Gelegenheit» pro Teilbereich');
  }

  /* B4: Gruppen nebeneinander (Zyklen, Schulen …) – Mittelwert pro Bereich und Gruppe */
  const STUFE_COL = ['#E2001A', '#000000', '#8C8C8C', '#EB694B', '#780A00'];
  const shape = (k, x, y, col, s = 5.5) => {
    x = +(+x).toFixed(1); y = +(+y).toFixed(1);
    if (k % 3 === 0) return `<circle cx="${x}" cy="${y}" r="${s}" fill="${col}"/>`;
    if (k % 3 === 1) return `<rect x="${x - s}" y="${y - s}" width="${2 * s}" height="${2 * s}" fill="${col}"/>`;
    return `<path d="M${x} ${y - s - 1}L${x + s + 1} ${y + s}H${x - s - 1}Z" fill="${col}"/>`;
  };
  function stufen(byStufe) {
    const rows = rowsFor('areas');
    const top = 34, bottom = layout(rows, top);
    const xf = (v) => X0 + ((v - 1) / 5) * (X1 - X0);
    let g = rowBackground(rows) + levelAxis(xf, top, bottom, 1);
    rows.forEach((r) => {
      byStufe.forEach((st, k) => {
        const v = st.areas[r.idx];
        if (v === null) return;
        g += `<g><title>${esc(st.label || st.stufe)}: ${fmt(v)}</title>${shape(k, xf(v).toFixed(1), r.cy, STUFE_COL[k % STUFE_COL.length])}</g>`;
      });
    });
    return svg(bottom + 4, g, 'Mittelwerte pro Bereich nach Gruppe');
  }
  function stufenLegend(byStufe) {
    return byStufe.map((st, k) => `<span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${shape(k, 7, 7, STUFE_COL[k % STUFE_COL.length], 5)}</svg> ${esc(st.label || st.stufe)} (${st.n})</span>`).join('');
  }

  /* Diagramm als PNG speichern */
  function png(svgEl, fname) {
    const vb = svgEl.viewBox.baseVal, scale = 2;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb.width); clone.setAttribute('height', vb.height);
    if (!clone.getAttribute('font-family')) clone.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = vb.width * scale; cv.height = vb.height * scale;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }

  window.Charts = { bars, dist, distPersons, boxplot, dumbbell, needs, noOpp, stufen, stufenLegend, png, LVCOL, NEEDCOL };
})();

// Gemeinsame Bausteine für alle Seiten der Serverversion.
(function () {
  'use strict';
  const ITEMS = window.ITEMS;
  const LV = ITEMS.levels;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n === null || n === undefined ? '–' : n.toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const date = (d) => (d ? new Date(d).toLocaleDateString('de-CH') : '–');

  async function api(method, path, body) {
    const r = await fetch('/api/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok) {
      const err = new Error((data && data.error) || 'Verbindung zum Server fehlgeschlagen.');
      err.status = r.status;
      throw err;
    }
    return data;
  }

  function levelsStrip(el) {
    el.innerHTML = LV.map((l) => `<div class="lv${l.level}"><b>${l.roman}</b>${esc(l.label)}</div>`).join('');
  }

  function radarSVG(series, opts = {}) {
    const W = 560, H = 470, cx = W / 2, cy = 232, R = 158, n = ITEMS.areas.length;
    const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 6), cy + Math.sin(ang(i)) * R * (v / 6)];
    let g = '';
    for (let lv = 1; lv <= 6; lv++) {
      const pts = ITEMS.areas.map((_, i) => pt(i, lv).map((x) => x.toFixed(1)).join(',')).join(' ');
      g += `<polygon points="${pts}" fill="none" stroke="${lv === 6 ? '#919191' : '#D2D2D2'}" stroke-width="1"/>`;
    }
    ITEMS.areas.forEach((a, i) => {
      const [x, y] = pt(i, 6);
      g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#D2D2D2" stroke-width="1"/>`;
    });
    for (let lv = 1; lv <= 6; lv++) {
      const [x, y] = pt(0, lv);
      g += `<text x="${(x + 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#6E6E6E">${LV[lv - 1].roman}</text>`;
    }
    ITEMS.areas.forEach((a, i) => {
      const [x, y] = pt(i, 6);
      const c = Math.cos(ang(i)), s = Math.sin(ang(i));
      const anchor = Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end';
      const lines = [];
      a.short.split(' ').forEach((w) => { if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 16) lines[lines.length - 1] += ' ' + w; else lines.push(w); });
      const val = opts.valueLabels ? series[0].values[i] : undefined;
      const stage = opts.valueLabels && val !== null && val !== undefined ? LV[Math.min(5, Math.max(0, Math.round(val) - 1))].label : '';
      const nl = lines.length + (opts.valueLabels ? 1 : 0) + (stage ? 1 : 0);
      const lx = x + c * 16;
      const ly = s < -0.3 ? y - 12 - 15 * (nl - 1) : s > 0.3 ? y + 22 : y + 4 - 7.5 * (nl - 1);
      g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="13" fill="#000">` +
        lines.map((l, k) => `<tspan x="${lx.toFixed(1)}" dy="${k === 0 ? 0 : 15}">${k === 0 ? '<tspan font-weight="700">' + a.id + '</tspan> ' : ''}${esc(l)}</tspan>`).join('') +
        (opts.valueLabels ? `<tspan x="${lx.toFixed(1)}" dy="15" fill="#464646">Ø ${fmt(val)}</tspan>` : '') +
        (stage ? `<tspan x="${lx.toFixed(1)}" dy="14" fill="#464646" font-size="12">${esc(stage)}</tspan>` : '') + `</text>`;
    });
    series.forEach((se) => {
      const pts = se.values.map((v, i) => pt(i, v || 0).map((x) => x.toFixed(1)).join(',')).join(' ');
      g += `<polygon points="${pts}" fill="${se.fill}" stroke="${se.stroke}" stroke-width="2.5" stroke-linejoin="round" ${se.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
      se.values.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const [x, y] = pt(i, v);
        g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${se.dash ? 3.5 : 4.5}" fill="${se.stroke}" stroke="#fff" stroke-width="1.5"/>`;
      });
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Netzdiagramm')}">${g}</svg>`;
  }

  function meter(v) {
    if (v === 0) return `<div class="meter none" aria-hidden="true">${'<span></span>'.repeat(6)}</div>`;
    return `<div class="meter" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map((k) => `<span style="${k <= v ? 'background:var(--l' + k + ')' : ''}"></span>`).join('')}</div>`;
  }
  function badge(v) {
    if (v === undefined || v === null) return `<span class="badge" style="background:#fff;border:1px solid var(--line)">offen</span>`;
    if (v >= 1) return `<span class="badge lv${v}"><span class="sr-only">Stufe </span>${LV[v - 1].roman}</span>`;
    if (v === 0) return `<span class="badge lv0" title="Keine Gelegenheit"><span aria-hidden="true">–</span><span class="sr-only">Keine Gelegenheit</span></span>`;
    return `<span class="badge lv${v}">${LV[v - 1].roman}</span>`;
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  // Zweistufige Bestätigung direkt auf der Seite
  function confirmButton(el, label, question, yesLabel, onYes, cls = 'btn danger') {
    el.innerHTML = `<button class="${cls}" type="button">${esc(label)}</button>`;
    el.firstChild.addEventListener('click', () => {
      el.innerHTML = `<span class="small"><b>${esc(question)}</b></span>
        <button class="btn danger" type="button" data-a="yes">${esc(yesLabel)}</button>
        <button class="btn quiet" type="button" data-a="no">Abbrechen</button>`;
      el.querySelector('[data-a=yes]').addEventListener('click', onYes);
      el.querySelector('[data-a=no]').addEventListener('click', () => confirmButton(el, label, question, yesLabel, onYes, cls));
    });
  }

  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = t; }, 1500); }
    catch { window.prompt('Zum Kopieren markieren:', text); }
  }

  // Heatmap und Kennzahlen der Schulauswertung (von Leitung verwendet)
  function heatCell(count, total) {
    if (!total) return `<td class="cell">–</td>`;
    const share = count / total;
    const bg = count === 0 ? 'transparent' : `rgba(226,0,26,${(0.08 + share * 0.82).toFixed(2)})`;
    const fg = share > 0.62 ? '#fff' : '#000';
    return `<td class="cell" style="background:${bg};color:${fg}" title="${count} von ${total}">${count || ''}</td>`;
  }
  function heatTable(agg) {
    return `<div class="table-scroll"><table class="heat">
      <thead><tr><th scope="col">Teilbereich</th>${LV.map((l) => `<th scope="col">${l.roman}<br><span style="font-weight:400">${esc(l.label)}</span></th>`).join('')}<th scope="col">Keine<br>Gelegenheit</th><th scope="col">Ø</th></tr></thead>
      <tbody>${ITEMS.areas.map((a) => `<tr class="area-row"><td colspan="9">${a.id} ${esc(a.title)}</td></tr>` + a.subareas.map((s) => {
        const d = agg.bySub[s.id];
        return `<tr><td>${s.id} ${esc(s.title)}</td>${[1, 2, 3, 4, 5, 6].map((k) => heatCell(d.counts[k], d.answered)).join('')}<td class="cell">${d.counts[0] || ''}</td><td><b>${fmt(d.mean)}</b></td></tr>`;
      }).join('')).join('')}</tbody></table></div>`;
  }

  window.UI = { ITEMS, LV, $, $$, esc, fmt, date, api, levelsStrip, radarSVG, meter, badge, download, today, confirmButton, copyText, heatTable };
})();

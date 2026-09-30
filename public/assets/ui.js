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
  // Zieldatum (JJJJ-MM-TT) als Tag ohne Zeitzonenverschiebung
  const dayOf = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const dueShort = (s) => { const d = dayOf(s); return d ? d.toLocaleDateString('de-CH') : ''; };
  const dueLong = (s) => { const d = dayOf(s); return d ? d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const duePast = (s) => { const d = dayOf(s); if (!d) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return d < t; };
  const dateTime = (d) => (d ? new Date(d).toLocaleDateString('de-CH') + ', ' + new Date(d).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '–');

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

  // Kurzfassung mit **Fettdruck** (aus der Excel) sicher als HTML
  const richText = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Einleitung pro Teilbereich: «Worum es geht: …» und «Beispiele: …» je auf eigener Zeile
  function introHTML(s) {
    if (!s.intro) return '';
    const parts = s.intro.split(/\s*(?=Beispiele:)/).filter(Boolean);
    return `<div class="q-intro">${parts.map((p) => {
      const m = p.match(/^(Worum es geht:|Beispiele:)\s*(.*)$/);
      return `<p>${m ? `<span class="q-intro-label">${esc(m[1])}</span> ${esc(m[2])}` : esc(p)}</p>`;
    }).join('')}</div>`;
  }
  // Stufenkennzeichnung rechts neben einer Aussage (Farben wie im Stufenmodell)
  const levelTag = (l) => `<span class="lvtag lv${l.level}"><b><span class="sr-only">Stufe </span>${l.roman}</b><span class="lvtag-name">${esc(l.label)}</span></span>`;

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
    const bg = count === 0 ? "transparent" : `rgba(226,0,26,${(0.08 + share * 0.72).toFixed(2)})`;
    const fg = "#000"; // Deckkraft höchstens 0.8: schwarze Schrift bleibt überall gut lesbar
    return `<td class="cell" style="background:${bg};color:${fg}" title="${count} von ${total}">${count || ''}</td>`;
  }
  function heatTable(agg) {
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="Tabelle Anzahl Lehrpersonen pro Stufe"><table class="heat">
      <thead><tr><th scope="col">Teilbereich</th>${LV.map((l) => `<th scope="col">${l.roman}<br><span style="font-weight:400">${esc(l.label)}</span></th>`).join('')}<th scope="col">Keine<br>Gelegenheit</th><th scope="col">Ø</th></tr></thead>
      <tbody>${ITEMS.areas.map((a) => `<tr class="area-row"><td colspan="9">${a.id} ${esc(a.title)}</td></tr>` + a.subareas.map((s) => {
        const d = agg.bySub[s.id];
        return `<tr><td>${s.id} ${esc(s.title)}</td>${[1, 2, 3, 4, 5, 6].map((k) => heatCell(d.counts[k], d.answered)).join('')}<td class="cell">${d.counts[0] || ''}</td><td><b>${fmt(d.mean)}</b></td></tr>`;
      }).join('')).join('')}</tbody></table></div>`;
  }

  // Einladungs- bzw. Passwort-Link anzeigen, mit E-Mail-Vorlage (keine Mails vom Server)
  const inviteLink = (token) => `${location.origin}/einladung/${token}`;
  function inviteMail(o) {
    const link = inviteLink(o.token);
    const subject = o.reset ? 'Neues Passwort: Selbsteinschätzung digitale Kompetenzen' : 'Einladung: Selbsteinschätzung digitale Kompetenzen';
    const body = o.reset
      ? `Guten Tag${o.name ? ' ' + o.name : ''}\n\nÜber den folgenden Link legen Sie für den Zugang «${o.username}» ein neues Passwort fest:\n\n${link}\n\nDer Link gilt 24 Stunden (bis ${dateTime(o.expires_at)}) und nur einmal.\n\nFreundliche Grüsse\n${o.from || ''}`
      : `Guten Tag${o.name ? ' ' + o.name : ''}\n\nSie erhalten einen Zugang zur Selbsteinschätzung «Digitale Kompetenzen von Lehrpersonen» des Kantons Schwyz, als ${o.roleText}. Über den folgenden Link legen Sie Benutzername und Passwort selbst fest:\n\n${link}\n\nDer Link gilt bis ${date(o.expires_at)} und nur einmal. Danach melden Sie sich unter ${location.origin}/leitung an.\n\nFreundliche Grüsse\n${o.from || ''}`;
    return { link, subject, body };
  }
  function invitePanel(el, o) {
    const m = inviteMail(o);
    el.hidden = false;
    el.innerHTML = `<div class="stack" style="gap:10px">
      <p><b>${o.reset ? 'Link für ein neues Passwort' : 'Einladungslink'}${o.email ? ' für ' + esc(o.email) : o.username ? ' für ' + esc(o.username) : ''}</b></p>
      <p class="small"><code style="word-break:break-all">${esc(m.link)}</code></p>
      <div class="row"><button class="btn secondary small" type="button" data-inv-copy>Link kopieren</button>
        <a class="btn secondary small" href="mailto:${encodeURIComponent(o.email || '')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}">E-Mail öffnen</a>
        <button class="btn quiet small" type="button" data-inv-close>Ausblenden</button></div>
      <p class="small muted">Gilt bis ${o.reset ? dateTime(o.expires_at) : date(o.expires_at)} und nur einmal. Der Link wird nur jetzt angezeigt; bei Bedarf später «Neuer Link» wählen.</p></div>`;
    el.querySelector('[data-inv-copy]').addEventListener('click', (e) => copyText(m.link, e.currentTarget));
    el.querySelector('[data-inv-close]').addEventListener('click', () => { el.hidden = true; });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Status einer Einladung bzw. eines Zugangs als Farb-Chip mit Text (Farbe nie allein).
   * Details erscheinen beim Überfahren (title) und beim Anklicken bzw. per Tastatur (aufklappbarer Text). */
  function statusChip(cls, label, tip) {
    return `<button type="button" class="chip-status ${cls}" title="${esc(tip)}" aria-expanded="false" data-chip>${esc(label)}</button><span class="chip-detail small" hidden>${esc(tip)}</span>`;
  }
  function inviteChip(i) {
    if (i.expired) return statusChip('chip-grey', 'Einladung abgelaufen', `Der Link ist am ${date(i.expires_at)} abgelaufen. Mit «Erneut senden» bzw. «Neuer Link» einen neuen Link erstellen.`);
    if (i.mail_status === 'sent') return statusChip('chip-orange', 'Einladung verschickt', `Per E-Mail verschickt am ${dateTime(i.mail_sent_at)} an ${i.email}. Noch nicht angenommen. Der Link gilt bis ${date(i.expires_at)}.`);
    if (i.mail_status === 'failed') return statusChip('chip-red', 'Versand fehlgeschlagen', `${i.mail_error || 'Die E-Mail konnte nicht verschickt werden.'} Erneut senden oder einen neuen Link erstellen und selbst weitergeben.`);
    return statusChip('chip-grey', 'Link erstellt', `Nicht per E-Mail verschickt${i.email ? '' : ' (keine E-Mail-Adresse angegeben)'}. Der Link muss selbst weitergegeben werden. Gültig bis ${date(i.expires_at)}.`);
  }
  function userChip(u) {
    return statusChip('chip-green', 'Zugang aktiv', `Zugang eingerichtet am ${date(u.created_at)}. Letzte Anmeldung: ${u.last_login ? dateTime(u.last_login) : 'noch keine'}.`);
  }
  function bindChips(root) {
    (root || document).querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => {
      const d = b.nextElementSibling; const open = d.hidden;
      d.hidden = !open; b.setAttribute('aria-expanded', String(open));
    }));
  }
  // Rückmeldung nach dem Erstellen oder Erneuern einer Einladung: verschickt, sonst Link zum Weitergeben
  function inviteResult(el, r, o) {
    const m = r.mail || {};
    el.classList.toggle('box--warning', m.status === 'failed');
    el.classList.toggle('box--success', m.status !== 'failed');
    if (m.status === 'sent') {
      el.hidden = false;
      el.innerHTML = `<div class="stack" style="gap:8px"><p><b>Einladung an ${esc(m.to)} verschickt.</b></p>
        <p class="small">Der Status zeigt «Einladung verschickt» (orange). Sobald der Zugang eingerichtet ist, wechselt er auf «Zugang aktiv» (grün).</p>
        <details class="small"><summary style="cursor:pointer">Link zusätzlich anzeigen</summary><p style="margin-top:6px"><code style="word-break:break-all">${esc(inviteLink(r.token))}</code></p>
          <button class="btn secondary small" type="button" data-inv-copy>Link kopieren</button></details>
        <div><button class="btn quiet small" type="button" data-inv-close>Ausblenden</button></div></div>`;
      el.querySelector('[data-inv-copy]').addEventListener('click', (e) => copyText(inviteLink(r.token), e.currentTarget));
      el.querySelector('[data-inv-close]').addEventListener('click', () => { el.hidden = true; });
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    invitePanel(el, { ...o, ...r });
    if (m.status === 'failed') el.insertAdjacentHTML('afterbegin', `<p class="small" style="margin-bottom:10px"><b>Die E-Mail an ${esc(m.to || o.email || '')} konnte nicht verschickt werden.</b> ${esc(m.error || '')} Bitte den Link selbst weitergeben oder später «Erneut senden».</p>`);
  }

  window.UI = { inviteChip, userChip, bindChips, inviteResult, ITEMS, LV, $, $$, esc, fmt, date, dueShort, dueLong, duePast, api, levelsStrip, richText, introHTML, levelTag, radarSVG, meter, badge, download, today, confirmButton, copyText, heatTable, inviteLink, inviteMail, invitePanel };
})();

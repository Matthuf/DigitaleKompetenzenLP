// Schulblock für die Schulleitung: Editor für eigene Fragen und Darstellung der Auswertung.
window.Block = (function () {
  'use strict';
  const { $, $$, esc, fmt, api, confirmButton } = UI;

  const SCALE = ['Trifft nicht zu', 'Trifft eher nicht zu', 'Trifft eher zu', 'Trifft voll zu'];
  const TYPE_LABEL = { scale: 'Zustimmungsskala', levels: 'Eigene Stufenaussagen', choice: 'Auswahl', text: 'Freitext' };
  const count = (c) => (c && c.custom_block && c.custom_block.questions ? c.custom_block.questions.length : 0);
  const RAMP = ['var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)', 'var(--l5)', 'var(--l6)'];
  const rampFor = (n) => (n === 4 ? [RAMP[0], RAMP[2], RAMP[3], RAMP[5]] : n === 3 ? [RAMP[0], RAMP[3], RAMP[5]] : n === 5 ? [RAMP[0], RAMP[1], RAMP[2], RAMP[3], RAMP[5]] : RAMP.slice(0, n));

  /* ---------- Auswertung ---------- */
  function distBar(counts, labels) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const cols = rampFor(counts.length);
    return `<div class="dist" role="img" aria-label="${esc(labels.map((l, i) => l + ': ' + counts[i]).join(', '))}">${counts.map((n, i) => n ? `<span style="width:${(100 * n / total).toFixed(2)}%;background:${cols[i]}" title="${esc(labels[i])}: ${n}"></span>` : '').join('')}</div>
      <div class="dist-legend">${labels.map((l, i) => `<span><i style="background:${cols[i]}"></i>${esc(l)}: <b>${counts[i]}</b></span>`).join('')}</div>`;
  }

  function section(custom, n, opts = {}) {
    const res = Object.fromEntries(custom.questions.map((r) => [r.id, r]));
    return `<div class="stack" style="gap:18px">
      ${opts.bare ? '<p class="small muted">Eigene Fragen der Schule. Nicht Teil des Kompetenzprofils.</p>' : `<div class="stack" style="gap:6px"><h3>${esc(custom.block.title)}</h3><p class="small muted">Eigene Fragen der Schule. Nicht Teil des Kompetenzprofils.</p></div>`}
      ${custom.block.questions.map((q, i) => {
        const r = res[q.id] || { answered: 0, counts: [], texts: [] };
        let body = '';
        const head = `<p><b>${i + 1}. ${esc(q.text)}</b> <span class="small muted">· ${TYPE_LABEL[q.type]}${q.type === 'choice' && q.multiple ? ', mehrfach' : ''}`;
        if (r.suppressed) {
          return `<div class="cq-card">${head}</span></p><p class="small muted">Zu wenige Antworten für eine Auswertung (mindestens ${r.need}${q.type === 'text' ? ' bei Freitexten' : ''}). So bleiben einzelne Antworten geschützt.</p></div>`;
        }
        if (q.type === 'scale') {
          body = distBar(r.counts.slice(1), SCALE) + `<p class="small muted">Ø ${fmt(r.mean)} auf der Skala 1 bis 4${r.counts[0] ? ` · Kann ich nicht beurteilen: ${r.counts[0]}` : ''}</p>`;
        } else if (q.type === 'levels') {
          body = distBar(r.counts.slice(1), q.options.map((_, k) => 'Stufe ' + (k + 1))) +
            `<p class="small muted">Ø ${fmt(r.mean)} von ${q.options.length}${r.counts[0] ? ` · Keine Gelegenheit: ${r.counts[0]}` : ''}</p>
            <details><summary class="small" style="cursor:pointer">Stufenaussagen anzeigen</summary><ol class="small" style="margin:8px 0 0">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol></details>`;
        } else if (q.type === 'choice') {
          const base = r.answered || 1;
          body = `<div class="choice-rows">${q.options.map((o, k) => `<span>${esc(o)}</span><span class="bar"><span style="width:${(100 * r.counts[k] / base).toFixed(1)}%"></span></span><span>${r.counts[k]} · ${Math.round(100 * r.counts[k] / base)}&nbsp;%</span>`).join('')}</div>
            ${q.multiple ? '<p class="small muted">Mehrfachauswahl: Die Anteile beziehen sich auf alle, die geantwortet haben.</p>' : ''}`;
        } else {
          body = r.texts.length ? `<ul class="texts">${r.texts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="small muted">In zufälliger Reihenfolge.</p>` : '<p class="muted small">Keine Antworten.</p>';
        }
        return `<div class="cq-card">${head} · ${r.answered} von ${n} beantwortet</span></p>${body}</div>`;
      }).join('')}</div>`;
  }

  // CSV-Zelle: Text, der mit = + - @ beginnt, würde Excel als Formel ausführen. Darum mit ' entschärfen.
  function csvCell(c) {
    let v = String(c === null || c === undefined ? '' : c);
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }
  function csv(custom) {
    if (!custom) return '';
    const rows = [[], ['Eigene Fragen', custom.block.title], ['Frage', 'Form', 'Antwort', 'Anzahl']];
    const res = Object.fromEntries(custom.questions.map((r) => [r.id, r]));
    custom.block.questions.forEach((q) => {
      const r = res[q.id];
      if (!r || r.suppressed) { rows.push([q.text, TYPE_LABEL[q.type], 'Zu wenige Antworten für eine Auswertung', '']); return; }
      if (q.type === 'scale') r.counts.forEach((n, k) => rows.push([q.text, TYPE_LABEL[q.type], k === 0 ? 'Kann ich nicht beurteilen' : SCALE[k - 1], n]));
      else if (q.type === 'levels') r.counts.forEach((n, k) => rows.push([q.text, TYPE_LABEL[q.type], k === 0 ? 'Keine Gelegenheit' : 'Stufe ' + k + ': ' + q.options[k - 1], n]));
      else if (q.type === 'choice') r.counts.forEach((n, k) => rows.push([q.text, TYPE_LABEL[q.type], q.options[k], n]));
      else r.texts.forEach((x) => rows.push([q.text, TYPE_LABEL[q.type], x, '']));
    });
    return '\r\n' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  }

  /* ---------- Vorschau aus Sicht der Lehrperson (nicht gespeichert) ---------- */
  function previewHTML(b) {
    const qs = b.questions.map((q, i) => {
      const opts = (q.options || []).map((o) => o.trim()).filter(Boolean);
      const name = 'pv-' + i;
      let hint = '', body = '';
      if (q.type === 'scale') {
        hint = 'Wie weit trifft die Aussage zu?';
        body = `<div class="opts inline">${SCALE.map((l) => `<label class="opt"><input type="radio" name="${name}"><span>${l}</span></label>`).join('')}</div>
          <div class="opts" style="margin-top:8px"><label class="opt none"><input type="radio" name="${name}"><span>Kann ich nicht beurteilen</span></label></div>`;
      } else if (q.type === 'levels') {
        hint = 'Welche Aussage beschreibt das eigene Handeln am besten?';
        body = `<div class="opts">${opts.map((o) => `<label class="opt"><input type="radio" name="${name}"><span>${esc(o)}</span></label>`).join('')}
          <label class="opt none"><input type="radio" name="${name}"><span>Dazu hatte ich bisher keine Gelegenheit.</span></label></div>`;
      } else if (q.type === 'choice') {
        hint = q.multiple ? 'Mehrere Antworten möglich.' : 'Eine Antwort wählen.';
        body = `<div class="opts">${opts.map((o) => `<label class="opt"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="${name}"><span>${esc(o)}</span></label>`).join('')}</div>`;
      } else {
        hint = 'Freiwillig. Bitte keine Namen und keine Hinweise, die auf einzelne Personen schliessen lassen.';
        body = `<label class="sr-only" for="${name}">Antwort</label><textarea id="${name}" rows="3"></textarea>`;
      }
      return `<fieldset class="q"><legend><span class="qid">${i + 1}</span><span>${esc(q.text || '(ohne Fragetext)')}</span></legend><p class="hint">${hint}</p>${body}</fieldset>`;
    }).join('');
    return `<div class="eyebrow">Vorschau · so sehen Lehrpersonen den letzten Schritt · Eingaben werden nicht gespeichert</div>
      <h2 style="margin-top:6px">${esc(b.title || 'Fragen unserer Schule')}</h2>
      <p class="muted">${esc(b.intro || 'Diese Fragen hat die Schulleitung ergänzt. Die Antworten fliessen nur in die Schulauswertung ein.')}</p>${qs}`;
  }

  /* ---------- Editor (in der Erhebungskarte) ----------
   * Es ist immer höchstens ein Editor offen. Ungespeicherte Änderungen bleiben erhalten, wenn die Liste
   * neu gezeichnet wird (remount), und gehen nur nach Rückfrage verloren (isDirty / discard). */
  let ed = null;       // { id, title, locked, byOther, block, preview, dirty }
  let ctx = null;      // { box, campaigns: () => [], reload: async () => {}, min }
  const emptyQ = (type) => ({ type, text: '', options: type === 'levels' ? ['', '', ''] : type === 'choice' ? ['', ''] : undefined, multiple: false });
  const box = () => ctx && ctx.box;

  function open(id, context) {
    const keep = ed && ed.id === id && ed.dirty;
    ctx = context;
    if (!keep) {
      const c = ctx.campaigns().find((x) => x.id === id);
      const b = c.custom_block ? JSON.parse(JSON.stringify(c.custom_block)) : { title: 'Fragen unserer Schule', intro: '', questions: [] };
      ed = { id, title: c.title, locked: c.submitted > 0 || c.manageable === false, byOther: c.manageable === false, block: b, preview: false, dirty: false };
    }
    render();
  }
  const isDirty = () => !!(ed && ed.dirty);
  const currentId = () => (ed ? ed.id : null);
  function discard() { ed = null; }
  function markDirty() {
    if (!ed.dirty) { ed.dirty = true; if (ctx.onDirty) ctx.onDirty(true); }
    const m = box() && box().querySelector('#ed-msg');
    if (m) { m.className = 'small warn'; m.textContent = 'Ungespeicherte Änderungen'; }
  }

  function render() {
    const el = box();
    if (!el || !ed) return;
    const b = ed.block;
    const textMin = (ctx.min || 5) >= 5 ? Math.max(10, ctx.min || 5) : ctx.min;
    const head = `<p class="small muted" style="max-width:75ch">Eigene Fragen erscheinen am Schluss des Fragebogens und fliessen nicht ins Kompetenzprofil ein. Sobald die erste Lehrperson abgeschlossen hat, lassen sich die Fragen nicht mehr ändern.</p>`;
    if (ed.locked) {
      el.innerHTML = head + (ed.byOther
        ? `<div class="box box--info small">Diese Erhebung stammt von Rektorat/Hauptschulleitung. Die eigenen Fragen werden dort festgelegt.</div>`
        : `<div class="box box--info small">Es gibt bereits abgeschlossene Teilnahmen. Die Fragen sind darum gesperrt. Für geänderte Fragen eine neue Erhebung eröffnen und die Fragen dort übernehmen.</div>`) +
        (b.questions.length ? `<ol class="stack" style="gap:10px;padding-left:20px">${b.questions.map((q) => `<li><b>${esc(q.text)}</b> <span class="small muted">· ${TYPE_LABEL[q.type]}</span>${q.options ? `<ul class="small">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>` : '<p class="muted small">Keine eigenen Fragen.</p>');
      return;
    }
    const others = ctx.campaigns().filter((c) => c.id !== ed.id && count(c));
    el.innerHTML = head + `
      <div class="two-col" style="gap:20px">
        <div class="field"><label for="ed-title">Überschrift im Fragebogen</label><input type="text" id="ed-title" maxlength="80" value="${esc(b.title)}"></div>
        <div class="field"><label for="ed-intro">Einleitung <span class="small muted">(freiwillig)</span></label><textarea id="ed-intro" rows="2" maxlength="500">${esc(b.intro || '')}</textarea></div>
      </div>
      <div class="stack" id="ed-questions" style="gap:12px">${b.questions.map((q, i) => qHTML(q, i, textMin)).join('') || '<p class="muted small">Noch keine Fragen.</p>'}</div>
      <div class="row">
        <label for="ed-newtype" class="small"><b>Frage hinzufügen</b></label>
        <select id="ed-newtype" style="width:auto">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn secondary" type="button" id="ed-add" ${b.questions.length >= 15 ? 'disabled' : ''}>Hinzufügen</button>
        ${others.length ? `<span class="muted small">oder</span><select id="ed-copy" style="width:auto" aria-label="Fragen aus anderer Erhebung übernehmen"><option value="">Fragen übernehmen aus …</option>${others.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="row" style="border-top:1px solid var(--line);padding-top:16px">
        <button class="btn" type="button" id="ed-save">Eigene Fragen speichern</button>
        <button class="btn secondary" type="button" id="ed-preview-btn" aria-expanded="${ed.preview}" ${b.questions.length ? '' : 'disabled'}>${ed.preview ? 'Vorschau schliessen' : 'Vorschau für Lehrpersonen'}</button>
        <span class="confirm" id="ed-remove"></span>
        <span class="small ${ed.dirty ? 'warn' : ''}" id="ed-msg" role="status">${ed.dirty ? 'Ungespeicherte Änderungen' : ''}</span>
      </div>
      <div id="ed-preview" class="preview" ${ed.preview && b.questions.length ? '' : 'hidden'}>${ed.preview ? previewHTML(b) : ''}</div>`;
    bind();
  }

  function qHTML(q, i, textMin) {
    const n = ed.block.questions.length;
    let extra = '';
    if (q.type === 'scale') extra = `<p class="small muted">Antworten: ${SCALE.join(' · ')} · Kann ich nicht beurteilen</p>`;
    if (q.type === 'levels') extra = `<div class="field"><label for="qe-${i}-opts" class="small">Stufenaussagen: eine pro Zeile, von der tiefsten zur höchsten Stufe (3 bis 6)</label><textarea id="qe-${i}-opts" rows="5" data-i="${i}" data-f="options">${esc((q.options || []).join('\n'))}</textarea></div>
      <p class="small muted">Zusätzlich gibt es immer die Option «Dazu hatte ich bisher keine Gelegenheit».</p>`;
    if (q.type === 'choice') extra = `<div class="field"><label for="qe-${i}-opts" class="small">Antwortoptionen: eine pro Zeile (2 bis 10)</label><textarea id="qe-${i}-opts" rows="4" data-i="${i}" data-f="options">${esc((q.options || []).join('\n'))}</textarea></div>
      <label class="check small"><input type="checkbox" id="qe-${i}-multi" data-i="${i}" data-f="multiple" ${q.multiple ? 'checked' : ''}><span>Mehrere Antworten erlaubt</span></label>`;
    if (q.type === 'text') extra = `<p class="small muted">Freitexte können Lehrpersonen erkennbar machen. Sie erscheinen erst ab ${textMin === 10 ? 'zehn' : textMin} Antworten und in zufälliger Reihenfolge. Offene Fragen sparsam einsetzen.</p>`;
    return `<div class="qedit">
      <div class="qedit-head"><span><span class="num">Frage ${i + 1}</span> · ${TYPE_LABEL[q.type]}</span>
        <span class="row" style="gap:4px">
          <button class="btn quiet small" type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Frage ${i + 1} nach oben">▲</button>
          <button class="btn quiet small" type="button" data-move="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Frage ${i + 1} nach unten">▼</button>
          <button class="btn quiet small" type="button" data-remove="${i}">Entfernen</button></span></div>
      <div class="field"><label for="qe-${i}-text" class="small">${q.type === 'scale' ? 'Aussage' : 'Frage'}</label><textarea id="qe-${i}-text" rows="2" maxlength="300" data-i="${i}" data-f="text">${esc(q.text)}</textarea></div>
      ${extra}</div>`;
  }

  function bind() {
    const el = box();
    const q$ = (s) => el.querySelector(s);
    const q$$ = (s) => Array.from(el.querySelectorAll(s));
    const b = ed.block;
    const refresh = () => { if (ed.preview) q$('#ed-preview').innerHTML = previewHTML(b); };
    q$('#ed-title').addEventListener('input', (e) => { b.title = e.target.value; markDirty(); refresh(); });
    q$('#ed-intro').addEventListener('input', (e) => { b.intro = e.target.value; markDirty(); refresh(); });
    q$$('#ed-questions [data-f]').forEach((x) => x.addEventListener(x.type === 'checkbox' ? 'change' : 'input', () => {
      const q = b.questions[+x.dataset.i];
      if (x.dataset.f === 'options') q.options = x.value.split('\n');
      else if (x.dataset.f === 'multiple') q.multiple = x.checked;
      else q.text = x.value;
      markDirty(); refresh();
    }));
    q$$('#ed-questions [data-move]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.move, j = i + +btn.dataset.dir;
      [b.questions[i], b.questions[j]] = [b.questions[j], b.questions[i]];
      ed.dirty = true; render();
    }));
    q$$('#ed-questions [data-remove]').forEach((btn) => btn.addEventListener('click', () => { b.questions.splice(+btn.dataset.remove, 1); ed.dirty = true; render(); }));
    q$('#ed-add').addEventListener('click', () => { b.questions.push(emptyQ(q$('#ed-newtype').value)); ed.dirty = true; render(); q$(`#qe-${b.questions.length - 1}-text`).focus(); });
    const cp = q$('#ed-copy');
    if (cp) cp.addEventListener('change', () => {
      const src = ctx.campaigns().find((c) => c.id === cp.value);
      if (!src) return;
      ed.block = JSON.parse(JSON.stringify(src.custom_block));
      ed.dirty = true;
      render();
      q$('#ed-msg').textContent = 'Fragen übernommen. Zum Übernehmen noch speichern.';
    });
    q$('#ed-save').addEventListener('click', () => save(b));
    q$('#ed-preview-btn').addEventListener('click', () => { ed.preview = !ed.preview; render(); if (ed.preview) q$('#ed-preview').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if (b.questions.length || count(ctx.campaigns().find((c) => c.id === ed.id))) {
      confirmButton(q$('#ed-remove'), 'Alle eigenen Fragen entfernen', 'Alle eigenen Fragen dieser Erhebung entfernen?', 'Ja, entfernen', () => save(null), 'btn quiet');
    }
  }

  async function save(b) {
    const msg = box().querySelector('#ed-msg');
    const payload = b ? { ...b, questions: b.questions.map((q) => ({ ...q, options: q.options ? q.options.map((o) => o.trim()).filter(Boolean) : undefined })) } : null;
    try {
      const r = await api('PUT', `leitung/campaigns/${ed.id}/block`, { block: payload });
      const id = ed.id;
      ed.dirty = false;
      if (ctx.onDirty) ctx.onDirty(false);
      ed = null; // nach dem Neuladen frisch aus den gespeicherten Daten öffnen
      await ctx.reload(id, r.block ? `Gespeichert: ${r.block.questions.length} eigene Frage${r.block.questions.length === 1 ? '' : 'n'}.` : 'Eigene Fragen entfernt.');
    } catch (err) { msg.className = 'small error'; msg.textContent = err.message; }
  }

  return { SCALE, TYPE_LABEL, count, section, csv, csvCell, open, isDirty, currentId, discard };
})();

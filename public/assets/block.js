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
      <p class="muted pv-intro">${esc(b.intro || 'Diese Fragen hat die Schulleitung ergänzt. Die Antworten fliessen nur in die Schulauswertung ein.')}</p>${qs}`;
  }

  /* ---------- Editor (in der Erhebungskarte) ----------
   * Es ist immer höchstens ein Editor offen. Ungespeicherte Änderungen bleiben erhalten, wenn die Liste
   * neu gezeichnet wird (remount), und gehen nur nach Rückfrage verloren (isDirty / discard).
   * Fragen sind zugeklappt; aufgeklappt ist jeweils nur die Frage, die gerade bearbeitet wird (ed.open). */
  let ed = null;       // { id, title, locked, byOther, block, preview, dirty, open, err, saved }
  let ctx = null;      // { box, campaigns: () => [], reload: async () => {} }
  const TYPE_HINT = {
    scale: 'Eine Aussage mit vier Stufen von «trifft nicht zu» bis «trifft voll zu».',
    levels: 'Drei bis sechs Aussagen, die eine Entwicklung beschreiben, wie im Kompetenzteil.',
    choice: 'Zwei bis zehn Antwortoptionen, eine oder mehrere wählbar.',
    text: 'Offene Antwort. Sichtbar erst ab zehn Antworten.',
  };
  const RANGE = { levels: [3, 6], choice: [2, 10] };
  const emptyQ = (type) => ({ type, text: '', options: RANGE[type] ? [] : undefined, multiple: false });
  const box = () => ctx && ctx.box;
  // Gleiche Prüfung wie lib/customblock.js, damit Fehler direkt an der Frage erscheinen
  function problem(q) {
    if (!q.text.trim()) return { f: 'text', msg: 'Bitte den Fragetext eingeben.' };
    const r = RANGE[q.type];
    if (r) {
      const n = (q.options || []).map((o) => o.trim()).filter(Boolean).length;
      if (n < r[0] || n > r[1]) return { f: 'opts', msg: `Bitte ${r[0]} bis ${r[1]} ${q.type === 'levels' ? 'Stufenaussagen' : 'Antwortoptionen'} eingeben, eine pro Zeile (zurzeit ${n}).` };
    }
    return null;
  }
  // Textfelder wachsen mit dem Inhalt, damit nichts abgeschnitten wird
  const grow = (t) => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + t.offsetHeight - t.clientHeight) + 'px'; };
  const growAll = () => { const el = box(); if (el) el.querySelectorAll('textarea').forEach(grow); };
  let resizeT = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(growAll, 150); });

  function open(id, context) {
    const keep = ed && ed.id === id && ed.dirty;
    ctx = context;
    if (!keep) {
      const c = ctx.campaigns().find((x) => x.id === id);
      const b = c.custom_block ? JSON.parse(JSON.stringify(c.custom_block)) : { title: 'Fragen unserer Schule', intro: '', questions: [] };
      ed = { id, title: c.title, locked: c.submitted > 0 || c.manageable === false, byOther: c.manageable === false, block: b, preview: false, dirty: false, open: null, err: null, saved: count(c) };
    }
    render();
  }
  const isDirty = () => !!(ed && ed.dirty);
  const currentId = () => (ed ? ed.id : null);
  function discard() { ed = null; }
  function setMsg(text, cls) {
    const m = box() && box().querySelector('#ed-msg');
    if (m) { m.className = 'small ' + (cls || ''); m.textContent = text; }
  }
  function markDirty() {
    if (!ed.dirty) { ed.dirty = true; if (ctx.onDirty) ctx.onDirty(true); }
    setMsg(ed.block.questions.length ? 'Ungespeicherte Änderungen' : 'Ohne Fragen gibt es nichts zu speichern. Gespeicherte Fragen entfernt «Alle eigenen Fragen entfernen».', 'warn');
  }

  function render() {
    const el = box();
    if (!el || !ed) return;
    const b = ed.block;
    if (ed.locked) {
      el.innerHTML = (ed.byOther
        ? `<div class="box box--info small">Diese Erhebung stammt von Rektorat/Hauptschulleitung. Die eigenen Fragen werden dort festgelegt.</div>`
        : `<div class="box box--info small">Es gibt bereits abgeschlossene Teilnahmen. Die Fragen sind darum gesperrt. Für geänderte Fragen eine neue Erhebung eröffnen und die Fragen dort übernehmen.</div>`) +
        (b.questions.length ? `<ol class="stack" style="gap:10px;padding-left:20px">${b.questions.map((q) => `<li><b>${esc(q.text)}</b> <span class="small muted">· ${TYPE_LABEL[q.type]}</span>${q.options ? `<ul class="small">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>` : '<p class="muted small">Keine eigenen Fragen.</p>');
      return;
    }
    const has = b.questions.length > 0;
    const split = ed.preview && has;
    const others = ctx.campaigns().filter((c) => c.id !== ed.id && count(c));
    const head = `<p class="small muted" style="max-width:75ch">Eigene Fragen erscheinen am Schluss des Fragebogens und fliessen nicht ins Kompetenzprofil ein. Sobald die erste Lehrperson abgeschlossen hat, lassen sich die Fragen nicht mehr ändern.</p>`;
    const fields = has ? `
      <div class="ed-meta">
        <div class="field"><label for="ed-title">Überschrift im Fragebogen</label><input type="text" id="ed-title" maxlength="80" value="${esc(b.title)}"></div>
        <div class="field"><label for="ed-intro">Einleitung <span class="small muted">(freiwillig)</span></label><textarea id="ed-intro" rows="2" maxlength="500">${esc(b.intro || '')}</textarea></div>
      </div>
      <div class="stack" id="ed-questions" style="gap:8px">${b.questions.map((q, i) => qHTML(q, i)).join('')}</div>` : '';
    const add = `
      <div class="addq">
        <h4 class="addq-title">${has ? 'Weitere Frage hinzufügen' : 'Erste Frage hinzufügen'}</h4>
        <div class="addq-grid">${Object.keys(TYPE_LABEL).map((k) => `<button class="addq-btn" type="button" data-add="${k}"><b>${TYPE_LABEL[k]}</b><span>${TYPE_HINT[k]}</span></button>`).join('')}</div>
        ${others.length ? `<div class="row" style="gap:8px"><label for="ed-copy" class="small">oder Fragen übernehmen aus</label><select id="ed-copy" style="width:auto"><option value="">Erhebung wählen …</option>${others.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div>` : ''}
      </div>`;
    const actions = has || ed.saved ? `
      <div class="row ed-actions">
        <button class="btn" type="button" id="ed-save" ${has ? '' : 'disabled'}>Eigene Fragen speichern</button>
        ${has ? `<button class="btn secondary" type="button" id="ed-preview-btn" aria-expanded="${ed.preview}">${ed.preview ? 'Vorschau schliessen' : 'Vorschau für Lehrpersonen'}</button>` : ''}
        <span class="small ${ed.dirty ? 'warn' : ''}" id="ed-msg" role="status">${ed.dirty ? (has ? 'Ungespeicherte Änderungen' : 'Ohne Fragen gibt es nichts zu speichern. Gespeicherte Fragen entfernt «Alle eigenen Fragen entfernen».') : ''}</span>
        <span class="confirm ed-remove" id="ed-remove"></span>
      </div>` : '';
    el.innerHTML = head + `
      <div class="${split ? 'ed-split' : ''}">
        <div class="ed-main">${fields}${add}${actions}</div>
        ${split ? `<aside id="ed-preview" class="preview" aria-label="Vorschau für Lehrpersonen">${previewHTML(b)}</aside>` : ''}
      </div>`;
    bind();
    growAll();
  }

  function qHTML(q, i) {
    const n = ed.block.questions.length;
    const isOpen = ed.open === i;
    const err = ed.err && ed.err.i === i ? ed.err : null;
    const tools = `<span class="row" style="gap:4px">
          <button class="btn quiet small" type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Frage ${i + 1} nach oben">▲</button>
          <button class="btn quiet small" type="button" data-move="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Frage ${i + 1} nach unten">▼</button>
          <button class="btn quiet small" type="button" data-remove="${i}" aria-label="Frage ${i + 1} entfernen">Entfernen</button></span>`;
    const head = `<div class="qedit-head">
        <button class="qedit-toggle" type="button" data-toggle="${i}" aria-expanded="${isOpen}" ${isOpen ? `aria-controls="qe-${i}-body"` : ''}>
          <span><span class="num">Frage ${i + 1}</span> <span class="muted">· ${TYPE_LABEL[q.type]}</span></span>
          ${isOpen ? '' : `<span class="qedit-sum">${esc(q.text.trim() || '(noch ohne Fragetext)')}</span>`}</button>
        ${tools}</div>`;
    if (!isOpen) return `<div class="qedit collapsed${err ? ' has-error' : ''}">${head}</div>`;
    const inv = (f) => (err && err.f === f ? `aria-invalid="true" aria-describedby="qe-${i}-err"` : '');
    const errP = (f) => (err && err.f === f ? `<p class="error small" id="qe-${i}-err">${esc(err.msg)}</p>` : '');
    let extra = '';
    if (q.type === 'scale') extra = `<p class="small muted">Antworten: ${SCALE.join(' · ')} · Kann ich nicht beurteilen</p>`;
    if (q.type === 'levels') extra = `<div class="field"><label for="qe-${i}-opts" class="small">Stufenaussagen: eine pro Zeile, von der tiefsten zur höchsten Stufe (3 bis 6)</label><textarea id="qe-${i}-opts" rows="4" data-i="${i}" data-f="options" ${inv('opts')}>${esc((q.options || []).join('\n'))}</textarea>${errP('opts')}</div>
      <p class="small muted">Zusätzlich gibt es immer die Option «Dazu hatte ich bisher keine Gelegenheit».</p>`;
    if (q.type === 'choice') extra = `<div class="field"><label for="qe-${i}-opts" class="small">Antwortoptionen: eine pro Zeile (2 bis 10)</label><textarea id="qe-${i}-opts" rows="3" data-i="${i}" data-f="options" ${inv('opts')}>${esc((q.options || []).join('\n'))}</textarea>${errP('opts')}</div>
      <label class="check small"><input type="checkbox" id="qe-${i}-multi" data-i="${i}" data-f="multiple" ${q.multiple ? 'checked' : ''}><span>Mehrere Antworten erlaubt</span></label>`;
    if (q.type === 'text') extra = `<p class="small muted">Freitexte können Lehrpersonen erkennbar machen. Sie erscheinen erst ab zehn Antworten und in zufälliger Reihenfolge. Offene Fragen sparsam einsetzen.</p>`;
    return `<div class="qedit${err ? ' has-error' : ''}">${head}
      <div class="qedit-body" id="qe-${i}-body">
        <div class="field"><label for="qe-${i}-type" class="small">Frageform</label><select id="qe-${i}-type" data-i="${i}" style="width:auto;align-self:start">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${k === q.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="qe-${i}-text" class="small">${q.type === 'scale' ? 'Aussage' : 'Frage'}</label><textarea id="qe-${i}-text" rows="1" maxlength="300" data-i="${i}" data-f="text" ${inv('text')}>${esc(q.text)}</textarea>${errP('text')}</div>
        ${extra}</div></div>`;
  }

  function bind() {
    const el = box();
    const q$ = (s) => el.querySelector(s);
    const q$$ = (s) => Array.from(el.querySelectorAll(s));
    const b = ed.block;
    const refresh = () => { const pv = q$('#ed-preview'); if (pv) pv.innerHTML = previewHTML(b); };
    const changed = () => { ed.err = null; markDirty(); render(); };
    const title = q$('#ed-title'), intro = q$('#ed-intro');
    if (title) title.addEventListener('input', (e) => { b.title = e.target.value; markDirty(); refresh(); });
    if (intro) intro.addEventListener('input', (e) => { b.intro = e.target.value; grow(e.target); markDirty(); refresh(); });
    q$$('#ed-questions [data-f]').forEach((x) => x.addEventListener(x.type === 'checkbox' ? 'change' : 'input', () => {
      const i = +x.dataset.i, q = b.questions[i];
      if (x.dataset.f === 'options') q.options = x.value.split('\n');
      else if (x.dataset.f === 'multiple') q.multiple = x.checked;
      else q.text = x.value;
      if (x.tagName === 'TEXTAREA') grow(x);
      // Fehlerhinweis verschwindet, sobald die Angabe stimmt
      if (ed.err && ed.err.i === i && !problem(q)) {
        ed.err = null;
        const card = x.closest('.qedit'); card.classList.remove('has-error');
        card.querySelectorAll('[aria-invalid]').forEach((f) => { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-describedby'); });
        card.querySelectorAll('.error').forEach((p) => p.remove());
      }
      markDirty(); refresh();
    }));
    q$$('#ed-questions select[id$="-type"]').forEach((s) => s.addEventListener('change', () => {
      const i = +s.dataset.i, q = b.questions[i];
      q.type = s.value;
      if (RANGE[q.type] && !q.options) q.options = []; // Optionen bleiben erhalten, wenn zwischen Stufen und Auswahl gewechselt wird
      changed();
      q$(`#qe-${i}-type`).focus();
    }));
    q$$('#ed-questions [data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.toggle;
      ed.open = ed.open === i ? null : i;
      render();
      q$(`[data-toggle="${i}"]`).focus();
    }));
    q$$('#ed-questions [data-move]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.move, j = i + +btn.dataset.dir;
      [b.questions[i], b.questions[j]] = [b.questions[j], b.questions[i]];
      if (ed.open === i) ed.open = j; else if (ed.open === j) ed.open = i;
      changed();
      const same = q$(`[data-move="${j}"][data-dir="${btn.dataset.dir}"]`);
      (same && !same.disabled ? same : q$(`[data-toggle="${j}"]`)).focus();
    }));
    q$$('#ed-questions [data-remove]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.remove;
      b.questions.splice(i, 1);
      if (ed.open === i) ed.open = null; else if (ed.open > i) ed.open--;
      changed();
      const next = q$(`[data-toggle="${Math.min(i, b.questions.length - 1)}"]`) || q$('[data-add]');
      if (next) next.focus();
    }));
    q$$('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
      b.questions.push(emptyQ(btn.dataset.add));
      ed.open = b.questions.length - 1;
      changed();
      q$(`#qe-${ed.open}-text`).focus();
    }));
    const cp = q$('#ed-copy');
    if (cp) cp.addEventListener('change', () => {
      const src = ctx.campaigns().find((c) => c.id === cp.value);
      if (!src) return;
      if (b.questions.length && !confirm(`Die bisherigen eigenen Fragen werden durch die Fragen aus «${src.title}» ersetzt. Fortfahren?`)) { cp.value = ''; return; }
      ed.block = JSON.parse(JSON.stringify(src.custom_block));
      ed.open = null;
      changed();
      setMsg('Fragen übernommen. Zum Bestätigen speichern.', 'warn');
    });
    const sv = q$('#ed-save');
    if (sv) sv.addEventListener('click', () => save(b));
    const pb = q$('#ed-preview-btn');
    if (pb) pb.addEventListener('click', () => {
      ed.preview = !ed.preview;
      render();
      q$('#ed-preview-btn').focus();
      const pv = q$('#ed-preview');
      // Schmale Ansicht: Vorschau steht unter dem Editor
      if (pv && pv.getBoundingClientRect().top > innerHeight) pv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (q$('#ed-remove') && (b.questions.length || ed.saved)) {
      confirmButton(q$('#ed-remove'), 'Alle eigenen Fragen entfernen', 'Alle eigenen Fragen dieser Erhebung entfernen?', 'Ja, entfernen', () => save(null), 'btn quiet');
    }
  }

  function showErr(i, p) {
    ed.err = { i, f: p.f, msg: p.msg };
    ed.open = i;
    render();
    setMsg(`Nicht gespeichert: Bei Frage ${i + 1} fehlt noch eine Angabe.`, 'error');
    const f = box().querySelector(p.f === 'opts' ? `#qe-${i}-opts` : `#qe-${i}-text`);
    if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); }
  }

  async function save(b) {
    if (b) {
      const i = b.questions.findIndex((q) => problem(q));
      if (i >= 0) return showErr(i, problem(b.questions[i]));
    }
    const payload = b ? { ...b, questions: b.questions.map((q) => ({ ...q, options: RANGE[q.type] ? q.options.map((o) => o.trim()).filter(Boolean) : undefined })) } : null;
    try {
      const r = await api('PUT', `leitung/campaigns/${ed.id}/block`, { block: payload });
      const id = ed.id;
      ed.dirty = false;
      if (ctx.onDirty) ctx.onDirty(false);
      ed = null; // nach dem Neuladen frisch aus den gespeicherten Daten öffnen
      await ctx.reload(id, r.block ? `Gespeichert: ${r.block.questions.length} eigene Frage${r.block.questions.length === 1 ? '' : 'n'}.` : 'Eigene Fragen entfernt.');
    } catch (err) {
      const m = b && /^Frage (\d+): (.*)$/.exec(err.message);
      if (m && b.questions[+m[1] - 1]) return showErr(+m[1] - 1, { f: /Fragetext/.test(m[2]) ? 'text' : 'opts', msg: m[2] });
      setMsg(err.message, 'error');
      const msg = box().querySelector('#ed-msg');
      if (msg) msg.scrollIntoView({ block: 'nearest' });
    }
  }

  return { SCALE, TYPE_LABEL, count, section, csv, csvCell, open, isDirty, currentId, discard };
})();

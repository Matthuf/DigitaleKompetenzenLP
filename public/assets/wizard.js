// Assistent «Jetzt einrichten» für Rektorat bzw. Hauptschulleitung.
// Führt in drei Schritten durch Schulhäuser, Schulleitungen und das Eröffnen und zeigt am Schluss die Links.
// Pro Bildschirm eine Aufgabe; alles, was nicht zur Aufgabe gehört, bleibt weg.
window.Wizard = (function () {
  'use strict';
  const { $, $$, esc, api, copyText } = UI;

  const TITEL = ['Schulhäuser', 'Schulleitungen', 'Erhebung'];
  let dlg = null, host = null;
  let st = null; // { step, getrennt, schulhaeuser:[{name}], invites:{schoolId:{name,email}}, due, title, busy, fehler, links }

  function open(h) {
    host = h;
    st = { step: 0, getrennt: true, neue: [''], invites: {}, due: '', title: '', busy: false, fehler: '', links: null };
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'wizard';
      dlg.className = 'wizard';
      document.body.appendChild(dlg);
      dlg.addEventListener('cancel', (e) => { if (st && st.busy) e.preventDefault(); });
      dlg.addEventListener('close', () => { if (host.reload) host.reload(); });
    }
    // Sind schon Schulhäuser erfasst, ist Schritt 1 erledigt: nicht nochmals danach fragen
    if (host.schools().length) st.step = 1;
    draw();
    dlg.showModal();
  }

  const schulhaeuser = () => host.schools();

  function draw() {
    dlg.innerHTML = `<div class="wz">
      ${st.links ? kopfFertig() : kopf()}
      <div class="wz-body">${st.links ? fertig() : [schritt1, schritt2, schritt3][st.step]()}</div>
      <div class="wz-foot">${st.fehler ? `<p class="error small" role="alert">${esc(st.fehler)}</p>` : ''}
        <div class="row" style="justify-content:space-between;width:100%">
          <div>${st.links || st.step === 0 ? '' : `<button class="btn quiet" type="button" data-zurueck>Zurück</button>`}</div>
          <div class="row" style="gap:10px">${aktionen()}</div>
        </div></div>
    </div>`;
    binden();
    const f = dlg.querySelector('input, button[data-weiter], button[data-fertig]');
    if (f) f.focus();
  }

  const kopf = () => `<div class="wz-head">
      <p class="eyebrow">Einrichten · Schritt ${st.step + 1} von 3</p>
      <h2>${TITEL[st.step]}</h2>
      <ol class="wz-dots" aria-label="Fortschritt">${TITEL.map((t, i) =>
        `<li class="${i < st.step ? 'done' : i === st.step ? 'now' : ''}"><span class="sr-only">Schritt ${i + 1}: ${esc(t)}${i < st.step ? ' (erledigt)' : i === st.step ? ' (aktuell)' : ''}</span></li>`).join('')}</ol>
    </div>`;
  const kopfFertig = () => `<div class="wz-head"><p class="eyebrow">Einrichten · fertig</p><h2>Die Erhebung läuft</h2></div>`;

  /* Schritt 1: Wie wird ausgewertet, und wie heissen die Schulhäuser?
   * Die Frage zielt auf das Ergebnis («welche Auswertung bekomme ich?»), nicht auf die Technik. */
  function schritt1() {
    const t = host.traegerName();
    return `<p class="wz-lead">Für jedes Schulhaus entsteht ein eigener Teilnahmelink. Wie möchten Sie die Ergebnisse sehen?</p>
      <div class="wz-cards" role="radiogroup" aria-label="Auswertung">
        <label class="wz-card ${st.getrennt ? 'sel' : ''}"><input type="radio" name="wz-art" value="getrennt" ${st.getrennt ? 'checked' : ''}>
          <b>Getrennt pro Schulhaus</b><span>Sie sehen jedes Schulhaus einzeln und alle zusammen. Jede Schulleitung sieht ihr eigenes Schulhaus.</span></label>
        <label class="wz-card ${st.getrennt ? '' : 'sel'}"><input type="radio" name="wz-art" value="zusammen" ${st.getrennt ? '' : 'checked'}>
          <b>Alle Lehrpersonen zusammen</b><span>Ein Link und eine gemeinsame Auswertung, ohne Aufteilung nach Schulhaus.</span></label>
      </div>
      ${st.getrennt ? `<div class="wz-field"><label class="small"><b>Namen der Schulhäuser</b></label>
          <div class="stack" style="gap:8px" id="wz-liste">${st.neue.map((n, i) => `
            <div class="row" style="gap:8px"><input type="text" value="${esc(n)}" data-nr="${i}" placeholder="z. B. Schulhaus Dorf" style="flex:1 1 240px">
              ${st.neue.length > 1 ? `<button class="btn quiet small" type="button" data-weg="${i}">Entfernen</button>` : ''}</div>`).join('')}</div>
          <button class="btn quiet small" type="button" data-mehr>+ Weiteres Schulhaus</button></div>`
        : `<div class="wz-field"><label class="small" for="wz-eins"><b>Name für die Auswertung</b></label>
          <input type="text" id="wz-eins" value="${esc(st.neue[0] || t)}" style="width:100%;max-width:360px">
          <p class="small muted">Erscheint über der Auswertung und auf der Startseite der Lehrpersonen.</p></div>`}`;
  }

  /* Schritt 2: Zugänge für die Schulleitungen. Überspringen ist ausdrücklich möglich. */
  function schritt2() {
    const s = schulhaeuser();
    const offen = s.filter((x) => !x.hatLeitung);
    if (!offen.length) {
      return `<p class="wz-lead">Alle Schulhäuser haben bereits einen Zugang für die Schulleitung. Sie können direkt weiter.</p>
        <ul class="list-plain stack" style="gap:6px">${s.map((x) => `<li>✓ ${esc(x.name)}</li>`).join('')}</ul>`;
    }
    return `<p class="wz-lead">Mit eigenem Zugang gibt die Schulleitung den Link an ihre Lehrpersonen weiter und sieht die Auswertung ihres Schulhauses. Leer lassen, wo Sie den Link selbst verteilen.</p>
      <div class="stack" style="gap:14px">${offen.map((x) => `
        <div class="wz-inv"><b>${esc(x.name)}</b>
          <div class="row" style="gap:10px">
            <div class="field"><label class="small" for="wz-n-${x.id}">Name</label><input type="text" id="wz-n-${x.id}" data-inv-name="${x.id}" value="${esc((st.invites[x.id] || {}).name || '')}" style="width:180px"></div>
            <div class="field"><label class="small" for="wz-m-${x.id}">E-Mail</label><input type="text" id="wz-m-${x.id}" data-inv-mail="${x.id}" inputmode="email" value="${esc((st.invites[x.id] || {}).email || '')}" style="width:230px"></div>
          </div></div>`).join('')}</div>`;
  }

  /* Schritt 3: Eröffnen. Die Vorgabe des AVS ist gesetzt, nicht wählbar – hier geht es nur noch ums Datum. */
  function schritt3() {
    const v = host.vorgabe();
    const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return `<p class="wz-lead">${v ? `Es wird die Erhebung des AVS eröffnet: <b>${esc(v.title)}</b>.` : 'Es wird eine eigene Erhebung Ihres Schulträgers eröffnet.'}
        Beteiligt sind ${schulhaeuser().length === 1 ? 'Ihr Schulhaus' : `alle ${schulhaeuser().length} Schulhäuser`}, jedes mit eigenem Link.</p>
      ${v ? '' : `<div class="wz-field"><label class="small" for="wz-title"><b>Titel</b></label><input type="text" id="wz-title" value="${esc(st.title)}" placeholder="z. B. Herbst 2026" maxlength="80" style="width:100%;max-width:360px"></div>`}
      <div class="wz-field"><label class="small" for="wz-due"><b>Ausfüllen bis</b> <span class="muted">(freiwillig)</span></label>
        <input type="date" id="wz-due" value="${esc(st.due)}" min="${heute}" style="width:200px">
        <p class="small muted">Erscheint in der E-Mail-Vorlage und auf der Startseite der Lehrpersonen. Die Erhebung schliesst nicht automatisch.</p></div>`;
  }

  function fertig() {
    return `<p class="wz-lead">Die Links sind bereit. Geben Sie sie an Ihre Lehrpersonen weiter – oder überlassen Sie das den Schulleitungen mit Zugang.</p>
      <div class="stack" style="gap:10px">${st.links.map((l) => `
        <div class="wz-link"><b>${esc(l.school_name)}</b>
          <code>${esc(location.origin + '/t/' + l.token)}</code>
          <button class="btn secondary small" type="button" data-copy="${esc(l.token)}">Link kopieren</button></div>`).join('')}</div>
      <p class="small muted">Alles Weitere – E-Mail-Vorlagen, QR-Code, Rücklauf, eigene Fragen – finden Sie danach bei der Erhebung.</p>`;
  }

  function aktionen() {
    if (st.links) return `<button class="btn" type="button" data-fertig>Fertig</button>`;
    const weiter = st.step === 2 ? 'Erhebung eröffnen' : 'Weiter';
    const ueber = st.step === 1 && schulhaeuser().some((x) => !x.hatLeitung)
      ? `<button class="btn quiet" type="button" data-ueber>Überspringen</button>` : '';
    return `<button class="btn quiet" type="button" data-abbruch>Abbrechen</button>${ueber}
      <button class="btn" type="button" data-weiter ${st.busy ? 'disabled' : ''}>${st.busy ? 'Einen Moment …' : weiter}</button>`;
  }

  function binden() {
    const on = (sel, ev, fn) => $$(sel, dlg).forEach((el) => el.addEventListener(ev, fn));
    on('[name=wz-art]', 'change', (e) => { st.getrennt = e.target.value === 'getrennt'; st.fehler = ''; draw(); });
    on('[data-nr]', 'input', (e) => { st.neue[+e.target.dataset.nr] = e.target.value; });
    on('[data-weg]', 'click', (e) => { st.neue.splice(+e.target.dataset.weg, 1); draw(); });
    on('[data-mehr]', 'click', () => { lesen(); st.neue.push(''); draw(); });
    on('[data-inv-name]', 'input', (e) => { const id = e.target.dataset.invName; st.invites[id] = { ...(st.invites[id] || {}), name: e.target.value }; });
    on('[data-inv-mail]', 'input', (e) => { const id = e.target.dataset.invMail; st.invites[id] = { ...(st.invites[id] || {}), email: e.target.value }; });
    on('[data-copy]', 'click', (e) => copyText(location.origin + '/t/' + e.currentTarget.dataset.copy, e.currentTarget));
    on('[data-zurueck]', 'click', () => { lesen(); st.step--; st.fehler = ''; draw(); });
    on('[data-abbruch]', 'click', () => dlg.close());
    on('[data-fertig]', 'click', () => dlg.close());
    on('[data-ueber]', 'click', () => { st.invites = {}; st.step = 2; st.fehler = ''; draw(); });
    on('[data-weiter]', 'click', weiter);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (!st.busy) weiter(); }
    });
  }

  function lesen() {
    if (st.links || st.step !== 0) return;
    if (st.getrennt) $$('[data-nr]', dlg).forEach((i) => { st.neue[+i.dataset.nr] = i.value; });
    else { const e = $('#wz-eins', dlg); if (e) st.neue[0] = e.value; }
  }

  async function weiter() {
    lesen();
    st.fehler = '';
    if (st.step === 0) return schulhaeuserAnlegen();
    if (st.step === 1) return einladen();
    return eroeffnen();
  }

  async function schulhaeuserAnlegen() {
    const namen = (st.getrennt ? st.neue : [st.neue[0] || host.traegerName()]).map((n) => (n || '').trim()).filter(Boolean);
    if (!namen.length) { st.fehler = st.getrennt ? 'Bitte mindestens ein Schulhaus eintragen.' : 'Bitte einen Namen eintragen.'; return draw(); }
    st.busy = true; draw();
    try {
      for (const name of namen) await api('POST', 'leitung/schools', { name });
      await host.refresh();
      st.busy = false; st.step = 1; draw();
    } catch (err) { st.busy = false; st.fehler = err.message; draw(); }
  }

  async function einladen() {
    const auftraege = Object.entries(st.invites)
      .map(([id, v]) => ({ id, name: (v.name || '').trim(), email: (v.email || '').trim() }))
      .filter((x) => x.name || x.email);
    st.busy = true; draw();
    try {
      for (const a of auftraege) await api('POST', 'leitung/invitations', { role: 'leitung', schoolId: a.id, name: a.name, email: a.email });
      await host.refresh();
      st.busy = false; st.step = 2; draw();
    } catch (err) { st.busy = false; st.fehler = err.message; draw(); }
  }

  async function eroeffnen() {
    const d = $('#wz-due', dlg); if (d) st.due = d.value;
    const t = $('#wz-title', dlg); if (t) st.title = t.value;
    const v = host.vorgabe();
    st.busy = true; draw();
    try {
      const c = await api('POST', 'leitung/campaigns', {
        roundId: v ? v.id : undefined,
        title: st.title || undefined,
        dueDate: st.due || undefined,
        schoolIds: schulhaeuser().map((s) => s.id),
      });
      const alle = await api('GET', 'leitung/campaigns');
      const neu = alle.find((x) => x.id === c.id) || alle[0];
      st.busy = false; st.links = (neu && neu.links) || []; draw();
    } catch (err) { st.busy = false; st.fehler = err.message; draw(); }
  }

  return { open };
})();

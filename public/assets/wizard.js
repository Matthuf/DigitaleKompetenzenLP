// Assistent «Jetzt einrichten» für Rektorat bzw. Hauptschulleitung.
// Pro Bildschirm eine Entscheidung oder eine Eingabe. Der erste Bildschirm legt den Rahmen fest;
// danach verzweigt der Weg: getrennt pro Schulhaus (vier Schritte) oder gesamt (zwei Schritte).
window.Wizard = (function () {
  'use strict';
  const { $, $$, esc, api, copyText } = UI;

  const TITEL = { rahmen: 'Rahmen der Erhebung', haeuser: 'Schulhäuser', leitungen: 'Zugänge für die Schulleitungen', eroeffnen: 'Erhebung eröffnen' };
  let dlg = null, host = null, st = null;

  function open(h) {
    host = h;
    st = { rahmen: null, idx: 0, erledigt: 0, neue: [''], gesamtName: '', invites: {}, due: '', title: '', busy: false, fehler: '', links: null };
    // Wer schon Schulhäuser erfasst hat, hat den Rahmen bereits gewählt: nicht nochmals danach fragen
    if (host.schools().length) { st.rahmen = 'getrennt'; st.idx = 2; st.erledigt = 2; }
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'wizard';
      dlg.className = 'wizard';
      document.body.appendChild(dlg);
      dlg.addEventListener('cancel', (e) => { if (st && st.busy) e.preventDefault(); });
      dlg.addEventListener('close', () => { if (host.reload) host.reload(); });
    }
    draw();
    dlg.showModal();
  }

  // Die Schritte, die auf dem gewählten Weg tatsächlich kommen
  const plan = () => (st.rahmen === 'gesamt' ? ['rahmen', 'eroeffnen'] : ['rahmen', 'haeuser', 'leitungen', 'eroeffnen']);
  const jetzt = () => plan()[st.idx];
  const schulhaeuser = () => host.schools();

  function draw() {
    const p = plan();
    dlg.innerHTML = `<div class="wz">
      ${st.links ? kopfFertig() : kopf(p)}
      <div class="wz-body">${st.links ? fertig() : BILD[jetzt()]()}</div>
      <div class="wz-foot">${st.fehler ? `<p class="error small" role="alert">${esc(st.fehler)}</p>` : ''}
        <div class="row" style="justify-content:space-between;width:100%">
          <div>${st.links || st.idx === 0 || st.idx <= st.erledigt ? '' : `<button class="btn quiet" type="button" data-zurueck>Zurück</button>`}</div>
          <div class="row" style="gap:10px">${aktionen()}</div>
        </div></div>
    </div>`;
    binden();
    const f = dlg.querySelector('input:not([type=radio]), input[type=radio]:checked, button[data-weiter], button[data-fertig]');
    if (f) f.focus();
  }

  const kopf = (p) => `<div class="wz-head">
      <p class="eyebrow">Einrichten · Schritt ${st.idx + 1} von ${p.length}</p>
      <h2>${esc(TITEL[jetzt()])}</h2>
      <ol class="wz-dots" aria-label="Fortschritt">${p.map((k, i) =>
        `<li class="${i < st.idx ? 'done' : i === st.idx ? 'now' : ''}"><span class="sr-only">Schritt ${i + 1}: ${esc(TITEL[k])}${i < st.idx ? ' (erledigt)' : i === st.idx ? ' (aktuell)' : ''}</span></li>`).join('')}</ol>
    </div>`;
  const kopfFertig = () => `<div class="wz-head"><p class="eyebrow">Einrichten · fertig</p><h2>Einrichtung abgeschlossen</h2></div>`;

  /* Schritt 1: nur die Grundsatzfrage. Beide Folgen stehen ausgeschrieben da,
   * inklusive dem, was mit der Gesamterhebung nicht mehr möglich ist. */
  function bildRahmen() {
    const sel = (v) => (st.rahmen === v ? 'sel' : '');
    return `<p class="wz-lead">Zuerst eine Entscheidung: Soll jedes Schulhaus eine eigene Auswertung erhalten, oder werten Sie alle Lehrpersonen Ihres Schulträgers gemeinsam aus?</p>
      <div class="wz-cards wz-cards--stack" role="radiogroup" aria-label="Rahmen der Erhebung">
        <label class="wz-card ${sel('getrennt')}"><input type="radio" name="wz-rahmen" value="getrennt" ${st.rahmen === 'getrennt' ? 'checked' : ''}>
          <b>Getrennt pro Schulhaus</b>
          <span>Sie erfassen Ihre Schulhäuser. Jedes erhält einen eigenen Teilnahmelink und eine eigene Auswertung.
            Sie sehen jedes Schulhaus einzeln <i>und</i> alle zusammen; jede Schulleitung sieht ihr eigenes Schulhaus.</span></label>
        <label class="wz-card ${sel('gesamt')}"><input type="radio" name="wz-rahmen" value="gesamt" ${st.rahmen === 'gesamt' ? 'checked' : ''}>
          <b>Gesamt für den ganzen Schulträger</b>
          <span>Ein einziger Link für alle Ihre Lehrpersonen und eine gemeinsame Auswertung, ohne Schulhäuser.
            Sie sehen dann <b>nicht</b>, wie die einzelnen Schulhäuser stehen – und das lässt sich für diese Erhebung später nicht mehr aufteilen.</span></label>
      </div>
      ${st.rahmen ? `<p class="wz-next"><b>Danach:</b> ${st.rahmen === 'getrennt'
        ? 'Schulhäuser erfassen · Zugänge für die Schulleitungen (freiwillig, dafür brauchen Sie deren E-Mail-Adressen) · Erhebung eröffnen'
        : 'Erhebung eröffnen. Mehr braucht es nicht.'}</p>` : ''}`;
  }

  function bildHaeuser() {
    return `<p class="wz-lead">Tragen Sie die Namen Ihrer Schulhäuser ein. Jedes erhält einen eigenen Teilnahmelink und eine eigene Auswertung.</p>
      <div class="wz-field"><div class="stack" style="gap:8px" id="wz-liste">${st.neue.map((n, i) => `
        <div class="row" style="gap:8px"><label class="sr-only" for="wz-h-${i}">Schulhaus ${i + 1}</label>
          <input type="text" id="wz-h-${i}" value="${esc(n)}" data-nr="${i}" placeholder="z. B. Schulhaus Dorf" style="flex:1 1 240px">
          ${st.neue.length > 1 ? `<button class="btn quiet small" type="button" data-weg="${i}">Entfernen</button>` : ''}</div>`).join('')}</div>
        <button class="btn quiet small" type="button" data-mehr>+ Weiteres Schulhaus</button>
        <p class="small muted">Namen und Zyklen lassen sich später unter «Schulen und Zugänge» anpassen.</p></div>`;
  }

  function bildLeitungen() {
    const s = schulhaeuser();
    const offen = s.filter((x) => !x.hatLeitung);
    if (!offen.length) {
      return `<p class="wz-lead">Alle Schulhäuser haben bereits einen Zugang für die Schulleitung. Sie können direkt weiter.</p>
        <ul class="list-plain stack" style="gap:6px">${s.map((x) => `<li>✓ ${esc(x.name)}</li>`).join('')}</ul>`;
    }
    return `<p class="wz-lead">Freiwillig: Mit eigenem Zugang gibt die Schulleitung den Link an ihre Lehrpersonen weiter und sieht die Auswertung ihres Schulhauses.
      Leer lassen, wo Sie den Link selbst verteilen. Fehlt Ihnen eine Adresse, überspringen Sie den Schritt und holen das später unter «Schulen und Zugänge» nach.</p>
      <div class="stack" style="gap:14px">${offen.map((x) => `
        <div class="wz-inv"><b>${esc(x.name)}</b>
          <div class="row" style="gap:10px">
            <div class="field"><label class="small" for="wz-n-${x.id}">Name</label><input type="text" id="wz-n-${x.id}" data-inv-name="${x.id}" value="${esc((st.invites[x.id] || {}).name || '')}" style="width:180px"></div>
            <div class="field"><label class="small" for="wz-m-${x.id}">E-Mail</label><input type="text" id="wz-m-${x.id}" data-inv-mail="${x.id}" inputmode="email" value="${esc((st.invites[x.id] || {}).email || '')}" style="width:230px"></div>
          </div></div>`).join('')}</div>`;
  }

  function bildEroeffnen() {
    const v = host.vorgabe();
    const gesamt = st.rahmen === 'gesamt';
    const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const wer = gesamt ? 'Alle Ihre Lehrpersonen erhalten einen gemeinsamen Link.'
      : `Beteiligt sind ${schulhaeuser().length === 1 ? 'Ihr Schulhaus' : `alle ${schulhaeuser().length} Schulhäuser`}, jedes mit eigenem Link.`;
    return `<p class="wz-lead">${v ? `Es wird die Erhebung des AVS eröffnet: <b>${esc(v.title)}</b>.` : 'Es wird eine eigene Erhebung Ihres Schulträgers eröffnet.'} ${wer}</p>
      ${gesamt ? `<div class="wz-field"><label class="small" for="wz-gname"><b>Name für die Auswertung</b></label>
        <input type="text" id="wz-gname" value="${esc(st.gesamtName || host.traegerName())}" style="width:100%;max-width:360px">
        <p class="small muted">Erscheint über der Auswertung und auf der Startseite der Lehrpersonen.</p></div>` : ''}
      ${v ? '' : `<div class="wz-field"><label class="small" for="wz-title"><b>Titel der Erhebung</b></label><input type="text" id="wz-title" value="${esc(st.title)}" placeholder="z. B. Herbst 2026" maxlength="80" style="width:100%;max-width:360px"></div>`}
      <div class="wz-field"><label class="small" for="wz-due"><b>Ausfüllen bis</b> <span class="muted">(freiwillig)</span></label>
        <input type="date" id="wz-due" value="${esc(st.due)}" min="${heute}" style="width:200px">
        <p class="small muted">Erscheint in der E-Mail-Vorlage und auf der Startseite der Lehrpersonen. Die Erhebung schliesst nicht automatisch.</p></div>`;
  }

  const BILD = { rahmen: bildRahmen, haeuser: bildHaeuser, leitungen: bildLeitungen, eroeffnen: bildEroeffnen };

  // Kein Linkverteilen im Assistenten: Die Einrichtung ist hier abgeschlossen.
  // Die Teilnahmelinks stehen danach bei der Erhebung im Adminbereich.
  function fertig() {
    return `<p class="wz-lead">Die Erhebung ist eingerichtet${st.rahmen === 'gesamt' ? '' : ` für ${schulhaeuser().length === 1 ? 'Ihr Schulhaus' : `Ihre ${schulhaeuser().length} Schulhäuser`}`}.</p>
      <p class="wz-next"><b>Als Nächstes:</b> Im Adminbereich finden Sie bei der Erhebung die Teilnahmelinks für die Lehrpersonen, die E-Mail-Vorlagen, den QR-Code, den Rücklauf und die eigenen Fragen.</p>`;
  }

  function aktionen() {
    if (st.links) return `<button class="btn" type="button" data-fertig>Fertig</button>`;
    const k = jetzt();
    const weiter = k === 'eroeffnen' ? 'Erhebung eröffnen' : 'Weiter';
    const ueber = k === 'leitungen' && schulhaeuser().some((x) => !x.hatLeitung)
      ? `<button class="btn quiet" type="button" data-ueber>Überspringen</button>` : '';
    return `<button class="btn quiet" type="button" data-abbruch>Abbrechen</button>${ueber}
      <button class="btn" type="button" data-weiter ${st.busy || (k === 'rahmen' && !st.rahmen) ? 'disabled' : ''}>${st.busy ? 'Einen Moment …' : weiter}</button>`;
  }

  function binden() {
    const on = (sel, ev, fn) => $$(sel, dlg).forEach((el) => el.addEventListener(ev, fn));
    on('[name=wz-rahmen]', 'change', (e) => { st.rahmen = e.target.value; st.fehler = ''; draw(); });
    on('[data-nr]', 'input', (e) => { st.neue[+e.target.dataset.nr] = e.target.value; });
    on('[data-weg]', 'click', (e) => { lesen(); st.neue.splice(+e.target.dataset.weg, 1); draw(); });
    on('[data-mehr]', 'click', () => { lesen(); st.neue.push(''); draw(); const f = $$('[data-nr]', dlg); if (f.length) f[f.length - 1].focus(); });
    on('[data-inv-name]', 'input', (e) => { const id = e.target.dataset.invName; st.invites[id] = { ...(st.invites[id] || {}), name: e.target.value }; });
    on('[data-inv-mail]', 'input', (e) => { const id = e.target.dataset.invMail; st.invites[id] = { ...(st.invites[id] || {}), email: e.target.value }; });
    on('[data-copy]', 'click', (e) => copyText(location.origin + '/t/' + e.currentTarget.dataset.copy, e.currentTarget));
    on('[data-zurueck]', 'click', () => { lesen(); st.idx--; st.fehler = ''; draw(); });
    on('[data-abbruch]', 'click', () => dlg.close());
    on('[data-fertig]', 'click', () => dlg.close());
    on('[data-ueber]', 'click', () => { st.invites = {}; st.idx++; st.fehler = ''; draw(); });
    on('[data-weiter]', 'click', weiter);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') { e.preventDefault(); if (!st.busy) weiter(); }
    });
  }

  function lesen() {
    if (jetzt() === 'haeuser') $$('[data-nr]', dlg).forEach((i) => { st.neue[+i.dataset.nr] = i.value; });
    if (jetzt() === 'eroeffnen') {
      const g = $('#wz-gname', dlg); if (g) st.gesamtName = g.value;
      const d = $('#wz-due', dlg); if (d) st.due = d.value;
      const t = $('#wz-title', dlg); if (t) st.title = t.value;
    }
  }

  async function weiter() {
    lesen();
    st.fehler = '';
    const k = jetzt();
    if (k === 'rahmen') { st.idx++; return draw(); }
    if (k === 'haeuser') return haeuserAnlegen();
    if (k === 'leitungen') return einladen();
    return eroeffnen();
  }

  async function haeuserAnlegen() {
    const namen = st.neue.map((n) => (n || '').trim()).filter(Boolean);
    if (!namen.length) { st.fehler = 'Bitte mindestens ein Schulhaus eintragen.'; return draw(); }
    st.busy = true; draw();
    try {
      for (const name of namen) await api('POST', 'leitung/schools', { name });
      await host.refresh();
      st.busy = false; st.idx++; draw();
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
      st.busy = false; st.idx++; draw();
    } catch (err) { st.busy = false; st.fehler = err.message; draw(); }
  }

  async function eroeffnen() {
    const v = host.vorgabe();
    st.busy = true; draw();
    try {
      // Gesamterhebung: ein einziger Eintrag für den ganzen Schulträger
      if (st.rahmen === 'gesamt' && !schulhaeuser().length) {
        await api('POST', 'leitung/schools', { name: (st.gesamtName || host.traegerName()).trim() || host.traegerName() });
        await host.refresh();
      }
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

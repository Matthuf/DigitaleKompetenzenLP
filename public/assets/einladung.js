// Einladung annehmen bzw. neues Passwort festlegen (einmaliger Link).
(function () {
  'use strict';
  const { $, esc, date, api } = UI;
  const m = location.pathname.match(/^\/einladung\/([^/]+)/);
  const token = m ? decodeURIComponent(m[1]) : '';
  const box = $('#inv-box');

  function error(title, text) {
    box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <p class="small muted">Einen neuen Link erhalten Sie beim Rektorat bzw. bei der Hauptschulleitung Ihres Schulträgers. Rektorate und Hauptschulleitungen wenden sich an das Amt für Volksschulen und Sport, <a href="mailto:avs@sz.ch">avs@sz.ch</a>.</p>
      <div><a class="btn secondary" href="/leitung">Zur Anmeldung</a></div>`;
  }

  async function init() {
    let inv;
    try { inv = await api('GET', 'invite/' + encodeURIComponent(token)); }
    catch (e) { return error(e.status === 410 ? 'Link nicht mehr gültig' : 'Link ungültig', e.message); }
    const reset = inv.kind === 'reset';
    box.innerHTML = `
      <div class="stack" style="gap:6px"><div class="eyebrow">${reset ? 'Neues Passwort' : 'Einladung'}</div>
        <h2>${reset ? 'Neues Passwort festlegen' : 'Zugang einrichten'}</h2></div>
      ${reset
        ? `<p>Für den Zugang <b>${esc(inv.username)}</b>${inv.school ? ' · ' + esc(inv.school) : inv.traeger ? ' · ' + esc(inv.traeger) : ''}.</p>`
        : `<p>Sie wurden eingeladen als <b>${esc(inv.roleText)}</b>. ${inv.role === 'traeger'
          ? 'Damit eröffnen Sie Erhebungen für alle Schulhäuser Ihres Schulträgers, sehen deren Auswertung und verwalten Schulhäuser und Zugänge.'
          : 'Damit verteilen Sie den Link Ihres Schulhauses, sehen dessen Rücklauf und Auswertung und können eigene Erhebungen eröffnen.'}</p>`}
      <form class="stack" id="inv-form">
        ${reset ? '' : `<div class="field"><label for="inv-user">Benutzername</label><input type="text" id="inv-user" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(inv.suggestedUsername || '')}">
          <p class="small muted">3 bis 40 Zeichen, Kleinbuchstaben, Ziffern, Punkt oder Bindestrich.</p></div>
          <div class="field"><label for="inv-name">Name <span class="small muted">(freiwillig)</span></label><input type="text" id="inv-name" autocomplete="name" value="${esc(inv.name || '')}"></div>`}
        <div class="field"><label for="inv-pw">Passwort</label><input type="password" id="inv-pw" autocomplete="new-password"><p class="small muted">Mindestens 10 Zeichen.</p></div>
        <div class="field"><label for="inv-pw2">Passwort wiederholen</label><input type="password" id="inv-pw2" autocomplete="new-password"></div>
        <button class="btn" type="submit">${reset ? 'Passwort speichern und anmelden' : 'Zugang einrichten und anmelden'}</button>
        <p class="error small" id="inv-msg" role="alert"></p>
        <p class="small muted">Der Link gilt bis ${inv.kind === 'reset' ? new Date(inv.expires_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) + ' Uhr' : date(inv.expires_at)} und nur einmal.</p>
      </form>`;
    $('#inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#inv-msg');
      msg.textContent = '';
      if ($('#inv-pw').value !== $('#inv-pw2').value) { msg.textContent = 'Die beiden Passwörter stimmen nicht überein.'; return; }
      try {
        await api('POST', 'invite/' + encodeURIComponent(token), {
          password: $('#inv-pw').value,
          username: reset ? undefined : $('#inv-user').value,
          display_name: reset ? undefined : $('#inv-name').value,
        });
        location.href = '/leitung';
      } catch (err) { msg.textContent = err.message; }
    });
  }
  init();
})();

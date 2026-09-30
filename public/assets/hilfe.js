// Hilfe: Löschen der eigenen Daten. Der Knopf erscheint nur, wenn diese Person mit ihrem Code angemeldet ist.
(function () {
  'use strict';
  const box = document.getElementById('help-delete');
  if (!box) return;
  const note = (t) => { box.innerHTML = '<p class="small muted"></p>'; box.firstChild.textContent = t; };
  fetch('/api/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      if (!me) { note('Zum Löschen zuerst über den Link der Schulleitung mit dem persönlichen Code anmelden.'); return; }
      box.innerHTML = '<button class="btn danger" type="button">Meine Daten löschen</button>';
      box.firstChild.addEventListener('click', () => {
        box.innerHTML = '<span class="small"><b>Alle Teilnahmen zu diesem Code endgültig löschen?</b></span>'
          + ' <button class="btn danger" type="button" data-a="yes">Ja, endgültig löschen</button>'
          + ' <button class="btn quiet" type="button" data-a="no">Abbrechen</button>';
        box.querySelector('[data-a=no]').addEventListener('click', () => location.reload());
        box.querySelector('[data-a=yes]').addEventListener('click', async () => {
          try {
            const r = await fetch('/api/me', { method: 'DELETE', credentials: 'same-origin' });
            if (!r.ok) throw new Error();
            location.href = '/';
          } catch { note('Das Löschen hat nicht geklappt. Bitte später nochmals versuchen.'); }
        });
      });
    })
    .catch(() => note('Zum Löschen zuerst mit dem persönlichen Code anmelden.'));
})();

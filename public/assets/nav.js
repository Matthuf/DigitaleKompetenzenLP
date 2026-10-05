// Hauptnavigation für alle Seiten der Serverversion (höchstens 7 Punkte gemäss Webguide).
(function () {
  'use strict';
  const el = document.getElementById('mainnav');
  if (!el) return;
  // Angemeldete Rektorate, Schulleitungen und AVS sehen diese Leiste nicht (staff.js blendet sie aus)
  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  // Im Bereich der Lehrpersonen (Teilnahme, eigenes Profil) gehört der Adminbereich nicht hin
  const teacherArea = path === '/mein-profil' || path.startsWith('/t/');

  /* Erhebungslink für die laufende Browsersitzung merken (sessionStorage, nicht dauerhaft: auf geteilten
   * Geräten soll die nächste Person nicht die Erhebung der vorherigen sehen). Für Lehrpersonen ist die
   * Linkseite der Start; ohne Merken führte «Start» auf die allgemeine Startseite, und der Weg zurück
   * zur Linkseite fehlte (vor dem Start gibt es noch keinen Code). */
  const KEY = 'digkomp-erhebungslink';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ohne Speicher weiter */ } };
  if (path.startsWith('/t/')) { const old = read(); write({ path, title: old && old.path === path ? old.title : '' }); }
  window.DigLink = { remember: (title) => { const v = read(); if (v && v.path === path) write({ ...v, title: String(title || '') }); } };
  const link = read();

  const start = teacherArea && link ? link.path : '/';
  const items = [[start, 'Start'], ['/mein-profil', 'Meine Selbsteinschätzung'],
    ...(teacherArea ? [] : [['/leitung', 'Adminbereich Schule']]), ['/hilfe', 'Hilfe']];
  const active = (h, label) => (label === 'Start' ? path === '/' || path === '/index' || path.startsWith('/t/') : path === h || path.startsWith(h + '/'));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  el.innerHTML = items.map(([h, l]) => `<a href="${esc(h)}"${active(h, l) ? ' aria-current="page"' : ''}>${l}</a>`).join('');

  // Weg zurück auf der allgemeinen Startseite und bei «Meine Selbsteinschätzung» ohne Anmeldung
  if (!link || path.startsWith('/t/')) return;
  const target = path === '/' || path === '/index' ? document.getElementById('main')
    : path === '/mein-profil' ? document.querySelector('#v-home > .stack') : null;
  if (!target) return;
  const box = document.createElement('div');
  box.className = 'box back-link';
  box.innerHTML = `<p>Sie haben die Selbsteinschätzung${link.title ? ` «${esc(link.title)}»` : ''} geöffnet.</p>
    <a class="btn" href="${esc(link.path)}">Zurück zur Selbsteinschätzung</a>`;
  if (target.id === 'main') target.prepend(box); else target.firstElementChild.after(box);
})();

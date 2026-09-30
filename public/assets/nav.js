// Hauptnavigation für alle Seiten der Serverversion (höchstens 7 Punkte gemäss Webguide).
(function () {
  'use strict';
  const el = document.getElementById('mainnav');
  if (!el) return;
  // Angemeldete Rektorate, Schulleitungen und AVS sehen diese Leiste nicht (staff.js blendet sie aus)
  const items = [['/', 'Start'], ['/mein-profil', 'Meine Selbsteinschätzung'], ['/leitung', 'Für Schulen'], ['/hilfe', 'Hilfe']];
  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  // Teilnahme über Erhebungslink gehört zum Bereich «Meine Selbsteinschätzung»
  const active = (h) => (h === '/' ? path === '/' || path === '/index' : path === h || path.startsWith(h + '/') || (h === '/mein-profil' && path.startsWith('/t/')));
  el.innerHTML = items.map(([h, l]) => `<a href="${h}"${active(h) ? ' aria-current="page"' : ''}>${l}</a>`).join('');
})();

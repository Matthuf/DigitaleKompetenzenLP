// Hauptnavigation für alle Seiten der Serverversion (höchstens 7 Punkte gemäss Webguide).
(function () {
  'use strict';
  const el = document.getElementById('mainnav');
  if (!el) return;
  const items = [['/', 'Start'], ['/mein-profil', 'Mein Profil'], ['/leitung', 'Für Schulleitungen'], ['/hilfe', 'Hilfe']];
  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  // Teilnahme über Erhebungslink gehört zum Bereich «Mein Profil»
  const active = (h) => (h === '/' ? path === '/' || path === '/index' : path === h || path.startsWith(h + '/') || (h === '/mein-profil' && path.startsWith('/t/')));
  el.innerHTML = items.map(([h, l]) => `<a href="${h}"${active(h) ? ' aria-current="page"' : ''}>${l}</a>`).join('');
})();

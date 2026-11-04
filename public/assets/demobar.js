// Hinweisbalken im Demo-Zugang (nur sichtbar, wenn DEMO_ZUGANG=1 aktiv ist)
(function () {
  'use strict';
  fetch('/api/demo/status').then((r) => r.json()).then((s) => {
    if (!s || !s.enabled || !s.traeger) return;
    const bar = document.createElement('div');
    bar.className = 'demobar no-print';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Demo-Zugang');
    bar.innerHTML = '<div class="wrap"><b>Demo-Zugang · keine echten Daten</b> <a href="/demo">Rolle wechseln</a></div>';
    document.body.prepend(bar);
  }).catch(() => { /* ohne Demo nichts anzeigen */ });
})();

// Anmeldung und Passwortwechsel für Schulleitungen und AVS (gemeinsam genutzt).
window.Staff = (function () {
  'use strict';
  const { $, $$, api } = UI;
  let onReady = null, role = null, user = null, started = false;

  function show(id) {
    $$('main > .view').forEach((v) => { v.hidden = v.id !== id; });
    $('#userbar').hidden = !user;
  }

  async function start(requiredRole, ready) {
    role = requiredRole; onReady = ready;
    try { user = await api('GET', 'auth/me'); } catch { user = null; }
    route();
  }
  function route() {
    if (!user) return show('v-login');
    if (![].concat(role).includes(user.role)) {
      user = null;
      $('#login-msg').textContent = role === 'admin' ? 'Dieses Konto hat keinen Zugang zur AVS-Verwaltung.' : 'Dieses Konto ist kein Konto für Rektorat oder Schulleitung. Die AVS-Verwaltung ist unter /admin erreichbar.';
      return show('v-login');
    }
    $('#user-name').textContent = (user.display_name || user.username) + (user.role === 'traeger' ? ' · Rektorat ' + (user.traeger_name || '') : user.school_name ? ' · Schulleitung ' + user.school_name : '');
    if (user.must_change_password) {
      $('#pw-intro').textContent = 'Beim ersten Anmelden bitte ein eigenes Passwort festlegen. Mindestens 10 Zeichen.';
      $('#btn-pw-cancel').hidden = true;
      return show('v-password');
    }
    show('v-dash');
    if (!started) { started = true; onReady(user); }
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-msg').textContent = '';
    try {
      await api('POST', 'auth/login', { username: $('#login-user').value, password: $('#login-pw').value });
      $('#login-pw').value = '';
      user = await api('GET', 'auth/me');
      route();
    } catch (err) { $('#login-msg').textContent = err.message; }
  });
  $('#btn-logout').addEventListener('click', async () => { await api('POST', 'auth/logout'); location.reload(); });
  $('#btn-pw-open').addEventListener('click', () => { $('#btn-pw-cancel').hidden = false; $('#pw-intro').textContent = 'Mindestens 10 Zeichen.'; show('v-password'); });
  $('#btn-pw-cancel').addEventListener('click', () => show('v-dash'));
  $('#form-pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#pw-msg');
    msg.textContent = '';
    if ($('#pw-new').value !== $('#pw-new2').value) { msg.textContent = 'Die beiden neuen Passwörter stimmen nicht überein.'; return; }
    try {
      await api('POST', 'auth/password', { old: $('#pw-old').value, new: $('#pw-new').value });
      ['#pw-old', '#pw-new', '#pw-new2'].forEach((s) => { $(s).value = ''; });
      user = await api('GET', 'auth/me');
      route();
    } catch (err) { msg.textContent = err.message; }
  });

  return { start };
})();

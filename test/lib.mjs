// Gemeinsame Hilfen für die Server-Tests: lokaler Server mit frischer In-Memory-Datenbank, einfacher HTTP-Client.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ADMIN = { username: 'avs', start: 'avs-start-passwort-2026', password: 'avs-test-passwort-2026' };

let port = 3600 + Math.floor(Math.random() * 300);
export async function startServer(env = {}) {
  const p = port++;
  const child = spawn(process.execPath, ['dev-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(p), ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.start, DATABASE_URL: '', POSTGRES_URL: '', PGLITE_DIR: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const B = `http://localhost:${p}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error('Server beendet:\n' + log);
    try { await fetch(B + '/api/auth/me'); return { B, stop: () => child.kill(), log: () => log }; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  child.kill();
  throw new Error('Server startet nicht:\n' + log);
}

// Client mit eigenem Cookie-Speicher (eine «Person» pro Client)
export function client(B) {
  const jar = {};
  return async (method, path, body) => {
    const r = await fetch(B + '/api/' + path, {
      method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    (r.headers.getSetCookie?.() || []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
    const d = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(path + ' ' + r.status + ' ' + JSON.stringify(d)); e.status = r.status; throw e; }
    return d;
  };
}

export function checker(name) {
  const res = { name, pass: 0, fail: 0 };
  const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FEHLER ') + msg); cond ? res.pass++ : res.fail++; };
  const expectErr = async (p, status, msg) => {
    try { await p; ok(false, msg + ' (kein Fehler erhalten)'); } catch (e) { ok(e.status === status, `${msg} → ${e.status}${e.status === status ? '' : ' statt ' + status}`); }
  };
  return { ok, expectErr, res };
}

// AVS-Konto: Beim ersten Anmelden muss das Startpasswort ersetzt werden
export async function adminClient(B) {
  const ad = client(B);
  await ad('POST', 'auth/login', { username: ADMIN.username, password: ADMIN.start });
  await ad('POST', 'auth/password', { old: ADMIN.start, new: ADMIN.password });
  return ad;
}
// Zugang über Einladung anlegen (ohne Schule = Schulträger, mit Schule = Schulleitung)
export async function invitedClient(B, ad, traegerId, username, schoolId) {
  const inv = await ad('POST', `admin/traeger/${traegerId}/invitations`, { name: username, email: username + '@example.ch', schoolId });
  const c = client(B);
  await c('POST', 'invite/' + inv.token, { username, password: 'passwort-test-123' });
  return c;
}

// Lehrperson: Teilnahme starten, alle Fragen beantworten, abschliessen
import { readFileSync } from 'node:fs';
const ITEMS = JSON.parse(readFileSync(new URL('../lib/items.json', import.meta.url), 'utf8'));
export const SUBS = ITEMS.areas.flatMap((a) => a.subareas.map((s) => ({ ...s, area: a.id })));
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export async function teacher(B, token, { shift = 0, context = {}, custom = null } = {}) {
  const t = client(B);
  const { responseId, code } = await t('POST', 'c/' + token + '/start', { context });
  const answers = {};
  SUBS.forEach((s) => {
    const base = 2.6 + shift + (s.area === '1' ? 0.7 : s.area === '4' ? -0.8 : 0) + (rnd() - 0.5) * 2.2;
    answers[s.id] = Math.max(1, Math.min(6, Math.round(base)));
  });
  await t('PUT', 'me/responses/' + responseId, { answers, context, custom_answers: custom || {} });
  await t('POST', 'me/responses/' + responseId + '/submit');
  return { t, code, responseId };
}

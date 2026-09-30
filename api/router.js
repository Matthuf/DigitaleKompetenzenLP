// Einzige Serverfunktion: alle /api/*-Aufrufe werden per vercel.json hierher umgeleitet.
import { createRequire } from 'node:module';
import { q, one, newId } from '../lib/db.js';
import {
  hashPassword, verifyPassword, setSession, clearSession, getSession, COOKIE_STAFF, COOKIE_PART,
  newCode, hashCode, newToken, encryptCode, decryptCode, formatCode, newInviteToken, hashInviteToken,
  dummyVerify, checkSecrets, MAX_PASSWORD,
} from '../lib/auth.js';
import { validateBlock, cleanCustomAnswers, aggregateCustom } from '../lib/customblock.js';

const require = createRequire(import.meta.url);
const DKCore = require('../lib/core.cjs');
const ITEMS = require('../lib/items.json');
const SUB_IDS = new Set(DKCore.allSubareas(ITEMS).map((s) => s.id));
// Mindestgruppe für Auswertungen. Standard (auch wenn nichts gesetzt ist): 5. Kleinere Werte nur im ausdrücklich
// eingeschalteten Testmodus (TESTMODUS=1), dort ab 1. Ohne Testmodus wird ein Wert unter 5 ignoriert.
const TEST_MODE = process.env.TESTMODUS === '1';
const MIN = (() => {
  const v = parseInt(process.env.MIN_GROUP_SIZE || '', 10);
  return TEST_MODE ? Math.max(1, Number.isInteger(v) ? v : 1) : Math.max(5, Number.isInteger(v) ? v : 5);
})();
checkSecrets(); // ohne SESSION_SECRET startet die Funktion nicht

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

/* ---------- Hilfen ---------- */
// Mitarbeitende: Konto, Rolle und Sitzungsversion bei jeder Anfrage aus der Datenbank prüfen.
// Gelöschte Konten, geänderte Rollen und Passwortwechsel beenden bestehende Sitzungen sofort.
// Solange ein Passwortwechsel verlangt ist, sind nur auth/me und auth/password erlaubt.
async function staff(req, role, { allowPwChange = false } = {}) {
  const s = getSession(req, COOKIE_STAFF);
  if (!s || !s.uid) fail(401, 'Bitte anmelden.');
  const u = await one(`select u.id, u.role, u.school_id, coalesce(u.traeger_id, sc.traeger_id) as traeger_id, u.must_change_password, u.session_version
                         from users u left join schools sc on sc.id = u.school_id where u.id = $1`, [s.uid]);
  if (!u || (u.session_version || 0) !== (s.sv || 0)) fail(401, 'Die Sitzung ist abgelaufen. Bitte neu anmelden.');
  if (u.must_change_password && !allowPwChange) fail(403, 'Bitte zuerst ein eigenes Passwort festlegen.');
  const roles = [].concat(role || []);
  if (roles.length && !roles.includes(u.role)) fail(403, 'Für diese Funktion fehlt die Berechtigung.');
  return { uid: u.id, role: u.role, sid: u.school_id, tid: u.traeger_id, sv: u.session_version || 0 };
}
// Rektorat (traeger) oder Schulleitung (leitung): Rolle, Träger und Schule immer frisch aus der Datenbank
async function lead(req) {
  const u = await staff(req, ['traeger', 'leitung']);
  if (!u.tid) fail(401, 'Bitte anmelden.');
  return { uid: u.uid, role: u.role, tid: u.tid, sid: u.role === 'leitung' ? u.sid : null };
}
const staffCookie = (res, u) => setSession(res, COOKIE_STAFF, { uid: u.id, role: u.role, sid: u.school_id || null, sv: u.session_version || 0 }, 8);

/* Missbrauchsschutz: einfache Zähler pro Schlüssel und Zeitfenster in der Datenbank */
function clientIp(req) {
  const h = req.headers || {};
  const v = h['x-vercel-forwarded-for'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0];
  return String(v || (req.socket && req.socket.remoteAddress) || 'unbekannt').trim().slice(0, 64);
}
async function limit(key, max, seconds, msg) {
  const r = await one(`insert into rate_limits (key, window_start, count) values ($1, now(), 1)
                       on conflict (key) do update set
                         count = case when rate_limits.window_start < now() - ($2 || ' seconds')::interval then 1 else rate_limits.count + 1 end,
                         window_start = case when rate_limits.window_start < now() - ($2 || ' seconds')::interval then now() else rate_limits.window_start end
                       returning count`, [String(key).slice(0, 200), String(seconds)]);
  if (Math.random() < 0.02) await q(`delete from rate_limits where window_start < now() - interval '2 days'`);
  if (r.count > max) fail(429, msg || 'Zu viele Anfragen in kurzer Zeit. Bitte etwas später nochmals versuchen.');
}
const TOO_MANY_LOGINS = 'Zu viele Anmeldeversuche. Bitte in 15 Minuten nochmals versuchen.';

/* Protokoll: wer hat wann was geändert oder eingesehen (ohne Passwörter, Codes, Tokens oder Antworten) */
async function audit(actor, action, target = null, detail = null) {
  try {
    await q(`insert into audit_log (actor_id, actor_role, action, target, detail) values ($1,$2,$3,$4,$5)`,
      [actor ? actor.uid : null, actor ? actor.role : null, action, target ? String(target).slice(0, 200) : null, detail ? JSON.stringify(detail) : null]);
  } catch (e) { console.error('Protokoll:', e.message); }
}
function participant(req) {
  const s = getSession(req, COOKIE_PART);
  if (!s) fail(401, 'Bitte mit dem persönlichen Code anmelden.');
  return s;
}
// Zyklen: pro Schulhaus festgelegt; ohne Angabe gilt der Standard der Trägerstufe.
const ALL_ZYKLEN = ['Zyklus 1', 'Zyklus 2', 'Zyklus 3'];
const DEFAULT_ZYKLEN = { primar: ['Zyklus 1', 'Zyklus 2'], sek: ['Zyklus 3'], gesamt: ['Zyklus 1', 'Zyklus 2', 'Zyklus 3'] };
const KINDS = ['primar', 'sek', 'gesamt'];
function schoolZyklen(zyklen, kind) {
  const z = Array.isArray(zyklen) ? ALL_ZYKLEN.filter((x) => zyklen.includes(x)) : [];
  return z.length ? z : (DEFAULT_ZYKLEN[kind] || DEFAULT_ZYKLEN.primar);
}
// Auswahl für Lehrpersonen: ein Zyklus = fest; mehrere = Wahl inkl. «zyklusübergreifend»
const zyklusChoices = (z) => (z.length > 1 ? [...z, 'Zyklusübergreifend'] : z);
// Nur vorgegebene Werte speichern (keine freien Texte in den Kontextangaben)
const CONTEXT_VALUES = {
  funktion: ['Klassenlehrperson', 'Fachlehrperson', 'Schulische Heilpädagogin / Schulischer Heilpädagoge', 'Lehrperson Deutsch als Zweitsprache', 'Andere Funktion'],
  erfahrung: ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'],
};
function cleanContext(c, zyklen) {
  const out = {};
  Object.entries(CONTEXT_VALUES).forEach(([k, allowed]) => {
    if (c && allowed.includes(c[k])) out[k] = c[k];
  });
  const z = Array.isArray(zyklen) && zyklen.length ? zyklen : DEFAULT_ZYKLEN.primar;
  if (z.length === 1) out.zyklus = z[0];
  else if (c && zyklusChoices(z).includes(c.zyklus)) out.zyklus = c.zyklus;
  return out;
}
const parseKind = (k) => (KINDS.includes(k) ? k : 'primar');
// Zieldatum als Text JJJJ-MM-TT (kein Datumsobjekt: sonst verschiebt die Zeitzone den Tag)
function cleanDue(v) {
  if (v === null || v === '' || v === undefined) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 2020 || +m[1] > 2100) fail(400, 'Bitte ein gültiges Datum wählen.');
  return String(v);
}
function cleanAnswers(a) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const [k, v] of Object.entries(a)) {
    if (SUB_IDS.has(k) && Number.isInteger(v) && v >= 0 && v <= 6) out[k] = v;
  }
  return out;
}
async function campaignByToken(token, req = null) {
  const c = await one(
    `select c.id, c.title, c.status, c.custom_block, c.traeger_id, to_char(c.due_date, 'YYYY-MM-DD') as due_date, l.id as link_id, l.school_id,
            s.name as school_name, s.zyklen as school_zyklen, t.name as traeger_name, t.kind
       from campaign_links l join campaigns c on c.id = l.campaign_id
       join schools s on s.id = l.school_id join traeger t on t.id = c.traeger_id
      where l.token = $1`, [String(token || '')]);
  if (!c) {
    // Ungültige Links zählen: Durchprobieren von Links wird gebremst
    if (req) await limit('badlink:' + clientIp(req), 30, 600);
    fail(404, 'Dieser Link ist ungültig. Bitte den Link der Schulleitung prüfen.');
  }
  c.zyklen = schoolZyklen(c.school_zyklen, c.kind);
  return c;
}
async function participantTraeger(p) {
  if (p.tid) return p.tid;
  const r = await one(`select traeger_id from participants where id = $1`, [p.pid]);
  return r && r.traeger_id;
}
async function myResponses(pid) {
  return q(`select r.id, r.campaign_id, r.status, r.context, r.answers, r.custom_answers, r.created_at, r.updated_at, r.submitted_at,
                   c.title as campaign_title, c.status as campaign_status, l.token as campaign_token, c.custom_block,
                   to_char(c.due_date, 'YYYY-MM-DD') as due_date,
                   t.kind as traeger_kind, s.name as school_name, s.zyklen as school_zyklen
              from responses r join campaigns c on c.id = r.campaign_id
              left join campaign_links l on l.id = r.link_id
              left join traeger t on t.id = c.traeger_id
              left join schools s on s.id = r.school_id
             where r.participant_id = $1 order by r.created_at asc`, [pid]).then((rows) =>
    rows.map(({ school_zyklen, ...r }) => ({ ...r, zyklen: zyklusChoices(schoolZyklen(school_zyklen, r.traeger_kind)) })));
}
async function ensureResponse(p, campaign, context) {
  let r = await one(`select id from responses where participant_id = $1 and campaign_id = $2`, [p.pid, campaign.id]);
  if (!r) {
    if (campaign.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
    // Kontextangaben aus der letzten Teilnahme übernehmen
    const prev = await one(`select context from responses where participant_id = $1 order by created_at desc limit 1`, [p.pid]);
    r = { id: newId() };
    await q(`insert into responses (id, participant_id, campaign_id, instrument_version, context, school_id, link_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, p.pid, campaign.id, ITEMS.version, JSON.stringify(cleanContext(context || (prev && prev.context) || {}, campaign.zyklen)), campaign.school_id, campaign.link_id]);
  }
  return r.id;
}

/* ---------- Auswertung: gemeinsame Bausteine ---------- */
// Gruppenvergleich (Zyklen, Schulen …): nur wenn es mindestens zwei benannte Gruppen gibt und JEDE Gruppe
// (auch «ohne Angabe») die Mindestgrösse erreicht. Sonst liesse sich eine kleine Gruppe aus der Differenz berechnen.
function compareGroups(recs, keyFn, labelFn = (k) => k, sortFn = (a, b) => a.localeCompare(b)) {
  const groups = {};
  recs.forEach((r) => { const k = keyFn(r) || ''; (groups[k] = groups[k] || []).push(r); });
  const named = Object.keys(groups).filter((k) => k);
  if (named.length < 2) return null;
  if (!Object.values(groups).every((g) => g.length >= MIN)) return { hidden: true };
  return named.sort(sortFn).map((k) => {
    const g = DKCore.aggregate(ITEMS, groups[k].map((r) => ({ answers: r.answers })));
    return { key: k, label: labelFn(k), n: groups[k].length, areas: g.areas.map((a) => a.mean) };
  });
}
const zyk = (r) => (r.context && r.context.zyklus) || '';
// Filterauswahl (z. B. Zyklus, Schule): nur anbieten, wenn jede Gruppe inkl. «ohne Angabe» die Mindestgrösse erreicht.
// Sonst liesse sich eine kleine Gruppe als Differenz zwischen Gesamtwert und den übrigen Gruppen berechnen.
function filterOptions(recs, keyFn) {
  const counts = {};
  recs.forEach((r) => { const k = keyFn(r) || ''; counts[k] = (counts[k] || 0) + 1; });
  const named = Object.keys(counts).filter((k) => k);
  if (named.length < 2 || !Object.values(counts).every((n) => n >= MIN)) return [];
  return named.sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, n: counts[k] }));
}

// Sitzung der Lehrperson: ohne «angemeldet bleiben» bis zum Schliessen des Browsers (max. 12 h), sonst 90 Tage
function partSession(res, payload, remember) {
  if (remember) setSession(res, COOKIE_PART, { ...payload, r: 1 }, 24 * 90, true);
  else setSession(res, COOKIE_PART, payload, 12);
}

/* ---------- Routen ---------- */
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

// Öffentlich: Erhebung über Link
on('GET', 'c/:token', async ({ req, params }) => {
  const c = await campaignByToken(params.token, req);
  return { campaign: { title: c.title, status: c.status, due_date: c.due_date }, school: { name: c.school_name, zyklen: zyklusChoices(c.zyklen) }, traeger: { name: c.traeger_name, kind: c.kind } };
});

// Lehrperson: erstmals teilnehmen → Code erzeugen
on('POST', 'c/:token/start', async ({ req, params, body, res }) => {
  const c = await campaignByToken(params.token, req);
  if (c.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
  // Grosszügig, weil ein ganzes Kollegium über dieselbe Schul-IP teilnehmen kann. Bremst nur automatisierte Massenanmeldungen.
  await limit('start:' + c.link_id + ':' + clientIp(req), 80, 600, 'Über diesen Link wurden in kurzer Zeit sehr viele Teilnahmen gestartet. Bitte in einigen Minuten nochmals versuchen.');
  await limit('start:' + c.link_id, 400, 86400, 'Über diesen Link wurden heute ungewöhnlich viele Teilnahmen gestartet. Bitte die Schulleitung informieren.');
  const code = newCode();
  const pid = newId();
  await q(`insert into participants (id, school_id, traeger_id, code_hash, code_enc) values ($1,$2,$3,$4,$5)`, [pid, c.school_id, c.traeger_id, hashCode(code), encryptCode(code)]);
  partSession(res, { pid, sid: c.school_id, tid: c.traeger_id }, body.remember);
  const rid = await ensureResponse({ pid }, c, body.context);
  return { code, responseId: rid };
});

// Lehrperson: mit Code anmelden (optional im Kontext einer Erhebung). Der Code gilt innerhalb des ganzen Schulträgers.
on('POST', 'code-login', async ({ req, body, res }) => {
  await limit('code:' + clientIp(req), 20, 900, 'Zu viele Versuche mit Codes. Bitte in 15 Minuten nochmals versuchen.');
  const p = await one(`select p.id, p.school_id, coalesce(p.traeger_id, s.traeger_id) as traeger_id, p.code_enc
                         from participants p left join schools s on s.id = p.school_id where p.code_hash = $1`, [hashCode(body.code)]);
  if (!p) fail(404, 'Dieser Code ist nicht bekannt. Bitte die Schreibweise prüfen.');
  if (!p.code_enc) await q(`update participants set code_enc = $1 where id = $2`, [encryptCode(formatCode(body.code)), p.id]);
  if (body.token) {
    const c = await campaignByToken(body.token, req);
    if (c.traeger_id !== p.traeger_id) fail(403, 'Dieser Code gehört zu einem anderen Schulträger.');
  }
  partSession(res, { pid: p.id, sid: p.school_id, tid: p.traeger_id }, body.remember);
  return { ok: true };
});

// Eigenen Code anzeigen (nur angemeldet)
on('GET', 'me/code', async ({ req }) => {
  const p = participant(req);
  const r = await one(`select code_enc from participants where id = $1`, [p.pid]);
  const code = r && r.code_enc ? decryptCode(r.code_enc) : null;
  if (!code) fail(404, 'Der Code kann für diese Teilnahme nicht angezeigt werden.');
  return { code };
});

on('GET', 'me', async ({ req }) => {
  const p = participant(req);
  const school = await one(`select name from schools where id = $1`, [p.sid]);
  if (!school) fail(401, 'Bitte mit dem persönlichen Code anmelden.');
  return { school: { id: p.sid, name: school.name }, responses: await myResponses(p.pid) };
});

// Teilnahme an einer Erhebung öffnen oder anlegen
on('POST', 'me/responses', async ({ req, body }) => {
  const p = participant(req);
  const c = await campaignByToken(body.token);
  if (c.traeger_id !== (await participantTraeger(p))) fail(403, 'Dieser Code gehört zu einem anderen Schulträger.');
  return { responseId: await ensureResponse(p, c, body.context) };
});

on('PUT', 'me/responses/:id', async ({ req, params, body }) => {
  const p = participant(req);
  const r = await one(`select r.id, c.status as cstatus, c.custom_block, t.kind, s.zyklen from responses r join campaigns c on c.id = r.campaign_id
                         left join traeger t on t.id = c.traeger_id left join schools s on s.id = r.school_id where r.id = $1 and r.participant_id = $2`, [params.id, p.pid]);
  if (!r) fail(404, 'Teilnahme nicht gefunden.');
  if (r.cstatus !== 'open') fail(409, 'Die Erhebung ist abgeschlossen. Antworten lassen sich nicht mehr ändern.');
  const answers = cleanAnswers(body.answers);
  const custom = cleanCustomAnswers(r.custom_block, body.custom_answers);
  await q(`update responses set answers = $1, context = $2, custom_answers = $3, updated_at = now() where id = $4`,
    [JSON.stringify(answers), JSON.stringify(cleanContext(body.context, schoolZyklen(r.zyklen, r.kind))), JSON.stringify(custom), r.id]);
  return { ok: true, saved: new Date().toISOString() };
});

on('POST', 'me/responses/:id/submit', async ({ req, params }) => {
  const p = participant(req);
  const r = await one(`select r.id, r.answers, c.status as cstatus from responses r join campaigns c on c.id = r.campaign_id where r.id = $1 and r.participant_id = $2`, [params.id, p.pid]);
  if (!r) fail(404, 'Teilnahme nicht gefunden.');
  if (r.cstatus !== 'open') fail(409, 'Die Erhebung ist abgeschlossen.');
  const prog = DKCore.progress(ITEMS, r.answers);
  if (prog.open.length) fail(422, `Noch offen: ${prog.open.join(', ')}. Bitte alle Fragen beantworten.`);
  await q(`update responses set status = 'submitted', submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = $1`, [r.id]);
  return { ok: true };
});

on('POST', 'me/logout', async ({ res }) => { clearSession(res, COOKIE_PART); return { ok: true }; });

// Recht auf Löschung: alle eigenen Daten entfernen
on('DELETE', 'me', async ({ req, res }) => {
  const p = participant(req);
  await q(`delete from participants where id = $1`, [p.pid]);
  clearSession(res, COOKIE_PART);
  return { ok: true };
});

// Mitarbeitende: Anmeldung
on('POST', 'auth/login', async ({ req, body, res }) => {
  const username = String(body.username || '').trim().toLowerCase().slice(0, 80);
  const password = String(body.password || '');
  await limit('login-ip:' + clientIp(req), 30, 900, TOO_MANY_LOGINS);
  await limit('login-user:' + username, 10, 900, TOO_MANY_LOGINS);
  const u = await one(`select u.* from users u where u.username = $1`, [username]);
  // Gleiche Rechenzeit, ob das Konto existiert oder nicht
  const ok = u ? await verifyPassword(password, u.password_hash) : await dummyVerify(password);
  if (!ok) {
    await audit(u ? { uid: u.id, role: u.role } : null, 'anmeldung_fehlgeschlagen', username);
    fail(401, 'Benutzername oder Passwort ist falsch.');
  }
  await q(`update users set last_login = now() where id = $1`, [u.id]);
  staffCookie(res, u);
  await audit({ uid: u.id, role: u.role }, 'anmeldung', u.username);
  return { role: u.role, mustChangePassword: u.must_change_password };
});
on('POST', 'auth/logout', async ({ res }) => { clearSession(res, COOKIE_STAFF); return { ok: true }; });
on('GET', 'auth/me', async ({ req }) => {
  const s = await staff(req, null, { allowPwChange: true });
  const u = await one(`select u.username, u.display_name, u.role, u.must_change_password, s.name as school_name, t.name as traeger_name, t.kind as traeger_kind
                         from users u left join schools s on s.id = u.school_id left join traeger t on t.id = coalesce(u.traeger_id, s.traeger_id) where u.id = $1`, [s.uid]);
  if (!u) fail(401, 'Bitte anmelden.');
  return u;
});
const checkNewPassword = (pw) => {
  if (pw.length < 10) fail(400, 'Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (pw.length > MAX_PASSWORD) fail(400, `Das Passwort darf höchstens ${MAX_PASSWORD} Zeichen lang sein.`);
};
on('POST', 'auth/password', async ({ req, body, res }) => {
  const s = await staff(req, null, { allowPwChange: true });
  await limit('pw:' + s.uid, 10, 900, TOO_MANY_LOGINS);
  const u = await one(`select password_hash from users where id = $1`, [s.uid]);
  if (!(await verifyPassword(String(body.old || ''), u.password_hash))) fail(400, 'Das bisherige Passwort ist falsch.');
  const pw = String(body.new || '');
  checkNewPassword(pw);
  // Neue Sitzungsversion: andere offene Sitzungen dieses Kontos werden beendet, diese bleibt angemeldet
  const nu = await one(`update users set password_hash = $1, must_change_password = false, session_version = session_version + 1 where id = $2
                        returning id, role, school_id, session_version`, [await hashPassword(pw), s.uid]);
  staffCookie(res, nu);
  await audit(s, 'passwort_geaendert');
  return { ok: true };
});

/* ---------- Rektorat und Schulleitungen ---------- */
// Rektorat: alle Schulen des Trägers. Schulleitung: nur Erhebungen mit einem Link für die eigene Schule.
async function visibleCampaign(u, id) {
  const c = await one(`select c.*, r.title as round_title from campaigns c left join rounds r on r.id = c.round_id where c.id = $1 and c.traeger_id = $2`, [id, u.tid]);
  if (!c) fail(404, 'Erhebung nicht gefunden.');
  if (u.role === 'leitung' && !(await one(`select 1 from campaign_links where campaign_id = $1 and school_id = $2`, [c.id, u.sid]))) fail(404, 'Erhebung nicht gefunden.');
  return c;
}
// Ändern darf das Rektorat jede Erhebung des Trägers, die Schulleitung nur ihre eigenen
const canManage = (u, c) => u.role === 'traeger' || (!!c.owner_school_id && c.owner_school_id === u.sid);
async function manageableCampaign(u, id) {
  const c = await visibleCampaign(u, id);
  if (!canManage(u, c)) fail(403, 'Diese Erhebung stammt von Rektorat/Hauptschulleitung. Änderungen nehmen diese vor.');
  return c;
}

on('GET', 'leitung/context', async ({ req }) => {
  const u = await lead(req);
  const traeger = await one(`select id, name, kind from traeger where id = $1`, [u.tid]);
  const schools = (u.role === 'traeger'
    ? await q(`select id, name, zyklen from schools where traeger_id = $1 order by name`, [u.tid])
    : await q(`select id, name, zyklen from schools where id = $1`, [u.sid])).map((x) => ({ ...x, zyklen: schoolZyklen(x.zyklen, traeger.kind) }));
  // Rektorat: Schulleitungen pro Schulhaus (für die E-Mail-Vorlage «An die Schulleitung»)
  if (u.role === 'traeger') {
    const leaders = await q(`select u.school_id, coalesce(u.display_name, u.username) as name, u.email from users u
                               join schools s on s.id = u.school_id where s.traeger_id = $1 and u.role = 'leitung' order by u.created_at`, [u.tid]);
    schools.forEach((x) => { x.leaders = leaders.filter((l) => l.school_id === x.id).map(({ name, email }) => ({ name, email })); });
  }
  const rounds = await q(`select id, title, active from rounds order by created_at desc`);
  return { role: u.role, traeger, schools, rounds, min: MIN };
});

on('GET', 'leitung/campaigns', async ({ req }) => {
  const u = await lead(req);
  const camps = await q(`select c.id, c.title, c.status, c.created_at, c.closed_at, c.custom_block, c.round_id, r.title as round_title,
                                to_char(c.due_date, 'YYYY-MM-DD') as due_date,
                                c.owner_school_id, os.name as owner_school_name
                           from campaigns c left join rounds r on r.id = c.round_id left join schools os on os.id = c.owner_school_id
                          where c.traeger_id = $1 ${u.role === 'leitung' ? 'and exists (select 1 from campaign_links l where l.campaign_id = c.id and l.school_id = $2)' : ''}
                          order by c.created_at desc`, u.role === 'leitung' ? [u.tid, u.sid] : [u.tid]);
  if (!camps.length) return [];
  const links = await q(`select l.id, l.campaign_id, l.school_id, s.name as school_name, l.token, l.expected,
                                (select count(*)::int from responses x where x.campaign_id = l.campaign_id and x.school_id = l.school_id and x.status = 'submitted') as submitted,
                                (select count(*)::int from responses x where x.campaign_id = l.campaign_id and x.school_id = l.school_id and x.status = 'draft') as drafts
                           from campaign_links l join schools s on s.id = l.school_id
                          where l.campaign_id = any($1) ${u.role === 'leitung' ? 'and l.school_id = $2' : ''} order by s.name`,
    u.role === 'leitung' ? [camps.map((c) => c.id), u.sid] : [camps.map((c) => c.id)]);
  return camps.map((c) => {
    const ls = links.filter((l) => l.campaign_id === c.id);
    return { ...c, links: ls, manageable: canManage(u, c), byTraeger: !c.owner_school_id,
      submitted: ls.reduce((a, l) => a + l.submitted, 0), drafts: ls.reduce((a, l) => a + l.drafts, 0) };
  });
});

on('POST', 'leitung/campaigns', async ({ req, body }) => {
  const u = await lead(req);
  let round = null;
  if (body.roundId) {
    round = await one(`select id, title, active from rounds where id = $1`, [body.roundId]);
    if (!round || !round.active) fail(400, 'Diese Runde ist nicht verfügbar.');
  }
  const title = String(body.title || '').trim().slice(0, 80) || (round ? round.title : '');
  if (!title) fail(400, 'Bitte einen Titel angeben, zum Beispiel «Herbst 2026».');
  // Schulen: Schulleitung immer nur die eigene; Rektorat wählt aus den Schulen des Trägers
  let schoolIds;
  if (u.role === 'leitung') schoolIds = [u.sid];
  else {
    const all = await q(`select id from schools where traeger_id = $1`, [u.tid]);
    const wanted = Array.isArray(body.schoolIds) ? body.schoolIds : all.map((x) => x.id);
    schoolIds = all.map((x) => x.id).filter((id) => wanted.includes(id));
    if (!schoolIds.length) fail(400, 'Bitte mindestens eine Schule auswählen.');
  }
  // Pro Runde nimmt jede Schule nur einmal teil, sonst würden Lehrpersonen doppelt gezählt
  if (round) {
    const dup = await q(`select distinct s.name from campaign_links l join campaigns c on c.id = l.campaign_id join schools s on s.id = l.school_id
                          where c.round_id = $1 and l.school_id = any($2)`, [round.id, schoolIds]);
    if (dup.length) fail(409, `Für die Runde «${round.title}» gibt es bereits eine Erhebung für: ${dup.map((d) => d.name).join(', ')}.`);
  }
  let block = null;
  if (body.copyBlockFrom) {
    const src = await one(`select custom_block from campaigns where id = $1 and traeger_id = $2`, [body.copyBlockFrom, u.tid]);
    block = src ? src.custom_block : null; // gleiche Fragen-IDs: Vergleich zwischen Erhebungen bleibt möglich
  }
  const due = cleanDue(body.dueDate);
  const id = newId();
  await q(`insert into campaigns (id, traeger_id, owner_school_id, school_id, round_id, title, token, custom_block, due_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, u.tid, u.role === 'leitung' ? u.sid : null, u.role === 'leitung' ? u.sid : null, round ? round.id : null, title, newToken(), block ? JSON.stringify(block) : null, due]);
  for (const sid of schoolIds) await q(`insert into campaign_links (id, campaign_id, school_id, token) values ($1,$2,$3,$4)`, [newId(), id, sid, newToken()]);
  await audit(u, 'erhebung_eroeffnet', id, { title, schools: schoolIds.length });
  return { id };
});

on('PATCH', 'leitung/campaigns/:id', async ({ req, params, body }) => {
  const u = await lead(req);
  const c = await manageableCampaign(u, params.id);
  if (body.status === 'open' || body.status === 'closed') {
    await q(`update campaigns set status = $1, closed_at = case when $1 = 'closed' then now() else null end where id = $2`, [body.status, c.id]);
    await audit(u, body.status === 'closed' ? 'erhebung_abgeschlossen' : 'erhebung_geoeffnet', c.id);
  }
  if (typeof body.title === 'string' && body.title.trim()) await q(`update campaigns set title = $1 where id = $2`, [body.title.trim().slice(0, 80), c.id]);
  if ('dueDate' in body) await q(`update campaigns set due_date = $1 where id = $2`, [cleanDue(body.dueDate), c.id]);
  return { ok: true };
});

// Rektorat: Schulhaus nachträglich in eine laufende Erhebung aufnehmen (z. B. später erfasstes Schulhaus)
on('POST', 'leitung/campaigns/:id/links', async ({ req, params, body }) => {
  const u = await lead(req);
  if (u.role !== 'traeger') fail(403, 'Schulhäuser nehmen Rektorat bzw. Hauptschulleitung in eine Erhebung auf.');
  const c = await manageableCampaign(u, params.id);
  if (c.status !== 'open') fail(409, 'Die Erhebung ist abgeschlossen.');
  if (c.owner_school_id) fail(409, 'Diese Erhebung hat eine Schulleitung für ihre Schule eröffnet. Weitere Schulhäuser lassen sich nur in Erhebungen von Rektorat/Hauptschulleitung aufnehmen.');
  const s = await one(`select id, name from schools where id = $1 and traeger_id = $2`, [String(body.schoolId || ''), u.tid]);
  if (!s) fail(404, 'Schule nicht gefunden.');
  if (await one(`select 1 from campaign_links where campaign_id = $1 and school_id = $2`, [c.id, s.id])) fail(409, `${s.name} ist bereits dabei.`);
  if (c.round_id) {
    const dup = await one(`select 1 from campaign_links l join campaigns x on x.id = l.campaign_id where x.round_id = $1 and l.school_id = $2`, [c.round_id, s.id]);
    if (dup) fail(409, `${s.name} nimmt in dieser Runde bereits mit einer anderen Erhebung teil.`);
  }
  await q(`insert into campaign_links (id, campaign_id, school_id, token) values ($1,$2,$3,$4)`, [newId(), c.id, s.id, newToken()]);
  await audit(u, 'schule_aufgenommen', c.id, { school: s.name });
  return { ok: true };
});

// Erwartete Anzahl Lehrpersonen pro Schule (Rücklaufquote)
on('PATCH', 'leitung/links/:id', async ({ req, params, body }) => {
  const u = await lead(req);
  const l = await one(`select l.id, l.school_id from campaign_links l join campaigns c on c.id = l.campaign_id where l.id = $1 and c.traeger_id = $2`, [params.id, u.tid]);
  if (!l || (u.role === 'leitung' && l.school_id !== u.sid)) fail(404, 'Link nicht gefunden.');
  const n = body.expected === null || body.expected === '' ? null : parseInt(body.expected, 10);
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1000)) fail(400, 'Bitte eine Anzahl zwischen 1 und 1000 eingeben oder das Feld leer lassen.');
  await q(`update campaign_links set expected = $1 where id = $2`, [n, l.id]);
  return { ok: true };
});

on('PUT', 'leitung/campaigns/:id/block', async ({ req, params, body }) => {
  const u = await lead(req);
  const c = await manageableCampaign(u, params.id);
  const sub = await one(`select count(*)::int as n from responses where campaign_id = $1 and status = 'submitted'`, [c.id]);
  if (sub.n > 0) fail(409, 'Es gibt bereits abgeschlossene Teilnahmen. Die Fragen lassen sich darum nicht mehr ändern. Für neue Fragen eine neue Erhebung eröffnen.');
  const v = validateBlock(body.block);
  if (v.error) fail(400, v.error);
  await q(`update campaigns set custom_block = $1 where id = $2`, [v.block ? JSON.stringify(v.block) : null, c.id]);
  return { block: v.block };
});

// Auswertung. Quelle: eine Erhebung (c:<id>) oder alle Erhebungen des Trägers in einer Runde (r:<id>).
on('GET', 'leitung/aggregate', async ({ req, query }) => {
  const u = await lead(req);
  const [kind, id] = String(query.source || '').split(':');
  let camps, title, block = null;
  if (kind === 'c') {
    const c = await visibleCampaign(u, id);
    camps = [c]; title = c.title; block = c.custom_block;
  } else if (kind === 'r') {
    const r = await one(`select id, title from rounds where id = $1`, [id]);
    if (!r) fail(404, 'Runde nicht gefunden.');
    camps = await q(`select c.* from campaigns c where c.round_id = $1 and c.traeger_id = $2
                     ${u.role === 'leitung' ? 'and exists (select 1 from campaign_links l where l.campaign_id = c.id and l.school_id = $3)' : ''}`,
      u.role === 'leitung' ? [r.id, u.tid, u.sid] : [r.id, u.tid]);
    if (!camps.length) fail(404, 'In dieser Runde gibt es noch keine Erhebung.');
    title = r.title;
  } else fail(400, 'Bitte eine Erhebung wählen.');
  const ids = camps.map((c) => c.id);
  const school = u.role === 'leitung' ? u.sid : String(query.school || '');
  const zyklus = String(query.zyklus || '');
  // Schulleitung: nur Antworten der eigenen Schule werden überhaupt geladen
  const allRows = await q(`select r.school_id, r.context, r.answers, r.custom_answers from responses r
                         where r.campaign_id = any($1) and r.status = 'submitted' ${u.role === 'leitung' ? 'and r.school_id = $2' : ''}`, u.role === 'leitung' ? [ids, u.sid] : [ids]);
  const rows = school ? allRows.filter((r) => r.school_id === school) : allRows;
  // Alle Links der Auswahl: Namen und «mehrere Schulen» hängen nicht vom Schulfilter ab (sonst verschwindet der Filter nach dem Filtern)
  const allLinks = await q(`select l.school_id, l.expected, s.name from campaign_links l join schools s on s.id = l.school_id
                          where l.campaign_id = any($1) ${u.role === 'leitung' ? 'and l.school_id = $2' : ''}`, u.role === 'leitung' ? [ids, u.sid] : [ids]);
  const links = school ? allLinks.filter((l) => l.school_id === school) : allLinks;
  const names = Object.fromEntries(allLinks.map((l) => [l.school_id, l.name]));
  const expected = links.length && links.every((l) => l.expected) ? links.reduce((a, l) => a + l.expected, 0) : null;
  // Filter nur für Gruppen ab Mindestgrösse anbieten
  let schools = [];
  if (u.role === 'traeger') {
    schools = filterOptions(allRows, (r) => r.school_id).map((x) => ({ id: x.key, name: names[x.key] || '–', n: x.n }));
    schools.sort((a, b) => a.name.localeCompare(b.name));
    if (school && !schools.some((x) => x.id === school)) fail(403, 'Für diese Schule ist keine Einzelauswertung möglich, weil nicht alle Schulen die Mindestanzahl erreichen.');
  }
  const zyklen = filterOptions(rows, zyk).map((x) => ({ zyklus: x.key, n: x.n }));
  if (zyklus && !zyklen.some((x) => x.zyklus === zyklus)) fail(403, 'Für diesen Zyklus ist keine Einzelauswertung möglich.');
  const recs = zyklus ? rows.filter((r) => zyk(r) === zyklus) : rows;
  const base = { source: { kind, id, title }, total: rows.length, min: MIN, testMode: TEST_MODE && MIN < DKCore.MIN_GROUP, schools, zyklen, expected,
    open: camps.some((c) => c.status === 'open'), multiSchool: u.role === 'traeger' && new Set(allLinks.map((l) => l.school_id)).size > 1 };
  await audit(u, 'auswertung_angesehen', query.source, { school: school || null, zyklus: zyklus || null });
  if (recs.length < MIN) return { ...base, n: recs.length, tooFew: true };
  // Runde über mehrere Erhebungen: Die Differenz zwischen Runde und einzelner Erhebung ergäbe die übrigen Schulen.
  // Darum nur, wenn jede Schule mit Teilnahmen die Mindestanzahl erreicht.
  if (kind === 'r' && camps.length > 1 && !school) {
    const per = {};
    allRows.forEach((r) => { per[r.school_id] = (per[r.school_id] || 0) + 1; });
    if (Object.values(per).some((n) => n < MIN)) {
      return { ...base, n: recs.length, tooFew: true,
        reason: `Die Runde umfasst mehrere Erhebungen. Eine Gesamtauswertung ist erst möglich, wenn jede beteiligte Schule mindestens ${MIN} abgeschlossene Teilnahmen hat. Die einzelnen Erhebungen lassen sich weiterhin auswerten.` };
    }
  }
  const agg = DKCore.aggregate(ITEMS, recs.map((r) => ({ answers: r.answers })));
  const custom = block ? { block, ...aggregateCustom(block, recs.map((r) => r.custom_answers), MIN) } : null;
  const groups = {
    zyklen: zyklus ? null : compareGroups(recs, zyk),
    schulen: u.role === 'traeger' && !school ? compareGroups(recs, (r) => r.school_id, (k) => names[k] || '–', (a, b) => (names[a] || '').localeCompare(names[b] || '')) : null,
  };
  return { ...base, n: recs.length, tooFew: false, agg, custom, groups };
});

/* ---------- Einladungen und Passwort-Links ----------
 * Das AVS lädt das Rektorat bzw. die Hauptschulleitung ein. Danach laden Träger und Schulleitungen selbst ein.
 * Niemand kennt fremde Passwörter: Wer eingeladen wird, legt Benutzername und Passwort selbst fest. */
const INVITE_HOURS = 30 * 24, RESET_HOURS = 24; // Einladungen 30 Tage, Passwort-Links 24 Stunden
const cleanEmail = (e) => { const v = String(e || '').trim().toLowerCase().slice(0, 160); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; };
async function createInvite({ kind, role = null, tid = null, sid = null, userId = null, name = '', email = '', by = null }) {
  const token = newInviteToken();
  const id = newId();
  const r = await one(`insert into invitations (id, token_hash, kind, role, traeger_id, school_id, user_id, name, email, created_by, expires_at)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + ($11 || ' hours')::interval) returning expires_at`,
    [id, hashInviteToken(token), kind, role, tid, sid, userId, String(name || '').trim().slice(0, 80) || null, cleanEmail(email) || null, by, String(kind === 'reset' ? RESET_HOURS : INVITE_HOURS)]);
  return { id, token, expires_at: r.expires_at };
}
async function renewInvite(id) {
  const token = newInviteToken();
  const r = await one(`update invitations set token_hash = $1, expires_at = now() + ($2 || ' hours')::interval, created_at = now()
                        where id = $3 and kind = 'invite' and used_at is null returning id, expires_at, kind`, [hashInviteToken(token), String(INVITE_HOURS), id]);
  if (!r) fail(404, 'Einladung nicht gefunden oder bereits angenommen.');
  return { id: r.id, token, expires_at: r.expires_at };
}
async function inviteByToken(token) {
  const i = await one(`select i.*, t.name as traeger_name, t.kind as traeger_kind, s.name as school_name, u.username, cb.role as creator_role
                         from invitations i left join users u on u.id = i.user_id left join users cb on cb.id = i.created_by
                         left join schools s on s.id = coalesce(i.school_id, u.school_id)
                         left join traeger t on t.id = coalesce(i.traeger_id, u.traeger_id, s.traeger_id)
                        where i.token_hash = $1`, [hashInviteToken(token)]);
  if (!i) fail(404, 'Dieser Link ist ungültig. Bitte einen neuen Link anfordern.');
  if (i.used_at) fail(410, 'Dieser Link wurde bereits verwendet. Bitte unter «Für Schulleitungen» anmelden.');
  if (new Date(i.expires_at) < new Date()) fail(410, 'Dieser Link ist abgelaufen. Bitte einen neuen Link anfordern.');
  return i;
}
async function suggestUsername(email, name) {
  let base = (email ? email.split('@')[0] : String(name || '').trim().replace(/\s+/g, '.')).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '').slice(0, 36);
  if (base.length < 3) return '';
  let u = base, n = 2;
  while (await one(`select 1 from users where username = $1`, [u])) u = base + n++;
  return u;
}
// Vom AVS eingeladen: Rektorat/Hauptschulleitung. Vom Rektorat eingeladen (z. B. Verwaltung): gleiche Rechte, neutral benannt.
const roleText = (i) => (i.role !== 'traeger' ? `Schulleitung ${i.school_name || ''}`
  : i.creator_role === 'traeger' ? `Person mit Zugang für alle Schulhäuser von ${i.traeger_name}` : `Rektorat/Hauptschulleitung ${i.traeger_name}`);

const TOO_MANY_LINKS = 'Zu viele Versuche mit Einladungslinks. Bitte in 15 Minuten nochmals versuchen.';
on('GET', 'invite/:token', async ({ req, params }) => {
  await limit('invite:' + clientIp(req), 30, 900, TOO_MANY_LINKS);
  const i = await inviteByToken(params.token);
  return { kind: i.kind, role: i.role, roleText: i.kind === 'invite' ? roleText(i) : null, traeger: i.traeger_name, school: i.school_name,
    name: i.name, email: i.email, username: i.username, suggestedUsername: i.kind === 'invite' ? await suggestUsername(i.email, i.name) : null, expires_at: i.expires_at };
});
on('POST', 'invite/:token', async ({ req, params, body, res }) => {
  await limit('invite:' + clientIp(req), 30, 900, TOO_MANY_LINKS);
  const i = await inviteByToken(params.token);
  const password = String(body.password || '');
  checkNewPassword(password);
  const username = String(body.username || '').trim().toLowerCase();
  if (i.kind === 'invite') {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'Benutzername: 3 bis 40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich.');
    if (await one(`select 1 from users where username = $1`, [username])) fail(409, 'Dieser Benutzername ist bereits vergeben. Bitte einen anderen wählen.');
  }
  const hash = await hashPassword(password);
  // Link atomar einlösen: Bei zwei gleichzeitigen Anfragen gewinnt nur eine
  const claimed = await one(`update invitations set used_at = now() where id = $1 and used_at is null and expires_at > now() returning id`, [i.id]);
  if (!claimed) fail(410, 'Dieser Link wurde bereits verwendet oder ist abgelaufen.');
  let u;
  try {
    if (i.kind === 'reset') {
      // Passwort neu: alle bestehenden Sitzungen dieses Kontos enden
      u = await one(`update users set password_hash = $1, must_change_password = false, session_version = session_version + 1 where id = $2
                     returning id, role, school_id, session_version`, [hash, i.user_id]);
      if (!u) fail(404, 'Konto nicht gefunden.');
      await q(`update invitations set used_at = now() where user_id = $1 and used_at is null`, [i.user_id]);
    } else {
      u = await one(`insert into users (id, school_id, traeger_id, role, username, display_name, email, password_hash, must_change_password) values ($1,$2,$3,$4,$5,$6,$7,$8,false)
                     returning id, role, school_id, session_version`,
        [newId(), i.role === 'leitung' ? i.school_id : null, i.role === 'traeger' ? i.traeger_id : null, i.role, username, String(body.display_name || i.name || '').trim().slice(0, 80) || null, i.email, hash]);
    }
  } catch (e) {
    await q(`update invitations set used_at = null where id = $1`, [i.id]); // Link bleibt gültig, wenn das Einlösen scheitert
    if (e && e.code === '23505') fail(409, 'Dieser Benutzername ist bereits vergeben. Bitte einen anderen wählen.');
    throw e;
  }
  staffCookie(res, u);
  await audit({ uid: u.id, role: u.role }, i.kind === 'reset' ? 'passwort_link_eingeloest' : 'einladung_angenommen', username || null);
  return { ok: true, role: u.role };
});

/* ---------- Selbstverwaltung: Schulen und Zugänge ----------
 * Schulträger (Rektorat, Hauptschulleitung, Verwaltung): Schulhäuser und alle Zugänge des Trägers.
 * Schulleitung: Zugänge der eigenen Schule (z. B. Co-Leitung). Das eigene Konto verwaltet niemand selbst. */
async function teamTarget(u, userId) {
  const t = await one(`select u.id, u.role, u.school_id, coalesce(u.traeger_id, s.traeger_id) as traeger_id
                         from users u left join schools s on s.id = u.school_id where u.id = $1`, [userId]);
  if (!t || t.traeger_id !== u.tid || t.role === 'admin') fail(404, 'Zugang nicht gefunden.');
  if (t.id === u.uid) fail(400, 'Das eigene Konto lässt sich hier nicht ändern. Passwort ändern oben rechts.');
  if (u.role === 'leitung' && !(t.role === 'leitung' && t.school_id === u.sid)) fail(403, 'Schulleitungen verwalten nur Zugänge der eigenen Schule.');
  return t;
}
async function teamInvite(u, id) {
  const i = await one(`select i.* from invitations i left join schools s on s.id = i.school_id where i.id = $1 and i.kind = 'invite' and i.used_at is null
                        and coalesce(i.traeger_id, s.traeger_id) = $2`, [id, u.tid]);
  if (!i || (u.role === 'leitung' && !(i.role === 'leitung' && i.school_id === u.sid))) fail(404, 'Einladung nicht gefunden.');
  return i;
}

on('GET', 'leitung/team', async ({ req }) => {
  const u = await lead(req);
  const tk = (await one(`select kind from traeger where id = $1`, [u.tid])).kind;
  const schools = (await q(`select s.id, s.name, s.zyklen, (select count(*)::int from campaign_links l where l.school_id = s.id) as links
                             from schools s where s.traeger_id = $1 ${u.role === 'leitung' ? 'and s.id = $2' : ''} order by s.name`, u.role === 'leitung' ? [u.tid, u.sid] : [u.tid])).map((x) => ({ ...x, zyklen: schoolZyklen(x.zyklen, tk), zyklenSet: Array.isArray(x.zyklen) }));
  const users = await q(`select u.id, u.username, u.display_name, u.email, u.role, u.last_login, u.school_id, s.name as school_name
                           from users u left join schools s on s.id = u.school_id
                          where (u.traeger_id = $1 or s.traeger_id = $1) ${u.role === 'leitung' ? 'and u.school_id = $2' : ''}
                          order by u.role desc, s.name nulls first, u.username`, u.role === 'leitung' ? [u.tid, u.sid] : [u.tid]);
  const invites = await q(`select i.id, i.role, i.name, i.email, i.school_id, s.name as school_name, i.created_at, i.expires_at, i.expires_at < now() as expired
                             from invitations i left join schools s on s.id = i.school_id
                            where i.kind = 'invite' and i.used_at is null and coalesce(i.traeger_id, s.traeger_id) = $1 ${u.role === 'leitung' ? 'and i.school_id = $2' : ''}
                            order by i.created_at desc`, u.role === 'leitung' ? [u.tid, u.sid] : [u.tid]);
  return { role: u.role, me: u.uid, schools, users: users.map((x) => ({ ...x, self: x.id === u.uid })), invites };
});
on('POST', 'leitung/schools', async ({ req, body }) => {
  const u = await lead(req);
  if (u.role !== 'traeger') fail(403, 'Schulen erfasst der Schulträger.');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen der Schule bzw. des Schulhauses angeben.');
  const id = newId();
  await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [id, name, u.tid]);
  await audit(u, 'schule_erfasst', name);
  return { id };
});
on('PATCH', 'leitung/schools/:id', async ({ req, params, body }) => {
  const u = await lead(req);
  if (u.role !== 'traeger') fail(403, 'Schulen verwaltet der Schulträger.');
  if (!(await one(`select 1 from schools where id = $1 and traeger_id = $2`, [params.id, u.tid]))) fail(404, 'Schule nicht gefunden.');
  await updateSchool(params.id, body);
  return { ok: true };
});
async function updateSchool(id, body) {
  if ('name' in body) {
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) fail(400, 'Bitte einen Namen angeben.');
    await q(`update schools set name = $1 where id = $2`, [name, id]);
  }
  if ('zyklen' in body) {
    const z = ALL_ZYKLEN.filter((x) => Array.isArray(body.zyklen) && body.zyklen.includes(x));
    if (!z.length) fail(400, 'Bitte mindestens einen Zyklus wählen.');
    await q(`update schools set zyklen = $1 where id = $2`, [JSON.stringify(z), id]);
  }
}
on('DELETE', 'leitung/schools/:id', async ({ req, params }) => {
  const u = await lead(req);
  if (u.role !== 'traeger') fail(403, 'Schulen verwaltet der Schulträger.');
  const s = await one(`select id, name, (select count(*)::int from campaign_links l where l.school_id = schools.id) as links from schools where id = $1 and traeger_id = $2`, [params.id, u.tid]);
  if (!s) fail(404, 'Schule nicht gefunden.');
  if (s.links > 0) fail(409, 'Diese Schule hat bereits an Erhebungen teilgenommen und lässt sich darum nur durch das AVS löschen.');
  await q(`delete from schools where id = $1`, [s.id]);
  await audit(u, 'schule_geloescht', s.name);
  return { ok: true };
});
on('POST', 'leitung/invitations', async ({ req, body }) => {
  const u = await lead(req);
  const role = u.role === 'leitung' ? 'leitung' : (body.role === 'traeger' ? 'traeger' : 'leitung');
  let sid = null;
  if (role === 'leitung') {
    sid = u.role === 'leitung' ? u.sid : String(body.schoolId || '');
    if (!(await one(`select 1 from schools where id = $1 and traeger_id = $2`, [sid, u.tid]))) fail(400, 'Bitte die Schule wählen.');
  }
  const inv = await createInvite({ kind: 'invite', role, tid: role === 'traeger' ? u.tid : null, sid, name: body.name, email: body.email, by: u.uid });
  await audit(u, 'einladung_erstellt', cleanEmail(body.email) || String(body.name || '').slice(0, 80), { role, school: sid });
  return inv;
});
on('POST', 'leitung/invitations/:id/renew', async ({ req, params }) => {
  const u = await lead(req);
  await teamInvite(u, params.id);
  return renewInvite(params.id);
});
on('DELETE', 'leitung/invitations/:id', async ({ req, params }) => {
  const u = await lead(req);
  await teamInvite(u, params.id);
  await q(`delete from invitations where id = $1`, [params.id]);
  return { ok: true };
});
on('POST', 'leitung/users/:id/reset', async ({ req, params }) => {
  const u = await lead(req);
  const t = await teamTarget(u, params.id);
  const inv = await createInvite({ kind: 'reset', userId: t.id, by: u.uid });
  const x = await one(`select username, email from users where id = $1`, [t.id]);
  await audit(u, 'passwort_link_erstellt', x.username);
  return { ...inv, username: x.username, email: x.email };
});
on('DELETE', 'leitung/users/:id', async ({ req, params }) => {
  const u = await lead(req);
  const t = await teamTarget(u, params.id);
  const x = await one(`delete from users where id = $1 returning username`, [t.id]);
  await audit(u, 'zugang_geloescht', x && x.username);
  return { ok: true };
});

/* AVS: Trägerliste importieren und Rektorate einladen */
on('POST', 'admin/import', async ({ req, body }) => {
  const s = await staff(req, 'admin');
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
  if (!rows.length) fail(400, 'Keine Zeilen zum Importieren.');
  const out = [];
  for (const r of rows) {
    const name = String(r.traeger || '').trim().slice(0, 120);
    if (!name) { out.push({ traeger: '', status: 'übersprungen: kein Name' }); continue; }
    const kind = parseKind(r.kind);
    let t = await one(`select id, kind from traeger where lower(name) = lower($1)`, [name]);
    let created = false;
    if (!t) { t = { id: newId(), kind }; await q(`insert into traeger (id, name, kind) values ($1,$2,$3)`, [t.id, name, kind]); created = true; }
    else if (t.kind !== kind) await q(`update traeger set kind = $1 where id = $2`, [kind, t.id]);
    const schools = (Array.isArray(r.schools) ? r.schools : []).map((x) => String(x || '').trim().slice(0, 120)).filter(Boolean);
    if (!schools.length && created) schools.push(name);
    let added = 0;
    for (const sn of schools) {
      if (!(await one(`select 1 from schools where traeger_id = $1 and lower(name) = lower($2)`, [t.id, sn]))) { await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [newId(), sn, t.id]); added++; }
    }
    const email = cleanEmail(r.email);
    let invite = null, status = created ? 'neu erfasst' : 'bereits vorhanden';
    if (email) {
      const hasUser = await one(`select 1 from users where lower(email) = $1 and traeger_id = $2`, [email, t.id]);
      if (hasUser) status += ', Zugang besteht bereits';
      else {
        const pending = await one(`select id from invitations where kind = 'invite' and used_at is null and lower(email) = $1 and traeger_id = $2`, [email, t.id]);
        invite = pending ? await renewInvite(pending.id) : await createInvite({ kind: 'invite', role: 'traeger', tid: t.id, name: r.name, email, by: s.uid });
        status += pending ? ', Einladung erneuert' : ', Einladung erstellt';
      }
    } else status += ', keine gültige E-Mail';
    if (added) status += `, ${added} Schule${added === 1 ? '' : 'n'} ergänzt`;
    out.push({ traeger: name, kind, name: r.name || '', email, status, token: invite ? invite.token : null, expires_at: invite ? invite.expires_at : null });
  }
  await audit(s, 'import', null, { rows: out.length });
  return { rows: out };
});
on('GET', 'admin/traeger/:id/invitations', async ({ req, params }) => {
  await staff(req, 'admin');
  return q(`select i.id, i.role, i.name, i.email, s.name as school_name, i.created_at, i.expires_at, i.expires_at < now() as expired
              from invitations i left join schools s on s.id = i.school_id
             where i.kind = 'invite' and i.used_at is null and coalesce(i.traeger_id, s.traeger_id) = $1 order by i.created_at desc`, [params.id]);
});
on('POST', 'admin/traeger/:id/invitations', async ({ req, params, body }) => {
  const s = await staff(req, 'admin');
  if (!(await one(`select 1 from traeger where id = $1`, [params.id]))) fail(404, 'Schulträger nicht gefunden.');
  let sid = null;
  if (body.schoolId) {
    if (!(await one(`select 1 from schools where id = $1 and traeger_id = $2`, [body.schoolId, params.id]))) fail(404, 'Schule nicht gefunden.');
    sid = body.schoolId;
  }
  const inv = await createInvite({ kind: 'invite', role: sid ? 'leitung' : 'traeger', tid: sid ? null : params.id, sid, name: body.name, email: body.email, by: s.uid });
  await audit(s, 'einladung_erstellt', cleanEmail(body.email) || String(body.name || '').slice(0, 80), { traeger: params.id, school: sid });
  return inv;
});
on('POST', 'admin/invitations/:id/renew', async ({ req, params }) => { await staff(req, 'admin'); return renewInvite(params.id); });
on('DELETE', 'admin/invitations/:id', async ({ req, params }) => { await staff(req, 'admin'); await q(`delete from invitations where id = $1`, [params.id]); return { ok: true }; });

/* ---------- AVS: Träger, Schulen, Zugänge, Runden ---------- */
on('GET', 'admin/traeger', async ({ req }) => {
  await staff(req, 'admin');
  const tr = await q(`select t.id, t.name, t.kind, t.created_at,
                             (select count(*)::int from users u where u.traeger_id = t.id) as rektorat,
                             (select count(*)::int from participants p where p.traeger_id = t.id) as participants,
                             (select count(*)::int from campaigns c where c.traeger_id = t.id) as campaigns
                        from traeger t order by t.name`);
  const sc = await q(`select s.id, s.name, s.traeger_id, s.zyklen, (select count(*)::int from users u where u.school_id = s.id) as users from schools s order by s.name`);
  return tr.map((t) => ({ ...t, schools: sc.filter((s) => s.traeger_id === t.id).map((s) => ({ ...s, zyklen: schoolZyklen(s.zyklen, t.kind) })) }));
});
on('POST', 'admin/traeger', async ({ req, body }) => {
  await staff(req, 'admin');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen des Schulträgers angeben, z. B. «Gemeinde Musterdorf» oder «Bezirk March».');
  const kind = parseKind(body.kind);
  const id = newId();
  await q(`insert into traeger (id, name, kind) values ($1,$2,$3)`, [id, name, kind]);
  // Ein erstes Schulhaus mit gleichem Namen, damit kleine Träger sofort starten können
  if (body.firstSchool !== false) await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [newId(), String(body.schoolName || name).trim().slice(0, 120), id]);
  return { id };
});
on('PATCH', 'admin/traeger/:id', async ({ req, params, body }) => {
  await staff(req, 'admin');
  if (typeof body.name === 'string' && body.name.trim()) await q(`update traeger set name = $1 where id = $2`, [body.name.trim().slice(0, 120), params.id]);
  if (KINDS.includes(body.kind)) await q(`update traeger set kind = $1 where id = $2`, [body.kind, params.id]);
  return { ok: true };
});
on('DELETE', 'admin/traeger/:id', async ({ req, params }) => {
  const s = await staff(req, 'admin');
  const x = await one(`delete from traeger where id = $1 returning name`, [params.id]);
  if (x) await audit(s, 'schultraeger_geloescht', x.name);
  return { ok: true };
});
on('POST', 'admin/traeger/:id/schools', async ({ req, params, body }) => {
  await staff(req, 'admin');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen der Schule bzw. des Schulhauses angeben.');
  if (!(await one(`select 1 from traeger where id = $1`, [params.id]))) fail(404, 'Schulträger nicht gefunden.');
  const id = newId();
  await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [id, name, params.id]);
  return { id };
});
on('PATCH', 'admin/schools/:id', async ({ req, params, body }) => {
  await staff(req, 'admin');
  if (!(await one(`select 1 from schools where id = $1`, [params.id]))) fail(404, 'Schule nicht gefunden.');
  await updateSchool(params.id, body);
  return { ok: true };
});
on('DELETE', 'admin/schools/:id', async ({ req, params }) => {
  const s = await staff(req, 'admin');
  const x = await one(`delete from schools where id = $1 returning name`, [params.id]);
  if (x) await audit(s, 'schule_geloescht', x.name);
  return { ok: true };
});
on('GET', 'admin/traeger/:id/users', async ({ req, params }) => {
  await staff(req, 'admin');
  return q(`select u.id, u.username, u.display_name, u.email, u.role, u.must_change_password, u.created_at, u.last_login, s.name as school_name
              from users u left join schools s on s.id = u.school_id
             where u.traeger_id = $1 or s.traeger_id = $1 order by u.role desc, s.name nulls first, u.username`, [params.id]);
});
on('POST', 'admin/users/:id/reset', async ({ req, params }) => {
  const s = await staff(req, 'admin');
  const u = await one(`select id, username, email from users where id = $1 and role in ('leitung','traeger')`, [params.id]);
  if (!u) fail(404, 'Konto nicht gefunden.');
  const inv = await createInvite({ kind: 'reset', userId: u.id, by: s.uid });
  await audit(s, 'passwort_link_erstellt', u.username);
  return { ...inv, username: u.username, email: u.email };
});
on('DELETE', 'admin/users/:id', async ({ req, params }) => {
  const s = await staff(req, 'admin');
  const x = await one(`delete from users where id = $1 and role in ('leitung','traeger') returning username`, [params.id]);
  if (x) await audit(s, 'zugang_geloescht', x.username);
  return { ok: true };
});

on('GET', 'admin/rounds', async ({ req }) => {
  await staff(req, 'admin');
  return q(`select r.id, r.title, r.active, r.created_at,
                   (select count(distinct l.school_id)::int from campaigns c join campaign_links l on l.campaign_id = c.id where c.round_id = r.id) as schools,
                   (select count(*)::int from responses x join campaigns c on c.id = x.campaign_id where c.round_id = r.id and x.status = 'submitted') as submitted
              from rounds r order by r.created_at desc`);
});
on('POST', 'admin/rounds', async ({ req, body }) => {
  await staff(req, 'admin');
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) fail(400, 'Bitte einen Titel angeben, z. B. «Erste Runde 2026/27».');
  const id = newId();
  await q(`insert into rounds (id, title) values ($1,$2)`, [id, title]);
  return { id };
});
on('PATCH', 'admin/rounds/:id', async ({ req, params, body }) => {
  await staff(req, 'admin');
  if (typeof body.active === 'boolean') await q(`update rounds set active = $1 where id = $2`, [body.active, params.id]);
  if (typeof body.title === 'string' && body.title.trim()) await q(`update rounds set title = $1 where id = $2`, [body.title.trim().slice(0, 80), params.id]);
  return { ok: true };
});

/* AVS: kantonale Auswertung ohne Bezug zu Schulen oder Trägern.
 * Keine Filter oder Gruppen nach Schule/Träger, keine eigenen Fragen der Schulen, keine Freitexte.
 * Jede Person zählt einmal (jüngste abgeschlossene Teilnahme im gewählten Zeitraum). */
const ERFAHRUNG_ORDER = ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'];
on('GET', 'admin/aggregate', async ({ req, query }) => {
  const s = await staff(req, 'admin');
  const round = String(query.round || '');
  // Nur pro Runde: Vergleiche zwischen überlappenden Auswahlen könnten sonst kleine Gruppen offenlegen
  if (!round) fail(400, 'Bitte eine Runde wählen.');
  const zyklus = String(query.zyklus || '');
  const rows = await q(`select distinct on (r.participant_id) r.context, r.answers, r.school_id, c.traeger_id
                          from responses r join campaigns c on c.id = r.campaign_id
                         where r.status = 'submitted' and c.round_id = $1
                         order by r.participant_id, r.submitted_at desc`, [round]);
  await audit(s, 'kantonsauswertung_angesehen', round, { zyklus: zyklus || null });
  const zyklen = filterOptions(rows, zyk).map((x) => ({ zyklus: x.key, n: x.n }));
  if (zyklus && !zyklen.some((x) => x.zyklus === zyklus)) fail(403, 'Für diesen Zyklus ist keine Einzelauswertung möglich.');
  const recs = zyklus ? rows.filter((r) => zyk(r) === zyklus) : rows;
  const base = { total: rows.length, min: MIN, testMode: TEST_MODE && MIN < DKCore.MIN_GROUP, zyklen,
    traegerCount: new Set(recs.map((r) => r.traeger_id)).size, schoolCount: new Set(recs.map((r) => r.school_id)).size };
  if (recs.length < MIN) return { ...base, n: recs.length, tooFew: true };
  const agg = DKCore.aggregate(ITEMS, recs.map((r) => ({ answers: r.answers })));
  const ctx = (k) => (r) => (r.context && r.context[k]) || '';
  const groups = {
    zyklen: zyklus ? null : compareGroups(recs, zyk),
    erfahrung: compareGroups(recs, ctx('erfahrung'), (k) => k, (a, b) => ERFAHRUNG_ORDER.indexOf(a) - ERFAHRUNG_ORDER.indexOf(b)),
    funktion: compareGroups(recs, ctx('funktion')),
  };
  return { ...base, n: recs.length, tooFew: false, agg, groups };
});

/* AVS: Protokoll der letzten Aktionen */
on('GET', 'admin/audit', async ({ req, query }) => {
  await staff(req, 'admin');
  const lim = Math.min(500, Math.max(10, parseInt(query.limit || '200', 10) || 200));
  const rows = await q(`select a.id, a.at, a.actor_role, a.action, a.target, a.detail, u.username, u.display_name,
                   coalesce(t.name, st.name) as traeger_name, sc.name as school_name
              from audit_log a left join users u on u.id = a.actor_id
              left join schools sc on sc.id = u.school_id
              left join traeger t on t.id = u.traeger_id left join traeger st on st.id = sc.traeger_id
             order by a.at desc, a.id desc limit $1`, [lim]);
  // Kennungen lesbar machen (Erhebung, Runde, Schule, Träger); gelöschte Objekte bleiben als Kennung stehen
  const ids = [...new Set(rows.map((r) => String(r.target || '').replace(/^[cr]:/, '')).filter(Boolean))];
  const names = {};
  if (ids.length) {
    (await q(`select c.id, c.title || ' (' || t.name || ')' as name from campaigns c join traeger t on t.id = c.traeger_id where c.id = any($1)
              union all select id, 'Runde ' || title from rounds where id = any($1)
              union all select s.id, s.name || ' (' || t.name || ')' from schools s join traeger t on t.id = s.traeger_id where s.id = any($1)
              union all select id, name from traeger where id = any($1)
              union all select id, username from users where id = any($1)`, [ids])).forEach((x) => { names[x.id] = x.name; });
  }
  return rows.map((r) => ({ ...r, target: r.target ? names[String(r.target).replace(/^[cr]:/, '')] || r.target : null }));
});

/* ---------- Einstieg ---------- */
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const query = Object.fromEntries(url.searchParams);
    Object.assign(query, req.query || {});
    const path = String(query.route || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const data = await r.fn({ req, res, params: m.groups || {}, body, query });
      return send(res, 200, data);
    }
    return send(res, 404, { error: 'Unbekannte Anfrage.' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Unerwarteter Fehler auf dem Server. Bitte später nochmals versuchen.' });
  }
}

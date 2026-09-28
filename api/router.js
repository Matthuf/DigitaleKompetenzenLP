// Einzige Serverfunktion: alle /api/*-Aufrufe werden per vercel.json hierher umgeleitet.
import { createRequire } from 'node:module';
import { q, one, newId } from '../lib/db.js';
import {
  hashPassword, verifyPassword, setSession, clearSession, getSession, COOKIE_STAFF, COOKIE_PART,
  newCode, hashCode, newToken, newPassword, encryptCode, decryptCode, formatCode,
} from '../lib/auth.js';
import { validateBlock, cleanCustomAnswers, aggregateCustom } from '../lib/customblock.js';

const require = createRequire(import.meta.url);
const DKCore = require('../lib/core.cjs');
const ITEMS = require('../lib/items.json');
const SUB_IDS = new Set(DKCore.allSubareas(ITEMS).map((s) => s.id));
// Mindestgruppe für Auswertungen. Testphase: ab 1 Teilnahme. Für den Echtbetrieb in Vercel MIN_GROUP_SIZE=5 setzen.
const MIN = Math.max(1, parseInt(process.env.MIN_GROUP_SIZE || '1', 10) || 1);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

/* ---------- Hilfen ---------- */
function staff(req, role) {
  const s = getSession(req, COOKIE_STAFF);
  if (!s) fail(401, 'Bitte anmelden.');
  if (role && s.role !== role) fail(403, 'Für diese Funktion fehlt die Berechtigung.');
  return s;
}
function participant(req) {
  const s = getSession(req, COOKIE_PART);
  if (!s) fail(401, 'Bitte mit dem persönlichen Code anmelden.');
  return s;
}
function cleanContext(c) {
  const out = {};
  ['stufe', 'funktion', 'erfahrung'].forEach((k) => {
    if (c && typeof c[k] === 'string' && c[k].trim()) out[k] = c[k].trim().slice(0, 80);
  });
  return out;
}
function cleanAnswers(a) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const [k, v] of Object.entries(a)) {
    if (SUB_IDS.has(k) && Number.isInteger(v) && v >= 0 && v <= 6) out[k] = v;
  }
  return out;
}
async function campaignByToken(token) {
  const c = await one(
    `select c.id, c.title, c.status, c.school_id, c.created_at, s.name as school_name
       from campaigns c join schools s on s.id = c.school_id where c.token = $1`, [String(token || '')]);
  if (!c) fail(404, 'Dieser Link ist ungültig. Bitte den Link der Schulleitung prüfen.');
  return c;
}
async function myResponses(pid) {
  return q(`select r.id, r.campaign_id, r.status, r.context, r.answers, r.custom_answers, r.created_at, r.updated_at, r.submitted_at,
                   c.title as campaign_title, c.status as campaign_status, c.token as campaign_token, c.custom_block
              from responses r join campaigns c on c.id = r.campaign_id
             where r.participant_id = $1 order by r.created_at asc`, [pid]);
}
async function ensureResponse(p, campaign, context) {
  let r = await one(`select id from responses where participant_id = $1 and campaign_id = $2`, [p.pid, campaign.id]);
  if (!r) {
    if (campaign.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
    // Kontextangaben aus der letzten Teilnahme übernehmen
    const prev = await one(`select context from responses where participant_id = $1 order by created_at desc limit 1`, [p.pid]);
    r = { id: newId() };
    await q(`insert into responses (id, participant_id, campaign_id, instrument_version, context) values ($1,$2,$3,$4,$5)`,
      [r.id, p.pid, campaign.id, ITEMS.version, JSON.stringify(cleanContext(context || (prev && prev.context) || {}))]);
  }
  return r.id;
}

async function aggregateFor(campaignId, stufe) {
  const all = await q(`select context->>'stufe' as stufe, answers, custom_answers from responses where campaign_id = $1 and status = 'submitted'`, [campaignId]);
  const camp = await one(`select custom_block from campaigns where id = $1`, [campaignId]);
  const counts = {};
  all.forEach((r) => { if (r.stufe) counts[r.stufe] = (counts[r.stufe] || 0) + 1; });
  const stufen = Object.entries(counts).filter(([, n]) => n >= MIN).map(([s, n]) => ({ stufe: s, n })).sort((a, b) => a.stufe.localeCompare(b.stufe));
  const recs = stufe ? all.filter((r) => r.stufe === stufe) : all;
  if (recs.length < MIN) return { n: recs.length, total: all.length, tooFew: true, min: MIN, testMode: MIN < DKCore.MIN_GROUP, stufen };
  const agg = DKCore.aggregate(ITEMS, recs.map((r) => ({ answers: r.answers })));
  const custom = camp && camp.custom_block ? { block: camp.custom_block, ...aggregateCustom(camp.custom_block, recs.map((r) => r.custom_answers)) } : null;
  return { n: recs.length, total: all.length, tooFew: false, min: MIN, testMode: MIN < DKCore.MIN_GROUP, stufen, agg, custom };
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
on('GET', 'c/:token', async ({ params }) => {
  const c = await campaignByToken(params.token);
  return { campaign: { title: c.title, status: c.status }, school: { name: c.school_name } };
});

// Lehrperson: erstmals teilnehmen → Code erzeugen
on('POST', 'c/:token/start', async ({ params, body, res }) => {
  const c = await campaignByToken(params.token);
  if (c.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
  const code = newCode();
  const pid = newId();
  await q(`insert into participants (id, school_id, code_hash, code_enc) values ($1,$2,$3,$4)`, [pid, c.school_id, hashCode(code), encryptCode(code)]);
  partSession(res, { pid, sid: c.school_id }, body.remember);
  const rid = await ensureResponse({ pid }, c, body.context);
  return { code, responseId: rid };
});

// Lehrperson: mit Code anmelden (optional im Kontext einer Erhebung)
on('POST', 'code-login', async ({ body, res }) => {
  const p = await one(`select id, school_id, code_enc from participants where code_hash = $1`, [hashCode(body.code)]);
  if (!p) fail(404, 'Dieser Code ist nicht bekannt. Bitte die Schreibweise prüfen.');
  if (!p.code_enc) await q(`update participants set code_enc = $1 where id = $2`, [encryptCode(formatCode(body.code)), p.id]);
  if (body.token) {
    const c = await campaignByToken(body.token);
    if (c.school_id !== p.school_id) fail(403, 'Dieser Code gehört zu einer anderen Schule.');
  }
  partSession(res, { pid: p.id, sid: p.school_id }, body.remember);
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
  if (c.school_id !== p.sid) fail(403, 'Dieser Code gehört zu einer anderen Schule.');
  return { responseId: await ensureResponse(p, c, body.context) };
});

on('PUT', 'me/responses/:id', async ({ req, params, body }) => {
  const p = participant(req);
  const r = await one(`select r.id, c.status as cstatus, c.custom_block from responses r join campaigns c on c.id = r.campaign_id where r.id = $1 and r.participant_id = $2`, [params.id, p.pid]);
  if (!r) fail(404, 'Teilnahme nicht gefunden.');
  if (r.cstatus !== 'open') fail(409, 'Die Erhebung ist abgeschlossen. Antworten lassen sich nicht mehr ändern.');
  const answers = cleanAnswers(body.answers);
  const custom = cleanCustomAnswers(r.custom_block, body.custom_answers);
  await q(`update responses set answers = $1, context = $2, custom_answers = $3, updated_at = now() where id = $4`,
    [JSON.stringify(answers), JSON.stringify(cleanContext(body.context)), JSON.stringify(custom), r.id]);
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
on('POST', 'auth/login', async ({ body, res }) => {
  const u = await one(`select u.*, s.name as school_name from users u left join schools s on s.id = u.school_id where u.username = $1`, [String(body.username || '').trim().toLowerCase()]);
  if (!u || !(await verifyPassword(String(body.password || ''), u.password_hash))) fail(401, 'Benutzername oder Passwort ist falsch.');
  await q(`update users set last_login = now() where id = $1`, [u.id]);
  setSession(res, COOKIE_STAFF, { uid: u.id, role: u.role, sid: u.school_id }, 8);
  return { role: u.role, mustChangePassword: u.must_change_password };
});
on('POST', 'auth/logout', async ({ res }) => { clearSession(res, COOKIE_STAFF); return { ok: true }; });
on('GET', 'auth/me', async ({ req }) => {
  const s = staff(req);
  const u = await one(`select u.username, u.display_name, u.role, u.must_change_password, s.name as school_name from users u left join schools s on s.id = u.school_id where u.id = $1`, [s.uid]);
  if (!u) fail(401, 'Bitte anmelden.');
  return u;
});
on('POST', 'auth/password', async ({ req, body }) => {
  const s = staff(req);
  const u = await one(`select password_hash from users where id = $1`, [s.uid]);
  if (!(await verifyPassword(String(body.old || ''), u.password_hash))) fail(400, 'Das bisherige Passwort ist falsch.');
  if (String(body.new || '').length < 10) fail(400, 'Das neue Passwort muss mindestens 10 Zeichen lang sein.');
  await q(`update users set password_hash = $1, must_change_password = false where id = $2`, [await hashPassword(body.new), s.uid]);
  return { ok: true };
});

// Schulleitung: Erhebungen
on('GET', 'leitung/campaigns', async ({ req }) => {
  const s = staff(req, 'leitung');
  return q(`select c.id, c.title, c.token, c.status, c.created_at, c.closed_at, c.custom_block,
                   count(r.id) filter (where r.status = 'submitted')::int as submitted,
                   count(r.id) filter (where r.status = 'draft')::int as drafts
              from campaigns c left join responses r on r.campaign_id = c.id
             where c.school_id = $1 group by c.id order by c.created_at desc`, [s.sid]);
});
on('POST', 'leitung/campaigns', async ({ req, body }) => {
  const s = staff(req, 'leitung');
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) fail(400, 'Bitte einen Titel angeben, zum Beispiel «Herbst 2026».');
  let block = null;
  if (body.copyBlockFrom) {
    const src = await one(`select custom_block from campaigns where id = $1 and school_id = $2`, [body.copyBlockFrom, s.sid]);
    block = src ? src.custom_block : null; // gleiche Fragen-IDs: Vergleich zwischen Erhebungen bleibt möglich
  }
  const id = newId();
  await q(`insert into campaigns (id, school_id, title, token, custom_block) values ($1,$2,$3,$4,$5)`, [id, s.sid, title, newToken(), block ? JSON.stringify(block) : null]);
  return { id };
});
on('PATCH', 'leitung/campaigns/:id', async ({ req, params, body }) => {
  const s = staff(req, 'leitung');
  const c = await one(`select id from campaigns where id = $1 and school_id = $2`, [params.id, s.sid]);
  if (!c) fail(404, 'Erhebung nicht gefunden.');
  if (body.status === 'open' || body.status === 'closed') {
    await q(`update campaigns set status = $1, closed_at = case when $1 = 'closed' then now() else null end where id = $2`, [body.status, c.id]);
  }
  if (typeof body.title === 'string' && body.title.trim()) await q(`update campaigns set title = $1 where id = $2`, [body.title.trim().slice(0, 80), c.id]);
  return { ok: true };
});
on('PUT', 'leitung/campaigns/:id/block', async ({ req, params, body }) => {
  const s = staff(req, 'leitung');
  const c = await one(`select c.id, (select count(*)::int from responses r where r.campaign_id = c.id and r.status = 'submitted') as submitted
                         from campaigns c where c.id = $1 and c.school_id = $2`, [params.id, s.sid]);
  if (!c) fail(404, 'Erhebung nicht gefunden.');
  if (c.submitted > 0) fail(409, 'Es gibt bereits abgeschlossene Teilnahmen. Die Fragen lassen sich darum nicht mehr ändern. Für neue Fragen eine neue Erhebung eröffnen.');
  const v = validateBlock(body.block);
  if (v.error) fail(400, v.error);
  await q(`update campaigns set custom_block = $1 where id = $2`, [v.block ? JSON.stringify(v.block) : null, c.id]);
  return { block: v.block };
});
on('GET', 'leitung/campaigns/:id/aggregate', async ({ req, params, query }) => {
  const s = staff(req, 'leitung');
  const c = await one(`select id, title from campaigns where id = $1 and school_id = $2`, [params.id, s.sid]);
  if (!c) fail(404, 'Erhebung nicht gefunden.');
  return { campaign: c, ...(await aggregateFor(c.id, query.stufe || '')) };
});

// AVS: Schulen und Zugänge
on('GET', 'admin/schools', async ({ req }) => {
  staff(req, 'admin');
  return q(`select s.id, s.name, s.created_at,
                   (select count(*)::int from users u where u.school_id = s.id) as users,
                   (select count(*)::int from campaigns c where c.school_id = s.id) as campaigns,
                   (select count(*)::int from participants p where p.school_id = s.id) as participants
              from schools s order by s.name`);
});
on('POST', 'admin/schools', async ({ req, body }) => {
  staff(req, 'admin');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen der Schule angeben.');
  const id = newId();
  await q(`insert into schools (id, name) values ($1,$2)`, [id, name]);
  return { id };
});
on('DELETE', 'admin/schools/:id', async ({ req, params }) => {
  staff(req, 'admin');
  await q(`delete from schools where id = $1`, [params.id]);
  return { ok: true };
});
on('GET', 'admin/schools/:id/users', async ({ req, params }) => {
  staff(req, 'admin');
  return q(`select id, username, display_name, must_change_password, created_at, last_login from users where school_id = $1 order by username`, [params.id]);
});
on('POST', 'admin/schools/:id/users', async ({ req, params, body }) => {
  staff(req, 'admin');
  const username = String(body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'Benutzername: 3 bis 40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich.');
  if (await one(`select 1 from users where username = $1`, [username])) fail(409, 'Dieser Benutzername ist bereits vergeben.');
  if (!(await one(`select 1 from schools where id = $1`, [params.id]))) fail(404, 'Schule nicht gefunden.');
  const password = newPassword();
  await q(`insert into users (id, school_id, role, username, display_name, password_hash) values ($1,$2,'leitung',$3,$4,$5)`,
    [newId(), params.id, username, String(body.display_name || '').trim().slice(0, 80) || null, await hashPassword(password)]);
  return { username, password };
});
on('POST', 'admin/users/:id/reset', async ({ req, params }) => {
  staff(req, 'admin');
  const u = await one(`select username from users where id = $1 and role = 'leitung'`, [params.id]);
  if (!u) fail(404, 'Konto nicht gefunden.');
  const password = newPassword();
  await q(`update users set password_hash = $1, must_change_password = true where id = $2`, [await hashPassword(password), params.id]);
  return { username: u.username, password };
});
on('DELETE', 'admin/users/:id', async ({ req, params }) => {
  staff(req, 'admin');
  await q(`delete from users where id = $1 and role = 'leitung'`, [params.id]);
  return { ok: true };
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

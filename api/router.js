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
  const roles = [].concat(role || []);
  if (roles.length && !roles.includes(s.role)) fail(403, 'Für diese Funktion fehlt die Berechtigung.');
  return s;
}
// Rektorat (traeger) oder Schulleitung (leitung): Rolle, Träger und Schule immer frisch aus der Datenbank
async function lead(req) {
  const s = staff(req, ['traeger', 'leitung']);
  const u = await one(`select u.id, u.role, u.school_id, coalesce(u.traeger_id, sc.traeger_id) as traeger_id
                         from users u left join schools sc on sc.id = u.school_id where u.id = $1`, [s.uid]);
  if (!u || !u.traeger_id) fail(401, 'Bitte anmelden.');
  return { uid: u.id, role: u.role, tid: u.traeger_id, sid: u.role === 'leitung' ? u.school_id : null };
}
function participant(req) {
  const s = getSession(req, COOKIE_PART);
  if (!s) fail(401, 'Bitte mit dem persönlichen Code anmelden.');
  return s;
}
const ZYKLEN = { primar: ['Zyklus 1', 'Zyklus 2', 'Zyklusübergreifend'], sek: ['Zyklus 3'] };
function cleanContext(c, kind) {
  const out = {};
  ['funktion', 'erfahrung'].forEach((k) => {
    if (c && typeof c[k] === 'string' && c[k].trim()) out[k] = c[k].trim().slice(0, 80);
  });
  // Bezirksschulen: immer Zyklus 3. Gemeindeschulen: Zyklus 1, 2 oder zyklusübergreifend (freiwillig)
  if (kind === 'sek') out.zyklus = 'Zyklus 3';
  else if (c && ZYKLEN.primar.includes(c.zyklus)) out.zyklus = c.zyklus;
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
    `select c.id, c.title, c.status, c.custom_block, c.traeger_id, l.id as link_id, l.school_id,
            s.name as school_name, t.name as traeger_name, t.kind
       from campaign_links l join campaigns c on c.id = l.campaign_id
       join schools s on s.id = l.school_id join traeger t on t.id = c.traeger_id
      where l.token = $1`, [String(token || '')]);
  if (!c) fail(404, 'Dieser Link ist ungültig. Bitte den Link der Schulleitung prüfen.');
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
                   t.kind as traeger_kind, s.name as school_name
              from responses r join campaigns c on c.id = r.campaign_id
              left join campaign_links l on l.id = r.link_id
              left join traeger t on t.id = c.traeger_id
              left join schools s on s.id = r.school_id
             where r.participant_id = $1 order by r.created_at asc`, [pid]);
}
async function ensureResponse(p, campaign, context) {
  let r = await one(`select id from responses where participant_id = $1 and campaign_id = $2`, [p.pid, campaign.id]);
  if (!r) {
    if (campaign.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
    // Kontextangaben aus der letzten Teilnahme übernehmen
    const prev = await one(`select context from responses where participant_id = $1 order by created_at desc limit 1`, [p.pid]);
    r = { id: newId() };
    await q(`insert into responses (id, participant_id, campaign_id, instrument_version, context, school_id, link_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, p.pid, campaign.id, ITEMS.version, JSON.stringify(cleanContext(context || (prev && prev.context) || {}, campaign.kind)), campaign.school_id, campaign.link_id]);
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
on('GET', 'c/:token', async ({ params }) => {
  const c = await campaignByToken(params.token);
  return { campaign: { title: c.title, status: c.status }, school: { name: c.school_name }, traeger: { name: c.traeger_name, kind: c.kind } };
});

// Lehrperson: erstmals teilnehmen → Code erzeugen
on('POST', 'c/:token/start', async ({ params, body, res }) => {
  const c = await campaignByToken(params.token);
  if (c.status !== 'open') fail(409, 'Diese Erhebung ist abgeschlossen.');
  const code = newCode();
  const pid = newId();
  await q(`insert into participants (id, school_id, traeger_id, code_hash, code_enc) values ($1,$2,$3,$4,$5)`, [pid, c.school_id, c.traeger_id, hashCode(code), encryptCode(code)]);
  partSession(res, { pid, sid: c.school_id, tid: c.traeger_id }, body.remember);
  const rid = await ensureResponse({ pid }, c, body.context);
  return { code, responseId: rid };
});

// Lehrperson: mit Code anmelden (optional im Kontext einer Erhebung). Der Code gilt innerhalb des ganzen Schulträgers.
on('POST', 'code-login', async ({ body, res }) => {
  const p = await one(`select p.id, p.school_id, coalesce(p.traeger_id, s.traeger_id) as traeger_id, p.code_enc
                         from participants p left join schools s on s.id = p.school_id where p.code_hash = $1`, [hashCode(body.code)]);
  if (!p) fail(404, 'Dieser Code ist nicht bekannt. Bitte die Schreibweise prüfen.');
  if (!p.code_enc) await q(`update participants set code_enc = $1 where id = $2`, [encryptCode(formatCode(body.code)), p.id]);
  if (body.token) {
    const c = await campaignByToken(body.token);
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
  const r = await one(`select r.id, c.status as cstatus, c.custom_block, t.kind from responses r join campaigns c on c.id = r.campaign_id
                         left join traeger t on t.id = c.traeger_id where r.id = $1 and r.participant_id = $2`, [params.id, p.pid]);
  if (!r) fail(404, 'Teilnahme nicht gefunden.');
  if (r.cstatus !== 'open') fail(409, 'Die Erhebung ist abgeschlossen. Antworten lassen sich nicht mehr ändern.');
  const answers = cleanAnswers(body.answers);
  const custom = cleanCustomAnswers(r.custom_block, body.custom_answers);
  await q(`update responses set answers = $1, context = $2, custom_answers = $3, updated_at = now() where id = $4`,
    [JSON.stringify(answers), JSON.stringify(cleanContext(body.context, r.kind)), JSON.stringify(custom), r.id]);
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
  const u = await one(`select u.username, u.display_name, u.role, u.must_change_password, s.name as school_name, t.name as traeger_name, t.kind as traeger_kind
                         from users u left join schools s on s.id = u.school_id left join traeger t on t.id = coalesce(u.traeger_id, s.traeger_id) where u.id = $1`, [s.uid]);
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
  if (!canManage(u, c)) fail(403, 'Diese Erhebung wurde vom Rektorat eröffnet. Änderungen nimmt das Rektorat vor.');
  return c;
}

on('GET', 'leitung/context', async ({ req }) => {
  const u = await lead(req);
  const traeger = await one(`select id, name, kind from traeger where id = $1`, [u.tid]);
  const schools = u.role === 'traeger'
    ? await q(`select id, name from schools where traeger_id = $1 order by name`, [u.tid])
    : await q(`select id, name from schools where id = $1`, [u.sid]);
  const rounds = await q(`select id, title, active from rounds order by created_at desc`);
  return { role: u.role, traeger, schools, rounds, min: MIN };
});

on('GET', 'leitung/campaigns', async ({ req }) => {
  const u = await lead(req);
  const camps = await q(`select c.id, c.title, c.status, c.created_at, c.closed_at, c.custom_block, c.round_id, r.title as round_title,
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
  const id = newId();
  await q(`insert into campaigns (id, traeger_id, owner_school_id, school_id, round_id, title, token, custom_block) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, u.tid, u.role === 'leitung' ? u.sid : null, u.role === 'leitung' ? u.sid : null, round ? round.id : null, title, newToken(), block ? JSON.stringify(block) : null]);
  for (const sid of schoolIds) await q(`insert into campaign_links (id, campaign_id, school_id, token) values ($1,$2,$3,$4)`, [newId(), id, sid, newToken()]);
  return { id };
});

on('PATCH', 'leitung/campaigns/:id', async ({ req, params, body }) => {
  const u = await lead(req);
  const c = await manageableCampaign(u, params.id);
  if (body.status === 'open' || body.status === 'closed') {
    await q(`update campaigns set status = $1, closed_at = case when $1 = 'closed' then now() else null end where id = $2`, [body.status, c.id]);
  }
  if (typeof body.title === 'string' && body.title.trim()) await q(`update campaigns set title = $1 where id = $2`, [body.title.trim().slice(0, 80), c.id]);
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
  const links = await q(`select l.school_id, l.expected, s.name from campaign_links l join schools s on s.id = l.school_id
                          where l.campaign_id = any($1) ${school ? 'and l.school_id = $2' : ''}`, school ? [ids, school] : [ids]);
  const names = Object.fromEntries(links.map((l) => [l.school_id, l.name]));
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
  const base = { source: { kind, id, title }, total: rows.length, min: MIN, testMode: MIN < DKCore.MIN_GROUP, schools, zyklen, expected,
    open: camps.some((c) => c.status === 'open'), multiSchool: u.role === 'traeger' && links.length > 1 };
  if (recs.length < MIN) return { ...base, n: recs.length, tooFew: true };
  const agg = DKCore.aggregate(ITEMS, recs.map((r) => ({ answers: r.answers })));
  const custom = block ? { block, ...aggregateCustom(block, recs.map((r) => r.custom_answers)) } : null;
  const groups = {
    zyklen: zyklus ? null : compareGroups(recs, zyk),
    schulen: u.role === 'traeger' && !school ? compareGroups(recs, (r) => r.school_id, (k) => names[k] || '–', (a, b) => (names[a] || '').localeCompare(names[b] || '')) : null,
  };
  return { ...base, n: recs.length, tooFew: false, agg, custom, groups };
});

/* ---------- AVS: Träger, Schulen, Zugänge, Runden ---------- */
on('GET', 'admin/traeger', async ({ req }) => {
  staff(req, 'admin');
  const tr = await q(`select t.id, t.name, t.kind, t.created_at,
                             (select count(*)::int from users u where u.traeger_id = t.id) as rektorat,
                             (select count(*)::int from participants p where p.traeger_id = t.id) as participants,
                             (select count(*)::int from campaigns c where c.traeger_id = t.id) as campaigns
                        from traeger t order by t.name`);
  const sc = await q(`select s.id, s.name, s.traeger_id, (select count(*)::int from users u where u.school_id = s.id) as users from schools s order by s.name`);
  return tr.map((t) => ({ ...t, schools: sc.filter((s) => s.traeger_id === t.id) }));
});
on('POST', 'admin/traeger', async ({ req, body }) => {
  staff(req, 'admin');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen des Schulträgers angeben, z. B. «Gemeinde Musterdorf» oder «Bezirk March».');
  const kind = body.kind === 'sek' ? 'sek' : 'primar';
  const id = newId();
  await q(`insert into traeger (id, name, kind) values ($1,$2,$3)`, [id, name, kind]);
  // Ein erstes Schulhaus mit gleichem Namen, damit kleine Träger sofort starten können
  if (body.firstSchool !== false) await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [newId(), String(body.schoolName || name).trim().slice(0, 120), id]);
  return { id };
});
on('PATCH', 'admin/traeger/:id', async ({ req, params, body }) => {
  staff(req, 'admin');
  if (typeof body.name === 'string' && body.name.trim()) await q(`update traeger set name = $1 where id = $2`, [body.name.trim().slice(0, 120), params.id]);
  if (body.kind === 'primar' || body.kind === 'sek') await q(`update traeger set kind = $1 where id = $2`, [body.kind, params.id]);
  return { ok: true };
});
on('DELETE', 'admin/traeger/:id', async ({ req, params }) => {
  staff(req, 'admin');
  await q(`delete from traeger where id = $1`, [params.id]);
  return { ok: true };
});
on('POST', 'admin/traeger/:id/schools', async ({ req, params, body }) => {
  staff(req, 'admin');
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) fail(400, 'Bitte den Namen der Schule bzw. des Schulhauses angeben.');
  if (!(await one(`select 1 from traeger where id = $1`, [params.id]))) fail(404, 'Schulträger nicht gefunden.');
  const id = newId();
  await q(`insert into schools (id, name, traeger_id) values ($1,$2,$3)`, [id, name, params.id]);
  return { id };
});
on('DELETE', 'admin/schools/:id', async ({ req, params }) => {
  staff(req, 'admin');
  await q(`delete from schools where id = $1`, [params.id]);
  return { ok: true };
});
on('GET', 'admin/traeger/:id/users', async ({ req, params }) => {
  staff(req, 'admin');
  return q(`select u.id, u.username, u.display_name, u.role, u.must_change_password, u.created_at, u.last_login, s.name as school_name
              from users u left join schools s on s.id = u.school_id
             where u.traeger_id = $1 or s.traeger_id = $1 order by u.role desc, s.name nulls first, u.username`, [params.id]);
});
// Zugang anlegen: ohne Schule = Rektorat/Hauptschulleitung des Trägers, mit Schule = Schulleitung
on('POST', 'admin/traeger/:id/users', async ({ req, params, body }) => {
  staff(req, 'admin');
  const username = String(body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'Benutzername: 3 bis 40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich.');
  if (await one(`select 1 from users where username = $1`, [username])) fail(409, 'Dieser Benutzername ist bereits vergeben.');
  if (!(await one(`select 1 from traeger where id = $1`, [params.id]))) fail(404, 'Schulträger nicht gefunden.');
  let schoolId = null;
  if (body.schoolId) {
    const sc = await one(`select id from schools where id = $1 and traeger_id = $2`, [body.schoolId, params.id]);
    if (!sc) fail(404, 'Schule nicht gefunden.');
    schoolId = sc.id;
  }
  const password = newPassword();
  await q(`insert into users (id, school_id, traeger_id, role, username, display_name, password_hash) values ($1,$2,$3,$4,$5,$6,$7)`,
    [newId(), schoolId, schoolId ? null : params.id, schoolId ? 'leitung' : 'traeger', username, String(body.display_name || '').trim().slice(0, 80) || null, await hashPassword(password)]);
  return { username, password };
});
on('POST', 'admin/users/:id/reset', async ({ req, params }) => {
  staff(req, 'admin');
  const u = await one(`select username from users where id = $1 and role in ('leitung','traeger')`, [params.id]);
  if (!u) fail(404, 'Konto nicht gefunden.');
  const password = newPassword();
  await q(`update users set password_hash = $1, must_change_password = true where id = $2`, [await hashPassword(password), params.id]);
  return { username: u.username, password };
});
on('DELETE', 'admin/users/:id', async ({ req, params }) => {
  staff(req, 'admin');
  await q(`delete from users where id = $1 and role in ('leitung','traeger')`, [params.id]);
  return { ok: true };
});

on('GET', 'admin/rounds', async ({ req }) => {
  staff(req, 'admin');
  return q(`select r.id, r.title, r.active, r.created_at,
                   (select count(distinct l.school_id)::int from campaigns c join campaign_links l on l.campaign_id = c.id where c.round_id = r.id) as schools,
                   (select count(*)::int from responses x join campaigns c on c.id = x.campaign_id where c.round_id = r.id and x.status = 'submitted') as submitted
              from rounds r order by r.created_at desc`);
});
on('POST', 'admin/rounds', async ({ req, body }) => {
  staff(req, 'admin');
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) fail(400, 'Bitte einen Titel angeben, z. B. «Erste Runde 2026/27».');
  const id = newId();
  await q(`insert into rounds (id, title) values ($1,$2)`, [id, title]);
  return { id };
});
on('PATCH', 'admin/rounds/:id', async ({ req, params, body }) => {
  staff(req, 'admin');
  if (typeof body.active === 'boolean') await q(`update rounds set active = $1 where id = $2`, [body.active, params.id]);
  if (typeof body.title === 'string' && body.title.trim()) await q(`update rounds set title = $1 where id = $2`, [body.title.trim().slice(0, 80), params.id]);
  return { ok: true };
});

/* AVS: kantonale Auswertung ohne Bezug zu Schulen oder Trägern.
 * Keine Filter oder Gruppen nach Schule/Träger, keine eigenen Fragen der Schulen, keine Freitexte.
 * Jede Person zählt einmal (jüngste abgeschlossene Teilnahme im gewählten Zeitraum). */
const ERFAHRUNG_ORDER = ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'];
on('GET', 'admin/aggregate', async ({ req, query }) => {
  staff(req, 'admin');
  const round = String(query.round || '');
  const zyklus = String(query.zyklus || '');
  const rows = await q(`select distinct on (r.participant_id) r.context, r.answers, r.school_id, c.traeger_id
                          from responses r join campaigns c on c.id = r.campaign_id
                         where r.status = 'submitted' ${round ? 'and c.round_id = $1' : ''}
                         order by r.participant_id, r.submitted_at desc`, round ? [round] : []);
  const zyklen = filterOptions(rows, zyk).map((x) => ({ zyklus: x.key, n: x.n }));
  if (zyklus && !zyklen.some((x) => x.zyklus === zyklus)) fail(403, 'Für diesen Zyklus ist keine Einzelauswertung möglich.');
  const recs = zyklus ? rows.filter((r) => zyk(r) === zyklus) : rows;
  const base = { total: rows.length, min: MIN, testMode: MIN < DKCore.MIN_GROUP, zyklen,
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

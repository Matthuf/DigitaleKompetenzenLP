import { readFileSync, existsSync } from 'node:fs';
import { client, checker, adminClient, invitedClient } from './lib.mjs';

// Einladungen per E-Mail: Versand, Status (verschickt, angenommen), erneut senden, ohne Adresse
export default async function (B, env) {
  const { ok, expectErr, res } = checker('E-Mail-Versand');
  const outbox = () => (existsSync(env.MAIL_OUTBOX) ? readFileSync(env.MAIL_OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
  const tokenIn = (m) => (m.text.match(/\/einladung\/([A-Za-z0-9_-]+)/) || [])[1];

  const ad = await adminClient(B);
  const { id: tid } = await ad('POST', 'admin/traeger', { name: 'Gemeinde Post', kind: 'primar', schoolName: 'Schulhaus A' });
  // AVS lädt das Rektorat ein: E-Mail vom AVS
  const invR = await ad('POST', `admin/traeger/${tid}/invitations`, { name: 'Rita Rektorin', email: 'rita@post.ch' });
  let box = outbox();
  ok(invR.mail.status === 'sent' && box.length === 1 && box[0].to === 'rita@post.ch', 'AVS-Einladung verschickt');
  ok(/Rektorat\/Hauptschulleitung Gemeinde Post/.test(box[0].text) && /avs@sz\.ch/.test(box[0].text) && tokenIn(box[0]) === invR.token, 'Text: Rolle, Kontakt AVS, gültiger Link');
  const rek = client(B);
  await rek('POST', 'invite/' + tokenIn(box[0]), { username: 'rita', password: 'passwort-test-123', display_name: 'Rita Rektorin' });
  ok((await rek('GET', 'leitung/context')).mail === true, 'Oberfläche weiss, dass der Versand eingerichtet ist');
  const sa = (await rek('GET', 'leitung/team')).schools[0].id;

  // Rektorat lädt Schulleitung ein
  const invS = await rek('POST', 'leitung/invitations', { role: 'leitung', schoolId: sa, name: 'Sam Schulleiter', email: 'sam@post.ch' });
  box = outbox();
  const m = box[box.length - 1];
  ok(invS.mail.status === 'sent' && m.to === 'sam@post.ch' && m.replyTo === 'rita@post.ch', 'Einladung an Schulleitung verschickt, Antwort geht ans Rektorat');
  ok(/Schulleitung Schulhaus A/.test(m.text) && /Rita Rektorin\nRektorat\/Hauptschulleitung Gemeinde Post/.test(m.text), 'Text: Rolle und Absender mit Namen');
  let team = await rek('GET', 'leitung/team');
  let i = team.invites.find((x) => x.id === invS.id);
  ok(i.mail_status === 'sent' && i.mail_sent_at, 'Status «verschickt» mit Zeitpunkt');

  // Erneut senden: neuer Link per E-Mail, alter Link ungültig
  const old = tokenIn(m);
  const ren = await rek('POST', `leitung/invitations/${invS.id}/renew`);
  box = outbox();
  ok(ren.mail.status === 'sent' && box.length === 3 && tokenIn(box[2]) !== old, 'Erneut senden verschickt einen neuen Link');
  await expectErr(client(B)('GET', 'invite/' + old), 404, 'Alter Link nach erneutem Senden ungültig');

  // Annehmen: Zugang aktiv
  const sam = client(B);
  await sam('POST', 'invite/' + tokenIn(box[2]), { username: 'sam', password: 'passwort-test-123' });
  team = await rek('GET', 'leitung/team');
  ok(!team.invites.some((x) => x.id === invS.id) && team.users.some((u) => u.username === 'sam' && u.created_at), 'Nach dem Annehmen: Zugang aktiv, Einladung erledigt');

  // Ohne E-Mail-Adresse: nichts verschickt, Link zum Weitergeben
  const n0 = outbox().length;
  const invN = await rek('POST', 'leitung/invitations', { role: 'traeger', name: 'Verwaltung ohne Mail' });
  ok(invN.mail.status === null && outbox().length === n0 && invN.token, 'Ohne Adresse: kein Versand, Link wird zurückgegeben');
  const invQ = await rek('POST', 'leitung/invitations', { role: 'traeger', name: 'Still', email: 'still@post.ch', send: false });
  ok(invQ.mail.status === null && outbox().length === n0, 'Versand lässt sich ausdrücklich unterdrücken');

  // Protokoll
  const log = await ad('GET', 'admin/audit');
  ok(log.some((l) => l.action === 'einladung_verschickt' && l.target === 'sam@post.ch'), 'Versand im Protokoll');
  return res;
}

// Fehlerfall: E-Mail-Dienst nicht erreichbar
export async function failing(B) {
  const { ok, res } = checker('E-Mail-Versand Fehler');
  const ad = await adminClient(B);
  const { id: tid } = await ad('POST', 'admin/traeger', { name: 'Gemeinde Fehler', kind: 'primar' });
  const inv = await ad('POST', `admin/traeger/${tid}/invitations`, { name: 'Xaver', email: 'x@fehler.ch' });
  ok(inv.mail.status === 'failed' && /nicht erreichbar/.test(inv.mail.error) && inv.token, 'Dienst nicht erreichbar: Status «fehlgeschlagen», Link bleibt verfügbar');
  const list = await ad('GET', `admin/traeger/${tid}/invitations`);
  ok(list[0].mail_status === 'failed' && list[0].mail_error, 'Fehler in der Liste sichtbar');
  return res;
}

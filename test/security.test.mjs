import { client, checker, invitedClient, teacher, ADMIN } from './lib.mjs';

// Sicherheit und Datenschutz. Ohne Mindestgruppe: Auswertungen ab der ersten Teilnahme,
// Freitexte bei eigenen Fragen weiterhin erst ab 10 Antworten.
export default async function (B) {
  const { ok, expectErr, res } = checker('Sicherheit');

  // Startkonto AVS: erst nach Passwortwechsel nutzbar
  const ad = client(B);
  const login = await ad('POST', 'auth/login', { username: ADMIN.username, password: ADMIN.start });
  ok(login.mustChangePassword === true, 'Startkonto AVS muss das Passwort wechseln');
  await expectErr(ad('GET', 'admin/traeger'), 403, 'Vor dem Passwortwechsel keine Verwaltung');
  ok((await ad('GET', 'auth/me')).must_change_password, 'auth/me bleibt erreichbar');
  await ad('POST', 'auth/password', { old: ADMIN.start, new: ADMIN.password });
  ok(Array.isArray(await ad('GET', 'admin/traeger')), 'Nach dem Passwortwechsel Verwaltung erreichbar');
  await expectErr(ad('POST', 'admin/traeger/x/users', { username: 'direkt' }), 404, 'Direktes Anlegen mit Passwort gibt es nicht mehr');

  // Aufbau: Träger mit zwei Schulen, Runde
  const { id: round } = await ad('POST', 'admin/rounds', { title: 'Runde Test' });
  const { id: tid } = await ad('POST', 'admin/traeger', { name: 'Gemeinde Sicher', kind: 'primar', schoolName: 'Schulhaus A' });
  await ad('POST', `admin/traeger/${tid}/schools`, { name: 'Schulhaus B' });
  const sch = Object.fromEntries((await ad('GET', 'admin/traeger')).find((t) => t.id === tid).schools.map((s) => [s.name, s.id]));
  const rek = await invitedClient(B, ad, tid, 'rektor.sicher');
  const slB = await invitedClient(B, ad, tid, 'sl.b', sch['Schulhaus B']);

  // Sitzungen widerrufen: Passwortwechsel beendet andere Sitzungen, Löschen beendet alle
  const rek2 = client(B);
  await rek2('POST', 'auth/login', { username: 'rektor.sicher', password: 'passwort-test-123' });
  await rek('POST', 'auth/password', { old: 'passwort-test-123', new: 'passwort-neu-456' });
  await expectErr(rek2('GET', 'leitung/context'), 401, 'Zweite Sitzung nach Passwortwechsel beendet');
  ok((await rek('GET', 'leitung/context')).role === 'traeger', 'Eigene Sitzung bleibt nach Passwortwechsel angemeldet');
  const tmp = await invitedClient(B, ad, tid, 'sl.temp', sch['Schulhaus A']);
  const tmpId = (await rek('GET', 'leitung/team')).users.find((u) => u.username === 'sl.temp').id;
  await rek('DELETE', 'leitung/users/' + tmpId);
  await expectErr(tmp('GET', 'leitung/context'), 401, 'Gelöschtes Konto: Sitzung sofort ungültig');

  // Passwort-Link: 24 Stunden, beendet bestehende Sitzungen
  const slId = (await rek('GET', 'leitung/team')).users.find((u) => u.username === 'sl.b').id;
  const rs = await rek('POST', `leitung/users/${slId}/reset`);
  const hours = (new Date(rs.expires_at) - Date.now()) / 3600e3;
  ok(hours > 23.5 && hours <= 24.1, `Passwort-Link gilt 24 Stunden (${hours.toFixed(1)} h)`);
  await expectErr(client(B)('POST', 'invite/' + rs.token, { password: 'x'.repeat(300) }), 400, 'Überlanges Passwort abgelehnt');
  const slB2 = client(B);
  await slB2('POST', 'invite/' + rs.token, { password: 'passwort-sl-neu-1' });
  await expectErr(slB('GET', 'leitung/context'), 401, 'Passwort-Link beendet alte Sitzungen');

  // Einladung gleichzeitig zweimal einlösen: nur eine gewinnt
  const inv = await ad('POST', `admin/traeger/${tid}/invitations`, { name: 'Doppelt', email: 'doppelt@example.ch' });
  const both = await Promise.allSettled([
    client(B)('POST', 'invite/' + inv.token, { username: 'doppelt.a', password: 'passwort-test-123' }),
    client(B)('POST', 'invite/' + inv.token, { username: 'doppelt.b', password: 'passwort-test-123' }),
  ]);
  const users = (await ad('GET', `admin/traeger/${tid}/users`)).filter((u) => u.username.startsWith('doppelt'));
  ok(both.filter((x) => x.status === 'fulfilled').length === 1 && users.length === 1, 'Einladung gleichzeitig eingelöst: genau ein Konto');

  // Erhebungen: Rektorat für Schule A (Runde), Schulleitung B eigene Erhebung in derselben Runde
  await rek('POST', 'leitung/campaigns', { roundId: round, schoolIds: [sch['Schulhaus A']] });
  await slB2('POST', 'leitung/campaigns', { roundId: round });
  const camps = await rek('GET', 'leitung/campaigns');
  const cA = camps.find((c) => c.links[0].school_id === sch['Schulhaus A']);
  const cB = camps.find((c) => c.links[0].school_id === sch['Schulhaus B']);
  const blk = await rek('PUT', `leitung/campaigns/${cA.id}/block`, { block: { title: 'Fragen', questions: [
    { type: 'scale', text: 'Alle beantworten' }, { type: 'scale', text: 'Wenige beantworten' }, { type: 'text', text: 'Freitext' }] } });
  const [q1, q2, q3] = blk.block.questions.map((q) => q.id);

  // Kontextangaben: nur vorgegebene Werte
  const odd = await teacher(B, cA.links[0].token, { context: { funktion: '<b>Frei erfunden</b>', erfahrung: '5 bis 15 Jahre' }, custom: { [q1]: 3, [q2]: 2, [q3]: 'Ein Satz' } });
  const ctx = (await odd.t('GET', 'me')).responses[0].context;
  ok(!ctx.funktion && ctx.erfahrung === '5 bis 15 Jahre', 'Kontext: freie Werte verworfen, vorgegebene gespeichert');
  for (let i = 0; i < 5; i++) await teacher(B, cA.links[0].token, { custom: { [q1]: 2 + (i % 3), [q3]: 'Antwort ' + i, ...(i === 0 ? { [q2]: 4 } : {}) } });
  for (let i = 0; i < 2; i++) await teacher(B, cB.links[0].token);

  // Eigene Fragen: keine Mindestanzahl, Freitexte erst ab 10
  const aA = await rek('GET', 'leitung/aggregate?source=c:' + cA.id);
  const cq = Object.fromEntries(aA.custom.questions.map((q) => [q.id, q]));
  ok(aA.n === 6 && !aA.tooFew, 'Erhebung A mit 6 Teilnahmen ausgewertet');
  ok(cq[q1].answered === 6 && !cq[q1].suppressed, 'Frage von allen beantwortet: ausgewiesen');
  ok(cq[q2].answered === 2 && !cq[q2].suppressed, 'Frage von 2 beantwortet: ausgewiesen (keine Mindestanzahl)');
  ok(cq[q3].suppressed && cq[q3].texts === undefined, 'Freitexte von 6 Personen: nicht ausgewiesen (mindestens 10)');

  // Ohne Mindestgruppe: auch kleine Erhebungen und die ganze Runde werden ausgewertet
  const aR = await rek('GET', 'leitung/aggregate?source=r:' + round);
  ok(!aR.tooFew && aR.n === 8, 'Runde über beide Schulen ausgewertet');
  const aB = await rek('GET', 'leitung/aggregate?source=c:' + cB.id);
  ok(!aB.tooFew && aB.n === 2, 'Erhebung B mit 2 Teilnahmen ausgewertet');

  // AVS nur pro Runde
  await expectErr(ad('GET', 'admin/aggregate'), 400, 'Kantonale Auswertung ohne Runde abgelehnt');
  const k1 = await ad('GET', 'admin/aggregate?round=' + round);
  ok(k1.tooFew && k1.n === 0 && k1.total === 8 && k1.traegerCount === 1 && !k1.agg, 'Kantonale Auswertung: ein Schulträger reicht nicht (Schwelle 3)');

  // Protokoll
  const log = await ad('GET', 'admin/audit');
  const acts = new Set(log.map((l) => l.action));
  ok(['anmeldung', 'passwort_geaendert', 'einladung_angenommen', 'zugang_geloescht', 'passwort_link_erstellt', 'erhebung_eroeffnet', 'auswertung_angesehen', 'kantonsauswertung_angesehen'].every((a) => acts.has(a)), 'Protokoll enthält die wichtigen Aktionen');
  ok(!JSON.stringify(log).includes(rs.token) && !JSON.stringify(log).includes('passwort-'), 'Protokoll ohne Tokens und Passwörter');
  await expectErr(rek('GET', 'admin/audit'), 403, 'Protokoll nur für das AVS');

  // Missbrauchsschutz
  const att = client(B);
  let status = 0;
  for (let i = 0; i < 12 && status !== 429; i++) { try { await att('POST', 'auth/login', { username: 'rektor.sicher', password: 'falsch-' + i }); } catch (e) { status = e.status; } }
  ok(status === 429, 'Viele falsche Passwörter für ein Konto: gebremst (429)');
  await expectErr(client(B)('POST', 'auth/login', { username: 'gibt.es.nicht', password: 'x' }), 401, 'Unbekanntes Konto: gleiche Meldung wie falsches Passwort');
  status = 0;
  for (let i = 0; i < 35 && status !== 429; i++) { try { await att('GET', 'c/ungueltig' + i); } catch (e) { status = e.status; } }
  ok(status === 429, 'Durchprobieren von Erhebungslinks: gebremst (429)');
  status = 0;
  for (let i = 0; i < 25 && status !== 429; i++) { try { await att('POST', 'code-login', { code: 'AAAA-BBBB-CC' + i }); } catch (e) { status = e.status; } }
  ok(status === 429, 'Durchprobieren von Codes: gebremst (429)');

  // Warnung bei mehr Teilnahmen als erwartet
  await rek('PATCH', 'leitung/links/' + cB.links[0].id, { expected: 1 });
  const lB = (await rek('GET', 'leitung/campaigns')).find((c) => c.id === cB.id).links[0];
  ok(lB.submitted + lB.drafts > lB.expected, 'Daten für Warnung «mehr Teilnahmen als erwartet» vorhanden');
  return res;
}

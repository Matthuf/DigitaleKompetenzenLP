import { client, checker, adminClient, invitedClient, teacher } from './lib.mjs';

// Einladungen, Passwort-Links und Selbstverwaltung der Schulträger
export default async function (B) {
  const { ok, expectErr, res } = checker('Einladungen');
  const ad = await adminClient(B);
  // Import
  const imp = await ad('POST', 'admin/import', { rows: [
    { traeger: 'Bezirk Höfe', kind: 'sek', name: 'Rita Rektorin', email: 'rektorat@hoefe.ch', schools: ['Schulhaus Pfäffikon', 'Schulhaus Wollerau'] },
    { traeger: 'Gemeinde Illgau', kind: 'primar', name: 'Ivo Illgau', email: 'kein-mail', schools: [] },
  ] });
  ok(imp.rows[0].token && imp.rows[0].status.includes('Einladung erstellt') && imp.rows[0].status.includes('2 Schulen'), 'Import: Träger, 2 Schulen, Einladung');
  ok(!imp.rows[1].token && imp.rows[1].status.includes('keine gültige E-Mail'), 'Import: ohne gültige Mail keine Einladung');
  const imp2 = await ad('POST', 'admin/import', { rows: [{ traeger: 'bezirk höfe', kind: 'sek', name: 'Rita Rektorin', email: 'rektorat@hoefe.ch', schools: ['Schulhaus Wollerau', 'Schulhaus Freienbach'] }] });
  ok(imp2.rows[0].status.includes('bereits vorhanden') && imp2.rows[0].status.includes('erneuert') && imp2.rows[0].status.includes('1 Schule'), 'Import wiederholt: kein Duplikat, Einladung erneuert, 1 Schule ergänzt');
  const tr = (await ad('GET', 'admin/traeger')).find((t) => t.name === 'Bezirk Höfe');
  ok(tr.schools.length === 3, 'Bezirk Höfe hat 3 Schulen');
  const pub = client(B);
  await expectErr(pub('GET', 'invite/' + imp.rows[0].token), 404, 'Alter Link nach Erneuerung ungültig');
  const tok = imp2.rows[0].token;
  const info = await pub('GET', 'invite/' + tok);
  ok(info.roleText === 'Schulträger Bezirk Höfe' && info.suggestedUsername === 'rektorat', 'Einladung: Rolle und Vorschlag Benutzername');
  await expectErr(pub('POST', 'invite/' + tok, { username: 'rita', password: 'kurz' }), 400, 'Zu kurzes Passwort abgelehnt');
  const rek = client(B);
  const acc = await rek('POST', 'invite/' + tok, { username: 'rita.rektorin', password: 'sicheres-pw-2026', display_name: 'Rita Rektorin' });
  ok(acc.role === 'traeger', 'Einladung angenommen, angemeldet als Träger');
  await expectErr(pub('POST', 'invite/' + tok, { username: 'x2', password: 'sicheres-pw-2026' }), 410, 'Link nur einmal gültig');
  let team = await rek('GET', 'leitung/team');
  ok(team.schools.length === 3 && team.users.length === 1 && team.users[0].self, 'Team: 3 Schulen, eigener Zugang');
  // Rektorat erfasst Schulhaus, lädt SL und Stellvertretung ein
  await rek('POST', 'leitung/schools', { name: 'Schulhaus Bäch' });
  team = await rek('GET', 'leitung/team');
  const bach = team.schools.find((s) => s.name === 'Schulhaus Bäch'), pf = team.schools.find((s) => s.name === 'Schulhaus Pfäffikon');
  await rek('PATCH', 'leitung/schools/' + bach.id, { name: 'Schulhaus Bäch SZ' });
  const iSL = await rek('POST', 'leitung/invitations', { role: 'leitung', schoolId: pf.id, name: 'Paul Pfäffikon', email: 'sl@pf.ch' });
  const iST = await rek('POST', 'leitung/invitations', { role: 'traeger', name: 'Verwaltung Höfe', email: 'verwaltung@hoefe.ch' });
  const sl = client(B); await sl('POST', 'invite/' + iSL.token, { username: 'paul.pf', password: 'sicheres-pw-2026' });
  const vw = client(B); await vw('POST', 'invite/' + iST.token, { username: 'verwaltung.hoefe', password: 'sicheres-pw-2026' });
  ok((await vw('GET', 'leitung/context')).role === 'traeger', 'Verwaltung hat Trägerzugang');
  ok((await sl('GET', 'leitung/context')).schools.length === 1, 'SL sieht nur eigene Schule');
  // SL lädt Co-Leitung ein; darf keine Trägerrolle vergeben und keine andere Schule
  const iCo = await sl('POST', 'leitung/invitations', { role: 'traeger', schoolId: bach.id, name: 'Co-Leitung' });
  const co = client(B); const coAcc = await co('POST', 'invite/' + iCo.token, { username: 'co.pf', password: 'sicheres-pw-2026' });
  ok(coAcc.role === 'leitung' && (await co('GET', 'leitung/context')).schools[0].id === pf.id, 'SL-Einladung ergibt immer SL der eigenen Schule');
  await expectErr(sl('POST', 'leitung/schools', { name: 'X' }), 403, 'SL kann keine Schulen erfassen');
  team = await rek('GET', 'leitung/team');
  const rita = team.users.find((u) => u.username === 'rita.rektorin');
  await expectErr(sl('POST', `leitung/users/${rita.id}/reset`), 403, 'SL kann Rektorat nicht zurücksetzen');
  await expectErr(sl('DELETE', `leitung/users/${rita.id}`), 403, 'SL kann Rektorat nicht löschen');
  const slTeam = await sl('GET', 'leitung/team');
  ok(slTeam.users.length === 2 && slTeam.users.every((u) => u.role === 'leitung'), 'SL sieht nur Zugänge der eigenen Schule');
  const coU = slTeam.users.find((u) => u.username === 'co.pf');
  const rs = await sl('POST', `leitung/users/${coU.id}/reset`);
  await co('POST', 'invite/' + rs.token, { password: 'neues-pw-2026-xx' });
  const co2 = client(B); await co2('POST', 'auth/login', { username: 'co.pf', password: 'neues-pw-2026-xx' });
  ok(true, 'Passwort-Link der SL für Co-Leitung funktioniert');
  await expectErr(rek('POST', `leitung/users/${rita.id}/reset`), 400, 'Eigenes Konto nicht über Team zurücksetzbar');
  // Andere Träger: kein Zugriff
  const ill = (await ad('GET', 'admin/traeger')).find((t) => t.name === 'Gemeinde Illgau');
  const iIll = await ad('POST', `admin/traeger/${ill.id}/invitations`, { name: 'Ivo', email: 'ivo@illgau.ch' });
  const ivo = client(B); await ivo('POST', 'invite/' + iIll.token, { username: 'ivo', password: 'sicheres-pw-2026' });
  await expectErr(ivo('DELETE', `leitung/users/${rita.id}`), 404, 'Anderer Träger kann fremde Zugänge nicht löschen');
  await expectErr(ivo('PATCH', 'leitung/schools/' + pf.id, { name: 'Hack' }), 404, 'Anderer Träger kann fremde Schulen nicht umbenennen');
  const pend = await rek('POST', 'leitung/invitations', { role: 'leitung', schoolId: pf.id, name: 'Offen' });
  await expectErr(ivo('DELETE', 'leitung/invitations/' + pend.id), 404, 'Anderer Träger kann fremde Einladung nicht löschen');
  const r2 = await rek('POST', `leitung/invitations/${pend.id}/renew`);
  await expectErr(pub('GET', 'invite/' + pend.token), 404, 'Neuer Link macht alten ungültig');
  ok((await pub('GET', 'invite/' + r2.token)).role === 'leitung', 'Neuer Link gültig');
  // Schule mit Erhebung nicht löschbar
  await rek('POST', 'leitung/campaigns', { title: 'Test', schoolIds: [pf.id] });
  await expectErr(rek('DELETE', 'leitung/schools/' + pf.id), 409, 'Schule mit Erhebung nicht löschbar');
  await rek('DELETE', 'leitung/schools/' + bach.id);
  ok(true, 'Leere Schule löschbar');
  // AVS-Reset
  const ar = await ad('POST', `admin/users/${rita.id}/reset`);
  ok(ar.token && ar.email === 'rektorat@hoefe.ch', 'AVS erzeugt Passwort-Link fürs Rektorat');
  return res;
}

import { client, checker, adminClient, invitedClient, teacher } from './lib.mjs';

// Zyklen pro Schulhaus
export default async function (B) {
  const { ok, expectErr, res } = checker('Zyklen');
  const ad = await adminClient(B);
  const imp = await ad('POST', 'admin/import', { rows: [{ traeger: 'Bezirk Einsiedeln', kind: 'gesamt', name: 'Eva', email: 'eva@einsiedeln.ch' }] });
  const rek = client(B); await rek('POST', 'invite/' + imp.rows[0].token, { username: 'eva.e', password: 'sicheres-pw-2026' });
  for (const n of ['Schulhaus Nordstrasse', 'Oberstufenzentrum']) await rek('POST', 'leitung/schools', { name: n });
  const t = (await ad('GET', 'admin/traeger')).find((x) => x.name === 'Bezirk Einsiedeln');
  ok(t.kind === 'gesamt' && t.schools.length === 2 && t.schools.every((s) => s.zyklen.length === 3), 'Träger «gesamt»: Schulhäuser standardmässig Zyklus 1–3');
  let team = await rek('GET', 'leitung/team');
  const obz = team.schools.find((s) => s.name === 'Oberstufenzentrum'), nord = team.schools.find((s) => s.name === 'Schulhaus Nordstrasse');
  await rek('PATCH', 'leitung/schools/' + obz.id, { zyklen: ['Zyklus 3'] });
  await rek('PATCH', 'leitung/schools/' + nord.id, { zyklen: ['Zyklus 1', 'Zyklus 2'] });
  await expectErr(rek('PATCH', 'leitung/schools/' + nord.id, { zyklen: [] }), 400, 'Mindestens ein Zyklus nötig');
  team = await rek('GET', 'leitung/team');
  ok(team.schools.find((s) => s.id === obz.id).zyklen.join() === 'Zyklus 3', 'Oberstufenzentrum: Zyklus 3');
  await rek('POST', 'leitung/campaigns', { title: 'Test' });
  const c = (await rek('GET', 'leitung/campaigns'))[0];
  const tok = Object.fromEntries(c.links.map((l) => [l.school_name, l.token]));
  const pub = client(B);
  const a = await pub('GET', 'c/' + tok['Oberstufenzentrum']);
  const b = await pub('GET', 'c/' + tok['Schulhaus Nordstrasse']);
  ok(a.school.zyklen.join() === 'Zyklus 3' && b.school.zyklen.join() === 'Zyklus 1,Zyklus 2,Zyklusübergreifend', 'Link liefert Zyklen des Schulhauses');
  const t1 = client(B); const s1 = await t1('POST', 'c/' + tok['Oberstufenzentrum'] + '/start', { context: { zyklus: 'Zyklus 1' } });
  const t2 = client(B); const s2 = await t2('POST', 'c/' + tok['Schulhaus Nordstrasse'] + '/start', { context: { zyklus: 'Zyklus 3' } });
  const m1 = await t1('GET', 'me'), m2 = await t2('GET', 'me');
  ok(m1.responses[0].context.zyklus === 'Zyklus 3', 'Oberstufe: Zyklus 3 fest, Eingabe ignoriert');
  ok(m2.responses[0].context.zyklus === undefined, 'Primarschulhaus: Zyklus 3 nicht erlaubt');
  await t2('PUT', 'me/responses/' + s2.responseId, { answers: {}, context: { zyklus: 'Zyklus 2' } });
  ok((await t2('GET', 'me')).responses[0].context.zyklus === 'Zyklus 2', 'Primarschulhaus: Zyklus 2 gespeichert');
  ok(JSON.stringify(m2.responses[0].zyklen) === JSON.stringify(['Zyklus 1', 'Zyklus 2', 'Zyklusübergreifend']), 'Meine Teilnahmen: Zyklen mitgeliefert');
  // Admin kann Zyklen setzen
  await ad('PATCH', 'admin/schools/' + nord.id, { zyklen: ['Zyklus 1'] });
  ok((await pub('GET', 'c/' + tok['Schulhaus Nordstrasse'])).school.zyklen.join() === 'Zyklus 1', 'AVS setzt Zyklen');
  // bestehende Primar/Sek-Träger unverändert
  const imp2 = await ad('POST', 'admin/import', { rows: [{ traeger: 'Gemeinde X', kind: 'primar', name: 'x', email: 'x@x.ch' }, { traeger: 'Bezirk Y', kind: 'sek', name: 'y', email: 'y@y.ch' }] });
  for (const [i, n] of [[0, 'A'], [1, 'B']]) { const c2 = client(B); await c2('POST', 'invite/' + imp2.rows[i].token, { username: 'user.' + n.toLowerCase(), password: 'sicheres-pw-2026' }); await c2('POST', 'leitung/schools', { name: n }); }
  const all = await ad('GET', 'admin/traeger');
  ok(all.find((x) => x.name === 'Gemeinde X').schools[0].zyklen.join() === 'Zyklus 1,Zyklus 2' && all.find((x) => x.name === 'Bezirk Y').schools[0].zyklen.join() === 'Zyklus 3', 'Standard: Primar Zyklus 1–2, Sek Zyklus 3');
  return res;
}

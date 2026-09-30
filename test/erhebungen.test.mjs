import { client, checker, adminClient, invitedClient, teacher } from './lib.mjs';

// Erhebungen: Zieldatum, Schulhaus nachträglich aufnehmen, Schulfilter bleibt nach dem Filtern verfügbar
export default async function (B) {
  const { ok, expectErr, res } = checker('Erhebungen');
  const ad = await adminClient(B);
  const { id: round } = await ad('POST', 'admin/rounds', { title: 'Runde E' });
  const { id: tid } = await ad('POST', 'admin/traeger', { name: 'Bezirk E', kind: 'gesamt', schoolName: 'Schulhaus A' });
  await ad('POST', `admin/traeger/${tid}/schools`, { name: 'Schulhaus B' });
  const rek = await invitedClient(B, ad, tid, 'rektor.e');
  let team = await rek('GET', 'leitung/team');
  const S = Object.fromEntries(team.schools.map((s) => [s.name, s.id]));
  const sl = await invitedClient(B, ad, tid, 'sl.b', S['Schulhaus B']);

  // Zieldatum
  await rek('POST', 'leitung/campaigns', { roundId: round, schoolIds: [S['Schulhaus A']], dueDate: '2026-11-13' });
  let c = (await rek('GET', 'leitung/campaigns'))[0];
  ok(c.due_date === '2026-11-13', 'Zieldatum gespeichert und als Tag zurückgegeben');
  ok((await client(B)('GET', 'c/' + c.links[0].token)).campaign.due_date === '2026-11-13', 'Teilnahmeseite erhält das Zieldatum');
  await rek('PATCH', 'leitung/campaigns/' + c.id, { dueDate: '2026-12-01' });
  ok((await rek('GET', 'leitung/campaigns'))[0].due_date === '2026-12-01', 'Zieldatum geändert');
  await expectErr(rek('PATCH', 'leitung/campaigns/' + c.id, { dueDate: '2026-02-30' }), 400, 'Ungültiges Datum abgelehnt');
  await rek('PATCH', 'leitung/campaigns/' + c.id, { dueDate: null });
  ok((await rek('GET', 'leitung/campaigns'))[0].due_date === null, 'Zieldatum entfernt');
  await expectErr(sl('PATCH', 'leitung/campaigns/' + c.id, { dueDate: '2026-12-01' }), 404, 'Andere Schulleitung kann Zieldatum nicht ändern');

  // Schulhaus nachträglich aufnehmen
  const { id: sc } = await rek('POST', 'leitung/schools', { name: 'Schulhaus C' });
  await rek('POST', `leitung/campaigns/${c.id}/links`, { schoolId: sc });
  c = (await rek('GET', 'leitung/campaigns')).find((x) => x.id === c.id);
  ok(c.links.length === 2 && c.links.some((l) => l.school_id === sc), 'Später erfasstes Schulhaus in laufende Erhebung aufgenommen');
  await expectErr(rek('POST', `leitung/campaigns/${c.id}/links`, { schoolId: sc }), 409, 'Doppelt aufnehmen abgelehnt');
  await sl('POST', 'leitung/campaigns', { roundId: round });
  const own = (await sl('GET', 'leitung/campaigns')).find((x) => x.owner_school_id);
  await expectErr(sl('POST', `leitung/campaigns/${c.id}/links`, { schoolId: S['Schulhaus B'] }), 403, 'Schulleitung kann keine Schulhäuser aufnehmen');
  await expectErr(rek('POST', `leitung/campaigns/${c.id}/links`, { schoolId: S['Schulhaus B'] }), 409, 'Schulhaus, das in der Runde schon teilnimmt, abgelehnt');
  await expectErr(rek('POST', `leitung/campaigns/${own.id}/links`, { schoolId: sc }), 409, 'Erhebung einer Schulleitung bleibt bei ihrer Schule');

  // Schulfilter bleibt nach dem Filtern verfügbar (Testmodus: Mindestgruppe 1)
  const tok = Object.fromEntries(c.links.map((l) => [l.school_id, l.token]));
  for (let i = 0; i < 2; i++) await teacher(B, tok[S['Schulhaus A']]);
  for (let i = 0; i < 2; i++) await teacher(B, tok[sc]);
  const all = await rek('GET', 'leitung/aggregate?source=c:' + c.id);
  const one = await rek('GET', `leitung/aggregate?source=c:${c.id}&school=${sc}`);
  ok(all.multiSchool && all.schools.length === 2, 'Rektorat: zwei Schulen filterbar');
  ok(one.multiSchool && one.schools.length === 2 && one.n === 2, 'Nach dem Filtern bleibt die Schulauswahl bestehen');
  const slA = await sl('GET', 'leitung/aggregate?source=c:' + own.id);
  ok(!slA.multiSchool && !JSON.stringify(slA).includes('Schulhaus A'), 'Schulleitung sieht keine anderen Schulen');
  return res;
}

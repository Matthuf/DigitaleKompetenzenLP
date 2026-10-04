import { client, checker, adminClient, invitedClient, teacher } from './lib.mjs';

// Rollen und Rechte: Rektorat, Schulleitungen, AVS; Auswertungen und Zyklen (Testmodus)
export default async function (B) {
  const { ok, expectErr, res } = checker('Rollen und Rechte');
  const ad = await adminClient(B);
  const { id: round } = await ad('POST', 'admin/rounds', { title: 'Erste Runde 2026/27' });
  const { id: bez } = await ad('POST', 'admin/traeger', { name: 'Bezirk March', kind: 'sek', schoolName: 'Schulhaus Lachen' });
  await ad('POST', `admin/traeger/${bez}/schools`, { name: 'Schulhaus Siebnen' });
  await ad('POST', `admin/traeger/${bez}/schools`, { name: 'Schulhaus Buttikon' });
  const { id: gem } = await ad('POST', 'admin/traeger', { name: 'Gemeinde Muotathal', kind: 'primar', schoolName: 'Gemeinde Muotathal' });
  const trs = await ad('GET', 'admin/traeger');
  const bezT = trs.find(t => t.id === bez), gemT = trs.find(t => t.id === gem);
  const sch = Object.fromEntries(bezT.schools.concat(gemT.schools).map(s => [s.name, s.id]));
  const mk = (tid, username, schoolId) => invitedClient(B, ad, tid, username, schoolId);
  const rek = await mk(bez, 'rektor.march');
  const slL = await mk(bez, 'sl.lachen', sch['Schulhaus Lachen']);
  const slS = await mk(bez, 'sl.siebnen', sch['Schulhaus Siebnen']);
  const slM = await mk(gem, 'sl.muotathal', sch['Gemeinde Muotathal']);

  // Rektorat eröffnet Erhebung der Runde für alle Schulen
  await rek('POST', 'leitung/campaigns', { roundId: round });
  let rc = await rek('GET', 'leitung/campaigns');
  ok(rc.length === 1 && rc[0].links.length === 3 && rc[0].title === 'Erste Runde 2026/27', 'Rektorat: 1 Erhebung, 3 Links, Titel aus Runde');
  await expectErr(slL('POST', 'leitung/campaigns', { roundId: round }), 409, 'SL kann Schule nicht doppelt in Runde anmelden');
  let lc = await slL('GET', 'leitung/campaigns');
  ok(lc.length === 1 && lc[0].links.length === 1 && lc[0].links[0].school_name === 'Schulhaus Lachen' && lc[0].manageable === false, 'SL sieht nur eigenen Link, darf nicht verwalten');
  await expectErr(slL('PATCH', 'leitung/campaigns/' + lc[0].id, { status: 'closed' }), 403, 'SL darf Rektoratserhebung nicht schliessen');
  await expectErr(slL('PUT', `leitung/campaigns/${lc[0].id}/block`, { block: null }), 403, 'SL darf Fragen der Rektoratserhebung nicht ändern');
  // Eigene Erhebung erst nach Abschluss der Vorgabe
  await expectErr(slS('POST', 'leitung/campaigns', { title: 'Siebnen intern' }), 409, 'SL: eigene Erhebung erst nach Abschluss der Vorgabe');
  await expectErr(rek('POST', 'leitung/campaigns', { title: 'Bezirk intern' }), 409, 'Rektorat: eigene Erhebung erst nach Abschluss der Vorgabe');
  ok((await slS('GET', 'leitung/context')).vorgabe === round, 'Kontext nennt die aktuelle Vorgabe');
  await expectErr(slM('GET', 'leitung/aggregate?source=c:' + rc[0].id), 404, 'Andere Gemeinde sieht Bezirkserhebung nicht');

  // Lehrpersonen
  const exp = ['Weniger als 5 Jahre', '5 bis 15 Jahre', 'Mehr als 15 Jahre'];
  const teach = (token, shift, context) => teacher(B, token, { shift, context });
  const camp = rc.find(c => c.round_id);
  const tok = Object.fromEntries(camp.links.map(l => [l.school_name, l.token]));
  let first;
  for (let i = 0; i < 8; i++) { const r = await teach(tok['Schulhaus Lachen'], 0.3, { zyklus: 'Zyklus 1', erfahrung: exp[i % 3] }); if (!first) first = r; }
  for (let i = 0; i < 6; i++) await teach(tok['Schulhaus Siebnen'], -0.3, { erfahrung: exp[i % 3], funktion: 'Fachlehrperson' });
  for (let i = 0; i < 5; i++) await teach(tok['Schulhaus Buttikon'], 0, { erfahrung: exp[i % 3] });
  // Sek: Zyklus immer 3
  const me = await first.t('GET', 'me');
  ok(me.responses[0].context.zyklus === 'Zyklus 3', 'Bezirk: Zyklus wird serverseitig auf Zyklus 3 gesetzt');
  // Code gilt im ganzen Träger, nicht in anderer Gemeinde
  const gc = await slM('GET', 'leitung/campaigns'); // leer
  await slM('POST', 'leitung/campaigns', { roundId: round });
  const gcamp = (await slM('GET', 'leitung/campaigns'))[0];
  for (let i = 0; i < 7; i++) await teach(gcamp.links[0].token, -0.5, { zyklus: i % 2 ? 'Zyklus 1' : 'Zyklus 2', erfahrung: exp[i % 3] });
  const t2 = client(B);
  await expectErr(t2('POST', 'code-login', { code: first.code, token: gcamp.links[0].token }), 403, 'Code aus Bezirk gilt nicht in Gemeinde');
  await t2('POST', 'code-login', { code: first.code, token: tok['Schulhaus Siebnen'] });
  ok(true, 'Code gilt in anderer Schule des gleichen Trägers');

  // Auswertungen
  const aR = await rek('GET', 'leitung/aggregate?source=c:' + camp.id);
  ok(aR.n === 19 && aR.multiSchool && aR.schools.length === 3, 'Rektorat: 19 Teilnahmen, 3 Schulen filterbar');
  ok(Array.isArray(aR.groups.schulen) && aR.groups.schulen.length === 3, 'Rektorat: Schulen im Vergleich');
  ok(aR.groups.zyklen === null, 'Bezirk: kein Zyklenvergleich (nur Zyklus 3)');
  const aRs = await rek('GET', `leitung/aggregate?source=c:${camp.id}&school=${sch['Schulhaus Siebnen']}`);
  ok(aRs.n === 6 && aRs.groups.schulen === null, 'Rektorat mit Schulfilter');
  const aL = await slL('GET', `leitung/aggregate?source=c:${camp.id}&school=${sch['Schulhaus Siebnen']}`);
  ok(aL.n === 8 && aL.schools.length === 0 && !aL.multiSchool, 'SL: nur eigene Schule, Schulfilter ignoriert');
  const aM = await slM('GET', 'leitung/aggregate?source=c:' + gcamp.id);
  ok(aM.n === 7 && Array.isArray(aM.groups.zyklen), 'Gemeinde: Zyklenvergleich');
  // AVS: Schwelle drei Schulträger
  let k = await ad('GET', 'admin/aggregate?round=' + round);
  ok(k.tooFew && k.total === 26 && k.traegerCount === 2 && !k.agg && /drei|3/.test(k.reason), 'AVS: zwei Schulträger, noch keine Kantonswerte');
  await expectErr(ad('GET', `admin/aggregate?round=${round}&zyklus=Zyklus%203`), 403, 'AVS: kein Zyklusfilter unter der Schwelle');
  const { id: ill } = await ad('POST', 'admin/traeger', { name: 'Gemeinde Illgau', kind: 'primar', schoolName: 'Schulhaus Illgau' });
  const slI = await mk(ill, 'sl.illgau', (await ad('GET', 'admin/traeger')).find(t => t.id === ill).schools[0].id);
  await slI('POST', 'leitung/campaigns', { roundId: round });
  const icamp = (await slI('GET', 'leitung/campaigns'))[0];
  for (let i = 0; i < 3; i++) await teach(icamp.links[0].token, 0.2, { zyklus: 'Zyklus 1', erfahrung: exp[i % 3] });
  k = await ad('GET', 'admin/aggregate?round=' + round);
  ok(!k.tooFew && k.n === 29 && k.schoolCount === 5 && k.traegerCount === 3, 'AVS: drei Schulträger, 29 Personen aus 5 Schulen');
  ok(!JSON.stringify(k).includes('Lachen') && !JSON.stringify(k).includes('school_id') && !JSON.stringify(k).includes('traeger_id'), 'AVS-Antwort enthält keine Schulnamen oder IDs');
  ok(k.groups.erfahrung && k.groups.erfahrung.length === 3, 'AVS: Berufserfahrung im Vergleich (jede Gruppe aus 3 Trägern)');
  ok(k.groups.zyklen === null && k.zyklen.length === 0, 'AVS: kein Zyklenvergleich, weil Zyklus 3 nur aus einem Träger stammt');
  await expectErr(ad('GET', `admin/aggregate?round=${round}&zyklus=Zyklus%203`), 403, 'AVS: Zyklus 3 (ein Bezirk) nicht filterbar');
  const rnd = (await ad('GET', 'admin/rounds')).find(r => r.id === round);
  ok(rnd.traeger === 3 && rnd.traeger_data === 3 && rnd.traeger_total === 3 && rnd.submitted === 29, 'Vorgabe AVS: 3 von 3 Schulträgern, 29 Teilnahmen');
  ok((await ad('GET', 'admin/traeger')).every(t => !('participants' in t) && !('campaigns' in t)), 'AVS: keine Teilnahmezahlen pro Träger');

  // Nach Abschluss der Vorgabe: eigene Erhebung möglich, fliesst nicht in die Kantonswerte
  await rek('PATCH', 'leitung/campaigns/' + camp.id, { status: 'closed' });
  await slS('POST', 'leitung/campaigns', { title: 'Siebnen intern' });
  rc = await rek('GET', 'leitung/campaigns');
  const own = rc.find(c => c.title === 'Siebnen intern');
  ok(rc.length === 2 && own && own.manageable && !own.round_id, 'Rektorat sieht und verwaltet SL-Erhebung');
  lc = await slL('GET', 'leitung/campaigns');
  ok(lc.length === 1, 'Andere SL sieht fremde SL-Erhebung nicht');
  await expectErr(slM('POST', 'leitung/campaigns', { title: 'Muotathal intern' }), 409, 'Gemeinde mit offener Vorgabe: noch keine eigene Erhebung');
  for (let i = 0; i < 4; i++) await teach(own.links[0].token, 1);
  ok((await ad('GET', 'admin/aggregate?round=' + round)).n === 29, 'Eigene Erhebung fliesst nicht in die kantonale Auswertung');
  await rek('PATCH', 'leitung/campaigns/' + camp.id, { status: 'open' });
  ok(true, 'Vorgabe lässt sich wieder öffnen');
  await expectErr(rek('GET', 'admin/aggregate'), 403, 'Rektorat hat keinen Zugang zur kantonalen Auswertung');
  await expectErr(ad('GET', 'leitung/campaigns'), 403, 'AVS hat keinen Zugang zu Schulauswertungen');
  return res;
}

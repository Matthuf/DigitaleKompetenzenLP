import { client, checker, adminClient } from './lib.mjs';

// Demo-Zugang ohne Passwort: nur mit DEMO_ZUGANG=1 und nur in einer Datenbank ohne echte Schulträger
export default async function (B) {
  const { ok, expectErr, res } = checker('Demo-Zugang');
  const a = client(B), b = client(B);
  ok((await a('GET', 'demo/status')).enabled === true, 'Demo aktiv mit DEMO_ZUGANG=1');
  await a('POST', 'demo/start', { kind: 'sek' });
  const me = await a('GET', 'auth/me');
  ok(me.role === 'traeger' && /^Demo-Bezirk/.test(me.traeger_name) && !me.must_change_password, 'Start meldet als Rektorat eines neuen Demo-Bezirks an, ohne Passwortwechsel');
  const ctx = await a('GET', 'leitung/context');
  ok(ctx.schools.length === 0 && ctx.vorgabe, 'Demo-Träger startet leer, Vorgabe AVS ist vorhanden');
  await a('POST', 'leitung/schools', { name: 'Schulhaus Demo' });
  await a('POST', 'leitung/campaigns', { roundId: ctx.vorgabe });
  let st = await a('GET', 'demo/status');
  ok(st.schools.length === 1 && st.links.length === 1, 'Status zeigt Schulhaus und Teilnahmelink');
  await a('POST', 'demo/schulleitung', { school: st.schools[0].id });
  ok((await a('GET', 'auth/me')).role === 'leitung', 'Wechsel zur Schulleitung');
  await a('POST', 'demo/rektorat');
  ok((await a('GET', 'auth/me')).role === 'traeger', 'Wechsel zurück zum Rektorat');
  ok((await client(B)('GET', 'c/' + st.links[0].token)).school, 'Teilnahmelink funktioniert');

  // Eine zweite Person erhält einen eigenen Träger und kommt nicht an fremde Schulhäuser
  await b('POST', 'demo/start', { kind: 'primar' });
  ok((await b('GET', 'leitung/context')).schools.length === 0, 'Zweiter Demo-Zugang sieht den ersten Träger nicht');
  await expectErr(b('POST', 'demo/schulleitung', { school: st.schools[0].id }), 404, 'Kein Wechsel in ein fremdes Demo-Schulhaus');
  await expectErr(client(B)('POST', 'demo/rektorat'), 401, 'Rollenwechsel nur mit eigenem Demo-Zugang');

  // Schutz: Sobald ein echter Schulträger existiert, bleibt der Demo-Zugang zu
  const ad = await adminClient(B);
  await ad('POST', 'admin/traeger', { name: 'Bezirk Echt', kind: 'sek' });
  st = await client(B)('GET', 'demo/status');
  ok(!st.enabled && st.blocked, 'Mit echtem Schulträger: Demo gesperrt');
  await expectErr(client(B)('POST', 'demo/start', {}), 403, 'Start mit echtem Schulträger verweigert');
  await expectErr(a('POST', 'demo/rektorat'), 403, 'Rollenwechsel mit echtem Schulträger verweigert');
  return res;
}

// Ohne DEMO_ZUGANG ist alles zu
export async function off(B) {
  const { ok, expectErr, res } = checker('Demo-Zugang aus');
  ok((await client(B)('GET', 'demo/status')).enabled === false, 'Ohne Variable: Demo nicht aktiv');
  await expectErr(client(B)('POST', 'demo/start', {}), 404, 'Ohne Variable: Start nicht möglich');
  return res;
}

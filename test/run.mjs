// Server-Tests: node test/run.mjs  (oder npm test)
// Jede Testgruppe erhält einen eigenen lokalen Server mit leerer In-Memory-Datenbank.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib.mjs';

const SUITES = [
  ['roles.test.mjs', { TESTMODUS: '1' }],
  ['invitations.test.mjs', { TESTMODUS: '1' }],
  ['zyklen.test.mjs', { TESTMODUS: '1' }],
  ['erhebungen.test.mjs', { TESTMODUS: '1' }],
  ['security.test.mjs', { TESTMODUS: '0' }], // Echtbetrieb: Mindestgruppe 5
];
const only = process.argv[2];
let pass = 0, fail = 0;

// Ohne SESSION_SECRET darf der Server nicht starten (kein bekannter Ersatzschlüssel)
{
  const root = fileURLToPath(new URL('..', import.meta.url));
  const code = await new Promise((resolve) => {
    const c = spawn(process.execPath, ['-e', "import('./api/router.js').then(() => process.exit(0), () => process.exit(3))"],
      { cwd: root, env: { ...process.env, SESSION_SECRET: '', ALLOW_DEV_SECRET: '', ALLOW_PGLITE: '1' }, stdio: 'ignore' });
    c.on('exit', resolve);
  });
  console.log('\nStart ohne SESSION_SECRET');
  const good = code === 3;
  console.log((good ? '  ok   ' : '  FEHLER ') + 'Server verweigert den Start ohne SESSION_SECRET');
  good ? pass++ : fail++;
}

for (const [file, env] of SUITES) {
  if (only && !file.includes(only)) continue;
  console.log('\n' + file);
  const srv = await startServer(env);
  try {
    const { default: run } = await import('./' + file);
    const r = await run(srv.B);
    pass += r.pass; fail += r.fail;
  } catch (e) {
    fail++;
    console.log('  FEHLER Abbruch: ' + e.message);
    console.log(srv.log().split('\n').slice(-15).join('\n'));
  } finally { srv.stop(); }
}
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

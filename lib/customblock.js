// Schulblock: eigene Fragen der Schulleitung. Vier Frageformen, frei mischbar.
//   scale  – Zustimmung 1–4, 0 = kann ich nicht beurteilen
//   levels – eigene Stufenaussagen (3–6), Antwort 1..n, 0 = keine Gelegenheit
//   choice – Auswahl aus 2–10 Optionen, einfach (Index) oder mehrfach (Liste von Indizes)
//   text   – Freitext bis 1000 Zeichen
import { randomInt } from 'node:crypto';

export const TYPES = ['scale', 'levels', 'choice', 'text'];
// Neu speicherbar: ohne «levels» (eigene Stufenaussagen, entfernt am 5.10.2026). Bestehende Blöcke mit
// dieser Form bleiben lesbar und auswertbar (Antworten, Auswertung, CSV).
export const SAVE_TYPES = ['scale', 'choice', 'text'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const newQid = () => 'q' + Array.from({ length: 7 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('');

export function validateBlock(block) {
  if (!block || !Array.isArray(block.questions) || !block.questions.length) return { block: null };
  const seen = new Set();
  const questions = [];
  for (const [i, q] of block.questions.entries()) {
    const n = i + 1;
    if (q.type === 'levels') return { error: `Frage ${n}: Die Frageform «Eigene Stufenaussagen» wird nicht mehr angeboten. Bitte als Zustimmungsskala oder Auswahl erfassen.` };
    if (!SAVE_TYPES.includes(q.type)) return { error: `Frage ${n}: unbekannte Frageform.` };
    const text = str(q.text, 300);
    if (!text) return { error: `Frage ${n}: Bitte den Fragetext eingeben.` };
    let id = typeof q.id === 'string' && /^q[a-z0-9]{4,12}$/.test(q.id) && !seen.has(q.id) ? q.id : newQid();
    seen.add(id);
    const out = { id, type: q.type, text };
    if (q.type === 'levels' || q.type === 'choice') {
      const max = q.type === 'levels' ? 400 : 120;
      const opts = (Array.isArray(q.options) ? q.options : []).map((o) => str(o, max)).filter(Boolean);
      const [lo, hi] = q.type === 'levels' ? [3, 6] : [2, 10];
      if (opts.length < lo || opts.length > hi) {
        return { error: `Frage ${n}: ${q.type === 'levels' ? 'Stufenaussagen' : 'Auswahl'} braucht ${lo} bis ${hi} ${q.type === 'levels' ? 'Aussagen' : 'Optionen'}.` };
      }
      out.options = opts;
      if (q.type === 'choice') out.multiple = !!q.multiple;
    }
    questions.push(out);
  }
  return { block: { title: str(block.title, 80) || 'Fragen unserer Schule', intro: str(block.intro, 500), questions } };
}

export function cleanCustomAnswers(block, a) {
  const out = {};
  if (!block || !a || typeof a !== 'object') return out;
  for (const q of block.questions) {
    const v = a[q.id];
    if (v === undefined || v === null) continue;
    if (q.type === 'scale' && Number.isInteger(v) && v >= 0 && v <= 4) out[q.id] = v;
    else if (q.type === 'levels' && Number.isInteger(v) && v >= 0 && v <= q.options.length) out[q.id] = v;
    else if (q.type === 'choice' && !q.multiple && Number.isInteger(v) && v >= 0 && v < q.options.length) out[q.id] = v;
    else if (q.type === 'choice' && q.multiple && Array.isArray(v)) {
      const list = [...new Set(v.filter((x) => Number.isInteger(x) && x >= 0 && x < q.options.length))].sort((x, y) => x - y);
      if (list.length) out[q.id] = list;
    } else if (q.type === 'text' && typeof v === 'string' && v.trim()) out[q.id] = v.trim().slice(0, 1000);
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Auswertung pro Frage. Auch bei grosser Gesamtgruppe kann eine einzelne Frage von wenigen beantwortet sein:
// Dann wird sie nicht ausgewiesen. Freitexte sind besonders leicht zuzuordnen und brauchen im Echtbetrieb
// mindestens 10 Antworten.
// Freitexte erscheinen erst ab dieser Zahl von Antworten: Sie sind wörtlich und damit weit eher
// einer Person zuzuordnen als ein zusammengefasster Wert. Alle übrigen Frageformen haben keine Schwelle.
export const TEXT_MIN = 10;

export function aggregateCustom(block, answerSets, textMin = TEXT_MIN) {
  if (!block) return null;
  const questions = block.questions.map((q) => {
    const vals = answerSets.map((a) => (a || {})[q.id]).filter((v) => v !== undefined);
    const need = q.type === 'text' ? textMin : 1;
    if (vals.length && vals.length < need) return { id: q.id, answered: null, suppressed: true, need };
    const res = { id: q.id, answered: vals.length };
    if (q.type === 'scale' || q.type === 'levels') {
      const size = q.type === 'scale' ? 4 : q.options.length;
      const counts = Array(size + 1).fill(0);
      vals.forEach((v) => { if (Number.isInteger(v) && v <= size) counts[v]++; });
      const rated = vals.filter((v) => v >= 1);
      res.counts = counts;
      res.mean = rated.length ? rated.reduce((x, y) => x + y, 0) / rated.length : null;
    } else if (q.type === 'choice') {
      const counts = Array(q.options.length).fill(0);
      vals.forEach((v) => [].concat(v).forEach((i) => { if (i < counts.length) counts[i]++; }));
      res.counts = counts;
    } else if (q.type === 'text') {
      res.texts = shuffle(vals.filter((v) => typeof v === 'string'));
    }
    return res;
  });
  return { questions };
}

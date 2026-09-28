/*
 * DigKomp SZ – Auswertungslogik (gemeinsamer Kern)
 * Wird in der Offline-HTML-Version eingebettet und später von der Serverversion wiederverwendet.
 * Antwortwerte: 1–6 = Stufe I–VI, 0 = «keine Gelegenheit», fehlend = nicht beantwortet.
 */
const DKCore = (function () {
  const NO_OPPORTUNITY = 0;
  const FORMAT = 'dk-sz-result';
  const MIN_GROUP = 5;

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  function allSubareas(items) {
    return items.areas.flatMap((a) => a.subareas.map((s) => Object.assign({ areaId: a.id }, s)));
  }

  function areaScores(items, answers) {
    return items.areas.map((a) => {
      const vals = a.subareas.map((s) => answers[s.id]).filter((v) => v >= 1);
      const answered = a.subareas.filter((s) => answers[s.id] !== undefined).length;
      return { id: a.id, mean: mean(vals), answered, total: a.subareas.length };
    });
  }

  function progress(items, answers) {
    const subs = allSubareas(items);
    const done = subs.filter((s) => answers[s.id] !== undefined).length;
    return { done, total: subs.length, open: subs.filter((s) => answers[s.id] === undefined).map((s) => s.id) };
  }

  function strengthsAndGaps(items, answers, n = 3) {
    const rated = allSubareas(items).filter((s) => answers[s.id] >= 1).map((s, i) => ({ s, v: answers[s.id], i }));
    const strengths = rated.slice().sort((a, b) => b.v - a.v || a.i - b.i).slice(0, n);
    const gaps = rated.filter((r) => r.v < 6).sort((a, b) => a.v - b.v || a.i - b.i).slice(0, n);
    const noOpp = allSubareas(items).filter((s) => answers[s.id] === NO_OPPORTUNITY);
    return { strengths, gaps, noOpp };
  }

  function validateRecord(obj) {
    if (!obj || obj.format !== FORMAT || typeof obj.answers !== 'object') return false;
    return Object.values(obj.answers).every((v) => Number.isInteger(v) && v >= 0 && v <= 6);
  }

  function aggregate(items, records) {
    const subs = allSubareas(items);
    const bySub = {};
    subs.forEach((s) => {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      records.forEach((r) => {
        const v = r.answers[s.id];
        if (v !== undefined) counts[v]++;
      });
      const rated = [];
      counts.forEach((c, lvl) => { if (lvl >= 1) for (let k = 0; k < c; k++) rated.push(lvl); });
      bySub[s.id] = { counts, answered: counts.reduce((a, b) => a + b, 0), mean: mean(rated) };
    });
    const areas = items.areas.map((a) => ({
      id: a.id,
      mean: mean(a.subareas.map((s) => bySub[s.id].mean).filter((v) => v !== null)),
    }));
    return { n: records.length, bySub, areas };
  }

  function toCSV(items, agg) {
    const rows = [['Teilbereich-ID', 'Teilbereich', 'Antworten', 'Keine Gelegenheit', 'I', 'II', 'III', 'IV', 'V', 'VI', 'Mittelwert']];
    allSubareas(items).forEach((s) => {
      const d = agg.bySub[s.id];
      rows.push([s.id, s.title, d.answered, d.counts[0], ...d.counts.slice(1), d.mean === null ? '' : d.mean.toFixed(2)]);
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  }

  return { NO_OPPORTUNITY, FORMAT, MIN_GROUP, mean, allSubareas, areaScores, progress, strengthsAndGaps, validateRecord, aggregate, toCSV };
})();
if (typeof module !== 'undefined') module.exports = DKCore;

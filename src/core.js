/*
 * DigKomp SZ – Auswertungslogik (gemeinsamer Kern)
 * Wird in der Offline-HTML-Version eingebettet und später von der Serverversion wiederverwendet.
 * Antwortwerte: 1–6 = Stufe I–VI, 0 = «keine Gelegenheit», fehlend = nicht beantwortet.
 */
const DKCore = (function () {
  const NO_OPPORTUNITY = 0;
  const FORMAT = 'dk-sz-result';

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
      bySub[s.id] = { counts, answered: counts.reduce((a, b) => a + b, 0), mean: mean(rated), sd: sd(rated), box: boxStats(rated) };
    });
    const areas = items.areas.map((a) => {
      // Boxplot pro Bereich: Verteilung der persönlichen Bereichsmittelwerte
      const personal = records.map((r) => mean(a.subareas.map((s) => r.answers[s.id]).filter((v) => v >= 1))).filter((v) => v !== null);
      return { id: a.id, mean: mean(a.subareas.map((s) => bySub[s.id].mean).filter((v) => v !== null)), box: boxStats(personal) };
    });
    return { n: records.length, bySub, areas };
  }

  /* Kennzahlen für Boxplots. Antennen bewusst 10.–90. Perzentil statt Minimum/Maximum,
   * weil Extremwerte oft für eine einzelne Person stehen. */
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const h = (sorted.length - 1) * p, lo = Math.floor(h);
    return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo]);
  }
  function boxStats(vals) {
    if (!vals.length) return null;
    const v = vals.slice().sort((a, b) => a - b);
    return { n: v.length, p10: quantile(v, 0.1), q1: quantile(v, 0.25), median: quantile(v, 0.5), q3: quantile(v, 0.75), p90: quantile(v, 0.9), mean: mean(v) };
  }
  function sd(vals) {
    if (vals.length < 2) return null;
    const m = mean(vals);
    return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1));
  }
  /* «Wer braucht was?»: Anteile Einstieg (I–II), Vertiefung (III–IV), Weitergeben (V–VI)
   * sowie Einschätzung der Streuung (einig / gemischt / gespalten). */
  function needGroups(d) {
    const rated = d.counts.slice(1).reduce((a, b) => a + b, 0);
    const g = [d.counts[1] + d.counts[2], d.counts[3] + d.counts[4], d.counts[5] + d.counts[6]];
    const share = g.map((x) => (rated ? x / rated : 0));
    let spread = null;
    if (rated >= 2) spread = share[0] >= 0.25 && share[2] >= 0.25 ? 'gespalten' : d.sd !== null && d.sd <= 0.8 ? 'einig' : 'gemischt';
    return { rated, counts: g, share, spread };
  }

  function toCSV(items, agg) {
    const rows = [['Teilbereich-ID', 'Teilbereich', 'Antworten', 'Keine Gelegenheit', 'I', 'II', 'III', 'IV', 'V', 'VI', 'Mittelwert']];
    allSubareas(items).forEach((s) => {
      const d = agg.bySub[s.id];
      rows.push([s.id, s.title, d.answered, d.counts[0], ...d.counts.slice(1), d.mean === null ? '' : d.mean.toFixed(2)]);
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  }

  /* Schulblock (eigene Fragen): Auswertung pro Frage, nach Frage-ID */
  const SCALE = ['Trifft nicht zu', 'Trifft eher nicht zu', 'Trifft eher zu', 'Trifft voll zu'];
  function aggregateCustom(block, answerSets) {
    if (!block || !block.questions) return null;
    const questions = block.questions.map((q) => {
      const vals = answerSets.map((a) => (a || {})[q.id]).filter((v) => v !== undefined && v !== null && v !== '');
      const res = { id: q.id, answered: vals.length };
      if (q.type === 'scale' || q.type === 'levels') {
        const size = q.type === 'scale' ? 4 : q.options.length;
        const counts = Array(size + 1).fill(0);
        vals.forEach((v) => { if (Number.isInteger(v) && v >= 0 && v <= size) counts[v]++; });
        const rated = vals.filter((v) => Number.isInteger(v) && v >= 1 && v <= size);
        res.counts = counts;
        res.mean = mean(rated);
      } else if (q.type === 'choice') {
        const counts = Array(q.options.length).fill(0);
        vals.forEach((v) => [].concat(v).forEach((i) => { if (Number.isInteger(i) && i >= 0 && i < counts.length) counts[i]++; }));
        res.counts = counts;
      } else {
        const texts = vals.filter((v) => typeof v === 'string');
        for (let i = texts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [texts[i], texts[j]] = [texts[j], texts[i]]; }
        res.texts = texts;
      }
      return res;
    });
    return { questions };
  }

  /* Weiterbildung: Empfehlung von fobizz-Themenbereichen nach festen Regeln
   *   Stufe I–IV: Hauptthema des Teilbereichs (I–II: Einstiegsangebote), Nebenthema als «auch passend»
   *   Stufe V: «Schulentwicklung & Leadership» (nächster Schritt ist Weitergeben)
   *   Stufe VI und «keine Gelegenheit»: keine Empfehlung
   * Rangliste: Hauptthema 2 Punkte, Nebenthema 1 Punkt; bei Gleichstand zählt die Reihenfolge der Felder. */
  function pdThemeFor(items, sub, level) {
    if (!items.pd || !sub.pd || !(level >= 1) || level >= 6) return null;
    if (level === 5) return { primary: items.pd.lead, secondary: null, entry: false };
    return { primary: sub.pd.primary, secondary: sub.pd.secondary, entry: level <= 2 };
  }
  function rankThemes(items, entries) {
    const score = new Map();
    entries.forEach(({ sub, level }, idx) => {
      const t = pdThemeFor(items, sub, level);
      if (!t) return;
      [[t.primary, 2], [t.secondary, 1]].forEach(([th, w]) => {
        if (!th) return;
        const e = score.get(th) || { theme: th, score: 0, subs: [], first: idx };
        e.score += w;
        if (!e.subs.includes(sub.id)) e.subs.push(sub.id);
        score.set(th, e);
      });
    });
    return [...score.values()].sort((a, b) => b.score - a.score || a.first - b.first);
  }
  function personalThemes(items, answers, n = 3) {
    const entries = strengthsAndGaps(items, answers, 3).gaps.map((g) => ({ sub: g.s, level: g.v }));
    allSubareas(items).forEach((s) => { if (answers[s.id] === 1 && !entries.some((e) => e.sub.id === s.id)) entries.push({ sub: s, level: 1 }); });
    return rankThemes(items, entries).slice(0, n);
  }
  function schoolThemes(items, agg, n = 3) {
    const subs = allSubareas(items).filter((s) => agg.bySub[s.id].mean !== null)
      .sort((a, b) => agg.bySub[a.id].mean - agg.bySub[b.id].mean).slice(0, 4);
    const themes = rankThemes(items, subs.map((s) => ({ sub: s, level: Math.max(1, Math.round(agg.bySub[s.id].mean)) }))).slice(0, n);
    const multipliers = allSubareas(items).filter((s) => {
      const d = agg.bySub[s.id];
      const rated = d.counts.slice(1).reduce((a, b) => a + b, 0);
      return rated > 0 && (d.counts[5] + d.counts[6]) / rated >= 0.25;
    });
    const noOpp = allSubareas(items).filter((s) => { const d = agg.bySub[s.id]; return d.answered > 0 && d.counts[0] / d.answered >= 0.25; });
    return { themes, multipliers, noOpp };
  }

  return { NO_OPPORTUNITY, FORMAT, SCALE, mean, allSubareas, areaScores, progress, strengthsAndGaps, validateRecord, aggregate, boxStats, needGroups, toCSV, aggregateCustom, pdThemeFor, personalThemes, schoolThemes };
})();
if (typeof module !== 'undefined') module.exports = DKCore;

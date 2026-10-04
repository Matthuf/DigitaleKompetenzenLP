# Arbeitsanweisungen für Claude

Selbsteinschätzung digitaler Kompetenzen für Lehrpersonen, Kanton Schwyz, Amt für Volksschulen
und Sport (AVS). Umsetzung von Kapitel 4.4 der Strategie «Digitaler Wandel im Bildungsraum».
Grundlage: DigCompEdu. Prototyp, noch nicht im Echtbetrieb.

**Vor der Arbeit lesen:** `README.md` (Aufbau, Rollen, Auswertungen, Betrieb).
Offene Entscheide und der aktuelle Stand stehen im Projektdokument
`claude/Offene_Punkte_DigKomp_SZ.md` (claude.ai-Projekt, über das Projects-Werkzeug).

## Zusammenarbeit

- **Sprache: Deutsch, Schweizer Rechtschreibung — immer «ss», nie «ß».** Das gilt für
  Oberfläche, Code-Kommentare, Commit-Texte und Antworten im Chat.
- **Ehrlich vor gefällig.** Nicht zustimmen, um zu gefallen. Widerspruch, Risiken und
  Nachteile gehören in die Antwort, mit Begründung. Bei Entwürfen und Benennungen zuerst
  einen Vorschlag mit Abwägung machen, nicht einfach umsetzen.
- **Bei grösseren Änderungen vorher fragen**, besonders wenn mehrere Lösungen plausibel sind.
  Kleine, eindeutige Korrekturen direkt umsetzen.
- **Messen statt schätzen.** Darstellungsfragen im Browser nachmessen (Breiten, Umbrüche,
  Seitenzahlen), nicht aus dem Code schliessen.
- **Nach jedem abgeschlossenen Schritt committen und pushen** (Branch `main`,
  github.com/Matthuf/DigitaleKompetenzenLP). Commit-Text auf Deutsch, erste Zeile knapp,
  danach das Warum. Abschluss jedes Commits:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: <aktuelle Session-URL>
```

## Befehle

```bash
npm test                      # 121 Prüfungen, müssen alle grün sein
python3 build.py              # erzeugt dist/, public/assets/core.js, items.js, lib/items.json
python3 data/excel_to_json.py # Excel-Masterdatei -> data/items.json (danach build.py)
python3 docs/build_handout.py # Handout für Rektorate als PDF
npm run dev                   # lokaler Server
```

Nach Änderungen an `src/core.js`, `src/template.html` oder den Items **immer `python3 build.py`**,
sonst laufen Offline- und Serverversion auseinander.

## Aufbau

- `api/router.js` — eine einzige Serverfunktion, Routen über `on(methode, muster, fn)`.
- `lib/db.js` — Schema und Migrationen, laufen beim Start automatisch.
- `src/core.js` — Auswertungslogik, von Offline- und Serverversion gemeinsam genutzt.
- `src/template.html` — Offline-Version (eine Datei, nur persönliche Selbsteinschätzung).
- `public/assets/` — Oberfläche: `leitung.js` (Adminbereich Schule), `wizard.js` (Assistent),
  `analysis.js` + `charts.js` (Auswertung), `teilnahme.js` (Lehrpersonen), `admin.js` (AVS).
- `data/items_master.xlsx` — einzige Quelle der Fragen. Texte nur in den Kapitelreitern
  ändern, Spalte E (Kurzfassung, Fettdruck wird übernommen).
- `docs/handout-rektorate.html` — Quelle des Handouts, zwei bis drei Seiten.

Keine Fremdbibliotheken im Frontend. Die Inhaltssicherheitsregel erlaubt nur eigene Skripte
(`script-src 'self'`), also kein Inline-JavaScript.

## Fachliche Festlegungen

- **Rollen:** AVS (`/admin`, intern «AVS-Bereich») · Rektorat/Hauptschulleitung und
  Schulleitung (`/leitung`, in der Oberfläche «Adminbereich Schule») · Lehrperson (`/t/<link>`).
- **Begriffe:** Schulträger · Schulhaus · Erhebung · Vorgabe AVS (technisch «Runde»).
  «Lehrpersonen», nie «Kollegium». «Schulrat», nie «Schulpflege» (das ist Zürich).
- **Keine Mindestgruppe** mehr: Auswertungen ab der ersten abgeschlossenen Teilnahme
  (Entscheid 30.9.2026 nach Rücksprache mit dem Datenschutz). Einzige Ausnahme: Freitexte
  bei eigenen Fragen erst ab zehn Antworten (`TEXT_MIN` in `lib/customblock.js`).
- **Das AVS lädt nur Rektorate und Hauptschulleitungen ein.** Schulhäuser erfasst es nur
  auf Anfrage der Schule.
- **Datenschutz:** Teilnahme ohne Namen und E-Mail, persönlicher Code. Niemand sieht einzelne
  Profile. Das AVS sieht nur Kantonswerte ohne Bezug zu Schulen oder Trägern.

## Prüfen vor dem Push

1. `npm test` — alle Prüfungen grün.
2. Bei Änderungen an der Oberfläche: im Browser ansehen, bei 1280 und 390 Pixel Breite,
   auf waagrechten Überlauf achten, axe-core ohne Befund (WCAG 2.1 AA).
3. Bei Änderungen am Druck: PDF erzeugen und ansehen, nicht nur den Code lesen.
4. Texte gegenlesen: «ss», «Sie»-Form, keine Fachwörter ohne Erklärung.

## Umgang mit dem Nutzungsguthaben

Der Aufwand hängt fast nur an der Länge der Unterhaltung, nicht an der Zahl der Dateien,
Tests oder Screenshots. Darum: **pro Arbeitspaket eine neue Sitzung**, und nach einer Pause
von mehr als einer Stunde lieber neu beginnen als fortsetzen. Diese Datei und das
Projektdokument ersetzen das Gesprächsgedächtnis.

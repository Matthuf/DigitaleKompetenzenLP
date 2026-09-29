# Digitale Kompetenzen von Lehrpersonen – Kanton Schwyz

Prototyp der Selbsteinschätzung digitaler Kompetenzen für Lehrpersonen (Umsetzung Kapitel 4.4 der Strategie «Digitaler Wandel im Bildungsraum im Kanton Schwyz»). Grundlage: DigCompEdu, Itemtexte vorläufig aus «DigCompEdu Bavaria» (ALP Dillingen); Anpassung an den Kanton Schwyz in Arbeit.

Zwei Versionen aus derselben Quelle:

| Version | Für wen | Daten |
|---|---|---|
| **Offline** (`dist/DigKomp_SZ_Selbsteinschaetzung.html`) | Einzelne Lehrpersonen, nur persönliche Selbsteinschätzung | bleiben im Browser, Export als Datei für den eigenen Gebrauch |
| **Server** (dieses Repository auf Vercel) | Schulen | Postgres-Datenbank, getrennt pro Schule |

## Weiterbildungsempfehlungen

Blatt «Weiterbildung» der Excel-Masterdatei: pro Teilbereich ein Haupt- und ein Nebenthema aus den fobizz-Themenbereichen (Auswahlliste im Blatt «Themen fobizz»). Regeln (in `src/core.js`): Stufe I–IV → Hauptthema (I–II mit Hinweis auf Einstiegsangebote), Stufe V → «Schulentwicklung & Leadership», Stufe VI und «keine Gelegenheit» → keine Empfehlung. Rangliste: Hauptthema 2 Punkte, Nebenthema 1 Punkt. Profil: über die Entwicklungsfelder und alle Teilbereiche auf Stufe I. Schulauswertung: über die vier Handlungsfelder, dazu Hinweise auf interne Weitergabe (mind. 25 % auf Stufe V–VI) und fehlende Voraussetzungen (mind. 25 % «keine Gelegenheit»). Änderungen: Excel anpassen, `npm run build:items`, committen.

## Schulauswertung (nur Serverversion)

- **Profil der Schule** mit Umschalter: Netz · Balken · Verteilung (100-%-Balken der Stufen) · Boxplot, jeweils für Bereiche oder Teilbereiche. Der Boxplot entspricht dem Beurteilungstool (Box = mittlere 50 %, Median, Mittelwert gepunktet); die Antennen zeigen bewusst das 10.–90. Perzentil statt Minimum/Maximum. Boxplot pro Bereich basiert auf den persönlichen Bereichsmittelwerten.
- **Veränderung** (bei gewähltem Vergleich): Hantel pro Teilbereich, nach Veränderung sortiert.
- **Wer braucht was?** Anteile Einstieg (I–II), Vertiefung (III–IV), Weitergeben (V–VI) plus Streuung: *gespalten* = je mind. 25 % auf I–II und V–VI, *einig* = Standardabweichung ≤ 0,8, sonst *gemischt*.
- **Voraussetzungen:** Anteil «keine Gelegenheit» pro Teilbereich, Schwelle 25 %.
- **Gruppenvergleiche** (Zyklen, beim Rektorat Schulen, beim AVS Zyklen, Berufserfahrung und Funktion): nur ab zwei Gruppen und nur wenn jede Gruppe (inkl. «ohne Angabe») `MIN_GROUP_SIZE` erreicht.
- **Bericht** auf einer A4-Seite (Drucken / PDF) und jedes Diagramm als PNG.
- **Filter** (Zyklus, Schule) werden nach derselben Regel nur angeboten, wenn jede Gruppe die Mindestgrösse erreicht. So lässt sich keine kleine Gruppe als Differenz zum Gesamtwert berechnen.
- **Runde über mehrere Erhebungen** (Rektorat): nur wenn jede beteiligte Schule mit Teilnahmen die Mindestgrösse erreicht, sonst ergäbe die Differenz zwischen Runde und einzelner Erhebung eine kleine Schule.
- **Eigene Fragen**: jede Frage erst ab Mindestgrösse beantworteter Antworten, Freitexte im Echtbetrieb ab 10.

## Offline-Version

Nur für die persönliche Selbsteinschätzung: Fragebogen, Profil, Drucken/PDF und Export als Datei für den eigenen Gebrauch (später wieder öffnen). Keine Schulauswertung und keine eigenen Fragen der Schule, weil ausserhalb des Servers weder die Mindestgrösse noch der Schutz vor Rückschlüssen durchgesetzt werden kann. Ältere Ergebnisdateien mit Fragen einer Schule lassen sich öffnen; übernommen werden nur Kompetenzantworten und Kontext.

## Rollen der Serverversion

Aufbau: **Schulträger** (Primarstufe, Sekundarstufe oder beides, z. B. Einsiedeln, Küssnacht, Gersau) → **Schulen bzw. Schulhäuser**. Die **Zyklen werden pro Schulhaus** festgelegt (Standard nach Stufe des Trägers: Primar Zyklus 1–2, Sek Zyklus 3, beides Zyklus 1–3); Rektorat oder AVS passen sie an. Ein Zyklus = für Lehrpersonen fest eingestellt, mehrere = Auswahl inkl. «zyklusübergreifend». Eine Erhebung gehört dem Träger, jede beteiligte Schule hat einen **eigenen Link**.

- **AVS (Admin)**, `/admin`: erfasst Schulträger, Schulen und Zugänge, legt **Runden** fest (z. B. die erste kantonale Runde) und sieht die **kantonale Auswertung**: alle Teilnahmen zusammen, immer pro Runde, filterbar nach Zyklus, Vergleiche nach Zyklus, Berufserfahrung und Funktion. **Keine Angaben zu Schulen oder Trägern** (weder Filter noch Namen noch IDs in der Antwort), keine eigenen Fragen, keine Freitexte; jede Person zählt einmal (jüngste Teilnahme der Runde). Keine Einsicht in Schulauswertungen. Unter «Protokoll» die letzten Aktionen (Anmeldungen, Einladungen, Passwort-Links, gelöschte Zugänge, eingesehene Auswertungen).
- **Rektorat / Hauptschulleitung**, `/leitung`: eröffnet Erhebungen für alle oder ausgewählte Schulen des Trägers, verteilt die Links oder überlässt sie den Schulleitungen, sieht alle Erhebungen des Trägers (auch jene der Schulleitungen), die Gesamtauswertung, den Filter nach Schule und «Schulen im Vergleich». Pro Runde kann das Rektorat auch alle Erhebungen der Schulen zusammen auswerten.
- **Schulleitung**, `/leitung`: sieht Erhebungen mit einem Link für ihre Schule und davon **nur die Auswertung der eigenen Schule**. Kann selbst Erhebungen für die eigene Schule eröffnen und verwalten; Erhebungen des Rektorats verwaltet das Rektorat.
- **Zugänge per Einladung**: Das AVS importiert die Liste der Schulträger (Excel einfügen oder CSV: Träger, Stufe, Name, E-Mail, Schulhäuser) und erhält pro Rektorat bzw. Hauptschulleitung einen Einladungslink (30 Tage, einmalig; Versand per E-Mail-Vorlage oder CSV für Serienbrief, der Server verschickt keine Mails). Eingeladene legen Benutzername und Passwort selbst fest (`/einladung/<token>`). Danach verwaltet der Schulträger unter «Schulen und Zugänge» seine Schulhäuser und lädt weitere Personen ein (Schulleitungen, Stellvertretung, Schulverwaltung). Schulleitungen laden Personen für die eigene Schule ein (z. B. Co-Leitung). Passwort vergessen: Link für ein neues Passwort (24 Stunden, beendet alle bestehenden Sitzungen) durch Träger, Schulleitung (eigene Schule) oder AVS; verliert das Rektorat den Zugang, hilft das AVS. Tokens werden nur als Hash gespeichert.
- **Runden**: Die erste Runde gibt das AVS vor. Pro Runde nimmt jede Schule einmal teil (sonst würden Lehrpersonen doppelt gezählt). Weitere Erhebungen legen die Schulen frei fest.
- **Mindestgrösse**: alle Auswertungen erst ab 5 abgeschlossenen Teilnahmen (Standard, auch ohne Einstellung). Kleinere Werte nur im ausdrücklichen Testmodus (`TESTMODUS=1`). Keine Einzelprofile.
- **Schulblock**: Pro Erhebung bis zu 15 eigene Fragen, vier Formen mischbar: Zustimmungsskala (4 Stufen), eigene Stufenaussagen (3–6), Auswahl (einfach oder mehrfach) und Freitext. Erscheinen als zusätzlicher Schritt, fliessen nicht ins Kompetenzprofil ein, werden erst ab Mindestgrösse ausgewertet (Freitexte in zufälliger Reihenfolge). Nach der ersten abgeschlossenen Teilnahme gesperrt, übernehmbar in eine neue Erhebung.
- **Lehrperson**, `/t/<link>`: nimmt ohne Namen und E-Mail teil und erhält einen **persönlichen Code**. Damit: fortsetzen, Profil wieder ansehen (`/mein-profil`), bei der nächsten Erhebung erneut ausfüllen mit Vergleich, alle eigenen Daten löschen. Der Code gilt innerhalb des ganzen Schulträgers. Zyklus: je nach Schulhaus fest eingestellt oder zur Auswahl (inkl. zyklusübergreifend); der Server akzeptiert nur Zyklen des Schulhauses.
- **Migration**: Bestehende Schulen werden beim Start automatisch zu eigenen Trägern (Primarstufe), bisherige Erhebungslinks bleiben gültig, Schulstufen werden zu Zyklen.

## Aufbau

```
data/items_master.xlsx     Masterdatei der Items (einzige Quelle)
data/excel_to_json.py      Excel → data/items.json
src/core.js                Auswertungslogik (Offline und Server gemeinsam)
src/template.html          Offline-Version
build.py                   erzeugt dist/, public/assets/core.js, public/assets/items.js, lib/core.cjs, lib/items.json
api/router.js              einzige Serverfunktion (alle /api/*-Aufrufe)
lib/customblock.js         Schulblock: Validierung und Auswertung der eigenen Fragen
lib/db.js, lib/auth.js     Datenbank (Schema wird automatisch angelegt), Passwörter, Sitzungen, Codes
public/                    Seiten: index, teilnahme, leitung, admin
test/                      Server-Tests (npm test): Rollen, Einladungen, Zyklen, Sicherheit
```

Items ändern: Excel bearbeiten → `npm run build:items` → committen. Die erzeugten Dateien sind eingecheckt, Vercel braucht keinen Build-Schritt.

## Lokal starten

```
npm install
ADMIN_USERNAME=avs ADMIN_PASSWORD=ein-langes-passwort npm run dev
```

Ohne `DATABASE_URL` läuft eine Datenbank im Arbeitsspeicher (PGlite); nach einem Neustart ist sie leer. Der lokale Server startet im Testmodus (Mindestgruppe 1) mit einem Entwicklungsschlüssel; beides ist nur lokal möglich. Beim ersten Anmelden verlangt das AVS-Startkonto ein neues Passwort.

Tests: `npm test` startet für jede Testgruppe einen eigenen lokalen Server mit leerer Datenbank (rund 100 Prüfungen, u. a. Rechte, Mindestgrössen, Sitzungen, Einladungen, Missbrauchsschutz).

## Auf Vercel veröffentlichen

1. Auf vercel.com **Add New → Project**, das GitHub-Repository importieren. Framework Preset: **Other**. Build- und Output-Einstellungen leer lassen.
2. Im Projekt unter **Storage → Create Database → Neon (Postgres)** eine Datenbank anlegen, Region **Frankfurt (eu-central-1)**, und mit dem Projekt verbinden. Das setzt `DATABASE_URL` automatisch.
3. Unter **Settings → Environment Variables** eintragen:
   - `SESSION_SECRET`: zufällige Zeichenfolge, mindestens 32 Zeichen, für **Production und Preview**. Ohne diesen Wert startet die Serverfunktion nicht (kein Ersatzschlüssel).
   - `CODE_PEPPER`: zufällige Zeichenfolge, mindestens 32 Zeichen. **Nie mehr ändern**, sonst werden alle persönlichen Codes ungültig. Fehlt der Wert, wird `SESSION_SECRET` verwendet; wer bereits ohne `CODE_PEPPER` gestartet ist, setzt ihn darum nicht nachträglich.
   - `TESTMODUS`: `1` nur in der Testphase. Dann gilt `MIN_GROUP_SIZE` (Standard 1). Ohne Testmodus gilt immer mindestens **5**.
   - `ADMIN_USERNAME` und `ADMIN_PASSWORD`: erstes AVS-Konto (wird beim ersten Aufruf angelegt, falls noch kein Admin existiert; beim ersten Anmelden muss das Passwort geändert werden)
4. **Deployments → Redeploy**. Danach `/admin` öffnen, anmelden, Schule und Schulleitungszugang erfassen.

Die Serverfunktion läuft in Frankfurt (`regions: fra1` in `vercel.json`).

## Datenschutz

- Keine Namen, keine E-Mail-Adressen von Lehrpersonen. Der persönliche Code wird für die Anmeldung als HMAC-Hash gespeichert und zusätzlich verschlüsselt (AES-256-GCM, Schlüssel aus `CODE_PEPPER`), damit angemeldete Lehrpersonen ihn unter «Meinen Code anzeigen» wieder abrufen können.
- Anmeldung mit Code gilt standardmässig bis zum Schliessen des Browsers (max. 12 Stunden); mit «Auf diesem Gerät angemeldet bleiben» 90 Tage.
- Ein verlorener Code lässt sich nicht wiederherstellen (kein Personenbezug). Neubeginn über den Erhebungslink; eine bereits abgeschlossene Teilnahme zählt dann doppelt.
- Schulleitungen erhalten nur zusammengefasste Werte ab 5 abgeschlossenen Teilnahmen; die Serverschnittstelle liefert keine Einzelantworten an Schulleitungen oder AVS.
- Lehrpersonen können alle eigenen Daten löschen.
- Passwörter mit scrypt gehasht, Sitzungen als signierte HttpOnly-Cookies. Konto, Rolle und Sitzungsversion werden bei jeder Anfrage in der Datenbank geprüft: Passwortwechsel, Passwort-Link und gelöschte Konten beenden bestehende Sitzungen sofort.
- Missbrauchsschutz (Zähler in der Tabelle `rate_limits`): Anmeldung (10 Versuche pro Konto, 30 pro IP in 15 Minuten), Codes (20 pro IP), Einladungslinks (30 pro IP), ungültige Erhebungslinks (30 pro IP in 10 Minuten), Teilnahmestart (80 pro Link und IP in 10 Minuten, 400 pro Link und Tag; grosszügig, weil ein Kollegium dieselbe Schul-IP teilt). Zusätzlich warnt die Erhebungsübersicht, wenn über einen Link mehr Teilnahmen gestartet wurden als Lehrpersonen erwartet sind.
- Kontextangaben (Funktion, Berufserfahrung, Zyklus) nur aus vorgegebenen Werten. CSV-Exporte entschärfen Zellen, die mit `=`, `+`, `-` oder `@` beginnen.
- Datenbankverbindung mit geprüftem TLS-Zertifikat.
- Protokoll (`audit_log`) ohne Passwörter, Codes, Tokens und Antworten. Aufbewahrungsdauer noch festzulegen.
- **Hosting-Vorbehalt:** Vercel und Neon sind US-Anbieter mit Rechenzentrum in Frankfurt. Für den Echtbetrieb mit Personendaten ist die Beurteilung durch den kantonalen Datenschutz nötig; allenfalls Umzug zu einem Schweizer Anbieter. Die Anwendung braucht dafür nur Node.js und Postgres.

## Offene Punkte

- Itemtexte an Schwyzer Begriffe anpassen, KI-Aussagen in die Bereiche integrieren (`ki`-Markierung pro Teilbereich vorhanden).
- Lizenz bzw. Einverständnis der ALP Dillingen für die Verwendung der Itemtexte klären.
- Weiterbildungsempfehlungen: Zuordnung der Teilbereiche zu den fobizz-Themenbereichen (Blatt «Weiterbildung» in der Excel-Masterdatei) ist ein Vorschlag und im Team zu validieren. **Für die Endversion: Themenbereiche auf fobizz verlinken** (im Prototyp bewusst ohne Links).
- Freitexte in eigenen Fragen und Aufbewahrungs-/Löschfristen (Erhebungen, Protokoll): Abklärung mit dem Datenschutz.

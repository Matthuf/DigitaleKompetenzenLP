# Digitale Kompetenzen von Lehrpersonen – Kanton Schwyz

Prototyp der Selbsteinschätzung digitaler Kompetenzen für Lehrpersonen (Umsetzung Kapitel 4.4 der Strategie «Digitaler Wandel im Bildungsraum im Kanton Schwyz»). Grundlage: DigCompEdu, Itemtexte aus «DigCompEdu Bavaria» (ALP Dillingen), im Fragebogen als Schwyzer Kurzfassung (Entwurf) mit Einleitung pro Teilbereich.

Zwei Versionen aus derselben Quelle:

| Version | Für wen | Daten |
|---|---|---|
| **Offline** (`dist/DigKomp_SZ_Selbsteinschaetzung.html`) | Einzelne Lehrpersonen, nur persönliche Selbsteinschätzung | bleiben im Browser, Export als Datei für den eigenen Gebrauch |
| **Server** (dieses Repository auf Vercel) | Schulen | Postgres-Datenbank, getrennt pro Schule |

## Weiterbildungsempfehlungen

Blatt «Weiterbildung» der Excel-Masterdatei: pro Teilbereich ein Haupt- und ein Nebenthema aus den fobizz-Themenbereichen (Auswahlliste im Blatt «Themen fobizz»). Regeln (in `src/core.js`): Stufe I–IV → Hauptthema (I–II mit Hinweis auf Einstiegsangebote), Stufe V → «Schulentwicklung & Leadership», Stufe VI und «keine Gelegenheit» → keine Empfehlung. Rangliste: Hauptthema 2 Punkte, Nebenthema 1 Punkt. Profil: über die Entwicklungsfelder und alle Teilbereiche auf Stufe I. Schulauswertung: über die vier Handlungsfelder, dazu Hinweise auf interne Weitergabe (mind. 25 % auf Stufe V–VI) und fehlende Voraussetzungen (mind. 25 % «keine Gelegenheit»). Änderungen: Excel anpassen, `npm run build:items`, committen.

## Schulauswertung (nur Serverversion)

- **Profil der Schule** mit Umschalter: Netz · Balken · Verteilung (100-%-Balken) · Boxplot, jeweils für Bereiche oder Teilbereiche. Die Verteilung kennt zwei Zählweisen: **Antworten** (Anteil der Einschätzungen pro Stufe I–VI, eine Lehrperson steuert mehrere Antworten bei) und **Lehrpersonen** (Anteil der Personen in den drei Gruppen Einstieg I–II, Vertiefung III–IV, Weitergeben V–VI; pro Bereich zählt der persönliche Mittelwert, auf eine Stufe gerundet). Der Boxplot entspricht dem Beurteilungstool (Box = mittlere 50 %, Median, Mittelwert gepunktet); die Antennen zeigen bewusst das 10.–90. Perzentil statt Minimum/Maximum. Boxplot pro Bereich basiert auf den persönlichen Bereichsmittelwerten.
- **Veränderung** (bei gewähltem Vergleich): Hantel pro Teilbereich, nach Veränderung sortiert.
- **Wer braucht was?** Anteile Einstieg (I–II), Vertiefung (III–IV), Weitergeben (V–VI) plus Streuung: *gespalten* = je mind. 25 % auf I–II und V–VI, *einig* = Standardabweichung ≤ 0,8, sonst *gemischt*.
- **Voraussetzungen:** Anteil «keine Gelegenheit» pro Teilbereich, Schwelle 25 %.
- **Gruppenvergleiche** (Zyklen, beim Rektorat Schulen, beim AVS Zyklen, Berufserfahrung und Funktion): ab zwei Gruppen.
- **Bericht** als PDF: Vor dem Druck fragt ein Dialog, was zusätzlich zum festen Kopfteil (Kennzahlen, Netz, Handlungsfelder, Stärken, Weiterbildungsthemen) auf den Bericht soll – Verteilung (beide Zählweisen), Boxplot, «Wer braucht was?», Voraussetzungen, Veränderung, Gruppenvergleiche, Tabelle, eigene Fragen. Nichts ist vorausgewählt; der Dialog schätzt die Seitenzahl. Jedes Diagramm lässt sich zusätzlich als PNG speichern.
- **Filter** (Zyklus, Schule) erscheinen, sobald mindestens zwei Ausprägungen vorkommen.
- **Runde über mehrere Erhebungen** (Rektorat): nur wenn jede beteiligte Schule mit Teilnahmen die Mindestgrösse erreicht, sonst ergäbe die Differenz zwischen Runde und einzelner Erhebung eine kleine Schule.
- **Eigene Fragen**: jede Frage erst ab Mindestgrösse beantworteter Antworten, Freitexte ab 3.

## Offline-Version

Nur für die persönliche Selbsteinschätzung: Fragebogen, Profil, Drucken/PDF und Export als Datei für den eigenen Gebrauch (später wieder öffnen). Keine Schulauswertung und keine eigenen Fragen der Schule, weil ausserhalb des Servers weder die Mindestgrösse noch der Schutz vor Rückschlüssen durchgesetzt werden kann. Ältere Ergebnisdateien mit Fragen einer Schule lassen sich öffnen; übernommen werden nur Kompetenzantworten und Kontext.

## Rollen der Serverversion

Aufbau: **Schulträger** (Primarstufe, Sekundarstufe oder beides, z. B. Einsiedeln, Küssnacht, Gersau) → **Schulen bzw. Schulhäuser**. Die **Zyklen werden pro Schulhaus** festgelegt (Standard nach Stufe des Trägers: Primar Zyklus 1–2, Sek Zyklus 3, beides Zyklus 1–3); Rektorat oder AVS passen sie an. Ein Zyklus = für Lehrpersonen fest eingestellt, mehrere = Auswahl inkl. «zyklusübergreifend». Eine Erhebung gehört dem Träger, jede beteiligte Schule hat einen **eigenen Link**.

- **AVS-Bereich**, `/admin` (intern «Admin»; im Unterschied zum «Adminbereich Schule» unter `/leitung`): erfasst Schulträger, Schulen und Zugänge, legt die **vorgegebene Erhebung** fest («Erhebung ICT-Kompetenzen Lehrpersonen Schwyz»; technisch eine «Runde») und sieht unter «Vorgabe AVS», wie vollständig sie ist (X von Y Schulträgern dabei, davon mit Teilnahmen, abgeschlossene Teilnahmen). Die **kantonale Auswertung** fasst alle Teilnahmen an der Vorgabe zusammen, nie eigene Erhebungen der Schulen, immer pro Runde, filterbar nach Zyklus, Vergleiche nach Zyklus, Berufserfahrung und Funktion. **Schwelle:** Kantonswerte erst ab Teilnahmen aus drei Schulträgern; Filter und Vergleiche nur, wenn jede Gruppe aus drei Trägern stammt (`MIN_TRAEGER`). **Keine Angaben zu Schulen oder Trägern** (weder Filter noch Namen noch IDs in der Antwort, keine Teilnahmezahlen pro Träger), keine eigenen Fragen, keine Freitexte; jede Person zählt einmal (jüngste Teilnahme der Runde). Keine Einsicht in Schulauswertungen. Unter «Protokoll» die letzten Aktionen (Anmeldungen, Einladungen, Passwort-Links, gelöschte Zugänge, eingesehene Auswertungen).
- **Vorgabe zuerst:** Eine eigene, zusätzliche Erhebung ist für ein Schulhaus erst möglich, wenn es an der aktuellen Vorgabe (neueste wählbare) teilgenommen hat und diese Erhebung abgeschlossen ist. Der Server prüft das beim Eröffnen und beim Aufnehmen eines Schulhauses.
- **Rektorat / Hauptschulleitung**, `/leitung`: eröffnet Erhebungen für alle oder ausgewählte Schulen des Trägers, verteilt die Links oder überlässt sie den Schulleitungen, sieht alle Erhebungen des Trägers (auch jene der Schulleitungen), die Gesamtauswertung, den Filter nach Schule und «Schulen im Vergleich». Pro Runde kann das Rektorat auch alle Erhebungen der Schulen zusammen auswerten.
- **Schulleitung**, `/leitung`: sieht Erhebungen mit einem Link für ihre Schule und davon **nur die Auswertung der eigenen Schule**. Kann selbst Erhebungen für die eigene Schule eröffnen und verwalten; Erhebungen des Rektorats verwaltet das Rektorat.
- **Zugänge per Einladung**: Das AVS importiert die Liste der Schulträger (Excel einfügen oder CSV: Träger, Stufe, Name, E-Mail; **keine Schulhäuser**: diese erfasst das Rektorat bzw. die Hauptschulleitung nach der Anmeldung selbst, auch direkt in den «Ersten Schritten») und erhält pro Rektorat bzw. Hauptschulleitung einen Einladungslink (30 Tage, einmalig; Versand per E-Mail-Vorlage oder CSV für Serienbrief, der Server verschickt keine Mails). Eingeladene legen Benutzername und Passwort selbst fest (`/einladung/<token>`). Im Admin steht beim Schulträger «Person einladen» zuoberst (Normalfall: Rektorat bzw. Hauptschulleitung); «Schulhäuser erfassen» ist eingeklappt und nur für Anfragen der Schule gedacht. Danach verwaltet der Schulträger unter «Schulen und Zugänge» seine Schulhäuser: oben eine Übersicht («4 Schulhäuser · 1 mit Zugang · 2 eingeladen, noch kein Zugang · 1 ohne Schulleitung»), darunter ein Kasten pro Schulhaus, alphabetisch (ohne Schulleitung bzw. mit abgelaufener Einladung mit orangem Rand). Im Kasten Name, Zyklen und das Menü «Bearbeiten» (Umbenennen, Zyklen ändern, Entfernen), darunter die Schulleitung mit Status (orange «Eingeladen · noch kein Zugang», rot «Einladung abgelaufen», grün «Zugang aktiv») und «Erneut senden»; Seltenes (Zurückziehen, Link für neues Passwort, Zugang löschen) im Menü «Mehr», mit Rückfrage an Ort und Stelle. Schulleitungen werden nur dort eingeladen und verwaltet. Die Zyklen lassen sich nur innerhalb der Stufe des Trägers wählen (Primar 1–2, Sek nur 3, gesamt 1–3; der Server prüft das). Darunter steht «Rektorat und Verwaltung» mit den Personen für alle Schulhäuser (Stellvertretung, Schulverwaltung) samt offenen Einladungen und «Person einladen». Schulleitungen laden Personen für die eigene Schule ein (z. B. Co-Leitung). Passwort vergessen: Link für ein neues Passwort (24 Stunden, beendet alle bestehenden Sitzungen) durch Träger, Schulleitung (eigene Schule) oder AVS; verliert das Rektorat den Zugang, hilft das AVS. Tokens werden nur als Hash gespeichert. **Einladungen ohne Mailserver** (Entscheid 5.10.2026, Normalbetrieb): Der Server verschickt keine Mails. Nach dem Erstellen bzw. «Erneut senden» (neuer Link, der alte wird ungültig) erscheint die Einladung mit «Im E-Mail-Programm öffnen» als Hauptaktion (mailto mit Empfänger, Betreff «Ihr persönlicher Zugang: …» und Text), «Link kopieren» als Nebenweg. Der Assistent endet mit dem Block «Einladungen verschicken», eine Zeile pro Schulleitung aus Schritt 3, weil der Klartext-Link nur bei der Erzeugung existiert (gespeichert ist nur der Hash). Einladungslink und Teilnahmelink stehen nie in derselben Mail: Die Erhebungs-Mail wird weitergeleitet, und wer einen mitgeschickten Einladungslink einlöst, übernähme den Zugang. Die Erhebungs-Mail an eine eingeladene Schulleitung ohne Zugang verweist darum nur auf die separate Einladung. **Versand per E-Mail** (optional, `lib/mail.js`, bewusst nicht eingerichtet): Ist ein SMTP-Dienst eingerichtet, verschickt der Server Einladungen direkt (Rektorat an Schulleitungen und weitere Personen, AVS an Rektorate; «Erneut senden» verschickt einen neuen Link). Absender `MAIL_FROM`, Antworten gehen an die einladende Person. Status pro Einladung mit Ablaufdatum: «Verschickt · gültig bis …» (orange), «Versand fehlgeschlagen» (rot), «Eingeladen · gültig bis …» (grau, Link selbst weitergeben), «Einladung abgelaufen» (grau), angenommen = «Zugang aktiv» (grün); Details beim Überfahren oder Anklicken. Ohne Einrichtung bleibt es bei Link und E-Mail-Vorlage. Der Import der Trägerliste verschickt weiterhin nichts (CSV für Serienbrief).
- **Vorgabe AVS** (intern «Runde»): Das AVS gibt eine Erhebung vor. Jedes Schulhaus nimmt einmal daran teil (sonst würden Lehrpersonen doppelt gezählt). Zusätzliche Erhebungen legen die Schulen frei fest. In der Oberfläche der Schulen erscheint sie als «… (Vorgabe AVS)», nicht als Runde.
- **Mindestgrösse**: keine. Auswertungen erscheinen ab der ersten abgeschlossenen Teilnahme (Entscheid AVS vom 30.9.2026, in Absprache mit dem Datenschutz). Gezeigt werden immer zusammengefasste Werte, nie ein Einzelprofil. Einzige Ausnahme: Freitexte bei eigenen Fragen erst ab 3 Antworten (`TEXT_MIN` in `lib/customblock.js`), weil sie wörtlich wiedergegeben werden.
- **Eigene Fragen** (intern «Schulblock»): Pro Erhebung beliebig viele eigene Fragen (keine Obergrenze, Entscheid 4.10.2026: Rektorate legen den Umfang selbst fest), erfasst direkt in der Erhebungskarte (aufklappbar), vier Formen mischbar: Zustimmungsskala (4 Stufen), Auswahl (einfach oder mehrfach) und Freitext (eigene Stufenaussagen am 5.10.2026 entfernt; bestehende bleiben auswertbar). Erscheinen als zusätzlicher Schritt, fliessen nicht ins Kompetenzprofil ein, werden getrennt ausgewertet (Freitexte erst ab 3 Antworten und in zufälliger Reihenfolge). Nach der ersten abgeschlossenen Teilnahme gesperrt, übernehmbar in eine neue Erhebung. Ungespeicherte Änderungen gehen nur nach Rückfrage verloren.
- **Erhebungsübersicht**: offene Erhebungen zuerst (kantonale Runde zuoberst), abgeschlossene eingeklappt unter «Frühere Erhebungen». «Neue Erhebung eröffnen» steht **unter** der Liste und zeigt bei einer laufenden Erhebung einen Hinweis, dass eine zusätzliche selten nötig ist. Freiwilliges **Zieldatum** («Ausfüllen bis»), erscheint in der E-Mail-Vorlage und auf der Startseite der Lehrpersonen; schliesst nicht automatisch. Das Rektorat kann später erfasste **Schulhäuser in eine laufende Erhebung aufnehmen**. Pro Schulhaus gibt es zwei E-Mail-Vorlagen: **an die Lehrpersonen** (Teilnahmelink) und, für das Rektorat, **an die Schulleitung** (mit Zugang: Hinweis auf die Anmeldung; ohne Zugang: Link zum Weiterleiten; Empfänger aus den Zugängen des Schulhauses). Solange keine Erhebung besteht, zeigt die Seite dem Rektorat «Erste Schritte»: eine Checkliste mit dem Stand und den Knopf **«Jetzt einrichten»**. Die Kopfzeile zeigt «Schritt x von 3», wobei x der erste offene Schritt ist; jede Zeile nennt die Aufgabe, ihre Folge und den Stand. Dieser öffnet einen Assistenten (`public/assets/wizard.js`). Schritt 1 ist allein die Grundsatzfrage **Rahmen der Erhebung**: getrennt pro Schulhaus oder gesamt für den ganzen Schulträger. Danach verzweigt der Weg: getrennt → Schulhäuser, Zugänge (überspringbar), Eröffnen (4 Schritte); gesamt → direkt Eröffnen, mit einem Namen für die gemeinsame Auswertung (2 Schritte). Der Zähler «Schritt x von y» zeigt den gewählten Weg. Am Schluss stehen die Einladungen an die Schulleitungen zum Verschicken über das eigene E-Mail-Programm; die Teilnahmelinks stehen danach bei der Erhebung. Abbrechen ist jederzeit möglich; Erfasstes bleibt, und der Assistent steigt beim nächsten Öffnen an der richtigen Stelle ein. Das Formular «Neue Erhebung eröffnen · ohne Assistent» bleibt als zweiter Weg bestehen.
- **Lehrperson**, `/t/<link>`: nimmt ohne Namen und E-Mail teil und erhält einen **persönlichen Code**. Damit: fortsetzen, Profil wieder ansehen (`/mein-profil`), bei der nächsten Erhebung erneut ausfüllen mit Vergleich, alle eigenen Daten löschen. Der Code gilt innerhalb des ganzen Schulträgers. Zyklus: je nach Schulhaus fest eingestellt oder zur Auswahl (inkl. zyklusübergreifend); der Server akzeptiert nur Zyklen des Schulhauses.
- **Migration**: Bestehende Schulen werden beim Start automatisch zu eigenen Trägern (Primarstufe), bisherige Erhebungslinks bleiben gültig, Schulstufen werden zu Zyklen.

## Aufbau

```
data/items_master.xlsx     Masterdatei der Items (einzige Quelle)
docs/handout-rektorate.html  Kurzanleitung für Rektorate (Quelle)
docs/build_handout.py      erzeugt daraus docs/Handout_Rektorate_DigKomp_SZ.pdf
data/excel_to_json.py      Excel → data/items.json (Kapitelreiter: Spalte D Original, Spalte E Kurzfassung mit Fettdruck bzw. Einleitung in der Kopfzeile)
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

Tests: `npm test` startet für jede Testgruppe einen eigenen lokalen Server mit leerer Datenbank (150 Prüfungen, u. a. Rechte, Mindestgrössen, Sitzungen, Einladungen, Missbrauchsschutz).

## Auf Vercel veröffentlichen

1. Auf vercel.com **Add New → Project**, das GitHub-Repository importieren. Framework Preset: **Other**. Build- und Output-Einstellungen leer lassen.
2. Im Projekt unter **Storage → Create Database → Neon (Postgres)** eine Datenbank anlegen, Region **Frankfurt (eu-central-1)**, und mit dem Projekt verbinden. Das setzt `DATABASE_URL` automatisch.
3. Unter **Settings → Environment Variables** eintragen:
   - `SESSION_SECRET`: zufällige Zeichenfolge, mindestens 32 Zeichen, für **Production und Preview**. Ohne diesen Wert startet die Serverfunktion nicht (kein Ersatzschlüssel).
   - `CODE_PEPPER`: zufällige Zeichenfolge, mindestens 32 Zeichen. **Nie mehr ändern**, sonst werden alle persönlichen Codes ungültig. Fehlt der Wert, wird `SESSION_SECRET` verwendet; wer bereits ohne `CODE_PEPPER` gestartet ist, setzt ihn darum nicht nachträglich.
   - E-Mail-Versand (optional): `SMTP_HOST`, `SMTP_PORT` (587 oder 465), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (z. B. `Digitale Kompetenzen SZ <noreply@…>`), `APP_URL` (Adresse der Anwendung für Links in E-Mails). Die Absenderdomäne muss beim E-Mail-Dienst bestätigt sein (SPF/DKIM), sonst landen Mails im Spam. Eine Adresse @sz.ch geht nur mit Einträgen des AFI.
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
- Missbrauchsschutz (Zähler in der Tabelle `rate_limits`): Anmeldung (10 Versuche pro Konto, 30 pro IP in 15 Minuten), Codes (20 pro IP), Einladungslinks (30 pro IP), ungültige Erhebungslinks (30 pro IP in 10 Minuten), Teilnahmestart (80 pro Link und IP in 10 Minuten, 400 pro Link und Tag; grosszügig, weil die Lehrpersonen einer Schule dieselbe Schul-IP teilen). Zusätzlich warnt die Erhebungsübersicht, wenn über einen Link mehr Teilnahmen gestartet wurden als Lehrpersonen erwartet sind.
- Kontextangaben (Funktion, Berufserfahrung, Zyklus) nur aus vorgegebenen Werten. CSV-Exporte entschärfen Zellen, die mit `=`, `+`, `-` oder `@` beginnen.
- Datenbankverbindung mit geprüftem TLS-Zertifikat.
- Protokoll (`audit_log`) ohne Passwörter, Codes, Tokens und Antworten. Aufbewahrungsdauer noch festzulegen.
- **Hosting-Vorbehalt:** Vercel und Neon sind US-Anbieter mit Rechenzentrum in Frankfurt. Für den Echtbetrieb mit Personendaten ist die Beurteilung durch den kantonalen Datenschutz nötig; allenfalls Umzug zu einem Schweizer Anbieter. Die Anwendung braucht dafür nur Node.js und Postgres.

## Offene Punkte

- Itemtexte an Schwyzer Begriffe anpassen, KI-Aussagen in die Bereiche integrieren (`ki`-Markierung pro Teilbereich vorhanden).
- Lizenz bzw. Einverständnis der ALP Dillingen für die Verwendung der Itemtexte klären.
- Weiterbildungsempfehlungen: Zuordnung der Teilbereiche zu den fobizz-Themenbereichen (Blatt «Weiterbildung» in der Excel-Masterdatei) ist ein Vorschlag und im Team zu validieren. **Für die Endversion: Themenbereiche auf fobizz verlinken** (im Prototyp bewusst ohne Links).
- Freitexte in eigenen Fragen und Aufbewahrungs-/Löschfristen (Erhebungen, Protokoll): Abklärung mit dem Datenschutz.

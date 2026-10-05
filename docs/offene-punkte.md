# Selbsteinschätzung digitale Kompetenzen SZ – offene Punkte

Stand: 5. Oktober 2026 · Repository: github.com/Matthuf/DigitaleKompetenzenLP · Testinstanz: digitale-kompetenzen-lp.vercel.app

## Stand in Kürze

**Servervariante:**
- Schulträger (Gemeinde/Bezirk) mit Schulhäusern; Rollen AVS, Rektorat/Hauptschulleitung, Schulleitung und Lehrperson.
- Zyklen statt Schulstufen, pro Schulhaus einstellbar (innerhalb der Stufe des Trägers).
- Eine vom AVS vorgegebene Erhebung: «Erhebung ICT-Kompetenzen Lehrpersonen Schwyz». Eine spätere zweite Vorgabe (z. B. zwei Jahre später, zum Vergleich) ist als Option offen (siehe Entscheid 15).
- Kantonale AVS-Auswertung ohne Bezug zu Schulen, nur aus der Vorgabe, ab Teilnahmen aus drei Schulträgern.
- Zugänge per Einladung: Das AVS importiert nur die Schulträger (oberste Ebene). Schulhäuser und weitere Zugänge erfassen Rektorat bzw. Hauptschulleitung selbst.
- Auswertungen: Netz, Balken, Verteilung, Boxplot, Wer braucht was?, Voraussetzungen, Gruppenvergleiche, Bericht als PDF, Bilder, CSV.
- Eigene Fragen der Schulen; fobizz-Themenbereiche als Empfehlung.

**Sicherheitsprüfung (29.9.):** Befunde umgesetzt: kein Ersatzschlüssel mehr, Sitzungen widerrufbar, Passwort-Links 24 Stunden, Rate Limits mit Warnung, AVS-Auswertung nur pro vorgegebener Erhebung, Protokoll. Die damals eingebaute Mindestgruppe 5 ist am 30.9. wieder entfernt worden (siehe unten).

**Schulleitungsseiten (30.9.):** Überarbeitet nach UX-Durchsicht:
- eigene Fragen direkt in der Erhebungskarte
- Zieldatum («Ausfüllen bis»)
- «Erste Schritte» für neue Rektorate, mit Schulhäusern direkt erfassen
- Schulhäuser nachträglich in eine laufende Erhebung aufnehmen
- Schulleitung direkt beim Schulhaus einladen, mit Status
- E-Mail-Vorlage «an die Schulleitung»
- Beschriftung «Rektorat/Hauptschulleitung», Rolle immer sichtbar
- keine «Runde» mehr gegenüber den Schulen, stattdessen «… (Vorgabe AVS)»

**Rektoratsseiten, Erhebungen (4.10.):** Zweite UX-Durchsicht:
- «Selbsteinschätzung einrichten»: Satz «Sie selbst füllen keinen Fragebogen aus …» entfernt; Schritte nummeriert statt leerer Kreise (sahen wie Ankreuzfelder aus).
- Assistent: Neues Schulhaus-Feld erhält sofort den Fokus. Der Abschluss («Einrichtung abgeschlossen») zeigt keine Teilnahmelinks mehr, sondern verweist auf die Erhebung im Adminbereich. Die Erhebung wird weiterhin im letzten Schritt eröffnet.
- Einleitung der Seite «Erhebungen»: erster Satz sichtbar, «Das können Sie hier tun» aufklappbar (Link weitergeben, Rücklauf, Zieldatum, eigene Fragen, Schliessen).
- Erhebungskarte: Schulhäuser als Übersichtstabelle (abgeschlossen, in Bearbeitung, Rücklauf, Total); URL nicht mehr sichtbar; pro Schulhaus «Link kopieren» und Menü «E-Mail oder QR-Code» mit je einer Zeile Erklärung. Bewusst keine Tooltips (Touch, Tastatur, Screenreader).
- Eigene Fragen stehen vor den Links (mit Hinweis «vor dem Verteilen der Links», solange änderbar) und sind ausgeblendet, wenn keine vorhanden und nicht mehr änderbar.
- «Erhebung schliessen» rechts; «durch Rektorat/Hauptschulleitung» nur in der Sicht der Schulleitung; «Weitere Erhebung eröffnen · nur für einen anderen Zeitpunkt oder Zweck».
- Geprüft bei 1280 und 390 Pixel als Rektorat und Schulleitung, axe ohne Befund.

**Schulen und Zugänge (4.10.):** UX-Durchsicht und Umbau:
- Jede Person steht genau an einem Ort: Schulleitungen nur beim Schulhaus (Status, neues Passwort, Löschen, Einladung), darunter «Rektorat und Verwaltung» für die Trägerebene samt offenen Einladungen. Die Gesamttabelle «Personen mit Zugang» und der eigene Abschnitt «Offene Einladungen» entfallen.
- Liste statt Tabelle; auf dem Handy lagen die Aktionen der Tabelle ausserhalb des Bildschirms.
- Keine rote Schaltfläche, solange kein Formular offen ist: «Person einladen» und «Schulhaus hinzufügen» klappen ihr Formular auf.
- Kürzere Einführung; die Erklärung zu den Zyklen steht im Zyklen-Formular.
- Zyklen nur innerhalb der Stufe des Trägers (Primar 1–2, Sek 3, gesamt 1–3), auch serverseitig geprüft. Bei Sek-Trägern entfallen Zyklenangabe und «Zyklen ändern».
- Status der Einladung mit Ablaufdatum: «Eingeladen · gültig bis …» bzw. «Verschickt · gültig bis …» (vorher «Link erstellt»). Gilt auch im AVS-Bereich.
- Einladungs- und Passwort-Link nicht mehr gross im Kasten; aufklappbar «Link anzeigen» (Aktionen seit 5.10. siehe «Einladungen ohne Mailserver»).
- Geprüft bei 1280 und 390 Pixel als Rektorat und Schulleitung, axe ohne Befund.

**Rektoratsseiten, Feinschliff (5.10.):**
- Editor eigene Fragen: Überschrift und Einleitung stehen in einem grauen Kasten «Abschnitt im Fragebogen» (Feld «Überschrift des Abschnitts»), darunter die Liste «Fragen (n)». Vorher wirkten sie wie Felder der ersten Frage.
- Assistent Schritt 3: Felder heissen «Name Schulleitung» und «E-Mail Schulleitung».
- Menü «E-Mail oder QR-Code»: «E-Mail an die Schulleitung» steht zuerst (üblicher Ablauf beim Rektorat).
- E-Mail an die Schulleitung: Die Adresse aus einer offenen Einladung (z. B. aus dem Assistenten) steht bereits im Feld «An» und im mailto-Link, die Anrede nutzt den Namen. Der Text enthält den Teilnahmelink zum Weiterleiten, solange kein Zugang besteht.
- Beide Mail-Vorlagen: «Im E-Mail-Programm öffnen» als Hauptbutton zuerst, «Text kopieren» als schlichter Link.
- Geprüft bei 1280 und 390 Pixel, axe ohne Befund.

**Lehrpersonen (30.9.):**
- Startseite mit einem Hauptweg «Selbsteinschätzung starten»; der Code ist ein aufklappbarer Nebenweg.
- Fehlt beim Code-Notieren das Häkchen, erscheint ein roter Hinweis.
- **Fragebogen im neuen Format:** Kurzfassung der Aussagen (das Konkrete fett), eine Einleitung pro Teilbereich («Beispiele: …» bzw. «Worum es geht: …») und rechts neben jeder Aussage die farbige Stufenbox (I Einsteigen … VI Weitergeben). Gilt für die Server- und die Offline-Version; Instrumentversion SZ-2026.1-entwurf. Die Originaltexte bleiben in der Excel und in den Daten erhalten.
- Der Knopf «Meine Daten löschen» ist aus der Auswertung entfernt. Die Funktion steht neu in der Hilfe unter «Kann ich meine Daten löschen?» und erscheint dort nur, wenn die Person mit ihrem Code angemeldet ist.
- Beim Drucken des Profils erscheinen die Farben automatisch, auch ohne «Hintergrundgrafiken» im Druckdialog.

**Mindestgruppe (30.9., Entscheid):** Die Schwelle von fünf abgeschlossenen Teilnahmen ist vollständig entfernt. Auswertungen erscheinen ab der ersten abgeschlossenen Teilnahme, ebenso Filter und Gruppenvergleiche. Grundlage: Rückmeldung des Datenschutzes, dass dies aktuell nicht nötig ist. Weggefallen sind damit auch die Variablen `MIN_GROUP_SIZE` und `TESTMODUS` sowie die Regel gegen Differenzbildung zwischen Runde und einzelner Erhebung. **Einzige verbleibende Schwelle:** Freitexte bei eigenen Fragen erscheinen erst ab zehn Antworten, weil sie wörtlich wiedergegeben werden (`TEXT_MIN` in `lib/customblock.js`). Rückgängig machen wäre ein kleiner Eingriff.

**Eigene Fragen ohne Obergrenze (4.10., Entscheid):** Die frühere Grenze von 15 Fragen war eine unbegründete Setzung und ist entfernt. Rektorate legen den Umfang selbst fest. Server, Editor, Einleitung, Hilfe, README und Handout (inkl. PDF) sind nachgeführt.

**Vollständige kantonale Gesamtdaten (4.10., Entscheide):**
- **Vorgabe zuerst, strenge Variante:** Eine eigene, zusätzliche Erhebung ist für ein Schulhaus erst möglich, wenn es an der aktuellen Vorgabe teilgenommen hat **und** diese Erhebung abgeschlossen ist. So fehlt keine Schule in den Gesamtdaten, und Vorgabe und eigene Erhebung laufen nicht gleichzeitig. Server prüft beim Eröffnen und beim Aufnehmen eines Schulhauses; das Formular nennt den Grund pro Schulhaus. Aktuelle Vorgabe = neueste wählbare, sonst neueste.
- **Keine Vermischung:** Die kantonale Auswertung nimmt nur Erhebungen der Vorgabe, nie eigene Erhebungen (war schon so, jetzt mit Test abgesichert).
- **Schwelle drei Schulträger:** Kantonswerte erst ab Teilnahmen aus drei Trägern; Zyklusfilter und Vergleiche nur, wenn jede Gruppe aus drei Trägern stammt (sonst wäre z. B. «Zyklus 3» der Wert eines einzelnen Bezirks). Gilt nur für die AVS-Sicht, nicht für Schulen.
- **Vollständigkeit für das AVS:** Reiter «Vorgabe AVS» zeigt «X von Y Schulträgern dabei», davon mit Teilnahmen, Schulhäuser, abgeschlossene Teilnahmen. Teilnahme- und Erhebungszahlen pro Träger im AVS-Bereich entfernt.
- **Bezeichnung** «Erhebung ICT-Kompetenzen Lehrpersonen Schwyz» (mit Bindestrich), bestehende Vorgabe wird beim Deployment umbenannt.
- Bekannte Grenzen: «Teilgenommen» heisst technisch «Vorgabe eröffnet und abgeschlossen», echte Teilnahme lässt sich nicht erzwingen. Das Protokoll im AVS-Bereich zeigt weiterhin, welcher Träger eine Erhebung eröffnet hat. Die Vorgabe lässt sich jederzeit wieder öffnen (auch nach einer eigenen Erhebung).

**Kein eigener Mailserver (5.10., Entscheid):** Einladungen und Erhebungs-Mails verschickt das Rektorat selbst über sein E-Mail-Programm (mailto mit eingesetzten Angaben). Der eingebaute SMTP-Versand (`lib/mail.js`) bleibt unkonfiguriert und wird nicht ausgebaut.

**Einladungen ohne Mailserver (5.10., umgesetzt):**
- Behobener Fehler: Der Assistent erzeugte in Schritt 3 Einladungen, verwarf aber die Links. Ohne Mailserver kamen diese Einladungen nie an; die Schulleitung stand trotzdem als «Eingeladen» da.
- Assistent: Der Abschluss zeigt «Einladungen verschicken», eine Zeile pro Schulleitung (Name, Schulhaus, Adresse) mit «Im E-Mail-Programm öffnen» und «Link kopieren»; nach dem Öffnen «✓ geöffnet» (ob tatsächlich verschickt wurde, ist nicht feststellbar). Darunter der Hinweis auf die Teilnahmelinks bei der Erhebung.
- Schulen und Zugänge sowie AVS-Bereich: immer «Erneut senden» (vorher ohne Mailserver «Neuer Link»). Erzeugt einen neuen Link (der alte wird ungültig) und zeigt «Im E-Mail-Programm öffnen» als Hauptaktion, «Link kopieren» als Nebenweg. Bewusst kein automatisches Öffnen des E-Mail-Programms: nach einer Serveranfrage unzuverlässig, und ohne eingerichtetes Mailprogramm passiert sonst einfach nichts.
- Einladungs-Mail: Betreff «Ihr persönlicher Zugang: Selbsteinschätzung digitale Kompetenzen (Schulleitung …)», Satz «Bitte leiten Sie diese E-Mail nicht weiter …»; bei Schulleitungen Hinweis, wo nach der Anmeldung Link, Rücklauf und Auswertung stehen. Die (unbenutzte) SMTP-Vorlage auf dem Server ist gleich angepasst.
- Erhebungs-Mail an die Schulleitung, eingeladen und noch ohne Zugang: Satz mit Verweis auf die separate Einladung (mit Betreff). Gilt auch für Einladungen ohne Adresse; bei abgelaufener Einladung entfällt der Satz. Der Einladungslink steht nie in dieser Mail (ein Test sichert ab, dass er nicht in den Daten der Seite steht).
- Hilfe (neue Frage «Wie verschicke ich Einladungen?»), README, Handout (weiterhin 3 Seiten) nachgeführt.
- Geprüft bei 1280 und 390 Pixel, axe ohne Befund.
- Bekannte Grenze: Wer den Assistenten schliesst, ohne die Einladungen zu öffnen, verliert die Links. Weg zurück: «Erneut senden» unter «Schulen und Zugänge» (steht im Block).

**Schulen und Zugänge, Umbau (5.10.):** nach kritischer UX-Durchsicht:
- Übersicht oben (z. B. «4 Schulhäuser · 1 mit Zugang · 2 eingeladen, noch kein Zugang · 1 ohne Schulleitung»); Schulhäuser mit Handlungsbedarf zuerst, mit orangem Rand.
- Ein Kasten pro Schulhaus mit fettem Namen; Umbenennen, Zyklen ändern, Entfernen im Menü «Bearbeiten». «an Erhebungen beteiligt, entfernen nur über das AVS» steht nur noch dort (Entfernen ausgegraut).
- Aktionen direkt hinter dem Status statt am rechten Rand; «Erneut senden» sichtbar, Zurückziehen, Link für neues Passwort und Zugang löschen im Menü «Mehr», Rückfrage an Ort und Stelle.
- Status nach Handlungsbedarf: orange «Eingeladen · noch kein Zugang» (Gültigkeit in der Zeile darunter), rot «Einladung abgelaufen», grün «Zugang aktiv». Gilt auch im AVS-Bereich.
- Zweiter Einleitungsabsatz nur, solange noch kein Schulhaus erfasst ist; Zwischenlabel «Schulleitung» entfällt.
- Geprüft bei 1280 und 390 Pixel, axe ohne Befund.

Insgesamt 150 automatisierte Tests.

**Offline-Version:** nur noch persönliche Selbsteinschätzung (Profil, Drucken/PDF, Datei für den eigenen Gebrauch). Keine Schulauswertung und keine eigenen Fragen mehr.

**Briefing:** Das Word-Briefing für die externe Fachperson ist nachgeführt (Fassung 3). Die Änderungen ab dem 29.9. sind darin noch nicht enthalten.

**Itemtexte:** Die Excel `data/items_master.xlsx` im Repository ist die Datei mit Kurzfassung und Einleitungen (plus Blätter «Weiterbildung» und «Themen fobizz»). Textänderungen im Kapitelreiter, Spalte E vornehmen (Fettdruck wird übernommen), danach `python3 data/excel_to_json.py` und `python3 build.py`, oder die Excel Claude geben.

---

## 1 Entscheide im AVS / Team

| # | Frage | Hinweis |
|---|---|---|
| 1 | **Hosting:** Beim AFI anfragen: Betrieb möglich? Welche Technik (Node.js + PostgreSQL)? Adresse, z. B. digitalekompetenzen.sz.ch? | Vercel/Neon sind US-Anbieter (Frankfurt) und nur für den Prototyp gedacht. Die Anwendung ist ohne Umbau portierbar. |
| 2 | **Betriebsverantwortung:** Wer übernimmt Updates, Sicherheit und Backups? | Ein «kleines PHP-Script» (Idee aus der Teammail) unterschätzt den Umfang. |
| 3 | **Datenschutz:** Die kantonale Datenschutzstelle früh einbeziehen. | Daten sind pseudonym, nicht anonym (Kontextangaben, Code verknüpft Erhebungen). Die kantonale Auswertung braucht eine klare Information an die Lehrpersonen. |
| 4 | **Freitext** bei eigenen Fragen behalten oder streichen? | In Abklärung mit dem Datenschutz. Heute: möglich, erscheint nur bei der Schule und erst ab zehn Antworten. Streichen wäre ein kleiner Eingriff. |
| 5 | **Aufbewahrung und Löschung:** Wie lange bleiben Erhebungen, Protokoll und Zähler gespeichert? Wer löscht? | In Abklärung mit dem Datenschutz. Danach automatische Löschung einbauen. |
| 6 | **Ansprache** Du oder Sie? | Der Webguide verlangt «Sie». Die Texte sind heute teils neutral formuliert. |
| 7 | **Lizenz der Itemtexte** (DigCompEdu Bavaria / ALP Dillingen) klären | Gilt auch für die Kurzfassung, weil sie auf den Originaltexten aufbaut. |
| 8 | **Vorgegebene Erhebung:** Zeitraum, Pilotschulen? Kommunikation an Rektorate? | Titel «Erhebung ICT-Kompetenzen Lehrpersonen Schwyz» (4.10.). Im Admin unter «Vorgabe AVS» erfassen bzw. umbenennen. Kommunikation: Eigene Erhebungen erst nach Abschluss der Vorgabe. |
| 15 | **Zweite Vorgabe später** (z. B. zwei Jahre später, zum Vergleich)? | Technisch schon möglich, Daten bleiben pro Vorgabe getrennt. Vorher nötig: Zustand «Vorgabe abgeschlossen» (schliesst alle zugehörigen Erhebungen, kein Wiederöffnen), sonst ändern sich die Daten der ersten Vorgabe weiter; Vergleichsansicht zweier Vorgaben im AVS-Bereich; Items müssen gleich bleiben (`instrument_version`). |
| 16 | **Schwelle drei Schulträger** mit dem Datenschutz bestätigen | Umgesetzt 4.10. (`MIN_TRAEGER` in `api/router.js`). Betrifft nur die kantonale AVS-Sicht; Personen-Mindestgruppe bleibt entfallen. |
| 17 | **Datensicherung:** Speicherort, Aufbewahrung, tragbarer Datenverlust und Verantwortliche festlegen (5.10.) | Heute gibt es kein Backup, nur das «History Window» von Neon (je nach Tarif 6 Stunden bis max. 30 Tage, beim selben Anbieter, also kein Backup). **Pflicht vor dem Start der Vorgabe-Erhebung**, weil diese Daten nicht reproduzierbar sind. Zu entscheiden: (a) Speicherort in der Schweiz – AFI-Speicher oder Schweizer Cloud (z. B. Infomaniak, Exoscale), nicht GitHub; hängt mit Entscheid 1 zusammen; (b) Aufbewahrung, Vorschlag 7 tägliche, 4 wöchentliche, 3 monatliche Stände (kürzer, z. B. 30 Tage, falls der Datenschutz das verlangt); (c) tragbarer Datenverlust, Vorschlag max. 24 Stunden (tägliche Sicherung); (d) wer den Entschlüsselungsschlüssel verwahrt (mind. zwei Personen). Mit dem Datenschutz klären (Entscheid 3/5): Backups enthalten Namen und E-Mails der Zugänge und pseudonyme Antworten; gelöschte Daten bleiben bis zum Ablauf der Aufbewahrung im Backup – gehört in die Datenschutzerklärung. Technische Umsetzung siehe Abschnitt 3. |
| 9 | **Wer im AVS** sieht die kantonale Auswertung? Wie viele Admin-Konten? | Heute gibt es ein Admin-Konto aus der Umgebungsvariable. |
| 10 | Später: **Anmeldung über bestehende Konten** (Edulog, Microsoft 365) | Hängt vom AFI ab |
| 11 | **Kurzfassung der Itemtexte** definitiv übernehmen? | Im Prototyp umgesetzt (30.9.), Texte weiterhin Entwurf. Zusammenlegen auf 3 Stufen wird nicht empfohlen. |
| – | ~~**E-Mail-Versand der Einladungen vom Server freischalten?** (früher Nr. 12)~~ | Entschieden 5.10.: nein, kein eigener Mailserver. Das Rektorat verschickt Einladungen über das eigene E-Mail-Programm (mailto mit eingesetztem Link), umgesetzt 5.10. («Einladungen ohne Mailserver»). Der eingebaute SMTP-Versand (`lib/mail.js`) bleibt unkonfiguriert. Er liesse sich später ohne Code-Änderung über die Vercel-Variablen `SMTP_*`, `MAIL_FROM`, `APP_URL` aktivieren, setzt dann aber SMTP-Dienst, SPF/DKIM und eine Klärung mit dem Datenschutz voraus. |
| 13 | **Stufenbox neben den Aussagen** beibehalten? | Umgesetzt (30.9.). Vorteil: Stufenlogik sofort erkennbar, Wiedererkennung im Profil. Risiko: Die sichtbare Rangfolge kann Antworten nach oben ziehen (soziale Erwünschtheit). Im Pilot bzw. beim lauten Denken beobachten; Ausblenden wäre ein kleiner Eingriff. |
| 14 | **Löschrecht der Lehrpersonen:** Genügt der Weg über die Hilfe? | Umgesetzt (30.9.): Knopf aus der Auswertung entfernt, Funktion in der Hilfe. Beim Gespräch mit dem Datenschutz mitnehmen, ob dieser Weg für das Löschrecht ausreicht und ob er in der Datenschutzerklärung genannt sein muss. |
| – | ~~Mindestgruppe 5 beibehalten?~~ | Entschieden 30.9.: entfällt vollständig (Rückmeldung Datenschutz). |
| – | ~~Offline-Version behalten?~~ | Entschieden 29.9.: bleibt, aber nur für die persönliche Selbsteinschätzung. |
| – | ~~Schulhäuser durch das AVS vorgeben?~~ | Entschieden 30.9.: nein, das AVS erfasst nur die Schulträger. |
| – | ~~Obergrenze für eigene Fragen?~~ | Entschieden 4.10.: keine; Rektorate legen den Umfang selbst fest. |
| – | ~~Darf die Schulleitung bei Erhebungen des Rektorats die Anzahl Lehrpersonen ihres Schulhauses eintragen?~~ | Entschieden 4.10.: ja, bleibt so (die Schulleitung kennt die Zahl). |

## 2 Inhalt

- [x] **Kurzfassung und Einleitungen** in den Fragebogen übernommen (30.9.)
- [ ] **Kurzfassung gegenlesen** im Team (Excel, Kapitelreiter Spalte E), danach neu einlesen
- [ ] **Redaktionsleitfaden Stufenlogik** festhalten (Kriterium pro Stufe; steht im Blatt «Info» der Excel)
- [ ] **KI-Aussagen** innerhalb der bestehenden Bereiche ergänzen, gleich in der gekürzten Form
- [ ] **Lautes Denken** mit 3–5 Lehrpersonen und Messung der Ausfülldauer im Pilot
- [ ] **fobizz-Zuordnung** (Excel, Blatt «Weiterbildung») im Team validieren
- [ ] **fobizz-Themenbereiche verlinken** – erst für die Endversion, im Prototyp bewusst ohne Links
- [ ] **Kontextfragen** prüfen: Kategorien für Funktion und Berufserfahrung. Achtung: Der Server akzeptiert nur die vorgegebenen Werte; neue Kategorien müssen im Code ergänzt werden.
- [ ] **Texte gegenlesen:** Hilfe/FAQ, Erste Schritte, Mailvorlagen (an die Lehrpersonen, an die Schulleitung, Einladung Zugang, Passwort-Link), Startseite. Die Datenschutztexte sind am 30.9. angepasst worden, weil die Mindestgruppe entfällt. Einladungs-Mail und Hilfe zu Einladungen sind am 5.10. neu formuliert worden.
- [ ] **Handout:** Überschrift «In vier Schritten zur Erhebung», es folgen aber nur zwei nummerierte Schritte (bestand schon vor dem 5.10.). Überschrift oder Gliederung anpassen.
- [x] **Einleitung «Erhebungen» für Schulleitungen** zugeschnitten (4.10.): ein Satz plus «Das können Sie hier tun» (Link, Rücklauf, was das Rektorat festlegt, eigene Erhebung). Ohne Erhebung ist das Formular zu, mit Hinweis, zuerst beim Rektorat nachzufragen (Vorgabe AVS nur einmal pro Schulhaus).

## 3 Technik vor einem Pilotbetrieb

- [x] `SESSION_SECRET` und Datenbankverbindung (TLS) nach dem Deployment geprüft: funktionieren (30.9.).
- [x] `TESTMODUS` und `MIN_GROUP_SIZE` entfallen (30.9.). In Vercel können beide Variablen gelöscht werden; sie werden nicht mehr gelesen.
- [ ] Für den Echtbetrieb neue Secrets (`SESSION_SECRET`, `CODE_PEPPER`) und ein neues Admin-Passwort. `CODE_PEPPER` danach nie mehr ändern.
- [x] Rate Limits für Anmeldung, Codes, Einladungs- und Erhebungslinks, mit Warnung bei mehr Teilnahmen als erwartet (29.9.)
- [x] Automatisierte Tests im Repository (`npm test`, 150 Prüfungen) (29./30.9., 4./5.10.)
- [x] Protokoll (Reiter «Protokoll» im Admin) (29.9.)
- [x] **Mailversand vom Server:** verworfen (5.10.), bleibt unkonfiguriert
- [x] **Einladungen ohne Mailserver** (umgesetzt 5.10., Ergebnis siehe «Stand in Kürze»). Konzept zur Nachvollziehbarkeit:
  - **Grundsatz:** Einladungslink (persönlicher Zugang, einmalig, 30 Tage) und Teilnahmelink (für die Lehrpersonen, zum Weiterleiten) bleiben in getrennten Mails. Grund: Die Erhebungs-Mail wird weitergeleitet; ein mitgeschickter Einladungslink könnte von einer Lehrperson eingelöst werden, die damit den Schulleitungszugang übernimmt.
  - **Ende des Assistenten:** Block «Einladungen verschicken» mit einer Zeile pro Schulleitung. Grund: Der Klartext-Link existiert nur bei der Erzeugung (danach nur als Hash), und dort richtet das Rektorat ohnehin gerade ein.
  - **Schulen und Zugänge:** «Erneut senden» = neuer Link (der alte wird ungültig), danach im E-Mail-Programm öffnen.
  - **Erhebungs-Mail an die Schulleitung:** bei «eingeladen, noch kein Zugang» ein Satz mit Verweis auf die separate Einladung.
  - **Betreffzeilen** klar unterschieden («Ihr persönlicher Zugang …» vs. «Erhebung … eröffnet»).
- [ ] **Datensicherung einrichten** (Konzept 5.10., Entscheide siehe Nr. 17). Zu sichern ist nur die Datenbank plus die Schlüssel; Code liegt auf GitHub, Vercel lässt sich neu deployen. Geplante Umsetzung:
  - [ ] **Täglicher Dump:** GitHub-Actions-Workflow mit `pg_dump` gegen Neon, vor dem Hochladen verschlüsselt (z. B. `age`, öffentlicher Schlüssel im Workflow, privater Schlüssel offline beim AVS). Ablage im Speicher gemäss Entscheid 17, nicht als GitHub-Artefakt oder im Repository.
  - [ ] **Aufbewahrungsregel** automatisch (Vorschlag 7 täglich / 4 wöchentlich / 3 monatlich), ältere Stände werden gelöscht.
  - [ ] **Schlüssel und Konfiguration sichern:** alle Umgebungsvariablen aus Vercel (v. a. `CODE_PEPPER`, `SESSION_SECRET`, Admin-Zugang; nicht nötig: `DATABASE_URL`) im Passwortmanager bzw. beim AFI, mind. zwei berechtigte Personen. Ohne `CODE_PEPPER` ist ein Backup für die persönlichen Codes wertlos: Lehrpersonen könnten ihre Resultate nicht mehr abrufen.
  - [ ] **Wiederherstellung testen:** einmal nach dem Einrichten, danach halbjährlich Dump in leere Test-Datenbank einspielen und eine Auswertung öffnen. Anleitung ins README.
  - [ ] **Datenschutzerklärung** ergänzen: Backups und Dauer, bis gelöschte Daten auch aus Backups und dem Neon-History-Window verschwunden sind.
  - Hinweis: Beim Umzug zum AFI (Entscheid 1) geht die Sicherung idealerweise in dessen Betriebskonzept über; der Workflow ist dann ein Übergang.
- [ ] **AVS-Konto:** Passwort-Wiederherstellung und mehrere Admin-Konten
- [ ] **Schemaänderungen:** Migrationswerkzeug statt automatischer Anpassung beim Start
- [ ] **Screenreader-Test**. Die automatische Prüfung (axe, WCAG 2.1 AA) ist ohne Befund.
- [ ] **Datenschutzerklärung** speziell für dieses Angebot. Heute führt der Link zur allgemeinen Seite von sz.ch. Neu zu erwähnen: Auswertungen ab der ersten Teilnahme, Weg zum Löschen über die Hilfe.
- [ ] Optional: in der Auswertung sichtbar machen, wie oft Personen fast überall dieselbe Stufe wählen (ohne Einzelpersonen zu zeigen)
- [ ] Optional: Auswertung eigener Fragen einklappbar machen, falls Schulen sehr viele Fragen erfassen
- [ ] Optional: AVS-Bereich (`admin.js`) bei Schulhäusern ebenfalls nur die Zyklen der Trägerstufe anbieten. Der Server lehnt andere bereits ab (4.10.), die Oberfläche zeigt aber noch alle drei.
- [ ] Bekannt und akzeptiert: Ein verlorener Code lässt sich nicht wiederherstellen. Wer neu beginnt, wird doppelt gezählt.
- [ ] Hinweis: Teilnahmen vor dem 30.9. wurden mit den Originaltexten ausgefüllt (Version SZ-2026.0). Für Testdaten unerheblich; vor dem Pilot die Testdatenbank leeren.

## 4 Offline-Version

- [x] Auf persönliche Selbsteinschätzung reduziert (29.9.). Hilfe und README nachgeführt.
- [x] Neues Frageformat und farbiger Druck übernommen (30.9.)

## 5 Als Nächstes testen (Testinstanz)

1. Im Admin unter «Vorgabe AVS» prüfen, dass die Erhebung «Erhebung ICT-Kompetenzen Lehrpersonen Schwyz» heisst (wird beim Deployment automatisch umbenannt) und die Spalten «Schulträger dabei» und «mit Teilnahmen» stimmen.
2. Unter «Liste importieren» 2–3 Test-Träger einfügen (ohne Schulhäuser) und die Einladung annehmen.
3. Als Rektorat den «Ersten Schritten» folgen: Schulhäuser erfassen, Schulleitungen im Assistenten einladen (eigene Adresse verwenden), die vorgegebene Erhebung eröffnen (mit Zieldatum). Am Schluss pro Schulleitung «Im E-Mail-Programm öffnen»: Kommen Empfänger, Betreff «Ihr persönlicher Zugang …» und Link im eigenen Mailprogramm richtig an (Outlook, Apple Mail, Handy)? Link einlösen. Die Teilnahmelinks stehen danach in der Erhebungskarte.
3a. Unter «Schulen und Zugänge» bei einer offenen Einladung «Erneut senden»: alter Link ungültig, neuer im E-Mail-Programm. In der Erhebungskarte «E-Mail an die Schulleitung» für ein Schulhaus mit offener Einladung öffnen: Satz zur separaten Einladung, kein Einladungslink.
4. Erhebungskarte ansehen (Computer und Handy): Übersicht der Schulhäuser, «Link kopieren», Menü «E-Mail oder QR-Code», Rücklauf eintragen, eigene Fragen vor dem Verteilen.
5. «Schulen und Zugänge» ansehen (Computer und Handy): Schulleitungen beim Schulhaus (Passwort-Link, Löschen, Einladung), «Rektorat und Verwaltung», Zyklen nur passend zur Stufe des Trägers.
6. Als Lehrpersonen über die Links teilnehmen (Gemeinde: Zyklus wählen; Bezirk: Zyklus 3 fest). Neues Frageformat am Computer und am Handy ansehen, Profil drucken (Farben sollten ohne Zutun erscheinen).
7. Die Auswertungen als Rektorat, Schulleitung und AVS (kantonal) vergleichen. Schulen sehen sie ab der ersten Teilnahme, das AVS erst ab Teilnahmen aus drei Schulträgern.
7a. «Eigene, zusätzliche Erhebung» prüfen: ausgegraut, solange die Vorgabe läuft; nach dem Schliessen der Vorgabe für dieses Schulhaus wählbar.
8. Reiter «Protokoll» im Admin ansehen; bei einem Link die erwartete Anzahl tiefer setzen und die Warnung prüfen.
9. Konto aus dem ersten Prototyp prüfen: Zeigt es oben «Schulleitung · Musterschule», ist es kein Rektoratskonto. Für Tests als Rektorat im Admin beim Schulträger eine Einladung ohne Schulhaus erstellen.

## 6 Kommunikation

- [ ] Gespräch mit der externen Fachperson anhand des Briefings (Fassung 3, Nachtrag Sicherheit, Offline, Schulleitungs- und Rektoratsseiten, Frageformat, Wegfall der Mindestgruppe und der Obergrenze für eigene Fragen, Einladungen ohne Mailserver)
- [ ] Antwort an den Teamkollegen auf die Mail «lokales HTML oder gehosteter Webdienst»: Vieles ist umgesetzt. Offen sind Hosting beim AFI, Datenschutz und Freitext.
- [ ] Rückmeldung des Teams zur Kurzfassung der Itemtexte einholen (jetzt direkt im Fragebogen ansehbar)
- [ ] **Datensicherung** beim AFI-Gespräch (Entscheid 1/2) und beim Datenschutz (Entscheid 3/5) mit aufnehmen (siehe Entscheid 17)

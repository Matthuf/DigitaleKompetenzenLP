# Digitale Kompetenzen von Lehrpersonen – Kanton Schwyz

Prototyp der Selbsteinschätzung digitaler Kompetenzen für Lehrpersonen (Umsetzung Kapitel 4.4 der Strategie «Digitaler Wandel im Bildungsraum im Kanton Schwyz»). Grundlage: DigCompEdu, Itemtexte vorläufig aus «DigCompEdu Bavaria» (ALP Dillingen); Anpassung an den Kanton Schwyz in Arbeit.

Zwei Versionen aus derselben Quelle:

| Version | Für wen | Daten |
|---|---|---|
| **Offline** (`dist/DigKomp_SZ_Selbsteinschaetzung.html`) | Einzelne Lehrpersonen, ohne Internet | bleiben im Browser, Export als Datei |
| **Server** (dieses Repository auf Vercel) | Schulen | Postgres-Datenbank, getrennt pro Schule |

## Rollen der Serverversion

- **AVS (Admin)**, `/admin`: erfasst Schulen und Zugänge für Schulleitungen. Sieht nur Anzahlen, keine Antworten.
- **Schulleitung**, `/leitung`: eröffnet Erhebungen (z. B. «Herbst 2026»), gibt den Link ans Kollegium weiter und sieht die Auswertung **nur der eigenen Schule** und **erst ab 5 abgeschlossenen Teilnahmen**. Keine Einzelprofile. Vergleich zwischen Erhebungen und Filter nach Schulstufe (ebenfalls nur ab 5).
- **Schulblock**: Pro Erhebung kann die Schulleitung bis zu 15 eigene Fragen ergänzen und dabei vier Formen mischen: Zustimmungsskala (4 Stufen), eigene Stufenaussagen (3–6), Auswahl (einfach oder mehrfach) und Freitext. Die Fragen erscheinen als zusätzlicher Schritt nach den sechs Bereichen, fliessen nicht ins Kompetenzprofil ein und werden ebenfalls erst ab 5 Teilnahmen ausgewertet (Freitexte in zufälliger Reihenfolge). Nach der ersten abgeschlossenen Teilnahme ist der Block gesperrt. Er lässt sich in eine neue Erhebung übernehmen; die Fragen behalten dabei ihre Kennung.
- **Lehrperson**, `/t/<link>`: nimmt ohne Namen und E-Mail teil und erhält einen **persönlichen Code** (z. B. `K7QM-4RTX-9P2C`). Damit: fortsetzen, Profil wieder ansehen (`/mein-profil`), bei der nächsten Erhebung erneut ausfüllen mit Vergleich, alle eigenen Daten löschen.

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
```

Items ändern: Excel bearbeiten → `npm run build:items` → committen. Die erzeugten Dateien sind eingecheckt, Vercel braucht keinen Build-Schritt.

## Lokal starten

```
npm install
ADMIN_USERNAME=avs ADMIN_PASSWORD=ein-langes-passwort npm run dev
```

Ohne `DATABASE_URL` läuft eine Datenbank im Arbeitsspeicher (PGlite); nach einem Neustart ist sie leer.

## Auf Vercel veröffentlichen

1. Auf vercel.com **Add New → Project**, das GitHub-Repository importieren. Framework Preset: **Other**. Build- und Output-Einstellungen leer lassen.
2. Im Projekt unter **Storage → Create Database → Neon (Postgres)** eine Datenbank anlegen, Region **Frankfurt (eu-central-1)**, und mit dem Projekt verbinden. Das setzt `DATABASE_URL` automatisch.
3. Unter **Settings → Environment Variables** eintragen:
   - `SESSION_SECRET`: zufällige Zeichenfolge, mindestens 32 Zeichen
   - `CODE_PEPPER`: zufällige Zeichenfolge, mindestens 32 Zeichen. **Nie mehr ändern**, sonst werden alle persönlichen Codes ungültig.
   - `ADMIN_USERNAME` und `ADMIN_PASSWORD`: erstes AVS-Konto (wird beim ersten Aufruf angelegt, falls noch kein Admin existiert)
4. **Deployments → Redeploy**. Danach `/admin` öffnen, anmelden, Schule und Schulleitungszugang erfassen.

Die Serverfunktion läuft in Frankfurt (`regions: fra1` in `vercel.json`).

## Datenschutz

- Keine Namen, keine E-Mail-Adressen von Lehrpersonen. Der persönliche Code wird nur als HMAC-Hash gespeichert.
- Schulleitungen erhalten nur zusammengefasste Werte ab 5 abgeschlossenen Teilnahmen; die Serverschnittstelle liefert keine Einzelantworten an Schulleitungen oder AVS.
- Lehrpersonen können alle eigenen Daten löschen.
- Passwörter mit scrypt gehasht, Sitzungen als signierte HttpOnly-Cookies.
- **Hosting-Vorbehalt:** Vercel und Neon sind US-Anbieter mit Rechenzentrum in Frankfurt. Für den Echtbetrieb mit Personendaten ist die Beurteilung durch den kantonalen Datenschutz nötig; allenfalls Umzug zu einem Schweizer Anbieter. Die Anwendung braucht dafür nur Node.js und Postgres.

## Offene Punkte

- Itemtexte an Schwyzer Begriffe anpassen, KI-Aussagen in die Bereiche integrieren (`ki`-Markierung pro Teilbereich vorhanden).
- Lizenz bzw. Einverständnis der ALP Dillingen für die Verwendung der Itemtexte klären.
- Weiterbildungsempfehlungen (z. B. fobizz-Themen) pro Teilbereich ergänzen.
- Schutz gegen Durchprobieren von Anmeldungen (Rate-Limit) vor dem Echtbetrieb.

"""Wandelt die Item-Masterdatei (Excel) in items.json um. Einzige Datenquelle fuer HTML- und Backend-Version."""
import openpyxl, json, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'data/items_master.xlsx'
wb = openpyxl.load_workbook(src)
LEVELS = [("I","Einsteigen"),("II","Entdecken"),("III","Anwenden"),("IV","Integrieren"),("V","Entwickeln"),("VI","Weitergeben")]
DESC = {
 "1": "Digitale Medien für Kommunikation, Zusammenarbeit, Reflexion und die eigene Weiterbildung nutzen.",
 "2": "Digitale Materialien finden, erstellen, anpassen, ordnen und rechtlich korrekt teilen.",
 "3": "Digitale Medien im Unterricht einsetzen, Lernprozesse begleiten, kooperatives und selbstgesteuertes Lernen fördern.",
 "4": "Mit digitalen Mitteln Lernstände erheben, auswerten und Rückmeldungen geben.",
 "5": "Mit digitalen Medien Teilhabe ermöglichen, differenzieren und Lernende aktivieren.",
 "6": "Lernende befähigen, digitale Medien kompetent, kreativ und reflektiert zu nutzen.",
}
SHORT = {"1":"Berufsbezogenes Handeln","2":"Digitale Ressourcen","3":"Lehren und Lernen","4":"Lerndiagnose und Feedback","5":"Schülerorientierung","6":"Medienkompetenz der Lernenden"}
areas = []
for ws in wb.worksheets:
    m = re.match(r'^(\d)\. ', ws.title)
    if not m: continue
    aid = m.group(1)
    area = {"id": aid, "title": ws['A1'].value.split('. ',1)[1].strip(), "short": SHORT[aid], "description": DESC[aid], "subareas": []}
    cur = None
    for row in ws.iter_rows(min_row=4, values_only=True):
        a, b, c, d = (row + (None,)*4)[:4]
        if a and b is None and re.match(r'^\d\.\d ', str(a)):
            sid, title = str(a).split(' ', 1)
            cur = {"id": sid, "title": title.strip(), "ki": False, "levels": []}
            area["subareas"].append(cur)
        elif a and b and d:
            text = str(d).strip().replace('ß', 'ss')
            cur["levels"].append({"level": len(cur["levels"])+1, "roman": b, "label": c, "itemId": a, "text": text})
    for s in area["subareas"]:
        assert len(s["levels"]) == 6, s["id"]
    areas.append(area)
out = {"instrument": "Digitale Kompetenzen Lehrpersonen Kanton Schwyz", "version": "SZ-2026.0-entwurf",
       "source": "DigCompEdu Bavaria, ALP Dillingen (Itemtexte ausgelesen am 28.09.2026); Anpassung Kanton Schwyz in Arbeit",
       "levels": [{"level": i+1, "roman": r, "label": l} for i, (r, l) in enumerate(LEVELS)],
       "areas": areas}
json.dump(out, open('data/items.json', 'w'), ensure_ascii=False, indent=1)
print(len(areas), sum(len(a['subareas']) for a in areas))

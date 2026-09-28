"""Baut beide Versionen aus einer Quelle:
- dist/ und public/offline/: Offline-HTML (Items, Kernlogik und Logo eingebettet)
- public/assets/ und lib/: Dateien für die Serverversion
Vorher bei geänderter Excel: python3 data/excel_to_json.py
"""
import base64, json, pathlib, shutil
root = pathlib.Path(__file__).parent
core = (root / 'src/core.js').read_text(encoding='utf-8')
items = json.loads((root / 'data/items.json').read_text(encoding='utf-8'))
logo_png = root / 'src/logo-kanton-schwyz.png'

# Offline-Version
tpl = (root / 'src/template.html').read_text(encoding='utf-8')
logo = 'data:image/png;base64,' + base64.b64encode(logo_png.read_bytes()).decode()
charts = (root / 'public/assets/charts.js').read_text(encoding='utf-8')
out = (tpl.replace('__CORE_JS__', core).replace('__CHARTS_JS__', charts).replace('__ITEMS_JSON__', json.dumps(items, ensure_ascii=False)).replace('__LOGO__', logo))
for dst in [root / 'dist/DigKomp_SZ_Selbsteinschaetzung.html', root / 'public/offline/DigKomp_SZ_Selbsteinschaetzung.html']:
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(out, encoding='utf-8')

# Serverversion
(root / 'public/assets').mkdir(parents=True, exist_ok=True)
(root / 'public/assets/core.js').write_text(core, encoding='utf-8')
(root / 'public/assets/items.js').write_text('window.ITEMS = ' + json.dumps(items, ensure_ascii=False) + ';\n', encoding='utf-8')
shutil.copy(logo_png, root / 'public/assets/logo-kanton-schwyz.png')
(root / 'lib/core.cjs').write_text(core, encoding='utf-8')
(root / 'lib/items.json').write_text(json.dumps(items, ensure_ascii=False), encoding='utf-8')
print('Build ok:', items['version'])

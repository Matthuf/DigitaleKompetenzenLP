"""Erzeugt aus docs/handout-rektorate.html das PDF docs/Handout_Rektorate_DigKomp_SZ.pdf.

Aufruf: python3 docs/build_handout.py   (braucht Playwright/Chromium)
Das Logo wird beim Erzeugen eingebettet, damit die HTML-Datei ohne Bilddatei auskommt.
"""
import asyncio, base64, datetime, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/handout-rektorate.html'
OUT = ROOT / 'docs/Handout_Rektorate_DigKomp_SZ.pdf'
PUB = ROOT / 'public/kurzanleitung-rektorate.pdf'  # öffentlich, verlinkt in der Einladung an Rektorate
LOGO = ROOT / 'src/logo-kanton-schwyz.png'
MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']


def html() -> str:
    logo = 'data:image/png;base64,' + base64.b64encode(LOGO.read_bytes()).decode()
    heute = datetime.date.today()
    stand = f'Stand {heute.day}. {MONATE[heute.month - 1]} {heute.year}'
    return SRC.read_text(encoding='utf-8').replace('LOGO', logo).replace('STAND', stand)


async def main() -> None:
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        page = await browser.new_page()
        await page.set_content(html(), wait_until='load')
        await page.pdf(path=str(OUT), format='A4', print_background=True,
                       margin={'top': '14mm', 'right': '15mm', 'bottom': '12mm', 'left': '15mm'})
        await browser.close()
    import shutil; shutil.copyfile(OUT, PUB)
    print('PDF:', OUT, '+', PUB)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))

#!/usr/bin/env python3
"""Bundle the toolkit into dist/ for hosting:
  dist/index.html       — landing page (from home/)
  dist/breakdown/       — crafting calculator (inlined) + icons/ folder
  dist/provisions/      — food buff picker (inlined), icons shared from
                          ../breakdown/icons/
Host dist/ anywhere static."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DIST = ROOT / "dist"


def main():
    html = (SITE / "index.html").read_text()
    css = (SITE / "style.css").read_text()
    js = (SITE / "app.js").read_text()
    data = (SITE / "data" / "recipes.json").read_text()

    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{css}\n</style>")
    html = html.replace(
        '<script src="app.js"></script>',
        f'<script type="application/json" id="recipes-data">{data}</script>\n'
        f"<script>\n{js}\n</script>")

    if DIST.exists():
        shutil.rmtree(DIST)
    tool = DIST / "breakdown"
    tool.mkdir(parents=True)
    (tool / "index.html").write_text(html)
    shutil.copytree(SITE / "icons", tool / "icons")
    shutil.copy(ROOT / "home" / "index.html", DIST / "index.html")
    # app icons + manifest: tool page gets everything, landing shares the icons
    for f in ["favicon-32.png", "apple-touch-icon.png", "app-icon-192.png",
              "app-icon-512.png", "manifest.webmanifest"]:
        shutil.copy(SITE / f, tool / f)
        if f != "manifest.webmanifest":
            shutil.copy(SITE / f, DIST / f)

    # --- provisions ---
    phtml = (SITE / "provisions.html").read_text()
    pjs = (SITE / "provisions.js").read_text()
    pdata = (SITE / "data" / "provisions.json").read_text()
    phtml = phtml.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{css}\n</style>")
    phtml = phtml.replace(
        '<script src="provisions.js"></script>',
        '<script>window.ICON_BASE="../breakdown/icons/";'
        'window.BREAKDOWN_BASE="../breakdown/";</script>\n'
        f'<script type="application/json" id="provisions-data">{pdata}</script>\n'
        f"<script>\n{pjs}\n</script>")
    phtml = phtml.replace('href="index.html"', 'href="../breakdown/"')
    prov = DIST / "provisions"
    prov.mkdir()
    (prov / "index.html").write_text(phtml)
    for f in ["prov-favicon-32.png", "prov-apple-touch-icon.png",
              "prov-icon-192.png", "prov-icon-512.png",
              "manifest-provisions.webmanifest"]:
        shutil.copy(SITE / f, prov / f)
    size = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"dist/ ready — {size/1e6:.1f} MB total, breakdown/index.html "
          f"{(tool/'index.html').stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()

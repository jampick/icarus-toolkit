#!/usr/bin/env python3
"""Bundle the toolkit into dist/ for hosting:
  dist/index.html       - landing page (from home/)
  dist/breakdown/       - crafting calculator (inlined) + icons/ folder
  dist/provisions/      - food buff picker (inlined), icons shared from
                          ../breakdown/icons/
Host dist/ anywhere static."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DIST = ROOT / "dist"


def main():
    html = (SITE / "index.html").read_text(encoding="utf-8")
    css = (SITE / "style.css").read_text(encoding="utf-8")
    js = (SITE / "app.js").read_text(encoding="utf-8")
    data = (SITE / "data" / "recipes.json").read_text(encoding="utf-8")

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
    (tool / "index.html").write_text(html, encoding="utf-8")
    shutil.copytree(SITE / "icons", tool / "icons")
    shutil.copy(ROOT / "home" / "index.html", DIST / "index.html")
    # app icons + manifest: tool page gets everything, landing shares the icons
    for f in ["favicon-32.png", "apple-touch-icon.png", "app-icon-192.png",
              "app-icon-512.png", "manifest.webmanifest"]:
        shutil.copy(SITE / f, tool / f)
        if f != "manifest.webmanifest":
            shutil.copy(SITE / f, DIST / f)

    # --- provisions ---
    phtml = (SITE / "provisions.html").read_text(encoding="utf-8")
    pjs = (SITE / "provisions.js").read_text(encoding="utf-8")
    pdata = (SITE / "data" / "provisions.json").read_text(encoding="utf-8")
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
    phtml = phtml.replace('href="stables.html"', 'href="../stables/"')
    phtml = phtml.replace('href="armory.html"', 'href="../armory/"')
    phtml = phtml.replace('href="atlas.html"', 'href="../atlas/"')
    prov = DIST / "provisions"
    prov.mkdir()
    (prov / "index.html").write_text(phtml, encoding="utf-8")
    for f in ["prov-favicon-32.png", "prov-apple-touch-icon.png",
              "prov-icon-192.png", "prov-icon-512.png",
              "manifest-provisions.webmanifest"]:
        shutil.copy(SITE / f, prov / f)

    # --- stables ---
    shtml = (SITE / "stables.html").read_text(encoding="utf-8")
    sjs = (SITE / "stables.js").read_text(encoding="utf-8")
    sdata = (SITE / "data" / "stables.json").read_text(encoding="utf-8")
    shtml = shtml.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{css}\n</style>")
    shtml = shtml.replace(
        '<script src="stables.js"></script>',
        '<script>window.ICON_BASE="../breakdown/icons/";'
        'window.BREAKDOWN_BASE="../breakdown/";</script>\n'
        f'<script type="application/json" id="stables-data">{sdata}</script>\n'
        f"<script>\n{sjs}\n</script>")
    shtml = shtml.replace('href="index.html"', 'href="../breakdown/"')
    shtml = shtml.replace('href="provisions.html"', 'href="../provisions/"')
    shtml = shtml.replace('href="armory.html"', 'href="../armory/"')
    shtml = shtml.replace('href="atlas.html"', 'href="../atlas/"')
    stab = DIST / "stables"
    stab.mkdir()
    (stab / "index.html").write_text(shtml, encoding="utf-8")
    for f in ["stables-favicon-32.png", "stables-apple-touch-icon.png",
              "stables-icon-192.png", "stables-icon-512.png",
              "manifest-stables.webmanifest"]:
        shutil.copy(SITE / f, stab / f)

    # --- atlas ---
    ahtml = (SITE / "atlas.html").read_text(encoding="utf-8")
    ajs = (SITE / "atlas.js").read_text(encoding="utf-8")
    adata = (SITE / "data" / "atlas.json").read_text(encoding="utf-8")
    ahtml = ahtml.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{css}\n</style>")
    ahtml = ahtml.replace(
        '<script src="atlas.js"></script>',
        f'<script type="application/json" id="atlas-data">{adata}</script>\n'
        f"<script>\n{ajs}\n</script>")
    ahtml = ahtml.replace('href="index.html"', 'href="../breakdown/"')
    ahtml = ahtml.replace('href="provisions.html"', 'href="../provisions/"')
    ahtml = ahtml.replace('href="stables.html"', 'href="../stables/"')
    ahtml = ahtml.replace('href="armory.html"', 'href="../armory/"')
    atlas = DIST / "atlas"
    atlas.mkdir()
    (atlas / "index.html").write_text(ahtml, encoding="utf-8")
    shutil.copy(SITE / "favicon-32.png", atlas / "favicon-32.png")
    shutil.copytree(SITE / "maps", atlas / "maps")

    # --- armory ---
    mhtml = (SITE / "armory.html").read_text(encoding="utf-8")
    mjs = (SITE / "armory.js").read_text(encoding="utf-8")
    mdata = (SITE / "data" / "armory.json").read_text(encoding="utf-8")
    mhtml = mhtml.replace(
        '<link rel="stylesheet" href="style.css">',
        f"<style>\n{css}\n</style>")
    mhtml = mhtml.replace(
        '<script src="armory.js"></script>',
        '<script>window.ICON_BASE="../breakdown/icons/";'
        'window.BREAKDOWN_BASE="../breakdown/";</script>\n'
        f'<script type="application/json" id="armory-data">{mdata}</script>\n'
        f"<script>\n{mjs}\n</script>")
    mhtml = mhtml.replace('href="index.html"', 'href="../breakdown/"')
    mhtml = mhtml.replace('href="provisions.html"', 'href="../provisions/"')
    mhtml = mhtml.replace('href="stables.html"', 'href="../stables/"')
    mhtml = mhtml.replace('href="atlas.html"', 'href="../atlas/"')
    armory = DIST / "armory"
    armory.mkdir()
    (armory / "index.html").write_text(mhtml, encoding="utf-8")
    for f in ["armory-favicon-32.png", "armory-apple-touch-icon.png",
              "armory-icon-192.png", "armory-icon-512.png",
              "manifest-armory.webmanifest"]:
        shutil.copy(SITE / f, armory / f)
    size = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"dist/ ready: {size/1e6:.1f} MB total, breakdown/index.html "
          f"{(tool/'index.html').stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()

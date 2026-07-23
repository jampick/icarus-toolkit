#!/usr/bin/env python3
"""Bundle the toolkit into dist/ for hosting:
  dist/index.html       — landing page (from home/)
  dist/breakdown/       — the crafting calculator, index.html with CSS/JS/data
                          inlined + its icons/ folder
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
    size = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"dist/ ready — {size/1e6:.1f} MB total, breakdown/index.html "
          f"{(tool/'index.html').stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()

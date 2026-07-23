#!/usr/bin/env python3
"""Bundle the site into dist/ for hosting: index.html with CSS, JS and recipe
data inlined (fully self-contained apart from the icons/ folder alongside it)."""
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

    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html)
    if (DIST / "icons").exists():
        shutil.rmtree(DIST / "icons")
    shutil.copytree(SITE / "icons", DIST / "icons")
    size = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"dist/ ready — {size/1e6:.1f} MB total, index.html "
          f"{(DIST/'index.html').stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()

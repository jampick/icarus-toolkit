# Icarus Toolkit

Fan-made tools for [ICARUS](https://icarusgame.com), hosted at
**https://jampick.github.io/icarus-toolkit/**. Data comes **directly from the
game's `Data/data.pak`** — no wiki scraping.

## Tools

### ⛏ Breakdown (`/breakdown/`)

Exploded crafting calculator — search any craftable item and see it recursively
broken down into every raw material you need to gather, with per-node control
over whether a component is crafted or gathered, alternate-recipe switching,
live raw-material totals, bench list, and pan/zoom.

Deploys automatically to GitHub Pages on push to `main`
(`.github/workflows/deploy.yml` runs `scripts/make_dist.py`).

## Layout

- `scripts/extract_pak.py` — pure-Python UE4 pak (v11/Zlib) extractor. Pulls the
  `D_*.json` data tables out of the game's `Data/data.pak` (~2 MB file, found in
  the game or dedicated-server install under `Icarus/Content/Data/`).
- `scripts/build_data.py` — compiles the extracted tables into
  `site/data/recipes.json` (items + recipes + output index, raw/gatherable
  flags, conversion-recipe detection, bench display names).
- `scripts/make_dist.py` — bundles everything into `dist/`: a single
  `index.html` (CSS + JS + data inlined) plus the `icons/` folder. Host `dist/`
  anywhere static (GitHub Pages, nginx, S3…).
- `site/` — the dev version (separate files; serve with
  `python3 -m http.server` from this folder).
- `data/game/` — extracted game JSON tables (checked in for reproducibility).

## Refreshing after a game update

```bash
# 1. Get the new Data/data.pak from the game or dedicated server install
for f in D_ProcessorRecipes D_ItemTemplate D_ItemsStatic D_Itemable D_RecipeSets; do
  python3 scripts/extract_pak.py /path/to/data.pak --extract "$f.json" -o data/game
done
# 2. Recompile
python3 scripts/build_data.py
# 3. Rebundle for hosting
python3 scripts/make_dist.py
```

## Icons

Item icons (96 px PNGs in `site/icons/`) are game assets © RocketWerkz, used
here as fan content the same way the community wiki and other calculators do.
Icon set sourced from the community extraction in
[N30Z/icarus_calculator](https://github.com/N30Z/icarus_calculator); items
missing an icon fall back to a styled monogram.

## How the breakdown works

- A recipe tree is built from the item's recipe, recursing into each input.
- Crafts are ceiled per node (`ceil(needed / recipe output count)`), so counts
  are what you actually queue at a bench.
- Items tagged as ores / creature loot / world gatherables (Wood, Stone, Fiber,
  Oxite…) default to **GATHER** even when a conversion recipe exists (e.g.
  Frozen Wood → Wood); every node can be toggled between craft and gather, and
  multi-recipe items can cycle recipes (↻).
- The sidebar aggregates all current leaf nodes into gather totals plus total
  carry weight, and lists every bench the plan requires.

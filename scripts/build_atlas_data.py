#!/usr/bin/env python3
"""Compile map marker data for the Atlas tool.

Input:  data/atlas-raw/Terrain_*.json (from tools/atlas-export, run per game
        update), data/game/D_ExoticSpawn.json
Output: site/data/atlas.json

World-to-grid: the in-game map overlays a 16x16 lettered grid (columns A-P
west to east, rows 1-16 north to south) on the terrain bounds. All four
terrains are 8x8 landscape tiles (tile stride 100800) centered on the world
origin, so the bounds are a fixed +-403200 box; Styx actor extents hit that
exactly on X, confirming the layout. Orientation (which world axis is north)
is set per-map in ORIENT below and verified in-game; flip flags are the only
knobs that should ever need turning.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "atlas-raw"
GAME = ROOT / "data" / "game"
OUT = ROOT / "site" / "data" / "atlas.json"

GRID = 16                 # 16x16 lettered grid on all open-world maps
HALF_SPAN = 403200.0      # 4 landscape tiles of 100800; terrain is origin-centered

# Exotic spawn name prefix -> terrain row (grid cells come from the names).
EXOTIC_PREFIX = {"OLY": "Terrain_016", "STYX": "Terrain_017",
                 "PRO": "Terrain_019", "ELY": "Terrain_021"}

# Per-map axis orientation: (flip_x, flip_y). False means +axis reads
# east/south (column A and row 1 sit at the minimum corner). Pending the
# in-game calibration check these all start unflipped.
ORIENT = {t: (False, False) for t in EXOTIC_PREFIX.values()}

LAYERS = ["caves", "veins", "oil", "enzyme", "worms"]


def main():
    maps = {}
    for f in sorted(RAW.glob("Terrain_*.json")):
        raw = json.load(open(f, encoding="utf-8"))
        t = raw["terrain"]
        min_x = min_y = -HALF_SPAN
        max_x = max_y = HALF_SPAN
        # Raw actorBounds includes far-flung decoration (skyboxes etc.), so
        # sanity-check the fixed bounds against the markers themselves.
        outside = sum(1 for m in raw["markers"]
                      if abs(m["x"]) > HALF_SPAN or abs(m["y"]) > HALF_SPAN)
        if outside:
            print(f"WARNING {t}: {outside} markers outside the fixed "
                  f"+-{HALF_SPAN:.0f} bounds; check the 8x8-tile assumption")
        flip_x, flip_y = ORIENT[t]

        def grid_pos(x, y):
            """Fractional grid coords (0..GRID) on the displayed map."""
            cx = (x - min_x) / (max_x - min_x)
            cy = (y - min_y) / (max_y - min_y)
            if flip_x:
                cx = 1 - cx
            if flip_y:
                cy = 1 - cy
            clamp = lambda v: max(0.0, min(float(GRID), v))
            return clamp(cx * GRID), clamp(cy * GRID)

        layers = {k: [] for k in LAYERS}
        for m in raw["markers"]:
            gx, gy = grid_pos(m["x"], m["y"])
            # floor of the ROUNDED value so the stored gx/gy always agrees
            # with the cell string
            gx, gy = round(gx, 3), round(gy, 3)
            col = min(GRID - 1, int(gx))
            row = min(GRID - 1, int(gy))
            layers[m["layer"]].append({
                "cell": f"{chr(ord('A') + col)}{row + 1}",
                "gx": round(gx, 3),
                "gy": round(gy, 3),
            })
        for k in layers:
            layers[k].sort(key=lambda v: (v["cell"], v["gx"], v["gy"]))

        maps[t] = {
            "name": raw["display"],
            "grid": GRID,
            "layers": layers,
            "exotics": {},
        }

    # Exotic spawns: grid-cell names from data.pak (no world coords exist).
    exotic_rows = json.load(open(GAME / "D_ExoticSpawn.json", encoding="utf-8"))["Rows"]
    pat = re.compile(r"^([A-Z]+)_([A-P])0*(\d+)(?:_\d+)?$")
    skipped = 0
    for r in exotic_rows:
        m = pat.match(r["Name"])
        if not m or m.group(1) not in EXOTIC_PREFIX:
            skipped += 1
            continue
        t = EXOTIC_PREFIX[m.group(1)]
        if t not in maps:
            continue
        c = f"{m.group(2)}{int(m.group(3))}"
        maps[t]["exotics"][c] = maps[t]["exotics"].get(c, 0) + 1
    if skipped:
        print(f"exotic rows not matching the grid-name pattern: {skipped}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"maps": maps}, f, separators=(",", ":"))

    for t, m in maps.items():
        counts = {k: len(v) for k, v in m["layers"].items()}
        print(f"{m['name']}: {counts} exotic cells: {len(m['exotics'])}")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Test pass for the data pipeline and dist build. Stdlib only.

Runs the build scripts, then validates the generated JSON and dist/ output.
Exits non-zero with a clear message on the first failure of each phase.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

failures = []
checks = 0


def check(cond, msg):
    global checks
    checks += 1
    if cond:
        print(f"  ok: {msg}")
    else:
        print(f"  FAIL: {msg}")
        failures.append(msg)


def run_script(name):
    print(f"\n== running {name} ==")
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / name)],
                       capture_output=True, text=True)
    if r.stdout.strip():
        print("  " + r.stdout.strip().replace("\n", "\n  "))
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        print(f"FAIL: {name} exited {r.returncode}")
        sys.exit(1)
    print(f"  ok: {name} exited 0")


# ---------- 1. build scripts run ----------
run_script("build_data.py")
run_script("build_provisions_data.py")

# ---------- 2. recipes.json ----------
print("\n== recipes.json ==")
recipes_path = ROOT / "site" / "data" / "recipes.json"
data = json.loads(recipes_path.read_text(encoding="utf-8"))

check(set(data) >= {"items", "recipes", "byOutput"},
      "has items/recipes/byOutput keys")
items, recipes, by_output = data["items"], data["recipes"], data["byOutput"]
check(len(items) > 2000, f"items count {len(items)} > 2000")
check(len(recipes) > 2000, f"recipes count {len(recipes)} > 2000")
check("Solar_Panel" in by_output, "Solar_Panel is craftable (in byOutput)")
check(items.get("Wood", {}).get("raw") is True, "Wood is raw")
check(items.get("Copper_Ore", {}).get("raw") is True, "Copper_Ore is raw")
check(items.get("Aluminium_Screw", {}).get("raw") is False,
      "Aluminium_Screw is NOT raw (conversion-detection regression)")

missing = set()
for rec in recipes:
    for iid, _ in rec["inputs"]:
        if iid not in items:
            missing.add(iid)
    for oid, _ in rec["outputs"]:
        if oid not in items:
            missing.add(oid)
check(not missing,
      f"every recipe input/output id exists in items (missing: {sorted(missing)[:10] or 'none'})")

# ---------- 3. provisions.json ----------
print("\n== provisions.json ==")
prov_path = ROOT / "site" / "data" / "provisions.json"
prov = json.loads(prov_path.read_text(encoding="utf-8"))
cons, stats = prov["consumables"], prov["stats"]

check(len(cons) > 200,
      f"consumables count {len(cons)} > 200 (name-join regression)")
names = {c["name"] for c in cons}
for want in ("Pickled Carrot", "Pickled Tomato", "Fruit Pie"):
    check(want in names, f"consumable named '{want}' present")
feed = sorted(n for n in names if "Animal Feed" in n)
check(not feed, f"no 'Animal Feed' consumables (found: {feed or 'none'})")

unknown_stats = set()
for c in cons:
    for sid in c.get("buff", {}).get("stats", {}):
        if sid not in stats:
            unknown_stats.add(sid)
check(not unknown_stats,
      f"every buff stat key is in stats meta (unknown: {sorted(unknown_stats)[:10] or 'none'})")

bad_meta = sorted(sid for sid, m in stats.items()
                  if not m.get("tpl") or not m.get("max"))
check(not bad_meta,
      f"every stats meta entry has tpl and non-zero max (bad: {bad_meta[:10] or 'none'})")

# ---------- 3b. stables.json ----------
run_script("build_stables_data.py")
print("\n== stables.json ==")
stab = json.loads((ROOT / "site" / "data" / "stables.json").read_text(encoding="utf-8"))
check(set(stab) >= {"creatures", "saddleItems", "feeds", "stats"},
      "has creatures/saddleItems/feeds/stats keys")
check(len(stab["creatures"]) >= 25,
      f"creatures count {len(stab['creatures'])} >= 25")
rideable = [c for c in stab["creatures"] if c["rideable"]]
check(len(rideable) >= 10, f"rideable creatures {len(rideable)} >= 10")
cnames = {c["name"] for c in stab["creatures"]}
for want in ("Moa", "Buffalo", "Horse"):
    check(want in cnames, f"creature '{want}' present")
check(any(c["name"] == "SwampBird" and c["rideable"] for c in stab["creatures"]),
      "SwampBird rideable (underscore-normalization regression)")
cids = {c["id"] for c in stab["creatures"]}
chick_leftovers = sorted(i for i in cids if re.fullmatch(r"Chick\d+", i))
check(not chick_leftovers,
      f"no Chick digit variants remain (found: {chick_leftovers or 'none'})")
chick = next((c for c in stab["creatures"] if c["id"] == "Chick"), None)
check(chick is not None, "creature 'Chick' present after variant merge")
check(chick is not None and chick.get("variants") == 3,
      f"Chick has variants == 3 (got: {chick.get('variants') if chick else None})")
bad_saddle = sorted(sid for c in rideable for sid in c["saddles"]
                    if sid not in stab["saddleItems"])
check(not bad_saddle,
      f"every creature saddle ref resolves (bad: {bad_saddle[:6] or 'none'})")
check(len(stab["feeds"]) >= 10, f"feeds count {len(stab['feeds'])} >= 10")
bad_feed_stats = sorted(sid for f in stab["feeds"] for sid in f["stats"]
                        if sid not in stab["stats"])
check(not bad_feed_stats,
      f"every feed stat in stats meta (bad: {bad_feed_stats[:6] or 'none'})")

# ---------- 3c. atlas.json ----------
run_script("build_atlas_data.py")
print("\n== atlas.json ==")
atlas = json.loads((ROOT / "site" / "data" / "atlas.json").read_text(encoding="utf-8"))
amaps = atlas["maps"]
for want in ("Terrain_016", "Terrain_017", "Terrain_019", "Terrain_021"):
    check(want in amaps, f"atlas has {want}")
oly = amaps.get("Terrain_016", {})
check(oly.get("name") == "Olympus", "Terrain_016 is Olympus")
lay = oly.get("layers", {})
check(len(lay.get("caves", [])) >= 100,
      f"Olympus caves {len(lay.get('caves', []))} >= 100")
check(len(lay.get("veins", [])) >= 400,
      f"Olympus deep vein spawns {len(lay.get('veins', []))} >= 400")
check(len(oly.get("exotics", {})) >= 40,
      f"Olympus exotic cells {len(oly.get('exotics', {}))} >= 40")
with_info = [c for c in lay.get("caves", []) if "entrances" in c]
check(len(with_info) >= len(lay.get("caves", [])) * 0.8,
      f"Olympus caves with template contents {len(with_info)}/{len(lay.get('caves', []))} (>= 80%)")
exo_caves = [c for c in with_info if c.get("exotics")]
check(len(exo_caves) >= 1,
      f"some Olympus caves carry exotic spawns ({len(exo_caves)})")
cellpat = re.compile(r"^[A-P](1[0-6]|[1-9])$")
bad_cells = sorted({m["cell"] for mp in amaps.values()
                    for ms in mp["layers"].values() for m in ms
                    if not cellpat.fullmatch(m["cell"])} |
                   {c for mp in amaps.values() for c in mp["exotics"]
                    if not cellpat.fullmatch(c)})
check(not bad_cells,
      f"every marker/exotic cell is a valid grid ref (bad: {bad_cells[:6] or 'none'})")
bad_gxy = [m for mp in amaps.values() for ms in mp["layers"].values() for m in ms
           if not (0 <= m["gx"] <= mp["grid"] and 0 <= m["gy"] <= mp["grid"])]
check(not bad_gxy, f"every marker gx/gy inside grid (bad: {len(bad_gxy)})")

# ---------- 4. make_dist.py + dist/ ----------
run_script("make_dist.py")
print("\n== dist/ ==")
dist = ROOT / "dist"
for rel in ("index.html", "breakdown/index.html", "provisions/index.html",
            "stables/index.html", "atlas/index.html", "breakdown/icons"):
    check((dist / rel).exists(), f"dist/{rel} exists")
atlas_imgs = sorted(p.name for p in (dist / "atlas" / "maps").glob("*.jpg"))
check(len(atlas_imgs) == 4,
      f"dist/atlas/maps has 4 terrain renders (got {atlas_imgs})")

def inline_json(html, elem_id):
    m = re.search(
        r'<script type="application/json" id="%s">(.*?)</script>' % elem_id,
        html, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None

bhtml = (dist / "breakdown" / "index.html").read_text(encoding="utf-8")
check('id="recipes-data"' in bhtml, 'breakdown page has id="recipes-data"')
check(inline_json(bhtml, "recipes-data") is not None,
      "breakdown inline recipes JSON parses")

phtml = (dist / "provisions" / "index.html").read_text(encoding="utf-8")
check('id="provisions-data"' in phtml, 'provisions page has id="provisions-data"')
check(inline_json(phtml, "provisions-data") is not None,
      "provisions inline JSON parses")

shtml = (dist / "stables" / "index.html").read_text(encoding="utf-8")
check('id="stables-data"' in shtml, 'stables page has id="stables-data"')
check(inline_json(shtml, "stables-data") is not None,
      "stables inline JSON parses")

ahtml = (dist / "atlas" / "index.html").read_text(encoding="utf-8")
check('id="atlas-data"' in ahtml, 'atlas page has id="atlas-data"')
check(inline_json(ahtml, "atlas-data") is not None,
      "atlas inline JSON parses")

landing = (dist / "index.html").read_text(encoding="utf-8")
check('href="breakdown/"' in landing, 'landing links to breakdown/')
check('href="provisions/"' in landing, 'landing links to provisions/')
check('href="stables/"' in landing, 'landing links to stables/')
check('href="atlas/"' in landing, 'landing links to atlas/')

# ---------- result ----------
print(f"\n{checks} checks, {len(failures)} failures")
if failures:
    for f in failures:
        print(f"FAILED: {f}", file=sys.stderr)
    sys.exit(1)
print("test_pipeline.py PASS")

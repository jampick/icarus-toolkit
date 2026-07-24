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

# ---------- 4. make_dist.py + dist/ ----------
run_script("make_dist.py")
print("\n== dist/ ==")
dist = ROOT / "dist"
for rel in ("index.html", "breakdown/index.html", "provisions/index.html",
            "stables/index.html", "breakdown/icons"):
    check((dist / rel).exists(), f"dist/{rel} exists")

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

landing = (dist / "index.html").read_text(encoding="utf-8")
check('href="breakdown/"' in landing, 'landing links to breakdown/')
check('href="provisions/"' in landing, 'landing links to provisions/')
check('href="stables/"' in landing, 'landing links to stables/')

# ---------- result ----------
print(f"\n{checks} checks, {len(failures)} failures")
if failures:
    for f in failures:
        print(f"FAILED: {f}", file=sys.stderr)
    sys.exit(1)
print("test_pipeline.py PASS")

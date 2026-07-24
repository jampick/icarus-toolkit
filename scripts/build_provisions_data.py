#!/usr/bin/env python3
"""Compile consumable buff data for the Provisions tool.

Input:  data/game/D_Consumable.json, D_ModifierStates.json, D_Stats.json,
        D_ItemsStatic.json, D_Itemable.json, plus site/data/recipes.json
        (for craftability/bench cross-links).
Output: site/data/provisions.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "data" / "game"
OUT = ROOT / "site" / "data" / "provisions.json"

NSLOC = re.compile(r'NSLOCTEXT\("[^"]*",\s*"[^"]*",\s*"(.*)"\)$', re.S)
STATKEY = re.compile(r'Value="([^"]+)"')


def loc(text):
    if not text:
        return ""
    m = NSLOC.match(text)
    # Normalize em dashes (U+2014) out of game-derived display text.
    return (m.group(1) if m else text).replace("\u2014", "-").replace("\\'", "'").replace('\\"', '"').strip()


def rows(name):
    with open(GAME / f"{name}.json") as f:
        return json.load(f)["Rows"]


def main():
    mods = {r["Name"]: r for r in rows("D_ModifierStates")}
    stats_tbl = {r["Name"]: r for r in rows("D_Stats")}
    items_static = {r["Name"]: r for r in rows("D_ItemsStatic")}
    itemable = {r["Name"]: r for r in rows("D_Itemable")}
    recipes = json.load(open(ROOT / "site" / "data" / "recipes.json"))

    def tags_of(iid):
        s = items_static.get(iid)
        if not s:
            return []
        t = [x["TagName"] for x in (s.get("Generated_Tags") or {}).get("GameplayTags", [])]
        t += [x["TagName"] for x in (s.get("Manual_Tags") or {}).get("GameplayTags", [])]
        return t

    def category(iid):
        tags = tags_of(iid)
        for t in tags:
            if t.startswith("Item.AnimalFeed"):
                return None  # creature food, not player provisions
            if t.startswith("Item.Medicine"):
                return "tonic"
            if t.startswith("Item.Consumable.Water"):
                return "drink"
        return "food"

    def stat_dict(d):
        out = {}
        for k, v in (d or {}).items():
            m = STATKEY.search(k)
            if m:
                out[m.group(1)] = v
        return out

    consumable_rows = {r["Name"]: r for r in rows("D_Consumable")}

    used_stats = set()
    consumables = []
    # Walk items -> their Consumable ref (names don't always match, e.g.
    # Food_Pickled_Carrot -> "Picked_Carrot"), so joining by name drops items.
    for iid, s in items_static.items():
        cref = (s.get("Consumable") or {}).get("RowName")
        c = consumable_rows.get(cref)
        if not c:
            continue
        it = itemable.get((s.get("Itemable") or {}).get("RowName", ""), {})
        name = loc(it.get("DisplayName"))
        if not name:
            continue
        cat = category(iid)
        if cat is None:
            continue
        mref = (c.get("Modifier") or {}).get("Modifier", {}).get("RowName")
        mod = mods.get(mref)
        buff_stats = stat_dict((mod or {}).get("GrantedStats"))
        # stomach slots is bookkeeping, not a buff
        slots = buff_stats.pop("BaseFoodStomachSlots_+", 0)
        entry = {
            "id": iid,
            "name": name,
            "desc": loc(it.get("Description")),
            "icon": (it.get("Icon") or "").split("/")[-1].split(".")[0],
            "cat": cat,
            "slots": slots,
            "instant": stat_dict(c.get("Stats")),
            "buff": None,
            "craft": None,
        }
        if mod and buff_stats:
            entry["buff"] = {
                "name": loc(mod.get("ModifierName")),
                "desc": loc(mod.get("ModifierDescription")),
                "dur": (c.get("Modifier") or {}).get("ModifierLifetime", 0),
                "stats": buff_stats,
            }
            used_stats.update(buff_stats)
        ridx = recipes["byOutput"].get(iid)
        if ridx:
            entry["craft"] = recipes["recipes"][ridx[0]]["benches"][:1]
        if entry["buff"]:
            consumables.append(entry)

    # stat metadata: display template + max magnitude for normalization
    stat_meta = {}
    for sid in used_stats:
        row = stats_tbl.get(sid, {})
        tpl = loc(row.get("PositiveDescription")) or sid
        mx = max((abs(c["buff"]["stats"].get(sid, 0)) for c in consumables), default=1) or 1
        stat_meta[sid] = {"tpl": tpl, "max": mx}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"consumables": consumables, "stats": stat_meta}, f, separators=(",", ":"))

    cats = {}
    for c in consumables:
        cats[c["cat"]] = cats.get(c["cat"], 0) + 1
    print(f"buff consumables: {len(consumables)} {cats}  stats: {len(stat_meta)}")
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

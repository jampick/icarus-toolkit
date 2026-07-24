#!/usr/bin/env python3
"""Compile creature/taming/mount/saddle/feed data for the Stables tool.

Input: data/game tables incl. D_Tames, D_Mounts, D_Saddles.
Output: site/data/stables.json
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GAME = REPO / "data" / "game"

NSLOC = re.compile(r'NSLOCTEXT\("[^"]*",\s*"[^"]*",\s*"(.*)"\)$', re.S)
STATKEY = re.compile(r'Value="([^"]+)"')


def loc(text):
    if not text:
        return ""
    m = NSLOC.match(text)
    return (m.group(1) if m else text).replace("—", "-").strip()


def rows(path, name):
    with open(path / f"{name}.json") as f:
        return json.load(f)["Rows"]


def pretty(rid):
    return rid.replace("_", " ").strip()


def main():
    tames = rows(GAME, "D_Tames")
    mounts = {r["Name"]: r for r in rows(GAME, "D_Mounts")}
    saddles = rows(GAME, "D_Saddles")
    items_static = {r["Name"]: r for r in rows(GAME, "D_ItemsStatic")}
    itemable = {r["Name"]: r for r in rows(GAME, "D_Itemable")}
    consumable = {r["Name"]: r for r in rows(GAME, "D_Consumable")}
    mod_states = {r["Name"]: r for r in rows(GAME, "D_ModifierStates")}
    stats_tbl = {r["Name"]: r for r in rows(GAME, "D_Stats")}
    recipes = json.load(open(REPO / "site" / "data" / "recipes.json"))

    def tags_of(iid):
        s = items_static.get(iid)
        if not s:
            return []
        t = [x["TagName"] for x in (s.get("Generated_Tags") or {}).get("GameplayTags", [])]
        t += [x["TagName"] for x in (s.get("Manual_Tags") or {}).get("GameplayTags", [])]
        return t

    def item_display(iid):
        s = items_static.get(iid)
        it = itemable.get((s or {}).get("Itemable", {}).get("RowName", ""), {}) if s else {}
        return (loc(it.get("DisplayName")) or pretty(iid),
                loc(it.get("Description")),
                (it.get("Icon") or "").split("/")[-1].split(".")[0])

    def benches_of(iid):
        ridx = recipes["byOutput"].get(iid)
        return recipes["recipes"][ridx[0]]["benches"][:1] if ridx else None

    # ---- saddle items: craftable items whose tags include Item.Mount.Saddle.* ----
    saddle_items = {}  # tag -> [item ids]
    for iid in items_static:
        for t in tags_of(iid):
            if t.startswith("Item.Mount.Saddle"):
                saddle_items.setdefault(t, []).append(iid)

    # ---- mounts: which saddle tags fit which mount ----
    mount_saddles = {}  # mount row name -> set of saddle tags
    for s in saddles:
        tag = (s.get("SaddleTag") or {}).get("TagName", "")
        for m in s.get("SupportedMount", []):
            mount_saddles.setdefault(m["RowName"], set()).add(tag)

    # Mount row names vary in underscore style (SwampBird vs Swamp_Bird), so
    # resolve references case- and underscore-insensitively.
    mount_norm = {m.lower().replace("_", ""): m for m in mounts}

    def resolve_mount(*names):
        for n in names:
            hit = mount_norm.get((n or "").lower().replace("_", ""))
            if hit:
                return hit
        return None

    # ---- creatures ----
    creatures = []
    for t in tames:
        rid = t["Name"]
        ai = (t.get("TamedAI") or {}).get("RowName", "")
        mount_ref = resolve_mount(ai.removeprefix("Mount_") if ai.startswith("Mount_") else "", rid)
        rideable = mount_ref is not None
        tr = t.get("DesiredTemperatureRange") or {}
        stags = sorted(mount_saddles.get(mount_ref, [])) if rideable else []
        sitems = sorted({i for tag in stags for i in saddle_items.get(tag, [])})
        creatures.append({
            "id": rid,
            "name": pretty(rid),
            "tame_s": t.get("TameDurationInSeconds", 0),
            "temp": {"min": tr.get("X"), "max": tr.get("Y")} if tr else None,
            "shelter": t.get("DesiredShelterPercentage", 0),
            "nutrition": t.get("DesiredNutritionPercentage", 0),
            "prohibited": [p["RowName"] for p in t.get("ProhibitedTamingModifiers", [])],
            "gestation_s": t.get("GestationPeriodSeconds") or 0,
            "juvenile": bool(t.get("JuvenileCreatureType")),
            "rideable": rideable,
            "saddles": sitems,
        })

    # ---- saddle item details ----
    saddle_detail = {}
    for tag, iids in saddle_items.items():
        for iid in iids:
            name, desc, icon = item_display(iid)
            saddle_detail[iid] = {
                "name": name, "desc": desc, "icon": icon,
                "benches": benches_of(iid),
                "craftable": iid in recipes["byOutput"],
            }

    # ---- animal feeds with their buffs ----
    used_stats = set()
    feeds = []
    for iid in items_static:
        if not any(tg.startswith("Item.AnimalFeed") for tg in tags_of(iid)):
            continue
        cref = (items_static[iid].get("Consumable") or {}).get("RowName")
        c = consumable.get(cref)
        if not c:
            continue
        mref = (c.get("Modifier") or {}).get("Modifier", {}).get("RowName")
        mod = mod_states.get(mref)
        stats = {}
        for k, v in ((mod or {}).get("GrantedStats") or {}).items():
            m = STATKEY.search(k)
            if m and m.group(1) != "BaseFoodStomachSlots_+":
                stats[m.group(1)] = v
        name, desc, icon = item_display(iid)
        feeds.append({
            "id": iid, "name": name, "desc": desc, "icon": icon,
            "dur": (c.get("Modifier") or {}).get("ModifierLifetime", 0),
            "stats": stats,
            "benches": benches_of(iid),
            "craftable": iid in recipes["byOutput"],
        })
        used_stats.update(stats)

    stat_meta = {}
    for sid in sorted(used_stats):
        row = stats_tbl.get(sid, {})
        stat_meta[sid] = {"tpl": loc(row.get("PositiveDescription")) or sid}

    out = {
        "creatures": sorted(creatures, key=lambda c: c["name"]),
        "saddleItems": saddle_detail,
        "feeds": sorted(feeds, key=lambda f: f["name"]),
        "stats": stat_meta,
    }
    dest = REPO / "site" / "data" / "stables.json"
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=False)

    ridable = sum(1 for c in creatures if c["rideable"])
    print(f"creatures: {len(creatures)} ({ridable} rideable)  "
          f"saddle items: {len(saddle_detail)}  feeds: {len(feeds)}  stats: {len(stat_meta)}")
    print(f"wrote {dest} ({dest.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

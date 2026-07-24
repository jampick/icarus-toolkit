#!/usr/bin/env python3
"""Compile Icarus game data tables into a compact recipes.json for the calculator site.

Input:  data/game/D_ProcessorRecipes.json, D_ItemTemplate.json, D_ItemsStatic.json, D_Itemable.json
        (extracted from the game's data.pak, or pulled from a community mirror)
Output: site/data/recipes.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "data" / "game"
OUT = ROOT / "site" / "data" / "recipes.json"

NSLOC = re.compile(r'NSLOCTEXT\("[^"]*",\s*"[^"]*",\s*"(.*)"\)$', re.S)
INVTEXT = re.compile(r'INVTEXT\("(.*)"\)$', re.S)


def loc(text):
    if not text:
        return ""
    m = NSLOC.match(text) or INVTEXT.match(text)
    text = m.group(1) if m else text
    # Normalize em dashes (U+2014) out of game-derived display text.
    return text.replace("[DNT] ", "").replace("\u2014", "-").replace("\\'", "'").replace('\\"', '"').strip()


def rows(name):
    with open(GAME / f"{name}.json") as f:
        return json.load(f)["Rows"]


def main():
    itemable = {r["Name"]: r for r in rows("D_Itemable")}
    items_static = {r["Name"]: r for r in rows("D_ItemsStatic")}
    template = {r["Name"]: r for r in rows("D_ItemTemplate")}
    try:
        bench_names = {r["Name"]: loc(r.get("RecipeSetName")) for r in rows("D_RecipeSets")}
    except FileNotFoundError:
        bench_names = {}

    # Canonical item id = D_ItemsStatic row name. Templates map onto it.
    def canon(row_name, table):
        if table == "D_ItemTemplate":
            t = template.get(row_name)
            if t and t.get("ItemStaticData"):
                return t["ItemStaticData"]["RowName"]
        return row_name

    def tags_of(static_row):
        tags = [t["TagName"] for t in (static_row.get("Generated_Tags") or {}).get("GameplayTags", [])]
        tags += [t["TagName"] for t in (static_row.get("Manual_Tags") or {}).get("GameplayTags", [])]
        return tags

    def category(static_row):
        for t in tags_of(static_row):
            if t.startswith("Item.Resource.Ore"):
                return "ore"
            if t.startswith("Item.Creature.Loot"):
                return "loot"
            if t.startswith("Item.Resource"):
                return "resource"
            if t.startswith("Item.Plant") or t.startswith("Item.Food") or t.startswith("Item.Consumable"):
                return "organic"
            if t.startswith("Item.Fuel"):
                return "fuel"
        return "item"

    # Items the player gathers from the world rather than crafts, even though a
    # conversion recipe exists that outputs them (e.g. Frozen Wood -> Wood).
    GATHERABLE = {
        "Wood", "Stone", "Stick", "Fiber", "Ice", "Clay", "Oxite", "Sulfur",
        "Silica", "Leather", "Bone", "Fur", "Wood_Bundle", "Tree_Sap_Raw",
    }

    def is_gatherable(iid, s):
        if iid in GATHERABLE:
            return True
        if s:
            for t in tags_of(s):
                if t.startswith("Item.Resource.Ore") or t == "Item.Creature.Loot":
                    return True
        return False

    items = {}
    def ensure_item(iid):
        if iid in items:
            return
        s = items_static.get(iid)
        it = itemable.get((s or {}).get("Itemable", {}).get("RowName", ""), {}) if s else {}
        icon = (it.get("Icon") or "").split("/")[-1].split(".")[0]
        items[iid] = {
            "name": loc(it.get("DisplayName")) or iid.replace("_", " "),
            "desc": loc(it.get("Description")),
            "weight": it.get("Weight"),
            "stack": it.get("MaxStack"),
            "cat": category(s) if s else "item",
            "icon": icon,
            "raw": is_gatherable(iid, s),
        }

    recipes = []
    skipped = 0
    for r in rows("D_ProcessorRecipes"):
        outputs = r.get("Outputs") or []
        inputs = r.get("Inputs") or []
        if not outputs or not inputs:
            skipped += 1
            continue
        benches = [bench_names.get(rs["RowName"]) or rs["RowName"].replace("_", " ")
                   for rs in r.get("RecipeSets", [])]
        rec = {
            "id": r["Name"],
            "benches": benches,
            "inputs": [],
            "outputs": [],
        }
        for i in inputs:
            iid = canon(i["Element"]["RowName"], i["Element"].get("DataTableName", "D_ItemsStatic"))
            ensure_item(iid)
            rec["inputs"].append([iid, i.get("Count", 1)])
        for o in outputs:
            oid = canon(o["Element"]["RowName"], o["Element"].get("DataTableName", "D_ItemTemplate"))
            ensure_item(oid)
            rec["outputs"].append([oid, o.get("Count", 1)])
        recipes.append(rec)

    # A conversion recipe turns a decorated variant into the base item
    # (Frozen_Wood -> Wood, Noxious_Crust_Oxite -> Oxite): the output's name
    # tokens are a subset of an input's. The reverse direction (Aluminium ->
    # Aluminium_Screw) is normal crafting and must NOT be flagged.
    def tokens(iid):
        return set(iid.lower().split("_"))

    for rec in recipes:
        rec["conv"] = any(
            o != i and tokens(o) <= tokens(i)
            for o, _ in rec["outputs"] for i, _ in rec["inputs"]
        )

    # Index recipes by primary output for the site
    by_output = {}
    for idx, rec in enumerate(recipes):
        for oid, _ in rec["outputs"]:
            by_output.setdefault(oid, []).append(idx)

    # Items only producible via conversions are gathered in normal play
    for iid, idxs in by_output.items():
        if all(recipes[i]["conv"] for i in idxs):
            items[iid]["raw"] = True

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"items": items, "recipes": recipes, "byOutput": by_output}, f, separators=(",", ":"))

    craftable = len(by_output)
    raw = sum(1 for i in items if i not in by_output)
    print(f"items: {len(items)}  recipes: {len(recipes)} (skipped {skipped} with no inputs/outputs)")
    print(f"craftable items: {craftable}  raw/base items referenced: {raw}")
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

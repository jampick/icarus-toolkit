#!/usr/bin/env python3
"""Compile armor/weapon/ammo data for the Armory tool.

Input: data/game tables incl. D_Armour, D_ArmourSets, D_ArmourSetBonus,
D_ToolDamage, D_FirearmData, D_ValidAmmoTypes, D_AmmoTypes, D_Ballistic,
D_Durable, D_WorkshopItems.
Output: site/data/armory.json
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GAME = REPO / "data" / "game"

NSLOC = re.compile(r'NSLOCTEXT\("[^"]*",\s*"[^"]*",\s*"(.*)"\)$', re.S)
STATKEY = re.compile(r'Value="([^"]+)"')

# Armor pieces without a set (envirosuits, backpacks) still matter to a
# loadout; group them by ArmourType instead.
GEAR_GROUPS = {
    "Undersuit": "Envirosuits",
    "Backpack": "Backpacks",
}
SLOT_LABEL = {
    "Head": "Helmet", "Chest": "Chest", "Hands": "Gloves", "Legs": "Pants",
    "Feet": "Boots", "Backpack": "Backpack", "Undersuit": "Envirosuit",
    "Undersuit_Helmet": "Helmet",
}
SLOT_ORDER = ["Head", "Undersuit_Helmet", "Chest", "Hands", "Legs", "Feet",
              "Undersuit", "Backpack"]

# Weapon class from gameplay tags, first match wins (crossbows also carry
# the plain Bow tag, so Crossbow must match first).
WEAPON_CLASSES = [
    ("Item.Weapon.Spear", "spear"),
    ("Item.Weapon.Crossbow", "crossbow"),
    ("Item.Weapon.Bow", "bow"),
    ("Item.Weapon.Firearm.Pistol", "pistol"),
    ("Item.Weapon.Firearm.Rifle", "rifle"),
    ("Item.Weapon.Firearm.Shotgun", "shotgun"),
    ("Item.Weapon.Grenade", "grenade"),
    ("Item.Weapon.GrenadeLauncher", "heavy"),
    ("Item.Weapon.Launcher", "heavy"),
    ("Item.Weapon.Flamethrower", "heavy"),
    ("Item.Weapon.Gauntlet", "gauntlet"),
    ("Item.Weapon.Firearm", "pistol"),  # laser / oddballs
]
# The game tags every SMG (and the T3 assault rifle) Item.Weapon.Firearm.
# Pistol; the ammo group a firearm loads is the truthful signal, so it
# overrides a missing or pistol tag class.
AMMOGROUP_CLASS = {
    "AllSubmachineGuns": "smg", "AllAssaultRifle": "rifle",
    "AllSnipers": "rifle", "AllNails": "heavy", "AllLauncher": "heavy",
    "AllT2Launcher": "heavy", "BioFuel": "heavy",
}


def loc(text):
    if not text:
        return ""
    m = NSLOC.match(text) or re.match(r'INVTEXT\("(.*)"\)$', text, re.S)
    out = (m.group(1) if m else text).replace("—", "-").replace("\\'", "'").replace('\\"', '"')
    return out.removeprefix("[DNT] ").strip()


def rows(name):
    with open(GAME / f"{name}.json") as f:
        return json.load(f)


def by_name(name):
    return {r["Name"]: r for r in rows(name)["Rows"]}


def pretty(rid):
    # split CamelCase row names (ArcticArmor -> Arctic Armor) but leave
    # acronyms (CHAC) alone
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", rid.replace("_", " ")).strip()


def statmap(d, drop=()):
    out = {}
    for k, v in (d or {}).items():
        m = STATKEY.search(k)
        if m and m.group(1) not in drop:
            out[m.group(1)] = v
    return out


def main():
    items_static = by_name("D_ItemsStatic")
    itemable = by_name("D_Itemable")
    armour = by_name("D_Armour")
    armour_sets = by_name("D_ArmourSets")
    set_bonus = by_name("D_ArmourSetBonus")
    tool_dmg = by_name("D_ToolDamage")
    firearm_tbl = rows("D_FirearmData")
    firearms = {r["Name"]: r for r in firearm_tbl["Rows"]}
    fire_default = firearm_tbl.get("Defaults") or {}
    valid_ammo = by_name("D_ValidAmmoTypes")
    ammo_types = by_name("D_AmmoTypes")
    ballistic = by_name("D_Ballistic")
    durable = by_name("D_Durable")
    stats_tbl = by_name("D_Stats")
    recipes = json.load(open(REPO / "site" / "data" / "recipes.json"))
    workshop = {(r.get("Item") or {}).get("RowName") or r["Name"]
                for r in rows("D_WorkshopItems")["Rows"]}

    used_stats = set()

    def tags_of(iid):
        s = items_static.get(iid, {})
        return [x["TagName"] for x in (s.get("Generated_Tags") or {}).get("GameplayTags", [])] + \
               [x["TagName"] for x in (s.get("Manual_Tags") or {}).get("GameplayTags", [])]

    def item_display(iid):
        s = items_static.get(iid) or {}
        it = itemable.get((s.get("Itemable") or {}).get("RowName", ""), {})
        return (loc(it.get("DisplayName")) or pretty(iid),
                loc(it.get("Description")),
                (it.get("Icon") or "").split("/")[-1].split(".")[0])

    def benches_of(iid):
        ridx = recipes["byOutput"].get(iid)
        return recipes["recipes"][ridx[0]]["benches"][:1] if ridx else None

    def source_of(iid):
        """How a prospector gets the item: crafted, orbital workshop,
        or a Great Hunts trophy. None = not player-obtainable."""
        if iid in recipes["byOutput"]:
            return "craft"
        if iid in workshop:
            return "ws"
        if iid.startswith("LegendaryWeapon_"):
            return "hunt"
        return None

    def durability_of(iid):
        ref = (items_static.get(iid, {}).get("Durable") or {}).get("RowName")
        d = durable.get(ref) or {}
        return d.get("Max_Durability")

    def base_fields(iid, src):
        name, desc, icon = item_display(iid)
        out = {"id": iid, "name": name, "desc": desc, "icon": icon, "src": src}
        if src == "craft":
            out["benches"] = benches_of(iid)
        dur = durability_of(iid)
        if dur:
            out["dur"] = dur
        return out

    # ---- armor pieces, grouped by set (or by type for setless gear) ----
    groups = {}  # group id -> group dict
    for iid, s in items_static.items():
        aref = (s.get("Armour") or {}).get("RowName")
        a = armour.get(aref)
        if not a:
            continue
        atype = a.get("ArmourType")
        if atype not in SLOT_LABEL:
            continue  # head skins, NPC gauntlets
        src = source_of(iid)
        if not src:
            continue  # NPC / spacesuit cosmetics
        set_ref = (a.get("ArmourSet") or {}).get("RowName")
        piece = base_fields(iid, src)
        piece["slot"] = atype
        piece["stats"] = statmap(a.get("ArmourStats"))
        piece["stats"].update(statmap(s.get("AdditionalStats")))
        used_stats.update(piece["stats"])
        if set_ref:
            g = groups.setdefault("set:" + set_ref, {
                "id": set_ref, "name": pretty(set_ref) + " Set",
                "kind": "set", "pieces": []})
            if "bonus" not in g:
                bref = (armour_sets.get(set_ref, {}).get("SetBonus") or [{}])[0].get("RowName")
                b = set_bonus.get(bref)
                if b:
                    bstats = statmap(b.get("StatsGranted"))
                    used_stats.update(bstats)
                    desc = loc(b.get("Description"))
                    g["bonus"] = {"need": b.get("RequiredGear", 0),
                                  "desc": desc, "stats": bstats}
                    # the bonus description is the set's real in-game name
                    # (Sand -> "Carbonweave Armor Set", Carbon -> "Naneo")
                    if desc:
                        g["name"] = desc if desc.endswith("Set") else desc + " Set"
        else:
            gname = GEAR_GROUPS.get(atype)
            if not gname:
                continue
            g = groups.setdefault("gear:" + atype, {
                "id": atype, "name": gname, "kind": "gear", "pieces": []})
        g["pieces"].append(piece)

    def set_rank(g):
        """Progression order: total physical resistance across the set."""
        return sum(p["stats"].get("BasePhysicalDamageResistance_%", 0)
                   for p in g["pieces"])

    for g in groups.values():
        g["pieces"].sort(key=lambda p: (SLOT_ORDER.index(p["slot"]), p["name"]))
    sets = sorted((g for g in groups.values() if g["kind"] == "set"),
                  key=lambda g: (set_rank(g), g["name"]))
    gear = sorted((g for g in groups.values() if g["kind"] == "gear"),
                  key=lambda g: list(GEAR_GROUPS).index(g["id"]))

    # ---- weapons ----
    weapons = []
    for iid, s in items_static.items():
        wtags = [t for t in tags_of(iid) if t.startswith("Item.Weapon")]
        if not wtags:
            continue
        src = source_of(iid)
        if not src:
            continue
        w = base_fields(iid, src)
        wclass = next((c for prefix, c in WEAPON_CLASSES
                       if any(t.startswith(prefix) for t in wtags)), None)
        td = tool_dmg.get((s.get("ToolDamage") or {}).get("RowName"))
        if td and td.get("Melee_Damage"):
            w["melee"] = td["Melee_Damage"]
        bal = ballistic.get((s.get("Ballistic") or {}).get("RowName"))
        if bal and bal.get("Damage"):
            w["thrown"] = bal["Damage"]
        fd = firearms.get((s.get("FirearmData") or {}).get("RowName"))
        if fd:
            def fval(key):
                return fd.get(key, fire_default.get(key))
            group = (fd.get("ValidAmmoTypes") or {}).get("RowName")
            w["ranged"] = {
                "ammo": group,
                "cap": fval("AmmoCapacity"),
                "rpm": fval("RoundsPerMinute"),
                "reload": fval("ReloadTime"),
                "mult": fval("DamageMultiplier"),
            }
            if wclass in (None, "pistol") and group in AMMOGROUP_CLASS:
                wclass = AMMOGROUP_CLASS[group]
        extra = statmap(s.get("AdditionalStats"))
        if extra:
            w["stats"] = extra
            used_stats.update(extra)
        w["cls"] = wclass or "other"
        weapons.append(w)

    # ---- ammo, grouped the way weapons load it ----
    ammo_groups = {}
    for w in weapons:
        gid = (w.get("ranged") or {}).get("ammo")
        if not gid or gid in ammo_groups or gid not in valid_ammo:
            continue
        va = valid_ammo[gid]
        ammo_ids = [ref["RowName"] for ref in va.get("AmmoTypes", [])]
        # Some obtainable weapons load ammo that is neither craftable nor a
        # workshop purchase (sniper/laser/slug rounds come from mission
        # rewards and supply crates). Only when a group has no obtainable
        # ammo at all, keep everything badged as found gear - a permissive
        # fallback on groups with craftable ammo would drag in NPC variants.
        fallback = not any(source_of(a) for a in ammo_ids)
        entries = []
        for aid in ammo_ids:
            s = items_static.get(aid)
            src = source_of(aid) or ("drop" if fallback else None)
            if not s or not src:
                continue
            e = base_fields(aid, src)
            at = ammo_types.get((s.get("AmmoType") or {}).get("RowName"))
            bal = ballistic.get((s.get("Ballistic") or {}).get("RowName"))
            if at:
                e["dmg"] = at.get("ProjectileDamage", 0)
                if at.get("ProjectileCount", 1) > 1:
                    e["pellets"] = at["ProjectileCount"]
                estats = statmap(at.get("Stats"))
                if estats:
                    e["stats"] = estats
                    used_stats.update(estats)
            elif bal:
                e["dmg"] = bal.get("Damage", 0)
                if bal.get("BreakChance") is not None:
                    e["break"] = round(bal["BreakChance"] * 100)
            if e.get("dmg"):
                entries.append(e)
        entries.sort(key=lambda e: (e["dmg"], e["name"]))
        if entries:
            ammo_groups[gid] = {"label": loc(va.get("DisplayName")) or pretty(gid),
                                "ammo": entries}

    weapons.sort(key=lambda w: (w["cls"], w.get("melee") or 0, w["name"]))

    # ---- stat display templates (see provisions/stables builders) ----
    stat_meta = {}
    for sid in sorted(used_stats):
        row = stats_tbl.get(sid, {})
        stat_meta[sid] = {"tpl": loc(row.get("PositiveDescription")) or sid}
        ops = row.get("DisplayOperations")
        if ops:
            stat_meta[sid]["ops"] = [[o["Operation"], o["Value"]] for o in ops]

    out = {"sets": sets, "gear": gear, "weapons": weapons,
           "ammoGroups": ammo_groups, "stats": stat_meta}
    dest = REPO / "site" / "data" / "armory.json"
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=False)

    npieces = sum(len(g["pieces"]) for g in sets + gear)
    nammo = sum(len(g["ammo"]) for g in ammo_groups.values())
    print(f"armor sets: {len(sets)} (+{len(gear)} gear groups, {npieces} pieces)  "
          f"weapons: {len(weapons)}  ammo: {nammo} in {len(ammo_groups)} groups  "
          f"stats: {len(stat_meta)}")
    print(f"wrote {dest} ({dest.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

/* Icarus Armory - arms and armor: sets, weapons and the ammo they fire */
"use strict";

const ICON_BASE = window.ICON_BASE || "icons/";
const BREAKDOWN_BASE = window.BREAKDOWN_BASE || "index.html";
const PROVISIONS_BASE = window.PROVISIONS_BASE || "provisions.html";
const STABLES_BASE = window.STABLES_BASE || "stables.html";

/* weapon class chips, in progression-ish order */
const CLS = [
  { id: "spear", label: "🗡 Spears" },
  { id: "bow", label: "🏹 Bows" },
  { id: "crossbow", label: "🎯 Crossbows" },
  { id: "pistol", label: "🔫 Pistols" },
  { id: "rifle", label: "🎖 Rifles" },
  { id: "shotgun", label: "💥 Shotguns" },
  { id: "smg", label: "🌀 SMGs" },
  { id: "grenade", label: "💣 Grenades" },
  { id: "heavy", label: "🚀 Heavy" },
  { id: "gauntlet", label: "🦾 Gauntlets" },
  { id: "other", label: "❓ Other" },
];

const SLOT_EMOJI = {
  Head: "🪖", Chest: "🦺", Hands: "🧤", Legs: "👖", Feet: "🥾",
  Undersuit: "🧑‍🚀", Undersuit_Helmet: "🪖", Backpack: "🎒",
};
const SLOT_LABEL = {
  Head: "helmet", Chest: "chest", Hands: "gloves", Legs: "pants",
  Feet: "boots", Undersuit: "envirosuit", Undersuit_Helmet: "helmet",
  Backpack: "backpack",
};

let DATA = null;
let PROV = null;  // provisions.json, for the loadout wizard's food picks
let STAB = null;  // stables.json, for the loadout wizard's mount picks
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function loadData() {
  const grab = async (id, url) => {
    const inline = document.getElementById(id);
    if (inline) return JSON.parse(inline.textContent);
    try { return await (await fetch(url)).json(); } catch { return null; }
  };
  DATA = await grab("armory-data", "data/armory.json");
  [PROV, STAB] = await Promise.all([
    grab("provisions-data", "data/provisions.json"),
    grab("stables-data", "data/stables.json"),
  ]);
}

function updateURL(kv) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(kv)) {
    if (v === null || v === undefined) p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  history.replaceState({}, "", q ? "?" + q : location.pathname);
}

// Raw stat values stay game-native; ops are the game's display-only
// transforms (see provisions.js).
function displayValue(v, ops) {
  for (const [op, x] of ops || []) {
    if (op === "Division") v /= x;
    else if (op === "Multiply") v *= x;
    else if (op === "Addition") v += x;
    else if (op === "Subtraction") v -= x;
  }
  return Math.round(v * 100) / 100;
}

function statLabel(sid, v) {
  const meta = DATA.stats[sid] || (PROV && PROV.stats[sid]) || { tpl: sid };
  const pct = meta.tpl.includes("{0}%") || sid.includes("%");
  const text = meta.tpl.replace(/[+\-]?\{0\}%?/, "").trim() || sid;
  const d = displayValue(v, meta.ops);
  return `${d > 0 ? "+" : ""}${d}${pct ? "%" : ""} ${text}`;
}

/* stats where a negative value helps you (less consumption, less threat…) */
const NEG_GOOD = /(FoodConsumption|WaterConsumption|OxygenConsumption|ActionCost|ItemWear|ThreatModifier|StaminaCost|ChanceProjectilesBreak|FirearmCarryWeight|(Bacterial|Parasitic|PhysicalTrauma|Poison|Wound)ModifierDuration)/;

function statList(stats) {
  const ul = document.createElement("ul");
  ul.className = "pstats";
  for (const [sid, v] of Object.entries(stats || {})) {
    const li = document.createElement("li");
    const helpful = NEG_GOOD.test(sid) ? v < 0 : v >= 0;
    li.className = helpful ? "good" : "bad";
    li.textContent = statLabel(sid, v);
    ul.appendChild(li);
  }
  return ul;
}

function itemIcon(icon, cls) {
  const img = document.createElement("img");
  img.className = cls || "";
  img.loading = "lazy";
  img.src = ICON_BASE + icon + ".png";
  img.onerror = () => img.remove();
  return img;
}

/* where the item comes from, as a badge */
function srcBadge(x) {
  if (x.src === "craft" && x.benches) return `<span class="bench">${x.benches[0]}</span>`;
  if (x.src === "craft") return `<span class="bench">crafted</span>`;
  if (x.src === "ws") return `<span class="bench ws">orbital workshop</span>`;
  if (x.src === "hunt") return `<span class="bench hunt">🏆 great hunt trophy</span>`;
  return `<span class="bench">found in the field</span>`;
}

function costLink(x) {
  if (x.src !== "craft") return null;
  const a = document.createElement("a");
  a.className = "pcost";
  a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(x.id)}`;
  a.textContent = "⛏ what it costs →";
  return a;
}

function fmtNum(n) {
  return (n || 0).toLocaleString("en-US");
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- armor tab ---------- */

function allGroups() {
  return [...DATA.sets, ...DATA.gear];
}

function groupStatTotal(g, sid) {
  return g.pieces.reduce((t, p) => t + (p.stats[sid] || 0), 0);
}

/* Sets mixing sources don't exist in the data; the first piece speaks for all. */
function groupSrc(g) { return g.pieces[0].src; }
function coldReady(g) { return groupStatTotal(g, "BaseColdResistance_%") > 0; }
function heatReady(g) { return groupStatTotal(g, "BaseHeatResistance_%") > 0; }

let armorFilter = "all";

function visibleGroups() {
  let list = allGroups();
  if (armorFilter === "craft") list = list.filter(g => groupSrc(g) === "craft");
  if (armorFilter === "ws") list = list.filter(g => groupSrc(g) === "ws");
  if (armorFilter === "cold") list = list.filter(coldReady);
  if (armorFilter === "heat") list = list.filter(heatReady);
  return list;
}

function shortSetName(g) {
  return g.name.replace(/ (Armor )?Set$/, "");
}

function bonusLine(g) {
  if (!g.bonus) return "";
  const stats = Object.entries(g.bonus.stats)
    .map(([sid, v]) => statLabel(sid, v)).join(" · ");
  return `<div class="set-bonus">✨ full set (${g.bonus.need} pieces): <b>${stats}</b></div>`;
}

function pieceCard(p) {
  const el = document.createElement("div");
  el.className = "pcard";
  el.dataset.id = p.id;
  const head = document.createElement("div");
  head.className = "pcard-head";
  if (p.icon) head.appendChild(itemIcon(p.icon));
  const meta = document.createElement("div");
  meta.innerHTML = `<div class="pname">${p.name}</div>
    <div class="psub"><span class="bench slot">${SLOT_EMOJI[p.slot] || ""} ${SLOT_LABEL[p.slot] || p.slot}</span>
      ${srcBadge(p)}</div>`;
  head.appendChild(meta);
  el.appendChild(head);
  el.appendChild(statList(p.stats));
  if (p.dur) {
    const d = document.createElement("div");
    d.className = "psub";
    d.innerHTML = `🔧 ${fmtNum(p.dur)} durability`;
    el.appendChild(d);
  }
  const a = costLink(p);
  if (a) el.appendChild(a);
  return el;
}

function renderSetJump() {
  const host = $("#set-jump");
  host.innerHTML = "";
  const top = document.createElement("button");
  top.className = "tchip top";
  top.textContent = "↑ Top";
  top.title = "Back to search";
  top.onclick = scrollTop;
  host.appendChild(top);
  for (const g of visibleGroups()) {
    const b = document.createElement("button");
    b.className = "tchip";
    b.textContent = shortSetName(g);
    b.onclick = () => {
      const sec = document.getElementById("set-" + g.id);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    host.appendChild(b);
  }
}

/* whole-set stat totals: every piece summed (set bonus listed separately) */
function setTotals(g) {
  const tot = {};
  for (const p of g.pieces)
    for (const [sid, v] of Object.entries(p.stats)) tot[sid] = (tot[sid] || 0) + v;
  return tot;
}

/* headline resistances first, then everything else by size */
const TOTAL_LEAD = ["BasePhysicalDamageResistance_%", "BaseColdResistance_%",
  "BaseHeatResistance_%", "BaseFireDamageResistance_%", "BaseExposureResistance_+%"];
function orderedTotals(tot) {
  const lead = (sid) => {
    const i = TOTAL_LEAD.indexOf(sid);
    return i < 0 ? TOTAL_LEAD.length : i;
  };
  return Object.fromEntries(Object.entries(tot)
    .sort(([a, av], [b, bv]) => lead(a) - lead(b) || Math.abs(bv) - Math.abs(av)));
}

const expandedSets = new Set();

/* mods that actually help the filtered scenario (there is no cold/heat armor
   mod in the game data, so surface the closest real helpers honestly) */
const FILTER_MOD_STATS = {
  cold: ["BaseExposureResistance_+%", "BaseStormStaminaRegen_+%", "BaseComfortLevel_+"],
  heat: ["BaseExposureResistance_+%", "BaseStormStaminaRegen_+%", "BaseComfortLevel_+"],
};
function filterModHint(host) {
  const relevant = FILTER_MOD_STATS[armorFilter];
  if (!relevant) return;
  const helpers = (DATA.mods || []).filter(m => m.fits.armor &&
    relevant.some(sid => m.stats[sid] > 0));
  if (!helpers.length) return;
  const names = [...new Set(helpers.map(m => m.name.replace(/ Attachment$/, "")))];
  const d = document.createElement("p");
  d.className = "prov-note";
  d.innerHTML = `🔩 No armor mod adds ${armorFilter} resistance directly — the closest helpers are
    <b>${names.join("</b>, <b>")}</b> (exposure &amp; comfort). Real ${armorFilter} protection comes from
    the set itself, the envirosuit, food and buffs — the <a href="?tab=loadout">🎯 Loadout tab</a> stacks all of it.`;
  host.appendChild(d);
}

function setSection(g, relStat) {
  const sec = document.createElement("div");
  sec.className = "mount-sec";
  sec.id = "set-" + g.id;
  const armor = groupStatTotal(g, "BasePhysicalDamageResistance_%");
  const rel = relStat ? groupStatTotal(g, relStat) : 0;
  sec.innerHTML = `<h3 class="mount-h">🛡 ${g.name}
    ${relStat && rel ? `<span class="set-sum"><b>${statLabel(relStat, rel)}</b> total</span>` : ""}
    ${armor ? `<span class="set-sum">${armor}% physical resist total</span>` : ""}
    ${srcBadge(g.pieces[0])}</h3>
    ${bonusLine(g)}`;
  const grid = document.createElement("div");
  grid.className = "prov-grid";
  for (const p of g.pieces) grid.appendChild(pieceCard(p));
  if (g.kind === "set") {
    const panel = document.createElement("div");
    panel.className = "set-totals";
    panel.appendChild(statList(orderedTotals(setTotals(g))));
    sec.appendChild(panel);
    const btn = document.createElement("button");
    btn.className = "drill";
    const label = () => `${expandedSets.has(g.id) ? "▾ hide" : "▸ drill into"} the ${g.pieces.length} pieces`;
    btn.textContent = label();
    grid.classList.toggle("hidden", !expandedSets.has(g.id));
    btn.onclick = () => {
      expandedSets.has(g.id) ? expandedSets.delete(g.id) : expandedSets.add(g.id);
      grid.classList.toggle("hidden", !expandedSets.has(g.id));
      btn.textContent = label();
    };
    sec.appendChild(btn);
  }
  sec.appendChild(grid);
  return sec;
}

function renderSets() {
  const host = $("#set-list");
  host.innerHTML = "";
  const relStat = armorFilter === "cold" ? "BaseColdResistance_%" :
    armorFilter === "heat" ? "BaseHeatResistance_%" : null;
  filterModHint(host);
  let list = visibleGroups();
  if (relStat) {
    list = [...list].sort((a, b) => groupStatTotal(b, relStat) - groupStatTotal(a, relStat));
  }
  for (const g of list) host.appendChild(setSection(g, relStat));
}

/* ---------- weapons tab ---------- */

let weaponFilter = "all";

/* per-shot damage range across the ammo a ranged weapon accepts */
function rangedDamage(w) {
  const grp = w.ranged && DATA.ammoGroups[w.ranged.ammo];
  if (!grp || !grp.ammo.length) return null;
  const mult = w.ranged.mult || 1;
  const per = grp.ammo.map(a => Math.round(a.dmg * (a.pellets || 1) * mult));
  return { min: Math.min(...per), max: Math.max(...per) };
}

function weaponDamageRank(w) {
  const r = rangedDamage(w);
  return Math.max(w.melee || 0, w.thrown || 0, r ? r.max : 0);
}

function clsLabel(id) {
  return (CLS.find(c => c.id === id) || CLS[CLS.length - 1]).label;
}

function weaponCard(w) {
  const el = document.createElement("div");
  el.className = "pcard";
  el.dataset.id = w.id;
  const head = document.createElement("div");
  head.className = "pcard-head";
  if (w.icon) head.appendChild(itemIcon(w.icon));
  const meta = document.createElement("div");
  meta.innerHTML = `<div class="pname">${w.name}</div>
    <div class="psub"><span class="bench slot">${clsLabel(w.cls)}</span> ${srcBadge(w)}</div>`;
  head.appendChild(meta);
  el.appendChild(head);
  const ul = document.createElement("ul");
  ul.className = "pstats";
  if (w.melee) ul.innerHTML += `<li class="good">⚔️ ${w.melee} melee damage</li>`;
  if (w.thrown) ul.innerHTML += `<li class="good">🎯 ${w.thrown} thrown damage</li>`;
  const r = rangedDamage(w);
  if (r) ul.innerHTML += `<li class="good">🏹 ${r.min === r.max ? r.min : r.min + "-" + r.max} per shot, by ammo</li>`;
  if (w.ranged) {
    const bits = [];
    if (w.ranged.cap > 1) bits.push(`mag ${w.ranged.cap}`);
    if (w.ranged.rpm) bits.push(`${w.ranged.rpm} rpm`);
    if (w.ranged.reload) bits.push(`reload ${Math.round(w.ranged.reload * 10) / 10}s`);
    if (bits.length) ul.innerHTML += `<li>⏱ ${bits.join(" · ")}</li>`;
  }
  if (w.dur) ul.innerHTML += `<li>🔧 ${fmtNum(w.dur)} durability</li>`;
  el.appendChild(ul);
  if (w.stats) el.appendChild(statList(w.stats));
  const grp = w.ranged && DATA.ammoGroups[w.ranged.ammo];
  if (grp) {
    const a = document.createElement("a");
    a.className = "pcost";
    a.href = "?tab=ammo#ag-" + w.ranged.ammo;
    a.textContent = `🏹 ${grp.ammo.length} ammo option${grp.ammo.length > 1 ? "s" : ""} →`;
    a.onclick = (e) => { e.preventDefault(); gotoAmmoSec(w.ranged.ammo); };
    el.appendChild(a);
  }
  const c = costLink(w);
  if (c) el.appendChild(c);
  return el;
}

function renderWeaponFilters() {
  const host = $("#wfilters");
  host.innerHTML = "";
  const present = new Set(DATA.weapons.map(w => w.cls));
  const chips = [{ id: "all", label: "All" }, ...CLS.filter(c => present.has(c.id))];
  for (const c of chips) {
    const b = document.createElement("button");
    b.className = "tchip" + (weaponFilter === c.id ? " on" : "");
    b.dataset.f = c.id;
    b.textContent = c.label;
    b.onclick = () => {
      weaponFilter = c.id;
      $$("#wfilters .tchip").forEach(x => x.classList.toggle("on", x === b));
      renderWeapons();
    };
    host.appendChild(b);
  }
}

function renderWeapons() {
  const host = $("#weapon-cards");
  host.innerHTML = "";
  const order = Object.fromEntries(CLS.map((c, i) => [c.id, i]));
  let list = [...DATA.weapons].sort((a, b) =>
    (order[a.cls] - order[b.cls]) || (weaponDamageRank(a) - weaponDamageRank(b)));
  if (weaponFilter !== "all") list = list.filter(w => w.cls === weaponFilter);
  for (const w of list) host.appendChild(weaponCard(w));
}

/* ---------- ammo tab ---------- */

function ammoCard(a) {
  const el = document.createElement("div");
  el.className = "pcard";
  el.dataset.id = a.id;
  const head = document.createElement("div");
  head.className = "pcard-head";
  if (a.icon) head.appendChild(itemIcon(a.icon));
  const meta = document.createElement("div");
  meta.innerHTML = `<div class="pname">${a.name}</div>
    <div class="psub">${srcBadge(a)}</div>`;
  head.appendChild(meta);
  el.appendChild(head);
  const ul = document.createElement("ul");
  ul.className = "pstats";
  const dmg = a.pellets ? `${a.dmg} × ${a.pellets} projectiles` : `${a.dmg} damage`;
  ul.innerHTML += `<li class="good">💥 ${dmg}</li>`;
  if (a.break > 0) ul.innerHTML += `<li>🎲 ${a.break}% break chance</li>`;
  el.appendChild(ul);
  if (a.stats) el.appendChild(statList(a.stats));
  const c = costLink(a);
  if (c) el.appendChild(c);
  return el;
}

function renderAmmoJump() {
  const host = $("#ammo-jump");
  host.innerHTML = "";
  const top = document.createElement("button");
  top.className = "tchip top";
  top.textContent = "↑ Top";
  top.title = "Back to search";
  top.onclick = scrollTop;
  host.appendChild(top);
  for (const [gid, g] of Object.entries(DATA.ammoGroups)) {
    const b = document.createElement("button");
    b.className = "tchip";
    b.textContent = g.label;
    b.onclick = () => {
      const sec = document.getElementById("ag-" + gid);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    host.appendChild(b);
  }
}

function renderAmmo() {
  const host = $("#ammo-list");
  host.innerHTML = "";
  for (const [gid, g] of Object.entries(DATA.ammoGroups)) {
    const sec = document.createElement("div");
    sec.className = "mount-sec";
    sec.id = "ag-" + gid;
    const users = DATA.weapons.filter(w => w.ranged && w.ranged.ammo === gid);
    sec.innerHTML = `<h3 class="mount-h">🏹 ${g.label}
      <span class="set-sum">${users.length} weapon${users.length !== 1 ? "s" : ""} fire${users.length === 1 ? "s" : ""} it</span></h3>`;
    const grid = document.createElement("div");
    grid.className = "prov-grid";
    for (const a of g.ammo) grid.appendChild(ammoCard(a));
    sec.appendChild(grid);
    host.appendChild(sec);
  }
}

/* ---------- mods tab ---------- */

const MOD_CATS = [
  { id: "armor", label: "🛡 Armor mods", emoji: "🛡" },
  { id: "weapon", label: "⚔️ Weapon mods", emoji: "⚔️" },
  { id: "tool", label: "⛏ Tool mods", emoji: "⛏" },
];
const MOD_FIT_LABEL = {
  Head: "helmet", Chest: "chest", Hands: "gloves", Legs: "pants", Feet: "boots",
  FishingRod: "fishing rod", HarvestCart: "harvest cart",
};
function fitLabel(f) {
  return MOD_FIT_LABEL[f] || f.toLowerCase();
}

let modFilter = "all";

function rankBadge(m) {
  if (typeof m.rank === "number")
    return `<span class="bench mk">Mk ${"I".repeat(m.rank)}</span>`;
  if (m.rank)
    return `<span class="bench hunt">🏆 ${pretty(m.rank)} trophy</span>`;
  return "";
}

/* split CamelCase for display (RockGolem -> Rock Golem) */
function pretty(s) {
  return s.replace(/_/g, " ").replace(/(?<=[a-z])(?=[A-Z])/g, " ").trim();
}

function modCard(m) {
  const el = document.createElement("div");
  el.className = "pcard";
  el.dataset.id = m.id;
  const head = document.createElement("div");
  head.className = "pcard-head";
  if (m.icon) head.appendChild(itemIcon(m.icon));
  const meta = document.createElement("div");
  const fits = Object.values(m.fits).flat().map(f => `<span class="fitchip">${fitLabel(f)}</span>`).join("");
  meta.innerHTML = `<div class="pname">${m.name}</div>
    <div class="psub">${rankBadge(m)} ${srcBadge(m)}</div>
    <div>${fits}</div>`;
  head.appendChild(meta);
  el.appendChild(head);
  el.appendChild(statList(m.stats));
  const c = costLink(m);
  if (c) el.appendChild(c);
  return el;
}

function renderModFilters() {
  const host = $("#mfilters");
  host.innerHTML = "";
  const chips = [{ id: "all", label: "All" }, ...MOD_CATS];
  for (const c of chips) {
    const b = document.createElement("button");
    b.className = "tchip" + (modFilter === c.id ? " on" : "");
    b.textContent = c.label;
    b.onclick = () => {
      modFilter = c.id;
      $$("#mfilters .tchip").forEach(x => x.classList.toggle("on", x === b));
      renderMods();
    };
    host.appendChild(b);
  }
}

function renderMods() {
  const host = $("#mod-list");
  host.innerHTML = "";
  for (const cat of MOD_CATS) {
    if (modFilter !== "all" && modFilter !== cat.id) continue;
    const list = (DATA.mods || []).filter(m => m.fits[cat.id]);
    if (!list.length) continue;
    const sec = document.createElement("div");
    sec.className = "mount-sec";
    sec.id = "mods-" + cat.id;
    sec.innerHTML = `<h3 class="mount-h">${cat.label}
      <span class="set-sum">${list.length} mods · one slot per item</span></h3>`;
    const grid = document.createElement("div");
    grid.className = "prov-grid";
    for (const m of list) grid.appendChild(modCard(m));
    sec.appendChild(grid);
    host.appendChild(sec);
  }
}

function gotoModCard(m) {
  showTab("mods");
  if (modFilter !== "all") {
    modFilter = "all";
    renderModFilters();
    renderMods();
  }
  highlightCard("#mod-list", m.id);
}

/* ---------- loadout wizard ---------- */

/* A loadout is scored the way Provisions scores food: a per-scenario weight
   vector over the game's own stat ids, each value normalized by the biggest
   value of that stat anywhere in the armory so no single stat family drowns
   the rest. Weights mirror the Provisions activities (so food picks agree
   with the armor picks) plus the armor-only conditional stats
   (BaseArctic-, BaseDesert-, BaseVolcanic-, BaseCave-) that set bonuses grant. */
const BASE_W = {
  "BasePhysicalDamageResistance_%": .75, "BasePhysicalDamageResistance_+%": .75,
  "BaseProjectileDamageResistance_+%": .3, "BaseMeleeDamageResistance_%": .3,
  "BaseComfortLevel_+": .15, "BaseHealthRegen_+%": .2, "BaseMaximumHealth_+": .2,
  "BaseBackpackSlots_+": .3, "BaseWeightCapacity_+": .3, "BaseWeightCapacity_+%": .3,
  "BaseOxygenSlots_+": .2, "BaseWaterSlots_+": .2, "BaseUpgradeSlots_+": .2,
  "BaseFoodSlots_+": .2,
};

const SCENARIOS = [
  { id: "arctic", name: "Arctic Expedition", emoji: "❄️", prov: "arctic",
    blurb: "Deep cold, blizzards, frostbite and pneumonia.",
    mounts: "cold", tools: [],
    w: { "BaseColdResistance_%": 3, "BaseHypothermiaResistance_%": 2.5,
         "BaseFrostDamageResistance_%": 2, "BaseInternalTemperatureModification_+": 2,
         "BaseWarmupDegreePerMinute_+": 1.5, "BaseExposureResistance_+%": 2,
         "BasePneumoniaResistance_%": 1.5, "BaseArcticColdResistance_+%": 3,
         "BaseArcticExposureResistance_+%": 2, "BaseArcticMovementSpeed_+%": 1,
         "BaseArcticHealthRegen_+%": 1, "BaseArcticFoodConsumption_+%": -1,
         "BaseArcticAnimalThreatModifier_+%": -.5 } },
  { id: "desert", name: "Desert Trek", emoji: "🏜️", prov: "desert",
    blurb: "Heatstroke, sandstorms, water discipline.",
    mounts: "hot", tools: [],
    w: { "BaseHeatResistance_%": 3, "BaseHyperthermiaResistance_%": 2.5,
         "BaseWaterConsumption_+%": -2.5, "BaseExposureResistance_+%": 2,
         "BaseCooldownDegreePerMinute_+": 1.5, "BaseFoodConsumption_+%": -1,
         "BaseDesertExposureResistance_+%": 2, "BaseDesertWaterConsumption_+%": -2,
         "BaseDesertMovementSpeed_+%": 1, "BaseDesertHealthRegen_+%": 1,
         "BaseDesertAnimalThreatModifier_+%": -.5 } },
  { id: "volcanic", name: "Volcanic Run", emoji: "🌋", prov: "volcanic",
    blurb: "Fire, lava splash and the caldera's heat.",
    mounts: "hot", tools: [],
    w: { "BaseFireDamageResistance_%": 3, "BaseFireDamageResistanceWhileInLava_%": 2,
         "BaseHeatResistance_%": 2.5, "BaseHyperthermiaResistance_%": 2,
         "BaseExposureResistance_+%": 2, "BaseCooldownDegreePerMinute_+": 1.5,
         "BaseVolcanicExposureResistance_+%": 2, "BaseVolcanicMovementSpeed_+%": 1,
         "BaseVolcanicAnimalThreatModifier_+%": -.5,
         "BasePhysicalDamageResistance_%": 1.2, "BasePhysicalDamageResistance_+%": 1.2 } },
  { id: "caves", name: "Cave Diving", emoji: "🕳️", prov: "caves",
    blurb: "Thin air, long drops, worms and poison.",
    mounts: null, tools: ["Pickaxe"],
    w: { "BaseOxygenConsumption_+%": -3, "BaseMaximumOxygen_+%": 2.5, "BaseOxygenSlots_+": 1.5,
         "BaseFallDamageResistance_%": 2, "BaseChanceToResistSprain_%": 1,
         "BasePneumoniaResistance_%": 1.5, "BasePoisonResistance_%": 1.5,
         "BasePoisonModifierDuration_+%": -1, "BaseCaveHealthRegen_+%": 1.5,
         "BaseCaveMovementSpeed_+%": 1, "BaseCaveBatExtraDamage_+%": 1,
         "BaseCavewormExtraDamage_+%": 1, "BaseExposureResistance_+%": 1,
         "BasePhysicalDamageResistance_%": 1.5, "BasePhysicalDamageResistance_+%": 1.5 } },
  { id: "hunting", name: "Hunting", emoji: "🏹", prov: "hunting",
    blurb: "Hit hard from stealth, harvest everything.",
    mounts: null, tools: ["Knife"],
    w: { "BaseProjectileDamage_+%": 3, "BaseStealthDamage_+%": 2,
         "BaseAnimalThreatModifier_+%": -2, "BaseStealthThreatModifier_+%": -2,
         "BaseMeatHarvestedFromAnimals_+%": 2.5, "BasePrimeMeatDropChance_%": 1.5,
         "BaseLeatherHarvestedFromAnimals_+%": 1, "BaseBoneHarvestedFromAnimals_+%": .5,
         "BaseFurHarvestedFromAnimals_+%": .5, "BaseCriticalDamage_+%": 1.5,
         "BaseReloadSpeed_+%": 1.5, "BaseChargeSpeed_+%": 1.5,
         "BaseMovementSpeed_+%": 1, "BaseSprintSpeed_+%": 1, "BaseCrouchSpeed_+%": .5 } },
  { id: "combat", name: "Combat / Great Hunt", emoji: "⚔️", prov: "combat",
    blurb: "Boss fights and anything that fights back.",
    mounts: null, tools: [], saddle: "armored",
    w: { "BasePhysicalDamageResistance_%": 3, "BasePhysicalDamageResistance_+%": 3,
         "BaseMeleeDamageResistance_%": 2, "BaseProjectileDamageResistance_+%": 2,
         "BaseExplosiveDamageResistance_%": 1, "BaseMaximumHealth_+": 2,
         "BaseHealthRegen_+%": 2, "BaseMeleeDamage_+%": 2.5, "BaseProjectileDamage_+%": 2.5,
         "BaseAttackSpeed_+%": 1.5, "BaseCriticalDamage_+%": 1.5,
         "BaseChanceToReturnDamage_%": 1, "BaseDamageReturned_%": 1,
         "BaseWoundResistance_%": 1, "BaseBleedResistance_%": .5 } },
  { id: "mining", name: "Mining Run", emoji: "⛏️", prov: "mining",
    blurb: "Ore yield and the stamina to haul it home.",
    mounts: null, tools: ["Pickaxe", "Sledgehammer"],
    w: { "BaseMiningRewards_+%": 3, "BaseMiningRadius_+%": 2,
         "BaseMiningCopperRewards_+%": 1.5, "BaseMiningGoldRewards_+%": 1.5,
         "BaseMiningPlatinumRewards_+%": 1.5, "BaseMiningCoalRewards_+%": 1.5,
         "BaseMiningTitaniumRewards_+%": 1.5, "BaseMiningBauxiteRewards_+%": 1.5,
         "BaseShatteringClayRewards_+%": .5, "BaseShatteringObsidianRewards_+%": .5,
         "BaseShatteringScoriaRewards_+%": .5, "BaseToolStaminaActionCost_+%": -2,
         "BaseMaximumStamina_+": 1, "BaseStaminaRegen_+%": 1,
         "BaseWeightCapacity_+": 1, "BaseWeightCapacity_+%": 1, "BaseBackpackSlots_+": 1 } },
  { id: "travel", name: "Expedition", emoji: "🥾", prov: "travel",
    blurb: "Cover ground fast, eat light, carry more.",
    mounts: "any", tools: [], saddle: "explorer",
    w: { "BaseMovementSpeed_+%": 3, "BaseSprintSpeed_+%": 2.5, "BaseStaminaRegen_+%": 2,
         "BaseMaximumStamina_+": 1.5, "BaseFoodConsumption_+%": -2, "BaseWaterConsumption_+%": -2,
         "BaseFoodModifierDuration_+%": 1.5, "BaseClimbingSpeed_+%": 1, "BaseSwimSpeed_+%": 1,
         "BaseJumpingStaminaActionCost_+%": -1, "BaseFallDamageResistance_%": 1,
         "BaseChanceToResistSprain_%": .5, "BaseWeightCapacity_+": 1,
         "BaseWeightCapacity_+%": 1, "BaseBackpackSlots_+": 1 } },
];

/* extra weight vector when scoring weapon mods: raw damage output matters
   even in scenarios whose armor weights don't mention it */
const WEAPON_MOD_W = {
  "BaseProjectileDamage_+%": 2, "BaseCriticalDamage_+%": 1, "BaseAmmoCapacity_+": .5,
  "BaseReloadSpeed_+%": .5, "BaseFirearmReloadSpeed_+%": .5,
  "BasePistolProjectileAccuracy_+%": .5, "BaseRifleProjectileAccuracy_+%": .5,
  "BaseShotgunProjectileAccuracy_+%": .5, "BaseMeleeDamage_+%": 2,
  "BaseMeleeDamage_+": 1.5, "BaseAttackSpeed_+%": 1, "BaseHardenedPointPenetration_%": .5,
};

/* armory weapon class -> mod fit tag (the game tags SMGs as pistols, so
   pistol mods are what an SMG actually takes) */
const CLS_MOD_FIT = { bow: "bow", crossbow: "crossbow", pistol: "pistol", smg: "pistol",
                      rifle: "rifle", shotgun: "shotgun", spear: "melee" };

const PHYS = "BasePhysicalDamageResistance_%";
const WIZ_SLOTS = ["Head", "Chest", "Hands", "Legs", "Feet"];
/* some sets' helmets are typed Undersuit_Helmet; they fill the Head slot */
const slotKey = (p) => p.slot === "Undersuit_Helmet" ? "Head" : p.slot;

let NORMS = null;
function buildNorms() {
  NORMS = {};
  const eat = (stats) => {
    for (const [sid, v] of Object.entries(stats || {}))
      NORMS[sid] = Math.max(NORMS[sid] || 0, Math.abs(v));
  };
  for (const g of allGroups()) {
    for (const p of g.pieces) eat(p.stats);
    if (g.bonus) eat(g.bonus.stats);
  }
  for (const m of DATA.mods || []) eat(m.stats);
  for (const w of DATA.weapons) eat(w.stats);
}

function wscore(stats, w) {
  let s = 0;
  for (const [sid, v] of Object.entries(stats || {})) {
    const wt = w[sid];
    if (wt) s += wt * v / (NORMS[sid] || Math.abs(v) || 1);
  }
  return s;
}

function scnWeights(scn) { return { ...BASE_W, ...scn.w }; }

let wizScn = null;
let wizSrc = "all";  // all | craftws | craft
const srcAllowed = (src) =>
  wizSrc === "all" ? true : wizSrc === "craftws" ? src !== "hunt" : src === "craft";

function evalArmor(scn) {
  const w = scnWeights(scn);
  const sets = DATA.sets.filter(g => srcAllowed(groupSrc(g)));
  const fullRank = sets.map(g => {
    const tot = setTotals(g);
    if (g.bonus) for (const [sid, v] of Object.entries(g.bonus.stats))
      tot[sid] = (tot[sid] || 0) + v;
    return { g, tot, s: wscore(tot, w) };
  }).sort((a, b) => b.s - a.s || groupStatTotal(b.g, PHYS) - groupStatTotal(a.g, PHYS));

  // best piece per slot across every allowed set, bonus included if the mix
  // still completes one set's requirement
  const mixed = [];
  for (const slot of WIZ_SLOTS) {
    let best = null;
    for (const g of sets) for (const p of g.pieces) {
      if (slotKey(p) !== slot) continue;
      const s = wscore(p.stats, w);
      if (!best || s > best.s) best = { p, g, s };
    }
    if (best) mixed.push(best);
  }
  const perSet = {};
  for (const m of mixed) perSet[m.g.id] = (perSet[m.g.id] || 0) + 1;
  let mixedScore = mixed.reduce((t, m) => t + m.s, 0);
  let mixedBonus = null;
  for (const m of mixed) {
    if (m.g.bonus && perSet[m.g.id] >= m.g.bonus.need && m.g !== mixedBonus) {
      mixedScore += wscore(m.g.bonus.stats, w);
      mixedBonus = m.g;
      break;
    }
  }
  const pureMix = mixed.length && mixed.every(m => m.g === mixed[0].g);
  return { w, fullRank, mixed, mixedScore, mixedBonus, pureMix };
}

function bestModFor(cat, key, w) {
  let best = null;
  for (const m of DATA.mods || []) {
    if (!(m.fits[cat] || []).includes(key) || !srcAllowed(m.src)) continue;
    const s = wscore(m.stats, w);
    if (!best || s > best.s) best = { m, s };
  }
  return best && best.s > 0.05 ? best : null;
}

function topModsFor(cat, key, w, n) {
  return (DATA.mods || [])
    .filter(m => (m.fits[cat] || []).includes(key) && srcAllowed(m.src))
    .map(m => ({ m, s: wscore(m.stats, w) }))
    .filter(x => x.s > 0.05)
    .sort((a, b) => b.s - a.s)
    .slice(0, n);
}

function evalGear(scn) {
  const w = scnWeights(scn);
  const pick = (gid) => {
    const grp = DATA.gear.find(g => g.id === gid);
    if (!grp) return null;
    return grp.pieces.filter(p => srcAllowed(p.src))
      .map(p => ({ p, s: wscore(p.stats, w) }))
      .sort((a, b) => b.s - a.s || (b.p.dur || 0) - (a.p.dur || 0))[0] || null;
  };
  return { suit: pick("Undersuit"), pack: pick("Backpack") };
}

function bestAmmoFor(x) {
  const grp = x.ranged && DATA.ammoGroups[x.ranged.ammo];
  if (!grp) return null;
  const mult = x.ranged.mult || 1;
  return grp.ammo.map(a => ({ a, shot: Math.round(a.dmg * (a.pellets || 1) * mult) }))
    .sort((p, q) => q.shot - p.shot)[0] || null;
}

/* launchers and grenades are situational, not a walking-around primary */
const PRIMARY_CLS = new Set(["bow", "crossbow", "pistol", "smg", "rifle", "shotgun"]);

function evalWeapons(scn) {
  const ws = DATA.weapons.filter(x => srcAllowed(x.src));
  const ranged = ws.map(x => {
    const best = bestAmmoFor(x);
    if (!best) return null;
    // dps only means something for magazine weapons; single-shot launchers
    // and bows are paced by reload/draw, not rounds-per-minute
    const dps = x.ranged.cap > 1 && x.ranged.rpm
      ? Math.round(best.shot * x.ranged.rpm / 60) : null;
    return { x, best, shot: best.shot, dps };
  }).filter(Boolean);
  // no launcher/grenade pick: their table damage is the direct hit only,
  // not the explosion, so ranking them would mislead
  const bydmg = [...ranged].sort((a, b) => b.shot - a.shot);
  const primary = bydmg.find(r => PRIMARY_CLS.has(r.x.cls)) || bydmg[0] || null;
  const quiet = bydmg.find(r => ["bow", "crossbow"].includes(r.x.cls)) || null;
  const melee = ws.filter(x => x.melee).sort((a, b) => b.melee - a.melee)[0] || null;
  return { primary, quiet, melee };
}

function evalFood(scn) {
  if (!PROV) return null;
  // scenario weights only (no armor base weights), so the picks here agree
  // exactly with what the Provisions tool ranks for the same activity;
  // same scoring: normalized weights, duration-damped
  const w = scn.w;
  const sc = (c) => {
    let s = 0;
    for (const [sid, wt] of Object.entries(w)) {
      const v = c.buff.stats[sid];
      if (v !== undefined) s += wt * (v / (PROV.stats[sid]?.max || 1));
    }
    return s * (0.5 + 0.5 * Math.min(c.buff.dur || 0, 1800) / 1800);
  };
  const rank = (match, n) => PROV.consumables.filter(match)
    .map(c => ({ c, s: sc(c) })).filter(x => x.s > 0.05)
    .sort((a, b) => b.s - a.s).slice(0, n);
  return { foods: rank(c => c.slots > 0, 3), tonics: rank(c => c.slots === 0, 2) };
}

function evalMount(scn) {
  if (!STAB || !scn.mounts) return null;
  const rides = STAB.creatures.filter(c => c.rideable && c.saddles && c.saddles.length && c.temp);
  let list;
  if (scn.mounts === "cold") list = rides.filter(c => c.temp.min <= -15).sort((a, b) => a.temp.min - b.temp.min);
  else if (scn.mounts === "hot") list = rides.filter(c => c.temp.max >= 35).sort((a, b) => b.temp.max - a.temp.max);
  else list = [...rides].sort((a, b) => (b.temp.max - b.temp.min) - (a.temp.max - a.temp.min));
  const top = list[0];
  if (!top) return null;
  const prefs = scn.mounts === "cold" ? ["Arctic"] :
    scn.mounts === "hot" ? ["Desert"] :
    scn.saddle === "armored" ? ["Armored"] : ["Explorer", "DeluxeLeather"];
  const saddleId = top.saddles.find(s => prefs.some(p => s.includes(p))) || top.saddles[0];
  const saddle = (STAB.saddleItems || {})[saddleId];
  return { c: top, saddle, alt: list[1] || null };
}

function topContribs(stats, w, n = 3) {
  return Object.entries(stats || {})
    .map(([sid, v]) => ({ sid, v, rel: (w[sid] || 0) * v / (NORMS[sid] || 1) }))
    .filter(x => x.rel > 0.01)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, n)
    .map(x => statLabel(x.sid, x.v));
}

/* ---------- wizard rendering ---------- */

function wizH(host, text) {
  const h = document.createElement("div");
  h.className = "wiz-h";
  h.textContent = text;
  host.appendChild(h);
}

function slotLine(host, label, item, extras) {
  const row = document.createElement("div");
  row.className = "wiz-slotline";
  const lbl = `<span class="wiz-slotlabel">${label}</span>`;
  const icon = item && item.icon ? itemIcon(item.icon).outerHTML : "";
  const name = item ? `<b>${item.name}</b>` : `<span class="wiz-alt">nothing worth slotting</span>`;
  row.innerHTML = `${lbl}${icon}${name} ${extras || ""}`;
  if (item && item.src === "craft") {
    const a = document.createElement("a");
    a.className = "pcost";
    a.style.marginLeft = "auto";
    a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(item.id)}`;
    a.textContent = "⛏ cost →";
    row.appendChild(a);
  }
  return host.appendChild(row), row;
}

function whyLine(host, contribs) {
  if (!contribs.length) return;
  const d = document.createElement("div");
  d.className = "wiz-why";
  d.textContent = "why: " + contribs.join(" · ");
  host.appendChild(d);
}

function card(host, title) {
  const el = document.createElement("div");
  el.className = "set-totals";
  if (title) el.innerHTML = `<div class="pname" style="margin-bottom:6px">${title}</div>`;
  host.appendChild(el);
  return el;
}

function renderWizard() {
  const host = $("#wiz-out");
  host.innerHTML = "";
  if (!wizScn) return;
  const scn = wizScn;
  const w = scnWeights(scn);
  updateURL({ scn: scn.id, gear: wizSrc === "all" ? null : wizSrc });

  const armor = evalArmor(scn);
  const gear = evalGear(scn);
  const weap = evalWeapons(scn);
  const food = evalFood(scn);
  const mount = evalMount(scn);

  // ----- the verdict -----
  const top = armor.fullRank[0];
  if (!top) {
    host.innerHTML = `<div class="wiz-verdict">Nothing matches this gear constraint - loosen it.</div>`;
    return;
  }
  const mixWins = !armor.pureMix && armor.mixedScore > top.s * 1.03;
  const delta = Math.abs(Math.round(100 * (armor.mixedScore - top.s) / (Math.abs(top.s) || 1)));
  const v = document.createElement("div");
  v.className = "wiz-verdict";
  const armorCall = mixWins
    ? `mix and match: <b>${armor.mixed.map(m => shortSetName(m.g)).filter((x, i, a) => a.indexOf(x) === i).join(" + ")}</b> pieces out-score the best full set by ~${delta}%${armor.mixedBonus ? ` and still keep the ${shortSetName(armor.mixedBonus)} set bonus` : ", at the price of every set bonus"}`
    : `wear the <b>full ${top.g.name}</b>${armor.pureMix ? " - slot-by-slot cherry-picking lands on the same set" : armor.mixedScore > top.s ? ` - the best mix edges it by under 3%, not worth losing the set bonus` : ` - it beats the best mix-and-match outright`}`;
  v.innerHTML = `${scn.emoji} <b>${scn.name}</b>${wizSrc !== "all" ? ` <span class="wiz-alt">(${wizSrc === "craft" ? "crafted gear only" : "no Great Hunt gear"})</span>` : ""}: ${armorCall}.
    ${weap.primary ? `Bring the <b>${weap.primary.x.name}</b> loaded with ${weap.primary.best.a.name}` : ""}${weap.melee ? `, a <b>${weap.melee.name}</b> on your back` : ""}${mount ? `, and ride a <b>${pretty(mount.c.name)}</b>` : ""}.`;
  host.appendChild(v);

  // ----- armor -----
  wizH(host, "🛡 Armor");
  const recommended = mixWins ? null : top.g;
  if (mixWins) {
    const c = card(host, "Recommended mix");
    for (const m of armor.mixed) {
      slotLine(c, SLOT_LABEL[m.p.slot], m.p,
        `<span class="wiz-alt">from ${shortSetName(m.g)}</span>`);
      const mod = bestModFor("armor", slotKey(m.p), w);
      if (mod) slotLine(c, "└ mod", null).innerHTML =
        `<span class="wiz-slotlabel">└ mod</span><span class="wiz-modpick">🔩 ${mod.m.name}</span> <span class="wiz-alt">${topContribs(mod.m.stats, w, 2).join(" · ")}</span>`;
    }
    whyLine(c, topContribs(Object.assign({}, ...armor.mixed.map(m => m.p.stats)), w, 4));
    const alt = card(host, `Runner-up: full ${top.g.name}`);
    alt.appendChild(statList(orderedTotals(top.tot)));
    const go = document.createElement("a");
    go.className = "pcost";
    go.href = "?tab=armor#set-" + top.g.id;
    go.onclick = (e) => { e.preventDefault(); gotoSetSec(top.g.id); };
    go.textContent = "🛡 see the set →";
    alt.appendChild(go);
  } else {
    const c = card(host, `${top.g.name} - full set`);
    if (top.g.bonus) c.innerHTML += bonusLine(top.g);
    for (const p of top.g.pieces.filter(p => WIZ_SLOTS.includes(slotKey(p)))) {
      slotLine(c, SLOT_LABEL[p.slot], p);
      const mod = bestModFor("armor", slotKey(p), w);
      if (mod) slotLine(c, "", null).innerHTML =
        `<span class="wiz-slotlabel">└ mod</span><span class="wiz-modpick">🔩 ${mod.m.name}</span> <span class="wiz-alt">${topContribs(mod.m.stats, w, 2).join(" · ")}</span>`;
    }
    whyLine(c, topContribs(top.tot, w, 4));
    const alts = armor.fullRank.slice(1, 3).map(r => `${r.g.name}`);
    if (alts.length) {
      const d = document.createElement("div");
      d.className = "wiz-alt";
      d.style.marginTop = "8px";
      d.textContent = "next best sets: " + alts.join(" · ");
      host.appendChild(d);
    }
  }

  // ----- envirosuit & backpack -----
  if (gear.suit || gear.pack) {
    wizH(host, "🧑‍🚀 Envirosuit & Backpack");
    const c = card(host, null);
    if (gear.suit) {
      slotLine(c, "envirosuit", gear.suit.p);
      whyLine(c, topContribs(gear.suit.p.stats, w, 3));
    }
    if (gear.pack) {
      slotLine(c, "backpack", gear.pack.p);
      whyLine(c, topContribs(gear.pack.p.stats, w, 3));
    }
  }

  // ----- weapons -----
  wizH(host, "⚔️ Weapons & Ammo");
  const wc = card(host, null);
  const wline = (label, r) => {
    if (!r) return;
    slotLine(wc, label, r.x,
      `<span class="wiz-alt">${r.shot} dmg/shot with</span> <b>${r.best.a.name}</b>${r.dps ? ` <span class="wiz-alt">(~${r.dps} dps)</span>` : ""}`);
    const fit = CLS_MOD_FIT[r.x.cls];
    const mod = fit && bestModFor("weapon", fit, { ...WEAPON_MOD_W, ...scn.w });
    if (mod) slotLine(wc, "", null).innerHTML =
      `<span class="wiz-slotlabel">└ mod</span><span class="wiz-modpick">🔩 ${mod.m.name}</span> <span class="wiz-alt">${topContribs(mod.m.stats, { ...WEAPON_MOD_W, ...scn.w }, 2).join(" · ")}</span>`;
  };
  wline("primary", weap.primary);
  if (scn.id === "hunting" && weap.quiet && weap.quiet !== weap.primary)
    wline("quiet pick", weap.quiet);
  if (weap.melee) {
    slotLine(wc, "melee", weap.melee, `<span class="wiz-alt">${weap.melee.melee} dmg per hit</span>`);
    const mod = bestModFor("weapon", "melee", { ...WEAPON_MOD_W, ...scn.w });
    if (mod) slotLine(wc, "", null).innerHTML =
      `<span class="wiz-slotlabel">└ mod</span><span class="wiz-modpick">🔩 ${mod.m.name}</span> <span class="wiz-alt">${topContribs(mod.m.stats, { ...WEAPON_MOD_W, ...scn.w }, 2).join(" · ")}</span>`;
  }

  // ----- tool mods -----
  const toolPicks = scn.tools.flatMap(tool =>
    topModsFor("tool", tool, w, 2).map(({ m }) => ({ tool, m })));
  if (toolPicks.length) {
    wizH(host, "⛏ Tool Mods");
    const tc = card(host, null);
    for (const { tool, m } of toolPicks) slotLine(tc, fitLabel(tool), m);
  }

  // ----- provisions -----
  if (food && (food.foods.length || food.tonics.length)) {
    wizH(host, "🥧 Provisions");
    const fc = card(host, null);
    const foodRel = ([sid, v]) =>
      Math.abs((scn.w[sid] || 0) * v / (PROV.stats[sid]?.max || 1));
    for (const { c } of food.foods) slotLine(fc, "stomach", c,
      `<span class="wiz-alt">${Object.entries(c.buff.stats)
        .sort((a, b) => foodRel(b) - foodRel(a))
        .slice(0, 2).map(([sid, v]) => statLabel(sid, v)).join(" · ")}</span>`);
    for (const { c } of food.tonics) slotLine(fc, "slot-free", c);
    const a = document.createElement("a");
    a.className = "pcost";
    a.href = `${PROVISIONS_BASE}?activity=${scn.prov}`;
    a.textContent = "🥧 full food ranking in Provisions →";
    fc.appendChild(a);
  }

  // ----- mount -----
  if (mount) {
    wizH(host, "🐎 Mount");
    const mc = card(host, null);
    slotLine(mc, "mount", { name: pretty(mount.c.name) },
      `<span class="wiz-alt">comfortable ${mount.c.temp.min}° to ${mount.c.temp.max}°</span>`);
    if (mount.saddle) slotLine(mc, "saddle", { name: mount.saddle.name });
    if (mount.alt) {
      const d = document.createElement("div");
      d.className = "wiz-alt";
      d.textContent = `backup: ${pretty(mount.alt.name)} (${mount.alt.temp.min}° to ${mount.alt.temp.max}°)`;
      mc.appendChild(d);
    }
    const a = document.createElement("a");
    a.className = "pcost";
    a.href = STABLES_BASE;
    a.textContent = "🐾 taming details in Stables →";
    mc.appendChild(a);
  } else if (scn.mounts && !STAB) {
    const d = document.createElement("div");
    d.className = "wiz-alt";
    d.textContent = "Mount picks need the Stables data - open this page from the toolkit site.";
    host.appendChild(d);
  }
}

function renderWizScenarios() {
  const host = $("#wiz-scenarios");
  host.innerHTML = "";
  for (const s of SCENARIOS) {
    const el = document.createElement("button");
    el.className = "act" + (wizScn === s ? " on" : "");
    el.dataset.id = s.id;
    el.innerHTML = `<span class="act-emoji">${s.emoji}</span>
      <span class="act-name">${s.name}</span><span class="act-blurb">${s.blurb}</span>`;
    el.onclick = () => {
      wizScn = s;
      $$("#wiz-scenarios .act").forEach(x => x.classList.toggle("on", x === el));
      renderWizard();
    };
    host.appendChild(el);
  }
}

function renderWizConstraints() {
  const host = $("#wiz-constraints");
  host.innerHTML = "";
  const lbl = document.createElement("span");
  lbl.className = "trip-label";
  lbl.textContent = "Gear I can get:";
  host.appendChild(lbl);
  const opts = [
    { id: "all", label: "🏆 Everything" },
    { id: "craftws", label: "⚒+🛰 Craft + workshop" },
    { id: "craft", label: "⚒ Crafted only" },
  ];
  for (const o of opts) {
    const b = document.createElement("button");
    b.className = "tchip" + (wizSrc === o.id ? " on" : "");
    b.textContent = o.label;
    b.onclick = () => {
      wizSrc = o.id;
      $$("#wiz-constraints .tchip").forEach(x => x.classList.toggle("on", x === b));
      renderWizard();
    };
    host.appendChild(b);
  }
}

/* ---------- tabs ---------- */

const TABS = ["armor", "weapons", "ammo", "mods", "loadout"];

function showTab(id) {
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === id));
  for (const sec of TABS) {
    $("#tab-" + sec).classList.toggle("hidden", sec !== id);
  }
  updateURL({ tab: id });
}

function gotoSetSec(id, pieceId) {
  showTab("armor");
  if (!expandedSets.has(id)) {
    expandedSets.add(id);
    renderSets();
  }
  requestAnimationFrame(() => {
    const sec = document.getElementById("set-" + id);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    if (pieceId) highlightCard("#set-list", pieceId);
  });
}

function gotoAmmoSec(gid) {
  showTab("ammo");
  requestAnimationFrame(() => {
    const sec = document.getElementById("ag-" + gid);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function highlightCard(hostSel, id) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`${hostSel} .pcard[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    $$(".pcard.hl").forEach(x => x.classList.remove("hl"));
    card.classList.add("hl");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/* ---------- unified search + reverse lookup ---------- */

const GROUPS = [
  { kind: "armor", label: "Armor" },
  { kind: "weapon", label: "Weapons" },
  { kind: "ammo", label: "Ammo" },
  { kind: "mod", label: "Mods" },
];

function searchIndex() {
  const ix = [];
  for (const g of allGroups()) {
    for (const p of g.pieces) ix.push({ kind: "armor", id: p.id, name: p.name, ref: p, group: g });
  }
  for (const w of DATA.weapons) ix.push({ kind: "weapon", id: w.id, name: w.name, ref: w });
  for (const [gid, g] of Object.entries(DATA.ammoGroups)) {
    for (const a of g.ammo) ix.push({ kind: "ammo", id: a.id, name: a.name, ref: a, gid });
  }
  for (const m of DATA.mods || []) ix.push({ kind: "mod", id: m.id, name: m.name, ref: m });
  return ix;
}

function revRow(emoji, name, note, onclick) {
  const row = document.createElement("button");
  row.className = "rev-row";
  row.innerHTML = `<span class="act-emoji">${emoji}</span>
    <span class="rev-name">${name}</span>
    <span class="rev-rank">${note}</span>`;
  row.onclick = onclick;
  return row;
}

function revTitle(host, text) {
  const t = document.createElement("div");
  t.className = "rev-title";
  t.textContent = text;
  host.appendChild(t);
}

function revHead(host, iconEl, metaHTML) {
  const head = document.createElement("div");
  head.className = "rev-head";
  head.appendChild(iconEl);
  const meta = document.createElement("div");
  meta.innerHTML = metaHTML;
  head.appendChild(meta);
  const close = document.createElement("button");
  close.className = "rev-close";
  close.textContent = "✕";
  close.onclick = () => {
    host.classList.add("hidden");
    $("#asearch").value = "";
    updateURL({ q: null });
  };
  head.appendChild(close);
  host.appendChild(head);
  return meta;
}

function renderReverse(m) {
  const host = $("#areverse");
  host.innerHTML = "";
  host.classList.remove("hidden");

  if (m.kind === "armor") {
    const p = m.ref, g = m.group;
    const meta = revHead(host, itemIcon(p.icon), `<div class="pname">${p.name}</div>
      <div class="psub"><span class="bench slot">${SLOT_EMOJI[p.slot] || ""} ${SLOT_LABEL[p.slot] || p.slot}</span> ${srcBadge(p)}</div>
      ${p.desc ? `<div class="rev-stats">${p.desc}</div>` : ""}`);
    meta.appendChild(statList(p.stats));
    const a = costLink(p);
    if (a) meta.appendChild(a);
    revTitle(host, g.kind === "set" ? "Part of" : "Group");
    host.appendChild(revRow("🛡", g.name,
      g.bonus ? `set bonus at ${g.bonus.need} pieces` : `${g.pieces.length} pieces`,
      () => gotoSetSec(g.id, p.id)));
    return;
  }

  if (m.kind === "weapon") {
    const w = m.ref;
    const meta = revHead(host, itemIcon(w.icon), `<div class="pname">${w.name}</div>
      <div class="psub"><span class="bench slot">${clsLabel(w.cls)}</span> ${srcBadge(w)}</div>
      ${w.desc ? `<div class="rev-stats">${w.desc}</div>` : ""}`);
    const ul = document.createElement("ul");
    ul.className = "pstats";
    if (w.melee) ul.innerHTML += `<li class="good">⚔️ ${w.melee} melee damage</li>`;
    if (w.thrown) ul.innerHTML += `<li class="good">🎯 ${w.thrown} thrown damage</li>`;
    const r = rangedDamage(w);
    if (r) ul.innerHTML += `<li class="good">🏹 ${r.min === r.max ? r.min : r.min + "-" + r.max} per shot, by ammo</li>`;
    meta.appendChild(ul);
    if (w.stats) meta.appendChild(statList(w.stats));
    const a = costLink(w);
    if (a) meta.appendChild(a);
    revTitle(host, "Jump to");
    host.appendChild(revRow(clsLabel(w.cls).split(" ")[0], "Weapon card", "Weapons tab", () => {
      showTab("weapons");
      if (weaponFilter !== "all" && weaponFilter !== w.cls) {
        weaponFilter = "all";
        renderWeaponFilters();
        renderWeapons();
      }
      highlightCard("#weapon-cards", w.id);
    }));
    const grp = w.ranged && DATA.ammoGroups[w.ranged.ammo];
    if (grp) {
      host.appendChild(revRow("🏹", "Ammo it fires",
        `${grp.ammo.length} option${grp.ammo.length > 1 ? "s" : ""} in the Ammo tab`,
        () => gotoAmmoSec(w.ranged.ammo)));
    }
    return;
  }

  if (m.kind === "mod") {
    const mod = m.ref;
    const meta = revHead(host, itemIcon(mod.icon), `<div class="pname">${mod.name}</div>
      <div class="psub">${rankBadge(mod)} ${srcBadge(mod)}</div>
      ${mod.desc ? `<div class="rev-stats">${mod.desc}</div>` : ""}`);
    meta.appendChild(statList(mod.stats));
    const c = costLink(mod);
    if (c) meta.appendChild(c);
    revTitle(host, "Fits");
    const fits = Object.values(mod.fits).flat().map(fitLabel).join(" · ");
    host.appendChild(revRow("🔩", fits, "Mods tab", () => gotoModCard(mod)));
    return;
  }

  // ammo
  const a = m.ref;
  const meta = revHead(host, itemIcon(a.icon), `<div class="pname">${a.name}</div>
    <div class="psub">${srcBadge(a)}</div>
    ${a.desc ? `<div class="rev-stats">${a.desc}</div>` : ""}`);
  const ul = document.createElement("ul");
  ul.className = "pstats";
  ul.innerHTML += `<li class="good">💥 ${a.pellets ? `${a.dmg} × ${a.pellets} projectiles` : `${a.dmg} damage`}</li>`;
  if (a.break > 0) ul.innerHTML += `<li>🎲 ${a.break}% break chance</li>`;
  meta.appendChild(ul);
  const c = costLink(a);
  if (c) meta.appendChild(c);
  const users = DATA.weapons.filter(w => w.ranged && w.ranged.ammo === m.gid);
  revTitle(host, "Fired by");
  if (!users.length) {
    const d = document.createElement("div");
    d.className = "pnone";
    d.textContent = "No obtainable weapon fires this.";
    host.appendChild(d);
  }
  for (const w of users) {
    host.appendChild(revRow(clsLabel(w.cls).split(" ")[0], w.name, "Weapons tab", () => {
      showTab("weapons");
      if (weaponFilter !== "all" && weaponFilter !== w.cls) {
        weaponFilter = "all";
        renderWeaponFilters();
        renderWeapons();
      }
      highlightCard("#weapon-cards", w.id);
    }));
  }
}

function initSearch() {
  const input = $("#asearch"), results = $("#aresults");
  const index = searchIndex();
  let matches = [], sel = -1;

  const pick = (i) => {
    const m = matches[i];
    if (!m) return;
    input.value = m.name;
    results.classList.add("hidden");
    renderReverse(m);
    updateURL({ q: m.id });
  };

  const resultEl = (m, i) => {
    const el = document.createElement("div");
    el.className = "result";
    if (m.ref.icon) el.appendChild(itemIcon(m.ref.icon));
    const nm = document.createElement("span");
    nm.className = "rname"; nm.textContent = m.name;
    const cat = document.createElement("span");
    cat.className = "rcat";
    cat.textContent = m.kind === "armor" ? (SLOT_LABEL[m.ref.slot] || "armor") : m.kind;
    el.append(nm, cat);
    el.onclick = () => pick(i);
    return el;
  };

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.add("hidden"); return; }
    const byStart = (a, b) => {
      const as = a.name.toLowerCase().startsWith(q), bs = b.name.toLowerCase().startsWith(q);
      if (as !== bs) return as ? -1 : 1;
      return a.name.length - b.name.length;
    };
    matches = [];
    results.innerHTML = "";
    for (const g of GROUPS) {
      const hits = index.filter(m => m.kind === g.kind && m.name.toLowerCase().includes(q))
        .sort(byStart).slice(0, 5);
      if (!hits.length) continue;
      const lbl = document.createElement("div");
      lbl.className = "rgroup";
      lbl.textContent = g.label;
      results.appendChild(lbl);
      for (const m of hits) {
        results.appendChild(resultEl(m, matches.length));
        matches.push(m);
      }
    }
    sel = -1;
    results.classList.toggle("hidden", !matches.length);
  });

  const paint = () => results.querySelectorAll(".result").forEach((el, i) =>
    el.classList.toggle("sel", i === sel));
  input.addEventListener("keydown", (e) => {
    if (results.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, matches.length - 1); paint(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
    else if (e.key === "Enter") pick(sel >= 0 ? sel : 0);
    else if (e.key === "Escape") results.classList.add("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#asearchwrap")) results.classList.add("hidden");
  });

  // restore ?q=<id>
  const qid = new URLSearchParams(location.search).get("q");
  if (qid) {
    const m = index.find(x => x.id === qid);
    if (m) { input.value = m.name; renderReverse(m); }
  }
}

function init() {
  buildNorms();
  renderSetJump();
  renderSets();
  renderWeaponFilters();
  renderWeapons();
  renderAmmoJump();
  renderAmmo();
  renderModFilters();
  renderMods();
  renderWizScenarios();
  renderWizConstraints();
  $$(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
  $$("#afilters .tchip[data-f]").forEach(ch => ch.onclick = () => {
    armorFilter = ch.dataset.f;
    $$("#afilters .tchip[data-f]").forEach(x =>
      x.classList.toggle("on", x.dataset.f === armorFilter));
    renderSetJump();
    renderSets();
  });
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  if (tab && TABS.includes(tab)) showTab(tab);
  const gearOpt = params.get("gear");
  if (["craft", "craftws"].includes(gearOpt)) {
    wizSrc = gearOpt;
    renderWizConstraints();
  }
  const scn = SCENARIOS.find(s => s.id === params.get("scn"));
  if (scn) {
    wizScn = scn;
    renderWizScenarios();
    renderWizard();
  }
  initSearch();
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView();
  }
}

const topBtn = $("#totop");
topBtn.onclick = scrollTop;
window.addEventListener("scroll", () => {
  topBtn.classList.toggle("hidden", window.scrollY < 400);
}, { passive: true });

loadData().then(init);

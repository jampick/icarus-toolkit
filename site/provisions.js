/* Icarus Provisions — activity-based food buff picker */
"use strict";

// Overridden at dist-build time; dev serves everything from site/
const ICON_BASE = window.ICON_BASE || "icons/";
const BREAKDOWN_BASE = window.BREAKDOWN_BASE || "index.html";

const ACTIVITIES = [
  { id: "mining", name: "Mining Run", emoji: "⛏️",
    blurb: "Ore yield and the stamina to keep swinging.",
    w: { "BaseMiningRewards_+%": 3, "BaseVoxelChanceToHarvestSecondaryResource_%": 2.5,
         "BaseToolStaminaActionCost_+%": -2, "BaseMaximumStamina_+": 1,
         "BaseStaminaRegen_+%": 1, "BaseStaminaActionCost_+%": -1 } },
  { id: "hunting", name: "Hunting", emoji: "🏹",
    blurb: "Hit harder at range, spook less, harvest more meat.",
    w: { "BaseProjectileDamage_+%": 3, "BaseMeatHarvestedFromAnimals_+%": 2.5,
         "BaseAnimalThreatModifier_+%": -2, "BaseReloadSpeed_+%": 1.5,
         "BaseChargeSpeed_+%": 1.5, "BaseCriticalDamage_+%": 1.5,
         "BaseMovementSpeed_+%": 1, "BaseSprintSpeed_+%": 1,
         "BaseKnifeProjectileSpeed_+%": .5, "BaseSpearProjectileSpeed_+%": .5 } },
  { id: "combat", name: "Combat / Boss", emoji: "⚔️",
    blurb: "Damage, health and resistances for a stand-up fight.",
    w: { "BaseMeleeDamage_+%": 2.5, "BaseProjectileDamage_+%": 2.5,
         "BaseMaximumHealth_+": 2, "BaseHealthRegen_+%": 2,
         "BaseMeleeDamageResistance_%": 2, "BaseProjectileDamageResistance_+%": 2,
         "BasePhysicalDamageResistance_%": 2, "BaseAttackSpeed_+%": 1.5,
         "BaseCriticalDamage_+%": 1.5, "BaseDamageReturned_%": 1,
         "BaseChanceToReturnDamage_%": 1, "BaseWoundResistance_%": 1,
         "BaseMaximumStamina_+": .5 } },
  { id: "arctic", name: "Arctic Trip", emoji: "❄️",
    blurb: "Stay warm, shrug off frostbite and pneumonia.",
    w: { "BaseColdResistance_%": 3, "BaseHypothermiaResistance_%": 2.5,
         "BaseFrostDamageResistance_%": 2, "BaseInternalTemperatureModification_+": 2,
         "BaseWarmupDegreePerMinute_+": 1.5, "BaseExposureResistance_+%": 2,
         "BasePneumoniaResistance_%": 1.5 } },
  { id: "desert", name: "Desert", emoji: "🏜️",
    blurb: "Beat the heat, stretch your water.",
    w: { "BaseHeatResistance_%": 3, "BaseHyperthermiaResistance_%": 2.5,
         "BaseWaterConsumption_+%": -2.5, "BaseExposureResistance_+%": 2,
         "BaseCooldownDegreePerMinute_+": 1.5, "BaseFoodConsumption_+%": -1 } },
  { id: "volcanic", name: "Volcanic", emoji: "🌋",
    blurb: "Fire and lava resistance for the caldera.",
    w: { "BaseFireDamageResistance_%": 3, "BaseFireDamageResistanceWhileInLava_%": 2,
         "BaseHeatResistance_%": 2.5, "BaseHyperthermiaResistance_%": 2,
         "BaseExposureResistance_+%": 2, "BaseCooldownDegreePerMinute_+": 1.5 } },
  { id: "caves", name: "Cave Diving", emoji: "🕳️",
    blurb: "Oxygen efficiency and surviving the drops.",
    w: { "BaseOxygenConsumption_+%": -3, "BaseMaximumOxygen_+%": 2.5,
         "BaseFallDamageResistance_%": 2, "BaseExposureResistance_+%": 1.5,
         "BasePneumoniaResistance_%": 1, "BasePoisonModifierDuration_+%": -1,
         "BaseMaximumStamina_+": .5 } },
  { id: "travel", name: "Expedition", emoji: "🥾",
    blurb: "Move fast, eat light, buffs that last.",
    w: { "BaseMovementSpeed_+%": 3, "BaseSprintSpeed_+%": 2.5,
         "BaseStaminaRegen_+%": 2, "BaseMaximumStamina_+": 1.5,
         "BaseFoodConsumption_+%": -2, "BaseWaterConsumption_+%": -2,
         "BaseFoodModifierDuration_+%": 1.5 } },
  { id: "building", name: "Building & Crafting", emoji: "🔨",
    blurb: "Craft faster, work longer.",
    w: { "BaseCraftingSpeed_+%": 3, "BaseMaximumStamina_+": 1.5,
         "BaseStaminaRegen_+%": 1.5, "BaseStaminaActionCost_+%": -1.5,
         "BaseFoodConsumption_+%": -1, "BaseExperience_+%": 1 } },
  { id: "farming", name: "Farming & Foraging", emoji: "🌾",
    blurb: "Bigger harvests from plants and picking.",
    w: { "BaseForagingHarvestingRewards_+%": 3, "BaseFoodConsumption_+%": -1,
         "BaseMaximumStamina_+": 1, "BaseStaminaRegen_+%": 1, "BaseExperience_+%": 1 } },
  { id: "taming", name: "Taming & Mounts", emoji: "🐎",
    blurb: "Tame faster, level your creatures.",
    w: { "GrantedAuraTamingSpeed_?": 3, "BaseTamedCreatureExperience_+%": 2.5,
         "BaseAnimalThreatModifier_+%": -2 } },
  { id: "xp", name: "XP Farming", emoji: "📈",
    blurb: "Level yourself (and friends) faster.",
    w: { "BaseExperience_+%": 3, "BaseSharedExperience_+%": 2,
         "BaseTamedCreatureExperience_+%": 1 } },
];

const TRIPS = [
  { label: "Off", min: null },
  { label: "30 min", min: 30 },
  { label: "1 h", min: 60 },
  { label: "2 h", min: 120 },
  { label: "3 h", min: 180 },
];

let DATA = null;
let active = null;
let tripMin = null; // minutes; null = trip planning off
const $ = (s) => document.querySelector(s);

function updateURL(kv) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(kv)) {
    if (v === null || v === undefined) p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  history.replaceState({}, "", q ? "?" + q : location.pathname);
}

async function loadData() {
  const inline = document.getElementById("provisions-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/provisions.json")).json();
}

function statLabel(sid, v) {
  const meta = DATA.stats[sid] || { tpl: sid };
  const pct = meta.tpl.includes("{0}%") || sid.includes("%");
  const text = meta.tpl.replace(/[+\-]?\{0\}%?/, "").trim() || sid;
  return `${v > 0 ? "+" : ""}${v}${pct ? "%" : ""} ${text}`;
}

// Longer buffs are worth more: scale gently with duration, capped at 30 min.
// dur=0 (instant meds) lands on the 0.5 floor with no special-casing.
function durFactor(dur) {
  return 0.5 + 0.5 * Math.min(dur || 0, 1800) / 1800;
}

// How many of an item you need to keep its buff up for a whole trip.
function packCount(tripMinutes, dur) {
  return Math.ceil(tripMinutes * 60 / dur);
}

// Mild ranking penalty for having to re-eat mid-trip; 1 when a single serving lasts.
function packPenalty(n) {
  return 1 / (1 + 0.1 * (n - 1));
}

function score(item, weights) {
  let s = 0;
  for (const [sid, w] of Object.entries(weights)) {
    const v = item.buff.stats[sid];
    if (v === undefined) continue;
    s += w * (v / (DATA.stats[sid]?.max || 1));
  }
  return s * durFactor(item.buff.dur);
}

function fmtDur(sec) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
}

function card(item, weights, maxScore, sc) {
  const el = document.createElement("div");
  el.className = "pcard";
  el.dataset.id = item.id;

  const head = document.createElement("div");
  head.className = "pcard-head";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = ICON_BASE + item.icon + ".png";
  img.onerror = () => img.remove();
  head.appendChild(img);
  const ttl = document.createElement("div");
  const pack = tripMin === null ? "" :
    item.buff.dur > 0
      ? `<span class="packbadge">🎒 ×${packCount(tripMin, item.buff.dur)}</span>`
      : '<span class="packbadge">as needed</span>';
  ttl.innerHTML = `<div class="pname">${item.name}</div>
    <div class="psub">${item.buff.dur ? "⏱ " + fmtDur(item.buff.dur) : ""}
      ${item.craft ? `<span class="bench">${item.craft[0]}</span>` : '<span class="gathertag">GATHER</span>'}
      ${pack}
    </div>`;
  head.appendChild(ttl);
  el.appendChild(head);

  const bar = document.createElement("div");
  bar.className = "pscore";
  bar.innerHTML = `<i style="width:${Math.max(4, 100 * sc / maxScore)}%"></i>`;
  el.appendChild(bar);

  const list = document.createElement("ul");
  list.className = "pstats";
  const entries = Object.entries(item.buff.stats)
    .map(([sid, v]) => ({ sid, v, w: weights[sid] || 0, rel: (weights[sid] || 0) * v }))
    .sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel) || Math.abs(b.v) - Math.abs(a.v));
  for (const e of entries) {
    const li = document.createElement("li");
    li.textContent = statLabel(e.sid, e.v);
    if (e.rel > 0) li.className = "good";
    else if (e.rel < 0) li.className = "bad";
    list.appendChild(li);
  }
  el.appendChild(list);

  if (item.craft) {
    const a = document.createElement("a");
    a.className = "pcost";
    a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(item.id)}`;
    a.textContent = "⛏ what it costs →";
    el.appendChild(a);
  }
  return el;
}

function renderActivity(act) {
  active = act;
  document.querySelectorAll(".act").forEach(el =>
    el.classList.toggle("on", el.dataset.id === act.id));
  $("#prov-results").classList.remove("hidden");

  const SECTIONS = [
    // stomach-slot foods are the main loadout; slot-free buffs stack on top
    { sel: "#food-cards", n: 9, match: c => c.slots > 0 },
    { sel: "#noslot-cards", n: 6, match: c => c.slots === 0 },
  ];
  for (const { sel, n, match } of SECTIONS) {
    const host = $(sel);
    host.innerHTML = "";
    const ranked = DATA.consumables
      .filter(match)
      .map(c => {
        let s = score(c, act.w);
        if (tripMin !== null && c.buff.dur > 0)
          s *= packPenalty(packCount(tripMin, c.buff.dur));
        return { c, s };
      })
      .filter(x => x.s > 0.05)
      .sort((a, b) => b.s - a.s)
      .slice(0, n);
    const maxScore = ranked[0]?.s || 1;
    ranked.forEach(x => host.appendChild(card(x.c, act.w, maxScore, x.s)));
    if (!ranked.length) {
      const d = document.createElement("div");
      d.className = "pnone";
      d.textContent = "Nothing in the data gives a meaningful edge here.";
      host.appendChild(d);
    }
    host.closest("section").style.display = ranked.length ? "" : "none";
  }
  updateURL({ activity: act.id, trip: tripMin });
}

/* ---------- trip-length selector ---------- */

function paintTrip() {
  document.querySelectorAll(".tchip").forEach(el =>
    el.classList.toggle("on", el.dataset.min === String(tripMin ?? "")));
}

function setTrip(min) {
  tripMin = min;
  paintTrip();
  updateURL({ trip: tripMin });
  if (active) renderActivity(active);
}

function initTripBar() {
  const host = $("#tripbar");
  const lbl = document.createElement("span");
  lbl.className = "trip-label";
  lbl.textContent = "Trip length:";
  host.appendChild(lbl);
  for (const t of TRIPS) {
    const b = document.createElement("button");
    b.className = "tchip";
    b.dataset.min = t.min ?? "";
    b.textContent = t.label;
    b.onclick = () => setTrip(t.min);
    host.appendChild(b);
  }
  paintTrip();
}

/* ---------- reverse lookup: item -> best activities ---------- */

function bestActivities(item) {
  // rank the item within each activity against its own peer group
  // (slot foods compete with slot foods, slot-free with slot-free)
  const peers = DATA.consumables.filter(c =>
    item.slots > 0 ? c.slots > 0 : c.slots === 0);
  return ACTIVITIES.map(a => {
    const ranked = peers
      .map(c => ({ id: c.id, s: score(c, a.w) }))
      .filter(x => x.s > 0.05)
      .sort((x, y) => y.s - x.s);
    const idx = ranked.findIndex(x => x.id === item.id);
    if (idx < 0) return null;
    return { a, rank: idx + 1, of: ranked.length, pct: ranked[idx].s / ranked[0].s };
  }).filter(Boolean)
    .filter(x => x.pct >= 0.2)
    .sort((x, y) => y.pct - x.pct || x.rank - y.rank)
    .slice(0, 4);
}

function renderReverse(item) {
  const host = $("#reverse");
  host.innerHTML = "";
  host.classList.remove("hidden");

  const head = document.createElement("div");
  head.className = "rev-head";
  const img = document.createElement("img");
  img.src = ICON_BASE + item.icon + ".png";
  img.onerror = () => img.remove();
  head.appendChild(img);
  const meta = document.createElement("div");
  meta.innerHTML = `<div class="pname">${item.name}</div>
    <div class="psub">${item.buff.dur ? "⏱ " + fmtDur(item.buff.dur) : ""}
      ${item.slots > 0 ? '<span class="bench">stomach slot</span>' : '<span class="bench">no slot</span>'}
      ${item.craft ? `<span class="bench">${item.craft[0]}</span>` : '<span class="gathertag">GATHER</span>'}
    </div>
    <div class="rev-stats">${Object.entries(item.buff.stats).map(([s, v]) => statLabel(s, v)).join(" · ")}</div>`;
  head.appendChild(meta);
  const close = document.createElement("button");
  close.className = "rev-close";
  close.textContent = "✕";
  close.onclick = () => { host.classList.add("hidden"); $("#psearch").value = ""; };
  head.appendChild(close);
  host.appendChild(head);

  const best = bestActivities(item);
  if (!best.length) {
    const d = document.createElement("div");
    d.className = "pnone";
    d.textContent = "No activity particularly favors this item's buffs.";
    host.appendChild(d);
    return;
  }
  const title = document.createElement("div");
  title.className = "rev-title";
  title.textContent = "Best for";
  host.appendChild(title);
  for (const b of best) {
    const row = document.createElement("button");
    row.className = "rev-row";
    row.innerHTML = `<span class="act-emoji">${b.a.emoji}</span>
      <span class="rev-name">${b.a.name}</span>
      <span class="rev-rank">#${b.rank} pick · ${Math.round(b.pct * 100)}% of top</span>
      <span class="rev-bar"><i style="width:${Math.round(b.pct * 100)}%"></i></span>`;
    row.onclick = () => {
      renderActivity(b.a);
      requestAnimationFrame(() => {
        const card = document.querySelector(`.pcard[data-id="${item.id}"]`);
        if (card) { card.classList.add("hl"); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
      });
    };
    host.appendChild(row);
  }
}

/* ---------- reverse search box ---------- */

function initReverseSearch() {
  const input = $("#psearch"), results = $("#presults");
  let matches = [], sel = -1;
  const pick = (i) => {
    const m = matches[i];
    if (!m) return;
    input.value = m.name;
    results.classList.add("hidden");
    renderReverse(m);
    history.replaceState({}, "", "?food=" + encodeURIComponent(m.id));
  };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.add("hidden"); return; }
    matches = DATA.consumables
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q), bs = b.name.toLowerCase().startsWith(q);
        if (as !== bs) return as ? -1 : 1;
        return a.name.length - b.name.length;
      })
      .slice(0, 10);
    sel = -1;
    results.innerHTML = "";
    matches.forEach((m, i) => {
      const el = document.createElement("div");
      el.className = "result";
      const img = document.createElement("img");
      img.src = ICON_BASE + m.icon + ".png";
      img.onerror = () => img.remove();
      el.appendChild(img);
      const nm = document.createElement("span");
      nm.className = "rname"; nm.textContent = m.name;
      const cat = document.createElement("span");
      cat.className = "rcat"; cat.textContent = m.slots > 0 ? "food" : "no slot";
      el.append(nm, cat);
      el.onclick = () => pick(i);
      results.appendChild(el);
    });
    results.classList.toggle("hidden", !matches.length);
  });
  input.addEventListener("keydown", (e) => {
    if (results.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, matches.length - 1); paint(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
    else if (e.key === "Enter") pick(sel >= 0 ? sel : 0);
    else if (e.key === "Escape") results.classList.add("hidden");
  });
  const paint = () => results.querySelectorAll(".result").forEach((el, i) =>
    el.classList.toggle("sel", i === sel));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#psearchwrap")) results.classList.add("hidden");
  });
}

function init() {
  const host = $("#activities");
  for (const a of ACTIVITIES) {
    const el = document.createElement("button");
    el.className = "act";
    el.dataset.id = a.id;
    el.innerHTML = `<span class="act-emoji">${a.emoji}</span>
      <span class="act-name">${a.name}</span><span class="act-blurb">${a.blurb}</span>`;
    el.onclick = () => renderActivity(a);
    host.appendChild(el);
  }
  initTripBar();
  initReverseSearch();
  const params = new URLSearchParams(location.search);
  const trip = parseInt(params.get("trip"), 10);
  if (TRIPS.some(t => t.min === trip)) { tripMin = trip; paintTrip(); }
  const start = ACTIVITIES.find(a => a.id === params.get("activity"));
  if (start) renderActivity(start);
  const food = DATA.consumables.find(c => c.id === params.get("food"));
  if (food) { $("#psearch").value = food.name; renderReverse(food); }
}

loadData().then(init);

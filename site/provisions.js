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
  { id: "volcanic", name: "Volcanic / Heat", emoji: "🌋",
    blurb: "Heat and fire resistance for lava country.",
    w: { "BaseHeatResistance_%": 3, "BaseHyperthermiaResistance_%": 2.5,
         "BaseFireDamageResistance_%": 2, "BaseFireDamageResistanceWhileInLava_%": 1.5,
         "BaseExposureResistance_+%": 2, "BaseCooldownDegreePerMinute_+": 1.5,
         "BaseWaterConsumption_+%": -1.5 } },
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

let DATA = null;
let active = null;
const $ = (s) => document.querySelector(s);

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

function score(item, weights) {
  let s = 0;
  for (const [sid, w] of Object.entries(weights)) {
    const v = item.buff.stats[sid];
    if (v === undefined) continue;
    s += w * (v / (DATA.stats[sid]?.max || 1));
  }
  return s;
}

function fmtDur(sec) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
}

function card(item, weights, maxScore, sc) {
  const el = document.createElement("div");
  el.className = "pcard";

  const head = document.createElement("div");
  head.className = "pcard-head";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = ICON_BASE + item.icon + ".png";
  img.onerror = () => img.remove();
  head.appendChild(img);
  const ttl = document.createElement("div");
  ttl.innerHTML = `<div class="pname">${item.name}</div>
    <div class="psub">${item.buff.dur ? "⏱ " + fmtDur(item.buff.dur) : ""}
      ${item.craft ? `<span class="bench">${item.craft[0]}</span>` : '<span class="gathertag">GATHER</span>'}
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

  for (const [cat, sel, n] of [["food", "#food-cards", 9], ["tonic", "#tonic-cards", 4]]) {
    const host = $(sel);
    host.innerHTML = "";
    const ranked = DATA.consumables
      .filter(c => c.slots > 0)  // scope: only items that occupy a stomach slot
      .filter(c => c.cat === cat)
      .map(c => ({ c, s: score(c, act.w) }))
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
  history.replaceState({}, "", "?activity=" + act.id);
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
  const param = new URLSearchParams(location.search).get("activity");
  const start = ACTIVITIES.find(a => a.id === param);
  if (start) renderActivity(start);
}

loadData().then(init);

#!/usr/bin/env node
/* Smoke tests for the vanilla-JS apps. No dependencies.
   - syntax-checks site/app.js and site/provisions.js
   - reimplements the recipe-tree build (with visited-ancestor guard) and
     the provisions scoring logic against the real generated data. */
"use strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let checks = 0;
const failures = [];
function check(cond, msg) {
  checks++;
  if (cond) console.log(`  ok: ${msg}`);
  else { console.log(`  FAIL: ${msg}`); failures.push(msg); }
}

/* ---------- 1. syntax check both JS files ---------- */
console.log("== node --check ==");
for (const f of ["site/app.js", "site/provisions.js", "site/stables.js", "site/atlas.js"]) {
  try {
    execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" });
    check(true, `${f} parses`);
  } catch (e) {
    check(false, `${f} parses: ${e.stderr}`);
  }
}

/* ---------- 2. recipe-tree smoke test ---------- */
console.log("== recipe tree (Solar_Panel x1) ==");
const DATA = JSON.parse(readFileSync(join(ROOT, "site/data/recipes.json"), "utf8"));

function recipesFor(id) {
  const idxs = DATA.byOutput[id] || [];
  return idxs.map(i => DATA.recipes[i])
    .sort((a, b) => (a.conv === b.conv) ? 0 : a.conv ? 1 : -1);
}
function outCount(rec, id) {
  const o = rec.outputs.find(([oid]) => oid === id);
  return o ? o[1] : 1;
}
function buildTree(id, needed, ancestors) {
  const item = DATA.items[id];
  const recs = recipesFor(id);
  const cyclic = ancestors.has(id);
  const mode = (item.raw || !recs.length || cyclic) ? "gather" : "craft";
  const node = { id, needed, mode, children: [] };
  if (mode === "craft") {
    const rec = recs[0];
    const crafts = Math.ceil(needed / outCount(rec, id));
    const nextAnc = new Set(ancestors); nextAnc.add(id);
    for (const [iid, cnt] of rec.inputs)
      node.children.push(buildTree(iid, crafts * cnt, nextAnc));
  }
  return node;
}
function countNodes(n) { return 1 + n.children.reduce((s, c) => s + countNodes(c), 0); }
function collectTotals(n, totals) {
  if (n.mode === "gather") totals.set(n.id, (totals.get(n.id) || 0) + n.needed);
  else n.children.forEach(c => collectTotals(c, totals));
}

let tree = null;
try {
  tree = buildTree("Solar_Panel", 1, new Set());
  check(true, "tree build terminates (ancestor guard)");
} catch (e) {
  check(false, `tree build terminates: ${e.message}`);
}
if (tree) {
  const n = countNodes(tree);
  check(n > 10, `tree has ${n} nodes (> 10)`);
  const totals = new Map();
  collectTotals(tree, totals);
  check(totals.size > 0, `aggregated ${totals.size} leaf totals`);
  let allGood = true;
  for (const [id, qty] of totals) {
    const c = Math.ceil(qty);
    if (!(Number.isFinite(c) && Number.isInteger(c) && c > 0)) {
      allGood = false;
      check(false, `leaf total for ${id} is a positive finite integer (got ${qty})`);
    }
  }
  if (allGood) check(true, "all leaf totals are positive finite integers when ceiled");
}

/* ---------- 3. provisions scoring smoke test ---------- */
console.log("== provisions scoring ==");
const PROV = JSON.parse(readFileSync(join(ROOT, "site/data/provisions.json"), "utf8"));
// Full stat vocabulary from the game data - the provisions stats meta only
// contains stats that appear on some consumable, but activity weights may
// legitimately reference stats no consumable currently grants. A weight key
// in NEITHER set is a typo.
const STAT_NAMES = new Set(
  JSON.parse(readFileSync(join(ROOT, "data/game/D_Stats.json"), "utf8"))
    .Rows.map(r => r.Name));
const src = readFileSync(join(ROOT, "site/provisions.js"), "utf8");
const m = src.match(/const ACTIVITIES = (\[[\s\S]*?\n\]);/);
check(!!m, "ACTIVITIES array extracted from provisions.js");
if (m) {
  const ACTIVITIES = eval(m[1]);
  check(Array.isArray(ACTIVITIES) && ACTIVITIES.length > 0,
    `ACTIVITIES has ${ACTIVITIES.length} entries`);

  // Mirrors of the pure scoring helpers in site/provisions.js (which is
  // DOM-bound and can't be imported directly).
  function durFactor(dur) {
    return 0.5 + 0.5 * Math.min(dur || 0, 1800) / 1800;
  }
  function packCount(tripMinutes, dur) {
    return Math.ceil(tripMinutes * 60 / dur);
  }
  function packPenalty(n) {
    return 1 / (1 + 0.1 * (n - 1));
  }
  function score(item, weights) {
    let s = 0;
    for (const [sid, w] of Object.entries(weights)) {
      const v = item.buff.stats[sid];
      if (v === undefined) continue;
      s += w * (v / (PROV.stats[sid]?.max || 1));
    }
    return s * durFactor(item.buff.dur);
  }

  for (const act of ACTIVITIES) {
    const badWeights = Object.keys(act.w)
      .filter(sid => !(sid in PROV.stats) && !STAT_NAMES.has(sid));
    check(badWeights.length === 0,
      `${act.id}: every weight key is a known stat name` +
      (badWeights.length ? ` (unknown: ${badWeights.join(", ")})` : ""));

    let nan = 0, positiveFood = 0;
    for (const c of PROV.consumables) {
      const s = score(c, act.w);
      if (Number.isNaN(s)) nan++;
      if (c.slots > 0 && s > 0.05) positiveFood++;
    }
    check(nan === 0, `${act.id}: no NaN damped scores`);
    check(positiveFood >= 1,
      `${act.id}: ${positiveFood} stomach-slot foods score > 0.05`);
  }

  /* ---------- 4. duration damping & trip pack math ---------- */
  console.log("== duration damping & trip pack math ==");
  check(Math.abs(durFactor(0) - 0.5) < 1e-12, "durFactor(0) = 0.5 (instant meds hit the floor)");
  check(Math.abs(durFactor(1800) - 1) < 1e-12, "durFactor(1800) = 1");
  check(Math.abs(durFactor(7200) - 1) < 1e-12, "durFactor caps at 30 min");
  check(packCount(60, 900) === 4, "60-min trip, 15-min buff -> pack 4");
  check(packCount(60, 1200) === 3, "60-min trip, 20-min buff -> pack 3");
  check(packCount(60, 3600) === 1, "60-min trip, 60-min buff -> pack 1");
  check(packPenalty(1) === 1, "packPenalty(1) = 1 (no penalty for a single serving)");
  check(packPenalty(4) < 1 && packPenalty(4) > 0, "packPenalty(4) is a mild positive discount");
}

/* ---------- 5. display-value transforms (issue #10) ---------- */
console.log("== display ops ==");
// Mirrors of displayValue/statLabel in site/provisions.js and site/stables.js.
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
  const meta = PROV.stats[sid] || { tpl: sid };
  const pct = meta.tpl.includes("{0}%") || sid.includes("%");
  const text = meta.tpl.replace(/[+\-]?\{0\}%?/, "").trim() || sid;
  const d = displayValue(v, meta.ops);
  return `${d > 0 ? "+" : ""}${d}${pct ? "%" : ""} ${text}`;
}
const TEMP = "BaseInternalTemperatureModification_+";
check(Array.isArray(PROV.stats[TEMP]?.ops), "temperature stat meta carries display ops");
check(statLabel(TEMP, 1000) === "+10 C to Temperature",
  `hot drink renders +10 C, not +1000 C (got "${statLabel(TEMP, 1000)}")`);
check(statLabel(TEMP, -1500) === "-15 C to Temperature",
  `Ice Water renders -15 C (got "${statLabel(TEMP, -1500)}")`);
check(statLabel("BaseHealthRegen_+%", 25) === "+25% Health Regeneration",
  "stats without ops pass through unchanged");
const hotTea = PROV.consumables.find(c => c.name === "Hot Tea");
check(hotTea?.buff.stats[TEMP] === 1000,
  "raw data stays game-native (Hot Tea buff value is 1000)");

/* ---------- 6. atlas data sanity (issue #14) ---------- */
console.log("== atlas ==");
const ATLAS = JSON.parse(readFileSync(join(ROOT, "site/data/atlas.json"), "utf8"));
// Mirror of cellName in site/atlas.js
function cellName(col, row) { return String.fromCharCode(65 + col) + (row + 1); }
check(cellName(0, 0) === "A1" && cellName(15, 15) === "P16",
  "cellName maps corners to A1 / P16");
const mapCount = Object.keys(ATLAS.maps).length;
check(mapCount === 4, `atlas has 4 maps (got ${mapCount})`);
// every marker's cell string agrees with its fractional grid position
let disagree = 0;
for (const map of Object.values(ATLAS.maps)) {
  for (const layer of Object.values(map.layers)) {
    for (const m of layer) {
      const col = Math.min(map.grid - 1, Math.max(0, Math.floor(m.gx)));
      const row = Math.min(map.grid - 1, Math.max(0, Math.floor(m.gy)));
      if (cellName(col, row) !== m.cell) disagree++;
    }
  }
}
check(disagree === 0, `marker cell strings agree with gx/gy (${disagree} disagree)`);

/* ---------- result ---------- */
console.log(`\n${checks} checks, ${failures.length} failures`);
if (failures.length) {
  for (const f of failures) console.error(`FAILED: ${f}`);
  process.exit(1);
}
console.log("test_app.mjs PASS");

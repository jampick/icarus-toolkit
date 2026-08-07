/* Icarus Armory - arms and armor: sets, weapons and the ammo they fire */
"use strict";

const ICON_BASE = window.ICON_BASE || "icons/";
const BREAKDOWN_BASE = window.BREAKDOWN_BASE || "index.html";

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
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function loadData() {
  const inline = document.getElementById("armory-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/armory.json")).json();
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
  const meta = DATA.stats[sid] || { tpl: sid };
  const pct = meta.tpl.includes("{0}%") || sid.includes("%");
  const text = meta.tpl.replace(/[+\-]?\{0\}%?/, "").trim() || sid;
  const d = displayValue(v, meta.ops);
  return `${d > 0 ? "+" : ""}${d}${pct ? "%" : ""} ${text}`;
}

function statList(stats) {
  const ul = document.createElement("ul");
  ul.className = "pstats";
  for (const [sid, v] of Object.entries(stats || {})) {
    const li = document.createElement("li");
    li.className = v < 0 ? "bad" : "good";
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

function renderSets() {
  const host = $("#set-list");
  host.innerHTML = "";
  for (const g of visibleGroups()) {
    const sec = document.createElement("div");
    sec.className = "mount-sec";
    sec.id = "set-" + g.id;
    const armor = groupStatTotal(g, "BasePhysicalDamageResistance_%");
    sec.innerHTML = `<h3 class="mount-h">🛡 ${g.name}
      ${armor ? `<span class="set-sum">${armor}% physical resist total</span>` : ""}</h3>
      ${bonusLine(g)}`;
    const grid = document.createElement("div");
    grid.className = "prov-grid";
    for (const p of g.pieces) grid.appendChild(pieceCard(p));
    sec.appendChild(grid);
    host.appendChild(sec);
  }
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

/* ---------- tabs ---------- */

function showTab(id) {
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === id));
  for (const sec of ["armor", "weapons", "ammo"]) {
    $("#tab-" + sec).classList.toggle("hidden", sec !== id);
  }
  updateURL({ tab: id });
}

function gotoSetSec(id) {
  showTab("armor");
  requestAnimationFrame(() => {
    const sec = document.getElementById("set-" + id);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
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
      () => gotoSetSec(g.id)));
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
  renderSetJump();
  renderSets();
  renderWeaponFilters();
  renderWeapons();
  renderAmmoJump();
  renderAmmo();
  $$(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
  $$("#afilters .tchip[data-f]").forEach(ch => ch.onclick = () => {
    armorFilter = ch.dataset.f;
    $$("#afilters .tchip[data-f]").forEach(x =>
      x.classList.toggle("on", x.dataset.f === armorFilter));
    renderSetJump();
    renderSets();
  });
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab && ["armor", "weapons", "ammo"].includes(tab)) showTab(tab);
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

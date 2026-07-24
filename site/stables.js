/* Icarus Stables - taming, mounts and feed for the resident animal tamer */
"use strict";

const ICON_BASE = window.ICON_BASE || "icons/";
const BREAKDOWN_BASE = window.BREAKDOWN_BASE || "index.html";

const EMOJI = {
  Moa: "🦤", ArcticMoa: "🦤", Buffalo: "🐃", Horse: "🐎", Tusker: "🐗",
  Forest_Wolf: "🐺", Snow_Wolf: "🐺", Desert_Wolf: "🐺", Blueback: "🦎",
  Blueback_Lava: "🦎", Wild_Boar: "🐗", Dog: "🐕", Cat: "🐈", Calf: "🐄",
  Chick: "🐔", Lamb: "🐑", WoolyZebra: "🦓",
  SwampBird: "🦩", Raptor_Desert: "🦖", Raptor_Geothermal: "🦖", Chew: "🦫",
  Slinker: "🦝", Orka: "🐋", Storca: "🐋", Tundra_Monkey: "🐒",
  WoollyMammoth: "🦣", Piglet: "🐖",
};

/* short labels for the mounts quick-jump chips */
const SHORT = {
  WoollyMammoth: "Mammoth", WoolyZebra: "Zebra", ArcticMoa: "Arctic Moa",
  Raptor_Desert: "D. Raptor", Raptor_Geothermal: "G. Raptor",
  SwampBird: "Swamp Bird",
};

let DATA = null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function loadData() {
  const inline = document.getElementById("stables-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/stables.json")).json();
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

function fmtMin(sec) {
  if (!sec) return "-";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`;
}

function statLabel(sid, v) {
  const meta = DATA.stats[sid] || { tpl: sid };
  const pct = meta.tpl.includes("{0}%") || sid.includes("%");
  const text = meta.tpl.replace(/[+\-]?\{0\}%?/, "").trim() || sid;
  return `${v > 0 ? "+" : ""}${v}${pct ? "%" : ""} ${text}`;
}

function itemIcon(icon, cls) {
  const img = document.createElement("img");
  img.className = cls || "";
  img.loading = "lazy";
  img.src = ICON_BASE + icon + ".png";
  img.onerror = () => img.remove();
  return img;
}

/* Temperature unit: C by default (a sensible scale), F available on toggle */
let tempUnit = localStorage.getItem("stables-unit") === "F" ? "F" : "C";

function fmtTemp(c) {
  return tempUnit === "F" ? Math.round(c * 9 / 5 + 32) : c;
}

/* Temperature comfort strip: position the range on a -30..55 C scale */
function tempStrip(temp) {
  const wrap = document.createElement("div");
  wrap.className = "temp-strip";
  if (!temp || temp.min === undefined && temp.max === undefined) return wrap;
  const lo = temp.min ?? -30, hi = temp.max ?? 55;
  const left = Math.max(0, (lo + 30) / 85 * 100);
  const width = Math.max(3, Math.min(100 - left, (hi - lo) / 85 * 100));
  const u = "°" + tempUnit;
  wrap.innerHTML = `<i style="left:${left}%;width:${width}%"></i>
    <span class="temp-label">${fmtTemp(lo)}° to ${fmtTemp(hi)}${u}</span>`;
  wrap.title = `Comfortable between ${fmtTemp(lo)}${u} and ${fmtTemp(hi)}${u}`;
  return wrap;
}

/* ---------- creatures tab ---------- */

let creatureFilter = "all";

/* No temp data means the creature is hardy: it passes both climate filters. */
function coldReady(c) { return !c.temp || c.temp.min <= 0; }
function heatReady(c) { return !c.temp || c.temp.max >= 40; }

function paintCreatureChips() {
  $$("#cfilters .tchip[data-f]").forEach(x =>
    x.classList.toggle("on", x.dataset.f === creatureFilter));
}

function renderCreatures() {
  const host = $("#creature-cards");
  host.innerHTML = "";
  let list = DATA.creatures;
  if (creatureFilter === "rideable") list = list.filter(c => c.rideable);
  if (creatureFilter === "breedable") list = list.filter(c => c.gestation_s > 0);
  if (creatureFilter === "cold") list = list.filter(coldReady);
  if (creatureFilter === "heat") list = list.filter(heatReady);
  for (const c of list) {
    const el = document.createElement("div");
    el.className = "pcard";
    el.dataset.id = c.id;
    const badges = [];
    if (c.rideable) badges.push(`<span class="bench ride">🏇 rideable</span>`);
    if (c.gestation_s > 0) badges.push(`<span class="bench">🍼 breeds</span>`);
    el.innerHTML = `
      <div class="pcard-head">
        <div class="cre-emoji">${EMOJI[c.id] || "🐾"}</div>
        <div><div class="pname">${c.name}</div>
        <div class="psub">⏳ tame ${fmtMin(c.tame_s)} ${badges.join(" ")}</div></div>
      </div>`;
    el.appendChild(tempStrip(c.temp));
    const ul = document.createElement("ul");
    ul.className = "pstats";
    if (c.variants > 1) ul.innerHTML += `<li>🎨 ${c.variants} plumage variants</li>`;
    if (c.shelter > 0) ul.innerHTML += `<li>🏠 wants ${c.shelter}% shelter</li>`;
    if (c.nutrition > 0) ul.innerHTML += `<li>🥣 wants ${c.nutrition}% nutrition</li>`;
    if (c.gestation_s > 0) ul.innerHTML += `<li>🍼 gestation ${fmtMin(c.gestation_s)}</li>`;
    if (c.prohibited.length) ul.innerHTML +=
      `<li class="bad">🚫 won't tame while ${c.prohibited.map(p => p.toLowerCase()).join(" or ")}</li>`;
    el.appendChild(ul);
    if (c.rideable && c.saddles.length) {
      const a = document.createElement("a");
      a.className = "pcost";
      a.href = "?tab=mounts#m-" + c.id;
      a.textContent = `🏇 ${c.saddles.length} saddle option${c.saddles.length > 1 ? "s" : ""} →`;
      a.onclick = (e) => { e.preventDefault(); showTab("mounts"); location.hash = "m-" + c.id; };
      el.appendChild(a);
    }
    host.appendChild(el);
  }
}

/* ---------- mounts tab ---------- */

function mountable() {
  return DATA.creatures.filter(c => c.rideable && c.saddles.length);
}

function renderMountJump() {
  const host = $("#mount-jump");
  host.innerHTML = "";
  for (const c of mountable()) {
    const b = document.createElement("button");
    b.className = "tchip";
    b.textContent = `${EMOJI[c.id] || "🐾"} ${SHORT[c.id] || c.name}`;
    b.onclick = () => {
      const sec = document.getElementById("m-" + c.id);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    host.appendChild(b);
  }
}

function renderMounts() {
  const host = $("#mount-list");
  host.innerHTML = "";
  for (const c of mountable()) {
    const sec = document.createElement("div");
    sec.className = "mount-sec";
    sec.id = "m-" + c.id;
    sec.innerHTML = `<h3 class="mount-h">${EMOJI[c.id] || "🐾"} ${c.name}</h3>`;
    const grid = document.createElement("div");
    grid.className = "prov-grid";
    for (const sid of c.saddles) {
      const s = DATA.saddleItems[sid];
      if (!s) continue;
      const el = document.createElement("div");
      el.className = "pcard saddle";
      const head = document.createElement("div");
      head.className = "pcard-head";
      if (s.icon) head.appendChild(itemIcon(s.icon));
      const meta = document.createElement("div");
      meta.innerHTML = `<div class="pname">${s.name}</div>
        <div class="psub">${s.craftable && s.benches ? `<span class="bench">${s.benches[0]}</span>` : '<span class="bench ws">orbital workshop</span>'}</div>`;
      head.appendChild(meta);
      el.appendChild(head);
      if (s.desc) {
        const d = document.createElement("div");
        d.className = "rev-stats";
        d.textContent = s.desc;
        el.appendChild(d);
      }
      if (s.craftable) {
        const a = document.createElement("a");
        a.className = "pcost";
        a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(sid)}`;
        a.textContent = "⛏ what it costs →";
        el.appendChild(a);
      }
      grid.appendChild(el);
    }
    sec.appendChild(grid);
    host.appendChild(sec);
  }
}

/* ---------- feed tab ---------- */

/* Purpose tags derived from a feed's stat keys (substring match). Every feed
   in the current data lands in at least one bucket via these rules. */
const FEED_TAGS = [
  { id: "speed", label: "🏃 Speed", match: ["MovementSpeed", "SprintSpeed"] },
  { id: "carry", label: "🎒 Carry", match: ["CarryWeight", "Weight"] },
  { id: "combat", label: "⚔️ Combat", match: ["Damage", "Health", "Resistance"] },
  { id: "sustain", label: "🌾 Sustain", match: ["Stamina", "Food", "Water"] },
];

function feedTags(f) {
  const keys = Object.keys(f.stats);
  return FEED_TAGS.filter(t => keys.some(k => t.match.some(m => k.includes(m))));
}

let feedFilter = "all";

function renderFeedFilters() {
  const host = $("#ffilters");
  host.innerHTML = "";
  const present = new Set(DATA.feeds.flatMap(f => feedTags(f).map(t => t.id)));
  const chips = [{ id: "all", label: "All" }, ...FEED_TAGS.filter(t => present.has(t.id))];
  for (const t of chips) {
    const b = document.createElement("button");
    b.className = "tchip" + (feedFilter === t.id ? " on" : "");
    b.dataset.f = t.id;
    b.textContent = t.label;
    b.onclick = () => {
      feedFilter = t.id;
      $$("#ffilters .tchip").forEach(x => x.classList.toggle("on", x === b));
      renderFeed();
    };
    host.appendChild(b);
  }
}

function renderFeed() {
  const host = $("#feed-cards");
  host.innerHTML = "";
  let list = DATA.feeds;
  if (feedFilter !== "all") list = list.filter(f => feedTags(f).some(t => t.id === feedFilter));
  for (const f of list) {
    const el = document.createElement("div");
    el.className = "pcard";
    el.dataset.id = f.id;
    const head = document.createElement("div");
    head.className = "pcard-head";
    if (f.icon) head.appendChild(itemIcon(f.icon));
    const meta = document.createElement("div");
    const tags = feedTags(f).map(t => `<span class="bench ftag">${t.label}</span>`).join(" ");
    meta.innerHTML = `<div class="pname">${f.name}</div>
      <div class="psub">${f.dur ? "⏱ " + fmtMin(f.dur) : ""}
        ${f.craftable && f.benches ? `<span class="bench">${f.benches[0]}</span>` : ""}
        ${tags}</div>`;
    head.appendChild(meta);
    el.appendChild(head);
    const ul = document.createElement("ul");
    ul.className = "pstats";
    for (const [sid, v] of Object.entries(f.stats)) {
      const li = document.createElement("li");
      li.className = "good";
      li.textContent = statLabel(sid, v);
      ul.appendChild(li);
    }
    el.appendChild(ul);
    if (f.craftable) {
      const a = document.createElement("a");
      a.className = "pcost";
      a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(f.id)}`;
      a.textContent = "⛏ what it costs →";
      el.appendChild(a);
    }
    host.appendChild(el);
  }
}

/* ---------- tabs ---------- */

function showTab(id) {
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === id));
  for (const sec of ["creatures", "mounts", "feed"]) {
    $("#tab-" + sec).classList.toggle("hidden", sec !== id);
  }
  updateURL({ tab: id });
}

/* ---------- unified search + reverse lookup ---------- */

const GROUPS = [
  { kind: "creature", label: "Creatures" },
  { kind: "saddle", label: "Saddles" },
  { kind: "feed", label: "Feed" },
];

function searchIndex() {
  const ix = [];
  for (const c of DATA.creatures) ix.push({ kind: "creature", id: c.id, name: c.name, ref: c });
  for (const [sid, s] of Object.entries(DATA.saddleItems))
    ix.push({ kind: "saddle", id: sid, name: s.name, ref: s });
  for (const f of DATA.feeds) ix.push({ kind: "feed", id: f.id, name: f.name, ref: f });
  return ix;
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

function gotoCreatureCard(c) {
  showTab("creatures");
  const shown = creatureFilter === "all" ||
    (creatureFilter === "rideable" && c.rideable) ||
    (creatureFilter === "breedable" && c.gestation_s > 0) ||
    (creatureFilter === "cold" && coldReady(c)) ||
    (creatureFilter === "heat" && heatReady(c));
  if (!shown) { creatureFilter = "all"; paintCreatureChips(); renderCreatures(); }
  highlightCard("#creature-cards", c.id);
}

function gotoMountSec(id) {
  showTab("mounts");
  requestAnimationFrame(() => {
    const sec = document.getElementById("m-" + id);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
    $("#ssearch").value = "";
    updateURL({ q: null });
  };
  head.appendChild(close);
  host.appendChild(head);
  return meta;
}

function renderReverse(m) {
  const host = $("#sreverse");
  host.innerHTML = "";
  host.classList.remove("hidden");

  if (m.kind === "creature") {
    const c = m.ref;
    const em = document.createElement("div");
    em.className = "rev-emoji";
    em.textContent = EMOJI[c.id] || "🐾";
    const badges = [];
    if (c.rideable) badges.push('<span class="bench ride">🏇 rideable</span>');
    if (c.gestation_s > 0) badges.push('<span class="bench">🍼 breeds</span>');
    if (c.variants > 1) badges.push(`<span class="bench">🎨 ${c.variants} plumage variants</span>`);
    const meta = revHead(host, em, `<div class="pname">${c.name}</div>
      <div class="psub">⏳ tame ${fmtMin(c.tame_s)} ${badges.join(" ")}</div>`);
    meta.appendChild(tempStrip(c.temp));
    revTitle(host, "Jump to");
    host.appendChild(revRow(EMOJI[c.id] || "🐾", "Creature card", "Creatures tab",
      () => gotoCreatureCard(c)));
    if (c.rideable && c.saddles.length) {
      host.appendChild(revRow("🏇", "Saddles for this mount",
        `${c.saddles.length} option${c.saddles.length > 1 ? "s" : ""} in the Mounts tab`,
        () => gotoMountSec(c.id)));
    }
    return;
  }

  if (m.kind === "saddle") {
    const s = m.ref;
    const meta = revHead(host, itemIcon(s.icon), `<div class="pname">${s.name}</div>
      <div class="psub">${s.craftable && s.benches ? `<span class="bench">${s.benches[0]}</span>` : '<span class="bench ws">orbital workshop</span>'}</div>
      ${s.desc ? `<div class="rev-stats">${s.desc}</div>` : ""}`);
    if (s.craftable) {
      const a = document.createElement("a");
      a.className = "pcost";
      a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(m.id)}`;
      a.textContent = "⛏ what it costs →";
      meta.appendChild(a);
    }
    const fits = DATA.creatures.filter(c => c.saddles.includes(m.id));
    revTitle(host, "Fits these mounts");
    if (!fits.length) {
      const d = document.createElement("div");
      d.className = "pnone";
      d.textContent = "No tamed mount accepts this saddle.";
      host.appendChild(d);
    }
    for (const c of fits) {
      host.appendChild(revRow(EMOJI[c.id] || "🐾", c.name, "Mounts tab",
        () => gotoMountSec(c.id)));
    }
    return;
  }

  // feed
  const f = m.ref;
  const tags = feedTags(f).map(t => `<span class="bench ftag">${t.label}</span>`).join(" ");
  const meta = revHead(host, itemIcon(f.icon), `<div class="pname">${f.name}</div>
    <div class="psub">${f.dur ? "⏱ " + fmtMin(f.dur) : ""}
      ${f.craftable && f.benches ? `<span class="bench">${f.benches[0]}</span>` : ""}
      ${tags}</div>`);
  const ul = document.createElement("ul");
  ul.className = "pstats";
  for (const [sid, v] of Object.entries(f.stats)) {
    const li = document.createElement("li");
    li.className = "good";
    li.textContent = statLabel(sid, v);
    ul.appendChild(li);
  }
  meta.appendChild(ul);
  if (f.craftable) {
    const a = document.createElement("a");
    a.className = "pcost";
    a.href = `${BREAKDOWN_BASE}?item=${encodeURIComponent(f.id)}`;
    a.textContent = "⛏ what it costs →";
    meta.appendChild(a);
  }
}

function initSearch() {
  const input = $("#ssearch"), results = $("#sresults");
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
    if (m.kind === "creature") {
      const em = document.createElement("span");
      em.className = "remoji";
      em.textContent = EMOJI[m.id] || "🐾";
      el.appendChild(em);
    } else if (m.ref.icon) {
      el.appendChild(itemIcon(m.ref.icon));
    }
    const nm = document.createElement("span");
    nm.className = "rname"; nm.textContent = m.name;
    const cat = document.createElement("span");
    cat.className = "rcat";
    cat.textContent = m.kind === "creature" ? (m.ref.rideable ? "mount" : "tame") : m.kind;
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
    if (!e.target.closest("#ssearchwrap")) results.classList.add("hidden");
  });

  // restore ?q=<id>
  const qid = new URLSearchParams(location.search).get("q");
  if (qid) {
    const m = index.find(x => x.id === qid);
    if (m) { input.value = m.name; renderReverse(m); }
  }
}

function init() {
  renderCreatures();
  renderMountJump();
  renderMounts();
  renderFeedFilters();
  renderFeed();
  $$(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
  $$("#cfilters .tchip[data-f]").forEach(ch => ch.onclick = () => {
    creatureFilter = ch.dataset.f;
    paintCreatureChips();
    renderCreatures();
  });
  const unitBtn = $("#unit-toggle");
  const paintUnit = () => unitBtn.textContent = "°" + tempUnit;
  paintUnit();
  unitBtn.onclick = () => {
    tempUnit = tempUnit === "C" ? "F" : "C";
    localStorage.setItem("stables-unit", tempUnit);
    paintUnit();
    renderCreatures();
    const qid = new URLSearchParams(location.search).get("q");
    const c = qid && DATA.creatures.find(x => x.id === qid);
    if (c && !$("#sreverse").classList.contains("hidden"))
      renderReverse({ kind: "creature", id: c.id, name: c.name, ref: c });
  };
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab && ["creatures", "mounts", "feed"].includes(tab)) showTab(tab);
  initSearch();
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView();
  }
}

loadData().then(init);

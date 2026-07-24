/* Icarus Stables - taming, mounts and feed for the resident animal tamer */
"use strict";

const ICON_BASE = window.ICON_BASE || "icons/";
const BREAKDOWN_BASE = window.BREAKDOWN_BASE || "index.html";

const EMOJI = {
  Moa: "🦤", ArcticMoa: "🦤", Buffalo: "🐃", Horse: "🐎", Tusker: "🐗",
  Forest_Wolf: "🐺", Snow_Wolf: "🐺", Desert_Wolf: "🐺", Blueback: "🦎",
  Blueback_Lava: "🦎", Wild_Boar: "🐗", Dog: "🐕", Cat: "🐈", Calf: "🐄",
  Chick: "🐔", Chick1: "🐔", Chick2: "🐔", Lamb: "🐑", WoolyZebra: "🦓",
  SwampBird: "🦩", Raptor_Desert: "🦖", Raptor_Geothermal: "🦖", Chew: "🦫",
  Slinker: "🦝", Orka: "🐋", Storca: "🐋", Tundra_Monkey: "🐒",
  WoollyMammoth: "🦣", Piglet: "🐖",
};

let DATA = null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function loadData() {
  const inline = document.getElementById("stables-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/stables.json")).json();
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

/* Temperature comfort strip: position the range on a -30..55 C scale */
function tempStrip(temp) {
  const wrap = document.createElement("div");
  wrap.className = "temp-strip";
  if (!temp || temp.min === undefined && temp.max === undefined) return wrap;
  const lo = temp.min ?? -30, hi = temp.max ?? 55;
  const left = Math.max(0, (lo + 30) / 85 * 100);
  const width = Math.max(3, Math.min(100 - left, (hi - lo) / 85 * 100));
  wrap.innerHTML = `<i style="left:${left}%;width:${width}%"></i>
    <span class="temp-label">${lo}° to ${hi}°C</span>`;
  wrap.title = `Comfortable between ${lo}°C and ${hi}°C`;
  return wrap;
}

/* ---------- creatures tab ---------- */

let creatureFilter = "all";

function renderCreatures() {
  const host = $("#creature-cards");
  host.innerHTML = "";
  let list = DATA.creatures;
  if (creatureFilter === "rideable") list = list.filter(c => c.rideable);
  if (creatureFilter === "breedable") list = list.filter(c => c.gestation_s > 0);
  for (const c of list) {
    const el = document.createElement("div");
    el.className = "pcard";
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

function renderMounts() {
  const host = $("#mount-list");
  host.innerHTML = "";
  for (const c of DATA.creatures.filter(c => c.rideable && c.saddles.length)) {
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

function renderFeed() {
  const host = $("#feed-cards");
  host.innerHTML = "";
  for (const f of DATA.feeds) {
    const el = document.createElement("div");
    el.className = "pcard";
    const head = document.createElement("div");
    head.className = "pcard-head";
    if (f.icon) head.appendChild(itemIcon(f.icon));
    const meta = document.createElement("div");
    meta.innerHTML = `<div class="pname">${f.name}</div>
      <div class="psub">${f.dur ? "⏱ " + fmtMin(f.dur) : ""}
        ${f.craftable && f.benches ? `<span class="bench">${f.benches[0]}</span>` : ""}</div>`;
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
  const p = new URLSearchParams(location.search);
  p.set("tab", id);
  history.replaceState({}, "", "?" + p.toString());
}

function init() {
  renderCreatures();
  renderMounts();
  renderFeed();
  $$(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
  $$("#cfilters .tchip").forEach(ch => ch.onclick = () => {
    creatureFilter = ch.dataset.f;
    $$("#cfilters .tchip").forEach(x => x.classList.toggle("on", x === ch));
    renderCreatures();
  });
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab && ["creatures", "mounts", "feed"].includes(tab)) showTab(tab);
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView();
  }
}

loadData().then(init);

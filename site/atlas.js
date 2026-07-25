/* Icarus Atlas - grid map of caves, deep vein spawns, geysers and exotics */
"use strict";

let DATA = null;
let mapId = null;
const activeLayers = new Set(["terrain", "caves", "veins", "exotics"]);
let selectedCell = null;

const LAYER_META = {
  terrain: { label: "Terrain",     emoji: "\u{1F3DE}", color: null },
  caves:   { label: "Caves",       emoji: "\u{1F573}", color: "#e8b34b" },
  veins:   { label: "Deep veins",  emoji: "⛏",    color: "#9ab0c4" },
  oil:     { label: "Oil",         emoji: "\u{1F6E2}", color: "#b06f3c" },
  enzyme:  { label: "Enzyme",      emoji: "\u{1F9EA}", color: "#6fcf6f" },
  worms:   { label: "Sandworm boss", emoji: "\u{1FAB1}", color: "#e06060" },
  exotics: { label: "Exotics",     emoji: "\u{1F48E}", color: "#b07fe8" },
};

const SVGNS = "http://www.w3.org/2000/svg";
const CELL = 100; // svg units per grid cell

// maps whose terrain is stitched in-game satellite imagery (lighter CSS
// treatment than the muted hillshade renders)
const PHOTO_MAPS = new Set(["Terrain_016"]);

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
  const inline = document.getElementById("atlas-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/atlas.json")).json();
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function cellName(col, row) {
  return String.fromCharCode(65 + col) + (row + 1);
}

function renderChips() {
  const mwrap = document.getElementById("atlas-maps");
  mwrap.innerHTML = "";
  for (const [id, m] of Object.entries(DATA.maps)) {
    const b = document.createElement("button");
    b.className = "tchip" + (id === mapId ? " on" : "");
    b.textContent = m.name;
    b.onclick = () => { mapId = id; selectedCell = null; updateURL({ map: m.name.toLowerCase(), cell: null }); render(); };
    mwrap.appendChild(b);
  }
  const lwrap = document.getElementById("atlas-layers");
  lwrap.innerHTML = "";
  const map = DATA.maps[mapId];
  for (const [key, meta] of Object.entries(LAYER_META)) {
    const n = key === "terrain" ? null
      : key === "exotics" ? Object.keys(map.exotics).length
      : (map.layers[key] || []).length;
    const b = document.createElement("button");
    b.className = "tchip" + (activeLayers.has(key) ? " on" : "");
    b.innerHTML = `${meta.emoji} ${meta.label}` +
      (n === null ? "" : ` <span class="atlas-count">${n}</span>`);
    b.onclick = () => {
      activeLayers.has(key) ? activeLayers.delete(key) : activeLayers.add(key);
      updateURL({ layers: [...activeLayers].join(",") });
      render();
    };
    lwrap.appendChild(b);
  }
}

function renderMap() {
  const svg = document.getElementById("atlas-svg");
  svg.innerHTML = "";
  const map = DATA.maps[mapId];
  const G = map.grid;
  const pad = 40; // room for edge labels
  svg.setAttribute("viewBox", `${-pad} ${-pad} ${G * CELL + 2 * pad} ${G * CELL + 2 * pad}`);

  // biome terrain image under everything else (world-registered: the
  // texture and the marker transform share the same origin-centered bounds)
  if (activeLayers.has("terrain")) {
    el("image", {
      href: `maps/${mapId}.jpg`,
      x: 0, y: 0, width: G * CELL, height: G * CELL,
      preserveAspectRatio: "none",
      class: PHOTO_MAPS.has(mapId) ? "atlas-terrain atlas-terrain-photo" : "atlas-terrain",
    }, svg);
  }

  // exotic cell shading under the grid but over the terrain
  if (activeLayers.has("exotics")) {
    for (const [cell, count] of Object.entries(map.exotics)) {
      const col = cell.charCodeAt(0) - 65;
      const row = parseInt(cell.slice(1), 10) - 1;
      const r = el("rect", {
        x: col * CELL, y: row * CELL, width: CELL, height: CELL,
        fill: LAYER_META.exotics.color, "fill-opacity": count > 1 ? 0.38 : 0.22,
        class: "atlas-cell",
      }, svg);
      r.dataset.tip = `${LAYER_META.exotics.emoji} ${count} exotic spawn${count > 1 ? "s" : ""} in ${cell}`;
    }
  }

  // grid lines + labels
  for (let i = 0; i <= G; i++) {
    el("line", { x1: i * CELL, y1: 0, x2: i * CELL, y2: G * CELL, class: "atlas-grid" }, svg);
    el("line", { x1: 0, y1: i * CELL, x2: G * CELL, y2: i * CELL, class: "atlas-grid" }, svg);
  }
  for (let i = 0; i < G; i++) {
    const cl = el("text", { x: i * CELL + CELL / 2, y: -12, class: "atlas-label" }, svg);
    cl.textContent = String.fromCharCode(65 + i);
    const rl = el("text", { x: -14, y: i * CELL + CELL / 2 + 8, class: "atlas-label" }, svg);
    rl.textContent = i + 1;
  }

  // cell hit targets (click to inspect a square)
  for (let col = 0; col < G; col++) {
    for (let row = 0; row < G; row++) {
      const hit = el("rect", {
        x: col * CELL, y: row * CELL, width: CELL, height: CELL,
        fill: "transparent", class: "atlas-hit",
      }, svg);
      hit.addEventListener("click", () => selectCell(cellName(col, row)));
    }
  }

  // markers
  for (const [key, meta] of Object.entries(LAYER_META)) {
    if (key === "terrain" || key === "exotics" || !activeLayers.has(key)) continue;
    for (const m of map.layers[key] || []) {
      const c = el("circle", {
        cx: m.gx * CELL, cy: m.gy * CELL,
        r: key === "veins" ? 7 : 11,
        fill: meta.color, class: "atlas-marker atlas-" + key,
      }, svg);
      if (key === "caves") {
        const bits = [];
        if (m.size) bits.push(`${m.size} ${m.code || ""} cave`.trim());
        if (m.veins) bits.push(`${m.veins} deep vein${m.veins > 1 ? "s" : ""} inside`);
        if (m.lakes) bits.push("lake");
        c.dataset.tip = `${meta.emoji} ${bits.length ? bits.join(" · ") : "Cave"} - ${m.cell} (click)`;
        // multi-vein caves are the prize; ring them
        if (m.veins >= 2) {
          el("circle", {
            cx: m.gx * CELL, cy: m.gy * CELL, r: 16,
            fill: "none", stroke: LAYER_META.veins.color,
            "stroke-width": 3.5, class: "atlas-exoring",
          }, svg);
        }
        c.style.cursor = "pointer";
        c.addEventListener("click", e => { e.stopPropagation(); showCave(m); });
      } else {
        c.dataset.tip = `${meta.emoji} ${meta.label.replace(/s$/, "")} - ${m.cell}`;
      }
    }
  }

  // selected cell outline
  if (selectedCell) {
    const col = selectedCell.charCodeAt(0) - 65;
    const row = parseInt(selectedCell.slice(1), 10) - 1;
    el("rect", {
      x: col * CELL, y: row * CELL, width: CELL, height: CELL,
      class: "atlas-selected",
    }, svg);
  }

  attachTooltips(svg);
  attachPanZoom(svg, G * CELL + 2 * pad);
}

function selectCell(cell) {
  selectedCell = selectedCell === cell ? null : cell;
  updateURL({ cell: selectedCell });
  render();
}

const SIZE_NAMES = { SML: "Small", MED: "Medium", LRG: "Large", XLG: "Huge" };

function prettySpawn(s) {
  return s.replace(/^(AISetup_|AI_|BP_|NPC_)/, "").replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function showCave(m) {
  selectedCell = m.cell;
  updateURL({ cell: selectedCell });
  render();
  const box = document.getElementById("atlas-cellinfo");
  const rows = [];
  rows.push(`<b>${SIZE_NAMES[m.size] || m.size || ""} cave</b> in ${m.cell}` +
    (m.code ? ` <span class="atlas-count">(${m.code})</span>` : ""));
  const bits = [];
  if (m.veins) bits.push(`⛏ ${m.veins} deep vein${m.veins > 1 ? "s" : ""} inside`);
  if (m.exotics) bits.push(`\u{1F48E} ${m.exotics} exotic spawn slot${m.exotics > 1 ? "s" : ""}`);
  if (m.lakes) bits.push(`\u{1F30A} cave lake`);
  if (bits.length) rows.push(bits.join(" · "));
  if (m.spawns && m.spawns.length)
    rows.push(`Creatures: ${[...new Set(m.spawns.map(prettySpawn))].join(", ")}`);
  if (rows.length === 1) rows.push("No template details recorded.");
  box.innerHTML = rows.join("<br>");
  box.classList.remove("hidden");
}

function renderCellInfo() {
  const box = document.getElementById("atlas-cellinfo");
  if (!selectedCell) { box.classList.add("hidden"); return; }
  const map = DATA.maps[mapId];
  const parts = [];
  for (const [key, meta] of Object.entries(LAYER_META)) {
    const n = key === "exotics"
      ? (map.exotics[selectedCell] || 0)
      : (map.layers[key] || []).filter(m => m.cell === selectedCell).length;
    if (n) parts.push(`${meta.emoji} ${n} ${meta.label.toLowerCase()}`);
  }
  box.innerHTML = `<b>${map.name} ${selectedCell}</b> - ` +
    (parts.length ? parts.join(", ") : "nothing recorded in this square");
  box.classList.remove("hidden");
}

/* ---------- tooltip ---------- */

function attachTooltips(svg) {
  const tip = document.getElementById("atlas-tip");
  svg.addEventListener("pointerover", e => {
    const t = e.target.dataset && e.target.dataset.tip;
    if (!t) { tip.classList.add("hidden"); return; }
    tip.textContent = t;
    tip.classList.remove("hidden");
  });
  svg.addEventListener("pointermove", e => {
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY + 14 + "px";
  });
  svg.addEventListener("pointerleave", () => tip.classList.add("hidden"));
}

/* ---------- pan & zoom (viewBox based) ---------- */

function attachPanZoom(svg, extent) {
  let vb = svg.viewBox.baseVal;
  const minW = extent / 16, maxW = extent;

  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const w = Math.min(maxW, Math.max(minW, vb.width * scale));
    const rect = svg.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    vb.x += (vb.width - w) * fx;
    vb.y += (vb.height - w) * fy;
    vb.width = vb.height = w;
  }, { passive: false });

  let drag = null;
  const pointers = new Map();
  svg.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId, e);
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pointers.set(e.pointerId, e);
      const [a1, b1] = [...pointers.values()];
      const d1 = Math.hypot(a1.clientX - b1.clientX, a1.clientY - b1.clientY);
      if (d0 > 0 && d1 > 0) {
        const w = Math.min(maxW, Math.max(minW, vb.width * d0 / d1));
        vb.x += (vb.width - w) / 2;
        vb.y += (vb.height - w) / 2;
        vb.width = vb.height = w;
      }
      drag = null;
      return;
    }
    pointers.set(e.pointerId, e);
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const k = vb.width / rect.width;
    vb.x -= (e.clientX - drag.x) * k;
    vb.y -= (e.clientY - drag.y) * k;
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = e => { pointers.delete(e.pointerId); drag = null; };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
}

/* ---------- boot ---------- */

function render() {
  renderChips();
  renderMap();
  renderCellInfo();
}

async function boot() {
  await loadData();
  const p = new URLSearchParams(location.search);
  const wanted = (p.get("map") || "").toLowerCase();
  mapId = Object.keys(DATA.maps).find(id => DATA.maps[id].name.toLowerCase() === wanted)
    || Object.keys(DATA.maps)[0];
  if (p.get("layers")) {
    activeLayers.clear();
    for (const l of p.get("layers").split(",")) if (LAYER_META[l]) activeLayers.add(l);
  }
  const c = (p.get("cell") || "").toUpperCase();
  if (/^[A-P](1[0-6]|[1-9])$/.test(c)) selectedCell = c;
  render();
}

boot();

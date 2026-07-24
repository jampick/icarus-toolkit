/* Icarus Breakdown — exploded crafting calculator */
"use strict";

let DATA = null;            // {items, recipes, byOutput}
let rootId = null;
let qty = 1;
const modeOverride = new Map();    // path -> 'craft' | 'gather'
const recipeChoice = new Map();    // path -> recipe list index
let view = { x: 60, y: 0, k: 1 };  // pan/zoom
let treeRoot = null;               // computed tree

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), canvas = $("#canvas"), treeEl = $("#tree"), wires = $("#wires");

/* ---------- data ---------- */

async function loadData() {
  const inline = document.getElementById("recipes-data");
  DATA = inline ? JSON.parse(inline.textContent) : await (await fetch("data/recipes.json")).json();
}

let benchIndex = null;  // normalized display name -> craftable item id
function benchItemId(benchName) {
  if (!benchIndex) {
    benchIndex = {};
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const id of Object.keys(DATA.byOutput)) {
      benchIndex[norm(DATA.items[id].name)] = id;
    }
    benchIndex._norm = norm;
  }
  return benchIndex[benchIndex._norm(benchName)] || null;
}

function setRoot(id) {
  rootId = id;
  modeOverride.clear();
  recipeChoice.clear();
  qty = 1; qtyEl.value = 1;
  searchEl.value = DATA.items[id].name;
  $("#sidebar").classList.remove("open");
  rebuild();
  centerTree();
}

function recipesFor(id) {
  const idxs = DATA.byOutput[id] || [];
  // real crafting recipes first, conversions last
  return idxs.map(i => DATA.recipes[i]).sort((a, b) => (a.conv === b.conv) ? 0 : a.conv ? 1 : -1);
}

function outCount(rec, id) {
  const o = rec.outputs.find(([oid]) => oid === id);
  return o ? o[1] : 1;
}

/* ---------- tree model ---------- */

function buildTree(id, needed, path, ancestors) {
  const item = DATA.items[id];
  const recs = recipesFor(id);
  const cyclic = ancestors.has(id);
  let mode = modeOverride.get(path);
  if (mode === undefined) mode = (item.raw || !recs.length || cyclic) ? "gather" : "craft";
  if (!recs.length || cyclic) mode = "gather";

  const node = { id, item, path, needed, mode, recs, children: [], cyclic };
  if (mode === "craft") {
    const ri = Math.min(recipeChoice.get(path) || 0, recs.length - 1);
    const rec = recs[ri];
    node.recipeIdx = ri;
    node.recipe = rec;
    node.crafts = Math.ceil(needed / outCount(rec, id));
    const nextAnc = new Set(ancestors); nextAnc.add(id);
    for (const [iid, cnt] of rec.inputs) {
      node.children.push(buildTree(iid, node.crafts * cnt, path + "/" + iid, nextAnc));
    }
  }
  return node;
}

function rebuild() {
  if (!rootId) return;
  treeRoot = buildTree(rootId, qty, rootId, new Set());
  render();
}

/* ---------- totals ---------- */

function collectTotals(node, totals, benches) {
  if (node.mode === "gather") {
    const t = totals.get(node.id) || 0;
    totals.set(node.id, t + node.needed);
  } else {
    if (node.recipe.benches.length) benches.add(node.recipe.benches[0]);
    node.children.forEach(c => collectTotals(c, totals, benches));
  }
}

/* ---------- rendering ---------- */

function iconEl(item, cls) {
  if (item.icon) {
    const img = document.createElement("img");
    img.className = cls; img.loading = "lazy";
    img.src = "icons/" + item.icon + ".png";
    img.onerror = () => { img.replaceWith(fallbackIcon(item, cls)); };
    return img;
  }
  return fallbackIcon(item, cls);
}

function fallbackIcon(item, cls) {
  const d = document.createElement("div");
  d.className = "noicon " + (cls === "icon" ? "" : cls);
  d.textContent = item.name.slice(0, 2).toUpperCase();
  return d;
}

function fmt(n) { return n.toLocaleString(); }

function nodeCard(node, isRoot) {
  const card = document.createElement("div");
  card.className = `card cat-${node.item.cat}` + (isRoot ? " root" : "") + (node.mode === "gather" ? " leaf" : "");
  card.dataset.path = node.path;

  card.appendChild(iconEl(node.item, "icon"));

  const meta = document.createElement("div");
  meta.className = "meta";
  const nm = document.createElement("div");
  nm.className = "iname"; nm.textContent = node.item.name;
  meta.appendChild(nm);

  const sub = document.createElement("div");
  sub.className = "sub";
  const cnt = document.createElement("span");
  cnt.className = "cnt"; cnt.textContent = "×" + fmt(node.needed);
  sub.appendChild(cnt);
  if (node.mode === "craft" && node.recipe.benches.length) {
    const b = document.createElement("span");
    b.className = "bench"; b.textContent = node.recipe.benches[0];
    b.title = node.recipe.benches.join(", ");
    sub.appendChild(b);
  }
  if (node.mode === "gather") {
    const g = document.createElement("span");
    g.className = "gathertag"; g.textContent = "GATHER";
    sub.appendChild(g);
  }
  meta.appendChild(sub);
  card.appendChild(meta);

  // controls
  const ctrl = document.createElement("div");
  ctrl.className = "ctrl";
  if (node.recs.length && !node.cyclic) {
    const t = document.createElement("button");
    t.className = "tbtn" + (node.mode === "craft" ? " on" : "");
    t.textContent = node.mode === "craft" ? "▾" : "▸";
    t.title = node.mode === "craft" ? "Collapse — gather this instead" : "Expand — craft this";
    t.onclick = (e) => {
      e.stopPropagation();
      modeOverride.set(node.path, node.mode === "craft" ? "gather" : "craft");
      rebuild();
    };
    ctrl.appendChild(t);
    if (node.mode === "craft" && node.recs.length > 1) {
      const r = document.createElement("button");
      r.className = "tbtn";
      r.textContent = "↻";
      r.title = `Recipe ${node.recipeIdx + 1}/${node.recs.length} — click to switch`;
      r.onclick = (e) => {
        e.stopPropagation();
        recipeChoice.set(node.path, (node.recipeIdx + 1) % node.recs.length);
        rebuild();
      };
      ctrl.appendChild(r);
    }
  }
  card.appendChild(ctrl);

  card.addEventListener("mouseenter", (e) => { showTip(node, e); highlight(node.path, true); });
  card.addEventListener("mousemove", moveTip);
  card.addEventListener("mouseleave", () => { hideTip(); highlight(node.path, false); });
  return card;
}

function renderNode(node, isRoot) {
  const row = document.createElement("div");
  row.className = "node-row";
  row.appendChild(nodeCard(node, isRoot));
  if (node.children.length) {
    const kids = document.createElement("div");
    kids.className = "kids";
    node.children.forEach(c => kids.appendChild(renderNode(c, false)));
    row.appendChild(kids);
  }
  return row;
}

function render() {
  $("#hint").classList.add("hidden");
  $("#sidebar").classList.remove("hidden");
  $("#totals-fab").classList.remove("hidden");
  treeEl.innerHTML = "";
  treeEl.appendChild(renderNode(treeRoot, true));
  requestAnimationFrame(drawWires);
  renderTotals();
}

function drawWires() {
  const cRect = canvas.getBoundingClientRect();
  const k = view.k;
  wires.innerHTML = "";
  wires.setAttribute("width", treeEl.scrollWidth + 200);
  wires.setAttribute("height", treeEl.scrollHeight + 200);
  const cards = treeEl.querySelectorAll(".card");
  const byPath = {};
  cards.forEach(c => byPath[c.dataset.path] = c);
  for (const c of cards) {
    const p = c.dataset.path;
    const cut = p.lastIndexOf("/");
    if (cut < 0) continue;
    const parent = byPath[p.slice(0, cut)];
    if (!parent) continue;
    const a = parent.getBoundingClientRect(), b = c.getBoundingClientRect();
    const x1 = (a.right - cRect.left) / k, y1 = (a.top + a.height / 2 - cRect.top) / k;
    const x2 = (b.left - cRect.left) / k, y2 = (b.top + b.height / 2 - cRect.top) / k;
    const mx = (x1 + x2) / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    path.dataset.child = p;
    wires.appendChild(path);
  }
}

function highlight(path, on) {
  // light up the chain from this node to the root
  let p = path;
  while (p) {
    const card = treeEl.querySelector(`.card[data-path="${CSS.escape(p)}"]`);
    if (card) card.classList.toggle("hot", on);
    const wire = wires.querySelector(`path[data-child="${CSS.escape(p)}"]`);
    if (wire) wire.classList.toggle("hot", on);
    const cut = p.lastIndexOf("/");
    p = cut < 0 ? null : p.slice(0, cut);
  }
}

function renderTotals() {
  const totals = new Map(), benches = new Set();
  collectTotals(treeRoot, totals, benches);
  const totEl = $("#totals");
  totEl.innerHTML = "";
  let weight = 0;
  const rows = [...totals.entries()]
    .map(([id, n]) => ({ id, n: Math.ceil(n), item: DATA.items[id] }))
    .sort((a, b) => b.n - a.n);
  for (const r of rows) {
    weight += (r.item.weight || 0) * r.n;
    const el = document.createElement("div");
    el.className = "trow";
    el.appendChild(iconEl(r.item, "ticon"));
    const nm = document.createElement("span");
    nm.className = "tname"; nm.textContent = r.item.name;
    const c = document.createElement("span");
    c.className = "tcnt"; c.textContent = fmt(r.n);
    const w = document.createElement("span");
    w.className = "tw";
    w.textContent = r.item.weight ? fmt(Math.round((r.item.weight * r.n) / 100)) + " kg" : "";
    el.append(nm, c, w);
    totEl.appendChild(el);
  }
  $("#weight").textContent = fmt(Math.round(weight / 100)) + " kg";
  const bEl = $("#benches");
  bEl.innerHTML = "";
  [...benches].sort().forEach(b => {
    const el = document.createElement("div");
    el.className = "brow"; el.textContent = b;
    const bid = benchItemId(b);
    if (bid) {
      el.classList.add("linked");
      el.title = "Show what this bench costs to build";
      el.onclick = () => setRoot(bid);
    }
    bEl.appendChild(el);
  });
}

/* ---------- tooltip ---------- */

function showTip(node, e) {
  const t = $("#tip");
  const it = node.item;
  let html = `<div class="t-name">${it.name}</div>`;
  if (it.desc) html += `<div class="t-desc">${it.desc}</div>`;
  const stats = [];
  if (node.mode === "craft") stats.push(`craft ×${fmt(node.crafts)} @ ${node.recipe.benches[0] || "?"}`);
  if (it.weight) stats.push(`${(it.weight / 100).toFixed(1)} kg each`);
  if (it.stack) stats.push(`stack ${it.stack}`);
  if (stats.length) html += `<div class="t-stats">${stats.join(" · ")}</div>`;
  t.innerHTML = html;
  t.classList.remove("hidden");
  moveTip(e);
}
function moveTip(e) {
  const t = $("#tip");
  const x = Math.min(e.clientX + 16, innerWidth - t.offsetWidth - 12);
  const y = Math.min(e.clientY + 16, innerHeight - t.offsetHeight - 12);
  t.style.left = x + "px"; t.style.top = y + "px";
}
function hideTip() { $("#tip").classList.add("hidden"); }

/* ---------- pan & zoom ---------- */

function applyView() {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
}

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const factor = Math.exp(-e.deltaY * 0.0015);
    const k2 = Math.min(2.5, Math.max(0.25, view.k * factor));
    const r = stage.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    view.x = px - ((px - view.x) / view.k) * k2;
    view.y = py - ((py - view.y) / view.k) * k2;
    view.k = k2;
  } else {
    view.x -= e.deltaX; view.y -= e.deltaY;
  }
  applyView();
}, { passive: false });

/* touch: one-finger pan, two-finger pinch zoom */
let touch = null;
function pinchInit(a, b) {
  return {
    mode: "pinch",
    d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2,
    k: view.k, ox: view.x, oy: view.y,
  };
}
stage.addEventListener("touchstart", (e) => {
  hideTip();
  $("#sidebar").classList.remove("open");
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touch = { mode: "pan", sx: t.clientX, sy: t.clientY, ox: view.x, oy: view.y };
  } else if (e.touches.length === 2) {
    touch = pinchInit(e.touches[0], e.touches[1]);
  }
}, { passive: true });
stage.addEventListener("touchmove", (e) => {
  if (!touch) return;
  e.preventDefault();
  if (touch.mode === "pan" && e.touches.length === 1) {
    const t = e.touches[0];
    view.x = touch.ox + t.clientX - touch.sx;
    view.y = touch.oy + t.clientY - touch.sy;
  } else if (touch.mode === "pinch" && e.touches.length === 2) {
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const k2 = Math.min(2.5, Math.max(0.25, touch.k * d / touch.d));
    const r = stage.getBoundingClientRect();
    const px = touch.cx - r.left, py = touch.cy - r.top;
    view.x = px - ((px - touch.ox) / touch.k) * k2;
    view.y = py - ((py - touch.oy) / touch.k) * k2;
    view.k = k2;
  }
  applyView();
}, { passive: false });
const touchEnd = (e) => {
  if (e.touches.length === 2) touch = pinchInit(e.touches[0], e.touches[1]);
  else if (e.touches.length === 1) {
    const t = e.touches[0];
    touch = { mode: "pan", sx: t.clientX, sy: t.clientY, ox: view.x, oy: view.y };
  } else touch = null;
};
stage.addEventListener("touchend", touchEnd);
stage.addEventListener("touchcancel", touchEnd);

let pan = null;
stage.addEventListener("mousedown", (e) => {
  if (e.target.closest(".card")) return;
  pan = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  stage.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!pan) return;
  view.x = pan.ox + e.clientX - pan.sx;
  view.y = pan.oy + e.clientY - pan.sy;
  applyView();
});
window.addEventListener("mouseup", () => { pan = null; stage.classList.remove("panning"); });

function centerTree() {
  view = { x: 40, y: Math.max(20, (stage.clientHeight - treeEl.scrollHeight) / 2), k: 1 };
  const w = treeEl.scrollWidth + 120;
  if (w * view.k > stage.clientWidth) view.k = Math.max(0.35, stage.clientWidth / w);
  applyView();
  requestAnimationFrame(drawWires);
}

/* ---------- search ---------- */

const searchEl = $("#search"), resultsEl = $("#results");
let sel = -1, matches = [];

function doSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { resultsEl.classList.add("hidden"); return; }
  const craftable = Object.keys(DATA.byOutput);
  matches = craftable
    .map(id => ({ id, item: DATA.items[id], name: DATA.items[id].name.toLowerCase() }))
    .filter(m => m.name.includes(q))
    .sort((a, b) => {
      const as = a.name.startsWith(q), bs = b.name.startsWith(q);
      if (as !== bs) return as ? -1 : 1;
      return a.name.length - b.name.length;
    })
    .slice(0, 12);
  sel = -1;
  resultsEl.innerHTML = "";
  matches.forEach((m, i) => {
    const el = document.createElement("div");
    el.className = "result";
    el.appendChild(iconEl(m.item, "ricon"));
    const nm = document.createElement("span");
    nm.className = "rname"; nm.textContent = m.item.name;
    const cat = document.createElement("span");
    cat.className = "rcat"; cat.textContent = m.item.cat;
    el.append(nm, cat);
    el.onclick = () => pick(i);
    resultsEl.appendChild(el);
  });
  resultsEl.classList.toggle("hidden", !matches.length);
}

function pick(i) {
  const m = matches[i];
  if (!m) return;
  resultsEl.classList.add("hidden");
  setRoot(m.id);
}

searchEl.addEventListener("input", () => doSearch(searchEl.value));
searchEl.addEventListener("keydown", (e) => {
  if (resultsEl.classList.contains("hidden")) return;
  if (e.key === "ArrowDown") { sel = Math.min(sel + 1, matches.length - 1); paintSel(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); paintSel(); e.preventDefault(); }
  else if (e.key === "Enter") { pick(sel >= 0 ? sel : 0); }
  else if (e.key === "Escape") { resultsEl.classList.add("hidden"); }
});
function paintSel() {
  resultsEl.querySelectorAll(".result").forEach((el, i) => el.classList.toggle("sel", i === sel));
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#searchwrap")) resultsEl.classList.add("hidden");
});

/* ---------- quantity ---------- */

const qtyEl = $("#qty");
function setQty(n) {
  qty = Math.max(1, Math.floor(n) || 1);
  qtyEl.value = qty;
  if (rootId) rebuild();
}
qtyEl.addEventListener("change", () => setQty(+qtyEl.value));
$("#qty-plus").onclick = () => setQty(qty + 1);
$("#qty-minus").onclick = () => setQty(qty - 1);

/* ---------- expand / collapse all ---------- */

$("#expand-all").onclick = () => {
  if (!rootId) return;
  modeOverride.clear();
  rebuild();
  centerTree();
};
$("#collapse-all").onclick = () => {
  if (!rootId) return;
  modeOverride.clear();
  // fold the tree to its first tier: every craftable child of the root gathers
  for (const c of treeRoot.children) {
    if (c.recs.length && !c.cyclic) modeOverride.set(c.path, "gather");
  }
  rebuild();
  centerTree();
};

$("#totals-fab").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

window.addEventListener("resize", () => requestAnimationFrame(drawWires));

/* ---------- boot ---------- */

loadData().then(() => {
  searchEl.focus();
  const param = new URLSearchParams(location.search).get("item");
  if (param && DATA.items[param]) { rootId = param; rebuild(); centerTree(); }
});

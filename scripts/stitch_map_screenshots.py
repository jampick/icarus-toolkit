"""Stitch in-game ICARUS map screenshots into one grid-registered map image.

Input: a directory of screenshots of the in-game map (which draws a 16x16
grid with cell labels like "C7" near each cell's top-left intersection),
plus an anchors.json produced by vision agents that lists, per screenshot,
the visible cell labels and their approximate positions as width/height
fractions.

The script does the precision work the agents cannot: it detects the actual
grid-line pixel positions in each screenshot, snaps the approximate label
anchors to the detected line lattice, fits an affine (scale + offset, no
rotation) model per screenshot, then resamples whole cells onto a canonical
canvas at a fixed pixels-per-cell so the result registers exactly with the
site's atlas grid (cell A1 top-left, P16 bottom-right).

Usage:
  python scripts/stitch_map_screenshots.py \
      --anchors anchors.json --shots-dir <dir> \
      --out site/maps/Terrain_0XX.jpg --cell-px 384 [--grid 16]

anchors.json format:
  [{"file": "shot.png", "labels": [{"cell": "C7", "fx": 0.42, "fy": 0.31}]}]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# Cell labels sit inside the cell, slightly right of and below the cell's
# top-left grid intersection. As a fraction of one cell's span:
LABEL_OFFSET = 0.06

# A snapped anchor may not deviate from its predicted lattice position by
# more than this fraction of a cell span, else it is dropped as misread.
SNAP_TOL = 0.35


def parse_cell(cell):
    cell = cell.strip().upper()
    col = ord(cell[0]) - 65
    row = int(cell[1:]) - 1
    return col, row


def detect_lines(gray, axis):
    """Score each column (axis=0) or row (axis=1) for being a grid line.

    Grid lines are thin light overlays that persist across the whole frame,
    while terrain edges are local. Score = mean over the cross axis of how
    much a pixel exceeds the average of its neighbours a few px away.
    """
    a = gray.astype(np.float32)
    if axis == 1:
        a = a.T
    left = np.roll(a, 4, axis=1)
    right = np.roll(a, -4, axis=1)
    ridge = a - (left + right) / 2.0
    ridge[:, :4] = 0
    ridge[:, -4:] = 0
    return np.clip(ridge, 0, None).mean(axis=0)


def peak_positions(score, min_sep):
    """Local maxima of score at least min_sep apart, strongest first,
    with sub-pixel refinement via parabola fit."""
    idx = np.argsort(score)[::-1]
    chosen = []
    for i in idx:
        if score[i] <= 0:
            break
        if all(abs(i - c) >= min_sep for c in chosen):
            chosen.append(int(i))
        if len(chosen) > 40:
            break
    out = []
    for i in chosen:
        if 1 <= i < len(score) - 1:
            denom = score[i - 1] - 2 * score[i] + score[i + 1]
            shift = 0.0 if denom == 0 else 0.5 * (score[i - 1] - score[i + 1]) / denom
            out.append(i + float(np.clip(shift, -1, 1)))
        else:
            out.append(float(i))
    return sorted(out)


def fit_axis(anchor_px, anchor_idx, lines):
    """Fit px = scale * grid_index + offset.

    anchor_px: approximate pixel positions of intersections (from labels)
    anchor_idx: their grid indices (col or row numbers)
    lines: detected line positions to snap to
    Returns (scale, offset, n_used).
    """
    anchor_px = np.asarray(anchor_px, dtype=np.float64)
    anchor_idx = np.asarray(anchor_idx, dtype=np.float64)

    # First pass: rough scale/offset straight from the (noisy) anchors.
    if len(set(anchor_idx.tolist())) >= 2:
        scale0, off0 = np.polyfit(anchor_idx, anchor_px, 1)
    else:
        raise ValueError("need labels spanning at least 2 columns and 2 rows")

    # Snap each predicted intersection to the nearest detected line.
    lines = np.asarray(lines, dtype=np.float64)
    snapped_px, snapped_idx = [], []
    for gi in sorted(set(anchor_idx.tolist())):
        pred = scale0 * gi + off0
        if len(lines) == 0:
            continue
        j = int(np.argmin(np.abs(lines - pred)))
        if abs(lines[j] - pred) <= SNAP_TOL * abs(scale0):
            snapped_px.append(lines[j])
            snapped_idx.append(gi)
    if len(snapped_px) >= 2:
        scale, off = np.polyfit(snapped_idx, snapped_px, 1)
        return float(scale), float(off), len(snapped_px)
    return float(scale0), float(off0), 0


def process_shot(entry, shots_dir, grid):
    path = shots_dir / entry["file"]
    img = Image.open(path).convert("RGB")
    W, H = img.size
    gray = np.asarray(img.convert("L"))

    cols, rows, xs, ys = [], [], [], []
    for lab in entry["labels"]:
        try:
            c, r = parse_cell(lab["cell"])
        except (ValueError, IndexError):
            continue
        if not (0 <= c < grid and 0 <= r < grid):
            continue
        cols.append(c)
        rows.append(r)
        xs.append(lab["fx"] * W)
        ys.append(lab["fy"] * H)
    if len(set(cols)) < 2 or len(set(rows)) < 2:
        raise ValueError(f"{entry['file']}: not enough distinct labels")

    # Rough cell size from label lattice, used to pick peak separation and
    # to shift label centers back onto their top-left intersections.
    cw0 = abs(np.polyfit(cols, xs, 1)[0])
    ch0 = abs(np.polyfit(rows, ys, 1)[0])
    ax = [x - LABEL_OFFSET * cw0 for x in xs]
    ay = [y - LABEL_OFFSET * ch0 for y in ys]

    vlines = peak_positions(detect_lines(gray, axis=0), min_sep=cw0 * 0.5)
    hlines = peak_positions(detect_lines(gray, axis=1), min_sep=ch0 * 0.5)

    sx, ox, nx = fit_axis(ax, cols, vlines)
    sy, oy, ny = fit_axis(ay, rows, hlines)
    print(f"  {entry['file']}: {W}x{H}, cell {sx:.1f}x{sy:.1f}px, "
          f"snapped {nx} cols / {ny} rows of {len(set(cols))}/{len(set(rows))} labels")
    return {"img": img, "W": W, "H": H, "sx": sx, "ox": ox, "sy": sy, "oy": oy,
            "file": entry["file"]}


def sample_region(s, col0, row0, col1, row1, px=192):
    """Resample the world-rect [col0..col1]x[row0..row1] (grid units) from
    shot s to a px-wide thumbnail, returns float RGB array."""
    x0 = s["sx"] * col0 + s["ox"]
    y0 = s["sy"] * row0 + s["oy"]
    x1 = s["sx"] * col1 + s["ox"]
    y1 = s["sy"] * row1 + s["oy"]
    h = max(1, int(px * (row1 - row0) / max(col1 - col0, 1e-6)))
    tile = s["img"].transform(
        (px, h), Image.AFFINE,
        ((x1 - x0) / px, 0, x0, 0, (y1 - y0) / h, y0),
        resample=Image.BILINEAR)
    return np.asarray(tile, dtype=np.float32)


def overlap_correction(cell, chosen, shots, grid, margin):
    """If another shot shows part of this cell, fit a per-channel linear map
    (match mean/std over the shared strip) that lifts the chosen shot's tile
    to the other shot's exposure. Used to remove baked-in cloud/fog haze.
    Returns (gain, bias) arrays or None."""
    col = ord(cell[0]) - 65
    row = int(cell[1:]) - 1
    best = None
    for s in shots:
        if s is chosen:
            continue
        # visible sub-rect of this cell in shot s, in grid units
        c0 = max(col, (-margin - s["ox"]) / s["sx"])
        c1 = min(col + 1, (s["W"] + margin - s["ox"]) / s["sx"])
        r0 = max(row, (-margin - s["oy"]) / s["sy"])
        r1 = min(row + 1, (s["H"] + margin - s["oy"]) / s["sy"])
        frac = max(0.0, c1 - c0) * max(0.0, r1 - r0)
        if frac < 0.15:
            continue
        if best is None or frac > best[0]:
            best = (frac, s, c0, r0, c1, r1)
    if best is None:
        return None
    frac, s, c0, r0, c1, r1 = best
    ref = sample_region(s, c0, r0, c1, r1)
    fog = sample_region(chosen, c0, r0, c1, r1)
    gain = ref.std(axis=(0, 1)) / np.maximum(fog.std(axis=(0, 1)), 1e-3)
    gain = np.clip(gain, 0.5, 2.5)
    bias = ref.mean(axis=(0, 1)) - gain * fog.mean(axis=(0, 1))
    print(f"  defog {cell}: ref={Path(s['file']).stem[-6:]} overlap={frac:.2f} "
          f"gain={np.round(gain, 2)} bias={np.round(bias, 1)}")
    return gain, bias


def stitch(shots, grid, cell_px, margin=3, prefer=None, dump_cells=None, dump_dir=None,
           defog=None):
    canvas = Image.new("RGB", (grid * cell_px, grid * cell_px), (8, 10, 12))
    best = np.full((grid, grid), -1.0)
    src = [[None] * grid for _ in range(grid)]
    prefer = prefer or {}
    dump_cells = dump_cells or set()

    for s in shots:
        for col in range(grid):
            for row in range(grid):
                x0 = s["sx"] * col + s["ox"]
                y0 = s["sy"] * row + s["oy"]
                x1 = x0 + s["sx"]
                y1 = y0 + s["sy"]
                if x0 < -margin or y0 < -margin or x1 > s["W"] + margin or y1 > s["H"] + margin:
                    continue
                cell = f"{chr(65 + col)}{row + 1}"
                if cell in dump_cells and dump_dir:
                    tile = s["img"].transform(
                        (cell_px, cell_px), Image.AFFINE,
                        ((x1 - x0) / cell_px, 0, x0, 0, (y1 - y0) / cell_px, y0),
                        resample=Image.BICUBIC)
                    tile.save(Path(dump_dir) / f"dump_{cell}_{Path(s['file']).stem[-6:]}.png")
                # Explicit override wins; else prefer the capture where this
                # cell sits farthest from the frame border (less vignette,
                # no UI chrome or map-edge fog at frame edges).
                cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                pref = min(cx, cy, s["W"] - cx, s["H"] - cy)
                want = prefer.get(cell)
                if want is not None:
                    pref = pref + 1e6 if want in s["file"] else -1e6
                if pref > best[row][col]:
                    best[row][col] = pref
                    src[row][col] = (s, x0, y0, x1, y1)

    defog = defog or set()
    filled = 0
    for row in range(grid):
        for col in range(grid):
            if src[row][col] is None:
                continue
            s, x0, y0, x1, y1 = src[row][col]
            tile = s["img"].transform(
                (cell_px, cell_px), Image.AFFINE,
                ((x1 - x0) / cell_px, 0, x0, 0, (y1 - y0) / cell_px, y0),
                resample=Image.BICUBIC)
            cell = f"{chr(65 + col)}{row + 1}"
            if cell in defog:
                corr = overlap_correction(cell, s, shots, grid, margin)
                if corr is not None:
                    gain, bias = corr
                    arr = np.asarray(tile, dtype=np.float32) * gain + bias
                    tile = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            canvas.paste(tile, (col * cell_px, row * cell_px))
            filled += 1

    missing = [f"{chr(65 + c)}{r + 1}" for r in range(grid) for c in range(grid)
               if src[r][c] is None]
    print(f"filled {filled}/{grid * grid} cells")
    if missing:
        print("MISSING cells: " + ", ".join(missing))
    return canvas, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchors", required=True)
    ap.add_argument("--shots-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cell-px", type=int, default=384)
    ap.add_argument("--grid", type=int, default=16)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--prefer", default="",
                    help="comma list CELL=filename-substring to force a cell's source shot")
    ap.add_argument("--dump-cells", default="",
                    help="comma list of cells; save every candidate tile for each to --dump-dir")
    ap.add_argument("--dump-dir", default=".")
    ap.add_argument("--defog", default="",
                    help="comma list of cells to exposure-match against overlapping shots")
    args = ap.parse_args()

    prefer = {}
    for kv in filter(None, args.prefer.split(",")):
        cell, _, want = kv.partition("=")
        prefer[cell.strip().upper()] = want.strip()
    dump_cells = {c.strip().upper() for c in args.dump_cells.split(",") if c.strip()}

    with open(args.anchors, encoding="utf-8") as f:
        anchors = json.load(f)

    shots = []
    for entry in anchors:
        try:
            shots.append(process_shot(entry, Path(args.shots_dir), args.grid))
        except ValueError as e:
            print(f"  SKIP: {e}", file=sys.stderr)

    canvas, missing = stitch(shots, args.grid, args.cell_px, prefer=prefer,
                             dump_cells=dump_cells, dump_dir=args.dump_dir,
                             defog={c.strip().upper() for c in args.defog.split(",") if c.strip()})
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "JPEG", quality=args.quality, optimize=True)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB, "
          f"{canvas.size[0]}x{canvas.size[1]})")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())

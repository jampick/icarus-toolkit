#!/usr/bin/env python3
"""Reveal the full in-game map for a local ICARUS prospect (fog of war).

The fog file is a list of revealed exploration cells: uint32 count, then
(x, y, state) uint32 triplets, state 4 = revealed, on an 80x80 grid
(16x16 map squares x 5 subcells). This writes every cell as revealed.

Usage (game must be CLOSED):
    python tools/reveal_fog.py                # list fog files
    python tools/reveal_fog.py Terrain_016    # reveal Olympus

A .bak copy of the original is written next to the file the first time.
Local solo prospects only; on a dedicated server the fog lives with your
character data on the host.
"""
import shutil
import struct
import sys
from pathlib import Path

GRID = 80
STATE = 4

base = Path.home() / "AppData/Local/Icarus/Saved/PlayerData"


def fog_files():
    return sorted(base.glob("*/MapData/*.fog"))


def main():
    files = fog_files()
    if len(sys.argv) < 2:
        print("fog files found:")
        for f in files:
            n = struct.unpack_from("<I", f.read_bytes(), 0)[0]
            print(f"  {f}  ({n} cells revealed, {n / (GRID * GRID) * 100:.0f}%)")
        print(f"\nrun: python {sys.argv[0]} <Terrain_0XX> to fully reveal one")
        return

    want = sys.argv[1]
    targets = [f for f in files if f.stem == want]
    if not targets:
        print(f"no fog file for {want}. Enter the map in a solo prospect once, "
              "save and exit, then rerun.")
        sys.exit(1)
    for f in targets:
        bak = f.with_suffix(".fog.bak")
        if not bak.exists():
            shutil.copy(f, bak)
            print(f"backup -> {bak}")
        out = bytearray(struct.pack("<I", GRID * GRID))
        for y in range(GRID):
            for x in range(GRID):
                out += struct.pack("<III", x, y, STATE)
        f.write_bytes(out)
        print(f"revealed {GRID * GRID} cells -> {f}")


if __name__ == "__main__":
    main()

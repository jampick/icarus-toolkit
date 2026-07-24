#!/usr/bin/env python3
"""Extract JSON data tables from Icarus' Data/data.pak (UE4 pak v11, Zlib, unencrypted).

Usage:
  python3 extract_pak.py <data.pak> --list
  python3 extract_pak.py <data.pak> --extract 'D_ProcessorRecipes.json' -o out_dir
  python3 extract_pak.py <data.pak> --extract '*.json' -o out_dir
"""
import argparse
import fnmatch
import struct
import sys
import zlib
from pathlib import Path

MAGIC = 0x5A6F12E1


class Reader:
    def __init__(self, data, pos=0):
        self.d = data
        self.p = pos

    def u8(self):
        v = self.d[self.p]; self.p += 1; return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.p)[0]; self.p += 4; return v

    def i32(self):
        v = struct.unpack_from("<i", self.d, self.p)[0]; self.p += 4; return v

    def u64(self):
        v = struct.unpack_from("<Q", self.d, self.p)[0]; self.p += 8; return v

    def i64(self):
        v = struct.unpack_from("<q", self.d, self.p)[0]; self.p += 8; return v

    def skip(self, n):
        self.p += n

    def fstring(self):
        n = self.i32()
        if n >= 0:
            s = self.d[self.p:self.p + n].split(b"\0")[0].decode("utf-8", "replace")
            self.p += n
        else:  # UTF-16
            n = -n
            s = self.d[self.p:self.p + n * 2].decode("utf-16-le", "replace").rstrip("\0")
            self.p += n * 2
        return s


def read_footer(f, size):
    # v11 footer: guid(16) + bEncryptedIndex(1) + magic(4) + ver(4) + idxOff(8) + idxSize(8) + hash(20) + 5*32 compression
    f.seek(size - 221)
    d = f.read(221)
    r = Reader(d)
    r.skip(16)
    encrypted = r.u8()
    magic, ver = r.u32(), r.u32()
    if magic != MAGIC:
        sys.exit("pak magic not found - not a v11 footer?")
    if encrypted:
        sys.exit("encrypted index not supported")
    idx_off, idx_size = r.i64(), r.i64()
    r.skip(20)
    methods = ["None"] + [d[r.p + i * 32:r.p + (i + 1) * 32].split(b"\0")[0].decode() for i in range(5)]
    return ver, idx_off, idx_size, methods


def decode_entry(blob, off):
    """Decode a bit-packed pak entry (UE4 FPakFile::DecodePakEntry)."""
    r = Reader(blob, off)
    v = r.u32()
    if (v & 0x3F) == 0x3F:
        r.u32()  # explicit compression block size (read before offset)
    comp_idx = (v >> 23) & 0x3F
    encrypted = bool((v >> 22) & 1)
    block_count = (v >> 6) & 0xFFFF
    offset = r.u32() if v & (1 << 31) else r.u64()
    uncomp = r.u32() if v & (1 << 30) else r.u64()
    if comp_idx:
        size = r.u32() if v & (1 << 29) else r.u64()
    else:
        size = uncomp
    blocks = [r.u32() for _ in range(block_count)] if block_count > 1 else []
    return dict(offset=offset, size=size, uncomp=uncomp, comp_idx=comp_idx,
                encrypted=encrypted, block_count=block_count, block_sizes=blocks)


def entry_header_size(comp_idx, block_count):
    # offset(8)+size(8)+uncomp(8)+methodIdx(4)+hash(20) [+ blocks] + flags(1)+blocksize(4)
    n = 8 + 8 + 8 + 4 + 20
    if comp_idx:
        n += 4 + block_count * 16
    return n + 1 + 4


def load_index(f, idx_off, idx_size):
    f.seek(idx_off)
    r = Reader(f.read(idx_size))
    mount = r.fstring()
    num = r.i32()
    r.u64()  # path hash seed
    if r.i32():  # has path-hash index
        r.i64(); r.i64(); r.skip(20)
    has_fdi = r.i32()
    if not has_fdi:
        sys.exit("no full directory index")
    fdi_off, fdi_size = r.i64(), r.i64()
    r.skip(20)
    enc_size = r.i32()
    encoded = r.d[r.p:r.p + enc_size]

    f.seek(fdi_off)
    fr = Reader(f.read(fdi_size))
    files = {}
    for _ in range(fr.i32()):
        dirname = fr.fstring()
        for _ in range(fr.i32()):
            fname = fr.fstring()
            files[(mount + dirname + fname).replace("//", "/")] = fr.i32()
    return files, encoded


def extract(f, entry, methods):
    f.seek(entry["offset"] + entry_header_size(entry["comp_idx"], entry["block_count"]))
    raw = f.read(entry["size"])
    method = methods[entry["comp_idx"]]
    if method == "None":
        return raw
    if method != "Zlib":
        sys.exit(f"unsupported compression: {method}")
    if entry["block_count"] <= 1:
        return zlib.decompress(raw)
    out, p = [], 0
    for bs in entry["block_sizes"]:
        out.append(zlib.decompress(raw[p:p + bs]))
        p += bs
    return b"".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pak")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--extract", metavar="GLOB")
    ap.add_argument("-o", "--out", default=".")
    args = ap.parse_args()

    with open(args.pak, "rb") as f:
        size = Path(args.pak).stat().st_size
        ver, idx_off, idx_size, methods = read_footer(f, size)
        files, encoded = load_index(f, idx_off, idx_size)

        if args.list or not args.extract:
            for path in sorted(files):
                print(path)
            print(f"-- {len(files)} files, pak v{ver}, methods {methods}", file=sys.stderr)
            return

        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for path, enc_off in sorted(files.items()):
            base = path.rsplit("/", 1)[-1]
            if not (fnmatch.fnmatch(base, args.extract) or fnmatch.fnmatch(path, args.extract)):
                continue
            entry = decode_entry(encoded, enc_off)
            data = extract(f, entry, methods)
            (out_dir / base).write_bytes(data)
            n += 1
            print(f"{base}  {len(data)/1024:.0f} KB")
        print(f"extracted {n} files -> {out_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()

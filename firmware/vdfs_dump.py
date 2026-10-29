#!/usr/bin/env python3
"""Dump files out of a Samsung Tizen VDFS volume image (layout 2007).

Platform rootfs images extracted from MSDU11 firmware (platform.img)
are VDFS volumes: header "VDFS2007"/"VDFS4_VOLUME", superblock at 0x200,
a catalog b-tree (head magic "eHND") mapping object keys to 4096-byte
file extents. Reverse-engineered from HinTak/vdfs-tools source and
verified on a Tizen 6.5 (KSU2E) platform image.

Usage:
  python3 vdfs_dump.py <platform.img> [name-regex] [outdir]

  # list every file in the catalog
  python3 vdfs_dump.py platform.img
  # dump sdbd and friends
  python3 vdfs_dump.py platform.img 'sdbd' ./out
"""
import os
import re
import struct
import sys

BNODE = 16384
BLOCK = 4096

# catalog record types
RT_DUMMY = 0x00
RT_FOLDER = 0x01
RT_FILE = 0x02
RT_HLINK = 0x03
RT_ILINK = 0x05


def find_catalog_head(f, image_size):
    """Locate the catalog b-tree head: bnode with magic "eHND".

    On KSU2E it sits near the end of the image (0x51534000 in a 1.42GB
    file), so scan the last 512MB in 4KB steps looking for the magic
    followed by a plausible height/root.
    """
    scan_from = max(0x100000, image_size - 0x20000000)
    f.seek(scan_from)
    chunk = f.read()
    idx = chunk.find(b"eHND")
    while idx != -1:
        off = scan_from + idx
        height = struct.unpack("<H", chunk[idx + 16: idx + 18])[0]
        root = struct.unpack("<I", chunk[idx + 12: idx + 16])[0]
        if 1 <= height <= 8 and 0 < root < 0x100000:
            return off
        idx = chunk.find(b"eHND", idx + 1)
    sys.exit("catalog head (eHND) not found — not a VDFS2007 volume?")


class Vdfs:
    def __init__(self, path):
        self.f = open(path, "rb")
        info = self.f.seek(0, os.SEEK_END) or 0
        info = self.f.seek(0, os.SEEK_END)
        image_size = self.f.tell()
        self.cat_head = find_catalog_head(self.f, image_size)
        self.f.seek(0)
        self.cache = {}
        print(f"# catalog head at 0x{self.cat_head:x}", file=sys.stderr)

    def bnode_data(self, node_id):
        if node_id not in self.cache:
            self.f.seek(self.cat_head + node_id * BNODE)
            self.cache[node_id] = self.f.read(BNODE)
        return self.cache[node_id]

    def parse_bnode(self, node_id):
        d = self.bnode_data(node_id)
        recs = struct.unpack("<H", d[14:16])[0]
        next_id = struct.unpack("<I", d[20:24])[0]
        node_type = struct.unpack("<I", d[28:32])[0]
        offs = [struct.unpack("<I", d[BNODE - 4 * (recs + 1 - i):
                              BNODE - 4 * (recs - i)])[0]
                for i in range(recs + 1)]
        return d, recs, offs, next_id, node_type

    @staticmethod
    def records(d, recs, offs):
        out = []
        for i in range(recs):
            rec = d[offs[i + 1]:offs[i]]
            if len(rec) < 8:
                continue
            key_len, rec_len = struct.unpack("<HH", rec[4:8])
            if not (8 <= key_len <= len(rec)) or not (key_len <= rec_len <= 3000):
                continue
            out.append((rec[:key_len], rec[key_len:key_len + rec_len - key_len]))
        return out

    @staticmethod
    def key_info(key):
        parent_id = struct.unpack("<Q", key[8:16])[0]
        object_id = struct.unpack("<Q", key[16:24])[0]
        record_type = key[24]
        name_len = key[25]
        name = key[26:26 + name_len]
        return parent_id, object_id, record_type, name

    def walk_leaves(self):
        head = self.bnode_data(0)
        root = struct.unpack("<I", head[12:16])[0]
        height = struct.unpack("<H", head[16:18])[0]
        print(f"# catalog root={root} height={height}", file=sys.stderr)
        stack, seen = [root], set()
        while stack:
            nid = stack.pop()
            if nid in seen:
                continue
            seen.add(nid)
            d, _, offs, next_id, ntype = self.parse_bnode(nid)
            if ntype == 1:  # index node: record values point at children
                for k, v in self.records(d, len(offs) - 1, offs):
                    child = struct.unpack("<I", v[:4])[0]
                    if child and child not in seen:
                        stack.append(child)
            elif ntype == 2:  # leaf: yield, then follow next-leaf chain
                cur, hops = nid, 0
                while cur and hops < 100000:
                    yield cur
                    _, _, _, nid2, _ = self.parse_bnode(cur)
                    cur = nid2
                    hops += 1

    @staticmethod
    def fork_of(val):
        # file record = 80-byte folder_record + fork{size u64, tbc u64,
        # 9 x iextent{begin,length,iblock} u64}. Offsets verified against
        # HinTak/vdfs-tools on the KSU2E image.
        if len(val) < 96:
            return None
        size = struct.unpack("<Q", val[80:88])[0]
        tbc = struct.unpack("<Q", val[88:96])[0]
        exts = []
        for i in range(9):
            o = 96 + i * 24
            if o + 24 > len(val):
                break
            begin, length, iblock = struct.unpack("<QQQ", val[o:o + 24])
            if begin or length:
                exts.append((begin, length, iblock))
        return size, tbc, exts

    def files(self):
        files = {}
        for lid in self.walk_leaves():
            d, recs_n, offs, _, _ = self.parse_bnode(lid)
            for key, val in self.records(d, recs_n, offs):
                try:
                    _pid, oid, rtype, name = self.key_info(key)
                except struct.error:
                    continue
                if rtype != RT_FILE:
                    continue
                fork = self.fork_of(val)
                if fork is None:
                    continue
                size, tbc, exts = fork
                files[oid] = (name.decode("latin1", "replace"), size, exts)
        return files

    def dump(self, oid, name, size, exts, outdir):
        blob = b""
        for begin, length, _ib in exts:
            self.f.seek(begin * BLOCK)
            blob += self.f.read(length * BLOCK)
        blob = blob[:size]
        out = os.path.join(outdir, "dump_" + re.sub(r"[^A-Za-z0-9._-]", "_", name))
        with open(out, "wb") as g:
            g.write(blob)
        return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    img = sys.argv[1]
    filt = re.compile(sys.argv[2], re.IGNORECASE) if len(sys.argv) > 2 else None
    outdir = sys.argv[3] if len(sys.argv) > 3 else "."
    os.makedirs(outdir, exist_ok=True)

    v = Vdfs(img)
    files = v.files()
    print(f"# file records: {len(files)}", file=sys.stderr)
    for oid in sorted(files, key=lambda o: files[o][0]):
        name, size, exts = files[oid]
        total = sum(l for _, l, _ in exts) * BLOCK
        print(f"oid={oid} {name!r} size={size} raw={total}")
        if filt and filt.search(name):
            out = v.dump(oid, name, size, exts, outdir)
            print(f"  -> {out}")


if __name__ == "__main__":
    main()

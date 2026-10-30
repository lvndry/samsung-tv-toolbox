#!/usr/bin/env python3
"""Extract sections from a Samsung "upgrade.msd" (MSDU11) firmware container.

MSDU11 is the top-level container of Samsung Tizen TV firmware
(T-<BOARD><REGION>.zip -> image/.../upgrade.msd). Layout (verified on
T-KSU2ECDEUC, Tizen 6.5):

  MSDU11 | u32 ver | u64 header_size | u32 nsec
  nsec x { u32 idx, u64 offset, u64 size }          # section table
  u32 nhdr
  nhdr x { u64 offset, u32 size, u8 n, name }       # header blobs

The first header blob (at offset+8) is a "Salted__" AES-256-CBC blob
(iv = sha512(salt)[:16]) holding the OUITH table of contents. Each
encrypted section is AES-256-CBC with iv = sha256(salt)[:16], salt from
the item's OUAESEncryptionDesc.

The board release key is per-board but public: the ubusu community keeps
them in theubusu/unixtract (keys.ukf). For KU2E boards (CU7105, Tizen 6.5,
2023) the key is baked in below; for other boards pass --key or let the
script pull it from a local unixtract checkout.

Usage:
  python3 msdu11.py <upgrade.msd> <outdir> [item names...]
  python3 msdu11.py <upgrade.msd> <outdir>            # lists items
  python3 msdu11.py <upgrade.msd> <outdir> platform   # extracts one

Requires: pip install cryptography
"""
import argparse
import hashlib
import io
import os
import struct
import subprocess
import sys

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# Board release keys (board tag in info.txt "Xxx Board rel key" -> key).
# Source: theubusu/unixtract keys.ukf, community-published.
BOARD_KEYS = {
    # "KantSU2E 2023": CU7105 and other KSU2E boards (Tizen 6.5, 2023)
    "KantSU2E 2023": "13f9ed51b5b5f285ee79a80b5a252ec80b4ca9ff3431bec06e2ec866867d25b8",
}


def aes256cbc(data: bytes, key: bytes, salt: bytes) -> bytes:
    iv = hashlib.sha256(salt).digest()[:16]
    ct = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    return ct.update(data) + ct.finalize()


def resolve_key(key_arg, unixtract_arg):
    if key_arg:
        return bytes.fromhex(key_arg)
    if unixtract_arg:
        out = subprocess.run(
            [sys.executable, os.path.join(unixtract_arg, "unixtract.py"),
             "--print-key"],
            capture_output=True, text=True)
        if out.returncode == 0:
            hexkey = out.stdout.strip().splitlines()[-1]
            return bytes.fromhex(hexkey)
    if len(BOARD_KEYS) == 1:
        return bytes.fromhex(next(iter(BOARD_KEYS.values())))
    sys.exit("no board key: pass --key <hex> or --unixtract <path>")


def parse_msdu(path):
    with open(path, "rb") as f:
        assert f.read(6) == b"MSDU11", "not an MSDU11 container"
        f.read(4)
        f.read(8)  # header_size
        nsec = struct.unpack("<I", f.read(4))[0]
        sections = [struct.unpack("<IQQ", f.read(20)) for _ in range(nsec)]
        nhdr = struct.unpack("<I", f.read(4))[0]
        headers = []
        for _ in range(nhdr):
            off = struct.unpack("<Q", f.read(8))[0]
            size = struct.unpack("<I", f.read(4))[0]
            n = f.read(1)[0]
            headers.append((f.read(n).decode(errors="replace"), off, size))
    return sections, headers


def parse_ouith(pt: bytes):
    r = io.BytesIO(pt)

    def u8():
        return r.read(1)[0]

    def u16():
        return struct.unpack("<H", r.read(2))[0]

    def u32():
        return struct.unpack("<I", r.read(4))[0]

    def u64():
        return struct.unpack("<Q", r.read(8))[0]

    def skip(n):
        r.read(n)

    def hdr():
        return u8(), u32(), u32()

    def skip_u(size):
        skip(size - 4)

    skip(4)  # public key id
    sgsz = u16()
    skip(sgsz)  # signature
    r.read(51)  # magic
    top_count = u32()
    items, info = [], None
    for _ in range(top_count):
        _f, size, tag = hdr()
        if tag == 0x01:  # OUUpgradeItemDesc
            u8()
            iid = u32()
            u8()
            u64()
            u64()
            u16()
            sub_count = u32()
            name, enc, salt = None, False, None
            for _ in range(sub_count):
                _sf, ss, stag = hdr()
                if stag == 0x0A:
                    u8()
                    nl = u8()
                    name = r.read(nl).decode(errors="replace")
                elif stag == 0x07:
                    u8()
                    dcount = u32()
                    for _ in range(dcount):
                        _nf, ns, ntag = hdr()
                        if ntag == 0x12:
                            u8()
                            u32()
                        elif ntag == 0x10:
                            u8()
                            u32()
                            s2 = u16()
                            skip(s2)
                        elif ntag == 0x0E:
                            u8()
                            sl = u8()
                            salt = r.read(sl).hex()
                            u64()
                            enc = True
                        else:
                            skip_u(ns)
                elif stag == 0x13:
                    u8()
                    u32()
                else:
                    skip_u(ss)
            items.append({"name": name, "id": iid, "enc": enc, "salt": salt})
        elif tag == 0x02:  # OUGroupDesc
            u8()
            u32()
            sub_count = u32()
            for _ in range(sub_count):
                _sf, ss, stag = hdr()
                if stag == 0x19:
                    u8()
                    nl = u8()
                    vn = r.read(nl).decode(errors="replace")
                    if ss - nl - 4 == 7:
                        skip(1)
                    mj, mn = u16(), u16()
                    info = f"{vn} {mj}.{mn}"
                else:
                    skip_u(ss)
        else:
            skip_u(size)
    return items, info


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("msd", help="upgrade.msd from the extracted firmware zip")
    ap.add_argument("outdir")
    ap.add_argument("items", nargs="*", help="item names to extract; omit to list")
    ap.add_argument("--key", help="board release key (hex)")
    ap.add_argument("--unixtract", help="path to a theubusu/unixtract checkout")
    a = ap.parse_args()

    key = resolve_key(a.key, a.unixtract)
    os.makedirs(a.outdir, exist_ok=True)
    sections, headers = parse_msdu(a.msd)
    print(f"sections={len(sections)} headers={headers}")
    off, hsize = headers[0][1], headers[0][2]
    with open(a.msd, "rb") as f:
        f.seek(off + 8)
        blob = f.read(hsize - 8)
    assert blob[:8] == b"Salted__", blob[:16].hex()
    salt = blob[8:16]
    pt = aes256cbc(blob[16:], key, salt)
    pad = pt[-1]
    if not (1 <= pad <= 16) or pt[-pad:] != bytes([pad]) * pad:
        sys.exit(f"TOC padding check failed (pad={pad}). Wrong board key?")
    items, info = parse_ouith(pt)
    print(f"image info: {info!r}; items: {len(items)}")
    with open(os.path.join(a.outdir, "toc.ouith"), "wb") as f:
        f.write(pt)
    for i, it in enumerate(items):
        sec = sections[i]
        line = (f"  {i} {it['name']!r} sec_idx={sec[0]} off=0x{sec[1]:x} "
                f"size=0x{sec[2]:x} id={it['id']} enc={it['enc']}")
        if it["id"] != sec[0]:
            line += "  ** id/section mismatch **"
        print(line)
    if not a.items:
        return
    for i, it in enumerate(items):
        if it["name"] not in a.items:
            continue
        _idx, off, size = sections[i]
        with open(a.msd, "rb") as f:
            f.seek(off)
            body = f.read(size)
        if it["enc"]:
            body = aes256cbc(body, key, bytes.fromhex(it["salt"]))
            if body[-1] not in (1, 16):
                print(f"  pad warn {it['name']} last={body[-1]:02x}")
        out = os.path.join(a.outdir, it["name"])
        with open(out, "wb") as f:
            f.write(body)
        print(f"wrote {out} ({len(body)} bytes) head={body[:12].hex()}")


if __name__ == "__main__":
    main()

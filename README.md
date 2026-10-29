# samsung-tv-toolbox

Control a Samsung Tizen TV from your computer over the LAN.

Samsung's own tooling for this is Tizen Studio, which is heavy and mostly
built for app developers. These are small Node scripts that do the everyday
parts directly: pair with the TV, send remote keys, wake it from standby,
turn on Developer Mode, sideload an app, and talk to its `sdb` debug daemon.

It is the computer-side companion to
[tizen-tap](https://github.com/lvndry/tizen-tap), which runs on the TV.
Most scripts work without it; `install-app.js`, `restart.js` and
`stremio.js` need it installed.

Built and tested against a Samsung CU7105 on Tizen 6.5. The remote-control
and sdb parts apply to most modern Samsung smart TVs.

## Quick start

```bash
bun i                               # one dependency, ws (npm i works too)
TV_IP=10.0.0.42 node pair.js        # follow the PIN on the TV; saves token.txt
TV_IP=10.0.0.42 node remote.js power
```

Every script reads the TV's address from `TV_IP`. It defaults to
`127.0.0.1`, which is never your TV, so always set it.

## How it works

`pair.js` opens Samsung's Control 2.0 channel, a TLS websocket on port
`8002`. The first time, the TV shows a PIN on screen; once that's
accepted it issues a token (a long-lived JWT). That token is the only credential. It is
saved to `token.txt` next to the scripts (gitignored, mode 0600), and
running `pair.js` again replaces it when it expires. Every other script
opens the same channel with that token and sends Samsung's JSON messages:
key clicks, state requests, events.

## The scripts

| File | What it does | Run it |
| --- | --- | --- |
| `pair.js` | Pairs with the TV and saves `token.txt`, then nudges the volume so you can see it worked. Run again to re-pair. | `node pair.js` |
| `remote.js` | Sends one or more key presses. Accepts friendly names (`power`, `volumeUp`, `ok`, `up`) or raw TV codes (`KEY_MUTE`, `KEY_0`, `KEY_RED`). | `node remote.js ok up down` |
| `state.js` | Asks the TV for its current app, media and installed-app state. Many models, this one included, answer almost none of these, so empty output is normal. | `node state.js` |
| `listen.js` | Prints everything the TV pushes on the channel. Use the TV to see events. Ctrl+C to stop. | `node listen.js` |
| `wake.js` | Wakes the TV from standby with Wake-on-LAN, in about 10 s. Takes the TV's MAC address (from its network settings or `arp -a`). Apps don't relaunch after a wake. | `node wake.js <MAC> [broadcast]` |
| `install-app.js` | Installs a `.wgt` or `.tpk` from a URL or local path through tizen-tap (port `8091`), then launches it. If the TV rejects the zip, it repacks it once and retries. Needs `hbpin.txt`. | `node install-app.js <url-or-path> "My App"` |
| `restart.js` | Relaunches tizen-tap and the Stremio server after a cold boot or a self-update, and waits until both ports answer. Needs `token.txt` and `hbpin.txt`. | `node restart.js` |
| `stremio.js` | Relaunches only the Stremio server (port `11470`) through tizen-tap and waits for it to answer. Reports a wrong PIN as a 403. Needs `hbpin.txt`. | `node stremio.js` |
| `devmode/devmode.js` | Turns on Developer Mode by driving the TV's menus: Apps panel → settings gear → `123` → keypad `12345`. Survives reboots, so it's a one-time step. | `node devmode/devmode.js` |
| `devmode/hostip.js` | Sets the Developer Mode **Host PC IP**, then reads it back through the Control API to confirm the TV kept it. Takes effect after a TV restart. | `node devmode/hostip.js <ip>` |
| `devmode/keypad.js` | Types `12345` on the on-screen keypad, for when `devmode.js` stops short. Also holds the menu walk the other two share. | `node devmode/keypad.js` |
| `devmode/appsettings.js` | Navigates Smart Hub → Apps to the bottom and leaves "App Settings" selected, the official path to the same toggle. | `node devmode/appsettings.js` |
| `lib/tv.js` | Shared code: `TV_IP`, package IDs, endpoints, token loading, the `RemoteControl` class and the key-name map. | (library) |

`hbpin.txt` holds tizen-tap's 6-digit PIN, shown on the TV screen. It is
gitignored like `token.txt`.

## sdb

`sdb/` is Samsung's debug client:

- `sdb/sdb` is a prebuilt client for macOS arm64, built from `sdb/src/`.
- `sdb/src/` is the upstream [TizenTeam/sdb](https://github.com/TizenTeam/sdb)
  source. It is Apache-2.0 (see `sdb/src/LICENSE`); the rest of this repo
  is MIT.
- `sdb/rea-notes.md` covers setting up the REA reverse-engineering tools
  (Ghidra, binwalk, zig) used on the TV firmware.

The TV's `sdbd` only accepts connections from the address in Developer
Mode's **Host PC IP**, and only reads it at boot. To use `sdb` from your
computer, set Host PC IP to your computer's address (`devmode/hostip.js`)
and restart the TV. tizen-tap needs it set to `127.0.0.1` instead, so the
two can't be used at the same time; see tizen-tap's
[docs/sdbd-and-root.md](https://github.com/lvndry/tizen-tap/blob/main/docs/sdbd-and-root.md).

## Requirements

- Node 18+ or Bun.
- The computer and the TV on the same network (a tailnet works too).
- `token.txt` from `pair.js` for everything except `wake.js`.
- Developer Mode on for `sdb`, and tizen-tap installed for
  `install-app.js`, `restart.js` and `stremio.js`.

## Protocol notes

- The TV uses a self-signed certificate, so TLS verification is off. That's
  acceptable on a private LAN.
- The TV ignores keys sent before it acknowledges the channel.
  `RemoteControl.connect()` waits for the `ms.channel.connect` event before
  resolving, and rejects with a clear error if the TV can't be reached
  (wrong IP, TV off, port 8002 refused).
- This generation of TV uses short key names: `KEY_VOLUP`, not
  `KEY_VOLUMEUP`. `lib/tv.js` maps the friendly names for you.
- tizen-tap and the Stremio server are sideloaded, so neither comes back on
  its own after a cold boot. That's what `restart.js` and `stremio.js` are
  for. Their package IDs differ per install; set `HOMEBREW_ID` /
  `STREMIO_ID` if yours don't match the defaults in `lib/tv.js`.

---

**Not affiliated with Samsung.** This project is not created, sponsored, or
endorsed by Samsung Electronics. Samsung, Tizen, sdb and related names are
trademarks of their respective owners, used here only to describe the hardware
and software this works with.

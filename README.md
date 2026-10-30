# samsung-tv-toolbox

Control a Samsung Tizen TV from your computer over the LAN.

Samsung's own tooling for this is Tizen Studio, which is heavy and mostly
built for app developers. These are small Node scripts that do the everyday
parts directly: pair with the TV, send remote keys, wake it from standby,
launch apps, open URLs, type text, read Developer Mode state, and talk to its `sdb` debug daemon.

Everything here uses Samsung's own interfaces and works on a stock TV. To
install apps that aren't in Samsung's store, see
[tizen-tap](https://github.com/lvndry/tizen-tap), which runs on the TV.

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
| `info.js` | Prints the TV's model, firmware, power state (on or standby), Developer Mode and its IP, and the Wi-Fi MAC address `wake.js` needs. No pairing needed. `--json` prints the full answer. | `node info.js` |
| `remote.js` | Sends one or more key presses. Accepts friendly names (`power`, `volumeUp`, `ok`, `up`) or raw TV codes (`KEY_MUTE`, `KEY_0`, `KEY_RED`). `key:hold` long-presses (1 s, or `key:hold:3000`). `--text` types into an on-screen keyboard that is already open. | `node remote.js ok up down` · `node remote.js --text "hello"` |
| `listen.js` | Prints everything the TV pushes on the channel. Use the TV to see events. `--ask` also requests the current app, media and installed apps; many models, this one included, answer almost none of these. Ctrl+C to stop. | `node listen.js [--ask]` |
| `wake.js` | Wakes the TV from standby with Wake-on-LAN, in about 10 s. Takes the TV's MAC address (from `node info.js` while it's on). Apps don't relaunch after a wake. | `node wake.js <MAC> [broadcast]` |
| `app.js` | Launches, closes or inspects an app by its ID. `--wait <port>` relaunches it unless the port already answers, then waits up to 90 s, which is how you bring back a background service after a cold boot. `--link` launches with a deep-link payload; `--url` opens a page in the TV's browser. | `node app.js <appId> [status\|close] [--wait <port>] [--link <data>]` · `node app.js --url <url>` |
| `apps.js` | Shows which well-known apps (Netflix, YouTube, Prime Video, ...) are running or stopped. `--close` closes the running ones to free memory, sparing any `--keep <id>`. Extra ids passed as arguments are checked too. | `node apps.js [--close] [--keep <id>]` |
| `lib/tv.js` | Shared code: `TV_IP`, the REST endpoint, token loading, the `RemoteControl` class and the key-name map. | (library) |

## Low memory: services keep dying

Seen on a Samsung CU7105 (Tizen 6.5), which has about 1.5 GB of RAM.
Samsung preloads Netflix, YouTube and Prime Video in the background so
they open instantly, and each one holds a web runtime in memory. That can
be enough for the TV to kill a sideloaded background service.

The sign is a service that stops answering on its port while
`node app.js <appId> status` still says the app is running.

Check what is loaded with `node apps.js`. To fix it, close the preloaded
apps and relaunch the service:

```bash
node apps.js --close
node app.js <appId> --wait <port>
```

Closing them is safe. They start normally the next time someone opens them.

## sdb

`sdb/` is Samsung's debug client:

- `sdb/sdb` is a prebuilt client for macOS arm64, built from `sdb/src/`.
- `sdb/src/` is the upstream [TizenTeam/sdb](https://github.com/TizenTeam/sdb)
  source. It is Apache-2.0 (see `sdb/src/LICENSE`); the rest of this repo
  is MIT.

The TV's `sdbd` only accepts connections from the address in Developer
Mode's **Host PC IP**, and only reads it at boot. To use `sdb` from your
computer, set Host PC IP to your computer's address (by hand: Apps, `12345`, Developer mode)
and restart the TV. tizen-tap needs it set to `127.0.0.1` instead, so the
two can't be used at the same time; see tizen-tap's
[docs/sdbd-and-root.md](https://github.com/lvndry/tizen-tap/blob/main/docs/sdbd-and-root.md).

## Requirements

- Node 18+ or Bun.
- The computer and the TV on the same network (a tailnet works too).
- `token.txt` from `pair.js` for everything except `info.js` and `wake.js`.
- Developer Mode on for `sdb`. Turn it on by hand on the TV: open Apps, type `12345` on the remote (or hold Enter), set Developer mode On.

## Protocol notes

- The TV uses a self-signed certificate, so TLS verification is off. That's
  acceptable on a private LAN.
- The TV ignores keys sent before it acknowledges the channel.
  `RemoteControl.connect()` waits for the `ms.channel.connect` event before
  resolving, and rejects with a clear error if the TV can't be reached
  (wrong IP, TV off, port 8002 refused).
- This generation of TV uses short key names: `KEY_VOLUP`, not
  `KEY_VOLUMEUP`. `lib/tv.js` maps the friendly names for you.

---

**Not affiliated with Samsung.** This project is not created, sponsored, or
endorsed by Samsung Electronics. Samsung, Tizen, sdb and related names are
trademarks of their respective owners, used here only to describe the hardware
and software this works with.

# tv-remote

Control a Samsung Tizen smart TV over the network from the Mac, using Samsung's
official **Control 2.0** API (TLS websocket on port 8002).

Tested on a Samsung CU7105 55 (Tizen 6). No Samsung account, no app, no
Bluetooth — just the local network and a one-time pairing.

## Layout

| File | Purpose |
|---|---|
| `remote.js` | The remote. Sends keys to the TV. |
| `token.txt` | Your pairing token (keep this file — it's the whole authentication). |
| `grabtoken.js` | Re-pairing helper: captures a fresh token if the old one expires. |
| `state.js` | Listens for TV state events (app/media — this model is mostly silent on it). |
| `listen.js` | Raw channel listener for debugging. |
| `node_modules`, `bun.lock`, `package.json` | Only dependency is `ws`. |

## Usage

```sh
# Send keys (waits for the TV's handshake automatically)
bun remote.js KEY_MUTE
bun remote.js KEY_VOLUMEUP KEY_VOLUMEUP
bun remote.js KEY_MENU KEY_BACK
```

Friendly names are mapped to this TV's real codes, so both work:
`KEY_VOLUMEUP` → `KEY_VOLUP`, `KEY_VOLUMEDOWN` → `KEY_VOLDOWN`,
`KEY_CHANNELUP` → `KEY_CHUP`, `KEY_CHANNELDOWN` → `KEY_CHDOWN`,
`KEY_ENTER` → `KEY_RETURN`, `KEY_ESC` → `KEY_BACK`.

### Common keys

- Power: `KEY_POWER`
- Volume: `KEY_VOLUP` / `KEY_VOLDOWN`, `KEY_MUTE` (toggle)
- Navigation: `KEY_UP` `KEY_DOWN` `KEY_LEFT` `KEY_RIGHT` `KEY_RETURN` (OK)
- `KEY_MENU`, `KEY_BACK`, `KEY_HOME`, `KEY_INFO`, `KEY_EXIT`
- Channel: `KEY_CHUP` / `KEY_CHDOWN`
- Input: `KEY_SOURCE` (then navigate + `KEY_RETURN` to pick)
- Numbers: `KEY_0` … `KEY_9`

## Setup (done once, already done here)

1. The TV's **network remote control** had to be enabled on the TV
   (on this model: *Settings → Accessibility* → the "remote through network"
   option; also surfaced as a pairing prompt the first time a client connects).
2. Pairing was done with `grabtoken.js`: the TV shows an "Allow?" popup,
   you press **OK** on the TV, then a **PIN** appears on screen; the PIN is
   fed to the script on the *same* websocket connection and a token is
   returned and stored in `token.txt`.

### If the token ever stops working (firmware update, factory reset)

1. `bun grabtoken.js`
2. Press **OK** on the TV when it asks to allow the connection.
3. Read the 8-digit PIN off the TV screen and run:
   `echo 1234-5678 > /tmp/samsung-pin-in.txt` (replace with the real PIN) —
   the script polls that file and saves the new token to `/tmp/samsung-token.txt`.
4. Copy it over: `cp /tmp/samsung-token.txt token.txt`

## Gotchas learned the hard way

- **The TV drops commands sent before its handshake finishes.** `remote.js`
  waits for the `ms.channel.connect` ack before sending — keep that.
- **Wrong key names are silently ignored.** This TV wants `KEY_VOLUP`/
  `KEY_VOLDOWN`, not `KEY_VOLUMEUP`/`KEY_VOLUMEDOWN`. The alias table in
  `remote.js` hides that.
- **Port 8002 uses a self-signed cert** — the TLS client trusts it with
  `rejectUnauthorized: false` (fine on a home LAN).
- Port 8001 (plain ws) works too but is stricter about the pairing flow;
  8002 is the reliable one.
- The TV does **not** expose "what's playing" over the local API on this
  model — it's a one-way remote. You're the eyes.

## TV details

- Name: `Samsung CU7105 55` (AirPlay 2 advertised)
- IP: `192.168.1.119` (may change if DHCP reassigns; the IP is hardcoded in
  the scripts — update it there if commands start timing out)


## Developer Mode / sdb (WIP — parked 2026-10-15)

- **Developer Mode is ON on the TV**, IP set to the Mac (`192.168.1.7`).
  Verified via API: `developerMode: "1"`. Setting path on this model:
  *Home → Apps → App Settings (bottom) → press `123` button on the remote →
  type `12345` on the on-screen keypad* (took a couple of tries).
- **Open problem:** the TV's `sdbd` daemon never opens port 26101 — raw TSS
  handshake (`tss-1.0` UDP to 49001) gets no reply, `sdb connect` fails, and
  SSH 10022 never opens either. Likely needs Tizen Studio's full connection
  flow to wake it.
- `sdb/` contains a working macOS build of the sdb client (built from
  `sdb/src/`, which carries an `#ifdef __linux__` patch in
  `src/remount_service.c`; `make sdb` writes the binary to `bin/sdbd` on
  Apple Silicon — the Makefile aliases it). `sdb start-server` works and
  binds 26099 locally.
- Next step if we resume: use Tizen Studio's full sdbd stack or the
  connection flow in `sdb/src/protocol.txt`. If it works: `sdb shell` =
  real shell on the box, `sdb install *.tpk` = sideloading.
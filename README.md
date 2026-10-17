# samsung-tv-toolbox

A toolbox for taking over a Samsung Tizen TV from your own computer: remote
control over the network, one-command app sideloading, Developer Mode setup,
the `sdb` debug client, Wake-on-LAN, and the write-ups of how it all works.

Everything here is plain Node.js (or bash, where noted) and talks to the TV
over the LAN. Tested on a Samsung CU7105 (Tizen 6); the Control 2.0 and sdb
parts apply to most modern Samsung smart TVs.

## Quick start

```bash
npm i                      # one dependency: ws
node grabtoken.js          # grab the Control API token -> token.txt
node remote.js power       # ...and turn the TV on
```

The TV must be on the same LAN (or reachable through a tailnet — see
[REMOTE-ACCESS.md](REMOTE-ACCESS.md)).

## What's in here

| File | What it does |
| --- | --- |
| `remote.js` | Send remote keys to the TV (power, volume, channel, arrows, OK…) over the Samsung Control 2.0 websocket. `node remote.js power` |
| `grabtoken.js` | One-shot device pairing against the TV's Control API. Stores the token in `token.txt` (gitignored). |
| `listen.js` | Listens for events the TV pushes over the same connection (state changes, key echoes). |
| `state.js` | Prints the TV's current state (on/off, volume, channel) via the Control API. |
| `wake.js` | Wake-on-LAN. Wakes a sleeping TV from the network: `node wake.js [MAC] [broadcast]`. Defaults to the MAC in the file. The TV is up in ~10 s; note that apps do **not** auto-launch after a WoL wake. |
| `install-app.sh` | One-command sideload of a `.wgt` (URL or local path) through the Tizen Homebrew service, with auto-repack and auto-launch. |
| `devmode/devmode.js` | Drives the Developer Mode toggle (Settings → General → **Accessibility** → Developer Mode) via the Control API, including the `123` → `12345` passcode dance on the keypad. |
| `devmode/keypad.js` | The keypad helper the above uses to type the passcode (the remote has no number pad). |
| `devmode/appsettings.js` | Reads/verifies the TV's app settings state. |
| `sdb/sdb` | Prebuilt `sdb` client — Samsung's debug daemon front-end. Requires Developer Mode enabled and a **cold boot** of the TV (unplug 30 s). This is the door to `vd_appinstall`, file transfer, and the debug shell. |
| `sdb/src/` | Upstream [TizenTeam/sdb](https://github.com/TizenTeam/sdb) source, kept for reference and patching. |
| `sdb/rea-notes.md` | Reverse-engineering notes (Ghidra/REA) on the TV's `sdbd` daemon: which verbs it exposes, where the format strings live, what's patched out on Tizen 6. |
| `debrief.html` | A self-contained HTML report of a full TV audit (network, ports, processes, installed apps). Open in any browser. |
| `REMOTE-ACCESS.md` | Off-LAN access through a personal tailnet (no company infrastructure involved). |
| `JAILBREAK.md` | The full history: pairing, Developer Mode, sideloading, sdb, and what is / isn't possible on Tizen 6. |
| `STEPS.md` | The step-by-step walkthrough of setting everything up from a fresh TV. |
| `token.txt` | *(gitignored)* The Control API token from `grabtoken.js`. |
| `hbpin.txt` | *(gitignored)* The Tizen Homebrew service PIN. |

## Typical session

```bash
node wake.js               # TV is asleep? wake it
./install-app.sh https://example.com/myapp.wgt   # sideload something
node remote.js ok          # keys
sdb/sdb shell:0 getduid    # talk to the debug daemon (cold boot first)
```

## Requirements

- Node 18+ (or Bun) on the machine you run this from.
- The TV and your machine on the same LAN, or a tailnet in between.
- For `sdb` and sideloading: Developer Mode on the TV (see `devmode/` and
  [JAILBREAK.md](JAILBREAK.md)).

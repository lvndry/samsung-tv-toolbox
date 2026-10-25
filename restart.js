// Bring the Homebrew service — and the Stremio server — back after a cold
// boot or a self-update.
//
// Each service self-heals a normal restart on its own, but two cases leave
// them down until something launches them, and only the paired Mac can do
// that:
//
//   - a cold power cycle (on-boot is a no-op for a sideloaded service)
//   - a self-update (sdbd stops the process mid-install, before it can exit)
//
// After a standby wake the services come back on their own — this is only
// needed for the two cases above.
//
//   node restart.js            # wait until both are up, or time out
//   TV_IP=192.168.1.50 node restart.js
//
// Reads the pairing token (token.txt) and the Homebrew PIN (hbpin.txt).
import {
  TV_IP, HOMEBREW_ID, STREMIO_ID, HOME_BREW, STREMIO_URL, CONTROL_BASE,
  read, sleep,
} from './lib/tv.js';

// Package IDs and endpoints come from lib/tv.js (per-install values,
// overridable via HOMEBREW_ID / STREMIO_ID / TV_IP).
const APP_ID = HOMEBREW_ID;
const CONTROL = `${CONTROL_BASE}/api/v2/applications/${APP_ID}`;
const HEALTH = `${HOME_BREW}/version`;
const STREMIO = STREMIO_URL;

const token = read('token.txt');
const pin = process.env.HB_PIN || read('hbpin.txt') || '000000';
if (!token) {
  console.error(`no token.txt — run: node pair.js`);
  process.exit(1);
}

const homebrewUp = async () => {
  try {
    const r = await fetch(HEALTH, { headers: { 'x-homebrew-pin': pin }, signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch { return false; }
};

// The Stremio server keeps the torrent streams alive when the Mac is off —
// the whole point of running it on the television — so a cold boot must
// bring both back in one command. homebrew can launch it cross-app.
// Any HTTP answer from :11470 means the process is listening — fetch only
// rejects (caught) when it is down, so a resolved fetch is a live server.
const stremioUp = async () => {
  try {
    await fetch(STREMIO, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch { return false; }
};

const launchStremio = async () => {
  try {
    const r = await fetch(`${HOME_BREW}/dev/eval`, {
      method: 'POST',
      headers: { 'x-homebrew-pin': pin },
      body: `tizen.application.launch('${STREMIO_ID}'); 'ok'`,
      signal: AbortSignal.timeout(20000)
    });
    return (await r.json()).ok === true;
  } catch { return false; }
};

const reviveStremio = async () => {
  if (await stremioUp()) return;
  if (!(await launchStremio())) {
    console.error('could not launch the Stremio server');
    return;
  }
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    if (await stremioUp()) {
      console.log(`stremio up in ~${(i + 1) * 5}s`);
      return;
    }
  }
  console.error('Stremio launched but :11470 silent after 60s — re-run, or check /home/owner/.stremio-server-boot.log via /dev/eval');
};

if (await homebrewUp()) {
  console.log(`homebrew already up on ${TV_IP}:8091`);
  await reviveStremio();
  process.exit(0);
}

console.log(`homebrew is down on ${TV_IP}:8091 — relaunching via the Control API`);
const del = await fetch(CONTROL, { method: 'DELETE' }).catch(() => null);
await sleep(1500);
await fetch(CONTROL, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });

const deadline = Date.now() + 90_000;
let waited = 0;
while (Date.now() < deadline) {
  await sleep(4000);
  waited += 4;
  if (await homebrewUp()) {
    console.log(`homebrew up in ~${waited}s`);
    await reviveStremio();
    process.exit(0);
  }
}
console.error(`still down after 90s (DELETE was ${del ? del.status : 'n/a'}) — is the TV on and paired?`);
process.exit(1);

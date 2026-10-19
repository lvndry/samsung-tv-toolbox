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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const TV_IP = process.env.TV_IP || '192.168.1.119';
const APP_ID = 'GJBBYNLkgP.TizenHomebrew';
const STREMIO_ID = 'S6K2WQ8MnP.StremioServerService';
const CONTROL = `http://${TV_IP}:8001/api/v2/applications/${APP_ID}`;
const HEALTH = `http://${TV_IP}:8091/version`;
const STREMIO = `http://${TV_IP}:11470/`;

function read(file) {
  try { return fs.readFileSync(path.join(dir, file), 'utf8').trim(); }
  catch { return ''; }
}

const token = read('token.txt');
const pin = process.env.HB_PIN || read('hbpin.txt') || '000000';
if (!token) {
  console.error(`no token.txt — run: node pair.js`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const homebrewUp = async () => {
  try {
    const r = await fetch(HEALTH, { headers: { 'x-homebrew-pin': pin }, signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch { return false; }
};

// The Stremio server keeps the torrent streams alive when the Mac is off —
// the whole point of running it on the television — so a cold boot must
// bring both back in one command. homebrew can launch it cross-app.
const stremioUp = async () => {
  try {
    const r = await fetch(STREMIO, { signal: AbortSignal.timeout(3000) });
    return r.status !== 0;
  } catch { return false; }
};

const launchStremio = async () => {
  try {
    const r = await fetch(`http://${TV_IP}:8091/dev/eval`, {
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

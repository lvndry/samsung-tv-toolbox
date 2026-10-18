// Bring the Homebrew service back after a cold boot or a self-update.
//
// The service self-heals a normal /restart on its own (it exits abnormally
// and auto-restart reloads it). But two cases leave it down until something
// launches it, and only the paired Mac can do that via the Control API:
//
//   - a cold power cycle (on-boot is a no-op for a sideloaded service)
//   - a self-update (sdbd stops the process mid-install, before it can exit)
//
//   node restart.js            # wait until it's up, or time out
//   TV_IP=192.168.1.50 node restart.js
//
// Reads the pairing token (token.txt) and the Homebrew PIN (hbpin.txt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const TV_IP = process.env.TV_IP || '192.168.1.119';
const APP_ID = 'GJBBYNLkgP.TizenHomebrew';
const CONTROL = `http://${TV_IP}:8001/api/v2/applications/${APP_ID}`;
const HEALTH = `http://${TV_IP}:8091/version`;

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

async function up() {
  try {
    const r = await fetch(HEALTH, { headers: { 'x-homebrew-pin': pin }, signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch { return false; }
}

// Already up? Then there's nothing to do.
if (await up()) {
  console.log(`homebrew already up on ${TV_IP}:8091`);
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
  if (await up()) {
    console.log(`up in ~${waited}s`);
    process.exit(0);
  }
}
console.error(`still down after 90s (DELETE was ${del ? del.status : 'n/a'}) — is the TV on and paired?`);
process.exit(1);

// Bring the Stremio server back on the television.
//
// The Stremio server runs as a sideloaded Tizen service (S6K2WQ8MnP). The
// on-boot flag does not fire for sideloaded services on this firmware, and a
// reinstall stops the service mid-swap — so after a cold boot or an update
// something has to start it. The homebrew service can start it cross-app
// (tizen.application.launch), which is the verified path.
//
//   node stremio.js            # wait until :11470 answers, or time out
//   TV_IP=192.168.1.50 node stremio.js
//
// Reads the Homebrew PIN from HB_PIN or hbpin.txt (same sources as restart.js).
import { STREMIO_ID, HOME_BREW, STREMIO_URL, read, sleep } from './lib/tv.js';

// The app ID is per-install — overridable via STREMIO_ID (see lib/tv.js).
const STREMIO_APP_ID = STREMIO_ID;

// Keep the probe short: the startup wait loop fires it every few seconds.
const PROBE_TIMEOUT_MS = 3000;
// The launch round trip waits on the TV's application manager, which is slow.
const LAUNCH_TIMEOUT_MS = 20000;
const STARTUP_PROBES = 12;
const STARTUP_INTERVAL_MS = 5000;
const STARTUP_WAIT_S = (STARTUP_PROBES * STARTUP_INTERVAL_MS) / 1000;

const pin = process.env.HB_PIN || read('hbpin.txt') || '000000';

// Any HTTP response from :11470 means the process is listening, even on a
// 404 — only reachability matters here.
const stremioUp = async () => {
  try {
    await fetch(STREMIO_URL, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch { return false; }
};

// /version does not check the PIN (it answers 200 for any PIN), so this
// gate only proves homebrew is reachable — the PIN is validated at launch.
const homebrewStatus = async () => {
  try {
    const r = await fetch(`${HOME_BREW}/version`, {
      headers: { 'x-homebrew-pin': pin },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    return r.status;
  } catch { return 0; }
};

const LAUNCH_EXPRESSION = `tizen.application.launch('${STREMIO_APP_ID}'); 'ok'`;

// 'ok' | 'unauthorized' (homebrew answered 403 wrong-PIN) | 'failed'.
const launchStremio = async () => {
  let r;
  try {
    r = await fetch(`${HOME_BREW}/dev/eval`, {
      method: 'POST',
      headers: { 'x-homebrew-pin': pin },
      body: LAUNCH_EXPRESSION,
      signal: AbortSignal.timeout(LAUNCH_TIMEOUT_MS)
    });
  } catch { return 'failed'; }
  const d = await r.json().catch(() => ({}));
  if (d.ok === true) return 'ok';
  if (d.code === 'unauthorized') return 'unauthorized';
  return 'failed';
};

if (await stremioUp()) {
  console.log('already up');
  process.exit(0);
}

const hb = await homebrewStatus();
if (hb === 0) {
  console.error(`homebrew is down on ${HOME_BREW} — run restart.js first`);
  process.exit(1);
}
if (hb !== 200) {
  console.error(`homebrew answered ${hb} to the health check — is the service crash-looping?`);
  process.exit(1);
}

const launched = await launchStremio();
if (launched === 'unauthorized') {
  console.error('homebrew rejected the PIN — check hbpin.txt or HB_PIN');
  process.exit(1);
}
if (launched !== 'ok') {
  console.error('the homebrew service refused the launch — check the TV');
  process.exit(1);
}

for (let i = 0; i < STARTUP_PROBES; i++) {
  await sleep(STARTUP_INTERVAL_MS);
  if (await stremioUp()) {
    console.log(`up in ~${((i + 1) * STARTUP_INTERVAL_MS) / 1000}s`);
    process.exit(0);
  }
}

console.error(`launched, but :11470 still silent after ${STARTUP_WAIT_S}s — re-run, or check /home/owner/.stremio-server-boot.log via /dev/eval`);
process.exit(1);

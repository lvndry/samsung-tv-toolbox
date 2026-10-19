// Bring the Stremio server back on the television.
//
// The Stremio server runs as a sideloaded Tizen service (S6K2WQ8MnP). The
// on-boot flag does not fire for sideloaded services on this firmware, and a
// reinstall stops the service mid-swap — so after a cold boot or an update
// something has to start it. The homebrew service can start it cross-app
// (tizen.application.launch), which is the verified path.
//
//   node stremio.js           # wait until :11470 answers, or time out
//   TV_IP=192.168.1.50 node stremio.js
const TV_IP = process.env.TV_IP || '192.168.1.119';
const HB = `http://${TV_IP}:8091`;
const STREAM = `http://${TV_IP}:11470`;

function get(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout ?? 8000) })
    .then((r) => r.status)
    .catch(() => 0);
}

const up = () => get(`${STREAM}/`).then((s) => s !== 0);

const launch = () =>
  fetch(`${HB}/dev/eval`, {
    method: 'POST',
    headers: { 'x-homebrew-pin': process.env.HB_PIN || '000000' },
    body: "tizen.application.launch('S6K2WQ8MnP.StremioServerService'); 'ok'",
    signal: AbortSignal.timeout(20000)
  })
    .then((r) => r.json())
    .then((d) => d.ok)
    .catch(() => false);

const start = async () => {
  if (await up()) return 'already up';

  const hb = await get(`${HB}/version`, { headers: { 'x-homebrew-pin': process.env.HB_PIN || '000000' } });

  if (hb === 0) {
    console.log(`homebrew is down on ${HB} — run restart.js first`);
    process.exit(1);
  }

  if (!(await launch())) {
    console.log('the homebrew service refused the launch — check the TV');
    process.exit(1);
  }

  for (let i = 0; i < 12; i++) {
    if (await up()) return 'up in ~' + ((i + 1) * 5) + 's';
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log('launched, but :11470 still silent after 60s — re-run, or check /home/owner/.stremio-server-boot.log via /dev/eval');
  process.exit(1);
};

start().then((msg) => console.log(msg));

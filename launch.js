// Launch an app on the TV through the Control API, optionally waiting until
// it listens on a port.
//
//   node launch.js <appId>                 # launch and return
//   node launch.js <appId> --wait <port>   # relaunch, wait up to 90s for the port
//
// With --wait, an app already listening is left alone. Otherwise it is
// closed first, because a launch of a running app only brings it to the
// front and does not restart a dead background service.
//
// Reads the pairing token (token.txt).
import net from 'node:net';
import { TV_IP, CONTROL_BASE, loadToken, sleep } from './lib/tv.js';

const args = process.argv.slice(2);
const waitAt = args.indexOf('--wait');
const port = waitAt === -1 ? null : Number(args[waitAt + 1]);
const appId = args.find((arg, index) => !arg.startsWith('--') && index !== waitAt + 1);

if (!appId || (waitAt !== -1 && !port)) {
  console.error('usage: node launch.js <appId> [--wait <port>]');
  process.exit(1);
}

const token = loadToken();
const control = `${CONTROL_BASE}/api/v2/applications/${appId}`;

const listening = () => new Promise((resolve) => {
  const socket = net.connect({ host: TV_IP, port, timeout: 3000 });
  const done = (up) => { socket.destroy(); resolve(up); };
  socket.once('connect', () => done(true));
  socket.once('timeout', () => done(false));
  socket.once('error', () => done(false));
});

if (port && await listening()) {
  console.log(`${appId} already listening on ${TV_IP}:${port}`);
  process.exit(0);
}

await fetch(control, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
await sleep(1500);

const launched = await fetch(control, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  .catch((error) => {
    console.error(`could not reach ${CONTROL_BASE}: ${error.message} — is the TV on?`);
    process.exit(1);
  });

if (!launched.ok) {
  console.error(`launch of ${appId} answered HTTP ${launched.status} — is the app installed and the token current (node pair.js)?`);
  process.exit(1);
}

console.log(`launched ${appId}`);
if (!port) process.exit(0);

const deadline = Date.now() + 90_000;
const started = Date.now();
while (Date.now() < deadline) {
  await sleep(3000);
  if (await listening()) {
    console.log(`listening on ${TV_IP}:${port} after ~${Math.round((Date.now() - started) / 1000)}s`);
    process.exit(0);
  }
}

console.error(`${appId} launched, but ${TV_IP}:${port} is still closed after 90s`);
process.exit(1);

// Launch, close or inspect an app on the TV.
//
//   node app.js <appId>                    # launch it
//   node app.js <appId> --wait <port>      # relaunch, wait up to 90s for the port
//   node app.js <appId> --link <data>      # deep link: launch with a payload
//   node app.js <appId> status             # running / visible / version
//   node app.js <appId> close
//   node app.js --url <url>                # open a page in the TV's browser
//
// With --wait, an app already listening is left alone; one that is not is
// closed before the launch, because launching a running app only brings it
// to the front and does not restart a dead background service.
//
// Reads the pairing token (token.txt).
import net from 'node:net';
import { TV_IP, CONTROL_BASE, RemoteControl, loadToken, sleep } from './lib/tv.js';

const BROWSER = 'org.tizen.browser';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? '';
};
const flagged = new Set(['--wait', '--link', '--url'].flatMap((name) => {
  const at = args.indexOf(name);
  return at === -1 ? [] : [at, at + 1];
}));
const [positionalId, action = 'launch'] = args.filter((_, index) => !flagged.has(index));

const url = flag('--url');
const link = flag('--link');
const port = flag('--wait') === null ? null : Number(flag('--wait'));
const appId = url !== null ? BROWSER : positionalId;

const validPort = port === null || (Number.isInteger(port) && port >= 1 && port <= 65535);
const payload = url !== null || link !== null;
const conflicting = payload && (port !== null || action !== 'launch');

if (!appId || !['launch', 'status', 'close'].includes(action) || !validPort || url === '' || link === '' || conflicting) {
  console.error('usage: node app.js <appId> [status|close] [--wait <port>] [--link <data>]   or   node app.js --url <url>');
  process.exit(1);
}

const token = loadToken();
const control = `${CONTROL_BASE}/api/v2/applications/${appId}`;
const rest = (method) => fetch(control, { method, headers: { Authorization: `Bearer ${token}` } })
  .catch((error) => {
    console.error(`could not reach ${CONTROL_BASE}: ${error.message} — is the TV on?`);
    process.exit(1);
  });

if (action === 'status') {
  const response = await rest('GET');
  if (!response.ok) {
    console.error(`status of ${appId} answered HTTP ${response.status} — is it installed?`);
    process.exit(1);
  }
  console.log(JSON.stringify(await response.json(), null, 2));
  process.exit(0);
}

if (action === 'close') {
  const response = await rest('DELETE');
  console.log(`close ${appId} → HTTP ${response.status}`);
  process.exit(response.ok ? 0 : 1);
}

if (url !== null || link !== null) {
  const remote = await RemoteControl.connect({ token }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
  remote.launch(appId, { metaTag: url ?? link, native: url !== null });
  await sleep(1000);
  remote.close();
  console.log(`sent ${url !== null ? `${url} to the browser` : `deep link to ${appId}`} (the TV does not confirm)`);
  process.exit(0);
}

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

if (port) {
  await rest('DELETE');
  await sleep(1500);
}

const launched = await rest('POST');
if (!launched.ok) {
  console.error(`launch of ${appId} answered HTTP ${launched.status} — is the app installed and the token current (node pair.js)?`);
  process.exit(1);
}

console.log(`launched ${appId}`);
if (!port) process.exit(0);

const started = Date.now();
while (Date.now() - started < 90_000) {
  await sleep(3000);
  if (await listening()) {
    console.log(`listening on ${TV_IP}:${port} after ~${Math.round((Date.now() - started) / 1000)}s`);
    process.exit(0);
  }
}

console.error(`${appId} launched, but ${TV_IP}:${port} is still closed after 90s`);
process.exit(1);

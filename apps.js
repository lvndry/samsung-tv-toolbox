// Show which apps are running on the TV, and close them to free memory.
//
//   node apps.js                       # which known apps are running
//   node apps.js --close               # close every running one
//   node apps.js --close --keep <id>   # ...except these (repeatable)
//   node apps.js <id> [<id> ...]       # check these ids as well
//
// Samsung preloads big apps (Netflix, YouTube, Prime Video) in the
// background so they open instantly, and each holds a full web runtime in
// RAM. On a 1.5 GB set that is enough for the kernel to start killing
// sideloaded services. Closing them is safe: they start normally the next
// time someone opens them.
//
// The TV will not list its apps over the network on most models, so this
// checks a list of well-known ids plus any you pass. Find an app's id with
// `node app.js <id> status` (404 means not installed) or from Samsung's
// store URL for it.
//
// Reads the pairing token (token.txt).
import { CONTROL_BASE, loadToken } from './lib/tv.js';

const KNOWN = {
  '3201907018807': 'Netflix',
  '111299001912': 'YouTube',
  '3201910019365': 'Prime Video',
  '3201901017640': 'Disney+',
  '3201807016597': 'Apple TV',
  '3201606009684': 'Spotify',
  '3201512006963': 'Plex',
};

const args = process.argv.slice(2);
const close = args.includes('--close');
const keep = new Set(args.filter((arg, index) => args[index - 1] === '--keep'));
const extra = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--keep');

const token = loadToken();
const headers = { Authorization: `Bearer ${token}` };

const status = async (appId) => {
  const response = await fetch(`${CONTROL_BASE}/api/v2/applications/${appId}`, { headers, signal: AbortSignal.timeout(5000) })
    .catch((error) => {
      console.error(`could not reach ${CONTROL_BASE}: ${error.message}. Is the TV on?`);
      process.exit(1);
    });
  if (response.status === 404) return null;
  return response.ok ? response.json() : null;
};

const ids = [...new Set([...Object.keys(KNOWN), ...extra])];
const running = [];

for (const appId of ids) {
  const app = await status(appId);
  if (!app) continue;
  const name = app.name || KNOWN[appId] || appId;
  console.log(`${app.running ? 'running' : 'stopped'}  ${name.padEnd(16)} ${appId}${keep.has(appId) ? '  (kept)' : ''}`);
  if (app.running && !keep.has(appId)) running.push({ appId, name });
}

if (!close) {
  if (running.length) console.log(`\n${running.length} running. Close them with: node apps.js --close`);
  process.exit(0);
}

for (const { appId, name } of running) {
  const response = await fetch(`${CONTROL_BASE}/api/v2/applications/${appId}`, { method: 'DELETE', headers });
  console.log(`close ${name} → HTTP ${response.status}`);
}

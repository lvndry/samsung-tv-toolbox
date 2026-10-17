// Sideload a .wgt or .tpk onto the TV through the Tizen Homebrew service.
//
//   node install-app.js <url-or-path-to-wgt> [name-on-tv]
//
// Downloads the file if given a URL, posts it to the homebrew service on
// port 8091, and launches the app if the install reports its appId. The
// PIN lives in hbpin.txt next to this script (gitignored); the TV address
// honours the TV_IP environment variable like every other script.
//
// One wrinkle: the TV's zip parser chokes on zips written with data
// descriptors (many build pipelines emit them), so if the first install
// attempt fails we repack with a clean `zip` and try once more.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const TV = process.env.TV_IP || '192.168.1.119';

const [src, ...rest] = process.argv.slice(2);
if (!src) {
  console.log('usage: node install-app.js <url-or-path-to-wgt> [name-on-tv]');
  process.exit(1);
}
const name = rest.join(' ') || (src.startsWith('http') ? src.split('/').pop().split('?')[0] : path.basename(src));

// The homebrew service PIN.
let pin;
try {
  pin = fs.readFileSync(path.join(dir, 'hbpin.txt'), 'utf8').trim();
} catch {
  console.error(`no hbpin.txt next to this script (the Tizen Homebrew service PIN)`);
  process.exit(1);
}

// A .wgt is a zip; check its entry list for the Tizen manifest.
function isTizenPackage(file) {
  const out = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  if (out.status !== 0) return false;
  return out.stdout.split('\n').some((f) => /config\.xml$|tizen-manifest\.xml$/.test(f.trim()));
}

// Rewrite the zip from scratch so every entry gets a plain local header
// (no data descriptors), which is what the TV's parser requires.
function repack(file) {
  const clean = `${file}.clean.wgt`;
  const stage = `${clean}.stage`;
  const unpack = spawnSync('unzip', ['-q', file, '-d', stage]);
  if (unpack.status !== 0) return null;
  const packed = spawnSync('zip', ['-qXr', clean, '.'], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });
  return packed.status === 0 ? clean : null;
}

// Download URLs; use local paths as-is.
let file = src;
if (src.startsWith('http://') || src.startsWith('https://')) {
  console.log(`downloading ${src}`);
  file = path.join('/tmp', `tv-app-${Date.now()}.wgt`);
  fs.writeFileSync(file, Buffer.from(await (await fetch(src)).arrayBuffer()));
}

async function install(file) {
  const body = fs.readFileSync(file);
  let res;
  try {
    res = await fetch(`http://${TV}:8091/install`, {
    method: 'POST',
    headers: {
      'x-homebrew-pin': pin,
      'x-homebrew-name': name,
      'Content-Type': 'application/octet-stream',
    },
    body,
  });
  } catch (e) {
    console.error(`could not reach the Tizen Homebrew service on ${TV}:8091`);
    console.error('is the service installed and running? (it must be launched on the TV first)');
    process.exit(1);
  }
  const json = await res.json().catch(() => null);
  console.log(JSON.stringify(json));
  return json;
}

let result = await install(file);
if (!result?.ok) {
  console.log('first attempt failed — repacking (the TV hates data-descriptor zips)');
  const clean = repack(file);
  if (!clean) {
    console.error('could not repack the .wgt — check it is a zip containing config.xml');
    process.exit(1);
  }
  result = await install(clean);
}
if (!result?.ok) process.exit(1);

// Launch it if the install told us the appId.
if (result.appId) {
  console.log(`launching ${result.appId}`);
  const res = await fetch(`http://${TV}:8001/api/v2/applications/${result.appId}`, { method: 'POST' });
  console.log(`launch → HTTP ${res.status}`);
}

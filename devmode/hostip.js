// Set the TV's "Host PC IP" through the network remote and VERIFY it through
// the Control API (device.developerIP) — the script reports whether the TV
// actually accepted the value, so a wrong navigation is detected instead of
// assumed.
//
//   node devmode/hostip.js 192.168.1.7
//   node devmode/hostip.js 127.0.0.1
//
// The walk: Home → Apps → settings gear (top-right) → 123 → passcode 12345
// (keypad starts focused on 5) → Developer Mode dialog → Host PC IP field →
// type the address with the raw digit keys → ok. The Control API's
// device.developerIP updates the moment the dialog commits the field, so
// the final read is ground truth.
//
// Note: sdbd only re-reads the value at TV boot. After a successful set,
// a remote power off → on is still required before sdb accepts the new
// host. This script does NOT power-cycle — do that once it reports OK.
import { RemoteControl, loadToken } from '../lib/tv.js';

const TV = process.env.TV_IP || '192.168.1.119';
const token = loadToken();
const ip = process.argv[2];

if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
  console.error('usage: node devmode/hostip.js <dotted-quad-ip>');
  process.exit(1);
}

const api = async (path) => {
  const res = await fetch(`http://${TV}:8001${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.text().catch(() => '') };
};

const readDevIp = async () => {
  const { status, body } = await api('/api/v2/');
  if (status !== 200) return null;
  return JSON.parse(body).device?.developerIp
    || JSON.parse(body).device?.developerIP
    || null;
};

const remote = await RemoteControl.connect({ token });

try {
  console.log(`-- current developerIP: ${await readDevIp()}`);
  console.log('-- Home');
  await remote.sendKey('home', { delayMs: 1500 });
  console.log('-- Apps panel');
  await remote.sendKey('apps', { delayMs: 2000 });
  console.log('-- settings gear (top-right)');
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('ok', { delayMs: 2000 });
  console.log('-- 123 (keypad)');
  await remote.sendKey('123', { delayMs: 2500 });
  console.log('-- passcode 12345 (focus starts on 5, the center key)');
  await remote.sendKey('up', { delayMs: 350 });
  await remote.sendKey('left', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 600 }); // 1
  await remote.sendKey('up', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 600 }); // 2
  await remote.sendKey('up', { delayMs: 350 });
  await remote.sendKey('right', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 600 }); // 3
  await remote.sendKey('left', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 600 }); // 4
  await remote.sendKey('ok', { delayMs: 2500 }); // 5
  console.log('-- Developer Mode dialog → Host PC IP field');
  await remote.sendKey('down', { delayMs: 700 });
  await remote.sendKey('ok', { delayMs: 1500 });
  console.log(`-- typing ${ip}`);
  for (const ch of ip) {
    await remote.sendKey(ch === '.' ? 'KEY_DOT' : `KEY_${ch}`, { delayMs: 400 });
  }
  await remote.sendKey('ok', { delayMs: 1500 });

  // Verify against the Control API, with a couple of retries — the dialog
  // may commit the field on blur or on the ok above; the API is the judge.
  let seen = null;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    seen = await readDevIp();
    if (seen === ip) break;
  }

  if (seen === ip) {
    console.log(`OK — developerIP is now ${ip}.`);
    console.log('Remote power off → on so sdbd picks it up (sdbd reads it at boot only).');
  } else {
    console.log(`NOT COMMITTED — developerIP reads "${seen ?? 'unknown'}", wanted ${ip}.`);
    console.log('The walk reached a different field than expected. Tell me what the TV shows and');
    console.log('I will adjust the key sequence.');
    process.exitCode = 2;
  }
} finally {
  remote.close();
}

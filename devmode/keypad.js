// Type the 12345 passcode on the TV's on-screen keypad, assuming the
// keypad is already open and focus sits on 5, the center key.
//
//   node devmode/keypad.js
//
// Grid, with 5 at the starting focus:
//
//   1 2 3
//   4 5 6
//   7 8 9
//
// So from 5:  1 = up+left,  2 = up,  3 = up+right,  4 = left, 5 = stay.
//
// Also exports the full Developer Mode walk (Home → Apps → settings gear →
// 123 → passcode 12345) that devmode.js uses.
import { RemoteControl, loadToken } from '../lib/tv.js';

// The verified 12345 entry from a keypad focused on 5.
export async function typePasscode12345(remote) {
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
  await remote.sendKey('ok', { delayMs: 1500 }); // 5
}

// Home → Apps → settings gear (top-right) → 123 → passcode 12345.
// Ends with the Developer Mode dialog on screen.
export async function walkToDeveloperMode(remote) {
  console.log('-- home');
  await remote.sendKey('home', { delayMs: 1500 });
  console.log('-- apps panel');
  await remote.sendKey('apps', { delayMs: 2000 });
  console.log('-- to the top-right settings gear');
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('ok', { delayMs: 2000 });
  console.log('-- 123 (keypad)');
  await remote.sendKey('123', { delayMs: 2500 });
  await typePasscode12345(remote);
}

const remote = await RemoteControl.connect({ token: loadToken() });
try {
  console.log('tap 1');
  await remote.sendKey('up', { delayMs: 350 });
  await remote.sendKey('left', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 700 });
  console.log('tap 2');
  await remote.sendKey('right', { delayMs: 350 });
  await remote.sendKey('right', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 700 });
  console.log('tap 3');
  await remote.sendKey('right', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 700 });
  console.log('tap 4');
  await remote.sendKey('left', { delayMs: 350 });
  await remote.sendKey('left', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 700 });
  console.log('tap 5');
  await remote.sendKey('right', { delayMs: 350 });
  await remote.sendKey('ok', { delayMs: 700 });
  console.log('done — check the TV');
} finally {
  remote.close();
}

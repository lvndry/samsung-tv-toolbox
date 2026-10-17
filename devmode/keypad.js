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
// So from 5:  1 = up+left,  2 = up,  3 = up+right,  4 = left,  5 = stay.
import { RemoteControl, loadToken } from '../lib/tv.js';

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

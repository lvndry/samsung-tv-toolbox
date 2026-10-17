// Enable Developer Mode through the TV's own UI, driven by the network
// remote: Apps panel → settings gear → "123" → keypad passcode 12345.
//
//   node devmode/devmode.js
//
// This is the toggle you flip ONCE on the TV (it survives reboots). The
// keypad navigation assumes the on-screen keypad starts with focus on 5,
// the center key.
import { RemoteControl, loadToken } from '../lib/tv.js';

const remote = await RemoteControl.connect({ token: loadToken() });
try {
  console.log('-- home first');
  await remote.sendKey('home', { delayMs: 1500 });
  console.log('-- apps panel');
  await remote.sendKey('apps', { delayMs: 1500 });
  console.log('-- to the top-right settings gear');
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('up', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('right', { delayMs: 400 });
  await remote.sendKey('ok', { delayMs: 1500 });
  console.log('-- 123 (keypad)');
  await remote.sendKey('123', { delayMs: 2500 });
  console.log('-- keypad: 1 2 3 4 5 (focus starts on 5, the center)');
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
  await remote.sendKey('ok', { delayMs: 800 }); // 5
  console.log('done — check the TV for the Developer Mode dialog');
} finally {
  remote.close();
}

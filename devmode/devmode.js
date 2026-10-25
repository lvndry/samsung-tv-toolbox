// Enable Developer Mode through the TV's own UI, driven by the network
// remote: Apps panel → settings gear → "123" → keypad passcode 12345.
//
//   node devmode/devmode.js
//
// This is the toggle you flip ONCE on the TV (it survives reboots). The
// keypad navigation assumes the on-screen keypad starts with focus on 5,
// the center key.
import { RemoteControl, loadToken } from '../lib/tv.js';
import { walkToDeveloperMode } from './keypad.js';

const remote = await RemoteControl.connect({ token: loadToken() });
try {
  await walkToDeveloperMode(remote);
  console.log('done — check the TV for the Developer Mode dialog');
} finally {
  remote.close();
}

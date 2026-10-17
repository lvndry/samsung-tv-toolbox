// Send remote keys to the TV.
//
//   node remote.js power
//   node remote.js volumeUp
//   node remote.js ok up down left ok
//
// Friendly names (power, volumeUp, ok, ...) or raw TV codes (KEY_MUTE,
// KEY_0, KEY_RED) both work. See lib/tv.js for the full name list.
import { RemoteControl, loadToken } from './lib/tv.js';

const names = process.argv.slice(2);
if (!names.length) {
  console.log('usage: node remote.js <key> [key ...]   e.g. node remote.js power');
  process.exit(1);
}

const remote = await RemoteControl.connect({ token: loadToken() });
try {
  await remote.keys(names);
  console.log(`SENT: ${names.join(', ')}`);
} finally {
  remote.close();
}

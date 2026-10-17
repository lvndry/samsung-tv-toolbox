// Walk to the "App Settings" entry via the official menu path:
// Smart Hub → Apps → scroll to the bottom.
//
//   node devmode/appsettings.js
//
// Leaves the TV with "App Settings" highlighted, ready for an OK. The
// scroll count (8) was tuned for this model's app list length — if you
// have more or fewer installed apps, bump or drop it.
import { RemoteControl, loadToken } from '../lib/tv.js';

const remote = await RemoteControl.connect({ token: loadToken() });
try {
  console.log('-- home');
  await remote.sendKey('home', { delayMs: 1500 });
  console.log('-- apps');
  await remote.sendKey('apps', { delayMs: 2000 });
  console.log('-- scroll to the bottom');
  for (let i = 0; i < 8; i++) await remote.sendKey('down', { delayMs: 500 });
  console.log("done — check the TV: is 'App Settings' highlighted at the bottom?");
} finally {
  remote.close();
}

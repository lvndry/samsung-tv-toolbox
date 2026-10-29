// Watch what the TV pushes on the remote channel, live.
//
//   node listen.js          # interact with the TV and watch events arrive
//   node listen.js --ask    # also ask for the current app, media and app list
//
// Ctrl+C to stop. Many models, this one included, are quiet on this channel
// and answer almost none of the --ask requests, so silence can be normal.
import { RemoteControl, loadToken, sleep } from './lib/tv.js';

const ASKED = ['ed.apps.current.get', 'ed.media.get', 'ed.installedApp.get'];

const remote = await RemoteControl.connect({ token: loadToken() });
remote.listen((line) => console.log('EV:', line));
console.log('listening — interact with the TV, Ctrl+C to stop');

process.on('SIGINT', () => {
  remote.close();
  process.exit(0);
});

if (process.argv.includes('--ask')) {
  for (const event of ASKED) {
    remote.request(event);
    await sleep(2000);
  }
}

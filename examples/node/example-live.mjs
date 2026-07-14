// Example: listen for live changes over WebSocket and put the first song of the
// catalog live on output 0, layer 2.
//
//   BASE="<api base url>" TOKEN=spk_... node example-live.mjs
//
import { SpresenterClient } from './client.mjs';

const base = process.env.BASE;
const token = process.env.TOKEN;
if (!base || !token) {
  console.error('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... node example-live.mjs');
  process.exit(1);
}

const sp = new SpresenterClient({ base, token });

const OUTPUT = Number(process.env.OUTPUT ?? 0);
const LAYER = Number(process.env.LAYER ?? 2);

async function main() {
  const info = await sp.info();
  console.log(`Connected as token "${info.token.name}" — scopes: ${info.token.scopes.join(', ')}`);

  // 1) Listen to real-time events
  const ws = sp.connect((msg) => {
    if (msg.key === 'api.hello') {
      console.log('[ws] ready. Scopes:', msg.data.scopes.join(', '));
    } else if (msg.key.startsWith(`refresh.live.${OUTPUT}`)) {
      console.log(`[ws] output ${OUTPUT} changed → reloading layer ${LAYER}`);
      sp.getLayer(OUTPUT, LAYER)
        .then((l) => console.log('    live:', l.live?.title ?? '(empty)'))
        .catch((e) => console.error(e.message));
    }
  });

  // 2) Find a song and put it live
  const songs = await sp.assets({ type: 'music' });
  if (!songs.length) {
    console.log('No songs in the catalog — add one in the app and run again.');
  } else {
    const target = songs[0];
    console.log(`Putting "${target.title}" live on ${OUTPUT}/${LAYER}…`);
    await sp.setLive(OUTPUT, LAYER, { assetGuid: target.guid });
    await sp.patchState(OUTPUT, LAYER, { show: true, opacity: 1 });
  }

  console.log('Listening for events… (Ctrl+C to exit)');
  process.on('SIGINT', () => { ws.close(); process.exit(0); });
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

// Example: put an ANNOUNCEMENT on screen, update its text live, then clear it.
//
//   BASE="<api base url>" TOKEN=spk_... node example-announcement.mjs "Prayer meeting at 7:30pm"
//
// There is no /announcements endpoint: an announcement is not a stored asset,
// it is a presentation you build on the fly and send to a layer. Three things
// make it work:
//
//   1. `asset.type` must be "announcement" (no guid — nothing to look up).
//   2. A THEME IS MANDATORY. Unlike songs (which have their own endpoint that
//      resolves the theme server-side), nothing resolves an announcement theme
//      for you — without one the renderer draws nothing at all. Pass
//      `themeRef` with the guid of a SAVED theme asset (copy it from the theme
//      editor: ⋮ menu → "Copy theme ID").
//   3. `props` fills the theme's {placeholders}. The stock announcement theme
//      uses a single `{mensagem}`; your own theme may use any names.
//
// And one step that is easy to miss: after setting the content you must SHOW
// the layer (`PATCH …/state {"show":true}`). Setting content never flips
// visibility on its own, so on a hidden layer nothing reaches the screen.
//
import { SpresenterClient } from './client.mjs';

const base = process.env.BASE;
const token = process.env.TOKEN;
if (!base || !token) {
  console.error('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... node example-announcement.mjs "Your text"');
  process.exit(1);
}

const sp = new SpresenterClient({ base, token });

const OUTPUT = Number(process.env.OUTPUT ?? 0);
const TEXT = process.argv[2] ?? 'Prayer meeting at 7:30pm';
// Theme placeholder to fill. The stock announcement theme uses {mensagem}.
const FIELD = process.env.FIELD ?? 'mensagem';
// Element id to patch live. In the stock theme the text element's id happens to
// match the placeholder name; in your own theme, read the ids from the Layers
// panel of the theme editor.
const ELEMENT = process.env.ELEMENT ?? FIELD;
// Seconds on screen before the announcement clears itself. The app's
// Announcements panel has an "auto clear" field, but that timer lives in the
// app's UI — over the API, whoever posts is the one who schedules the clear.
const HOLD_SECONDS = Number(process.env.HOLD_SECONDS ?? 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Layer that announcements open on: the one declaring the type as its default,
 *  falling back to LAYER=… or to the last layer (announcements sit on top). */
async function resolveLayer() {
  if (process.env.LAYER !== undefined) return Number(process.env.LAYER);
  const defs = await sp.layerDefs();
  const match = defs.find((l) => (l.defaultForTypes ?? []).includes('announcement'));
  if (match) return match.index;
  return Math.max(0, defs.length - 1);
}

/** A saved theme asset tagged for announcements. THEME_GUID short-circuits the
 *  lookup — that is what you would hardcode in a real integration. */
async function resolveThemeGuid() {
  if (process.env.THEME_GUID) return process.env.THEME_GUID;
  const themes = await sp.assets({ type: 'theme' });
  const match = themes.find((a) => a.data?.assetType === 'announcement');
  return match?.guid ?? null;
}

async function main() {
  const info = await sp.info();
  console.log(`Connected as token "${info.token.name}" — scopes: ${info.token.scopes.join(', ')}`);

  const layer = await resolveLayer();
  const themeGuid = await resolveThemeGuid();

  if (!themeGuid) {
    console.error(
      'No announcement theme found.\n' +
      'Create one in the app (Media → Themes → New theme → Announcement), then either\n' +
      'tag it as an announcement theme or pass THEME_GUID=<guid> to this script.\n' +
      'Tip: the theme editor copies the guid for you — ⋮ menu → "Copy theme ID".',
    );
    process.exit(1);
  }

  console.log(`Announcing on output ${OUTPUT}, layer ${layer}, theme ${themeGuid}`);

  // 1) Put the announcement live.
  await sp.setLive(OUTPUT, layer, {
    presentation: {
      title: 'Announcement',
      asset: { title: 'Announcement', author: null, type: 'announcement' },
      themeRef: themeGuid,
      props: { [FIELD]: TEXT },
    },
  });

  // 2) Show the layer. THIS STEP IS REQUIRED: posting content does not make the
  //    layer visible, so on a hidden layer the announcement goes live and
  //    nothing appears on screen. (The song endpoint is the exception — it
  //    flips `show` for you. This one does not.)
  await sp.patchState(OUTPUT, layer, { show: true, opacity: 1 });
  console.log(`On screen: "${TEXT}"`);

  // 3) Change the wording WITHOUT re-sending the presentation. This patches the
  //    element in place, so there is no crossfade and no flash of empty screen —
  //    the right tool for a countdown, a score, a running headline.
  await sleep(3000);
  try {
    await sp.setElement(OUTPUT, layer, ELEMENT, { text: `${TEXT} — starting soon` });
    console.log(`Updated element "${ELEMENT}" live`);
  } catch (e) {
    // Wrong element id is not fatal: the announcement stays on screen as posted.
    console.warn(`Could not patch element "${ELEMENT}": ${e.message}`);
  }

  // 4) Clear. DELETE removes the content; hiding the layer as well leaves the
  //    output in the state the operator expects to find it in.
  await sleep(Math.max(0, HOLD_SECONDS - 3) * 1000);
  await sp.clearLayer(OUTPUT, layer);
  await sp.patchState(OUTPUT, layer, { show: false });
  console.log('Cleared.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

// Example: put an ANNOUNCEMENT on screen, update its text live, then clear it.
//
//   BASE="<api base url>" TOKEN=spk_... node example-announcement.mjs "Prayer meeting at 7:30pm"
//
// `POST …/layers/:layer/announcement` does the same thing the app's Avisos panel
// does: it resolves that output's announcement theme server-side — including the
// bundled ones, which have no guid and so cannot be referenced any other way —
// and leaves the layer VISIBLE. All you provide is `props`, the values for the
// theme's {placeholders}; ask `GET …/outputs/:output/announcement` which names it
// declares instead of guessing them.
//
// Passing `themeGuid` overrides the theme. Building the presentation by hand
// (`type: "announcement"` + `themeRef` + showing the layer yourself) still works
// and is what this example used to do — see docs/endpoints.md.
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
// Theme placeholder to fill. Left unset, it is read from the theme itself; the
// stock announcement theme uses {mensagem}.
const FIELD = process.env.FIELD;
// Element id to patch live. In the stock theme the text element's id happens to
// match the placeholder name; in your own theme, read the ids from the Layers
// panel of the theme editor.
const ELEMENT = process.env.ELEMENT;
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

async function main() {
  const info = await sp.info();
  console.log(`Connected as token "${info.token.name}" — scopes: ${info.token.scopes.join(', ')}`);

  const layer = await resolveLayer();

  // Which {placeholders} does the theme declare? Asking beats guessing: a custom
  // announcement theme can use any names, and props for a name the theme does
  // not have simply go nowhere.
  const { variables } = await sp.announcementInfo(OUTPUT);
  const field = FIELD ?? variables[0];
  if (!field) {
    console.error(
      'The announcement theme of this output declares no {variables}, so there is\n' +
      'nothing to fill. Edit the theme (Media → Themes) to add a text element with\n' +
      'a placeholder like {mensagem}, or pass FIELD=<name> to force one.',
    );
    process.exit(1);
  }

  console.log(`Announcing on output ${OUTPUT}, layer ${layer}, field {${field}}`);

  // 1) Put the announcement live. The theme is resolved server-side and the
  //    layer is left visible — no separate PATCH …/state needed.
  await sp.announce(OUTPUT, layer, { [field]: TEXT });
  console.log(`On screen: "${TEXT}"`);

  // 2) Change the wording WITHOUT re-sending the presentation. This patches the
  //    element in place, so there is no crossfade and no flash of empty screen —
  //    the right tool for a countdown, a score, a running headline.
  await sleep(3000);
  const element = ELEMENT ?? field;
  try {
    await sp.setElement(OUTPUT, layer, element, { text: `${TEXT} — starting soon` });
    console.log(`Updated element "${element}" live`);
  } catch (e) {
    // Wrong element id is not fatal: the announcement stays on screen as posted.
    console.warn(`Could not patch element "${element}": ${e.message}`);
  }

  // 3) Clear. DELETE removes the content; hiding the layer as well leaves the
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

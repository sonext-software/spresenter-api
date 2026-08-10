// Example: BUILD a setlist (scope `setlists:write`) and prepare the operator's
// screen (scope `ui:write`).
//
//   BASE="<api base url>" TOKEN=spk_... node example-setlist.mjs
//
// It creates a setlist, opens it, fills the schedule with whatever songs are in
// the library, reorders it, selects the first item and brings the Preview panel
// into view. Everything it creates is left in place — delete the setlist from the
// app's setlist manager (or uncomment the cleanup at the end).
//
// Nothing here PROJECTS. Selecting an item prepares it (preview + the type's
// view); going on screen is present()/setVerse() — see example-live.mjs.
import { SpresenterClient } from './client.mjs';

const base = process.env.BASE;
const token = process.env.TOKEN;
if (!base || !token) {
  console.error('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... node example-setlist.mjs');
  process.exit(1);
}

const sp = new SpresenterClient({ base, token });

async function main() {
  const info = await sp.info();
  console.log(`Token "${info.token.name}" — scopes: ${info.token.scopes.join(', ')}`);
  if (!info.token.scopes.includes('setlists:write')) {
    console.error('\nThis token cannot build setlists. Add "setlists:write" in Settings → API.');
    process.exit(1);
  }

  // ── 0. What is open right now ──────────────────────────────
  // Opening another setlist DISCARDS this one with no confirmation (there is no
  // operator on the other side of an API call), so save it first.
  const current = await sp.activeSetlist();
  if (current.active) {
    console.log(`\nActive setlist: "${current.setlist.title || '(untitled)'}" — saving it before we take over.`);
    try {
      await sp.saveSetlist();
    } catch (e) {
      // saveSetlist() throws instead of pretending: the setlist stays unsaved.
      console.error(`Could not save it (${e.message}) — aborting so nothing is lost.`);
      process.exit(1);
    }
  }

  // ── 1. Create + open ───────────────────────────────────────
  const created = await sp.createSetlist({ title: 'Built by the API' });
  console.log(`\nCreated ${created.id} — "${created.title}"`);
  await sp.openSetlist(created.id);

  // ── 2. Groups and items ───────────────────────────────────
  // A group can be born populated. `assetGuids` are resolved server-side, so an
  // unknown guid fails the call instead of half-filling the group.
  const songs = (await sp.assets({ type: 'music' })).slice(0, 3);
  if (songs.length === 0) {
    console.log('No songs in the library — add one first (see example-add-assets.mjs).');
    return;
  }

  const { group } = await sp.addSetlistGroup({
    title: 'Worship',
    assetGuids: songs.slice(0, 2).map((s) => s.guid),
  });
  console.log(`Group ${group} "Worship" with ${Math.min(2, songs.length)} song(s)`);

  // One more, at a specific position (omit `index` to append).
  if (songs[2]) {
    const at = await sp.addSetlistItem({ assetGuid: songs[2].guid, group, index: 0 });
    console.log(`Added "${songs[2].title}" at ${at.group}/${at.index}`);
  }

  // An item with NO group gets a new group of its own — the same thing the app
  // does when you drop an asset outside any group.
  const own = await sp.addSetlistItem({ assetGuid: songs[0].guid, groupName: 'Closing' });
  console.log(`"${songs[0].title}" in its own group ${own.group}`);

  // ── 3. Reorder ────────────────────────────────────────────
  // Inside a group, or across them. 'orphans' addresses the loose-assets list
  // the sidebar draws below the groups.
  await sp.moveSetlistItem({ group, index: 0 }, { group, index: 99 }); // 99 → the end
  console.log('Moved the first item of the group to the end.');

  await sp.updateSetlistGroup(group, { title: 'Opening worship', color: '#4f8cff' });

  // ── 4. Read it back ───────────────────────────────────────
  // Group indexes shift as groups are added/moved/removed, so this is the honest
  // way to know what you built.
  const { setlist } = await sp.activeSetlist();
  console.log(`\n"${setlist.title}"`);
  setlist.schedules.forEach((s, i) => {
    console.log(`  [${i}] ${s.title}`);
    (s.assets ?? []).forEach((a, j) => console.log(`      ${j}. ${a.title} (${a.type})`));
  });
  if (setlist.assets?.length) {
    console.log('  [orphans]');
    setlist.assets.forEach((a, j) => console.log(`      ${j}. ${a.title}`));
  }

  await sp.saveSetlist();
  console.log('\nSaved.');

  // ── 5. Select an item (this is NOT projecting) ─────────────
  // Same effect as clicking it in the sidebar: it becomes the preview and the
  // app opens that type's view.
  await sp.selectSetlistItem({ group, index: 0 });
  console.log('Selected the first item of the group (preview only).');

  // Or by the FLAT position the operator counts on screen (0-based), skipping
  // types the sidebar does not draw — the same numbering the MIDI positional
  // protocol uses.
  // await sp.selectSetlistItem({ position: 0 });

  // ── 6. Prepare the screen (scope `ui:write`) ──────────────
  if (!info.token.scopes.includes('ui:write')) {
    console.log('\n(Add the "ui:write" scope to also drive the panels.)');
    return;
  }

  const { panels } = await sp.panels();
  console.log('\nPanels:');
  for (const p of panels.filter((x) => x.open)) {
    console.log(`  ${p.id.padEnd(24)} ${p.location}${p.visible ? '' : '  (open but not on screen)'}`);
  }

  // `select` is the one that matters: a panel open as an INACTIVE TAB is as
  // invisible as a closed one, and this also leaves another group's fullscreen.
  await sp.selectPanel('preview');
  console.log('Preview panel brought into view.');

  // Gated panels (Mixer/FX need PRO, the console must be enabled) answer 403.
  const mixer = panels.find((p) => p.id === 'mixer');
  if (mixer?.gated) console.log('Mixer is gated (PRO) — not opening it.');

  // Cleanup, if you would rather not leave it behind:
  // await sp.deleteSetlist(created.id);
}

main().catch((e) => {
  // 503 unavailable / 504 timeout mean the app's WINDOW did not answer — the
  // active setlist and the panel layout live there, not in the background
  // process that serves the rest of the API.
  console.error('Error:', e.message);
  process.exit(1);
});

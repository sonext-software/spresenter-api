// Example: ADD content to the library (scope `assets:write`), then project it.
//
//   BASE="<api base url>" TOKEN=spk_... node example-add-assets.mjs [file...]
//
// With no file arguments it only creates the song (which needs no local file).
// Files are sent by their extension: images (.png .jpg .jpeg .bmp), video
// (.mp4 .mov) and audio (.mp3 .wav .aac).
import { basename, extname } from 'node:path';
import { SpresenterClient } from './client.mjs';

const base = process.env.BASE;
const token = process.env.TOKEN;
if (!base || !token) {
  console.error('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... node example-add-assets.mjs');
  process.exit(1);
}

const sp = new SpresenterClient({ base, token });
const files = process.argv.slice(2);
const OUTPUT = Number(process.env.OUTPUT ?? 0);

async function main() {
  const info = await sp.info();
  console.log(`Token "${info.token.name}" — scopes: ${info.token.scopes.join(', ')}`);
  if (!info.token.scopes.includes('assets:write')) {
    console.error('\nThis token cannot add assets. Add the "assets:write" scope in Settings → API.');
    process.exit(1);
  }

  // ── 1. A folder, so the upload lands somewhere ─────────────
  // `category` is the tab it belongs to. Folders are per-tab, so pick the one
  // matching what you are going to put inside.
  const folder = await sp.createFolder('API upload', 'video');
  console.log(`\nFolder "${folder.title}" → ${folder.guid}`);

  // ── 2. Files ───────────────────────────────────────────────
  for (const file of files) {
    // A .mp4 defaults to `video` (the presentation kind). Ask for
    // `backgroundVideo` when it should live on a background layer instead.
    const isVideo = ['.mp4', '.mov'].includes(extname(file).toLowerCase());
    const asset = await sp.uploadFile(file, {
      title: basename(file, extname(file)),
      ...(isVideo ? { type: 'backgroundVideo', parent: folder.guid } : {}),
    });
    console.log(`Uploaded ${basename(file)} → ${asset.guid} (${asset.type}${asset.extension})`);
  }

  // A file the app fetches itself — no upload from this side. Handy for a large
  // asset already reachable on the network.
  // console.log(await sp.createFromUrl('clip.mp4', 'https://example.org/clip.mp4', { type: 'backgroundVideo' }));

  // ── 3. A song with STRUCTURED lyrics ──────────────────────
  // `sections` — not a blob of text — is what the app projects: each one is a
  // slide. The searchable text is derived from them, so the song is findable in
  // the app's search right away.
  const { asset: song, lyrics } = await sp.createMusic({
    title: 'Sample Song',
    artist: ['Sample Author'],
    key: 'D',
    groups: [
      { id: 'v', name: 'Verse', color: '#4f8cff' },
      { id: 'c', name: 'Chorus', color: '#ffb020' },
    ],
    sections: [
      {
        type: 'verse',
        group: 'v',
        text: 'This is line one\nAnd this is line two',
        // `position` is a character offset into `text` — anything past its end
        // is dropped by the server rather than failing the request.
        chords: [
          { position: 0, chord: 'D' },
          { position: 18, chord: 'A' },
        ],
      },
      { type: 'chorus', group: 'c', text: 'This is the chorus' },
      // `group` is optional — this one has none.
      { type: 'bridge', text: 'A bridge near the end\nUsually only once' },
    ],
    // Per-verse timecodes in seconds (`null` = unsynced). A raw LRC string in
    // `syncedLyrics` works too — the server converts it.
    timecodes: [0, 21.5, null],
  });

  console.log(`\nSong "${song.title}" → ${song.guid}`);
  // The response echoes what was ACTUALLY stored — read it back to see what the
  // server kept (invalid section types, out-of-range chords and malformed group
  // colors are dropped, not rejected).
  lyrics.sections.forEach((s, i) => {
    console.log(`  [${i}] ${s.type ?? '—'} ${s.chords?.length ? `(${s.chords.length} chords)` : ''}`);
    console.log(`      ${s.text.replace(/\n/g, ' / ')}`);
  });

  // ── 4. Fix a verse later, without recreating the asset ─────
  await sp.setLyrics(song.guid, {
    sections: [
      ...lyrics.sections.slice(0, 2),
      // Same section, corrected text — that is the point of setLyrics.
      { type: 'bridge', text: 'A bridge near the end\nWith a corrected second line' },
    ],
  });
  console.log('Lyrics updated.');

  // ── 5. Project verse 1 ────────────────────────────────────
  // Which layer? The one listing `music` in `defaultForTypes`.
  const layer = (await sp.layerDefs()).findIndex((l) => l.defaultForTypes?.includes('music'));
  if (layer >= 0) {
    await sp.setVerse(OUTPUT, layer, song.guid, 1);
    console.log(`Verse 1 live on ${OUTPUT}/${layer}.`);
  } else {
    console.log('No layer is set as default for songs — project it from the app.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

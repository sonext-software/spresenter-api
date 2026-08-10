# HTTP endpoints

Base: `<BASE>` — the API base URL from **Settings → API**. Every route requires a
token (see [authentication](authentication.md)). The required scope is in the
**Scope** column.

## Descriptor

### `GET <BASE>`
No scope (any valid token). Returns the version, the current token and the route list.

```json
{
  "name": "Spresenter API",
  "version": "1",
  "token": { "name": "Web panel", "scopes": ["live:read", "live:write"] },
  "routes": [ { "method": "GET", "path": "/api/v1/outputs", "scope": "outputs:read", "summary": "…" } ]
}
```

## Outputs & layers

### `GET <BASE>/outputs` — `outputs:read`
Lists the virtual outputs.

```json
[ { "index": 0, "name": "Main", "width": 1920, "height": 1080,
    "disabledLayers": [], "defaultBackground": null } ]
```

### `GET <BASE>/layers` — `outputs:read`
**Global** layer definitions (the same for every output). `defaultForTypes`
tells which asset types open on that layer by default — use it to pick the target
layer automatically for the selected asset.

```json
[ { "index": 1, "name": "Content", "icon": "type", "isBackground": false, "defaultForTypes": ["music", "bible"] } ]
```

Default‑layer precedence for an asset: `asset.data.layer` (saved on the asset) →
the layer whose `defaultForTypes` includes `asset.type` → the "Content" layer.

### `GET <BASE>/outputs/:output/layers` — `outputs:read`
Layers of the output with a state summary.

```json
[ { "index": 0, "name": "Background", "icon": "image", "state": { "show": true, "opacity": 1, "blend": "normal" }, "hasContent": true } ]
```

### `GET <BASE>/outputs/:output/layers/:layer` — `live:read`
Live content + state of one layer.

```json
{ "live": { "title": "My song", "asset": { "guid": "…", "type": "music" } },
  "state": { "show": true, "opacity": 1, "blend": "normal", "transitionMs": 500 } }
```

### `POST <BASE>/outputs/:output/layers/:layer` — `live:write`
Sets the live content. Two body shapes:

```jsonc
// A) by guid — the server resolves the asset and builds the presentation
{ "assetGuid": "5b1c…" }

// B) full presentation (advanced) — the same shape the app uses internally
{ "presentation": { "title": "…", "asset": { "guid": "…", "type": "…" } } }
```

Response: `{ "ok": true }`. The transition/crossfade fires automatically.

> **This is the raw shape: no theme is resolved and the layer is not shown.**
> Shape **A** builds `{ title, asset }` and nothing else. For the types that need
> a theme — `slidePresentation` and `image` render **empty** without one — use
> `/present` below, which is what the app itself does. Content and visibility are
> also separate: on a hidden layer the presentation goes live and nothing reaches
> the screen, so follow up with
> `PATCH <BASE>/outputs/:output/layers/:layer/state` `{"show":true}`.
> (`/present`, `/music` and `/announcement` are the exceptions — they flip `show`
> for you.)

### `POST <BASE>/outputs/:output/layers/:layer/present` — `live:write`
Puts an asset live the way the **app** does it — the equivalent of a double‑click
in the app, or of the "Mudar apresentação" automation node. The server builds the
whole presentation: theme per output (asset's own → output's default → system),
the slide out of the `.scp` manifest, the display fit, the output's per‑type
background, and the layer left **visible**.

Supported types: `image`, `backgroundVideo`, `slidePresentation`, `videoInput`,
`music`. The multi‑part ones that need a navigator in the app (`bible`,
`presentation`, `video`, `youtube`) answer `400 unsupported_type`.

```jsonc
{
  "assetGuid": "5b1c…",   // also accepts "worshipwide/<file>"
  "index": 0,             // slide index (slidePresentation) or verse (music); ignored elsewhere
  "groupId": "…",         // song group — takes precedence over index
  "fit": "contain",       // optional: cover | contain | fill (default: as configured in the app)
  "background": true      // optional: apply the output's per-type background (default true)
}
```

Response: `{ "ok": true, "type": "slidePresentation", "index": 0, "background": 0 }`
— `background` is the layer the per‑type background landed on, or `null`.

`{ "ok": true, "cleared": true }` means that output has **no variant of that
slide** in the manifest, so its layer was cleared instead of keeping stale
content (same behaviour as the app). Out‑of‑range slide → `400`; a
`slidePresentation` with no manifest → `422 no_manifest`.

To walk through a deck, call it again with the next `index`.

### `POST <BASE>/outputs/:output/layers/:layer/announcement` — `live:write`
Puts an **announcement** live (the app's *Avisos* panel). The announcement theme
of that output is resolved server‑side — including bundled/system themes, which
have no guid and therefore **cannot** be referenced via `themeRef` — and the
layer is left visible.

```json
{ "props": { "nome": "Maria", "placa": "ABC1D23" } }
```

`props` fills the theme's `{placeholders}`. Optional `themeGuid` overrides which
theme to use (a saved theme asset, or a `bundle:` reference).
Response: `{ "ok": true, "variables": ["nome", "placa"] }`.

There is **no server‑side auto‑clear**: schedule your own `DELETE`. To reword an
announcement already on screen without a crossfade, patch the element in place
(see **Live elements**).

### `GET <BASE>/outputs/:output/announcement` — `outputs:read`
The `{placeholders}` the output's announcement theme declares — so a client can
build one field per variable instead of guessing names. Time/timer tokens
(`{HH}`, `{tMM}`, …) are excluded: the renderer fills those itself.

```json
{ "variables": ["nome", "placa"],
  "allVariables": ["nome", "placa"],
  "theme": { "title": "Aviso da casa" } }
```

`variables` is this output's theme; `allVariables` is the union across every
output (what the app's panel shows).

Full walkthroughs: [curl](../examples/curl.md#show-an-announcement-text-on-screen)
and [Node.js](../examples/node/example-announcement.mjs).

<details>
<summary>Building an announcement by hand (before <code>/announcement</code> existed)</summary>

An announcement is not a stored asset, so it also goes through body shape **B**
with `asset.type` set to `"announcement"` and no guid. A **theme is mandatory**
and this path resolves none, so pass `themeRef` with the guid of a **saved**
theme asset — bundled/system themes have no guid and cannot be referenced this
way. Then show the layer yourself.

```json
{ "presentation": {
    "title": "Announcement",
    "asset": { "title": "Announcement", "author": null, "type": "announcement" },
    "themeRef": "5b1c…",
    "props": { "mensagem": "Prayer meeting at 7:30pm" } } }
```

</details>

### `DELETE <BASE>/outputs/:output/layers/:layer` — `live:write`
Clears the layer. Response `{ "ok": true }`.

### `POST <BASE>/outputs/:output/layers/:layer/music` — `live:write`
Puts a **song verse** live. The server resolves the theme (same logic as the app,
including the output's default theme), builds the presentation and makes the layer
visible. Much simpler than building the `presentation` client‑side.

```json
{ "assetGuid": "5b1c…", "index": 2 }
```

### `GET <BASE>/outputs/:output/layers/:layer/state` — `live:read`
Layer state.

### `PATCH <BASE>/outputs/:output/layers/:layer/state` — `live:write`
**Partial** state update (omitted fields stay as they are; the layer's visual
effects are preserved).

```json
{ "show": true, "opacity": 0.5, "blend": "screen", "transitionMs": 300 }
```

### `GET <BASE>/outputs/:output/master` — `live:read`
`{ "opacity": 1 }`

### `POST <BASE>/outputs/:output/master` — `live:write`
`{ "opacity": 0.8 }` → sets the output's master opacity.

## Live elements

Control an **individual theme element** of whatever is live on a layer, in real
time — change its text, inject raw HTML, tweak CSS, toggle visibility or swap its
source — **without reloading the theme** (no crossfade). Target it by its element
`id` in the theme.

### `POST <BASE>/outputs/:output/layers/:layer/elements/:elementId` — `live:write`
Merges a patch into the element and broadcasts it. Body (all fields optional):

```jsonc
{
  "text": "Welcome",                       // set text (goes through the template pipeline)
  "html": "<b>Raw HTML</b>",               // raw HTML — bypasses templates
  "css": { "color": "#fbbf24", "fontSize": "6vh" },
  "visible": true,                          // toggle visibility
  "src": "https://…/image.png"             // swap the source (IMAGE/VIDEO)
}
```

Response: `{ "ok": true, "element": { …merged patch… } }`. Patches accumulate
(each call merges into the current override) until the layer content changes.

### `GET <BASE>/outputs/:output/elements` — `live:read`
The element overrides currently active on the output, keyed by layer then
element id:

```json
{ "0": { "title": { "text": "Welcome" } }, "1": { "logo": { "visible": false } } }
```

## Assets

### `GET <BASE>/assets` — `assets:read`
Lists/searches assets. Query params (all optional):

| Param | Effect |
|---|---|
| `q` | Text search (when present, uses full‑text search) |
| `type` | Filter by type (`music`, `video`, `image`, `slidePresentation`, …) |
| `parent` | folder guid (`''` = root) |
| `category` | custom category (uuid) |

```bash
GET <BASE>/assets?type=music&q=grace
```

### `GET <BASE>/assets/:guid` — `assets:read`
One asset by guid. `404 not_found` if missing. For songs, `data.themes` /
`data.verseThemes` carry the per‑output themes.

### `GET <BASE>/assets/:guid/lyrics` — `assets:read`
Lyrics and sections of a song (empty for assets without lyrics):

```json
{
  "lyrics": ["verse 0 text", "verse 1 text"],
  "sections": [ { "type": "chorus", "text": "…", "chords": [], "comments": [], "group": "g1" } ],
  "groups": [ { "id": "g1", "name": "Chorus", "color": "#..." } ]
}
```

To put verse `i` live, prefer `POST <BASE>/outputs/:output/layers/:layer/music`
with `{ assetGuid, index: i }` — the server builds the presentation and resolves
the theme.

### `GET <BASE>/assets/:guid/thumbnail` — `assets:read`
Returns the asset **thumbnail image** (png/jpg). Use it directly in an `<img>`:

```html
<img src="<BASE>/assets/GUID/thumbnail?token=spk_...">
```

## Adding assets

Creating content requires the **`assets:write`** scope (separate from
`assets:read` because it writes to disk). The server owns the whole ingestion
pipeline — thumbnail, ID3 tags, video normalization, database insert, full-text
index — so you send content, not files-in-place.

### `POST <BASE>/assets` — `assets:write`

Creates asset(s) from **file** content. Two request forms, same endpoint, picked
by `Content-Type`:

**`multipart/form-data`** — field `file` (or repeated `files`). Use this for
anything large: the file is streamed to disk and never buffered in memory.

**`application/json`** — for clients that don't build multipart:

| Field | Required | Meaning |
|---|---|---|
| `filename` | yes | File name **with extension** — it decides the asset type |
| `contentBase64` | one of | The file bytes, base64 (a `data:` URL is accepted) |
| `sourceUrl` | one of | `http(s)` URL that **the app downloads** |

Optional in both forms:

| Field | Meaning |
|---|---|
| `title` | Asset title (defaults to the file name without extension). Ignored when several files are sent in one request |
| `author` | Free text |
| `type` | Override within the extension's family — in practice `backgroundVideo` for a video file |
| `parent` | Destination folder guid (see `POST <BASE>/assets/folder`); omit for the root |
| `category` | Custom category uuid; omit for the type's own tab |
| `optimize` | `false` skips video normalization entirely (default `true`) |
| `allowEncode` | `false` keeps the cheap remux but refuses the costly re-encode |

**Supported files**: images (`.png .jpg .jpeg .bmp`), video (`.mp4 .mov`) and
audio (`.mp3 .wav .aac`). Themes and songs do **not** come in as files — a song
is created with structured lyrics (below).

The response is **always** a list, even for a single file, so there is only one
shape to handle:

```json
{ "assets": [ { "guid": "…", "title": "Opening", "type": "video", "extension": ".mp4", "version": 1 } ] }
```

`201 Created` on success. Errors: `400 invalid_filename` / `unsupported_file` /
`invalid_type` / `invalid_source`, `404 folder_not_found`, `413 too_large`,
`422 process_failed`, `502 download_failed`.

With **several** files, one rejected file fails the request — the files accepted
before it are already in the library. Send one file per request when you need to
know exactly what got in.

> **Video may keep working after the response.** A cheap container fix (remux)
> happens inline, but a full re-encode is queued in the background and swaps the
> file when it finishes — which can change the asset's `extension`. Subscribe to
> the `assets.updated` WebSocket event (`assets:read`) if you need to know.

```bash
# Multipart — the way to send a real file
curl -X POST "$BASE/assets" -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/opening.mp4" \
  -F "type=backgroundVideo" -F "title=Opening"

# JSON with base64 — handy for small files and for scripts
curl -X POST "$BASE/assets" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"filename\":\"logo.png\",\"contentBase64\":\"$(base64 -w0 logo.png)\"}"

# JSON with a URL — the app downloads it (no upload from your side)
curl -X POST "$BASE/assets" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"filename":"clip.mp4","sourceUrl":"https://example.org/clip.mp4","type":"backgroundVideo"}'
```

`sourceUrl` and multipart have no practical size limit; **base64 does** (the JSON
body is capped, and base64 inflates by 33% and lives in memory). Above a few tens
of MB, use one of the other two.

### `POST <BASE>/assets/music` — `assets:write`

Creates a song with **structured lyrics**. This is the organized form: the app
projects *sections*, not a blob of text.

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Song name |
| `sections` | yes¹ | The projectable units, in order — see below |
| `lyrics` | yes¹ | Plain verses (`string[]`), used only when `sections` is absent |
| `artist` | | String or array of strings |
| `groups` | | `[{ id, name, color? }]` — named sets referenced by `section.group` |
| `key` | | Musical key, e.g. `"G"` |
| `isrc` | | Recording id |
| `syncedLyrics` | | Raw **LRC** text, or a JSON array of per-verse timecodes |
| `timecodes` | | `(number \| null)[]` — seconds per verse (`null` = unsynced) |
| `thumbnailBase64` / `thumbnailUrl` | | Cover art |
| `parent`, `category` | | Same meaning as in `POST <BASE>/assets` |

¹ one of `sections` or `lyrics` — a song with no verses cannot be projected, so
it is rejected (`400 missing_lyrics`) rather than saved half-broken.

Each **section**:

| Field | Meaning |
|---|---|
| `text` | The slide's text, `\n` for line breaks |
| `type` | `verse`, `pre-chorus`, `chorus`, `bridge`, `intro`, `outro`, `instrumental`, `tag`, `ending` |
| `group` | `id` of one of `groups` |
| `chords` | `[{ position, chord }]` — `position` is a character offset into `text` |
| `comments` | `[{ position, comment }]` — free notes, same anchoring |

```bash
curl -X POST "$BASE/assets/music" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "title": "Sample Song",
    "artist": ["Sample Author"],
    "key": "D",
    "groups": [{ "id": "v", "name": "Verse", "color": "#4f8cff" }],
    "sections": [
      { "type": "verse", "text": "This is line one\nAnd this is line two", "group": "v",
        "chords": [{ "position": 0, "chord": "D" }, { "position": 18, "chord": "A" }] },
      { "type": "chorus", "text": "This is the chorus" }
    ]
  }'
```

```json
{
  "asset": { "guid": "…", "title": "Sample Song", "type": "music", "extension": ".sly" },
  "lyrics": { "lyrics": ["This is line one\nAnd this is line two", "This is the chorus"],
              "sections": [ … ], "groups": [ … ] }
}
```

**Sections are authoritative**: the searchable text is derived from them, so the
song is findable in the app's search immediately — you never index anything
yourself. The response echoes what was **actually stored**: the server drops
unknown section types, chord/comment positions outside the text and malformed
group colors instead of failing the whole request. Read `lyrics` back to confirm.

Put a verse live with
`POST <BASE>/outputs/:output/layers/:layer/music` `{ assetGuid, index }`.

### `PUT <BASE>/assets/:guid/lyrics` — `assets:write`

Replaces the structured lyrics of an existing song — same payload as creation
(`sections`, `lyrics`, `groups`, `syncedLyrics`, `timecodes`), so correcting a
verse or regrouping stanzas doesn't mean recreating the asset. Returns the stored
lyrics. `400 not_a_music` when the guid isn't a song.

### `POST <BASE>/assets/folder` — `assets:write`

Creates a folder, so what you upload lands somewhere instead of piling up in the
root. Pass its `guid` as `parent` on the calls above.

| Field | Required | Meaning |
|---|---|---|
| `title` | | Folder name (default `"Nova pasta"`) |
| `category` | yes | Tab it belongs to: `image`, `video`, `backgroundVideo`, `audio`, `slidePresentation`, `theme`, … or a custom category uuid |
| `parent` | | Parent folder guid, for nesting |

```bash
curl -X POST "$BASE/assets/folder" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Sunday 12/07", "category": "video" }'
```

## Setlist

> **Renamed:** these used to be `/event`, `/events`, `/events/:id` under the
> `events:read` scope. The old paths still respond (with their old response
> shape — the active one returns the object under `event` instead of `setlist`),
> so existing integrations keep working, but new code should use the names below.

### `GET <BASE>/setlist` — `setlists:read`
The **active** setlist (whatever is open in the app right now, even unsaved). Assets
are returned **without the `data` field** to keep the payload small — fetch the
full asset from `GET <BASE>/assets/:guid` when needed.

```json
{ "active": true, "setlist": { "title": "Sunday service", "schedules": [ { "id": "…", "title": "Worship", "assets": [ { "guid": "…", "title": "…", "type": "music" } ] } ], "assets": [] } }
```

If no setlist is open: `{ "active": false }`.

### `GET <BASE>/setlists` — `setlists:read`
Summaries of the **saved** setlists (`id`, `title`, `thumbnail`, `modified`).

### `GET <BASE>/setlists/:id` — `setlists:read`
Full saved setlist (schedules + assets).

## Building a setlist

Everything below needs **`setlists:write`**. Two different things live here:

- the **library** — the saved setlist files, which the app's setlist manager lists;
- the **active** setlist — the one open in the app right now, whose *schedule* the
  operator sees in the sidebar. Only one is active at a time.

Editing the active one goes **through the app's window**, so these routes can
answer `503 unavailable` / `504 timeout` — see
[authentication](authentication.md#the-app-window-did-not-answer).

### Addressing an item

The schedule is a list of **groups**, each with a list of assets, plus a list of
**loose** assets the sidebar draws below the groups. So a position is a pair:

| `group` | Means |
|---|---|
| `0`, `1`, … | Index of the group in the schedule |
| `"orphans"` | The loose‑assets list |

…and `index` is the position inside that list. Both are 0‑based. The `group`
indexes shift when you add, remove or move groups — read `GET <BASE>/setlist`
back if you are building something long.

### `POST <BASE>/setlists` — `setlists:write`
Creates an **empty** setlist in the library. It does not become active.

```json
{ "title": "Sunday, 10am", "description": "…", "init": "…" }
```

Response: `{ "id": "…", "title": "Sunday, 10am", "modified": 1699999999999 }`.

### `PATCH <BASE>/setlists/:id` — `setlists:write`
Renames a saved setlist: `{ "title": "New name" }`. If that setlist is the
**active** one, the title in the app changes too — otherwise the app would keep
showing the old name and write it back on the next save.

### `POST <BASE>/setlists/:id/duplicate` — `setlists:write`
Copies it under a new id, with a "copy" suffix in the title. Returns the new
summary.

### `POST <BASE>/setlists/:id/open` — `setlists:write`
Makes a saved setlist the **active** one — the app's "open".

> **This discards whatever was being edited**, with no confirmation dialog: there
> is no operator on the other side of an API call. Call `POST <BASE>/setlist/save`
> first if the current work matters.

Response: `{ "id": "…", "title": "…" }`.

### `DELETE <BASE>/setlists/:id` — `setlists:write`
Deletes the file. If it happened to be the active setlist, the copy in the app
stays open (there is simply no file to save back to).

### `PATCH <BASE>/setlist` — `setlists:write`
Renames the **active** setlist: `{ "title": "Sunday, 10am" }`.

### `POST <BASE>/setlist/save` — `setlists:write`
Writes the active setlist to the library (creating the file on first save).
Returns `{ "id", "title" }`. If writing fails, this returns an error and the
setlist stays unsaved — it never reports success it didn't achieve.

### `POST <BASE>/setlist/new` — `setlists:write`
Discards the active setlist and starts a blank one. `{ "title": "…" }` optional.
Same warning as `/open`: no confirmation.

### `POST <BASE>/setlist/items` — `setlists:write`
Adds an asset to the schedule.

```jsonc
{
  "assetGuid": "5b1c…",   // also accepts "worshipwide/<file>"
  "group": 0,             // omit → a NEW group is created for this item
  "groupName": "Worship", // title of that new group (only when `group` is omitted)
  "index": 2              // omit → appended at the end of the group
}
```

Response: the final position, `{ "group": 0, "index": 2 }`.

### `PATCH <BASE>/setlist/items/move` — `setlists:write`
Reorders an item — inside a group or across groups (the loose list included).

```json
{ "from": { "group": 0, "index": 3 }, "to": { "group": 1, "index": 0 } }
```

An `index` past the end of the destination lands at the end. Missing source
position → `404 not_found`.

### `POST <BASE>/setlist/items/select` — `setlists:write`
**Selects** an item: it goes to the preview and the app opens that type's view —
exactly what clicking it in the sidebar does. Two ways to address it:

```jsonc
{ "group": 0, "index": 2 }   // position in the schedule
{ "position": 3 }            // FLAT index, counting only what the sidebar draws
```

`position` is the numbering the operator sees on screen (the same one the MIDI
positional protocol uses), skipping asset types the sidebar doesn't render.

> **This does not project.** Selecting prepares; putting on screen is
> `POST <BASE>/outputs/:output/layers/:layer/present` (or `/music`), where theme
> per verse, background per verse and the selected outputs get resolved.

### `DELETE <BASE>/setlist/items/:group/:index` — `setlists:write`
Removes an item. `DELETE <BASE>/setlist/items/orphans/0` removes the first loose
asset.

### `POST <BASE>/setlist/groups` — `setlists:write`
Creates a group, optionally already populated.

```json
{ "title": "Worship", "assetGuids": ["5b1c…", "9f2a…"] }
```

Response: `{ "group": 2, "title": "Worship" }` — `group` is its index, which is
what the item routes take.

### `PATCH <BASE>/setlist/groups/:group` — `setlists:write`
Title, colour and icon. `null` clears colour/icon (back to default); an omitted
field is left alone.

```json
{ "title": "Worship", "color": "#4f8cff", "icon": "music" }
```

### `PATCH <BASE>/setlist/groups/:group/move` — `setlists:write`
Moves the group: `{ "to": 0 }`. A `to` past the end lands at the end.

### `DELETE <BASE>/setlist/groups/:group` — `setlists:write`
Removes the group **and the items in it**.

> `orphans` is not a group: renaming, moving or deleting it answers
> `400 bad_request`. Add and remove items in it as usual.

## Panels

The control app's UI is a dock of panels — Preview, Live, Media, Bible, Mixer,
Media Control, plugin panels, custom web panels… A client can prepare the
operator's screen for what it is about to do: bring the Bible panel up, put Media
Control in view, dock a plugin's panel next to the preview.

These routes are forwarded to the app's window, so they can answer
`503 unavailable` (layout not ready) / `504 timeout` — see
[authentication](authentication.md#the-app-window-did-not-answer).

Panel ids: the core ones (`sidebar`, `main`, `live`, `preview`, `media`, `bible`,
`stage`, `mixer`, `fx`, `mediaControl`, `properties`, `announcements`, `timers`,
`clips`, `macroButtons`, `console`), plus the dynamic ones —
`plugin:<pluginId>:<panelId>`, `live:<output>`, `mixer:<output>` and
`custom:<id>`. Don't hardcode them: `GET <BASE>/panels` is the source of truth.

### `GET <BASE>/panels` — `ui:read`

```json
{ "panels": [
  { "id": "preview", "title": "Prévia", "kind": "core", "open": true, "visible": true,
    "location": "grid", "groupId": "group-3", "closable": true, "gated": false },
  { "id": "mixer", "title": "Mixer", "kind": "core", "open": false, "visible": false,
    "closable": true, "gated": true }
] }
```

| Field | Meaning |
|---|---|
| `kind` | `core`, `plugin`, `live`, `mixer` or `custom` |
| `open` | It is in the layout |
| `visible` | It is in the layout **and actually on screen** — see below |
| `location` | `grid` (docked), `floating` or `popout` (its own window). Absent when closed |
| `groupId` | The dock group it shares with its sibling tabs |
| `closable` | `false` for the structural ones (`sidebar`, `main`) |
| `gated` | Unavailable by licence/setting (Mixer and FX need PRO; the automation console must be enabled). Opening it answers `403 forbidden` |

> **`open` is not `visible`.** A panel open as an **inactive tab** of a group is as
> invisible to the operator as a closed one, and so is one hidden behind another
> group in fullscreen. If you want the operator to *see* it, use `/select`.

### `POST <BASE>/panels/:id/open` — `ui:write`
Opens a panel. With no body it lands where the app's own **Panels** menu would put
it, which is what the operator expects.

```jsonc
{
  "float": true,         // open as a floating group instead
  "reference": "preview", // open relative to another OPEN panel…
  "direction": "within"   // …left | right | above | below | within (sibling tab)
}
```

Already open → it is made the active tab. Returns the panel's state (same shape as
`GET <BASE>/panels`). Unknown id → `404 not_found`; gated → `403 forbidden`;
unknown `reference` → `404 not_found`.

### `POST <BASE>/panels/:id/close` — `ui:write`
Closes it. Not open → `404 not_found`; a non‑closable panel → `403 forbidden`.

### `POST <BASE>/panels/:id/select` — `ui:write`
**Brings it into view**: opens it if it isn't in the layout, makes it the active
tab of its group, and leaves another group's fullscreen if one is up. This is the
one to call before telling the operator to look at something.

### `POST <BASE>/panels/:id/dock` — `ui:write`
Docks a floating panel into the layout. With no body it joins the first docked
group; `{ "reference": "preview", "direction": "within" }` places it relative to
another open panel (`within` = as a sibling tab).

### `POST <BASE>/panels/:id/float` — `ui:write`
The inverse: pulls it out into a floating group.
`{ "width": 520, "height": 400, "x": 160, "y": 110 }` — all optional.

## Media

### `GET <BASE>/media` — `media:read`
`{ "state": { "playing": false, "loop": false }, "time": 0 }`

### `POST <BASE>/media/play` — `media:write`
### `POST <BASE>/media/pause` — `media:write`
### `POST <BASE>/media/seek` — `media:write`
`{ "time": 42 }` (seconds).

## Thumbnails

### `POST <BASE>/thumbnail` — `assets:read`
Renders (or reuses from cache) the thumbnail of any `presentation`. Pass the
output dimensions to reuse the same cache the app uses.

```jsonc
// body
{ "presentation": { "asset": {…}, "theme": {…}, "props": { "index": 2, "text": "…" } },
  "width": 1920, "height": 1080 }
// response
{ "thumbnail": "/thumbnails/previews/<guid>/<hash>.webp" }  // or a data: URL
```

### `POST <BASE>/outputs/:output/music-thumbnail` — `assets:read`
Thumbnail of a song verse (`{ assetGuid, index }`); reuses the app's thumbnail
cache. Response: `{ "thumbnail": "/thumbnails/previews/…" }`.

`thumbnail` is either a relative path (served statically on the API origin) or a
`data:` URL — in both cases ready for `<img src>`.

## Timer

### `GET <BASE>/timer` — `timer:read`
### `POST <BASE>/timer` — `timer:write`
Sets the timer (body = timer state). `DELETE <BASE>/timer` clears it.

## Automation

### `POST <BASE>/automation/trigger/:routeId` — no token
Fires Spresenter automations that use the **`apiTrigger`** trigger, filtered by
`routeId`. This route is **open** (no `Authorization` needed) so it can be called
as a plain webhook — but it only responds while the external API is **enabled**
in Settings.

```bash
curl -X POST "<BASE>/automation/trigger/my-route" \
  -H "Content-Type: application/json" -d '{"foo":"bar"}'
```

The request `method`, `body` and `query` are forwarded to the matching automation
node. Response: `202 Accepted` with `{ "ok": true, "routeId": "my-route" }`.
Returns `403 api_disabled` if the API is off.

> Because it takes no token, treat the `routeId` as a shared secret and only
> expose the API on a trusted network.

### `POST <BASE>/automation/macros/:id/run` — per‑macro
Runs a **macro** by its id. Whether this route is available, and whether it needs
a token, is decided **per macro** in the macro editor (open the macro, select no
node, and use the **Run via API** section in the sidebar):

- **Run via API** off → `403 macro_api_disabled`.
- **Run via API** on, token required (default) → send a valid token
  (`Authorization: Bearer` **or** `?token=`); otherwise `401 unauthorized`.
- **Run via API** on + **Allow without token** → open, no token needed.

The external API must also be enabled in Settings, otherwise `403 api_disabled`.

```bash
# token-protected macro
curl -X POST "<BASE>/automation/macros/<macro-id>/run" \
  -H "Authorization: Bearer spk_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"song":"Amazing Grace","verse":2}'

# macro liberada (sem token)
curl -X POST "<BASE>/automation/macros/<macro-id>/run" \
  -H "Content-Type: application/json" -d '{}'
```

Response: `202 Accepted` with `{ "ok": true, "id": "<macro-id>" }`.

**Payload → Macro Start outputs.** The JSON body (merged with the query string,
minus `token`) becomes the macro's payload. Variables declared on the macro
(sidebar → **Payload variables**, each with a name + type) are exposed as the
**output ports of the "Macro Start" node**, so downstream nodes can read
`payload.<name>` through a wire.

> The macro id and the ready‑to‑copy route are shown in the macro editor sidebar
> (with no node selected). For an open macro, treat the id as a shared secret and
> keep the API on a trusted network.

## WebSocket

### `GET <BASE>/ws?token=spk_...` — real‑time events
See [websocket.md](websocket.md).

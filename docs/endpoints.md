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

## Event

### `GET <BASE>/event` — `events:read`
The **active** event (whatever is open in the app right now, even unsaved). Assets
are returned **without the `data` field** to keep the payload small — fetch the
full asset from `GET <BASE>/assets/:guid` when needed.

```json
{ "active": true, "event": { "title": "Sunday service", "schedules": [ { "id": "…", "title": "Worship", "assets": [ { "guid": "…", "title": "…", "type": "music" } ] } ], "assets": [] } }
```

If no event is open: `{ "active": false }`.

### `GET <BASE>/events` — `events:read`
Summaries of the **saved** events (`id`, `title`, `thumbnail`, `modified`).

### `GET <BASE>/events/:id` — `events:read`
Full saved event (schedules + assets).

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

## WebSocket

### `GET <BASE>/ws?token=spk_...` — real‑time events
See [websocket.md](websocket.md).

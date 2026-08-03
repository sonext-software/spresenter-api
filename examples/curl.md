# curl examples

Set your base URL (from **Settings → API**) and token once:

```bash
export BASE="<your api base url>"     # e.g. the value shown in Settings → API
export TOKEN="spk_YOUR_TOKEN"
export AUTH="Authorization: Bearer $TOKEN"
```

## Discover the token's permissions

```bash
curl "$BASE" -H "$AUTH"
```

## List outputs and layers

```bash
curl "$BASE/outputs" -H "$AUTH"
curl "$BASE/outputs/0/layers" -H "$AUTH"
```

## Read what is live

```bash
curl "$BASE/outputs/0/layers/2" -H "$AUTH"
```

## Find an asset and put it live

```bash
# 1) find a song
curl "$BASE/assets?type=music&q=grace" -H "$AUTH"

# 2) put it live (output 0, layer 2) by the returned guid
curl -X POST "$BASE/outputs/0/layers/2" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"PASTE_THE_GUID_HERE"}'

# 3) show the layer — setting content does not make it visible on its own
curl -X PATCH "$BASE/outputs/0/layers/2/state" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"show":true,"opacity":1}'
```

## Put a specific song verse live

```bash
curl -X POST "$BASE/outputs/0/layers/2/music" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"SONG_GUID","index":1}'
```

This one leaves the layer visible for you — it is the exception, not the rule.

## Change the presentation (put an asset live)

`/present` builds the presentation server-side — theme per output, the slide out
of the `.scp` manifest, the framing — and leaves the layer visible. It is what a
double-click in the app does. Sending the same asset through the raw
`POST .../layers/:layer` would render **empty** for a slide presentation or an
image: those need a theme, and the raw path resolves none.

```bash
# which layer does this type open on? the one listing it in defaultForTypes
curl "$BASE/layers" -H "$AUTH"

# first slide of a presentation
curl -X POST "$BASE/outputs/0/layers/1/present" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"DECK_GUID","index":0}'

# next slide: same call, next index
curl -X POST "$BASE/outputs/0/layers/1/present" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"DECK_GUID","index":1}'

# a background video (a Worshipwide one is addressed by path, not guid)
curl -X POST "$BASE/outputs/0/layers/0/present" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"worshipwide/Abstract-Chrome.mp4"}'
```

## Show an announcement (text on screen)

`/announcement` resolves the output's announcement theme for you — including the
bundled ones, which have no guid and so cannot be referenced any other way — and
leaves the layer visible.

```bash
# 1) which {placeholders} does the announcement theme declare?
curl "$BASE/outputs/0/announcement" -H "$AUTH"
# → { "variables": ["mensagem"], "allVariables": ["mensagem"], "theme": {...} }

# 2) which layer do announcements open on? the one listing the type as default
curl "$BASE/layers" -H "$AUTH"

# 3) send it — `props` fills those placeholders
curl -X POST "$BASE/outputs/0/layers/3/announcement" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"props":{"mensagem":"Prayer meeting at 7:30pm"}}'
```

Change the wording without re-sending the presentation (no crossfade, no flash of
empty screen) by patching the theme element in place — its id comes from the
Layers panel of the theme editor:

```bash
curl -X POST "$BASE/outputs/0/layers/3/elements/mensagem" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"text":"Prayer meeting — starting soon"}'
```

Clear it when done. There is no server-side auto-clear (the "auto clear" field in
the app's Announcements panel is a timer in the app's own UI, and so is the one in
the Companion module), so whoever posts the announcement is also the one who
schedules its removal:

```bash
curl -X DELETE "$BASE/outputs/0/layers/3" -H "$AUTH"
curl -X PATCH "$BASE/outputs/0/layers/3/state" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{"show":false}'
```

## Clear a layer

```bash
curl -X DELETE "$BASE/outputs/0/layers/2" -H "$AUTH"
```

## Change a layer's opacity/visibility

```bash
curl -X PATCH "$BASE/outputs/0/layers/2/state" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"show":true,"opacity":0.5,"transitionMs":300}'
```

## Asset thumbnail

```bash
curl "$BASE/assets/GUID/thumbnail?token=$TOKEN" -o thumb.png
```

## Add a file to the library

Needs `assets:write`. The response is always `{ "assets": [...] }`.

```bash
# a folder to keep the upload organized (optional)
FOLDER=$(curl -s -X POST "$BASE/assets/folder" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"title":"Sunday 12/07","category":"video"}' | jq -r .guid)

# multipart — the way to send a real file (streamed to disk, any size)
curl -X POST "$BASE/assets" -H "$AUTH" \
  -F "file=@./opening.mp4" \
  -F "type=backgroundVideo" \
  -F "title=Opening" \
  -F "parent=$FOLDER"

# JSON + base64 — handy for small files
curl -X POST "$BASE/assets" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"filename\":\"logo.png\",\"contentBase64\":\"$(base64 -w0 ./logo.png)\"}"

# JSON + URL — the app downloads it; nothing is uploaded from here
curl -X POST "$BASE/assets" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"filename":"clip.mp4","sourceUrl":"https://example.org/clip.mp4","type":"backgroundVideo"}'
```

Then put it live in one step with `/present`:

```bash
GUID=$(curl -s -X POST "$BASE/assets" -H "$AUTH" \
  -F "file=@./slide.png" | jq -r '.assets[0].guid')

curl -X POST "$BASE/outputs/0/layers/1/present" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"assetGuid\":\"$GUID\"}"
```

Uploaded video may still be **re-encoded in the background**, which can change the
asset's `extension` when it finishes. Watch for it on the WebSocket
(`assets.updated`) if that matters, or just re-read `GET $BASE/assets/$GUID`.

## Add a song with structured lyrics

Sections — not a text blob — are what the app projects, and the searchable text is
derived from them, so the song shows up in the app's search immediately.

```bash
curl -X POST "$BASE/assets/music" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{
    "title": "Sample Song",
    "artist": ["Sample Author"],
    "key": "D",
    "groups": [{ "id": "v", "name": "Verse", "color": "#4f8cff" }],
    "sections": [
      { "type": "verse",  "text": "This is line one\nAnd this is line two", "group": "v",
        "chords": [{ "position": 0, "chord": "D" }, { "position": 18, "chord": "A" }] },
      { "type": "chorus", "text": "This is the chorus" }
    ]
  }'
```

The response carries `{ asset, lyrics }` — `lyrics` is what was **actually
stored**, after the server dropped anything invalid (unknown section type, chord
position past the end of the text, malformed group color). Fix a verse later
without recreating the asset:

```bash
curl -X PUT "$BASE/assets/SONG_GUID/lyrics" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{
    "sections": [
      { "type": "verse",  "text": "This is line one\nAnd this is line two" },
      { "type": "chorus", "text": "This is the chorus\nWith a corrected second line" }
    ]
  }'
```

And project verse 1 (0-based):

```bash
curl -X POST "$BASE/outputs/0/layers/2/music" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"SONG_GUID","index":1}'
```

## Active setlist

```bash
curl "$BASE/setlist" -H "$AUTH"
```

## Media control

```bash
curl -X POST "$BASE/media/pause" -H "$AUTH"
curl -X POST "$BASE/media/seek" -H "$AUTH" -H "Content-Type: application/json" -d '{"time":30}'
```

## Scope error (example)

With a read‑only token, a POST returns 403:

```bash
curl -i -X POST "$BASE/outputs/0/layers/2" -H "$AUTH" -d '{"assetGuid":"x"}'
# HTTP/1.1 403 Forbidden
# {"error":{"code":"forbidden","message":"Insufficient scope...","requiredScope":"live:write"}}
```

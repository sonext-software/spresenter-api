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

## Show an announcement (text on screen)

There is no `/announcements` endpoint — an announcement is not a stored asset,
it is a presentation you build on the fly. A **theme is mandatory**: nothing
resolves one for you, and without it the renderer draws nothing at all.

```bash
# 1) find a saved theme tagged for announcements and copy its guid
#    (or copy it straight from the theme editor: ⋮ menu → "Copy theme ID")
curl "$BASE/assets?type=theme" -H "$AUTH"

# 2) which layer do announcements open on? the one listing the type as default
curl "$BASE/layers" -H "$AUTH"

# 3) send the announcement — `props` fills the theme's {placeholders}
#    (the stock announcement theme uses a single {mensagem})
curl -X POST "$BASE/outputs/0/layers/3" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"presentation":{
        "title":"Announcement",
        "asset":{"title":"Announcement","author":null,"type":"announcement"},
        "themeRef":"THEME_GUID",
        "props":{"mensagem":"Prayer meeting at 7:30pm"}
      }}'

# 4) SHOW THE LAYER — required. Step 3 only sets the content; on a hidden layer
#    the announcement is live but nothing reaches the screen.
curl -X PATCH "$BASE/outputs/0/layers/3/state" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"show":true,"opacity":1}'
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
the app's Announcements panel is a timer in the app's own UI), so whoever posts
the announcement is also the one who schedules its removal:

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

## Active event

```bash
curl "$BASE/event" -H "$AUTH"
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

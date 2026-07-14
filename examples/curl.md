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
```

## Put a specific song verse live

```bash
curl -X POST "$BASE/outputs/0/layers/2/music" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assetGuid":"SONG_GUID","index":1}'
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

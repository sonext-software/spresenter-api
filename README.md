# Spresenter API

Documentation and integration examples for the **Spresenter API** (`/api/v1`).

Any application — a Stream Deck, a web panel, a bot, an automation — can control
Spresenter over authenticated HTTP requests and receive real‑time events over
WebSocket.

## Contents

- [Authentication & permissions](docs/authentication.md)
- [HTTP endpoints](docs/endpoints.md)
- [WebSocket (real‑time events)](docs/websocket.md)
- Examples:
  - [curl](examples/curl.md)
  - [Node.js](examples/node/)
  - [Python](examples/python/)

## Quick start

1. In Spresenter, open **Settings → API**.
2. Turn **External API enabled** on.
3. Click **Create token**, give it a name and check the permissions (scopes).
4. Copy the token — it starts with `spk_` and is **shown only once**.
5. Copy the **base URL** shown on the same screen (referred to as `<BASE>` in
   this documentation).

First call — discover what your token can do:

```bash
curl <BASE> -H "Authorization: Bearer spk_YOUR_TOKEN"
```

Put an asset live on output `0`, layer `2` — then show the layer. These are two
separate steps: setting the content does not make the layer visible.

```bash
curl -X POST <BASE>/outputs/0/layers/2 \
  -H "Authorization: Bearer spk_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assetGuid":"<asset-guid>"}'

curl -X PATCH <BASE>/outputs/0/layers/2/state \
  -H "Authorization: Bearer spk_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"show":true,"opacity":1}'
```

## Concepts

- **Output** — a logical projection target, identified by an index (`0`, `1`, …).
  List them with `GET <BASE>/outputs`.
- **Layer** — each output has N independent layers, also addressed by index. A
  layer is where a presentation (song, video, image, text…) goes live. Its
  **content** and its **visibility** are set by different calls — putting
  something live never flips the layer's `show` on its own.
- **Asset** — a media/content item (song, video, image, presentation…),
  identified by a `guid`. You can also **add** assets (`assets:write`): upload a
  file, or create a song with structured lyrics — see
  [Adding assets](docs/endpoints.md#adding-assets).
- **Event** — the service/setlist: the list of assets for the gathering.

## Notes

- The API is served by the Spresenter app; use the base URL from **Settings →
  API** (`<BASE>`).
- It is a **local‑network (LAN)** API — there is no built‑in HTTPS or rate
  limiting. Treat tokens as secrets and keep usage within your own network.

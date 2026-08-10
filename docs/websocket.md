# WebSocket — real‑time events

Instead of polling for state, connect to the WebSocket and react to the events
Spresenter emits.

`<WS_BASE>` is your API base URL with the `http`/`https` scheme swapped for
`ws`/`wss` (e.g. if `<BASE>` is `http://HOST/api/v1`, then `<WS_BASE>` is
`ws://HOST/api/v1`).

## Connecting

```
<WS_BASE>/ws?token=spk_YOUR_TOKEN
```

- The token goes in the `?token=` query string.
- If the API is off, the handshake is rejected with `403`.
- If the token is invalid/disabled, the handshake is rejected with `401`.

On connect, the server sends:

```json
{ "key": "api.hello", "data": { "scopes": ["live:read", "media:read"] } }
```

## Messages

Each message is a JSON `{ "key": string, "data"?: any }`. The `key` identifies the
event. You **only receive** events your token has scopes for.

| `key` | Required scope | Meaning |
|---|---|---|
| `api.hello` | (always) | Initial handshake, with your scopes |
| `refresh.live.<output>` | `live:read` | A layer's content on the output changed |
| `refresh.live.go.<output>` | `live:read` | Crossfade sync signal |
| `refresh.state.<output>` | `live:read` | A layer's show/opacity/blend changed |
| `refresh.master.<output>` | `live:read` | The output's master opacity changed |
| `element.update.<output>` | `live:read` | A live theme element was patched (`data`: `{ layer, elementId, patch }`) |
| `element.reset.<output>` | `live:read` | Live element overrides were reset |
| `media.state` | `media:read` | Play/pause changed |
| `media.time` | `media:read` | Seek |
| `media.heartbeat` | `media:read` | Playback progress (`data.time`) |
| `timer.state` | `timer:read` | The timer changed |
| `theme.updated` | `assets:read` | A theme was updated |
| `setlist.updated` | `setlists:read` | The active setlist changed |

> Events are **notifications**: they usually don't carry the new data itself. When
> you receive `refresh.live.0`, fetch the updated state with
> `GET <BASE>/outputs/0/layers/:layer`.

> **Renamed:** `setlist.updated` used to be `event.updated`. The old key is
> **still broadcast** alongside the new one, so an existing listener keeps
> working — but a client that subscribes to both will be notified twice.

`setlist.updated` also fires for **your own** writes (`POST <BASE>/setlist/items`
and friends), immediately — so a client that re-syncs on the event will see its own
change echoed back. Ignore the echo if you already applied it locally.

There is **no event for panels**: the layout is UI state, and a client that changes
it already knows. Read `GET <BASE>/panels` when you need the current picture.

## Closing

- If the token is **revoked** or **disabled** while the socket is open, the server
  closes the connection with close code **`4401`**.
- If the API is turned off, all sockets are closed.

Handle `4401` by reconnecting only after obtaining a new/re‑enabled token.

## Quick example (wscat)

```bash
npx wscat -c "<WS_BASE>/ws?token=spk_YOUR_TOKEN"
# < {"key":"api.hello","data":{"scopes":["live:read"]}}
# (change something live in the app)
# < {"key":"refresh.live.0","data":{"revisionId":"…","transitionMs":500}}
```

Full clients in [Node.js](../examples/node/) and [Python](../examples/python/).

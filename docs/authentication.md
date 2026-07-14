# Authentication & permissions

Throughout the docs, `<BASE>` is the API base URL shown in **Settings → API**.

## Tokens

Each token is a string starting with `spk_`. It is generated in **Settings → API
→ Create token** and **shown only once** — Spresenter stores only a hash, so it
cannot be recovered later. If you lose it, revoke it and create a new one.

### Sending the token

Prefer the `Authorization` header:

```
Authorization: Bearer spk_YOUR_TOKEN
```

For **GET** requests and for the **WebSocket**, you may also pass it as the query
string parameter `?token=` (handy for an `<img src>` thumbnail or a WS client):

```
GET <BASE>/assets/<guid>/thumbnail?token=spk_YOUR_TOKEN
```

> On write requests (POST/PATCH/DELETE) `?token=` is **not** accepted — use the
> header so the token does not leak into proxy logs.

## Scopes (permissions)

A token can only do what its scopes allow. Grant the minimum required when
creating the token.

| Scope | Allows |
|---|---|
| `outputs:read` | List outputs and layers |
| `live:read` | Read what is live and each layer's state |
| `live:write` | Change live content, layer state and master |
| `assets:read` | List/search assets and access thumbnails |
| `media:read` | Read media playback state |
| `media:write` | Control playback (play/pause/seek) |
| `events:read` | Read the active event and saved events |
| `timer:read` | Read the timer state |
| `timer:write` | Control the timer |

Read and write are separate scopes: `live:write` does **not** imply `live:read`.
Check both if you need both.

## Error responses

All errors are JSON in the form:

```json
{ "error": { "code": "forbidden", "message": "…", "requiredScope": "live:write" } }
```

| HTTP | `code` | When |
|---|---|---|
| 401 | `unauthorized` | Token missing |
| 401 | `invalid_token` | Token unknown or disabled |
| 403 | `api_disabled` | The API is turned off in Settings |
| 403 | `forbidden` | Valid token, missing the required scope (see `requiredScope`) |
| 404 | `not_found` | Resource does not exist |
| 400 | `bad_request` | Invalid parameter/body |

## Enabling / disabling

- **External API enabled** (master toggle): when off, the whole API returns
  `403 api_disabled` and WebSockets are closed.
- **Disable a token**: cuts that token off (returns `401 invalid_token`) without
  deleting it — you can re‑enable it later.
- **Revoke**: permanently removes the token and closes any WebSocket open with it
  (close code `4401`).

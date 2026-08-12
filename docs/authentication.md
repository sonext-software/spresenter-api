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
| `assets:write` | **Add** assets: upload files, create songs with structured lyrics, create folders |
| `media:read` | Read media playback state |
| `media:write` | Control playback (play/pause/seek) |
| `setlists:read` | Read the active setlist and the saved setlists |
| `setlists:write` | **Build** setlists: create/rename/delete saved ones, open one, and edit the active one's schedule (items, groups, save) |
| `timer:read` | Read the timer state |
| `timer:write` | Control the timer |
| `ui:read` | Read the control app's panels (which are open, which are visible) |
| `ui:write` | Open, close, select, dock and float panels |
| `notifications:read` | Read this machine's notification center |
| `notifications:write` | Publish notifications, and mark/delete the ones in the center |
| `plugins:read` | List the installed plugins and the actions they expose |
| `plugins:invoke` | Run an action exposed by a plugin |

Read and write are separate scopes: `live:write` does **not** imply `live:read`.
Check both if you need both.

> **Renamed:** `events:read` is now `setlists:read` ("event" became "setlist"
> throughout the app). The old name is still accepted — a token created before
> the rename keeps working and simply reports the new name.

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
| 503 | `unavailable` | The app's main window is not available (see below) |
| 504 | `timeout` | The app's window did not answer in time (see below) |

Asset creation (`assets:write`) reports the specific problem instead of a generic
`bad_request`:

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_filename` | `filename` missing or empty |
| 400 | `unsupported_file` | Extension the app cannot ingest (see `POST <BASE>/assets`) |
| 400 | `invalid_type` | `type` incompatible with the file's extension |
| 400 | `invalid_source` | Neither or both of `contentBase64` / `sourceUrl` |
| 400 | `invalid_base64` / `empty_content` | `contentBase64` could not be decoded |
| 400 | `missing_title` / `missing_lyrics` / `missing_category` | Required field missing |
| 400 | `not_a_music` | The guid is not a song (lyrics endpoints) |
| 404 | `folder_not_found` | `parent` is not an existing folder |
| 413 | `too_large` | Body/download over the limit |
| 422 | `process_failed` | The file was rejected while being processed |
| 502 | `download_failed` | `sourceUrl` could not be fetched |

Calling a plugin action (`plugins:invoke`) reports where the failure was:

| HTTP | `code` | When |
|---|---|---|
| 404 | `not_found` | The plugin is not installed |
| 404 | `unknown_action` | The plugin does not expose that action |
| 409 | `plugin_disabled` | Installed but turned off in Settings → Plugins |
| 503 | `plugin_unavailable` | Its process would not start, or died mid-call |
| 504 | `plugin_timeout` | The handler did not answer within `timeoutMs` |
| 4xx/5xx | (the plugin's own) | The handler failed **and chose the status** — a plugin answers `404` for "member not found" |

The last row is deliberate: everything else on this page is the app's verdict, but
a plugin action's business failure is the plugin's, and it says so in its own
status code.

### The app window did not answer

Most of the API is served by Spresenter's background process, which is always
there. Two areas are not: the **active setlist's schedule** and the **panel
layout** live inside the app's window, so those calls are forwarded to it and
wait for its answer.

That is why `POST <BASE>/setlist/items`, the `/setlist/groups` routes, every
`/panels` route and the **read/mark/delete** side of `/notifications` can
return:

- **`503 unavailable`** — the window is closed or still starting (or, for panels,
  the layout has not finished loading). Retry.
- **`504 timeout`** — the window is busy or wedged and did not answer within a few
  seconds. The call may or may not have taken effect; read the state back.

Read‑only setlist routes (`GET <BASE>/setlist`, `/setlists`) are served from a
cache in the background process and never return these. Neither does
**publishing** a notification (`POST <BASE>/notifications`): it is handled by
the background process and works even while the window is busy.

## Enabling / disabling

- **External API enabled** (master toggle): when off, the whole API returns
  `403 api_disabled` and WebSockets are closed.
- **Disable a token**: cuts that token off (returns `401 invalid_token`) without
  deleting it — you can re‑enable it later.
- **Revoke**: permanently removes the token and closes any WebSocket open with it
  (close code `4401`).

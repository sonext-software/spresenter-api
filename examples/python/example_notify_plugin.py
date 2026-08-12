"""Spresenter API — talk to the OPERATOR (notification center) and to a PLUGIN.

These are the two parts of the API that are not about what is on screen:

1. **Notification center** — the bell in the app's title bar. Unlike a toast, the
   card stays (the 50 most recent), counts as unread and — when the app's window
   is not focused — also fires an OS notification. That is how an integration
   reaches the person who stepped away from the machine.

2. **Plugin actions** — everything else in this API is what the APP can do. What
   an integration usually needs is something only *that church's* plugin knows how
   to do ("pull today's roster", "sync with my system"). A plugin declares actions
   by name; you call them by that name and get the handler's return value back.

    BASE="<api base url>" TOKEN=spk_... python example_notify_plugin.py

Scopes: notifications:read, notifications:write, plugins:read, plugins:invoke.

Dependencies: pip install -r requirements.txt
"""
import os

import requests

BASE = os.environ.get("BASE")
TOKEN = os.environ.get("TOKEN")

if not BASE or not TOKEN:
    raise SystemExit('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... python example_notify_plugin.py')

BASE = BASE.rstrip("/")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def req(method, path, body=None):
    res = requests.request(method, f"{BASE}{path}", headers=HEADERS, json=body)
    data = res.json() if res.content else None
    if not res.ok:
        err = (data or {}).get("error", {})
        raise RuntimeError(f"{method} {path} -> {err.get('code', res.status_code)}: {err.get('message', '')}")
    return data


# ── 1. Publish a notification ────────────────────────────────────────────────
# Passing your own `id` makes a re-send idempotent: the center dedupes by it, so a
# retry after a network blip does not stack a second card.
published = req(
    "POST",
    "/notifications",
    {
        "id": "roster-sync-2026-08-16",
        "title": "Roster synced",
        "body": "Ana replaced Joao on camera 2.",
        "level": "warning",  # info | success | warning | error
        "from": "Roster bot",  # an anonymous alert mid-service helps nobody
    },
)["notification"]
print("published:", published["id"], "-", published["title"])

# ── 2. Read the center back ──────────────────────────────────────────────────
center = req("GET", "/notifications?limit=5")
print(f"\ncenter ({center['unread']} unread):")
for n in center["notifications"]:
    mark = " " if n["read"] else "*"
    print(f" {mark} [{n['level']}] {n['title']} - {n.get('from') or 'no sender'}")

# It does NOT auto-clear. Whoever posts is the one who schedules the delete:
#   req("POST", f"/notifications/{published['id']}/read")
#   req("DELETE", f"/notifications/{published['id']}")

# ── 3. Discover the plugins of THIS installation ─────────────────────────────
plugins = req("GET", "/plugins")["plugins"]
print("\nplugins:")
for p in plugins:
    actions = ", ".join(a["action"] for a in p["actions"]) or "(none registered yet)"
    state = "" if p["enabled"] else "[disabled] "
    print(f" - {p['name']} ({p['id']}) {state}- {p['runtime']} - {actions}")

# `actions` lists what the RUNNING plugin processes have registered. A plugin
# without `background: true` in its manifest shows an empty list until something
# calls it; calling still works (the call starts it first).
target = next((p for p in plugins if p["enabled"] and p["actions"]), None)
if target is None:
    raise SystemExit("\nNo plugin exposes an action on this machine - nothing to call.")

# ── 4. Call one ──────────────────────────────────────────────────────────────
action = target["actions"][0]
print(f"\ncalling {target['id']}/{action['action']}...")
try:
    # The action's own payload. `sample` (when the plugin declared one) shows the
    # shape it expects; the app never inspects it.
    res = req(
        "POST",
        f"/plugins/{target['id']}/requests/{action['action']}?timeoutMs=15000",
        action.get("sample") or {},
    )
    print("response:", res["data"])
except RuntimeError as err:
    # A well-written plugin answers with ITS OWN status for a business failure -
    # 404 for "member not found", 400 for a bad field - so react to the code
    # instead of guessing from a 500. The app's own verdicts are distinct:
    # plugin_disabled (409), plugin_unavailable (503), plugin_timeout (504).
    print("the action failed:", err)

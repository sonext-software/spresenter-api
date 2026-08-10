"""Spresenter API — BUILD a setlist (`setlists:write`) and drive panels (`ui:write`).

Creates a setlist, opens it, fills the schedule with songs from the library,
reorders it, selects the first item and brings the Preview panel into view.

    BASE="<api base url>" TOKEN=spk_... python example_setlist.py

Nothing here PROJECTS: selecting an item prepares it (preview + the type's view).
Putting content on screen is /present or /music — see example_live.py.

Dependencies: pip install -r requirements.txt
"""
import os

import requests

BASE = os.environ.get("BASE")
TOKEN = os.environ.get("TOKEN")

if not BASE or not TOKEN:
    raise SystemExit('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... python example_setlist.py')

BASE = BASE.rstrip("/")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def req(method, path, body=None):
    res = requests.request(method, f"{BASE}{path}", headers=HEADERS, json=body)
    data = res.json() if res.content else None
    if not res.ok:
        err = (data or {}).get("error", {})
        # 503 unavailable / 504 timeout mean the app's WINDOW did not answer: the
        # active setlist and the panel layout live there, not in the background
        # process that serves the rest of the API.
        raise RuntimeError(f"{method} {path} -> {err.get('code', res.status_code)}: {err.get('message', '')}")
    return data


def main():
    info = req("GET", "")
    scopes = info["token"]["scopes"]
    print(f"Token \"{info['token']['name']}\" — scopes: {', '.join(scopes)}")
    if "setlists:write" not in scopes:
        raise SystemExit('\nThis token cannot build setlists. Add "setlists:write" in Settings → API.')

    # 0. Opening another setlist DISCARDS the active one with no confirmation
    #    (there is no operator on the other side of an API call), so save first.
    current = req("GET", "/setlist")
    if current.get("active"):
        title = current["setlist"].get("title") or "(untitled)"
        print(f"\nActive setlist: \"{title}\" — saving it before we take over.")
        try:
            req("POST", "/setlist/save")
        except RuntimeError as e:
            # /setlist/save fails instead of pretending: it stays unsaved.
            raise SystemExit(f"Could not save it ({e}) — aborting so nothing is lost.")

    # 1. Create + open.
    created = req("POST", "/setlists", {"title": "Built by the API"})
    print(f"\nCreated {created['id']} — \"{created['title']}\"")
    req("POST", f"/setlists/{created['id']}/open")

    # 2. Groups and items. A group can be born populated; an unknown guid fails
    #    the call instead of half-filling the group.
    songs = req("GET", "/assets?type=music")[:3]
    if not songs:
        print("No songs in the library — add one first (see example_add_assets.py).")
        return

    group = req("POST", "/setlist/groups", {
        "title": "Worship",
        "assetGuids": [s["guid"] for s in songs[:2]],
    })["group"]
    print(f"Group {group} \"Worship\" with {len(songs[:2])} song(s)")

    # One more at a specific position (omit `index` to append).
    if len(songs) > 2:
        at = req("POST", "/setlist/items", {"assetGuid": songs[2]["guid"], "group": group, "index": 0})
        print(f"Added \"{songs[2]['title']}\" at {at['group']}/{at['index']}")

    # No `group` at all → the item gets a NEW group of its own, which is what the
    # app does when you drop an asset outside any group.
    own = req("POST", "/setlist/items", {"assetGuid": songs[0]["guid"], "groupName": "Closing"})
    print(f"\"{songs[0]['title']}\" in its own group {own['group']}")

    # 3. Reorder — inside a group or across them ("orphans" addresses the loose
    #    list). An index past the end lands at the end.
    req("PATCH", "/setlist/items/move", {
        "from": {"group": group, "index": 0},
        "to": {"group": group, "index": 99},
    })
    print("Moved the first item of the group to the end.")

    req("PATCH", f"/setlist/groups/{group}", {"title": "Opening worship", "color": "#4f8cff"})

    # 4. Read it back — group indexes shift as groups are added/moved/removed, so
    #    this is the honest way to know what you built.
    setlist = req("GET", "/setlist")["setlist"]
    print(f"\n\"{setlist['title']}\"")
    for i, schedule in enumerate(setlist.get("schedules") or []):
        print(f"  [{i}] {schedule['title']}")
        for j, asset in enumerate(schedule.get("assets") or []):
            print(f"      {j}. {asset['title']} ({asset['type']})")
    if setlist.get("assets"):
        print("  [orphans]")
        for j, asset in enumerate(setlist["assets"]):
            print(f"      {j}. {asset['title']}")

    req("POST", "/setlist/save")
    print("\nSaved.")

    # 5. Select an item — the sidebar click: it becomes the preview and the app
    #    opens that type's view. This does NOT project.
    req("POST", "/setlist/items/select", {"group": group, "index": 0})
    print("Selected the first item of the group (preview only).")

    # Or by the FLAT position the operator counts on screen (0-based), skipping
    # types the sidebar does not draw — the same numbering the MIDI positional
    # protocol uses:
    # req("POST", "/setlist/items/select", {"position": 0})

    # 6. Prepare the screen.
    if "ui:write" not in scopes:
        print('\n(Add the "ui:write" scope to also drive the panels.)')
        return

    panels = req("GET", "/panels")["panels"]
    print("\nPanels:")
    for p in (x for x in panels if x["open"]):
        note = "" if p["visible"] else "  (open but not on screen)"
        print(f"  {p['id']:<24} {p.get('location', '-')}{note}")

    # `select`, not `open`: a panel open as an INACTIVE TAB is invisible, and this
    # also leaves another group's fullscreen.
    req("POST", "/panels/preview/select")
    print("Preview panel brought into view.")

    # Gated panels (Mixer/FX need PRO, the console must be enabled) answer 403.
    mixer = next((p for p in panels if p["id"] == "mixer"), None)
    if mixer and mixer["gated"]:
        print("Mixer is gated (PRO) — not opening it.")

    # Cleanup, if you would rather not leave it behind:
    # req("DELETE", f"/setlists/{created['id']}")


if __name__ == "__main__":
    main()

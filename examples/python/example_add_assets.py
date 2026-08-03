"""Spresenter API — ADD content to the library (scope `assets:write`).

Uploads the files given on the command line, creates a song with structured
lyrics and projects one of its verses.

    BASE="<api base url>" TOKEN=spk_... python example_add_assets.py [file...]

Supported files: images (.png .jpg .jpeg .bmp), video (.mp4 .mov) and audio
(.mp3 .wav .aac). Songs and themes are not files — a song is created below.

Dependencies: pip install -r requirements.txt
"""
import os
import sys
from pathlib import Path

import requests

BASE = os.environ.get("BASE")
TOKEN = os.environ.get("TOKEN")
OUTPUT = int(os.environ.get("OUTPUT", "0"))

if not BASE or not TOKEN:
    raise SystemExit('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... python example_add_assets.py')

BASE = BASE.rstrip("/")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

VIDEO_EXT = {".mp4", ".mov"}


def _check(res, what):
    data = res.json() if res.content else None
    if not res.ok:
        err = (data or {}).get("error", {})
        raise RuntimeError(f"{what} -> {err.get('code', res.status_code)}: {err.get('message', '')}")
    return data


def req(method, path, body=None):
    return _check(requests.request(method, f"{BASE}{path}", headers=HEADERS, json=body), f"{method} {path}")


def upload_file(path, **meta):
    """Multipart upload — the file is streamed, so size is not a concern.

    Note `files=` (not `json=`): requests builds the multipart boundary itself,
    and setting Content-Type by hand would break it.
    """
    path = Path(path)
    with path.open("rb") as fh:
        data = _check(
            requests.post(
                f"{BASE}/assets",
                headers=HEADERS,
                files={"file": (path.name, fh)},
                data={k: str(v) for k, v in meta.items() if v is not None},
            ),
            "POST /assets",
        )
    # The endpoint always answers a list, even for a single file.
    return data["assets"][0]


def main():
    info = req("GET", "")
    print(f"Token \"{info['token']['name']}\" — scopes: {', '.join(info['token']['scopes'])}")
    if "assets:write" not in info["token"]["scopes"]:
        raise SystemExit('\nThis token cannot add assets. Add the "assets:write" scope in Settings → API.')

    # 1. A folder, so the upload lands somewhere. `category` is the tab.
    folder = req("POST", "/assets/folder", {"title": "API upload", "category": "video"})
    print(f"\nFolder \"{folder['title']}\" -> {folder['guid']}")

    # 2. Files. A .mp4 defaults to `video` (the presentation kind); ask for
    #    `backgroundVideo` when it should sit on a background layer instead.
    for name in sys.argv[1:]:
        path = Path(name)
        is_video = path.suffix.lower() in VIDEO_EXT
        asset = upload_file(
            path,
            title=path.stem,
            **({"type": "backgroundVideo", "parent": folder["guid"]} if is_video else {}),
        )
        print(f"Uploaded {path.name} -> {asset['guid']} ({asset['type']}{asset.get('extension', '')})")

    # A file the app fetches itself — nothing is uploaded from here:
    # req("POST", "/assets", {"filename": "clip.mp4",
    #                         "sourceUrl": "https://example.org/clip.mp4",
    #                         "type": "backgroundVideo"})

    # 3. A song with STRUCTURED lyrics. `sections` — not a blob of text — is what
    #    the app projects: each one is a slide. The searchable text is derived
    #    from them, so the song is findable in the app's search right away.
    created = req("POST", "/assets/music", {
        "title": "Sample Song",
        "artist": ["Sample Author"],
        "key": "D",
        "groups": [
            {"id": "v", "name": "Verse", "color": "#4f8cff"},
            {"id": "c", "name": "Chorus", "color": "#ffb020"},
        ],
        "sections": [
            {
                "type": "verse",
                "group": "v",
                "text": "This is line one\nAnd this is line two",
                # `position` is a character offset into `text`; anything past its
                # end is dropped by the server instead of failing the request.
                "chords": [{"position": 0, "chord": "D"}, {"position": 18, "chord": "A"}],
            },
            {"type": "chorus", "group": "c", "text": "This is the chorus"},
            # `group` is optional — this one has none.
            {"type": "bridge", "text": "A bridge near the end\nUsually only once"},
        ],
        # Per-verse timecodes in seconds (None = unsynced). A raw LRC string in
        # `syncedLyrics` works too — the server converts it.
        "timecodes": [0, 21.5, None],
    })
    song, lyrics = created["asset"], created["lyrics"]
    print(f"\nSong \"{song['title']}\" -> {song['guid']}")

    # The response echoes what was ACTUALLY stored: invalid section types,
    # out-of-range chords and malformed group colors are dropped, not rejected.
    for i, section in enumerate(lyrics["sections"]):
        chords = f" ({len(section['chords'])} chords)" if section.get("chords") else ""
        print(f"  [{i}] {section.get('type', '-')}{chords}")
        print(f"      {section['text'].replace(chr(10), ' / ')}")

    # 4. Fix a verse later, without recreating the asset.
    req("PUT", f"/assets/{song['guid']}/lyrics", {
        "sections": lyrics["sections"][:2] + [
            # Same section, corrected text — that is the point of this endpoint.
            {"type": "bridge", "text": "A bridge near the end\nWith a corrected second line"},
        ],
    })
    print("Lyrics updated.")

    # 5. Project verse 1 — on the layer that lists `music` in defaultForTypes.
    layers = req("GET", "/layers")
    layer = next((i for i, l in enumerate(layers) if "music" in (l.get("defaultForTypes") or [])), None)
    if layer is None:
        print("No layer is set as default for songs — project it from the app.")
    else:
        req("POST", f"/outputs/{OUTPUT}/layers/{layer}/music", {"assetGuid": song["guid"], "index": 1})
        print(f"Verse 1 live on {OUTPUT}/{layer}.")


if __name__ == "__main__":
    main()

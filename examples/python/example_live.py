"""Spresenter API integration example (Python).

Puts the first song of the catalog live (output 0, layer 2) and listens for live
changes over WebSocket.

    BASE="<api base url>" TOKEN=spk_... python example_live.py

Dependencies: pip install -r requirements.txt
"""
import json
import os

import requests
import websocket  # websocket-client

BASE = os.environ.get("BASE")
TOKEN = os.environ.get("TOKEN")
OUTPUT = int(os.environ.get("OUTPUT", "0"))
LAYER = int(os.environ.get("LAYER", "2"))

if not BASE or not TOKEN:
    raise SystemExit('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... python example_live.py')

BASE = BASE.rstrip("/")
WS_URL = BASE.replace("http", "ws", 1) + f"/ws?token={TOKEN}"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


class Spresenter:
    def __init__(self, base, headers):
        self.base = base
        self.headers = headers

    def _req(self, method, path, body=None):
        res = requests.request(method, f"{self.base}{path}", headers=self.headers, json=body)
        data = res.json() if res.content else None
        if not res.ok:
            err = (data or {}).get("error", {})
            raise RuntimeError(f"{method} {path} -> {err.get('code', res.status_code)}: {err.get('message', '')}")
        return data

    def info(self):
        return self._req("GET", "")

    def assets(self, **params):
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return self._req("GET", f"/assets?{qs}" if qs else "/assets")

    def get_layer(self, output, layer):
        return self._req("GET", f"/outputs/{output}/layers/{layer}")

    def set_live(self, output, layer, body):
        return self._req("POST", f"/outputs/{output}/layers/{layer}", body)

    def patch_state(self, output, layer, state):
        return self._req("PATCH", f"/outputs/{output}/layers/{layer}/state", state)


sp = Spresenter(BASE, HEADERS)


def on_message(ws, raw):
    msg = json.loads(raw)
    key = msg.get("key", "")
    if key == "api.hello":
        print("[ws] ready. Scopes:", ", ".join(msg["data"]["scopes"]))
    elif key.startswith(f"refresh.live.{OUTPUT}"):
        layer = sp.get_layer(OUTPUT, LAYER)
        title = (layer.get("live") or {}).get("title", "(empty)")
        print(f"[ws] output {OUTPUT} changed -> live: {title}")


def on_close(ws, code, msg):
    if code == 4401:
        print("[ws] token revoked/disabled (4401)")


def main():
    info = sp.info()
    print(f'Token "{info["token"]["name"]}" — scopes: {", ".join(info["token"]["scopes"])}')

    songs = sp.assets(type="music")
    if songs:
        target = songs[0]
        print(f'Putting "{target["title"]}" live on {OUTPUT}/{LAYER}…')
        sp.set_live(OUTPUT, LAYER, {"assetGuid": target["guid"]})
        sp.patch_state(OUTPUT, LAYER, {"show": True, "opacity": 1})
    else:
        print("No songs in the catalog — add one in the app and run again.")

    print("Listening for events… (Ctrl+C to exit)")
    ws = websocket.WebSocketApp(WS_URL, on_message=on_message, on_close=on_close)
    ws.run_forever()


if __name__ == "__main__":
    main()

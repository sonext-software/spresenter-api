// Minimal Spresenter API client (Node 18+, ESM).
// `fetch` is native on Node 18+. The WebSocket uses the `ws` package.
import WebSocket from 'ws';

export class SpresenterClient {
  /**
   * @param {object} opts
   * @param {string} opts.base   API base URL (from Settings → API), e.g. ".../api/v1"
   * @param {string} opts.token  Token spk_...
   */
  constructor({ base, token }) {
    if (!base) throw new Error('base is required (copy it from Settings → API)');
    if (!token) throw new Error('token is required');
    this.base = base.replace(/\/$/, '');
    this.wsUrl = `${this.base.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
    this.token = token;
  }

  async #req(method, path, body) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code = data?.error?.code ?? res.status;
      throw new Error(`${method} ${path} → ${code}: ${data?.error?.message ?? ''}`);
    }
    return data;
  }

  // Descriptor / metadata
  info() { return this.#req('GET', ''); }

  // Outputs / layers
  outputs() { return this.#req('GET', '/outputs'); }
  layers(output) { return this.#req('GET', `/outputs/${output}/layers`); }
  getLayer(output, layer) { return this.#req('GET', `/outputs/${output}/layers/${layer}`); }
  setLive(output, layer, body) { return this.#req('POST', `/outputs/${output}/layers/${layer}`, body); }
  setVerse(output, layer, assetGuid, index) {
    return this.#req('POST', `/outputs/${output}/layers/${layer}/music`, { assetGuid, index });
  }
  clearLayer(output, layer) { return this.#req('DELETE', `/outputs/${output}/layers/${layer}`); }
  patchState(output, layer, state) { return this.#req('PATCH', `/outputs/${output}/layers/${layer}/state`, state); }

  // Assets
  assets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.#req('GET', `/assets${qs ? `?${qs}` : ''}`);
  }
  asset(guid) { return this.#req('GET', `/assets/${guid}`); }
  lyrics(guid) { return this.#req('GET', `/assets/${guid}/lyrics`); }
  thumbnailUrl(guid) { return `${this.base}/assets/${guid}/thumbnail?token=${encodeURIComponent(this.token)}`; }

  // Event
  activeEvent() { return this.#req('GET', '/event'); }

  // Media
  media() { return this.#req('GET', '/media'); }
  play() { return this.#req('POST', '/media/play'); }
  pause() { return this.#req('POST', '/media/pause'); }
  seek(time) { return this.#req('POST', '/media/seek', { time }); }

  /**
   * Opens the WebSocket and calls onEvent({key, data}) for each event.
   * Returns the WebSocket instance (call .close() to stop).
   */
  connect(onEvent) {
    const ws = new WebSocket(this.wsUrl);
    ws.on('message', (raw) => {
      try { onEvent(JSON.parse(raw.toString())); } catch { /* ignore invalid frame */ }
    });
    ws.on('close', (code) => {
      if (code === 4401) console.error('[ws] token revoked/disabled (4401)');
    });
    return ws;
  }
}

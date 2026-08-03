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
  /** Global layer definitions (with `defaultForTypes`) — the same for every output. */
  layerDefs() { return this.#req('GET', '/layers'); }
  layers(output) { return this.#req('GET', `/outputs/${output}/layers`); }
  getLayer(output, layer) { return this.#req('GET', `/outputs/${output}/layers/${layer}`); }
  setLive(output, layer, body) { return this.#req('POST', `/outputs/${output}/layers/${layer}`, body); }
  /** Puts an asset live the way the app does — theme, slide and framing resolved
   *  server-side, layer left visible. `body` = { assetGuid, index?, groupId?, fit?, background? }. */
  present(output, layer, body) { return this.#req('POST', `/outputs/${output}/layers/${layer}/present`, body); }
  setVerse(output, layer, assetGuid, index) {
    return this.#req('POST', `/outputs/${output}/layers/${layer}/music`, { assetGuid, index });
  }
  /** Announcement with the output's announcement theme; `props` fills its {placeholders}. */
  announce(output, layer, props, themeGuid) {
    return this.#req('POST', `/outputs/${output}/layers/${layer}/announcement`, {
      props,
      ...(themeGuid ? { themeGuid } : {}),
    });
  }
  /** The {placeholders} the output's announcement theme declares. */
  announcementInfo(output) { return this.#req('GET', `/outputs/${output}/announcement`); }
  clearLayer(output, layer) { return this.#req('DELETE', `/outputs/${output}/layers/${layer}`); }
  patchState(output, layer, state) { return this.#req('PATCH', `/outputs/${output}/layers/${layer}/state`, state); }

  // Live elements — patch one theme element of whatever is live, no reload.
  setElement(output, layer, elementId, patch) {
    return this.#req('POST', `/outputs/${output}/layers/${layer}/elements/${elementId}`, patch);
  }
  elements(output) { return this.#req('GET', `/outputs/${output}/elements`); }

  // Assets
  assets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.#req('GET', `/assets${qs ? `?${qs}` : ''}`);
  }
  asset(guid) { return this.#req('GET', `/assets/${guid}`); }
  lyrics(guid) { return this.#req('GET', `/assets/${guid}/lyrics`); }
  thumbnailUrl(guid) { return `${this.base}/assets/${guid}/thumbnail?token=${encodeURIComponent(this.token)}`; }

  // ── Adding assets (scope `assets:write`) ────────────────────

  /**
   * Uploads a real file as multipart — streamed, so size is not a concern.
   * `meta` = { title?, author?, type?, parent?, category?, optimize?, allowEncode? }.
   * Returns the created asset (the endpoint answers `{ assets: [...] }`).
   *
   * Note: multipart cannot go through #req — that one always sends JSON, and
   * setting Content-Type by hand would break the boundary fetch generates.
   */
  async uploadFile(filePath, meta = {}) {
    const { basename } = await import('node:path');
    const { readFile } = await import('node:fs/promises');
    const form = new FormData();
    // A Blob keeps the bytes out of a string; the filename is what decides the type.
    form.append('file', new Blob([await readFile(filePath)]), basename(filePath));
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    const res = await fetch(`${this.base}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`POST /assets → ${data?.error?.code ?? res.status}: ${data?.error?.message ?? ''}`);
    return data.assets[0];
  }

  /** Creates an asset from a URL the APP downloads — nothing is uploaded here. */
  async createFromUrl(filename, sourceUrl, meta = {}) {
    const data = await this.#req('POST', '/assets', { ...meta, filename, sourceUrl });
    return data.assets[0];
  }

  /** Creates an asset from bytes. Keep it for small files: base64 inflates 33%. */
  async createFromBytes(filename, buffer, meta = {}) {
    const data = await this.#req('POST', '/assets', {
      ...meta,
      filename,
      contentBase64: Buffer.from(buffer).toString('base64'),
    });
    return data.assets[0];
  }

  /** Song with STRUCTURED lyrics. `song` = { title, artist?, sections, groups?, key?, … }.
   *  Returns { asset, lyrics } — `lyrics` is what was actually stored. */
  createMusic(song) { return this.#req('POST', '/assets/music', song); }

  /** Replaces a song's structured lyrics (same payload as creation). */
  setLyrics(guid, payload) { return this.#req('PUT', `/assets/${guid}/lyrics`, payload); }

  /** Folder to organize what you add. `category` = the tab ('video', 'image', …). */
  createFolder(title, category, parent) {
    return this.#req('POST', '/assets/folder', { title, category, ...(parent ? { parent } : {}) });
  }

  // Setlist
  activeSetlist() { return this.#req('GET', '/setlist'); }
  /** @deprecated renamed to activeSetlist(). */
  activeEvent() { return this.activeSetlist(); }

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

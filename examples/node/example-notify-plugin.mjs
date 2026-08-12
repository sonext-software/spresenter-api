// Example: talk to the OPERATOR (notification center) and to a PLUGIN of that
// installation (plugin actions).
//
//   BASE="<api base url>" TOKEN=spk_... node example-notify-plugin.mjs
//
// These two are the parts of the API that are not about what is on screen:
//
//  1. **Notification center** — the bell in the app's title bar. Unlike a toast,
//     the card STAYS (the 50 most recent), counts as unread, and — when the app's
//     window is not focused — also fires an OS notification. That is how an
//     integration reaches the person who stepped away from the machine.
//
//  2. **Plugin actions** — everything else in this API is what the APP can do.
//     What an integration usually needs is something only *that church's* plugin
//     knows how to do ("pull today's roster", "sync with my system"). A plugin
//     declares actions by name; you call them by that name and get the handler's
//     return value back. The app does not interpret either side.
//
// Scopes used: notifications:read, notifications:write, plugins:read,
// plugins:invoke.
//
import { SpresenterClient } from './client.mjs';

const base = process.env.BASE;
const token = process.env.TOKEN;
if (!base || !token) {
  console.error('Set BASE and TOKEN: BASE="<api base url>" TOKEN=spk_... node example-notify-plugin.mjs');
  process.exit(1);
}

const sp = new SpresenterClient({ base, token });

// ── 1. Publish a notification ────────────────────────────────────────────────
// `id` is optional, but passing your own makes a re-send idempotent: the center
// dedupes by it, so a retry after a network blip does not stack a second card.
const { notification } = await sp.notify({
  id: 'roster-sync-2026-08-16',
  title: 'Roster synced',
  body: 'Ana replaced João on camera 2.',
  level: 'warning', // info | success | warning | error
  from: 'Roster bot', // who signs it — an anonymous alert mid-service helps nobody
});
console.log('published:', notification.id, '·', notification.title);

// ── 2. Read the center back ──────────────────────────────────────────────────
const { notifications, unread } = await sp.notifications({ limit: 5 });
console.log(`\ncenter (${unread} unread):`);
for (const n of notifications) {
  console.log(` ${n.read ? ' ' : '•'} [${n.level}] ${n.title} — ${n.from ?? 'no sender'}`);
}

// It does NOT auto-clear. Whoever posts is the one who schedules the delete:
//   await sp.removeNotification(notification.id);
//   await sp.markNotificationRead(notification.id);

// ── 3. Discover the plugins of THIS installation ─────────────────────────────
const { plugins } = await sp.plugins();
console.log('\nplugins:');
for (const p of plugins) {
  const actions = p.actions.map((a) => a.action).join(', ') || '(none registered yet)';
  console.log(` - ${p.name} (${p.id}) ${p.enabled ? '' : '[disabled] '}· ${p.runtime} · ${actions}`);
}

// `actions` lists what the RUNNING plugin processes have registered. A plugin
// without `background: true` in its manifest shows an empty list until something
// calls it — calling still works (the call starts it first), the listing just
// cannot know beforehand.
const target = plugins.find((p) => p.enabled && p.actions.length > 0);
if (!target) {
  console.log('\nNo plugin exposes an action on this machine — nothing to call.');
  process.exit(0);
}

// ── 4. Call one ──────────────────────────────────────────────────────────────
const action = target.actions[0];
console.log(`\ncalling ${target.id}/${action.action}…`);
try {
  const res = await sp.pluginRequest(
    target.id,
    action.action,
    // The action's own payload. `sample` (when the plugin declared one) shows the
    // shape it expects; the app never inspects it.
    action.sample ?? {},
    { timeoutMs: 15000 },
  );
  console.log('response:', JSON.stringify(res.data));
} catch (err) {
  // A well-written plugin answers with ITS OWN status for a business failure —
  // 404 for "member not found", 400 for a bad field — so react to the code
  // instead of guessing from a 500. The app's own verdicts are distinct:
  // `plugin_disabled` (409), `plugin_unavailable` (503), `plugin_timeout` (504).
  console.error('the action failed:', err.message);
}

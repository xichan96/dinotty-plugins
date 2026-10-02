/**
 * A pane id is not a filename.
 *
 * `ctx.storage` keys become `$DINOTTY_PLUGIN_DATA_DIR/<key>.json`, and the
 * sidecar writes its announcement to that same path. A pane id is safe to
 * assume is a UUID only until it isn't: the plugin *tab* has the id
 * `plugin:window-mirror:`, and a colon is illegal in a Windows path — the write
 * either fails or lands in an alternate data stream, and either way the pane
 * polls a file that will never exist. That failure is silent on both sides,
 * which is what makes it worth a function and a test rather than a `replace`
 * buried in a template literal.
 */
export function storageKeyFor(paneId: string): string {
  const safe = paneId.replace(/[^A-Za-z0-9_-]/g, '-')
  return `mirror-${safe}`
}

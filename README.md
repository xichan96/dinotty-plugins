# dinotty-plugins

Plugin collection for [dinotty](https://github.com/xichan96/dinotty) -- a set of tools that extend the dinotty desktop application with developer productivity features.

## Plugins

| Plugin | Version | Description | Description (中文) |
|--------|---------|-------------|-------------------|
| [CC Switch](./cc-switch) | 2.0.0 | Quick switch Claude Code API Provider (based on cc-switch CLI) | 快速切换 Claude Code API Provider (基于 cc-switch CLI) |
| [Command Bookmarks](./command-bookmarks) | 1.0.0 | Bookmark and batch-send commands to multiple terminals | 命令收藏夹，支持批量发送到多个终端 |
| [Whiteboard](./dinotty-whiteboard) | 1.0.0 | Infinite canvas whiteboard with freehand drawing, shapes, text and images | 无限画布白板工具，支持自由绘图、图形、文本和图片 |
| [JSON Formatter](./json-formatter) | 1.0.0 | JSON formatting, minifying and validation tool | JSON 格式化、压缩与验证工具 |
| [Skill Manager](./skill-manager) | 1.0.0 | Manage Claude Code Agent Skills (~/.claude/skills/) | 管理 Claude Code Agent Skills (~/.claude/skills/) |
| [Text Diff](./text-diff) | 1.0.0 | Text diff comparison tool with line-by-line highlighting | 文本差异对比工具，支持逐行对比与高亮显示 |
| [Claude Code](./claude-code) | 1.0.0 | Visual conversation manager for Claude Code | Claude Code 可视化对话管理 — 浏览历史、新建和恢复会话 |
| [Volcano Ark Quota](./volc-ark-quota) | 0.1.0 | Display Volcano Engine Ark Flow Plan quota (5h / daily / weekly / monthly) in the status bar | 在状态栏展示火山引擎 Ark Flow Plan 配额（5小时 / 日 / 周 / 月） |

### Development-only plugins

| Plugin | Version | Status |
|--------|---------|--------|
| [Cloudflare Tunnel](./cloudflare-quick-tunnel) | 0.1.0 | Local development and dev-link only; Marketplace publication is blocked pending native artifact signing support |

## Installation

Each plugin can be installed independently through the dinotty plugin manager, or by cloning this repository and pointing to the desired plugin subdirectory.

### Prerequisites

- [dinotty](https://github.com/xichan96/dinotty) desktop application
- Node.js (for plugins that require a build step)

Some plugins have additional dependencies:

| Plugin | Dependencies |
|--------|-------------|
| CC Switch | [cc-switch CLI](https://github.com/SaladDay/cc-switch-cli), `jq`, `bash`, `python3`, `curl` |
| Command Bookmarks | None |
| Whiteboard | Node.js + esbuild (for building from source) |
| JSON Formatter | None |
| Skill Manager | `git`, `curl` |
| Text Diff | None |
| Claude Code | `claude` CLI (in PATH), 需先安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) |
| Volcano Ark Quota | `curl` (for API calls) |
| Cloudflare Tunnel | Rust 1.86+, Node.js 20+, and a Dinotty build with managed native-process support |

## Plugin Architecture

Each plugin follows a standard manifest-driven structure:

```
plugin-name/
  plugin.json    # Plugin manifest (id, name, version, entry, styles, commands)
  main.js        # Entry point (or dist/main.js for compiled plugins)
  styles.css     # Plugin styles
```

### plugin.json

```json
{
  "id": "plugin-id",
  "name": "Plugin Name",
  "version": "1.0.0",
  "description": "Short description",
  "icon": "icon-name",
  "entry": "main.js",
  "styles": "styles.css",
  "commands": [
    { "id": "command-id", "title": "Command Title" }
  ]
}
```

### Plugin API

Plugins receive a `PluginContext` object providing access to dinotty's runtime features:

```js
export default function activate(ctx) {
  // Reactive state
  const count = ctx.ref(0);
  const state = ctx.reactive({ items: [] });
  const doubled = ctx.computed(() => count.value * 2);

  // Command palette
  ctx.commands.register('my-command', 'My Command', () => { /* ... */ });

  // Persistent storage
  ctx.storage.get('key');
  ctx.storage.set('key', value);

  // Shell execution
  ctx.exec.run('echo hello');

  // Terminal interaction
  ctx.terminal.send(paneId, 'command\n');
  ctx.terminal.listPanes();
  ctx.terminal.activePaneId();

  // UI
  ctx.ui.notify('Hello!');
  ctx.ui.confirm('Are you sure?').then(ok => { /* ... */ });

  // Lifecycle
  ctx.onMounted(() => { /* ... */ });
  ctx.onUnmounted(() => { /* ... */ });

  // Virtual DOM (Vue-like hyperscript)
  return () => ctx.h('div', { class: 'my-plugin' }, [
    ctx.h('button', { onClick: () => count.value++ }, `Count: ${count.value}`)
  ]);
}
```

## Project Structure

```
dinotty-plugins/
  registry.json              # Plugin registry manifest
  cloudflare-quick-tunnel/   # Development-only Cloudflare Quick Tunnel sharing plugin (TypeScript + Rust)
  cc-switch/                 # API provider switcher (TypeScript + Bash)
  command-bookmarks/         # Terminal command bookmarks (JavaScript)
  dinotty-whiteboard/        # Infinite canvas whiteboard (JavaScript, esbuild)
  json-formatter/            # JSON tools (JavaScript)
  skill-manager/             # Claude Code skill manager (TypeScript)
  text-diff/                 # Text diff tool (JavaScript)
  claude-code/               # Claude Code conversation manager (TypeScript)
  volc-ark-quota/            # Volcano Engine Ark Flow Plan quota (JavaScript)
```

## Development

### Building from source

Plugins with TypeScript sources need to be compiled before use:

**CC Switch**

```bash
cd cc-switch
esbuild src/ui.ts --bundle --format=esm --outfile=dist/main.js
```

**Whiteboard**

```bash
cd dinotty-whiteboard
npm install
npm run build
```

**Skill Manager**

```bash
cd skill-manager
esbuild src/ui.ts --bundle --format=esm --outfile=dist/main.js
```

**Claude Code**

```bash
cd claude-code
npm install
npm run build
```

**Cloudflare Tunnel (development-only)**

```bash
cd cloudflare-quick-tunnel
cargo test --manifest-path native/Cargo.toml --workspace
npm ci
npm run check
npm run build
```

The native supervisor must also be built and copied into the platform-specific
`bin/` directory before using dev-link. See the plugin README for the exact
commands. Do not add this plugin to `registry.json` until the native artifact
signing and multi-platform packaging requirements are implemented.

Plugins written in plain JavaScript (Command Bookmarks, JSON Formatter, Text Diff) require no build step -- edit `main.js` directly.

### Adding a new plugin

1. Create a directory with your plugin ID
2. Add a `plugin.json` manifest
3. Implement the entry point (`main.js`) exporting an `activate(ctx)` function
4. Add styles in `styles.css`
5. Register the plugin in `registry.json` at the repository root

## Tech Stack

- **Runtime:** dinotty desktop application (Vue.js-based plugin system)
- **Languages:** JavaScript, TypeScript, Bash
- **Build:** esbuild
- **DOM:** Virtual DOM via `ctx.h()` hyperscript

## License

See individual plugin directories for license information.

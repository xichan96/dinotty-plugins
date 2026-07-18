# Session Browser

## What it does

Session Browser is a read-only, three-pane browser for Claude Code and Codex history:

- The sessions pane switches between Claude Code and Codex and organizes active and archived sessions by workspace.
- The metadata pane provides sorting, filtering, search, health, branch, activity, and session actions.
- The transcript pane renders the selected conversation and collapsible tool details without providing a chat composer.

## Install

Follow the repository's development-install flow: clone `dinotty-plugins`, build this TypeScript plugin, and point dinotty's plugin manager at the cloned `session-browser` subdirectory.

```bash
git clone https://github.com/xichan96/dinotty-plugins.git
cd dinotty-plugins/session-browser
npm install
npm run build
```

### Upgrading from `cc-session-browser`

The plugin id changed from `cc-session-browser` to `session-browser`, and dinotty keys plugin settings by id. On its first CLI run, Session Browser copies any missing legacy JSON settings forward automatically. If the plugin directory or symlink under `~/.dinotty/plugins/` still has the old basename, rename it to `session-browser`; the startup scan requires the directory name to match the manifest id exactly and otherwise silently skips the plugin.

## Host API

On dinotty builds that provide `createTerminalTab`, Resume opens a real terminal tab in the session workspace and runs the selected agent's resume command: `claude --resume <session-id>` for Claude Code or `codex resume <session-id>` for Codex. On hosts without that API, Resume copies the equivalent command to the clipboard.

## Archive semantics

For Claude Code, Archive moves session data from `~/.claude/projects` to `~/.claude/projects-archive`, including the JSONL transcript and any companion artifact directory. Restore moves it back and refreshes the transcript mtime to avoid immediate session garbage collection. For Codex, Archive and Restore use the Codex CLI's `archive` and `unarchive` operations.

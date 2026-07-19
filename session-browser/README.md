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

## Export

Export writes a session's transcript to a Markdown file. A single export produces one flat file at `<destination>/<agent>_exp/single files/<yymmdd>_<title>.md`; a bulk export groups the selected sessions by project under a per-run timestamp at `<destination>/<agent>_exp/<timestamp>/<project>/`.

The destination root defaults to `~/Downloads` and is chosen through the plugin's own folder browser, since the plugin host exposes no file-picker bridge. Choosing a destination outside the home directory requires an explicit confirmation.

An export is written to a temporary file and then hard-linked into place, so an interrupted export cannot leave a half-written file under the final name. Filesystems without hard-link support fall back to a rename, which leaves a brief window where the destination file exists but is still empty. Filenames are sanitised and capped at 255 bytes, so a long or awkward session title yields a shortened name rather than a failure.

## Archive semantics

For Claude Code, Archive moves session data from `~/.claude/projects` to `~/.claude/projects-archive`, including the JSONL transcript and any companion artifact directory. Restore moves it back and refreshes the transcript mtime to avoid immediate session garbage collection. For Codex, Archive and Restore use the Codex CLI's `archive` and `unarchive` operations.

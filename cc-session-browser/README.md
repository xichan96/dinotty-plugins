# CC Session Browser

## What it does

CC Session Browser is a read-only, three-pane browser for Claude Code history:

- The sessions pane organizes active and archived sessions by workspace.
- The metadata pane provides sorting, filtering, search, health, branch, activity, and session actions.
- The transcript pane renders the selected conversation and collapsible tool details without providing a chat composer.

## Install

Follow the repository's development-install flow: clone `dinotty-plugins`, build this TypeScript plugin, and point dinotty's plugin manager at the cloned `cc-session-browser` subdirectory.

```bash
git clone https://github.com/xichan96/dinotty-plugins.git
cd dinotty-plugins/cc-session-browser
npm install
npm run build
```

## Host API

On dinotty builds that provide `createTerminalTab`, Resume opens a real terminal tab in the session workspace and runs `claude --resume <session-id>`. On stock or other non-dinotty builds without that host API, Resume falls back to copying the equivalent command to the clipboard.

## Archive semantics

Archive moves the session data from `~/.claude/projects` to `~/.claude/projects-archive`, including the JSONL transcript and any companion artifact directory. Restore moves it back to `~/.claude/projects` and touches the transcript mtime so Claude Code does not immediately remove the restored session during session garbage collection.

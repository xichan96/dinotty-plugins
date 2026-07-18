// src/icons.ts
var ICON_PATHS = {
  search: [["path", { d: "m21 21-4.34-4.34" }], ["circle", { cx: "11", cy: "11", r: "8" }]],
  "refresh-cw": [
    ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
    ["path", { d: "M21 3v5h-5" }],
    ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
    ["path", { d: "M8 16H3v5" }]
  ],
  plus: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
  x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
  "chevron-left": [["path", { d: "m15 18-6-6 6-6" }]],
  "chevron-right": [["path", { d: "m9 18 6-6-6-6" }]],
  "chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
  "arrow-left": [["path", { d: "m12 19-7-7 7-7" }], ["path", { d: "M19 12H5" }]],
  send: [
    ["path", { d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" }],
    ["path", { d: "m21.854 2.147-10.94 10.939" }]
  ],
  menu: [["path", { d: "M4 5h16" }], ["path", { d: "M4 12h16" }], ["path", { d: "M4 19h16" }]],
  brain: [
    ["path", { d: "M12 18V5" }],
    ["path", { d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" }],
    ["path", { d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" }],
    ["path", { d: "M17.997 5.125a4 4 0 0 1 2.526 5.77" }],
    ["path", { d: "M18 18a4 4 0 0 0 2-7.464" }],
    ["path", { d: "M6.003 5.125a4 4 0 0 0-2.526 5.77" }],
    ["path", { d: "M6 18a4 4 0 0 1-2-7.464" }]
  ],
  copy: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]
  ],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  folder: [
    ["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]
  ],
  "folder-down": [
    ["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }],
    ["path", { d: "m6 9 6 6 6-6" }]
  ],
  zap: [
    ["path", { d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" }]
  ],
  hash: [
    ["line", { x1: "4", x2: "20", y1: "9", y2: "9" }],
    ["line", { x1: "4", x2: "20", y1: "15", y2: "15" }],
    ["line", { x1: "10", x2: "8", y1: "3", y2: "21" }],
    ["line", { x1: "16", x2: "14", y1: "3", y2: "21" }]
  ],
  terminal: [["path", { d: "M12 19h8" }], ["path", { d: "m4 17 6-6-6-6" }]],
  play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
  "file-text": [
    ["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }],
    ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
    ["path", { d: "M10 12h4" }],
    ["path", { d: "M10 16h4" }]
  ],
  archive: [
    ["rect", { width: "20", height: "5", x: "2", y: "3", rx: "1" }],
    ["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }],
    ["path", { d: "M10 12h4" }]
  ],
  "archive-restore": [
    ["rect", { width: "20", height: "5", x: "2", y: "3", rx: "1" }],
    ["path", { d: "M4 8v11a2 2 0 0 0 2 2h2" }],
    ["path", { d: "M20 8v11a2 2 0 0 1-2 2h-2" }],
    ["path", { d: "m9 15 3-3 3 3" }],
    ["path", { d: "M12 12v9" }]
  ],
  "trash-2": [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
    ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }],
    ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }]
  ],
  pencil: [
    ["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }]
  ],
  eye: [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
    ["circle", { cx: "12", cy: "12", r: "3" }]
  ],
  globe: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }],
    ["path", { d: "M2 12h20" }]
  ],
  settings: [
    ["path", { d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" }],
    ["circle", { cx: "12", cy: "12", r: "3" }]
  ],
  "message-square": [
    ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]
  ],
  "user": [
    ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "12", cy: "7", r: "4" }]
  ],
  "square-pen": [
    ["path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }],
    ["path", { d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" }]
  ]
};
var CLAUDE_CODE_PATH = "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z";
var _h;
function initIcons(h) {
  _h = h;
}
function renderIcon(paths, size = 16, cls = "") {
  const children = paths.map(([tag, attrs]) => _h(tag, attrs));
  return _h("svg", {
    class: `ccm-icon ${cls}`.trim(),
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }, ...children);
}
function renderFillIcon(pathD, size = 16, cls = "") {
  return _h("svg", {
    class: `ccm-icon ${cls}`.trim(),
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg"
  }, _h("path", { d: pathD, "fill-rule": "evenodd", "clip-rule": "evenodd" }));
}
function IconSearch(size) {
  return renderIcon(ICON_PATHS.search, size);
}
function IconRefresh(size) {
  return renderIcon(ICON_PATHS["refresh-cw"], size);
}
function IconX(size) {
  return renderIcon(ICON_PATHS.x, size);
}
function IconChevronLeft(size) {
  return renderIcon(ICON_PATHS["chevron-left"], size);
}
function IconChevronRight(size) {
  return renderIcon(ICON_PATHS["chevron-right"], size);
}
function IconChevronDown(size) {
  return renderIcon(ICON_PATHS["chevron-down"], size);
}
function IconArrowLeft(size) {
  return renderIcon(ICON_PATHS["arrow-left"], size);
}
function IconCopy(size) {
  return renderIcon(ICON_PATHS.copy, size);
}
function IconCheck(size) {
  return renderIcon(ICON_PATHS.check, size);
}
function IconFolder(size) {
  return renderIcon(ICON_PATHS.folder, size);
}
function IconFolderDown(size) {
  return renderIcon(ICON_PATHS["folder-down"], size);
}
function IconZap(size) {
  return renderIcon(ICON_PATHS.zap, size);
}
function IconHash(size) {
  return renderIcon(ICON_PATHS.hash, size);
}
function IconTerminal(size) {
  return renderIcon(ICON_PATHS.terminal, size);
}
function IconFileText(size) {
  return renderIcon(ICON_PATHS["file-text"], size);
}
function IconArchive(size) {
  return renderIcon(ICON_PATHS.archive, size);
}
function IconArchiveRestore(size) {
  return renderIcon(ICON_PATHS["archive-restore"], size);
}
function IconTrash2(size) {
  return renderIcon(ICON_PATHS["trash-2"], size);
}
function IconPencil(size) {
  return renderIcon(ICON_PATHS.pencil, size);
}
function IconEye(size) {
  return renderIcon(ICON_PATHS.eye, size);
}
function IconGlobe(size) {
  return renderIcon(ICON_PATHS.globe, size);
}
function IconSettings(size) {
  return renderIcon(ICON_PATHS.settings, size);
}
function IconUser(size) {
  return renderIcon(ICON_PATHS["user"], size);
}
function IconClaude(size, cls) {
  return renderFillIcon(CLAUDE_CODE_PATH, size, cls);
}

// src/i18n.ts
var dictionaries = {
  en: {
    "active": "Active",
    "activity-recent": "Active within",
    "activity-stale": "Idle beyond",
    "bulk-actions": "Bulk actions",
    "bulk-archive": "Archive {n}",
    "bulk-confirm": "{n} selected \u2014 {m} currently expected to be skipped (possibly live). Continue?",
    "bulk-delete": "Delete {n}",
    "bulk-progress": "{n}/{total} {title}",
    "bulk-restore": "Restore {n}",
    "bulk-result": "Done {done} \xB7 Failed {failed} \xB7 Skipped {skipped}",
    "bulk-refresh-stale": "Refresh failed, view may be stale.",
    "cancel": "Cancel",
    "clear-selection": "Clear selection",
    "clear-all-filters": "Clear all",
    "date-filter-short": "Dates",
    "date-filters": "Date-range filters",
    "date-from": "From",
    "date-to": "To",
    "last-active": "Last active",
    "next-page": "Next",
    "page-indicator": "Page {page}/{pages}",
    "page-size": "Page size",
    "previous-page": "Previous",
    "deselect-all": "Deselect all",
    "dismiss-result": "Dismiss result",
    "select-all-filtered": "Select all {n} filtered",
    "select-mode": "Select mode",
    "select-session": "Select {title}",
    "selected-count": "{n} selected",
    "undated-excluded": "+{n} undated excluded",
    "absolute-path-placeholder": "/absolute/path",
    "action-archived": "archived",
    "action-deleted": "deleted",
    "action-restored": "restored",
    "after": "After",
    "after-replace-all": "After \xB7 replace all",
    "all-branches": "All branches",
    "all-time": "All time",
    "agent-claude-code": "Claude Code",
    "agent-codex": "Codex",
    "agent-degraded-notice": "{agent} is using degraded data: {reason}",
    "agent-degraded-option": "{agent} (degraded)",
    "agent-degraded-title": "Agent data may be stale",
    "agent-degraded-tooltip": "Data may be stale.",
    "agent-discovery-empty": "No session agents are registered.",
    "agent-discovery-failed": "Could not discover session agents.",
    "agent-discovery-invalid": "Agent discovery returned invalid data.",
    "agent-empty-notice": "{agent} has no sessions to display.",
    "agent-empty-title": "No sessions found",
    "agent-fallback-notice": "{agent} could not be used ({reason}). Switched to {fallback}.",
    "agent-fallback-title": "Session agent changed",
    "agent-load-failed-short": "its sessions could not be loaded",
    "agent-no-sessions": "No available session agent currently has sessions to display.",
    "agent-no-sessions-short": "it has no sessions",
    "agent-none-available": "No registered session agent is currently available.",
    "agent-not-registered": "it is no longer registered",
    "agent-switcher": "Session agent",
    "agent-unavailable-tooltip": "This agent is unavailable.",
    "archive": "Archive",
    "archive-search-p2": "full-text search of Archive lands in P2",
    "archive-session": "Archive session",
    "archive-session-confirm": 'Archive session "{title}"?',
    "archive-session-force-confirm": 'Session "{title}" may be running right now. Archive anyway?',
    "before": "Before",
    "branch-search-placeholder": "Search branches",
    "building-index": "Building session index\u2026",
    "cancel-changing-root": "Cancel changing root",
    "change-tree-root": "Change tree root",
    "use-selected-folder-as-tree-root": "Use selected folder as tree root",
    "claude": "Claude",
    "clear-search": "Clear search",
    "cli-error": "Command failed: {msg}",
    "code": "code",
    "content": "Content",
    "copied": "Copied",
    "copy-code": "Copy code",
    "copy-command": "Copy command",
    "copy-resume-command": "Copy resume command",
    "copy-session-id": "Copy session id",
    "created": "Created",
    "created-at": "Created {date}",
    "created-unknown": "Created unknown",
    "delete-archived-session": "Delete archived session",
    "delete-session": "Delete session",
    "delete-session-confirm": 'Permanently delete archived session "{title}"? This cannot be undone.',
    "delete-session-direct-confirm": 'Permanently delete session "{title}"? This cannot be undone.',
    "dismiss-error": "Dismiss error",
    "dismiss-transcript-error": "Dismiss transcript error",
    "exact-directory": "Exact directory",
    "expand-directory": "Expand directory",
    "collapse-directory": "Collapse directory",
    "file": "File",
    "filter-by-git-branch": "Filter by git branch",
    "filter-by-last-activity": "Filter by last activity",
    "filter-by-time-range": "Filter by time range",
    "hide-scripted-sessions": "Hide scripted sessions",
    "hide-scripted-sessions-tooltip": "Hide tooling-started exec and subagent sessions.",
    "full-text-global": "Full-text search is global",
    "full-text-scoped": "Full-text search uses selected tree scope",
    "global": "Global",
    "health-empty": "empty",
    "health-live": "live",
    "health-truncated": "truncated",
    "idle": "Idle",
    "idle-value": "Idle {time}",
    "language": "Language",
    "language-auto": "Auto (host language)",
    "language-en": "English",
    "language-zh": "\u4E2D\u6587",
    "leave-full-text-results": "Leave full-text results",
    "loading-sessions": "Loading sessions\u2026",
    "loading-transcript": "Loading transcript\u2026",
    "messages": "Messages",
    "message-count-one": "{n} message",
    "message-count-other": "{n} messages",
    "message-count-unknown": "Message count unavailable",
    "navigate-parent": "Navigate to parent directory",
    "no-branch": "No branch",
    "no-branch-matches": "No matching branches",
    "no-content": "(no content)",
    "no-full-text-matches": "No full-text matches in this search scope.",
    "no-git-branch": "No git branch",
    "no-indexed-sessions": "No indexed sessions under this root.",
    "no-matching-sessions": "No {partition} sessions match these filters.",
    "no-transcript-messages": "No transcript messages to display.",
    "notify-command-copied": "command copied",
    "notify-files-updated": "Session files updated",
    "notify-mutation-in-progress": "Another session operation is already running.",
    "notify-paths-one": "{action} {n} path",
    "notify-paths-other": "{action} {n} paths",
    "notify-resume-unavailable": "Resume unavailable",
    "picker-check-error": "Could not validate the directory.",
    "picker-close": "Close directory picker",
    "picker-current": "Browsing: {path}",
    "picker-error": "Could not list this directory: {msg}",
    "picker-list-error": "Could not list this directory.",
    "picker-loading": "Loading directories\u2026",
    "picker-manual-path": "Manual absolute directory path",
    "picker-no-subdirs": "No subdirectories",
    "picker-path-missing": "Directory does not exist: {path}",
    "picker-path-not-directory": "Path is not a directory: {path}",
    "picker-select-current": 'Use "{name}" as the tree root',
    "picker-title": "Select tree root directory",
    "picker-use-manual-path": "Use the entered path as the tree root",
    "empty": "(empty)",
    "relative-days": "{n}d",
    "relative-hours": "{n}h",
    "relative-minutes": "{n}m",
    "relative-months": "{n}mo",
    "relative-now": "now",
    "relative-unknown": "unknown",
    "relative-years": "{n}y",
    "compact-show-workspaces": "Show workspaces",
    "compact-back-to-sessions": "Back to sessions",
    "resize-workspace-tree": "Resize workspace tree",
    "restore-first-confirm": '"{title}" is archived. Restore first?',
    "restore-session": "Restore session",
    "resume-copy-fallback-confirm": "{warning}\n\nCopy the resume command instead?",
    "resume-live-confirm": 'Session "{title}" is already live. Resume it again?',
    "resume-session": "Resume session",
    "run-full-text-search": "Run full-text search",
    "scope-exact": "Scope sessions to exact directory",
    "scope-subtree": "Scope sessions to directory subtree",
    "search": "Search",
    "search-placeholder": "Search title or branch",
    "search-sessions": "Search sessions",
    "searching-session-text": "Searching session text\u2026",
    "session-health-title": "{health} transcript",
    "session-id-copied": "Session id copied",
    "session-live-indicator": "Live session",
    "session-partition": "Session partition",
    "session-pane-title": "Session",
    "session-select-prompt": "Select a session to open it.",
    "settings": "Settings",
    "settings-decrease-font": "Decrease font size",
    "settings-font-scale": "Font size",
    "settings-font-scale-value": "Level {n}",
    "settings-increase-font": "Increase font size",
    "settings-theme-follow": "Follow host theme",
    "sort-ascending": "Sort ascending",
    "sort-descending": "Sort descending",
    "sort-direction-toggle": "Toggle sort direction",
    "sort-sessions": "Sort sessions",
    "sort-sessions-by": "Sort sessions by",
    "subtree": "Subtree",
    "summary": "Summary",
    "time-24h": "24 hours",
    "time-30d": "30 days",
    "time-7d": "7 days",
    "time-older-15d": "Older than 15 days",
    "time-older-30d": "Older than 30 days",
    "time-span-unknown": "Time span unknown",
    "toggle-global-search": "Toggle global full-text search",
    "transcript-empty": "This session has no complete transcript messages.",
    "transcript-truncated": "This session appears truncated. Complete messages are shown below.",
    "tree-badge": "{active} active, {archive} archive; newest {time} ago",
    "tree-count-active": "{n}A",
    "tree-count-archive": "{n}R",
    "tree-root-absolute-error": "Tree root must be an absolute path.",
    "tree-root-path": "Tree root path",
    "type-filter-search": "Type to filter; press Enter for full-text search",
    "untitled-session": "Untitled session",
    "workspaces": "Workspaces",
    "workspace-missing": "Workspace no longer exists: {path}",
    "workspace-not-directory": "Workspace is not a directory: {path}",
    "you": "You",
    "error-copy-session-id": "Could not copy session id to the clipboard.",
    "error-invalid-session-id": "Invalid session id; the resume command was not copied.",
    "error-copy-resume": "Could not copy the resume command to the clipboard.",
    "error-restore": "Could not restore the archived session.",
    "error-archive": "Could not archive the session.",
    "error-delete": "Could not permanently delete the archived session.",
    "error-check-workspace": "Could not check the session workspace.",
    "error-open-terminal": "Could not open a terminal for this session."
  },
  zh: {
    "active": "\u6D3B\u8DC3",
    "activity-recent": "\u8FD1\u671F\u6D3B\u8DC3",
    "activity-stale": "\u95F2\u7F6E\u66F4\u4E45",
    "bulk-actions": "\u6279\u91CF\u64CD\u4F5C",
    "bulk-archive": "\u5F52\u6863 {n}",
    "bulk-confirm": "\u5DF2\u9009\u62E9 {n} \u4E2A \u2014 \u5F53\u524D\u9884\u8BA1\u8DF3\u8FC7 {m} \u4E2A\uFF08\u53EF\u80FD\u4ECD\u5728\u8FD0\u884C\uFF09\u3002\u7EE7\u7EED\u5417\uFF1F",
    "bulk-delete": "\u5220\u9664 {n}",
    "bulk-progress": "{n}/{total} {title}",
    "bulk-restore": "\u6062\u590D {n}",
    "bulk-result": "\u5B8C\u6210 {done} \xB7 \u5931\u8D25 {failed} \xB7 \u8DF3\u8FC7 {skipped}",
    "bulk-refresh-stale": "\u5237\u65B0\u5931\u8D25\uFF0C\u5F53\u524D\u89C6\u56FE\u53EF\u80FD\u5DF2\u8FC7\u671F\u3002",
    "cancel": "\u53D6\u6D88",
    "clear-selection": "\u6E05\u9664\u9009\u62E9",
    "clear-all-filters": "\u6E05\u9664\u5168\u90E8",
    "date-filter-short": "\u65E5\u671F",
    "date-filters": "\u65E5\u671F\u8303\u56F4\u7B5B\u9009",
    "date-from": "\u4ECE",
    "date-to": "\u81F3",
    "last-active": "\u6700\u540E\u6D3B\u52A8",
    "next-page": "\u4E0B\u4E00\u9875",
    "page-indicator": "\u7B2C {page}/{pages} \u9875",
    "page-size": "\u6BCF\u9875\u6570\u91CF",
    "previous-page": "\u4E0A\u4E00\u9875",
    "deselect-all": "\u53D6\u6D88\u5168\u9009",
    "dismiss-result": "\u5173\u95ED\u7ED3\u679C",
    "select-all-filtered": "\u9009\u62E9\u5168\u90E8 {n} \u4E2A\u7B5B\u9009\u7ED3\u679C",
    "select-mode": "\u9009\u62E9\u6A21\u5F0F",
    "select-session": "\u9009\u62E9 {title}",
    "selected-count": "\u5DF2\u9009\u62E9 {n} \u4E2A",
    "undated-excluded": "+\u6392\u9664 {n} \u4E2A\u65E0\u65E5\u671F\u4F1A\u8BDD",
    "absolute-path-placeholder": "/\u7EDD\u5BF9/\u8DEF\u5F84",
    "action-archived": "\u5F52\u6863",
    "action-deleted": "\u5220\u9664",
    "action-restored": "\u6062\u590D",
    "after": "\u4E4B\u540E",
    "after-replace-all": "\u4E4B\u540E \xB7 \u5168\u90E8\u66FF\u6362",
    "all-branches": "\u6240\u6709\u5206\u652F",
    "all-time": "\u5168\u90E8\u65F6\u95F4",
    "agent-claude-code": "Claude Code",
    "agent-codex": "Codex",
    "agent-degraded-notice": "{agent} \u6B63\u5728\u4F7F\u7528\u964D\u7EA7\u6570\u636E\uFF1A{reason}",
    "agent-degraded-option": "{agent}\uFF08\u964D\u7EA7\uFF09",
    "agent-degraded-title": "\u4EE3\u7406\u6570\u636E\u53EF\u80FD\u5DF2\u8FC7\u671F",
    "agent-degraded-tooltip": "\u6570\u636E\u53EF\u80FD\u5DF2\u8FC7\u671F\u3002",
    "agent-discovery-empty": "\u6CA1\u6709\u5DF2\u6CE8\u518C\u7684\u4F1A\u8BDD\u4EE3\u7406\u3002",
    "agent-discovery-failed": "\u65E0\u6CD5\u53D1\u73B0\u4F1A\u8BDD\u4EE3\u7406\u3002",
    "agent-discovery-invalid": "\u4EE3\u7406\u53D1\u73B0\u8FD4\u56DE\u4E86\u65E0\u6548\u6570\u636E\u3002",
    "agent-empty-notice": "{agent} \u6CA1\u6709\u53EF\u663E\u793A\u7684\u4F1A\u8BDD\u3002",
    "agent-empty-title": "\u672A\u627E\u5230\u4F1A\u8BDD",
    "agent-fallback-notice": "\u65E0\u6CD5\u4F7F\u7528 {agent}\uFF08{reason}\uFF09\u3002\u5DF2\u5207\u6362\u5230 {fallback}\u3002",
    "agent-fallback-title": "\u4F1A\u8BDD\u4EE3\u7406\u5DF2\u66F4\u6539",
    "agent-load-failed-short": "\u65E0\u6CD5\u52A0\u8F7D\u5176\u4F1A\u8BDD",
    "agent-no-sessions": "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD\u4EE3\u7406\u5305\u542B\u53EF\u663E\u793A\u7684\u4F1A\u8BDD\u3002",
    "agent-no-sessions-short": "\u5B83\u6CA1\u6709\u4F1A\u8BDD",
    "agent-none-available": "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u5DF2\u6CE8\u518C\u4F1A\u8BDD\u4EE3\u7406\u3002",
    "agent-not-registered": "\u5B83\u5DF2\u4E0D\u518D\u6CE8\u518C",
    "agent-switcher": "\u4F1A\u8BDD\u4EE3\u7406",
    "agent-unavailable-tooltip": "\u6B64\u4EE3\u7406\u4E0D\u53EF\u7528\u3002",
    "archive": "\u5F52\u6863",
    "archive-search-p2": "\u5F52\u6863\u5168\u6587\u641C\u7D22\u5C06\u5728 P2 \u63D0\u4F9B",
    "archive-session": "\u5F52\u6863\u4F1A\u8BDD",
    "archive-session-confirm": "\u5F52\u6863\u4F1A\u8BDD\u201C{title}\u201D\uFF1F",
    "archive-session-force-confirm": "\u4F1A\u8BDD\u201C{title}\u201D\u73B0\u5728\u53EF\u80FD\u4ECD\u5728\u8FD0\u884C\u3002\u4ECD\u8981\u5F52\u6863\u5417\uFF1F",
    "before": "\u4E4B\u524D",
    "branch-search-placeholder": "\u641C\u7D22\u5206\u652F",
    "building-index": "\u6B63\u5728\u6784\u5EFA\u4F1A\u8BDD\u7D22\u5F15\u2026",
    "cancel-changing-root": "\u53D6\u6D88\u66F4\u6539\u6839\u76EE\u5F55",
    "change-tree-root": "\u66F4\u6539\u76EE\u5F55\u6811\u6839\u76EE\u5F55",
    "use-selected-folder-as-tree-root": "\u4EE5\u9009\u4E2D\u76EE\u5F55\u4E3A\u6811\u6839",
    "claude": "Claude",
    "clear-search": "\u6E05\u9664\u641C\u7D22",
    "cli-error": "\u547D\u4EE4\u5931\u8D25\uFF1A{msg}",
    "code": "\u4EE3\u7801",
    "content": "\u5185\u5BB9",
    "copied": "\u5DF2\u590D\u5236",
    "copy-code": "\u590D\u5236\u4EE3\u7801",
    "copy-command": "\u590D\u5236\u547D\u4EE4",
    "copy-resume-command": "\u590D\u5236\u6062\u590D\u547D\u4EE4",
    "copy-session-id": "\u590D\u5236\u4F1A\u8BDD ID",
    "created": "\u521B\u5EFA\u65F6\u95F4",
    "created-at": "\u521B\u5EFA\u4E8E {date}",
    "created-unknown": "\u521B\u5EFA\u65F6\u95F4\u672A\u77E5",
    "delete-archived-session": "\u5220\u9664\u5DF2\u5F52\u6863\u4F1A\u8BDD",
    "delete-session": "\u5220\u9664\u4F1A\u8BDD",
    "delete-session-confirm": "\u6C38\u4E45\u5220\u9664\u5DF2\u5F52\u6863\u4F1A\u8BDD\u201C{title}\u201D\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
    "delete-session-direct-confirm": "\u6C38\u4E45\u5220\u9664\u4F1A\u8BDD\u201C{title}\u201D\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
    "dismiss-error": "\u5173\u95ED\u9519\u8BEF",
    "dismiss-transcript-error": "\u5173\u95ED\u5BF9\u8BDD\u9519\u8BEF",
    "exact-directory": "\u7CBE\u786E\u76EE\u5F55",
    "expand-directory": "\u5C55\u5F00\u76EE\u5F55",
    "collapse-directory": "\u6298\u53E0\u76EE\u5F55",
    "file": "\u6587\u4EF6",
    "filter-by-git-branch": "\u6309 Git \u5206\u652F\u7B5B\u9009",
    "filter-by-last-activity": "\u6309\u6700\u540E\u6D3B\u52A8\u65F6\u95F4\u7B5B\u9009",
    "filter-by-time-range": "\u6309\u65F6\u95F4\u8303\u56F4\u7B5B\u9009",
    "hide-scripted-sessions": "\u9690\u85CF\u811A\u672C\u8C03\u7528\u7684\u4F1A\u8BDD",
    "hide-scripted-sessions-tooltip": "\u9690\u85CF\u7531\u5DE5\u5177\u542F\u52A8\u7684 exec \u548C\u5B50\u4EE3\u7406\u4F1A\u8BDD\u3002",
    "full-text-global": "\u5168\u6587\u641C\u7D22\u8303\u56F4\u4E3A\u5168\u5C40",
    "full-text-scoped": "\u5168\u6587\u641C\u7D22\u4F7F\u7528\u6240\u9009\u76EE\u5F55\u6811\u8303\u56F4",
    "global": "\u5168\u5C40",
    "health-empty": "\u7A7A",
    "health-live": "\u8FD0\u884C\u4E2D",
    "health-truncated": "\u5DF2\u622A\u65AD",
    "idle": "\u7A7A\u95F2\u65F6\u95F4",
    "idle-value": "\u7A7A\u95F2 {time}",
    "language": "\u8BED\u8A00",
    "language-auto": "\u81EA\u52A8\uFF08\u8DDF\u968F\u5BBF\u4E3B\u8BED\u8A00\uFF09",
    "language-en": "English",
    "language-zh": "\u4E2D\u6587",
    "leave-full-text-results": "\u9000\u51FA\u5168\u6587\u641C\u7D22\u7ED3\u679C",
    "loading-sessions": "\u6B63\u5728\u52A0\u8F7D\u4F1A\u8BDD\u2026",
    "loading-transcript": "\u6B63\u5728\u52A0\u8F7D\u5BF9\u8BDD\u2026",
    "messages": "\u6D88\u606F\u6570",
    "message-count-one": "{n} \u6761\u6D88\u606F",
    "message-count-other": "{n} \u6761\u6D88\u606F",
    "message-count-unknown": "\u6D88\u606F\u6570\u4E0D\u53EF\u7528",
    "navigate-parent": "\u524D\u5F80\u4E0A\u7EA7\u76EE\u5F55",
    "no-branch": "\u65E0\u5206\u652F",
    "no-branch-matches": "\u65E0\u5339\u914D\u5206\u652F",
    "no-content": "\uFF08\u65E0\u5185\u5BB9\uFF09",
    "no-full-text-matches": "\u6B64\u641C\u7D22\u8303\u56F4\u5185\u6CA1\u6709\u5168\u6587\u5339\u914D\u9879\u3002",
    "no-git-branch": "\u65E0 Git \u5206\u652F",
    "no-indexed-sessions": "\u6B64\u6839\u76EE\u5F55\u4E0B\u6CA1\u6709\u5DF2\u7D22\u5F15\u7684\u4F1A\u8BDD\u3002",
    "no-matching-sessions": "\u6CA1\u6709\u7B26\u5408\u8FD9\u4E9B\u7B5B\u9009\u6761\u4EF6\u7684{partition}\u4F1A\u8BDD\u3002",
    "no-transcript-messages": "\u6CA1\u6709\u53EF\u663E\u793A\u7684\u5BF9\u8BDD\u6D88\u606F\u3002",
    "notify-command-copied": "\u547D\u4EE4\u5DF2\u590D\u5236",
    "notify-files-updated": "\u4F1A\u8BDD\u6587\u4EF6\u5DF2\u66F4\u65B0",
    "notify-mutation-in-progress": "\u53E6\u4E00\u4E2A\u4F1A\u8BDD\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\u4E2D\u3002",
    "notify-paths-one": "\u5DF2{action} {n} \u4E2A\u8DEF\u5F84",
    "notify-paths-other": "\u5DF2{action} {n} \u4E2A\u8DEF\u5F84",
    "notify-resume-unavailable": "\u65E0\u6CD5\u6062\u590D\u4F1A\u8BDD",
    "picker-check-error": "\u65E0\u6CD5\u9A8C\u8BC1\u76EE\u5F55\u3002",
    "picker-close": "\u5173\u95ED\u76EE\u5F55\u9009\u62E9\u5668",
    "picker-current": "\u6B63\u5728\u6D4F\u89C8\uFF1A{path}",
    "picker-error": "\u65E0\u6CD5\u5217\u51FA\u6B64\u76EE\u5F55\uFF1A{msg}",
    "picker-list-error": "\u65E0\u6CD5\u5217\u51FA\u6B64\u76EE\u5F55\u3002",
    "picker-loading": "\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55\u2026",
    "picker-manual-path": "\u624B\u52A8\u8F93\u5165\u7EDD\u5BF9\u76EE\u5F55\u8DEF\u5F84",
    "picker-no-subdirs": "\u6CA1\u6709\u5B50\u76EE\u5F55",
    "picker-path-missing": "\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A{path}",
    "picker-path-not-directory": "\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55\uFF1A{path}",
    "picker-select-current": '\u9009\u62E9"{name}"\u4F5C\u4E3A\u5DE5\u4F5C\u533A\u6811\u8D77\u59CB\u76EE\u5F55',
    "picker-title": "\u9009\u62E9\u76EE\u5F55\u6811\u6839\u76EE\u5F55",
    "picker-use-manual-path": "\u9009\u62E9\u8F93\u5165\u7684\u8DEF\u5F84\u4F5C\u4E3A\u5DE5\u4F5C\u533A\u6811\u8D77\u59CB\u76EE\u5F55",
    "empty": "\uFF08\u7A7A\uFF09",
    "relative-days": "{n}\u5929",
    "relative-hours": "{n}\u5C0F\u65F6",
    "relative-minutes": "{n}\u5206\u949F",
    "relative-months": "{n}\u4E2A\u6708",
    "relative-now": "\u521A\u521A",
    "relative-unknown": "\u672A\u77E5",
    "relative-years": "{n}\u5E74",
    "compact-show-workspaces": "\u663E\u793A\u5DE5\u4F5C\u533A",
    "compact-back-to-sessions": "\u8FD4\u56DE\u4F1A\u8BDD\u5217\u8868",
    "resize-workspace-tree": "\u8C03\u6574\u5DE5\u4F5C\u533A\u76EE\u5F55\u6811\u5BBD\u5EA6",
    "restore-first-confirm": "\u201C{title}\u201D\u5DF2\u5F52\u6863\u3002\u5148\u6062\u590D\u5417\uFF1F",
    "restore-session": "\u6062\u590D\u4F1A\u8BDD",
    "resume-copy-fallback-confirm": "{warning}\n\n\u6539\u4E3A\u590D\u5236\u6062\u590D\u547D\u4EE4\u5417\uFF1F",
    "resume-live-confirm": "\u4F1A\u8BDD\u201C{title}\u201D\u4ECD\u5728\u8FD0\u884C\u3002\u4ECD\u8981\u518D\u6B21\u6062\u590D\u5417\uFF1F",
    "resume-session": "\u6062\u590D\u4F1A\u8BDD",
    "run-full-text-search": "\u8FD0\u884C\u5168\u6587\u641C\u7D22",
    "scope-exact": "\u4EC5\u663E\u793A\u7CBE\u786E\u76EE\u5F55\u4E2D\u7684\u4F1A\u8BDD",
    "scope-subtree": "\u663E\u793A\u76EE\u5F55\u5B50\u6811\u4E2D\u7684\u4F1A\u8BDD",
    "search": "\u641C\u7D22",
    "search-placeholder": "\u641C\u7D22\u6807\u9898\u6216\u5206\u652F",
    "search-sessions": "\u641C\u7D22\u4F1A\u8BDD",
    "searching-session-text": "\u6B63\u5728\u641C\u7D22\u4F1A\u8BDD\u6587\u672C\u2026",
    "session-health-title": "{health}\u5BF9\u8BDD",
    "session-id-copied": "\u4F1A\u8BDD ID \u5DF2\u590D\u5236",
    "session-live-indicator": "\u5B9E\u65F6\u4F1A\u8BDD",
    "session-partition": "\u4F1A\u8BDD\u5206\u533A",
    "session-pane-title": "\u4F1A\u8BDD",
    "session-select-prompt": "\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD\u4EE5\u6253\u5F00\u3002",
    "settings": "\u8BBE\u7F6E",
    "settings-decrease-font": "\u51CF\u5C0F\u5B57\u4F53",
    "settings-font-scale": "\u5B57\u4F53\u5927\u5C0F",
    "settings-font-scale-value": "{n} \u6863",
    "settings-increase-font": "\u589E\u5927\u5B57\u4F53",
    "settings-theme-follow": "\u8DDF\u968F\u5BBF\u4E3B\u4E3B\u9898",
    "sort-ascending": "\u5347\u5E8F\u6392\u5217",
    "sort-descending": "\u964D\u5E8F\u6392\u5217",
    "sort-direction-toggle": "\u5207\u6362\u6392\u5E8F\u65B9\u5411",
    "sort-sessions": "\u4F1A\u8BDD\u6392\u5E8F",
    "sort-sessions-by": "\u4F1A\u8BDD\u6392\u5E8F\u65B9\u5F0F",
    "subtree": "\u5B50\u6811",
    "summary": "\u6458\u8981",
    "time-24h": "24 \u5C0F\u65F6",
    "time-30d": "30 \u5929",
    "time-7d": "7 \u5929",
    "time-older-15d": "\u65E9\u4E8E 15 \u5929",
    "time-older-30d": "\u65E9\u4E8E 30 \u5929",
    "time-span-unknown": "\u65F6\u95F4\u8303\u56F4\u672A\u77E5",
    "toggle-global-search": "\u5207\u6362\u5168\u5C40\u5168\u6587\u641C\u7D22",
    "transcript-empty": "\u6B64\u4F1A\u8BDD\u6CA1\u6709\u5B8C\u6574\u7684\u5BF9\u8BDD\u6D88\u606F\u3002",
    "transcript-truncated": "\u6B64\u4F1A\u8BDD\u4F3C\u4E4E\u5DF2\u622A\u65AD\u3002\u4EE5\u4E0B\u663E\u793A\u5B8C\u6574\u7684\u6D88\u606F\u3002",
    "tree-badge": "{active} \u4E2A\u6D3B\u8DC3\uFF0C{archive} \u4E2A\u5F52\u6863\uFF1B\u6700\u8FD1\u6D3B\u52A8\u4E8E {time}\u524D",
    "tree-count-active": "{n}\u6D3B",
    "tree-count-archive": "{n}\u6863",
    "tree-root-absolute-error": "\u76EE\u5F55\u6811\u6839\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\u3002",
    "tree-root-path": "\u76EE\u5F55\u6811\u6839\u8DEF\u5F84",
    "type-filter-search": "\u8F93\u5165\u4EE5\u7B5B\u9009\uFF1B\u6309 Enter \u8FDB\u884C\u5168\u6587\u641C\u7D22",
    "untitled-session": "\u672A\u547D\u540D\u4F1A\u8BDD",
    "workspaces": "\u5DE5\u4F5C\u533A",
    "workspace-missing": "\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5B58\u5728\uFF1A{path}",
    "workspace-not-directory": "\u5DE5\u4F5C\u533A\u4E0D\u662F\u76EE\u5F55\uFF1A{path}",
    "you": "\u4F60",
    "error-copy-session-id": "\u65E0\u6CD5\u5C06\u4F1A\u8BDD ID \u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    "error-invalid-session-id": "\u4F1A\u8BDD ID \u65E0\u6548\uFF1B\u672A\u590D\u5236\u6062\u590D\u547D\u4EE4\u3002",
    "error-copy-resume": "\u65E0\u6CD5\u5C06\u6062\u590D\u547D\u4EE4\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    "error-restore": "\u65E0\u6CD5\u6062\u590D\u5DF2\u5F52\u6863\u4F1A\u8BDD\u3002",
    "error-archive": "\u65E0\u6CD5\u5F52\u6863\u4F1A\u8BDD\u3002",
    "error-delete": "\u65E0\u6CD5\u6C38\u4E45\u5220\u9664\u5DF2\u5F52\u6863\u4F1A\u8BDD\u3002",
    "error-check-workspace": "\u65E0\u6CD5\u68C0\u67E5\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u3002",
    "error-open-terminal": "\u65E0\u6CD5\u4E3A\u6B64\u4F1A\u8BDD\u6253\u5F00\u7EC8\u7AEF\u3002"
  }
};
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{([^}]+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
}
function translate(locale, key, params) {
  const localized = dictionaries[locale][key];
  const fallback = dictionaries.en[key];
  return interpolate(localized ?? fallback ?? key, params);
}
function initI18n(localeRef) {
  return {
    t(key, params) {
      return translate(localeRef.value, key, params);
    },
    locale() {
      return localeRef.value;
    }
  };
}
function normalizeLocaleSetting(value) {
  return value === "zh" || value === "en" ? value : "auto";
}
function resolveLocale(setting, documentLanguage = "") {
  if (setting === "zh" || setting === "en") return setting;
  return documentLanguage.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

// src/ui.ts
var STORAGE_KEYS = {
  locale: "locale",
  activeAgent: "activeAgent",
  fontScale: "fontScale",
  themeFollowHost: "themeFollowHost",
  paneWidths: "paneWidths",
  treeRoot: "treeRoot",
  treeExpandedPaths: "treeExpandedPaths",
  hideScriptedSessions: "hideScriptedSessions",
  sessionListSort: "sessionListSort",
  pageSize: "pageSize"
};
var DEFAULT_PANE_WIDTHS = { left: 280, middle: 360 };
var DEFAULT_PARTITION_SORT = {
  active: { field: "idle", direction: "asc" },
  archive: { field: "idle", direction: "asc" }
};
var MIN_LEFT_WIDTH = 190;
var MAX_LEFT_WIDTH = 520;
var TRANSCRIPT_BATCH_SIZE = 50;
var SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var FONT_SCALE_MULTIPLIERS = { 1: 0.85, 2: 0.93, 3: 1, 4: 1.1, 5: 1.25 };
var PAGE_SIZES = [20, 50, 100];
var AGENT_AGNOSTIC = /* @__PURE__ */ new Set(["list-dirs", "check-dir", "agents"]);
var DEFAULT_AGENT = "claude-code";
var UNAVAILABLE_CAPABILITIES = {
  archive: false,
  rename: false,
  delete: false,
  deleteRequiresArchived: true,
  nativeIndex: true,
  tokenStats: false,
  originFilter: false
};
var LEGACY_CAPABILITIES = {
  archive: true,
  // No rename write path exists.
  rename: false,
  delete: true,
  deleteRequiresArchived: true,
  nativeIndex: false,
  tokenStats: false,
  originFilter: false
};
var DEFAULT_RESUME_ARGV_BY_AGENT = /* @__PURE__ */ new Map([
  ["claude-code", ["claude", "--resume"]],
  ["codex", ["codex", "resume"]]
]);
var LEGACY_RESUME = { argv: ["claude", "--resume"] };
var RESUME_ARG_TOKEN_RE = /^[A-Za-z0-9_@%+=:,./-]+$/;
function shQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function stripInjected(text) {
  for (let iteration = 0; iteration < 5; iteration++) {
    const stripped = text.replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/g, "").replace(/<local-command-stdout>[\s\S]*?(?:<\/local-command-stdout>|$)/g, "");
    if (stripped === text) break;
    text = stripped;
  }
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function cleanFirstPrompt(text) {
  const commandName = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (commandName) {
    const name = stripInjected(commandName[1]).replace(/^\//, "");
    const args = stripInjected(text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] || "");
    return `${name} ${args}`.trim();
  }
  return stripInjected(text);
}
function resolveSessionTitles(session) {
  const ai = session.aiTitle?.trim() || void 0;
  const custom = session.customTitle?.trim() || void 0;
  return {
    primary: ai ?? custom ?? cleanFirstPrompt(session.title),
    secondary: ai && custom ? custom : void 0
  };
}
function resolveSessionTitle(session) {
  return resolveSessionTitles(session).primary;
}
function nextTranscriptBatchEnd(total, rendered, batchSize = TRANSCRIPT_BATCH_SIZE) {
  if (!Number.isFinite(total) || !Number.isFinite(rendered) || !Number.isFinite(batchSize) || batchSize <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(total)), Math.max(0, Math.floor(rendered)) + Math.floor(batchSize));
}
function normalizePath(value) {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const absolute = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const parts = [];
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.length ? `/${parts.join("/")}` : "/";
}
function normalizeStoredTreeRoot(value) {
  return typeof value === "string" ? normalizePath(value) : null;
}
function normalizeStoredExpandedPaths(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return new Set(value.map((item) => normalizePath(item)));
}
function parentPath(value) {
  const normalized = normalizePath(value);
  if (normalized === "/") return "/";
  const slash = normalized.lastIndexOf("/");
  return slash <= 0 ? "/" : normalized.slice(0, slash);
}
function pathName(value) {
  const normalized = normalizePath(value);
  return normalized === "/" ? "/" : normalized.slice(normalized.lastIndexOf("/") + 1);
}
function isPathWithin(rootPath, candidatePath) {
  const root = normalizePath(rootPath);
  const candidate = normalizePath(candidatePath);
  return root === "/" || candidate === root || candidate.startsWith(`${root}/`);
}
function timestampValue(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function sessionKey(session) {
  return `${session.partition}\0${session.attributionKey}\0${session.id}`;
}
function normalizeDateRange(range) {
  return range.from && range.to && range.from > range.to ? { from: range.to, to: range.from } : range;
}
function localDateBounds(range) {
  const parse = (value, nextDay) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + (nextDay ? 1 : 0));
    return date.getTime();
  };
  return {
    from: range.from ? parse(range.from, false) : null,
    toExclusive: range.to ? parse(range.to, true) : null
  };
}
function dateRangeMatches(timestamp, range) {
  if (!range.from && !range.to) return true;
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return false;
  const bounds = localDateBounds(range);
  return (bounds.from === null || value >= bounds.from) && (bounds.toExclusive === null || value < bounds.toExclusive);
}
function commitAbsoluteLastActiveRange(timeRange, range) {
  const normalized = normalizeDateRange(range);
  return { timeRange: normalized.from || normalized.to ? "all" : timeRange, range: normalized };
}
function commitDurationTimeRange(value, range) {
  return { timeRange: value, range: value === "all" ? range : { from: "", to: "" } };
}
function clampPage(page, total, pageSize) {
  const maxPage = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  return Math.min(maxPage, Math.max(1, Math.floor(page) || 1));
}
function selectionReducer(state, action) {
  if (action.type === "clear-partition") return { selected: /* @__PURE__ */ new Set(), anchor: null };
  if (action.type === "clear-anchor") return { selected: new Set(state.selected), anchor: null };
  if (action.type === "intersect") {
    const allowed = new Set(action.keys);
    return { selected: new Set([...state.selected].filter((key) => allowed.has(key))), anchor: null };
  }
  if (action.type === "snapshot-all") return { selected: new Set(action.keys), anchor: state.anchor };
  if (action.type === "reconcile") {
    const succeeded = new Set(action.succeeded);
    const next = /* @__PURE__ */ new Set();
    for (const key of state.selected) {
      if (!succeeded.has(key)) next.add(key);
    }
    return { selected: next, anchor: null };
  }
  const selected = new Set(state.selected);
  if (action.type === "toggle") {
    if (selected.has(action.key)) selected.delete(action.key);
    else selected.add(action.key);
    return { selected, anchor: action.plain === false ? state.anchor : action.key };
  }
  const anchorIndex = state.anchor ? action.pageKeys.indexOf(state.anchor) : -1;
  const targetIndex = action.pageKeys.indexOf(action.key);
  if (anchorIndex < 0 || targetIndex < 0) {
    if (selected.has(action.key)) selected.delete(action.key);
    else selected.add(action.key);
    return { selected, anchor: state.anchor };
  }
  const shouldSelect = !selected.has(action.key);
  for (const key of action.pageKeys.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)) {
    if (shouldSelect) selected.add(key);
    else selected.delete(key);
  }
  return { selected, anchor: state.anchor };
}
async function runBulkSerial(options) {
  const results = [];
  let rebuildRequired = false;
  for (let index = 0; index < options.items.length; index += 1) {
    if (options.isCancelled?.()) break;
    const session = options.items[index];
    const args = options.action === "delete" ? ["delete-archived", session.attributionKey, session.id] : [options.action, session.attributionKey, session.id];
    try {
      const executed = await options.run(args);
      if (executed.code !== 0) {
        let reason = executed.stderr || "command failed";
        try {
          reason = JSON.parse(executed.stderr).message || reason;
        } catch {
        }
        results.push({ key: sessionKey(session), session, status: "failed", reason });
        continue;
      }
      const mutation = JSON.parse(executed.stdout);
      if (mutation.outcome === "success") {
        if (!mutation.cacheRefreshed) rebuildRequired = true;
        const retaggedKey = options.action === "archive" ? sessionKey({ ...session, partition: "archive" }) : options.action === "restore" ? sessionKey({ ...session, partition: "active" }) : void 0;
        results.push({ key: sessionKey(session), session, status: "done", retaggedKey });
      } else if (mutation.outcome === "failure" && (mutation.reason.error === "session-live" || mutation.reason.error === "possibly-live")) {
        results.push({ key: sessionKey(session), session, status: "skipped", reason: mutation.reason.message });
      } else {
        if (mutation.outcome === "partial") rebuildRequired = true;
        results.push({ key: sessionKey(session), session, status: "failed", reason: mutation.reason.message });
      }
    } catch (caught) {
      results.push({ key: sessionKey(session), session, status: "failed", reason: caught?.message || String(caught) });
    } finally {
      options.onProgress?.(index + 1, options.items.length, session);
    }
  }
  return {
    results,
    done: results.filter((result) => result.status === "done").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    rebuildRequired,
    cancelled: results.length < options.items.length
  };
}
function normalizePartitionSortSettings(value) {
  const saved = value && typeof value === "object" ? value : {};
  const normalize = (partition) => {
    const setting = saved[partition];
    const field = setting?.field;
    const direction = setting?.direction;
    return {
      field: field === "idle" || field === "created" || field === "msgcount" ? field : DEFAULT_PARTITION_SORT[partition].field,
      direction: direction === "asc" || direction === "desc" ? direction : DEFAULT_PARTITION_SORT[partition].direction
    };
  };
  return { active: normalize("active"), archive: normalize("archive") };
}
function sortSessions(items, setting) {
  const direction = setting.direction === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    let comparison = 0;
    if (setting.field === "idle") comparison = timestampValue(right.lastActiveAt) - timestampValue(left.lastActiveAt);
    else if (setting.field === "created") comparison = timestampValue(left.createdAt) - timestampValue(right.createdAt);
    else comparison = (left.messageCount ?? 0) - (right.messageCount ?? 0);
    return comparison * direction || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
}
function filterBranchOptions(options, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;
  return options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery));
}
function filterSessions(items, filters, now = Date.now()) {
  const query = filters.query.trim().toLocaleLowerCase();
  const ranges = {
    "24h": 24 * 60 * 6e4,
    "7d": 7 * 24 * 60 * 6e4,
    "30d": 30 * 24 * 60 * 6e4
  };
  const staleThresholds = {
    "older-15d": 15 * 24 * 60 * 6e4,
    "older-30d": 30 * 24 * 60 * 6e4
  };
  return items.filter((session) => {
    if (session.partition !== filters.partition) return false;
    const sessionPath = normalizePath(session.rootPath);
    const inScope = filters.scopeMode === "exact" ? sessionPath === normalizePath(filters.scopePath) : isPathWithin(filters.scopePath, sessionPath);
    if (!inScope) return false;
    const idleDuration = now - timestampValue(session.lastActiveAt);
    if (filters.timeRange in ranges && idleDuration > ranges[filters.timeRange]) return false;
    if (filters.timeRange in staleThresholds && idleDuration < staleThresholds[filters.timeRange]) return false;
    if (!dateRangeMatches(session.createdAt, { from: filters.createdFrom || "", to: filters.createdTo || "" })) return false;
    if (!dateRangeMatches(session.lastActiveAt, { from: filters.lastActiveFrom || "", to: filters.lastActiveTo || "" })) return false;
    if (filters.branch && (session.gitBranch || "") !== filters.branch) return false;
    const titles = resolveSessionTitles(session);
    if (query && !`${titles.primary}
${titles.secondary || ""}
${session.gitBranch || ""}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
}
function deepestCommonAncestor(rootPaths) {
  const normalized = rootPaths.map(normalizePath);
  if (normalized.length === 0) return "/";
  const split = normalized.map((value) => value.split("/").filter(Boolean));
  const common = [];
  const shortest = Math.min(...split.map((parts) => parts.length));
  for (let index = 0; index < shortest; index += 1) {
    const segment = split[0][index];
    if (!split.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return common.length ? `/${common.join("/")}` : "/";
}
function newerTimestamp(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(candidateTime)) return current;
  if (Number.isNaN(currentTime) || candidateTime > currentTime) return candidate;
  return current;
}
function deriveSessionPathTree(sessions, visibleRoot = deepestCommonAncestor(sessions.map((session) => session.rootPath))) {
  const rootPath = normalizePath(visibleRoot);
  const scoped = sessions.filter((session) => isPathWithin(rootPath, session.rootPath));
  if (scoped.length === 0) return null;
  const makeNode = (nodePath) => ({
    path: nodePath,
    name: pathName(nodePath),
    directActiveCount: 0,
    directArchiveCount: 0,
    activeCount: 0,
    archiveCount: 0,
    newestLastActiveAt: "",
    childrenByName: /* @__PURE__ */ new Map()
  });
  const root = makeNode(rootPath);
  for (const session of scoped) {
    const sessionPath = normalizePath(session.rootPath);
    const relativeParts = sessionPath === rootPath ? [] : sessionPath.slice(rootPath === "/" ? 1 : rootPath.length + 1).split("/").filter(Boolean);
    const chain = [root];
    let node = root;
    let currentPath = rootPath;
    for (const segment of relativeParts) {
      currentPath = currentPath === "/" ? `/${segment}` : `${currentPath}/${segment}`;
      let child = node.childrenByName.get(segment);
      if (!child) {
        child = makeNode(currentPath);
        node.childrenByName.set(segment, child);
      }
      node = child;
      chain.push(node);
    }
    if (session.partition === "active") node.directActiveCount += 1;
    else node.directArchiveCount += 1;
    for (const ancestor of chain) {
      if (session.partition === "active") ancestor.activeCount += 1;
      else ancestor.archiveCount += 1;
      ancestor.newestLastActiveAt = newerTimestamp(ancestor.newestLastActiveAt, session.lastActiveAt);
    }
  }
  const freezeNode = (node) => ({
    path: node.path,
    name: node.name,
    directActiveCount: node.directActiveCount,
    directArchiveCount: node.directArchiveCount,
    activeCount: node.activeCount,
    archiveCount: node.archiveCount,
    newestLastActiveAt: node.newestLastActiveAt,
    children: Array.from(node.childrenByName.values()).sort((a, b) => a.name.localeCompare(b.name)).map(freezeNode)
  });
  return freezeNode(root);
}
function formatRelativeTime(timestamp, t, now = Date.now()) {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return t("relative-unknown");
  const elapsed = Math.max(0, now - time);
  const minute = 6e4;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return t("relative-now");
  if (elapsed < hour) return t("relative-minutes", { n: Math.floor(elapsed / minute) });
  if (elapsed < day) return t("relative-hours", { n: Math.floor(elapsed / hour) });
  if (elapsed < 30 * day) return t("relative-days", { n: Math.floor(elapsed / day) });
  if (elapsed < 365 * day) return t("relative-months", { n: Math.floor(elapsed / (30 * day)) });
  return t("relative-years", { n: Math.floor(elapsed / (365 * day)) });
}
function formatCreatedAt(timestamp, locale, t) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return t("created-unknown");
  return t("created-at", { date: new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date) });
}
function formatTranscriptTime(timestamp, locale) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function formatSessionSpan(createdAt, lastActiveAt, locale, t) {
  const created = new Date(createdAt);
  const last = new Date(lastActiveAt);
  if (Number.isNaN(created.getTime()) || Number.isNaN(last.getTime())) return t("time-span-unknown");
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short"
  });
  return `${format.format(created)} \u2192 ${format.format(last)}`;
}
function idleGrade(timestamp) {
  const elapsed = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(elapsed) || elapsed >= 7 * 24 * 60 * 6e4) return "faded";
  if (elapsed < 24 * 60 * 6e4) return "bright";
  return "neutral";
}
function collectTreePaths(node, paths = /* @__PURE__ */ new Set()) {
  if (!node) return paths;
  paths.add(node.path);
  for (const child of node.children) collectTreePaths(child, paths);
  return paths;
}
function isSafeTranscriptHref(href) {
  return /^(?:https?:|mailto:)/i.test(href);
}
function activate(ctx) {
  const h = ctx.h;
  initIcons(h);
  const documentLanguage = typeof document === "undefined" ? "" : document.documentElement.lang;
  const localeSetting = ctx.ref("auto");
  const localeRef = ctx.ref(resolveLocale("auto", documentLanguage));
  const { t, locale } = initI18n(localeRef);
  const fontScale = ctx.ref(3);
  const activeAgent = ctx.ref(DEFAULT_AGENT);
  const agents = ctx.ref([]);
  const themeFollowHost = ctx.ref(true);
  const settingsOpen = ctx.ref(false);
  const sessions = ctx.ref([]);
  const loading = ctx.ref(true);
  const error = ctx.ref(null);
  const errorAction = ctx.ref(null);
  const visibleRoot = ctx.ref("/");
  const committedSelection = ctx.ref({ path: "/", mode: "subtree", sessionId: null });
  const searchOverlay = ctx.ref(null);
  const transientHighlightPath = ctx.ref(null);
  const expandedPaths = ctx.ref(/* @__PURE__ */ new Set());
  const hideScriptedSessions = ctx.ref(false);
  const showRootPicker = ctx.ref(false);
  const pickerCurrentDir = ctx.ref("/");
  const pickerEntries = ctx.ref([]);
  const pickerLoading = ctx.ref(false);
  const pickerError = ctx.ref(null);
  const pickerManualPath = ctx.ref("");
  const pickerTriggerRef = ctx.ref(null);
  const pickerInputRef = ctx.ref(null);
  const paneWidths = ctx.ref({ ...DEFAULT_PANE_WIDTHS });
  const activePartition = ctx.ref("active");
  const sortSettings = ctx.ref(normalizePartitionSortSettings(null));
  const timeRange = ctx.ref("all");
  const branchFilter = ctx.ref("");
  const branchPickerOpen = ctx.ref(false);
  const branchPickerQuery = ctx.ref("");
  const branchSearchRef = ctx.ref(null);
  const createdRange = ctx.ref({ from: "", to: "" });
  const lastActiveRange = ctx.ref({ from: "", to: "" });
  const filtersOpen = ctx.ref(false);
  const searchQuery = ctx.ref("");
  const globalSearch = ctx.ref(false);
  const searching = ctx.ref(false);
  const selectedSession = ctx.ref(null);
  const compactMode = ctx.ref(false);
  const compactView = ctx.ref("list");
  const kbAvoid = ctx.ref(false);
  const kbAvoidW = ctx.ref(0);
  const kbAvoidH = ctx.ref(0);
  const rootRef = ctx.ref(null);
  const transcriptMessages = ctx.ref([]);
  const transcriptLoading = ctx.ref(false);
  const transcriptError = ctx.ref(null);
  const expandedTools = ctx.ref(/* @__PURE__ */ new Set());
  const copiedSessionId = ctx.ref(false);
  const transcriptScrollRef = ctx.ref(null);
  const searchInputRef = ctx.ref(null);
  const page = ctx.ref(1);
  const pageSize = ctx.ref(50);
  const selectMode = ctx.ref(false);
  const selection = ctx.ref({ selected: /* @__PURE__ */ new Set(), anchor: null });
  const bulkRunning = ctx.ref(false);
  const bulkCancelRequested = ctx.ref(false);
  const bulkProgress = ctx.ref({ completed: 0, total: 0, title: "" });
  const bulkResult = ctx.ref(null);
  const bulkRefreshFailed = ctx.ref(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let resizeActive = false;
  const COMPACT_BASE_WIDTH = 900;
  let rootWidth = 0;
  let mountGeneration = 0;
  let activeMount = null;
  let mutationInFlight = false;
  let hasMounted = false;
  let warnedPersistFailure = false;
  function runAgent(args, opts) {
    if (AGENT_AGNOSTIC.has(args[0])) return ctx.exec.run(args, opts);
    return ctx.exec.run([...args, "--agent", activeAgent.value], opts);
  }
  ctx.commands.register("session-browser.open", () => {
    ctx.open();
  });
  ctx.commands.register("session-browser.search", () => {
    ctx.open();
    if (compactMode.value) compactView.value = "list";
    settingsOpen.value = false;
    filtersOpen.value = false;
    scheduleMountTimeout(() => searchInputRef.value?.focus(), 0);
  });
  const activeDescriptor = ctx.computed(() => agents.value.find((agent) => agent.id === activeAgent.value) || null);
  const activeCapabilities = ctx.computed(() => activeDescriptor.value?.capabilities || UNAVAILABLE_CAPABILITIES);
  const activeResumeArgv = ctx.computed(() => activeDescriptor.value?.resume.argv || DEFAULT_RESUME_ARGV_BY_AGENT.get(activeAgent.value));
  const originFilteredSessions = ctx.computed(() => sessions.value.filter((session) => isSessionVisibleByOrigin(session)));
  const tree = ctx.computed(() => deriveSessionPathTree(originFilteredSessions.value, visibleRoot.value));
  function persist(key, value) {
    ctx.storage.set(key, value).catch((caught) => {
      if (warnedPersistFailure) return;
      warnedPersistFailure = true;
      console.warn("[session-browser] could not persist plugin setting", caught);
    });
  }
  function perAgentStorageKey(key, agent = activeAgent.value) {
    return `${key}:${agent}`;
  }
  async function readPerAgentTreeSetting(key, agent) {
    const value = await ctx.storage.get(perAgentStorageKey(key, agent));
    if (value !== void 0 || agent !== DEFAULT_AGENT) return value;
    return ctx.storage.get(key);
  }
  function isSessionVisibleByOrigin(session) {
    if (!activeCapabilities.value.originFilter || !hideScriptedSessions.value) return true;
    return session.origin !== "exec" && session.origin !== "subagent";
  }
  function createMountContext() {
    return {
      active: false,
      generation: ++mountGeneration,
      indexGeneration: 0,
      searchGeneration: 0,
      displayGeneration: 0,
      paneGeneration: 0,
      sortGeneration: 0,
      treeGeneration: 0,
      disposers: /* @__PURE__ */ new Set(),
      highlightTimer: null,
      copiedTimer: null,
      transcriptFrame: null,
      transcriptLoadToken: 0,
      pickerRequestSeq: 0,
      pickerValidationSeq: 0,
      allTranscriptMessages: [],
      rootResizeObserver: null,
      localeObserver: null
    };
  }
  function isActiveMount(mount) {
    return Boolean(mount?.active && activeMount?.generation === mount.generation);
  }
  function addMountDisposer(mount, dispose) {
    mount.disposers.add(dispose);
  }
  function scheduleMountTimeout(callback, delay) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return null;
    let handle;
    const dispose = () => clearTimeout(handle);
    handle = setTimeout(() => {
      mount.disposers.delete(dispose);
      if (isActiveMount(mount)) callback();
    }, delay);
    addMountDisposer(mount, dispose);
    return handle;
  }
  function scheduleMountFrame(mount, callback) {
    if (!isActiveMount(mount)) return null;
    let handle;
    const dispose = () => cancelAnimationFrame(handle);
    handle = requestAnimationFrame(() => {
      mount.disposers.delete(dispose);
      if (isActiveMount(mount)) callback();
    });
    addMountDisposer(mount, dispose);
    return handle;
  }
  function persistExpandedPaths() {
    persist(perAgentStorageKey(STORAGE_KEYS.treeExpandedPaths), Array.from(expandedPaths.value));
  }
  function setHideScriptedSessions(value) {
    hideScriptedSessions.value = value;
    persist(perAgentStorageKey(STORAGE_KEYS.hideScriptedSessions), value);
    clearSearchOverlay();
    if (selectedSession.value && !isSessionVisibleByOrigin(selectedSession.value)) {
      committedSelection.value = { ...committedSelection.value, sessionId: null };
      resetTranscript();
    }
    applyFilterChange();
  }
  function setLocaleSetting(value) {
    if (activeMount) activeMount.displayGeneration++;
    localeSetting.value = normalizeLocaleSetting(value);
    localeRef.value = resolveLocale(localeSetting.value, typeof document === "undefined" ? "" : document.documentElement.lang);
    persist(STORAGE_KEYS.locale, localeSetting.value);
  }
  function setFontScale(value) {
    if (activeMount) activeMount.displayGeneration++;
    fontScale.value = Math.min(5, Math.max(1, Math.round(value)));
    updateCompactMode(rootWidth);
    persist(STORAGE_KEYS.fontScale, fontScale.value);
  }
  function updateKbAvoid() {
    const root = rootRef.value;
    let active = false;
    let w = 0;
    let h2 = 0;
    if (root && typeof document !== "undefined") {
      const btn = document.getElementById("kb-toggle-btn");
      if (btn) {
        const cs = window.getComputedStyle(btn);
        if (cs.display !== "none" && cs.visibility === "visible") {
          const br = btn.getBoundingClientRect();
          const rr = root.getBoundingClientRect();
          const overlapW = Math.min(rr.right, br.right) - Math.max(rr.left, br.left);
          const overlapH = Math.min(rr.bottom, br.bottom) - Math.max(rr.top, br.top);
          if (br.width > 0 && br.height > 0 && overlapW > 0 && overlapH > 0) {
            active = true;
            w = Math.min(Math.ceil(rr.right - br.left) + 8, Math.ceil(br.width) + 32);
            h2 = Math.min(Math.ceil(rr.bottom - br.top) + 8, Math.ceil(br.height) + 32);
          }
        }
      }
    }
    if (kbAvoid.value === active && kbAvoidW.value === w && kbAvoidH.value === h2) return;
    kbAvoid.value = active;
    kbAvoidW.value = w;
    kbAvoidH.value = h2;
  }
  function updateCompactMode(width) {
    rootWidth = width;
    const multiplier = FONT_SCALE_MULTIPLIERS[fontScale.value] || 1;
    const nextCompact = width < COMPACT_BASE_WIDTH * multiplier;
    if (nextCompact !== compactMode.value) {
      compactMode.value = nextCompact;
      settingsOpen.value = false;
      filtersOpen.value = false;
      stopResize();
      if (nextCompact) compactView.value = selectedSession.value ? "detail" : "list";
    }
    updateKbAvoid();
  }
  function observeRootElement(mount, element) {
    updateCompactMode(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    mount.rootResizeObserver?.disconnect();
    mount.rootResizeObserver = new ResizeObserver(() => updateCompactMode(element.getBoundingClientRect().width));
    mount.rootResizeObserver.observe(element);
    const kbBtn = document.getElementById("kb-toggle-btn");
    if (kbBtn) mount.rootResizeObserver.observe(kbBtn);
  }
  function setRootElement(element) {
    if (element === rootRef.value) return;
    rootRef.value = element;
    if (!element) {
      activeMount?.rootResizeObserver?.disconnect();
      if (activeMount) activeMount.rootResizeObserver = null;
      return;
    }
    const mount = activeMount;
    if (isActiveMount(mount)) observeRootElement(mount, element);
  }
  function setThemeFollowHost(value) {
    if (activeMount) activeMount.displayGeneration++;
    themeFollowHost.value = value;
    persist(STORAGE_KEYS.themeFollowHost, value);
  }
  function resetPageAndAnchor() {
    page.value = 1;
    selection.value = selectionReducer(selection.value, { type: "clear-anchor" });
  }
  function applyFilterChange() {
    resetPageAndAnchor();
    const keys = sessionsForList(activePartition.value).map(sessionKey);
    selection.value = selectionReducer(selection.value, { type: "intersect", keys });
  }
  function setPage(nextPage, total = sessionsForList(activePartition.value).length) {
    const clamped = clampPage(nextPage, total, pageSize.value);
    if (clamped !== page.value) selection.value = selectionReducer(selection.value, { type: "clear-anchor" });
    page.value = clamped;
  }
  function clearError() {
    error.value = null;
    errorAction.value = null;
  }
  function showError(message, action) {
    error.value = message;
    errorAction.value = action || null;
  }
  function cliError(message) {
    return t("cli-error", { msg: message });
  }
  function agentLabel(agent) {
    return t(`agent-${agent.id}`);
  }
  function parseAgentDescriptors(stdout) {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) throw new Error(t("agent-discovery-invalid"));
    return parsed.map((value) => {
      const caps = value?.capabilities;
      const resumeArgv = value?.resume?.argv;
      const defaultResumeArgv = DEFAULT_RESUME_ARGV_BY_AGENT.get(value?.id);
      const validCapabilities = caps && ["archive", "rename", "delete", "deleteRequiresArchived", "nativeIndex", "tokenStats", "originFilter"].every((key) => typeof caps[key] === "boolean");
      if (!value || typeof value.id !== "string" || typeof value.available !== "boolean" || !validCapabilities) {
        throw new Error(t("agent-discovery-invalid"));
      }
      const validResumeArgv = Array.isArray(resumeArgv) && resumeArgv.length > 0 && resumeArgv.every((arg) => typeof arg === "string" && RESUME_ARG_TOKEN_RE.test(arg));
      if (!validResumeArgv && !defaultResumeArgv) throw new Error(t("agent-discovery-invalid"));
      return {
        id: value.id,
        available: value.available,
        degraded: value.degraded === true,
        unavailableReason: typeof value.unavailableReason === "string" ? value.unavailableReason : void 0,
        degradedReason: typeof value.degradedReason === "string" ? value.degradedReason : void 0,
        capabilities: caps,
        resume: {
          argv: validResumeArgv ? [...resumeArgv] : [...defaultResumeArgv]
        }
      };
    });
  }
  function legacyAgentDescriptor() {
    return {
      id: DEFAULT_AGENT,
      available: true,
      degraded: false,
      capabilities: LEGACY_CAPABILITIES,
      resume: { argv: [...LEGACY_RESUME.argv] }
    };
  }
  function agentTooltip(agent) {
    if (!agent.available) return agent.unavailableReason || t("agent-unavailable-tooltip");
    if (agent.degraded) return agent.degradedReason || t("agent-degraded-tooltip");
    return t("agent-switcher");
  }
  function notifyDegradedAgent(agent) {
    if (!agent.degraded) return;
    ctx.ui.notify(
      t("agent-degraded-notice", { agent: agentLabel(agent), reason: agent.degradedReason || t("agent-degraded-tooltip") }),
      "warn",
      t("agent-degraded-title")
    );
  }
  function resetForAgentSwitch() {
    if (activeMount) {
      activeMount.indexGeneration++;
      activeMount.searchGeneration++;
      activeMount.treeGeneration++;
      activeMount.pickerRequestSeq++;
      activeMount.pickerValidationSeq++;
    }
    clearSearchOverlay(true);
    resetTranscript();
    sessions.value = [];
    committedSelection.value = { path: "/", mode: "subtree", sessionId: null };
    activePartition.value = "active";
    page.value = 1;
    selection.value = selectionReducer(selection.value, { type: "clear-partition" });
    selectMode.value = false;
    timeRange.value = "all";
    branchFilter.value = "";
    branchPickerOpen.value = false;
    branchPickerQuery.value = "";
    createdRange.value = { from: "", to: "" };
    lastActiveRange.value = { from: "", to: "" };
    globalSearch.value = false;
    filtersOpen.value = false;
    settingsOpen.value = false;
    showRootPicker.value = false;
    pickerLoading.value = false;
    bulkResult.value = null;
    bulkRefreshFailed.value = false;
    compactView.value = "list";
  }
  async function switchAgent(nextAgent) {
    const descriptor = agents.value.find((agent) => agent.id === nextAgent);
    if (!descriptor?.available || nextAgent === activeAgent.value || loading.value || bulkRunning.value || mutationInFlight) return;
    activeAgent.value = nextAgent;
    persist(STORAGE_KEYS.activeAgent, nextAgent);
    resetForAgentSwitch();
    const loaded = await loadIndex();
    if (!loaded) return;
    if (sessions.value.length === 0) {
      ctx.ui.notify(t("agent-empty-notice", { agent: agentLabel(descriptor) }), "warn", t("agent-empty-title"));
    }
    notifyDegradedAgent(descriptor);
  }
  async function initializeAgents(preserveState) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    loading.value = true;
    clearError();
    try {
      const [result, storedAgent] = await Promise.all([
        runAgent(["agents"], { timeout: 1e4 }),
        ctx.storage.get(STORAGE_KEYS.activeAgent).catch(() => null)
      ]);
      if (!isActiveMount(mount)) return;
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, t("agent-discovery-failed")).message);
      let discovered;
      try {
        discovered = parseAgentDescriptors(result.stdout);
      } catch (caught) {
        let legacyResponse = false;
        try {
          const parsed = JSON.parse(result.stdout);
          legacyResponse = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && "outcome" in parsed);
        } catch {
        }
        if (!legacyResponse) throw caught;
        discovered = [];
      }
      if (discovered.length === 0) discovered = [legacyAgentDescriptor()];
      agents.value = discovered;
      const requestedId = typeof storedAgent === "string" ? storedAgent : DEFAULT_AGENT;
      const requested = discovered.find((agent) => agent.id === requestedId);
      const available = discovered.filter((agent) => agent.available);
      if (available.length === 0) {
        activeAgent.value = requested?.id || discovered[0].id;
        loading.value = false;
        showError(t("agent-none-available"));
        return;
      }
      const candidates = requested?.available ? [requested, ...available.filter((agent) => agent.id !== requested.id)] : available;
      const previousAgent = activeAgent.value;
      let chosen = null;
      let requestedLoaded = false;
      for (const candidate of candidates) {
        const switchedAgent = candidate.id !== activeAgent.value;
        if (switchedAgent) resetForAgentSwitch();
        activeAgent.value = candidate.id;
        const preserveCandidateState = preserveState && !switchedAgent && candidate.id === previousAgent && candidate.id === requestedId;
        const loaded = await loadIndex(preserveCandidateState);
        if (!isActiveMount(mount)) return;
        if (candidate.id === requestedId) requestedLoaded = loaded;
        if (loaded && sessions.value.length > 0) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) {
        const emptyAgent = candidates[0];
        if (activeAgent.value !== emptyAgent.id) {
          resetForAgentSwitch();
          activeAgent.value = emptyAgent.id;
          await loadIndex();
          if (!isActiveMount(mount)) return;
        } else if (requestedLoaded && sessions.value.length === 0) {
          clearSearchOverlay(true);
          resetTranscript();
          page.value = 1;
          selection.value = selectionReducer(selection.value, { type: "clear-partition" });
          selectMode.value = false;
        }
        if (emptyAgent.id !== requestedId) persist(STORAGE_KEYS.activeAgent, emptyAgent.id);
        ctx.ui.notify(t("agent-no-sessions"), "warn", t("agent-empty-title"));
        notifyDegradedAgent(emptyAgent);
        return;
      }
      if (chosen.id !== requestedId) {
        persist(STORAGE_KEYS.activeAgent, chosen.id);
        const requestedName = requested ? agentLabel(requested) : String(requestedId);
        const reason = !requested ? t("agent-not-registered") : !requested.available ? requested.unavailableReason || t("agent-unavailable-tooltip") : requestedLoaded ? t("agent-no-sessions-short") : t("agent-load-failed-short");
        ctx.ui.notify(
          t("agent-fallback-notice", { agent: requestedName, fallback: agentLabel(chosen), reason }),
          "warn",
          t("agent-fallback-title")
        );
      }
      notifyDegradedAgent(chosen);
    } catch (caught) {
      if (isActiveMount(mount)) {
        loading.value = false;
        showError(cliError(caught?.message || t("agent-discovery-failed")));
      }
    }
  }
  function parseCliFailure(stderr, fallback) {
    try {
      const parsed = JSON.parse(stderr.trim());
      return {
        error: typeof parsed.error === "string" ? parsed.error : "",
        message: typeof parsed.message === "string" ? parsed.message : fallback
      };
    } catch {
      return { error: "", message: stderr.trim() || fallback };
    }
  }
  function parseMutationResult(stdout) {
    const parsed = JSON.parse(stdout);
    if (parsed.outcome === "success" && typeof parsed.cacheRefreshed === "boolean") return parsed;
    if ((parsed.outcome === "failure" || parsed.outcome === "partial") && parsed.reason && typeof parsed.reason === "object" && typeof parsed.reason.error === "string" && typeof parsed.reason.message === "string") return parsed;
    throw new Error("mutation command returned invalid JSON");
  }
  function mutationError(result) {
    if (result.outcome === "partial") {
      return new Error(`${result.reason.message} (${result.jsonlPath}; ${result.artifactPath})`);
    }
    return new Error(result.reason.message);
  }
  async function requireMutationSuccess(result) {
    if (result.outcome === "success") return result;
    if (result.outcome === "partial") await loadIndex(true, true);
    throw mutationError(result);
  }
  async function refreshCacheIfNeeded(result) {
    const caps = activeCapabilities.value;
    if (result.cacheRefreshed || caps.nativeIndex) return;
    const rebuilt = await runAgent(["build-index", "--refresh"], { timeout: 3e4 });
    if (rebuilt.code !== 0) throw new Error(parseCliFailure(rebuilt.stderr, "cache rebuild failed").message);
    try {
      if (!Array.isArray(JSON.parse(rebuilt.stdout))) throw new Error("cache rebuild returned invalid JSON");
    } catch (caught) {
      throw new Error(caught?.message || "cache rebuild returned invalid JSON");
    }
  }
  function sameSession(left, right) {
    return sessionKey(left) === sessionKey(right);
  }
  function retagSession(session, partition) {
    const oldKey = sessionKey(session);
    const updated = { ...session, partition };
    sessions.value = sessions.value.map((candidate) => sameSession(candidate, session) ? updated : candidate);
    if (selectedSession.value && sameSession(selectedSession.value, session)) selectedSession.value = updated;
    if (committedSelection.value.sessionId === oldKey) {
      committedSelection.value = { ...committedSelection.value, sessionId: sessionKey(updated) };
    }
    if (searchOverlay.value) {
      const results = searchOverlay.value.results.flatMap((result) => {
        if (!sameSession(result.session, session)) return [result];
        return partition === "active" ? [{ ...result, session: updated }] : [];
      });
      searchOverlay.value = {
        ...searchOverlay.value,
        results,
        selectedSessionId: results.some((result) => sessionKey(result.session) === searchOverlay.value?.selectedSessionId) ? searchOverlay.value.selectedSessionId : null
      };
    }
    if (selection.value.selected.has(oldKey)) {
      selection.value = selectionReducer(selection.value, {
        type: "reconcile",
        succeeded: [oldKey]
      });
    }
    page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value);
    return updated;
  }
  function removeSession(session) {
    const removedKey = sessionKey(session);
    sessions.value = sessions.value.filter((candidate) => !sameSession(candidate, session));
    if (committedSelection.value.sessionId === removedKey) {
      committedSelection.value = { ...committedSelection.value, sessionId: null };
    }
    if (searchOverlay.value) {
      const results = searchOverlay.value.results.filter((result) => !sameSession(result.session, session));
      searchOverlay.value = {
        ...searchOverlay.value,
        results,
        selectedSessionId: searchOverlay.value.selectedSessionId === removedKey ? null : searchOverlay.value.selectedSessionId
      };
    }
    if (selectedSession.value && sameSession(selectedSession.value, session)) resetTranscript();
    selection.value = selectionReducer(selection.value, { type: "reconcile", succeeded: [removedKey] });
    page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value);
  }
  function logMutation(action, session, cacheRefreshed) {
    console.info(`[session-browser] ${action} session`, { id: session.id, cacheRefreshed });
    const localizedAction = t(`action-${action}`);
    ctx.ui.notify(t("notify-paths-one", {
      action: localizedAction,
      n: 1
    }), "info", t("notify-files-updated"));
  }
  function cancelTranscriptFrame() {
    const mount = activeMount;
    if (!mount) return;
    if (mount.transcriptFrame !== null) cancelAnimationFrame(mount.transcriptFrame);
    mount.transcriptFrame = null;
  }
  function resetTranscript() {
    const mount = activeMount;
    if (mount) mount.transcriptLoadToken++;
    cancelTranscriptFrame();
    if (mount?.copiedTimer) clearTimeout(mount.copiedTimer);
    if (mount) mount.copiedTimer = null;
    selectedSession.value = null;
    transcriptMessages.value = [];
    if (mount) mount.allTranscriptMessages = [];
    transcriptLoading.value = false;
    transcriptError.value = null;
    expandedTools.value = /* @__PURE__ */ new Set();
    copiedSessionId.value = false;
    transcriptScrollRef.value = null;
  }
  function renderNextTranscriptBatch(mount, token) {
    if (!isActiveMount(mount) || token !== mount.transcriptLoadToken) return;
    const start = transcriptMessages.value.length;
    const end = nextTranscriptBatchEnd(mount.allTranscriptMessages.length, start);
    if (end <= start) {
      mount.transcriptFrame = null;
      return;
    }
    transcriptMessages.value = [...transcriptMessages.value, ...mount.allTranscriptMessages.slice(start, end)];
    mount.transcriptFrame = end < mount.allTranscriptMessages.length ? scheduleMountFrame(mount, () => renderNextTranscriptBatch(mount, token)) : null;
  }
  async function openTranscript(session) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const token = ++mount.transcriptLoadToken;
    cancelTranscriptFrame();
    selectedSession.value = session;
    transcriptMessages.value = [];
    mount.allTranscriptMessages = [];
    transcriptLoading.value = true;
    transcriptError.value = null;
    expandedTools.value = /* @__PURE__ */ new Set();
    copiedSessionId.value = false;
    try {
      const result = await runAgent(["read-session", session.attributionKey, session.id], { timeout: 3e4 });
      if (!isActiveMount(mount) || token !== mount.transcriptLoadToken) return;
      if (result.code !== 0) throw new Error(result.stderr || "read-session failed");
      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) throw new Error("read-session returned invalid JSON");
      mount.allTranscriptMessages = parsed;
      renderNextTranscriptBatch(mount, token);
      scheduleMountFrame(mount, () => {
        if (token === mount.transcriptLoadToken && transcriptScrollRef.value) transcriptScrollRef.value.scrollTop = 0;
      });
    } catch (caught) {
      if (isActiveMount(mount) && token === mount.transcriptLoadToken) transcriptError.value = cliError(caught?.message || String(caught));
    } finally {
      if (isActiveMount(mount) && token === mount.transcriptLoadToken) transcriptLoading.value = false;
    }
  }
  function selectSession(session, fromSearch = false) {
    if (fromSearch) {
      if (searchOverlay.value) searchOverlay.value = { ...searchOverlay.value, selectedSessionId: sessionKey(session) };
      flashTreePath(session.rootPath);
    } else {
      committedSelection.value = { ...committedSelection.value, sessionId: sessionKey(session) };
    }
    openTranscript(session);
    if (compactMode.value) compactView.value = "detail";
  }
  async function copySessionId() {
    const session = selectedSession.value;
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.id);
      copiedSessionId.value = true;
      const mount = activeMount;
      if (!isActiveMount(mount)) return;
      if (mount.copiedTimer) clearTimeout(mount.copiedTimer);
      mount.copiedTimer = scheduleMountTimeout(() => {
        copiedSessionId.value = false;
        mount.copiedTimer = null;
      }, 1500);
    } catch {
      transcriptError.value = t("error-copy-session-id");
    }
  }
  async function copyResumeCommand(session, isCurrent = () => true) {
    if (!SESSION_ID_RE.test(session.id)) {
      showError(t("error-invalid-session-id"));
      return false;
    }
    const command = `cd -- ${shQuote(session.rootPath)} && ${activeResumeArgv.value.join(" ")} ${session.id}`;
    try {
      await navigator.clipboard.writeText(command);
      if (!isCurrent()) return false;
      ctx.ui.notify(t("notify-command-copied"), "info");
      return true;
    } catch {
      if (isCurrent()) showError(t("error-copy-resume"));
      return false;
    }
  }
  async function coordinateMutation(fallback, operation) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return fallback;
    if (mutationInFlight) {
      ctx.ui.notify(t("notify-mutation-in-progress"), "warn");
      return fallback;
    }
    mutationInFlight = true;
    try {
      return await operation(() => isActiveMount(mount));
    } finally {
      mutationInFlight = false;
    }
  }
  async function restoreSessionCore(session, isCurrent) {
    const caps = activeCapabilities.value;
    if (!caps.archive) return null;
    clearError();
    try {
      const result = await runAgent(["restore", session.attributionKey, session.id], { timeout: 3e4 });
      if (!isCurrent()) return null;
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "restore failed").message);
      const mutation = await requireMutationSuccess(parseMutationResult(result.stdout));
      if (!isCurrent()) return null;
      const restored = retagSession(session, "active");
      await refreshCacheIfNeeded(mutation);
      if (!isCurrent()) return null;
      logMutation("restored", session, mutation.cacheRefreshed);
      return restored;
    } catch (caught) {
      if (isCurrent()) showError(cliError(caught?.message || t("error-restore")));
      return null;
    }
  }
  async function restoreSession(session) {
    return coordinateMutation(null, (isCurrent) => restoreSessionCore(session, isCurrent));
  }
  async function archiveSession(session) {
    await coordinateMutation(void 0, async (isCurrent) => {
      const caps = activeCapabilities.value;
      if (!caps.archive) return;
      const title = resolveSessionTitle(session) || t("untitled-session");
      const accepted = await ctx.ui.confirm(t("archive-session-confirm", { title }));
      if (!isCurrent() || !accepted) return;
      clearError();
      try {
        let result = await runAgent(["archive", session.attributionKey, session.id], { timeout: 3e4 });
        if (!isCurrent()) return;
        if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "archive failed").message);
        let mutation = parseMutationResult(result.stdout);
        if (mutation.outcome === "failure" && (mutation.reason.error === "possibly-live" || mutation.reason.error === "session-live")) {
          const forceAccepted = await ctx.ui.confirm(t("archive-session-force-confirm", { title }));
          if (!isCurrent() || !forceAccepted) return;
          result = await runAgent(["archive", session.attributionKey, session.id, "--force"], { timeout: 3e4 });
          if (!isCurrent()) return;
          if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "forced archive failed").message);
          mutation = parseMutationResult(result.stdout);
        }
        mutation = await requireMutationSuccess(mutation);
        if (!isCurrent()) return;
        retagSession(session, "archive");
        await refreshCacheIfNeeded(mutation);
        if (!isCurrent()) return;
        logMutation("archived", session, mutation.cacheRefreshed);
      } catch (caught) {
        if (isCurrent()) showError(cliError(caught?.message || t("error-archive")));
      }
    });
  }
  async function deleteSession(session) {
    await coordinateMutation(void 0, async (isCurrent) => {
      const caps = activeCapabilities.value;
      if (!caps.delete || caps.deleteRequiresArchived && session.partition !== "archive") return;
      const title = resolveSessionTitle(session) || t("untitled-session");
      const accepted = await ctx.ui.confirm(t(
        caps.deleteRequiresArchived ? "delete-session-confirm" : "delete-session-direct-confirm",
        { title }
      ));
      if (!isCurrent() || !accepted) return;
      clearError();
      try {
        const result = await runAgent(["delete-archived", session.attributionKey, session.id], { timeout: 3e4 });
        if (!isCurrent()) return;
        if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "delete-archived failed").message);
        const mutation = await requireMutationSuccess(parseMutationResult(result.stdout));
        if (!isCurrent()) return;
        removeSession(session);
        await refreshCacheIfNeeded(mutation);
        if (!isCurrent()) return;
        logMutation("deleted", session, mutation.cacheRefreshed);
      } catch (caught) {
        if (isCurrent()) showError(cliError(caught?.message || t("error-delete")));
      }
    });
  }
  async function resumeSession(session) {
    await coordinateMutation(void 0, (isCurrent) => resumeSessionCore(session, isCurrent));
  }
  async function resumeSessionCore(session, isCurrent) {
    clearError();
    let resumable = session;
    if (!SESSION_ID_RE.test(resumable.id)) {
      showError(t("error-invalid-session-id"));
      return;
    }
    try {
      const result = await runAgent(["check-dir", resumable.rootPath], { timeout: 1e4 });
      if (!isCurrent()) return;
      if (result.code !== 0) throw new Error(result.stderr || "check-dir failed");
      const checked = JSON.parse(result.stdout);
      if (!checked.exists || !checked.dir) {
        const warning = checked.exists ? t("workspace-not-directory", { path: resumable.rootPath }) : t("workspace-missing", { path: resumable.rootPath });
        ctx.ui.notify(warning, "warn", t("notify-resume-unavailable"));
        const accepted = await ctx.ui.confirm(t("resume-copy-fallback-confirm", { warning }));
        if (isCurrent() && accepted) await copyResumeCommand(resumable, isCurrent);
        return;
      }
    } catch (caught) {
      if (isCurrent()) showError(cliError(caught?.message || t("error-check-workspace")), {
        label: t("copy-command"),
        run: () => {
          void copyResumeCommand(resumable, isCurrent);
        }
      });
      return;
    }
    if (resumable.live) {
      const title = resolveSessionTitle(resumable) || t("untitled-session");
      const accepted = await ctx.ui.confirm(t("resume-live-confirm", { title }));
      if (!isCurrent() || !accepted) return;
    }
    if (resumable.partition === "archive") {
      const title = resolveSessionTitle(resumable) || t("untitled-session");
      const accepted = await ctx.ui.confirm(t("restore-first-confirm", { title }));
      if (!isCurrent() || !accepted) return;
      const restored = await restoreSessionCore(resumable, isCurrent);
      if (!restored) return;
      resumable = restored;
    }
    const terminal = ctx.terminal;
    if (typeof terminal?.createTerminalTab !== "function") {
      await copyResumeCommand(resumable, isCurrent);
      return;
    }
    try {
      await terminal.createTerminalTab({
        cwd: resumable.rootPath,
        argv: [...activeResumeArgv.value, resumable.id],
        title: resolveSessionTitle(resumable).slice(0, 24)
      });
    } catch {
      if (isCurrent()) showError(t("error-open-terminal"), {
        label: t("copy-command"),
        run: () => {
          void copyResumeCommand(resumable, isCurrent);
        }
      });
    }
  }
  function toggleTool(messageKey, toolIndex) {
    const key = `${messageKey}-${toolIndex}`;
    const next = new Set(expandedTools.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedTools.value = next;
  }
  async function loadIndex(preserveState = false, refresh = false) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return false;
    const requestGeneration = ++mount.indexGeneration;
    const isCurrent = () => isActiveMount(mount) && requestGeneration === mount.indexGeneration;
    const treeGeneration = ++mount.treeGeneration;
    const isCurrentTree = () => isCurrent() && treeGeneration === mount.treeGeneration;
    loading.value = true;
    clearError();
    try {
      const caps = activeCapabilities.value;
      const result = await runAgent(refresh && !caps.nativeIndex ? ["build-index", "--refresh"] : ["build-index"], { timeout: 3e4 });
      if (!isCurrent()) return false;
      if (result.code !== 0) throw new Error(result.stderr || "build-index failed");
      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) throw new Error("build-index returned invalid JSON");
      sessions.value = parsed;
      const requestAgent = activeAgent.value;
      if (caps.originFilter) {
        try {
          hideScriptedSessions.value = await ctx.storage.get(
            perAgentStorageKey(STORAGE_KEYS.hideScriptedSessions, requestAgent)
          ) === true;
        } catch {
          hideScriptedSessions.value = false;
        }
      } else {
        hideScriptedSessions.value = false;
      }
      if (!isCurrent()) return false;
      const presentKeys = sessionsForList(activePartition.value).map(sessionKey);
      selection.value = selectionReducer(selection.value, { type: "intersect", keys: presentKeys });
      if (preserveState) {
        page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value);
        if (selectedSession.value) {
          selectedSession.value = sessions.value.find((item) => sessionKey(item) === sessionKey(selectedSession.value)) || selectedSession.value;
        }
        return true;
      }
      resetTranscript();
      if (!isCurrentTree()) return false;
      let savedRoot = null;
      try {
        savedRoot = normalizeStoredTreeRoot(await readPerAgentTreeSetting(STORAGE_KEYS.treeRoot, requestAgent));
      } catch {
      }
      if (!isCurrentTree()) return false;
      visibleRoot.value = savedRoot || deepestCommonAncestor(originFilteredSessions.value.map((session) => session.rootPath));
      persist(perAgentStorageKey(STORAGE_KEYS.treeRoot, requestAgent), visibleRoot.value);
      committedSelection.value = { path: visibleRoot.value, mode: "subtree", sessionId: null };
      let savedExpanded = null;
      try {
        savedExpanded = normalizeStoredExpandedPaths(
          await readPerAgentTreeSetting(STORAGE_KEYS.treeExpandedPaths, requestAgent)
        );
      } catch {
      }
      if (!isCurrentTree()) return false;
      if (savedExpanded) {
        expandedPaths.value = savedExpanded;
      } else {
        expandedPaths.value = collectTreePaths(deriveSessionPathTree(originFilteredSessions.value, visibleRoot.value));
        persistExpandedPaths();
      }
      expandedPaths.value.add(visibleRoot.value);
      persistExpandedPaths();
      return true;
    } catch (caught) {
      if (isCurrent()) showError(cliError(caught?.message || String(caught)));
      return false;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }
  async function loadPaneWidths() {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const generation = ++mount.paneGeneration;
    try {
      const saved = await ctx.storage.get(STORAGE_KEYS.paneWidths);
      if (!isActiveMount(mount) || generation !== mount.paneGeneration) return;
      if (saved && Number.isFinite(saved.left)) {
        paneWidths.value = {
          left: Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, Number(saved.left))),
          middle: Number.isFinite(saved.middle) ? Math.max(280, Number(saved.middle)) : DEFAULT_PANE_WIDTHS.middle
        };
      }
    } catch {
    }
  }
  async function loadSortSettings() {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const generation = ++mount.sortGeneration;
    try {
      const saved = await ctx.storage.get(STORAGE_KEYS.sessionListSort);
      if (!isActiveMount(mount) || generation !== mount.sortGeneration) return;
      sortSettings.value = normalizePartitionSortSettings(saved);
    } catch {
    }
  }
  async function loadDisplaySettings() {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const generation = ++mount.displayGeneration;
    try {
      const [savedLocale, savedFontScale, savedThemeFollowHost, savedPageSize] = await Promise.all([
        ctx.storage.get(STORAGE_KEYS.locale),
        ctx.storage.get(STORAGE_KEYS.fontScale),
        ctx.storage.get(STORAGE_KEYS.themeFollowHost),
        ctx.storage.get(STORAGE_KEYS.pageSize)
      ]);
      if (!isActiveMount(mount) || generation !== mount.displayGeneration) return;
      localeSetting.value = normalizeLocaleSetting(savedLocale);
      localeRef.value = resolveLocale(localeSetting.value, typeof document === "undefined" ? "" : document.documentElement.lang);
      fontScale.value = typeof savedFontScale === "number" && Number.isInteger(savedFontScale) && savedFontScale >= 1 && savedFontScale <= 5 ? savedFontScale : 3;
      updateCompactMode(rootWidth);
      themeFollowHost.value = typeof savedThemeFollowHost === "boolean" ? savedThemeFollowHost : true;
      pageSize.value = PAGE_SIZES.includes(savedPageSize) ? savedPageSize : 50;
    } catch {
    }
  }
  function setVisibleRoot(nextRoot) {
    if (bulkRunning.value) return;
    if (activeMount) activeMount.treeGeneration++;
    visibleRoot.value = normalizePath(nextRoot);
    clearSearchOverlay();
    committedSelection.value = { path: visibleRoot.value, mode: committedSelection.value.mode, sessionId: null };
    applyFilterChange();
    resetTranscript();
    expandedPaths.value = new Set(expandedPaths.value).add(visibleRoot.value);
    persist(perAgentStorageKey(STORAGE_KEYS.treeRoot), visibleRoot.value);
    persistExpandedPaths();
  }
  async function loadPickerDirs(dir) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const requestSeq = ++mount.pickerRequestSeq;
    pickerLoading.value = true;
    pickerError.value = null;
    try {
      const result = await runAgent(["list-dirs", dir], { timeout: 1e4 });
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return;
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "list-dirs failed").message);
      const parsed = JSON.parse(result.stdout);
      if ("error" in parsed) {
        pickerEntries.value = [];
        pickerError.value = parsed.message;
      } else if (Array.isArray(parsed.dirs)) {
        pickerEntries.value = parsed.dirs;
      } else {
        throw new Error("list-dirs returned invalid JSON");
      }
    } catch (caught) {
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return;
      pickerEntries.value = [];
      pickerError.value = caught?.message || t("picker-list-error");
    } finally {
      if (isActiveMount(mount) && requestSeq === mount.pickerRequestSeq) pickerLoading.value = false;
    }
  }
  async function navigatePickerDir(dir) {
    pickerCurrentDir.value = normalizePath(dir);
    await loadPickerDirs(pickerCurrentDir.value);
  }
  function closeRootPicker() {
    if (!showRootPicker.value) return;
    if (activeMount) {
      activeMount.pickerRequestSeq++;
      activeMount.pickerValidationSeq++;
    }
    showRootPicker.value = false;
    pickerLoading.value = false;
    scheduleMountTimeout(() => pickerTriggerRef.value?.focus(), 0);
  }
  function openRootPicker() {
    pickerCurrentDir.value = visibleRoot.value;
    pickerManualPath.value = visibleRoot.value;
    pickerEntries.value = [];
    pickerError.value = null;
    showRootPicker.value = true;
    void loadPickerDirs(pickerCurrentDir.value);
    scheduleMountTimeout(() => pickerInputRef.value?.focus(), 0);
  }
  async function validateAndCommitRoot(candidate) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const requestSeq = ++mount.pickerValidationSeq;
    const isCurrent = () => isActiveMount(mount) && showRootPicker.value && requestSeq === mount.pickerValidationSeq;
    const nextRoot = candidate.trim();
    if (!nextRoot.startsWith("/")) {
      if (isCurrent()) pickerError.value = t("tree-root-absolute-error");
      return;
    }
    try {
      const result = await runAgent(["check-dir", nextRoot], { timeout: 1e4 });
      if (!isCurrent()) return;
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, "check-dir failed").message);
      const checked = JSON.parse(result.stdout);
      if (!checked.exists) {
        pickerError.value = t("picker-path-missing", { path: nextRoot });
        return;
      }
      if (!checked.dir) {
        pickerError.value = t("picker-path-not-directory", { path: nextRoot });
        return;
      }
    } catch (caught) {
      if (isCurrent()) pickerError.value = caught?.message || t("picker-check-error");
      return;
    }
    if (!isCurrent()) return;
    clearError();
    setVisibleRoot(nextRoot);
    closeRootPicker();
  }
  function toggleExpanded(nodePath) {
    if (activeMount) activeMount.treeGeneration++;
    const next = new Set(expandedPaths.value);
    if (next.has(nodePath)) next.delete(nodePath);
    else next.add(nodePath);
    expandedPaths.value = next;
    persistExpandedPaths();
  }
  function selectNode(nodePath) {
    if (bulkRunning.value) return;
    clearSearchOverlay();
    committedSelection.value = { ...committedSelection.value, path: nodePath, sessionId: null };
    applyFilterChange();
    resetTranscript();
    if (compactMode.value) compactView.value = "list";
  }
  function onResizeMove(event) {
    const fsMultiplier = FONT_SCALE_MULTIPLIERS[fontScale.value] || 1;
    const nextWidth = resizeStartWidth + (event.clientX - resizeStartX) / fsMultiplier;
    paneWidths.value = {
      ...paneWidths.value,
      left: Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, nextWidth))
    };
  }
  function stopResize() {
    if (!resizeActive) return;
    resizeActive = false;
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("ccm-is-resizing");
    if (activeMount) activeMount.paneGeneration++;
    persist(STORAGE_KEYS.paneWidths, paneWidths.value);
  }
  function startResize(event) {
    if (compactMode.value) return;
    if (activeMount) activeMount.paneGeneration++;
    resizeActive = true;
    resizeStartX = event.clientX;
    resizeStartWidth = paneWidths.value.left;
    document.body.classList.add("ccm-is-resizing");
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", stopResize);
    event.preventDefault();
  }
  function persistSortSettings() {
    if (activeMount) activeMount.sortGeneration++;
    persist(STORAGE_KEYS.sessionListSort, sortSettings.value);
  }
  function scopedPartitionSessions(partition) {
    return filterSessions(originFilteredSessions.value, {
      partition,
      scopePath: committedSelection.value.path,
      scopeMode: committedSelection.value.mode,
      timeRange: "all",
      branch: "",
      query: ""
    });
  }
  function sessionsForList(partition) {
    const setting = sortSettings.value[partition];
    const effectiveSetting = setting.field === "msgcount" && !messageCountsAvailable() ? { ...setting, field: "idle" } : setting;
    return sortSessions(filterSessions(originFilteredSessions.value, {
      partition,
      scopePath: committedSelection.value.path,
      scopeMode: committedSelection.value.mode,
      timeRange: timeRange.value,
      branch: branchFilter.value,
      query: searchQuery.value,
      createdFrom: createdRange.value.from,
      createdTo: createdRange.value.to,
      lastActiveFrom: lastActiveRange.value.from,
      lastActiveTo: lastActiveRange.value.to
    }), effectiveSetting);
  }
  function messageCountsAvailable() {
    return originFilteredSessions.value.some((session) => session.messageCount !== void 0);
  }
  function branchOptions(partition) {
    return Array.from(new Set(scopedPartitionSessions(partition).map((session) => session.gitBranch || "").filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }
  function clearSearchOverlay(clearQuery = false) {
    if (activeMount) activeMount.searchGeneration++;
    const hadSelectedResult = Boolean(searchOverlay.value?.selectedSessionId);
    searchOverlay.value = null;
    searching.value = false;
    if (clearQuery) searchQuery.value = "";
    if (hadSelectedResult) resetTranscript();
  }
  function setPartition(partition) {
    if (bulkRunning.value) return;
    clearSearchOverlay();
    activePartition.value = partition;
    page.value = 1;
    selection.value = selectionReducer(selection.value, { type: "clear-partition" });
    committedSelection.value = { ...committedSelection.value, sessionId: null };
    resetTranscript();
    if (branchFilter.value && !branchOptions(partition).includes(branchFilter.value)) branchFilter.value = "";
  }
  function updateSortField(field) {
    if (bulkRunning.value) return;
    const partition = activePartition.value;
    sortSettings.value = {
      ...sortSettings.value,
      [partition]: { ...sortSettings.value[partition], field }
    };
    persistSortSettings();
    resetPageAndAnchor();
  }
  function toggleSortDirection() {
    if (bulkRunning.value) return;
    const partition = activePartition.value;
    const current = sortSettings.value[partition];
    sortSettings.value = {
      ...sortSettings.value,
      [partition]: { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
    };
    persistSortSettings();
    resetPageAndAnchor();
  }
  function flashTreePath(rootPath) {
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    transientHighlightPath.value = normalizePath(rootPath);
    if (mount.highlightTimer) clearTimeout(mount.highlightTimer);
    mount.highlightTimer = scheduleMountTimeout(() => {
      transientHighlightPath.value = null;
      mount.highlightTimer = null;
    }, 2e3);
  }
  async function runFullTextSearch() {
    const query = searchQuery.value.trim();
    if (!query || activePartition.value !== "active" || searching.value || bulkRunning.value) return;
    const mount = activeMount;
    if (!isActiveMount(mount)) return;
    const requestGeneration = ++mount.searchGeneration;
    const global = globalSearch.value;
    const scopePath = committedSelection.value.path;
    const requestPartition = activePartition.value;
    const isCurrent = () => isActiveMount(mount) && requestGeneration === mount.searchGeneration && activePartition.value === requestPartition && globalSearch.value === global && committedSelection.value.path === scopePath;
    searching.value = true;
    clearError();
    try {
      const args = ["search", query];
      if (!global) args.push("--scope", scopePath);
      const result = await runAgent(args, { timeout: 3e4 });
      if (!isCurrent()) return;
      if (result.code !== 0) throw new Error(result.stderr || "search failed");
      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) throw new Error("search returned invalid JSON");
      searchOverlay.value = {
        query,
        scopePath: global ? null : scopePath,
        results: parsed.filter((result2) => isSessionVisibleByOrigin(result2.session)),
        selectedSessionId: null
      };
      selection.value = selectionReducer(selection.value, { type: "clear-anchor" });
      committedSelection.value = { ...committedSelection.value, sessionId: null };
      resetTranscript();
    } catch (caught) {
      if (isCurrent()) showError(cliError(caught?.message || String(caught)));
    } finally {
      if (isCurrent()) searching.value = false;
    }
  }
  function handleSearchKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearchOverlay(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runFullTextSearch();
    }
  }
  function commitDateRange(axis, field, value) {
    if (bulkRunning.value) return;
    const current = axis === "created" ? createdRange.value : lastActiveRange.value;
    const normalized = normalizeDateRange({ ...current, [field]: value });
    if (axis === "created") createdRange.value = normalized;
    else {
      const committed = commitAbsoluteLastActiveRange(timeRange.value, normalized);
      lastActiveRange.value = committed.range;
      timeRange.value = committed.timeRange;
    }
    applyFilterChange();
  }
  function setTimeRange(value) {
    if (bulkRunning.value) return;
    const committed = commitDurationTimeRange(value, lastActiveRange.value);
    timeRange.value = committed.timeRange;
    lastActiveRange.value = committed.range;
    applyFilterChange();
  }
  function clearAllFilters() {
    if (bulkRunning.value) return;
    timeRange.value = "all";
    branchFilter.value = "";
    searchQuery.value = "";
    createdRange.value = { from: "", to: "" };
    lastActiveRange.value = { from: "", to: "" };
    clearSearchOverlay();
    applyFilterChange();
  }
  function toggleSelected(session, shift, pageKeys) {
    selection.value = selectionReducer(selection.value, shift ? { type: "shift-range", key: sessionKey(session), pageKeys } : { type: "toggle", key: sessionKey(session) });
  }
  function selectedItems() {
    const selected = selection.value.selected;
    return sessionsForList(activePartition.value).filter((session) => selected.has(sessionKey(session)));
  }
  function expectedBulkSkips(action, items, now = Date.now()) {
    return items.filter((session) => session.live || action === "archive" && now - timestampValue(session.lastActiveAt) < 6e4).length;
  }
  async function executeBulk(action) {
    await coordinateMutation(void 0, async (isCurrent) => {
      const caps = activeCapabilities.value;
      if ((action === "archive" || action === "restore") && !caps.archive) return;
      if (action === "delete" && (!caps.delete || caps.deleteRequiresArchived && activePartition.value !== "archive")) return;
      const confirmationItems = selectedItems();
      if (!confirmationItems.length) return;
      const expectedSkipped = expectedBulkSkips(action, confirmationItems);
      const accepted = await ctx.ui.confirm(t("bulk-confirm", { n: confirmationItems.length, m: expectedSkipped }));
      if (!isCurrent() || !accepted) return;
      const items = selectedItems();
      if (!items.length) return;
      bulkRunning.value = true;
      bulkCancelRequested.value = false;
      bulkResult.value = null;
      bulkRefreshFailed.value = false;
      bulkProgress.value = { completed: 0, total: items.length, title: "" };
      try {
        const outcome = await runBulkSerial({
          action,
          items,
          run: (args) => runAgent(args, { timeout: 3e4 }),
          isCancelled: () => !isCurrent() || bulkCancelRequested.value,
          onProgress: (completed2, total, session) => {
            if (isCurrent()) bulkProgress.value = { completed: completed2, total, title: resolveSessionTitle(session) || t("untitled-session") };
          }
        });
        if (!isCurrent()) return;
        bulkResult.value = outcome;
        const completed = outcome.results.filter((result) => result.status === "done");
        for (const result of completed) {
          if (result.retaggedKey) retagSession(result.session, action === "archive" ? "archive" : "active");
          else removeSession(result.session);
        }
        page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value);
        const succeeded = completed.map((result) => result.key);
        const retagged = Object.fromEntries(completed.flatMap((result) => result.retaggedKey ? [[result.key, result.retaggedKey]] : []));
        selection.value = selectionReducer(selection.value, { type: "reconcile", succeeded, retagged });
        const selectedResult = selectedSession.value ? completed.find((result) => result.key === sessionKey(selectedSession.value)) : void 0;
        if (selectedResult) {
          if (selectedResult.retaggedKey) {
            const partition = action === "archive" ? "archive" : "active";
            selectedSession.value = { ...selectedSession.value, partition };
          } else {
            resetTranscript();
          }
        }
        const committedResult = committedSelection.value.sessionId ? completed.find((result) => result.key === committedSelection.value.sessionId) : void 0;
        if (committedResult) {
          committedSelection.value = {
            ...committedSelection.value,
            sessionId: committedResult.retaggedKey || null
          };
        }
        const refreshed = await loadIndex(true, outcome.rebuildRequired);
        if (!isCurrent()) return;
        bulkRefreshFailed.value = !refreshed;
        bulkProgress.value = { completed: outcome.results.length, total: items.length, title: "" };
      } finally {
        if (isCurrent()) bulkRunning.value = false;
      }
    });
  }
  function renderTreeNode(node, depth) {
    const selected = committedSelection.value.path === node.path;
    const highlighted = transientHighlightPath.value === node.path;
    const expanded = expandedPaths.value.has(node.path);
    const hasChildren = node.children.length > 0;
    const badgeTitle = t("tree-badge", {
      active: node.activeCount,
      archive: node.archiveCount,
      time: formatRelativeTime(node.newestLastActiveAt, t)
    });
    return h("div", { class: "ccm-browser-tree-branch", key: node.path }, [
      h("div", {
        class: [
          "ccm-browser-tree-node",
          selected ? "ccm-browser-tree-node-selected" : "",
          highlighted ? "ccm-browser-tree-node-highlight" : ""
        ],
        style: { paddingLeft: `${8 + depth * 16}px` },
        title: node.path,
        onClick: () => selectNode(node.path)
      }, [
        hasChildren ? h("button", {
          class: "ccm-icon-btn ccm-browser-tree-chevron",
          title: t(expanded ? "collapse-directory" : "expand-directory"),
          "aria-label": t(expanded ? "collapse-directory" : "expand-directory"),
          disabled: bulkRunning.value,
          onClick: (event) => {
            event.stopPropagation();
            toggleExpanded(node.path);
          }
        }, [expanded ? IconChevronDown(14) : IconChevronRight(14)]) : h("span", { class: "ccm-browser-tree-chevron-spacer" }),
        IconFolder(15),
        h("span", { class: "ccm-browser-tree-label" }, node.name),
        h("span", { class: "ccm-browser-tree-badge", title: badgeTitle }, [
          h("span", { class: "ccm-browser-tree-count ccm-browser-tree-count-active" }, t("tree-count-active", { n: node.activeCount })),
          h("span", { class: "ccm-browser-tree-count ccm-browser-tree-count-archive" }, t("tree-count-archive", { n: node.archiveCount })),
          h("span", { class: "ccm-browser-tree-activity" }, formatRelativeTime(node.newestLastActiveAt, t))
        ])
      ]),
      hasChildren && expanded ? h("div", { class: "ccm-browser-tree-children" }, node.children.map((child) => renderTreeNode(child, depth + 1))) : null
    ]);
  }
  function renderTreePane() {
    return h("aside", {
      class: "ccm-browser-pane ccm-browser-tree-pane",
      style: compactMode.value ? void 0 : { width: `calc(${paneWidths.value.left}px * var(--ccm-fs, 1))` }
    }, [
      h("div", { class: "ccm-browser-pane-header" }, [
        h("div", { class: "ccm-browser-pane-title" }, t("workspaces")),
        h("div", { class: "ccm-browser-pane-actions" }, [
          compactMode.value ? h("button", {
            class: "ccm-icon-btn",
            title: t("compact-back-to-sessions"),
            "aria-label": t("compact-back-to-sessions"),
            onClick: () => {
              compactView.value = "list";
            }
          }, [IconChevronLeft(15)]) : null,
          h("button", {
            class: "ccm-icon-btn",
            title: t("navigate-parent"),
            "aria-label": t("navigate-parent"),
            disabled: loading.value || bulkRunning.value || visibleRoot.value === "/",
            onClick: () => setVisibleRoot(parentPath(visibleRoot.value))
          }, [IconArrowLeft(15)]),
          h("button", {
            class: ["ccm-icon-btn", committedSelection.value.mode === "exact" ? "ccm-icon-btn-active" : ""],
            title: t(committedSelection.value.mode === "subtree" ? "scope-exact" : "scope-subtree"),
            "aria-label": t(committedSelection.value.mode === "subtree" ? "scope-exact" : "scope-subtree"),
            disabled: bulkRunning.value,
            onClick: () => {
              clearSearchOverlay();
              committedSelection.value = {
                ...committedSelection.value,
                mode: committedSelection.value.mode === "subtree" ? "exact" : "subtree",
                sessionId: null
              };
              applyFilterChange();
            }
          }, [committedSelection.value.mode === "subtree" ? IconFolder(15) : IconFileText(15)]),
          h("button", {
            class: "ccm-icon-btn",
            title: t("use-selected-folder-as-tree-root"),
            "aria-label": t("use-selected-folder-as-tree-root"),
            disabled: loading.value || bulkRunning.value || !committedSelection.value.path || committedSelection.value.path === visibleRoot.value,
            onClick: () => setVisibleRoot(committedSelection.value.path)
          }, [IconFolderDown(15)]),
          h("button", {
            class: "ccm-icon-btn",
            title: t("change-tree-root"),
            "aria-label": t("change-tree-root"),
            disabled: loading.value || bulkRunning.value,
            ref: (element) => {
              pickerTriggerRef.value = element;
            },
            onClick: openRootPicker
          }, [IconPencil(15)])
        ])
      ]),
      h("div", { class: "ccm-browser-root-path", title: visibleRoot.value }, visibleRoot.value),
      h("div", { class: "ccm-browser-tree-body" }, [
        loading.value ? h("div", { class: "ccm-browser-pane-state" }, t("building-index")) : tree.value ? renderTreeNode(tree.value, 0) : h("div", { class: "ccm-browser-pane-state" }, t("no-indexed-sessions"))
      ])
    ]);
  }
  function renderCardActions(session) {
    const caps = activeCapabilities.value;
    const actions = [];
    if (session.partition === "active") {
      actions.push({ label: t("resume-session"), icon: IconTerminal, action: "resume" });
      if (caps.archive) actions.push({ label: t("archive-session"), icon: IconArchive, action: "archive" });
      if (caps.delete && !caps.deleteRequiresArchived) {
        actions.push({ label: t("delete-session"), icon: IconTrash2, action: "delete" });
      }
    } else {
      if (caps.archive) actions.push({ label: t("restore-session"), icon: IconArchiveRestore, action: "restore" });
      if (caps.delete) actions.push({ label: t("delete-archived-session"), icon: IconTrash2, action: "delete" });
    }
    return h("div", { class: "ccm-browser-session-actions" }, actions.map(({ label, icon, action }) => h("button", {
      class: "ccm-icon-btn ccm-browser-card-action",
      title: label,
      "aria-label": label,
      disabled: bulkRunning.value,
      onClick: (event) => {
        event.stopPropagation();
        if (bulkRunning.value) return;
        if (action === "resume") void resumeSession(session);
        else if (action === "archive") void archiveSession(session);
        else if (action === "restore") void restoreSession(session);
        else void deleteSession(session);
      }
    }, [icon(14)])));
  }
  function renderSessionCard(session, pageKeys = []) {
    const selectedId = searchOverlay.value?.selectedSessionId ?? committedSelection.value.sessionId;
    const selected = selectedId === sessionKey(session);
    const idle = formatRelativeTime(session.lastActiveAt, t);
    const untitled = t("untitled-session");
    const titles = resolveSessionTitles(session);
    const title = titles.primary || untitled;
    const health = session.health === "ok" ? "" : t(`health-${session.health}`);
    return h("article", {
      class: ["ccm-browser-session-card", selected ? "ccm-browser-session-card-selected" : ""],
      key: sessionKey(session),
      role: "button",
      tabindex: 0,
      onClick: () => {
        if (!bulkRunning.value) selectSession(session);
      },
      onKeydown: (event) => {
        if (bulkRunning.value) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectSession(session);
      }
    }, [
      selectMode.value ? h("input", {
        type: "checkbox",
        checked: selection.value.selected.has(sessionKey(session)),
        disabled: bulkRunning.value,
        "aria-label": t("select-session", { title }),
        onClick: (event) => {
          event.stopPropagation();
          toggleSelected(session, event.shiftKey, pageKeys);
        }
      }) : null,
      h("div", { class: "ccm-browser-session-card-topline" }, [
        session.live ? h("span", {
          title: t("session-live-indicator"),
          "aria-label": t("session-live-indicator"),
          style: {
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--ccm-green)",
            boxShadow: "0 0 0 2px var(--ccm-green-bg)",
            flexShrink: "0"
          }
        }) : null,
        h("span", { class: "ccm-browser-session-title", title }, [
          title,
          titles.secondary ? h("span", { class: "ccm-browser-title-sub" }, titles.secondary) : null
        ]),
        session.health !== "ok" ? h("span", {
          class: `ccm-browser-health-badge ccm-browser-health-${session.health}`,
          title: t("session-health-title", { health })
        }, health) : null
      ]),
      h("div", { class: "ccm-browser-session-meta" }, [
        h("span", {}, formatCreatedAt(session.createdAt, locale(), t)),
        h("span", { class: `ccm-browser-session-idle ccm-browser-idle-${idleGrade(session.lastActiveAt)}` }, t("idle-value", { time: idle }))
      ]),
      h("div", { class: "ccm-browser-session-footer" }, [
        h("span", {
          class: "ccm-browser-session-stat",
          title: session.messageCount === void 0 ? t("message-count-unknown") : t(session.messageCount === 1 ? "message-count-one" : "message-count-other", { n: session.messageCount })
        }, [IconHash(12), session.messageCount === void 0 ? "\u2014" : String(session.messageCount)]),
        h("span", { class: "ccm-browser-session-branch", title: session.gitBranch || t("no-git-branch") }, session.gitBranch || t("no-branch")),
        renderCardActions(session)
      ])
    ]);
  }
  function renderSearchResult(result) {
    const session = result.session;
    const selected = searchOverlay.value?.selectedSessionId === sessionKey(session);
    const titles = resolveSessionTitles(session);
    const title = titles.primary || t("untitled-session");
    return h("article", {
      class: ["ccm-browser-session-card ccm-browser-search-result", selected ? "ccm-browser-session-card-selected" : ""],
      key: sessionKey(session),
      role: "button",
      tabindex: 0,
      onClick: () => selectSession(session, true),
      onKeydown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectSession(session, true);
      }
    }, [
      h("div", { class: "ccm-browser-session-card-topline" }, [
        session.live ? h("span", {
          title: t("session-live-indicator"),
          "aria-label": t("session-live-indicator"),
          style: { width: "7px", height: "7px", borderRadius: "50%", background: "var(--ccm-green)", flexShrink: "0" }
        }) : null,
        h("span", { class: "ccm-browser-session-title", title }, [
          title,
          titles.secondary ? h("span", { class: "ccm-browser-title-sub" }, titles.secondary) : null
        ]),
        h("span", { class: "ccm-browser-search-path", title: session.rootPath }, session.rootPath)
      ]),
      h("div", { class: "ccm-browser-search-match" }, result.match),
      h("div", { class: "ccm-browser-session-footer" }, [
        h("span", {
          class: "ccm-browser-session-stat",
          title: session.messageCount === void 0 ? t("message-count-unknown") : t(session.messageCount === 1 ? "message-count-one" : "message-count-other", { n: session.messageCount })
        }, [IconHash(12), session.messageCount === void 0 ? "\u2014" : String(session.messageCount)]),
        h("span", { class: "ccm-browser-session-branch" }, session.gitBranch || t("no-branch"))
      ])
    ]);
  }
  function renderRootPicker() {
    if (!showRootPicker.value) return null;
    const dir = pickerCurrentDir.value;
    const segments = dir.split("/").filter(Boolean);
    const breadcrumbs = [
      h("span", {
        class: "ccm-picker-crumb",
        role: "button",
        tabindex: 0,
        onClick: () => {
          void navigatePickerDir("/");
        },
        onKeydown: (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          void navigatePickerDir("/");
        }
      }, "/")
    ];
    let accumulated = "";
    for (const segment of segments) {
      accumulated += `/${segment}`;
      const target = accumulated;
      breadcrumbs.push(h("span", { class: "ccm-picker-crumb-sep" }, "/"));
      breadcrumbs.push(h("span", {
        class: "ccm-picker-crumb",
        role: "button",
        tabindex: 0,
        onClick: () => {
          void navigatePickerDir(target);
        },
        onKeydown: (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          void navigatePickerDir(target);
        }
      }, segment));
    }
    return h("div", {
      class: "ccm-picker-overlay",
      onKeydown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeRootPicker();
        }
      }
    }, [
      h("div", { class: "ccm-picker-backdrop", onClick: closeRootPicker }),
      h("section", { class: "ccm-picker-panel", role: "dialog", "aria-modal": "true", "aria-label": t("picker-title") }, [
        h("div", { class: "ccm-picker-header" }, [
          h("span", { class: "ccm-picker-title" }, t("picker-title")),
          h("button", {
            class: "ccm-icon-btn ccm-icon-btn-sm",
            title: t("picker-close"),
            "aria-label": t("picker-close"),
            onClick: closeRootPicker
          }, [IconX(14)])
        ]),
        h("div", { class: "ccm-picker-search" }, [
          h("input", {
            class: "ccm-picker-input",
            ref: (element) => {
              pickerInputRef.value = element;
            },
            value: pickerManualPath.value,
            placeholder: t("absolute-path-placeholder"),
            "aria-label": t("picker-manual-path"),
            onInput: (event) => {
              pickerManualPath.value = event.target.value;
            },
            onKeydown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void validateAndCommitRoot(pickerManualPath.value);
              }
            }
          }),
          h("button", {
            class: "ccm-picker-action-btn",
            type: "button",
            onClick: () => {
              void validateAndCommitRoot(pickerManualPath.value);
            }
          }, [IconCheck(14), h("span", {}, t("picker-use-manual-path"))])
        ]),
        h("div", { class: "ccm-picker-current" }, [IconFolder(14), h("span", {}, t("picker-current", { path: dir }))]),
        h("div", { class: "ccm-picker-actions" }, [
          h("button", {
            class: "ccm-picker-action-btn",
            type: "button",
            onClick: () => {
              void validateAndCommitRoot(dir);
            }
          }, [IconCheck(14), h("span", {}, t("picker-select-current", { name: dir.split("/").pop() || "/" }))])
        ]),
        h("div", { class: "ccm-picker-breadcrumb" }, breadcrumbs),
        h("div", { class: "ccm-picker-list" }, pickerLoading.value ? h("div", { class: "ccm-picker-empty" }, [h("span", { class: "ccm-browser-spinner" }), h("span", {}, t("picker-loading"))]) : pickerError.value ? h("div", { class: "ccm-picker-empty", role: "alert" }, t("picker-error", { msg: pickerError.value })) : pickerEntries.value.length ? pickerEntries.value.map((entry) => h("div", {
          class: "ccm-picker-item",
          key: entry.path,
          role: "button",
          tabindex: 0,
          onClick: () => {
            void navigatePickerDir(entry.path);
          },
          onKeydown: (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void navigatePickerDir(entry.path);
          }
        }, [
          IconFolder(14),
          h("div", { class: "ccm-picker-item-info" }, [
            h("span", { class: "ccm-picker-item-name" }, entry.name),
            h("span", { class: "ccm-picker-item-path" }, entry.path)
          ]),
          IconChevronRight(14)
        ])) : h("div", { class: "ccm-picker-empty" }, t("picker-no-subdirs")))
      ])
    ]);
  }
  function renderSettingsPopover() {
    if (!settingsOpen.value) return null;
    return h("div", {
      class: "ccm-browser-settings-popover",
      role: "dialog",
      "aria-label": t("settings"),
      onKeydown: (event) => {
        if (event.key === "Escape") settingsOpen.value = false;
      }
    }, [
      h("label", { class: "ccm-browser-settings-row" }, [
        h("span", { class: "ccm-browser-settings-label" }, t("language")),
        h("select", {
          value: localeSetting.value,
          onChange: (event) => setLocaleSetting(event.target.value)
        }, [
          h("option", { value: "auto" }, t("language-auto")),
          h("option", { value: "zh" }, t("language-zh")),
          h("option", { value: "en" }, t("language-en"))
        ])
      ]),
      h("div", { class: "ccm-browser-settings-row" }, [
        h("span", { class: "ccm-browser-settings-label" }, t("settings-font-scale")),
        h("div", { class: "ccm-browser-settings-stepper" }, [
          h("button", {
            class: "ccm-icon-btn",
            type: "button",
            title: t("settings-decrease-font"),
            "aria-label": t("settings-decrease-font"),
            disabled: fontScale.value <= 1,
            onClick: () => setFontScale(fontScale.value - 1)
          }, "\u2212"),
          h("output", { "aria-live": "polite" }, t("settings-font-scale-value", { n: fontScale.value })),
          h("button", {
            class: "ccm-icon-btn",
            type: "button",
            title: t("settings-increase-font"),
            "aria-label": t("settings-increase-font"),
            disabled: fontScale.value >= 5,
            onClick: () => setFontScale(fontScale.value + 1)
          }, "+")
        ])
      ]),
      h("label", { class: "ccm-browser-settings-row ccm-browser-settings-toggle" }, [
        h("span", { class: "ccm-browser-settings-label" }, t("settings-theme-follow")),
        h("input", {
          type: "checkbox",
          checked: themeFollowHost.value,
          onChange: (event) => setThemeFollowHost(event.target.checked)
        })
      ]),
      activeCapabilities.value.originFilter ? h("label", {
        class: "ccm-browser-settings-row ccm-browser-settings-toggle",
        title: t("hide-scripted-sessions-tooltip")
      }, [
        h("span", { class: "ccm-browser-settings-label" }, t("hide-scripted-sessions")),
        h("input", {
          type: "checkbox",
          checked: hideScriptedSessions.value,
          "aria-label": t("hide-scripted-sessions"),
          onChange: (event) => setHideScriptedSessions(event.target.checked)
        })
      ]) : null
    ]);
  }
  function renderAgentSwitcher() {
    const descriptor = activeDescriptor.value;
    return h("label", {
      class: "ccm-browser-select-control",
      title: descriptor ? agentTooltip(descriptor) : t("agent-switcher")
    }, [
      IconTerminal(13),
      h("select", {
        value: activeAgent.value,
        disabled: loading.value || bulkRunning.value || mutationInFlight || agents.value.length === 0,
        "aria-label": t("agent-switcher"),
        onChange: (event) => {
          void switchAgent(event.target.value);
        }
      }, agents.value.map((agent) => h("option", {
        value: agent.id,
        disabled: !agent.available,
        title: agentTooltip(agent)
      }, agent.degraded ? t("agent-degraded-option", { agent: agentLabel(agent) }) : agentLabel(agent))))
    ]);
  }
  function renderSessionList() {
    const partition = activePartition.value;
    const listedSessions = sessionsForList(partition);
    const overlay = searchOverlay.value;
    const displayedCount = overlay ? overlay.results.length : listedSessions.length;
    const maxPage = Math.max(1, Math.ceil(listedSessions.length / pageSize.value));
    const pageSessions = listedSessions.slice((page.value - 1) * pageSize.value, page.value * pageSize.value);
    const pageKeys = pageSessions.map(sessionKey);
    const allSelected = listedSessions.length > 0 && listedSessions.every((session) => selection.value.selected.has(sessionKey(session)));
    const createdRangeActive = Boolean(createdRange.value.from || createdRange.value.to);
    const undatedExcluded = createdRangeActive ? originFilteredSessions.value.filter((session) => {
      if (!Number.isNaN(Date.parse(session.createdAt))) return false;
      return filterSessions([session], {
        partition,
        scopePath: committedSelection.value.path,
        scopeMode: committedSelection.value.mode,
        timeRange: timeRange.value,
        branch: branchFilter.value,
        query: searchQuery.value,
        lastActiveFrom: lastActiveRange.value.from,
        lastActiveTo: lastActiveRange.value.to
      }).length > 0;
    }).length : 0;
    const archiveSearchTooltip = t("archive-search-p2");
    const caps = activeCapabilities.value;
    const savedSort = sortSettings.value[partition];
    const currentSort = savedSort.field === "msgcount" && !messageCountsAvailable() ? { ...savedSort, field: "idle" } : savedSort;
    const branches = branchOptions(partition);
    const filteredBranches = filterBranchOptions(branches, branchPickerQuery.value);
    const dateRangesActive = Boolean(
      createdRange.value.from || createdRange.value.to || lastActiveRange.value.from || lastActiveRange.value.to
    );
    const anyFilterActive = timeRange.value !== "all" || Boolean(branchFilter.value) || Boolean(searchQuery.value.trim()) || dateRangesActive;
    return h("section", {
      class: "ccm-browser-pane ccm-browser-list-pane",
      style: compactMode.value ? void 0 : { width: `calc(${paneWidths.value.middle}px * var(--ccm-fs, 1))` }
    }, [
      h("div", { class: "ccm-browser-pane-header" }, [
        compactMode.value ? h("button", {
          class: "ccm-icon-btn",
          title: t("compact-show-workspaces"),
          "aria-label": t("compact-show-workspaces"),
          onClick: () => {
            settingsOpen.value = false;
            filtersOpen.value = false;
            branchPickerOpen.value = false;
            compactView.value = "tree";
          }
        }, [IconFolder(15)]) : null,
        renderAgentSwitcher(),
        h("div", { class: "ccm-browser-partition-tabs", role: "tablist", "aria-label": t("session-partition") }, [
          h("button", {
            class: ["ccm-browser-partition-tab", partition === "active" ? "ccm-browser-partition-tab-active" : ""],
            role: "tab",
            "aria-selected": partition === "active",
            disabled: bulkRunning.value,
            onClick: () => setPartition("active")
          }, t("active")),
          caps.archive ? h("button", {
            class: ["ccm-browser-partition-tab", partition === "archive" ? "ccm-browser-partition-tab-active" : ""],
            role: "tab",
            "aria-selected": partition === "archive",
            disabled: bulkRunning.value,
            onClick: () => setPartition("archive")
          }, t("archive")) : null
        ]),
        h("div", { class: "ccm-browser-pane-count" }, String(displayedCount)),
        h("button", {
          class: ["ccm-icon-btn", selectMode.value ? "ccm-icon-btn-active" : ""],
          title: t("select-mode"),
          "aria-label": t("select-mode"),
          disabled: bulkRunning.value || Boolean(overlay),
          onClick: () => {
            selectMode.value = !selectMode.value;
            if (!selectMode.value) selection.value = selectionReducer(selection.value, { type: "clear-partition" });
          }
        }, [IconCheck(15)]),
        h("div", { class: ["ccm-browser-settings", settingsOpen.value ? "ccm-browser-settings-open" : ""] }, [
          h("button", {
            class: ["ccm-icon-btn", settingsOpen.value ? "ccm-icon-btn-active" : ""],
            title: t("settings"),
            "aria-label": t("settings"),
            "aria-expanded": settingsOpen.value,
            disabled: bulkRunning.value,
            onClick: () => {
              settingsOpen.value = !settingsOpen.value;
              if (settingsOpen.value) {
                filtersOpen.value = false;
                branchPickerOpen.value = false;
              }
            }
          }, [IconSettings(15)]),
          renderSettingsPopover()
        ])
      ]),
      h("div", { class: "ccm-browser-list-toolbar" }, [
        h("label", { class: "ccm-browser-search-box", title: partition === "archive" ? archiveSearchTooltip : t("type-filter-search") }, [
          IconSearch(14),
          h("input", {
            id: "session-browser-search-input",
            ref: (element) => {
              searchInputRef.value = element;
            },
            value: searchQuery.value,
            disabled: bulkRunning.value,
            placeholder: t("search-placeholder"),
            "aria-label": t("search-sessions"),
            onInput: (event) => {
              clearSearchOverlay();
              searchQuery.value = event.target.value;
              applyFilterChange();
            },
            onKeydown: handleSearchKeydown
          }),
          searchQuery.value ? h("button", {
            class: "ccm-icon-btn ccm-browser-search-clear",
            title: t("clear-search"),
            "aria-label": t("clear-search"),
            disabled: bulkRunning.value,
            onClick: () => clearSearchOverlay(true)
          }, [IconX(13)]) : null
        ]),
        h("button", {
          class: ["ccm-icon-btn", globalSearch.value ? "ccm-icon-btn-active" : ""],
          title: t(globalSearch.value ? "full-text-global" : "full-text-scoped"),
          "aria-label": t("toggle-global-search"),
          "aria-pressed": globalSearch.value,
          disabled: bulkRunning.value,
          onClick: () => {
            clearSearchOverlay();
            globalSearch.value = !globalSearch.value;
          }
        }, [IconGlobe(14)]),
        h("button", {
          class: "ccm-icon-btn",
          title: partition === "archive" ? archiveSearchTooltip : t("run-full-text-search"),
          "aria-label": t("run-full-text-search"),
          disabled: bulkRunning.value || partition === "archive" || !searchQuery.value.trim() || searching.value,
          onClick: runFullTextSearch
        }, [IconSearch(14)])
      ]),
      h("div", { class: "ccm-browser-filter-row" }, [
        h("label", { class: "ccm-browser-select-control", title: t("sort-sessions") }, [
          IconChevronDown(13),
          h("select", {
            value: currentSort.field,
            disabled: bulkRunning.value,
            "aria-label": t("sort-sessions-by"),
            onChange: (event) => updateSortField(event.target.value)
          }, [
            h("option", { value: "idle" }, t("idle")),
            h("option", { value: "created" }, t("created")),
            messageCountsAvailable() ? h("option", { value: "msgcount" }, t("messages")) : null
          ])
        ]),
        h("button", {
          class: ["ccm-icon-btn ccm-browser-sort-direction", currentSort.direction === "desc" ? "ccm-browser-sort-desc" : ""],
          title: t(currentSort.direction === "asc" ? "sort-ascending" : "sort-descending"),
          "aria-label": t("sort-direction-toggle"),
          disabled: bulkRunning.value,
          onClick: toggleSortDirection
        }, [IconChevronDown(14)]),
        h("label", { class: "ccm-browser-select-control", title: t("filter-by-last-activity") }, [
          IconRefresh(13),
          h("select", {
            value: timeRange.value,
            disabled: bulkRunning.value,
            "aria-label": t("filter-by-time-range"),
            onChange: (event) => setTimeRange(event.target.value)
          }, [
            h("option", { value: "all" }, t("all-time")),
            h("optgroup", { label: t("activity-recent") }, [
              h("option", { value: "24h" }, t("time-24h")),
              h("option", { value: "7d" }, t("time-7d")),
              h("option", { value: "30d" }, t("time-30d"))
            ]),
            h("optgroup", { label: t("activity-stale") }, [
              h("option", { value: "older-15d" }, t("time-older-15d")),
              h("option", { value: "older-30d" }, t("time-older-30d"))
            ])
          ])
        ]),
        h("div", { class: ["ccm-browser-settings ccm-browser-branch-filter", branchPickerOpen.value ? "ccm-browser-settings-open" : ""] }, [
          h("button", {
            class: "ccm-icon-btn ccm-browser-select-control ccm-browser-branch-trigger",
            type: "button",
            title: t("filter-by-git-branch"),
            "aria-label": t("filter-by-git-branch"),
            disabled: bulkRunning.value,
            onClick: () => {
              branchPickerOpen.value = !branchPickerOpen.value;
              if (branchPickerOpen.value) {
                branchPickerQuery.value = "";
                scheduleMountTimeout(() => branchSearchRef.value?.focus(), 0);
                filtersOpen.value = false;
                settingsOpen.value = false;
              }
            }
          }, [IconHash(13), h("span", { class: "ccm-browser-branch-current" }, branchFilter.value || t("all-branches"))]),
          branchPickerOpen.value ? h("div", {
            class: "ccm-browser-settings-popover ccm-browser-branch-popover",
            role: "dialog",
            "aria-label": t("filter-by-git-branch")
          }, [
            h("input", {
              class: "ccm-browser-branch-search",
              type: "search",
              ref: (element) => {
                branchSearchRef.value = element;
              },
              value: branchPickerQuery.value,
              placeholder: t("branch-search-placeholder"),
              "aria-label": t("branch-search-placeholder"),
              disabled: bulkRunning.value,
              onInput: (event) => {
                branchPickerQuery.value = event.target.value;
              },
              onKeydown: (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  branchPickerOpen.value = false;
                } else if (event.key === "Enter" && filteredBranches.length > 0) {
                  event.preventDefault();
                  branchFilter.value = filteredBranches[0];
                  branchPickerOpen.value = false;
                  branchPickerQuery.value = "";
                  applyFilterChange();
                }
              }
            }),
            h("div", { class: "ccm-browser-branch-options", role: "listbox" }, [
              h("button", {
                class: ["ccm-browser-branch-option", branchFilter.value === "" ? "is-active" : ""],
                type: "button",
                role: "option",
                "aria-selected": branchFilter.value === "",
                disabled: bulkRunning.value,
                onClick: () => {
                  branchFilter.value = "";
                  branchPickerOpen.value = false;
                  branchPickerQuery.value = "";
                  applyFilterChange();
                }
              }, t("all-branches")),
              ...filteredBranches.map((branch) => h("button", {
                class: ["ccm-browser-branch-option", branchFilter.value === branch ? "is-active" : ""],
                type: "button",
                role: "option",
                "aria-selected": branchFilter.value === branch,
                disabled: bulkRunning.value,
                title: branch,
                onClick: () => {
                  branchFilter.value = branch;
                  branchPickerOpen.value = false;
                  branchPickerQuery.value = "";
                  applyFilterChange();
                }
              }, branch)),
              filteredBranches.length === 0 ? h("div", { class: "ccm-browser-branch-empty" }, t("no-branch-matches")) : null
            ])
          ]) : null
        ]),
        h("div", { class: ["ccm-browser-settings", filtersOpen.value ? "ccm-browser-settings-open" : ""] }, [
          h("button", {
            class: [
              "ccm-icon-btn ccm-browser-text-control",
              filtersOpen.value ? "ccm-icon-btn-active" : "",
              dateRangesActive ? "ccm-browser-has-active" : ""
            ],
            title: t("date-filters"),
            "aria-label": t("date-filters"),
            disabled: bulkRunning.value,
            onClick: () => {
              filtersOpen.value = !filtersOpen.value;
              if (filtersOpen.value) {
                settingsOpen.value = false;
                branchPickerOpen.value = false;
              }
            }
          }, t("date-filter-short")),
          filtersOpen.value ? h("div", { class: "ccm-browser-settings-popover", role: "dialog", "aria-label": t("date-filters") }, [
            h("fieldset", {}, [
              h("legend", {}, t("created")),
              h("label", {}, [t("date-from"), h("input", { type: "date", disabled: bulkRunning.value, value: createdRange.value.from, onChange: (event) => commitDateRange("created", "from", event.target.value) })]),
              h("label", {}, [t("date-to"), h("input", { type: "date", disabled: bulkRunning.value, value: createdRange.value.to, onChange: (event) => commitDateRange("created", "to", event.target.value) })])
            ]),
            h("fieldset", {}, [
              h("legend", {}, t("last-active")),
              h("label", {}, [t("date-from"), h("input", { type: "date", disabled: bulkRunning.value, value: lastActiveRange.value.from, onChange: (event) => commitDateRange("lastActive", "from", event.target.value) })]),
              h("label", {}, [t("date-to"), h("input", { type: "date", disabled: bulkRunning.value, value: lastActiveRange.value.to, onChange: (event) => commitDateRange("lastActive", "to", event.target.value) })])
            ])
          ]) : null
        ]),
        anyFilterActive ? h("button", {
          class: "ccm-icon-btn ccm-browser-text-control ccm-browser-secondary-control ccm-browser-reset-filters",
          type: "button",
          title: t("clear-all-filters"),
          "aria-label": t("clear-all-filters"),
          disabled: bulkRunning.value,
          onClick: clearAllFilters
        }, [IconX(13)]) : null
      ]),
      h("div", {
        class: ["ccm-browser-scope-summary", overlay ? "ccm-browser-search-breadcrumb" : ""],
        title: overlay?.scopePath || committedSelection.value.path
      }, [
        h("span", {}, overlay ? t("search") : t(committedSelection.value.mode === "subtree" ? "subtree" : "exact-directory")),
        h("span", { class: "ccm-browser-scope-path" }, overlay ? `${overlay.scopePath ? overlay.scopePath : t("global")} \xB7 \u201C${overlay.query}\u201D` : committedSelection.value.path),
        overlay ? h("button", {
          class: "ccm-icon-btn",
          title: t("leave-full-text-results"),
          "aria-label": t("leave-full-text-results"),
          disabled: bulkRunning.value,
          onClick: () => clearSearchOverlay(true)
        }, [IconX(13)]) : null
      ]),
      h("div", { class: "ccm-browser-session-list" }, [
        loading.value ? h("div", { class: "ccm-browser-pane-state" }, t("loading-sessions")) : searching.value ? h("div", { class: "ccm-browser-pane-state" }, t("searching-session-text")) : overlay ? overlay.results.length ? overlay.results.map(renderSearchResult) : h("div", { class: "ccm-browser-pane-state" }, t("no-full-text-matches")) : pageSessions.length ? pageSessions.map((session) => renderSessionCard(session, pageKeys)) : h("div", { class: "ccm-browser-pane-state" }, t("no-matching-sessions", { partition: t(partition) }))
      ]),
      !overlay && selectMode.value ? h("div", { class: "ccm-browser-filter-row ccm-browser-select-bar" }, [
        h("button", {
          class: "ccm-icon-btn ccm-browser-action-control",
          disabled: bulkRunning.value || listedSessions.length === 0,
          onClick: () => {
            selection.value = selectionReducer(selection.value, allSelected ? { type: "clear-partition" } : { type: "snapshot-all", keys: listedSessions.map(sessionKey) });
          }
        }, [IconCheck(13), t(allSelected ? "deselect-all" : "select-all-filtered", { n: listedSessions.length })]),
        h("span", { class: "ccm-browser-selected-count" }, t("selected-count", { n: selection.value.selected.size })),
        selection.value.selected.size > 0 ? h("button", {
          class: "ccm-icon-btn ccm-browser-clear-selection",
          title: t("clear-selection"),
          "aria-label": t("clear-selection"),
          disabled: bulkRunning.value,
          onClick: () => {
            selection.value = selectionReducer(selection.value, { type: "clear-partition" });
          }
        }, [IconX(13)]) : null
      ]) : null,
      !overlay && selection.value.selected.size ? h("div", { class: "ccm-browser-filter-row ccm-browser-bulk-toolbar", role: "toolbar", "aria-label": t("bulk-actions") }, [
        caps.archive && partition === "active" ? h("button", { class: "ccm-icon-btn ccm-browser-action-control", disabled: bulkRunning.value, onClick: () => {
          void executeBulk("archive");
        } }, [IconArchive(13), t("bulk-archive", { n: selectedItems().length })]) : null,
        caps.archive && partition === "archive" ? h("button", { class: "ccm-icon-btn ccm-browser-action-control", disabled: bulkRunning.value, onClick: () => {
          void executeBulk("restore");
        } }, [IconArchiveRestore(13), t("bulk-restore", { n: selectedItems().length })]) : null,
        caps.delete && (partition === "archive" || !caps.deleteRequiresArchived) ? h("button", { class: "ccm-icon-btn ccm-browser-action-control ccm-browser-danger-control", disabled: bulkRunning.value, onClick: () => {
          void executeBulk("delete");
        } }, [IconTrash2(13), t("bulk-delete", { n: selectedItems().length })]) : null,
        bulkRunning.value ? h("button", { class: "ccm-icon-btn ccm-browser-action-control ccm-browser-secondary-control", onClick: () => {
          bulkCancelRequested.value = true;
        } }, [IconX(13), t("cancel")]) : null
      ]) : null,
      bulkRunning.value ? h("div", { role: "status" }, [
        h("progress", { value: bulkProgress.value.completed, max: bulkProgress.value.total }),
        h("span", {}, t("bulk-progress", { n: bulkProgress.value.completed, total: bulkProgress.value.total, title: bulkProgress.value.title }))
      ]) : null,
      bulkResult.value ? h("div", { class: "ccm-browser-bulk-result", role: "status" }, [
        h("div", { class: "ccm-browser-bulk-result-summary" }, [
          h("span", {}, t("bulk-result", { done: bulkResult.value.done, failed: bulkResult.value.failed, skipped: bulkResult.value.skipped })),
          h("button", {
            class: "ccm-icon-btn",
            title: t("dismiss-result"),
            "aria-label": t("dismiss-result"),
            onClick: () => {
              bulkResult.value = null;
              bulkRefreshFailed.value = false;
            }
          }, [IconX(13)])
        ]),
        bulkRefreshFailed.value ? h("div", {}, t("bulk-refresh-stale")) : null,
        ...bulkResult.value.results.filter((result) => result.status !== "done").map((result) => h("div", { key: result.key }, [
          h("strong", {}, resolveSessionTitle(result.session) || t("untitled-session")),
          h("code", {}, result.session.id),
          h("span", {}, result.reason || "")
        ]))
      ]) : null,
      !overlay ? h("footer", { class: "ccm-browser-filter-row ccm-browser-pager" }, [
        h("button", { class: "ccm-icon-btn", title: t("previous-page"), "aria-label": t("previous-page"), disabled: bulkRunning.value || page.value <= 1, onClick: () => setPage(page.value - 1, listedSessions.length) }, [IconChevronLeft(15)]),
        h("span", {}, t("page-indicator", { page: page.value, pages: maxPage })),
        h("button", { class: "ccm-icon-btn", title: t("next-page"), "aria-label": t("next-page"), disabled: bulkRunning.value || page.value >= maxPage, onClick: () => setPage(page.value + 1, listedSessions.length) }, [IconChevronRight(15)]),
        h("label", { class: "ccm-browser-pager-size", "aria-label": t("page-size") }, [
          h("span", { class: "ccm-browser-pager-size-label" }, t("page-size")),
          h("select", {
            value: pageSize.value,
            disabled: bulkRunning.value,
            onChange: (event) => {
              if (activeMount) activeMount.displayGeneration++;
              pageSize.value = Number(event.target.value);
              persist(STORAGE_KEYS.pageSize, pageSize.value);
              page.value = clampPage(page.value, listedSessions.length, pageSize.value);
              selection.value = selectionReducer(selection.value, { type: "clear-anchor" });
            }
          }, PAGE_SIZES.map((size) => h("option", { value: size }, String(size))))
        ]),
        undatedExcluded ? h("span", {}, t("undated-excluded", { n: undatedExcluded })) : null
      ]) : null
    ]);
  }
  function getToolIcon(name) {
    switch (name) {
      case "Bash":
        return IconTerminal(14);
      case "Read":
        return IconEye(14);
      case "Edit":
      case "Write":
        return IconPencil(14);
      case "Grep":
      case "Glob":
        return IconSearch(14);
      case "Agent":
        return IconZap(14);
      default:
        return IconFileText(14);
    }
  }
  function renderToolDetail(tool) {
    const rows = [
      h("div", { class: "ccm-browser-tool-detail-row" }, [
        h("span", { class: "ccm-browser-tool-detail-label" }, t("summary")),
        h("code", {}, tool.summary || tool.name)
      ])
    ];
    if (tool.filePath) rows.push(h("div", { class: "ccm-browser-tool-detail-row" }, [
      h("span", { class: "ccm-browser-tool-detail-label" }, t("file")),
      h("code", {}, tool.filePath)
    ]));
    if (tool.oldString !== void 0) rows.push(h("div", { class: "ccm-browser-tool-detail-section" }, [
      h("span", { class: "ccm-browser-tool-detail-label" }, t("before")),
      h("pre", {}, tool.oldString)
    ]));
    if (tool.newString !== void 0) rows.push(h("div", { class: "ccm-browser-tool-detail-section" }, [
      h("span", { class: "ccm-browser-tool-detail-label" }, t(tool.replaceAll ? "after-replace-all" : "after")),
      h("pre", {}, tool.newString)
    ]));
    if (tool.content !== void 0) rows.push(h("div", { class: "ccm-browser-tool-detail-section" }, [
      h("span", { class: "ccm-browser-tool-detail-label" }, t("content")),
      h("pre", {}, tool.content)
    ]));
    return rows;
  }
  function renderToolCard(messageKey, tool, index) {
    const key = `${messageKey}-${index}`;
    const expanded = expandedTools.value.has(key);
    const toggle = () => toggleTool(messageKey, index);
    return h("div", { class: ["ccm-browser-tool-card", expanded ? "ccm-browser-tool-card-expanded" : ""], key }, [
      h("div", {
        class: "ccm-browser-tool-header",
        role: "button",
        tabindex: 0,
        "aria-expanded": expanded,
        onClick: toggle,
        onKeydown: (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        }
      }, [
        h("span", { class: "ccm-browser-tool-icon" }, getToolIcon(tool.name)),
        h("span", { class: "ccm-browser-tool-name" }, tool.name),
        h("span", { class: "ccm-browser-tool-summary" }, tool.summary || tool.name),
        h("span", { class: "ccm-browser-tool-chevron" }, expanded ? IconChevronDown(12) : IconChevronRight(12))
      ]),
      expanded ? h("div", { class: "ccm-browser-tool-detail" }, renderToolDetail(tool)) : null
    ]);
  }
  function renderTranscriptMessage(message, index) {
    const isUser = message.role === "user";
    const messageKey = message.uuid || `${selectedSession.value?.id || "session"}-${index}`;
    return h("article", {
      class: ["ccm-browser-message", isUser ? "ccm-browser-message-user" : "ccm-browser-message-assistant"],
      key: messageKey
    }, [
      h("div", { class: "ccm-browser-message-gutter" }, [
        h("div", { class: ["ccm-browser-avatar", isUser ? "ccm-browser-avatar-user" : "ccm-browser-avatar-assistant"] }, [
          isUser ? IconUser(16) : IconClaude(16)
        ])
      ]),
      h("div", { class: "ccm-browser-message-body" }, [
        h("div", { class: "ccm-browser-message-meta" }, [
          h("span", { class: "ccm-browser-message-role" }, t(isUser ? "you" : "claude")),
          message.model ? h("span", { class: "ccm-browser-model-tag" }, message.model) : null,
          h("span", { class: "ccm-browser-message-time" }, formatTranscriptTime(message.timestamp, locale()))
        ].filter(Boolean)),
        h("div", { class: "ccm-browser-message-content" }, renderMarkdown(message.content)),
        message.toolUses?.length ? h("div", { class: "ccm-browser-tools-section" }, message.toolUses.map((tool, toolIndex) => renderToolCard(messageKey, tool, toolIndex))) : null
      ])
    ]);
  }
  function renderMarkdown(content) {
    if (!content) return [h("span", { class: "ccm-browser-muted" }, t("no-content"))];
    const cleaned = content.replace(/<\/?command-(?:message|name)[^>]*>/g, "");
    const lines = cleaned.split("\n");
    const elements = [];
    let inCode = false;
    let codeLines = [];
    let codeLang = "";
    let codeKey = 0;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.startsWith("```")) {
        if (inCode) {
          elements.push(renderCodeBlock(codeLines.join("\n"), codeLang, codeKey++));
          codeLines = [];
          codeLang = "";
          inCode = false;
        } else {
          inCode = true;
          codeLang = line.slice(3).trim();
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }
      if (line.startsWith("# ")) elements.push(h("h1", { class: "ccm-browser-md-h1", key: index }, renderInline(line.slice(2))));
      else if (line.startsWith("## ")) elements.push(h("h2", { class: "ccm-browser-md-h2", key: index }, renderInline(line.slice(3))));
      else if (line.startsWith("### ")) elements.push(h("h3", { class: "ccm-browser-md-h3", key: index }, renderInline(line.slice(4))));
      else if (line.startsWith("> ")) elements.push(h("blockquote", { class: "ccm-browser-md-quote", key: index }, renderInline(line.slice(2))));
      else if (/^[-*]\s/.test(line)) elements.push(h("div", { class: "ccm-browser-md-li", key: index }, renderInline(line.replace(/^[-*]\s/, ""))));
      else if (/^\d+\.\s/.test(line)) elements.push(h("div", { class: "ccm-browser-md-li ccm-browser-md-oli", key: index }, renderInline(line.replace(/^\d+\.\s/, ""))));
      else if (line === "---" || line === "***") elements.push(h("hr", { class: "ccm-browser-md-hr", key: index }));
      else if (line.trim() !== "") elements.push(h("p", { class: "ccm-browser-md-p", key: index }, renderInline(line)));
    }
    if (inCode && codeLines.length) elements.push(renderCodeBlock(codeLines.join("\n"), codeLang, codeKey));
    return elements.length ? elements : [h("span", { class: "ccm-browser-muted" }, t("empty"))];
  }
  function renderCodeBlock(code, lang, key) {
    return h("div", { class: "ccm-browser-code-block", key: `code-${key}` }, [
      h("div", { class: "ccm-browser-code-toolbar" }, [
        h("span", { class: "ccm-browser-code-lang" }, lang || t("code")),
        h("button", {
          class: "ccm-icon-btn ccm-browser-code-copy",
          title: t("copy-code"),
          "aria-label": t("copy-code"),
          onClick: () => {
            navigator.clipboard.writeText(code).catch(() => {
            });
          }
        }, [IconCopy(13)])
      ]),
      h("pre", { class: "ccm-browser-code-pre" }, [h("code", { class: lang ? `language-${lang}` : "" }, code)])
    ]);
  }
  function renderInline(text) {
    const parts = [];
    let remaining = text;
    let keyCounter = 0;
    while (remaining.length > 0) {
      const codeMatch = remaining.match(/`([^`]+)`/);
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
      const candidates = [
        codeMatch ? { type: "code", idx: codeMatch.index, match: codeMatch } : null,
        boldMatch ? { type: "bold", idx: boldMatch.index, match: boldMatch } : null,
        italicMatch ? { type: "italic", idx: italicMatch.index, match: italicMatch } : null,
        linkMatch ? { type: "link", idx: linkMatch.index, match: linkMatch } : null
      ].filter(Boolean);
      if (!candidates.length) {
        parts.push(remaining);
        break;
      }
      candidates.sort((left, right) => left.idx - right.idx);
      const first = candidates[0];
      if (first.idx > 0) parts.push(remaining.slice(0, first.idx));
      const key = keyCounter++;
      if (first.type === "code") parts.push(h("code", { class: "ccm-browser-inline-code", key }, first.match[1]));
      else if (first.type === "bold") parts.push(h("strong", { key }, first.match[1]));
      else if (first.type === "italic") parts.push(h("em", { key }, first.match[1]));
      else if (isSafeTranscriptHref(first.match[2])) parts.push(h("a", { class: "ccm-browser-link", href: first.match[2], target: "_blank", rel: "noopener", key }, first.match[1]));
      else parts.push(first.match[1]);
      remaining = remaining.slice(first.idx + first.match[0].length);
    }
    return parts;
  }
  function renderDetailPane() {
    const session = selectedSession.value;
    if (!session) return h("main", { class: "ccm-browser-pane ccm-browser-detail-pane" }, [
      h("div", { class: "ccm-browser-pane-header" }, [
        compactMode.value ? h("button", {
          class: "ccm-icon-btn",
          title: t("compact-back-to-sessions"),
          "aria-label": t("compact-back-to-sessions"),
          onClick: () => {
            compactView.value = "list";
          }
        }, [IconChevronLeft(15)]) : null,
        h("div", { class: "ccm-browser-pane-title" }, t("session-pane-title"))
      ]),
      h("div", { class: "ccm-browser-detail-placeholder" }, t("session-select-prompt"))
    ]);
    const caps = activeCapabilities.value;
    const unhealthy = session.health === "empty" || session.health === "truncated";
    return h("main", { class: "ccm-browser-pane ccm-browser-detail-pane" }, [
      h("div", { class: "ccm-browser-pane-header ccm-browser-transcript-header" }, [
        compactMode.value ? h("button", {
          class: "ccm-icon-btn ccm-browser-transcript-back",
          title: t("compact-back-to-sessions"),
          "aria-label": t("compact-back-to-sessions"),
          onClick: () => {
            compactView.value = "list";
          }
        }, [IconChevronLeft(15)]) : null,
        h("div", { class: "ccm-browser-transcript-identity" }, [
          h("div", { class: "ccm-browser-transcript-id-row" }, [
            h("code", { class: "ccm-browser-transcript-id", title: session.id }, session.id),
            h("button", {
              class: "ccm-icon-btn ccm-browser-transcript-copy-id",
              title: t(copiedSessionId.value ? "session-id-copied" : "copy-session-id"),
              "aria-label": t(copiedSessionId.value ? "session-id-copied" : "copy-session-id"),
              onClick: copySessionId
            }, [copiedSessionId.value ? IconCheck(13) : IconCopy(13)]),
            copiedSessionId.value ? h("span", { class: "ccm-browser-copy-feedback", "aria-live": "polite" }, t("copied")) : null
          ]),
          h("div", { class: "ccm-browser-transcript-cwd", title: session.rootPath }, session.rootPath),
          h("div", { class: "ccm-browser-transcript-span", title: `${session.createdAt} \u2192 ${session.lastActiveAt}` }, formatSessionSpan(session.createdAt, session.lastActiveAt, locale(), t))
        ]),
        h("div", { class: "ccm-browser-pane-actions" }, [
          session.partition === "active" || caps.archive ? h("button", {
            class: "ccm-icon-btn",
            title: t("resume-session"),
            "aria-label": t("resume-session"),
            disabled: bulkRunning.value,
            onClick: () => {
              void resumeSession(session);
            }
          }, [IconTerminal(15)]) : null,
          h("button", {
            class: "ccm-icon-btn",
            title: t("copy-resume-command"),
            "aria-label": t("copy-resume-command"),
            onClick: () => {
              void copyResumeCommand(session);
            }
          }, [IconCopy(15)])
        ])
      ]),
      h("div", {
        class: "ccm-browser-transcript-body",
        ref: (element) => {
          transcriptScrollRef.value = element;
        }
      }, [
        unhealthy ? h(
          "div",
          { class: "ccm-browser-transcript-notice", role: "status" },
          session.health === "empty" ? t("transcript-empty") : t("transcript-truncated")
        ) : null,
        transcriptError.value ? h("div", { class: "ccm-browser-transcript-error", role: "alert" }, [
          h("span", {}, transcriptError.value),
          h("button", {
            class: "ccm-icon-btn",
            title: t("dismiss-transcript-error"),
            "aria-label": t("dismiss-transcript-error"),
            onClick: () => {
              transcriptError.value = null;
            }
          }, [IconX(13)])
        ]) : null,
        transcriptLoading.value ? h("div", { class: "ccm-browser-transcript-loading", role: "status" }, [
          h("span", { class: "ccm-browser-spinner", "aria-hidden": "true" }),
          h("span", {}, t("loading-transcript"))
        ]) : null,
        !transcriptLoading.value && !transcriptError.value && transcriptMessages.value.length === 0 ? h("div", { class: "ccm-browser-transcript-empty" }, t("no-transcript-messages")) : transcriptMessages.value.map(renderTranscriptMessage)
      ])
    ]);
  }
  return {
    component: {
      setup() {
        const mount = createMountContext();
        activeMount = mount;
        ctx.onMounted(() => {
          mount.active = true;
          activeMount = mount;
          if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
            mount.localeObserver = new MutationObserver(() => {
              if (isActiveMount(mount) && localeSetting.value === "auto") {
                localeRef.value = resolveLocale("auto", document.documentElement.lang);
              }
            });
            mount.localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
          }
          if (rootRef.value) observeRootElement(mount, rootRef.value);
          const preserveState = hasMounted;
          hasMounted = true;
          void loadPaneWidths();
          void loadSortSettings();
          void (async () => {
            await loadDisplaySettings();
            if (isActiveMount(mount)) await initializeAgents(preserveState);
          })();
        });
        ctx.onUnmounted(() => {
          bulkCancelRequested.value = true;
          bulkRunning.value = false;
          loading.value = false;
          transcriptLoading.value = false;
          searching.value = false;
          pickerLoading.value = false;
          stopResize();
          mount.active = false;
          mount.indexGeneration++;
          mount.searchGeneration++;
          mount.transcriptLoadToken++;
          mount.pickerRequestSeq++;
          mount.pickerValidationSeq++;
          mount.rootResizeObserver?.disconnect();
          mount.localeObserver?.disconnect();
          for (const dispose of mount.disposers) dispose();
          mount.disposers.clear();
          mount.highlightTimer = null;
          mount.copiedTimer = null;
          mount.transcriptFrame = null;
          if (activeMount === mount) activeMount = null;
        });
        return {};
      },
      render() {
        return h("div", {
          class: [
            "ccm-root ccm-browser-root",
            themeFollowHost.value ? "ccm-theme-host" : "ccm-theme-builtin",
            compactMode.value ? "ccm-browser-compact" : "",
            compactMode.value ? `ccm-browser-view-${compactView.value}` : "",
            kbAvoid.value ? "ccm-browser-kb-avoid" : ""
          ],
          ref: setRootElement,
          style: {
            "--ccm-fs": String(FONT_SCALE_MULTIPLIERS[fontScale.value] || 1),
            ...kbAvoid.value ? { "--ccm-kb-w": `${kbAvoidW.value}px`, "--ccm-kb-h": `${kbAvoidH.value}px` } : {}
          }
        }, [
          settingsOpen.value || filtersOpen.value || branchPickerOpen.value ? h("div", {
            class: "ccm-browser-settings-scrim",
            "aria-hidden": "true",
            onClick: () => {
              settingsOpen.value = false;
              filtersOpen.value = false;
              branchPickerOpen.value = false;
            }
          }) : null,
          error.value ? h("div", { class: "ccm-browser-error", role: "alert" }, [
            h("span", {}, error.value),
            errorAction.value ? h("button", {
              class: "ccm-primary-btn ccm-primary-btn-sm",
              onClick: () => {
                const action = errorAction.value;
                clearError();
                action?.run();
              }
            }, errorAction.value.label) : null,
            h("button", {
              class: "ccm-icon-btn",
              title: t("dismiss-error"),
              "aria-label": t("dismiss-error"),
              onClick: clearError
            }, [IconX(14)])
          ]) : null,
          h("div", { class: "ccm-browser-layout" }, [
            renderTreePane(),
            compactMode.value ? null : h("div", {
              class: "ccm-browser-resize-handle",
              role: "separator",
              "aria-label": t("resize-workspace-tree"),
              "aria-orientation": "vertical",
              onPointerdown: startResize
            }),
            renderSessionList(),
            renderDetailPane()
          ]),
          renderRootPicker()
        ]);
      }
    }
  };
}
export {
  DEFAULT_PARTITION_SORT,
  PAGE_SIZES,
  TRANSCRIPT_BATCH_SIZE,
  activate,
  clampPage,
  cleanFirstPrompt,
  commitAbsoluteLastActiveRange,
  commitDurationTimeRange,
  dateRangeMatches,
  deepestCommonAncestor,
  deriveSessionPathTree,
  filterBranchOptions,
  filterSessions,
  isSafeTranscriptHref,
  localDateBounds,
  nextTranscriptBatchEnd,
  normalizeDateRange,
  normalizePartitionSortSettings,
  normalizeStoredExpandedPaths,
  normalizeStoredTreeRoot,
  resolveSessionTitle,
  resolveSessionTitles,
  runBulkSerial,
  selectionReducer,
  sessionKey,
  shQuote,
  sortSessions
};

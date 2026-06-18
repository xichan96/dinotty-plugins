// src/diff.ts
function aggregateFileChanges(messages) {
  const map = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (!msg.toolUses) continue;
    for (const tu of msg.toolUses) {
      if ((tu.name === "Edit" || tu.name === "Write") && tu.filePath) {
        const existing = map.get(tu.filePath);
        if (tu.name === "Edit" && tu.oldString !== void 0 && tu.newString !== void 0) {
          const stats = computeEditStats(tu.oldString, tu.newString);
          if (existing) {
            existing.additions += stats.additions;
            existing.deletions += stats.deletions;
          } else {
            map.set(tu.filePath, {
              filePath: tu.filePath,
              additions: stats.additions,
              deletions: stats.deletions,
              toolType: "Edit"
            });
          }
        } else if (tu.name === "Write" && tu.content !== void 0) {
          const stats = computeWriteStats(tu.content);
          if (existing) {
            existing.additions += stats.additions;
            existing.deletions += stats.deletions;
          } else {
            map.set(tu.filePath, {
              filePath: tu.filePath,
              additions: stats.additions,
              deletions: stats.deletions,
              toolType: "Write"
            });
          }
        }
      }
    }
  }
  return Array.from(map.values());
}
function computeEditStats(oldString, newString) {
  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");
  return {
    additions: newLines.length,
    deletions: oldLines.length
  };
}
function computeWriteStats(content) {
  const lines = content.split("\n");
  return {
    additions: lines.length,
    deletions: 0
  };
}
function computeEditDiff(oldString, newString) {
  const aLines = oldString.split("\n");
  const bLines = newString.split("\n");
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i2 = n - 1; i2 >= 0; i2--) {
    for (let j2 = m - 1; j2 >= 0; j2--) {
      dp[i2][j2] = aLines[i2] === bLines[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const result = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: "ctx", text: aLines[i] });
      i++;
      j++;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "del", text: aLines[i] });
      i++;
    } else {
      result.push({ type: "add", text: bLines[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "del", text: aLines[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: bLines[j] });
    j++;
  }
  return result;
}

// src/history.ts
async function listProjects(exec) {
  const res = await exec(["list-projects"]);
  if (res.code !== 0) throw new Error(res.stderr || "list-projects failed");
  return JSON.parse(res.stdout);
}
async function listSessions(exec, encodedPath) {
  const res = await exec(["list-sessions", encodedPath]);
  if (res.code !== 0) throw new Error(res.stderr || "list-sessions failed");
  return JSON.parse(res.stdout);
}
async function readSession(exec, encodedPath, sessionId) {
  const res = await exec(["read-session", encodedPath, sessionId]);
  if (res.code !== 0) throw new Error(res.stderr || "read-session failed");
  return JSON.parse(res.stdout);
}
async function searchSessions(exec, query) {
  const res = await exec(["search", query]);
  if (res.code !== 0) throw new Error(res.stderr || "search failed");
  return JSON.parse(res.stdout);
}
async function listRecentSessions(exec, limit = 30) {
  const res = await exec(["list-recent", String(limit)], { timeout: 15e3 });
  if (res.code !== 0) throw new Error(res.stderr || "list-recent failed");
  return JSON.parse(res.stdout);
}
async function listSkills(exec) {
  const res = await exec(["list-skills"]);
  if (res.code !== 0) throw new Error(res.stderr || "list-skills failed");
  return JSON.parse(res.stdout);
}
async function listDirs(exec, dirPath) {
  const res = await exec(["list-dirs", dirPath], { timeout: 5e3 });
  if (res.code !== 0) return [];
  try {
    return JSON.parse(res.stdout);
  } catch {
    return [];
  }
}

// src/claude.ts
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
async function createConversation(exec, prompt, options) {
  const sessionId = generateUUID();
  const res = await exec(["claude-call", "--new", sessionId, prompt], { timeout: 3e5, cwd: options?.cwd });
  if (res.code !== 0) {
    throw new Error(res.stderr || `claude exited with code ${res.code}`);
  }
  try {
    const data = JSON.parse(res.stdout);
    return {
      sessionId: data.sessionId || sessionId,
      response: data.response || "",
      costUsd: data.costUsd || 0
    };
  } catch {
    return { sessionId, response: res.stdout.trim(), costUsd: 0 };
  }
}
async function continueConversation(exec, sessionId, prompt, options) {
  const res = await exec(["claude-call", "--resume", sessionId, prompt], { timeout: 3e5, cwd: options?.cwd });
  if (res.code !== 0) {
    throw new Error(res.stderr || `claude exited with code ${res.code}`);
  }
  try {
    const data = JSON.parse(res.stdout);
    return {
      response: data.response || "",
      costUsd: data.costUsd || 0
    };
  } catch {
    return { response: res.stdout.trim(), costUsd: 0 };
  }
}

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
  "file-text": [
    ["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }],
    ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
    ["path", { d: "M10 12h4" }],
    ["path", { d: "M10 16h4" }]
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
function IconPlus(size) {
  return renderIcon(ICON_PATHS.plus, size);
}
function IconX(size) {
  return renderIcon(ICON_PATHS.x, size);
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
function IconSend(size) {
  return renderIcon(ICON_PATHS.send, size);
}
function IconMenu(size) {
  return renderIcon(ICON_PATHS.menu, size);
}
function IconCheck(size) {
  return renderIcon(ICON_PATHS.check, size);
}
function IconFolder(size) {
  return renderIcon(ICON_PATHS.folder, size);
}
function IconZap(size) {
  return renderIcon(ICON_PATHS.zap, size);
}
function IconTerminal(size) {
  return renderIcon(ICON_PATHS.terminal, size);
}
function IconFileText(size) {
  return renderIcon(ICON_PATHS["file-text"], size);
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

// src/ui.ts
function activate(ctx) {
  const h = ctx.h;
  initIcons(h);
  const view = ctx.ref("browse");
  const projects = ctx.ref([]);
  const sessions = ctx.ref([]);
  const selectedProject = ctx.ref(null);
  const selectedProjectEncoded = ctx.ref(null);
  const activeSession = ctx.ref(null);
  const messages = ctx.ref([]);
  const searchQuery = ctx.ref("");
  const searchResults = ctx.ref([]);
  const searching = ctx.ref(false);
  const inputText = ctx.ref("");
  const sending = ctx.ref(false);
  const loading = ctx.ref(false);
  const costTotal = ctx.ref(0);
  const error = ctx.ref(null);
  const sidebarOpen = ctx.ref(true);
  const sidebarTab = ctx.ref("history");
  const chatScrollRef = ctx.ref(null);
  const expandedTools = ctx.ref(/* @__PURE__ */ new Set());
  const recentSessions = ctx.ref([]);
  const showCmdPalette = ctx.ref(false);
  const cmdFilter = ctx.ref("");
  const cmdSelectedIdx = ctx.ref(0);
  const skillsList = ctx.ref([]);
  const showSkillsPanel = ctx.ref(false);
  const selectedSkillId = ctx.ref(null);
  const browseSearch = ctx.ref("");
  const browseSearchOpen = ctx.ref(false);
  const permissionMode = ctx.ref("default");
  const thinkingEnabled = ctx.ref(false);
  const stopRequested = ctx.ref(false);
  const changesPanelOpen = ctx.ref(false);
  const expandedFiles = ctx.ref(/* @__PURE__ */ new Set());
  const currentCwd = ctx.ref(null);
  const showProjectPicker = ctx.ref(false);
  const pickerCurrentDir = ctx.ref("/");
  const pickerEntries = ctx.ref([]);
  const pickerLoading = ctx.ref(false);
  const fileChanges = ctx.computed(() => aggregateFileChanges(messages.value));
  ctx.watch(fileChanges, (changes) => {
    if (changes.length > 0) {
      expandedFiles.value = new Set(changes.map((c) => c.filePath));
    }
  });
  const slashCommands = [
    { name: "/new", desc: "Start a new conversation", action: startNewChat },
    { name: "/open", desc: "Open Claude Code", action: () => {
      view.value = "browse";
      sidebarOpen.value = true;
      loadProjects();
    } },
    { name: "/history", desc: "Show conversation history", action: () => {
      sidebarOpen.value = true;
      sidebarTab.value = "history";
      loadProjects();
    } },
    { name: "/search", desc: "Search conversations", action: () => {
      sidebarOpen.value = true;
      sidebarTab.value = "search";
    } },
    { name: "/skills", desc: "List available skills", action: loadAndShowSkills },
    { name: "/cwd", desc: "Show or set working directory", action: showCwdInfo },
    { name: "/clear", desc: "Clear current messages", action: () => {
      messages.value = [];
      error.value = null;
    } },
    { name: "/cost", desc: "Show total cost", action: () => {
      error.value = costTotal.value > 0 ? `Total cost: $${costTotal.value.toFixed(4)}` : "No cost yet";
    } },
    { name: "/help", desc: "Show available commands", action: () => {
      error.value = null;
      showCmdPalette.value = true;
      cmdFilter.value = "";
    } }
  ];
  async function loadAndShowSkills() {
    try {
      skillsList.value = await listSkills(exec);
      selectedSkillId.value = null;
      showSkillsPanel.value = true;
    } catch (e) {
      error.value = `Failed to load skills: ${e.message}`;
    }
  }
  function useSkill(skill) {
    showSkillsPanel.value = false;
    selectedSkillId.value = null;
    inputText.value = `/${skill.id} `;
  }
  function getFilteredSessions() {
    const q = browseSearch.value.trim().toLowerCase();
    if (!q) return recentSessions.value;
    return recentSessions.value.filter(
      (s) => (s.firstPrompt || "").toLowerCase().includes(q) || (s.project || "").toLowerCase().includes(q) || (s.gitBranch || "").toLowerCase().includes(q)
    );
  }
  async function showCwdInfo() {
    showProjectPicker.value = true;
    const startDir = currentCwd.value || "~";
    pickerCurrentDir.value = startDir;
    await loadPickerDirs(startDir);
  }
  async function loadPickerDirs(dir) {
    pickerLoading.value = true;
    try {
      pickerEntries.value = await listDirs(exec, dir);
    } catch {
      pickerEntries.value = [];
    } finally {
      pickerLoading.value = false;
    }
  }
  async function navigatePickerDir(dir) {
    pickerCurrentDir.value = dir;
    await loadPickerDirs(dir);
  }
  function selectProjectPath(p) {
    currentCwd.value = p;
    showProjectPicker.value = false;
    ctx.storage.set("cwd", p).catch(() => {
    });
  }
  function cyclePermissionMode() {
    const modes = ["default", "agent", "plan"];
    const idx = modes.indexOf(permissionMode.value);
    permissionMode.value = modes[(idx + 1) % modes.length];
  }
  function getModeLabel() {
    switch (permissionMode.value) {
      case "agent":
        return "Agent";
      case "plan":
        return "Plan";
      default:
        return "Default";
    }
  }
  function getModeIcon() {
    switch (permissionMode.value) {
      case "agent":
        return "\u221E";
      case "plan":
        return "\u2610";
      default:
        return "\u{1F4AC}";
    }
  }
  function getFilteredCmds() {
    const f = cmdFilter.value.toLowerCase();
    const allCmds = [
      ...slashCommands,
      ...skillsList.value.map((s) => ({
        name: `/${s.id}`,
        desc: s.description || s.name,
        action: () => useSkill(s)
      }))
    ];
    return f ? allCmds.filter((c) => c.name.includes(f) || c.desc.toLowerCase().includes(f)) : allCmds;
  }
  function execCmd(cmd) {
    showCmdPalette.value = false;
    cmdFilter.value = "";
    cmdSelectedIdx.value = 0;
    inputText.value = "";
    cmd.action();
  }
  function exec(args, options) {
    return ctx.exec.run(args, options);
  }
  function encodePath(projectPath) {
    return projectPath.replace(/^\//, "").replace(/\//g, "-");
  }
  async function getActiveCwd() {
    try {
      const paneId = ctx.terminal.activePaneId();
      if (!paneId) return void 0;
      const res = await fetch(`/api/workspace/list?pane_id=${encodeURIComponent(paneId)}`);
      if (!res.ok) return void 0;
      const data = await res.json();
      return data.cwd || void 0;
    } catch {
      return void 0;
    }
  }
  async function loadProjects() {
    try {
      projects.value = await listProjects(exec);
    } catch (e) {
      error.value = e.message;
    }
  }
  async function loadRecentSessions() {
    loading.value = true;
    error.value = null;
    console.log("[claude-code] loadRecentSessions: starting");
    try {
      const result = await exec(["list-recent", "30"], { timeout: 15e3 });
      console.log("[claude-code] list-recent result:", result.code, result.stdout?.length, result.stderr?.slice(0, 200));
      if (result.code !== 0) {
        throw new Error(result.stderr || "list-recent failed");
      }
      const parsed = JSON.parse(result.stdout);
      console.log("[claude-code] parsed sessions:", parsed.length);
      recentSessions.value = parsed;
    } catch (e) {
      console.error("[claude-code] loadRecentSessions error:", e.message);
      try {
        if (projects.value.length === 0) {
          const projResult = await exec(["list-projects"], { timeout: 1e4 });
          if (projResult.code === 0) {
            projects.value = JSON.parse(projResult.stdout);
          }
        }
        const all = [];
        for (const p of projects.value.slice(0, 8)) {
          try {
            const sessResult = await exec(["list-sessions", p.encodedPath], { timeout: 1e4 });
            if (sessResult.code === 0) {
              const sess = JSON.parse(sessResult.stdout);
              all.push(...sess.slice(0, 5));
            }
          } catch {
          }
        }
        all.sort((a, b) => {
          const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
          const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
          return tb - ta;
        });
        recentSessions.value = all.slice(0, 30);
        console.log("[claude-code] fallback loaded:", all.length, "sessions");
      } catch (e2) {
        console.error("[claude-code] fallback error:", e2.message);
        error.value = `Failed to load sessions: ${e.message}`;
      }
    } finally {
      loading.value = false;
    }
  }
  async function selectProject(project) {
    if (selectedProject.value === project.path) {
      selectedProject.value = null;
      selectedProjectEncoded.value = null;
      sessions.value = [];
      return;
    }
    selectedProject.value = project.path;
    selectedProjectEncoded.value = project.encodedPath;
    loading.value = true;
    error.value = null;
    try {
      sessions.value = await listSessions(exec, project.encodedPath);
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }
  async function openSession(session) {
    activeSession.value = session;
    view.value = "chat";
    sidebarOpen.value = false;
    loading.value = true;
    error.value = null;
    messages.value = [];
    expandedTools.value = /* @__PURE__ */ new Set();
    if (session.project && session.project !== ".") {
      currentCwd.value = session.project;
    }
    try {
      messages.value = await readSession(exec, session.encodedPath, session.id);
      scrollToBottom();
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }
  async function startNewChat() {
    activeSession.value = null;
    messages.value = [];
    inputText.value = "";
    costTotal.value = 0;
    error.value = null;
    expandedTools.value = /* @__PURE__ */ new Set();
    view.value = "chat";
    sidebarOpen.value = false;
    if (!currentCwd.value) {
      try {
        const saved = await ctx.storage.get("cwd");
        if (saved) currentCwd.value = saved;
      } catch {
      }
    }
  }
  async function doSearch() {
    const q = searchQuery.value.trim();
    if (!q) return;
    searching.value = true;
    error.value = null;
    try {
      searchResults.value = await searchSessions(exec, q);
    } catch (e) {
      error.value = e.message;
    } finally {
      searching.value = false;
    }
  }
  function stopSending() {
    stopRequested.value = true;
    sending.value = false;
  }
  async function sendMessage() {
    const text = inputText.value.trim();
    if (!text || sending.value) return;
    sending.value = true;
    stopRequested.value = false;
    error.value = null;
    const userMsg = {
      uuid: "pending-" + Date.now(),
      role: "user",
      content: text,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    messages.value = [...messages.value, userMsg];
    inputText.value = "";
    scrollToBottom();
    try {
      const cwd = currentCwd.value || await getActiveCwd();
      if (stopRequested.value) return;
      if (activeSession.value) {
        const result = await continueConversation(exec, activeSession.value.id, text, { cwd });
        if (stopRequested.value) return;
        costTotal.value += result.costUsd;
        messages.value = [...messages.value, {
          uuid: "resp-" + Date.now(),
          role: "assistant",
          content: result.response,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }];
      } else {
        const result = await createConversation(exec, text, { cwd });
        if (stopRequested.value) return;
        costTotal.value += result.costUsd;
        const projectPath = selectedProject.value || cwd || currentCwd.value || ".";
        activeSession.value = {
          id: result.sessionId,
          project: projectPath,
          encodedPath: encodePath(projectPath),
          firstPrompt: text,
          lastTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
          messageCount: 1
        };
        messages.value = [...messages.value, {
          uuid: "resp-" + Date.now(),
          role: "assistant",
          content: result.response,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }];
      }
      scrollToBottom();
    } catch (e) {
      if (!stopRequested.value) {
        error.value = e.message;
        messages.value = messages.value.filter((m) => !m.uuid.startsWith("pending-"));
      }
    } finally {
      sending.value = false;
      stopRequested.value = false;
    }
  }
  function scrollToBottom() {
    setTimeout(() => {
      const el = chatScrollRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
  function toggleTool(msgId, toolIdx) {
    const key = `${msgId}-${toolIdx}`;
    const next = new Set(expandedTools.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedTools.value = next;
  }
  function formatTime(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const now = /* @__PURE__ */ new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.floor(diffMs / 1e3);
      if (diffSec < 60) return "just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `${diffH}h ago`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `${diffD}d ago`;
      return d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
    } catch {
      return ts;
    }
  }
  ctx.commands.register("claude-code.open", () => {
    view.value = "browse";
    sidebarOpen.value = true;
    loadProjects();
  });
  ctx.commands.register("claude-code.new", () => startNewChat());
  ctx.commands.register("claude-code.search", () => {
    sidebarOpen.value = true;
    sidebarTab.value = "search";
    loadProjects();
  });
  ctx.commands.registerQuickPick("claude-code.quick", {
    title: "Claude Code \u2014 Switch Session",
    async items() {
      const recent = await listRecentSessions(exec, 20);
      return recent.map((s) => ({
        label: s.firstPrompt.slice(0, 60) || "(empty)",
        detail: `${s.project} \xB7 ${formatTime(s.lastTimestamp)}`,
        icon: "\u{1F4AC}",
        action() {
          openSession(s);
        }
      }));
    }
  });
  function renderHeader() {
    return h("div", { class: "ccm-header" }, [
      h("div", { class: "ccm-header-left" }, [
        h("button", {
          class: "ccm-icon-btn",
          onClick: () => {
            sidebarOpen.value = !sidebarOpen.value;
          },
          title: "Toggle sidebar"
        }, IconMenu()),
        h(
          "span",
          { class: "ccm-header-title" },
          activeSession.value ? activeSession.value.firstPrompt?.slice(0, 60) || "Session" : view.value === "chat" ? "New Chat" : "Claude Code"
        )
      ]),
      h("div", { class: "ccm-header-right" }, [
        costTotal.value > 0 ? h("span", { class: "ccm-cost-badge" }, `$${costTotal.value.toFixed(3)}`) : null,
        fileChanges.value.length > 0 ? h("button", {
          class: `ccm-icon-btn ${changesPanelOpen.value ? "ccm-icon-btn-active" : ""}`,
          onClick: () => {
            changesPanelOpen.value = !changesPanelOpen.value;
          },
          title: `${fileChanges.value.length} changed files`
        }, IconFileText(15)) : null,
        h("button", {
          class: "ccm-icon-btn",
          onClick: startNewChat,
          title: "New conversation"
        }, IconPlus())
      ].filter(Boolean))
    ]);
  }
  function renderSidebar() {
    return h("div", { class: "ccm-sidebar" }, [
      h("div", { class: "ccm-sidebar-header" }, [
        h("div", { class: "ccm-sidebar-tabs" }, [
          h("button", {
            class: `ccm-sidebar-tab ${sidebarTab.value === "history" ? "ccm-sidebar-tab-active" : ""}`,
            onClick: () => {
              sidebarTab.value = "history";
            }
          }, "History"),
          h("button", {
            class: `ccm-sidebar-tab ${sidebarTab.value === "search" ? "ccm-sidebar-tab-active" : ""}`,
            onClick: () => {
              sidebarTab.value = "search";
            }
          }, "Search")
        ]),
        h("button", {
          class: "ccm-icon-btn ccm-icon-btn-sm",
          onClick: startNewChat,
          title: "New conversation"
        }, IconPlus())
      ]),
      sidebarTab.value === "history" ? renderHistoryPanel() : renderSearchPanel()
    ]);
  }
  function renderHistoryPanel() {
    return h("div", { class: "ccm-sidebar-body" }, [
      loading.value ? h("div", { class: "ccm-sidebar-loading" }, [
        h("span", { class: "ccm-spinner" })
      ]) : null,
      ...projects.value.map((p) => h("div", { class: "ccm-project-group" }, [
        h("div", {
          class: `ccm-project-header ${selectedProject.value === p.path ? "ccm-project-header-active" : ""}`,
          onClick: () => selectProject(p)
        }, [
          h("span", { class: "ccm-project-chevron" }, selectedProject.value === p.path ? IconChevronDown(12) : IconChevronRight(12)),
          h("span", { class: "ccm-project-icon" }, IconFolder(14)),
          h("span", { class: "ccm-project-label" }, p.path.split("/").pop() || p.path),
          h("span", { class: "ccm-project-count" }, String(p.sessionCount))
        ]),
        selectedProject.value === p.path ? h(
          "div",
          { class: "ccm-session-list" },
          sessions.value.map((s) => h("div", {
            class: `ccm-session-row ${activeSession.value?.id === s.id ? "ccm-session-row-active" : ""}`,
            onClick: () => openSession(s)
          }, [
            h("div", { class: "ccm-session-text" }, s.firstPrompt.slice(0, 50) || "(empty)"),
            h("div", { class: "ccm-session-info" }, [
              h("span", null, formatTime(s.lastTimestamp)),
              s.gitBranch ? h("span", { class: "ccm-tag" }, s.gitBranch) : null
            ].filter(Boolean))
          ]))
        ) : null
      ]))
    ]);
  }
  function renderSearchPanel() {
    return h("div", { class: "ccm-sidebar-body" }, [
      h("div", { class: "ccm-search-input-wrap" }, [
        h("input", {
          type: "text",
          class: "ccm-search-field",
          placeholder: "Search conversations...",
          value: searchQuery.value,
          onInput: (e) => {
            searchQuery.value = e.target.value;
          },
          onKeydown: (e) => {
            if (e.key === "Enter") doSearch();
          }
        })
      ]),
      searching.value ? h("div", { class: "ccm-sidebar-loading" }, [
        h("span", { class: "ccm-spinner" })
      ]) : null,
      ...searchResults.value.map((r) => h("div", {
        class: "ccm-session-row",
        onClick: () => openSession(r.session)
      }, [
        h("div", { class: "ccm-session-text" }, r.session.firstPrompt.slice(0, 50)),
        h("div", { class: "ccm-search-snippet" }, r.match.slice(0, 80)),
        h("div", { class: "ccm-session-info" }, [
          h("span", { class: "ccm-tag" }, r.session.project.split("/").pop()),
          h("span", null, formatTime(r.session.lastTimestamp))
        ])
      ]))
    ]);
  }
  function renderChat() {
    return h("div", { class: "ccm-chat" }, [
      h("div", {
        class: "ccm-messages",
        ref: (el) => {
          chatScrollRef.value = el;
        }
      }, [
        messages.value.length === 0 ? renderEmptyState() : null,
        ...messages.value.map((msg, i) => renderMessage(msg, i)),
        sending.value ? renderTypingIndicator() : null
      ]),
      error.value ? h("div", { class: "ccm-error-bar" }, [
        h("span", null, error.value),
        h("button", { class: "ccm-error-close", onClick: () => {
          error.value = null;
        } }, IconX(14))
      ]) : null,
      renderInput()
    ]);
  }
  function renderEmptyState() {
    return h("div", { class: "ccm-empty" }, [
      h("div", { class: "ccm-empty-logo" }, IconClaude(48)),
      h("div", { class: "ccm-empty-heading" }, activeSession.value ? "Loading conversation..." : "Start a new conversation"),
      h("div", { class: "ccm-empty-sub" }, activeSession.value ? "" : "Type a message below to chat with Claude Code")
    ]);
  }
  function renderTypingIndicator() {
    return h("div", { class: "ccm-typing" }, [
      h("div", { class: "ccm-typing-dots" }, [
        h("div", { class: "ccm-typing-dot" }),
        h("div", { class: "ccm-typing-dot" }),
        h("div", { class: "ccm-typing-dot" })
      ]),
      h("button", {
        class: "ccm-stop-btn",
        onClick: stopSending,
        title: "Stop generating"
      }, "Stop")
    ]);
  }
  function renderMessage(msg, index) {
    const isUser = msg.role === "user";
    const prevRole = index > 0 ? messages.value[index - 1].role : null;
    const showDivider = prevRole !== null && prevRole !== msg.role;
    return h("div", { class: `ccm-message ${isUser ? "ccm-message-user" : "ccm-message-assistant"}` }, [
      showDivider ? h("div", { class: "ccm-divider" }) : null,
      h("div", { class: "ccm-message-gutter" }, [
        h(
          "div",
          { class: `ccm-avatar ${isUser ? "ccm-avatar-user" : "ccm-avatar-assistant"}` },
          isUser ? IconUser(16) : IconClaude(16)
        )
      ]),
      h("div", { class: "ccm-message-body" }, [
        h("div", { class: "ccm-message-meta" }, [
          h("span", { class: "ccm-message-role" }, isUser ? "You" : "Claude"),
          msg.model ? h("span", { class: "ccm-model-tag" }, msg.model) : null,
          h("span", { class: "ccm-message-time" }, formatTime(msg.timestamp))
        ].filter(Boolean)),
        h("div", { class: "ccm-message-content" }, renderMarkdown(msg.content)),
        msg.toolUses && msg.toolUses.length > 0 ? h(
          "div",
          { class: "ccm-tools-section" },
          msg.toolUses.map((t, i) => renderToolCard(msg.uuid, t, i))
        ) : null
      ])
    ]);
  }
  function renderToolCard(msgId, tool, index) {
    const key = `${msgId}-${index}`;
    const expanded = expandedTools.value.has(key);
    return h("div", { class: `ccm-tool-card ${expanded ? "ccm-tool-card-expanded" : ""}` }, [
      h("div", {
        class: "ccm-tool-header",
        onClick: () => toggleTool(msgId, index)
      }, [
        h("span", { class: "ccm-tool-icon" }, getToolIcon(tool.name)),
        h("span", { class: "ccm-tool-name" }, tool.name),
        h("span", { class: "ccm-tool-summary" }, tool.summary),
        h("span", { class: "ccm-tool-chevron" }, expanded ? IconChevronDown(12) : IconChevronRight(12))
      ]),
      expanded ? h("div", { class: "ccm-tool-detail" }, [
        h("code", null, `${tool.name}: ${tool.summary}`)
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
      case "WebFetch":
      case "WebSearch":
        return IconGlobe(14);
      default:
        return IconSettings(14);
    }
  }
  function renderInput() {
    return h("div", { class: "ccm-input-area" }, [
      showCmdPalette.value ? renderCommandPalette() : null,
      h("div", { class: "ccm-input-container" }, [
        h("textarea", {
          class: "ccm-input",
          placeholder: activeSession.value ? "Continue the conversation...  (type / for commands)" : "Ask Claude Code anything...  (type / for commands)",
          value: inputText.value,
          onInput: (e) => {
            inputText.value = e.target.value;
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
            const text = inputText.value;
            if (text.startsWith("/")) {
              showCmdPalette.value = true;
              cmdFilter.value = text.slice(1);
              cmdSelectedIdx.value = 0;
            } else {
              showCmdPalette.value = false;
            }
          },
          onKeydown: (e) => {
            const cmds = getFilteredCmds();
            if (showCmdPalette.value && cmds.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                cmdSelectedIdx.value = (cmdSelectedIdx.value + 1) % cmds.length;
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                cmdSelectedIdx.value = (cmdSelectedIdx.value - 1 + cmds.length) % cmds.length;
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                execCmd(cmds[cmdSelectedIdx.value]);
                return;
              }
              if (e.key === "Escape") {
                showCmdPalette.value = false;
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          },
          disabled: sending.value
        }),
        h("div", { class: "ccm-input-actions" }, [
          h("button", {
            class: "ccm-send-btn",
            onClick: sendMessage,
            disabled: sending.value || !inputText.value.trim(),
            title: "Send (Enter)"
          }, sending.value ? h("span", { class: "ccm-spinner ccm-spinner-sm" }) : IconSend(16))
        ])
      ]),
      h("div", { class: "ccm-input-hint" }, [
        h("span", {
          class: "ccm-cwd-badge",
          title: currentCwd.value ? `Click to change: ${currentCwd.value}` : "Click to set project directory",
          onClick: showCwdInfo
        }, [
          IconFolder(12),
          h("span", null, currentCwd.value ? currentCwd.value.split("/").pop() || currentCwd.value : "Set project")
        ]),
        h("span", null, "Shift+Enter for new line  |  / for commands")
      ])
    ]);
  }
  function renderChangesPanel() {
    const changes = fileChanges.value;
    const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
    const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);
    return h("div", { class: "ccm-changes-panel" }, [
      h("div", { class: "ccm-changes-header" }, [
        h("div", { class: "ccm-changes-header-left" }, [
          h("span", { class: "ccm-changes-title" }, `${changes.length} changed files`),
          renderDiffChanges(totalAdditions, totalDeletions, "default")
        ]),
        h("button", {
          class: "ccm-icon-btn ccm-icon-btn-sm",
          onClick: () => {
            changesPanelOpen.value = false;
          },
          title: "Close panel"
        }, IconX(14))
      ]),
      h(
        "div",
        { class: "ccm-changes-list" },
        changes.map((change) => renderFileChangeItem(change))
      )
    ]);
  }
  function renderDiffChanges(additions, deletions, variant = "default") {
    if (variant === "bars") {
      const TOTAL_BLOCKS = 5;
      const total = additions + deletions;
      let addBlocks = 0;
      let delBlocks = 0;
      if (total > 0) {
        if (total < 5) {
          addBlocks = additions > 0 ? 1 : 0;
          delBlocks = deletions > 0 ? 1 : 0;
        } else {
          const ratio = additions / total;
          addBlocks = Math.max(1, Math.round(ratio * TOTAL_BLOCKS));
          delBlocks = TOTAL_BLOCKS - addBlocks;
        }
      }
      return h("div", { class: "ccm-diff-bars" }, [
        ...Array.from(
          { length: addBlocks },
          (_, i) => h("span", { class: "ccm-diff-bar ccm-diff-bar-add", key: `a${i}` })
        ),
        ...Array.from(
          { length: delBlocks },
          (_, i) => h("span", { class: "ccm-diff-bar ccm-diff-bar-del", key: `d${i}` })
        )
      ]);
    }
    return h("span", { class: "ccm-diff-changes" }, [
      additions > 0 ? h("span", { class: "ccm-diff-add" }, `+${additions}`) : null,
      deletions > 0 ? h("span", { class: "ccm-diff-del" }, `-${deletions}`) : null
    ].filter(Boolean));
  }
  function renderFileChangeItem(change) {
    const expanded = expandedFiles.value.has(change.filePath);
    const fileName = change.filePath.split("/").pop() || change.filePath;
    const dirPath = change.filePath.slice(0, change.filePath.lastIndexOf("/"));
    return h("div", { class: `ccm-change-item ${expanded ? "ccm-change-item-expanded" : ""}` }, [
      h("div", {
        class: "ccm-change-header",
        onClick: () => {
          const next = new Set(expandedFiles.value);
          if (next.has(change.filePath)) next.delete(change.filePath);
          else next.add(change.filePath);
          expandedFiles.value = next;
        }
      }, [
        h(
          "span",
          { class: "ccm-change-chevron" },
          expanded ? IconChevronDown(12) : IconChevronRight(12)
        ),
        h("span", { class: "ccm-change-icon" }, IconFileText(14)),
        h("div", { class: "ccm-change-info" }, [
          h("span", { class: "ccm-change-filename" }, fileName),
          h("span", { class: "ccm-change-dir" }, dirPath)
        ]),
        renderDiffChanges(change.additions, change.deletions, "bars")
      ]),
      expanded ? renderFileDiff(change) : null
    ]);
  }
  function renderFileDiff(change) {
    const operations = [];
    for (const msg of messages.value) {
      if (!msg.toolUses) continue;
      for (const tu of msg.toolUses) {
        if (tu.filePath !== change.filePath) continue;
        if (tu.name === "Edit" && tu.oldString !== void 0 && tu.newString !== void 0) {
          operations.push(...computeEditDiff(tu.oldString, tu.newString));
        } else if (tu.name === "Write" && tu.content !== void 0) {
          const lines = tu.content.split("\n");
          for (const line of lines) {
            operations.push({ type: "add", text: line });
          }
        }
      }
    }
    return h(
      "div",
      { class: "ccm-change-diff" },
      operations.map(
        (line, i) => h("div", {
          class: `ccm-diff-line ${line.type === "add" ? "ccm-diff-line-add" : line.type === "del" ? "ccm-diff-line-del" : "ccm-diff-line-ctx"}`,
          key: i
        }, [
          h("span", { class: "ccm-diff-prefix" }, line.type === "add" ? "+" : line.type === "del" ? "-" : " "),
          h("span", { class: "ccm-diff-text" }, line.text)
        ])
      )
    );
  }
  function renderStatusBar() {
    return h("div", { class: "ccm-statusbar" }, [
      h("div", { class: "ccm-statusbar-left" }, [
        h("span", { class: "ccm-statusbar-item" }, [
          IconClaude(12),
          h("span", null, " Claude Code")
        ]),
        activeSession.value ? h("span", { class: "ccm-statusbar-sep" }, "|") : null,
        activeSession.value ? h(
          "span",
          { class: "ccm-statusbar-item ccm-statusbar-muted" },
          activeSession.value.project?.split("/").pop() || ""
        ) : null
      ]),
      h("div", { class: "ccm-statusbar-right" }, [
        messages.value.length > 0 ? h(
          "span",
          { class: "ccm-statusbar-item ccm-statusbar-muted" },
          `${messages.value.length} messages`
        ) : null,
        costTotal.value > 0 ? h(
          "span",
          { class: "ccm-statusbar-item ccm-statusbar-cost" },
          `$${costTotal.value.toFixed(4)}`
        ) : null,
        sending.value ? h("span", { class: "ccm-statusbar-item ccm-statusbar-active" }, [
          h("span", { class: "ccm-spinner ccm-spinner-xs" }),
          h("span", null, "thinking")
        ]) : null
      ])
    ]);
  }
  function handleGlobalKeydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      sidebarOpen.value = !sidebarOpen.value;
    }
    if (mod && e.key === "n") {
      e.preventDefault();
      startNewChat();
    }
    if (mod && e.key === "k") {
      e.preventDefault();
      showCmdPalette.value = !showCmdPalette.value;
      cmdFilter.value = "";
      cmdSelectedIdx.value = 0;
    }
    if (mod && e.key === "d") {
      e.preventDefault();
      if (fileChanges.value.length > 0) {
        changesPanelOpen.value = !changesPanelOpen.value;
      }
    }
  }
  function renderCommandPalette() {
    const cmds = getFilteredCmds();
    if (cmds.length === 0) return null;
    return h("div", { class: "ccm-cmd-palette" }, [
      h("div", { class: "ccm-cmd-header" }, [
        h("span", null, "Commands"),
        h("button", { class: "ccm-cmd-close", onClick: () => {
          showCmdPalette.value = false;
        } }, IconX(14))
      ]),
      h(
        "div",
        { class: "ccm-cmd-list" },
        cmds.map((cmd, i) => h("div", {
          class: `ccm-cmd-item ${i === cmdSelectedIdx.value ? "ccm-cmd-item-active" : ""}`,
          onClick: () => execCmd(cmd),
          onMouseenter: () => {
            cmdSelectedIdx.value = i;
          }
        }, [
          h("span", { class: "ccm-cmd-name" }, cmd.name),
          h("span", { class: "ccm-cmd-desc" }, cmd.desc)
        ]))
      )
    ]);
  }
  function renderMarkdown(content) {
    if (!content) return [h("span", { class: "ccm-muted" }, "(no content)")];
    const cleaned = content.replace(/<\/?command-(?:message|name)[^>]*>/g, "");
    const lines = cleaned.split("\n");
    const elements = [];
    let inCode = false;
    let codeLines = [];
    let codeLang = "";
    let codeKey = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
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
      if (line.startsWith("# ")) {
        elements.push(h("h1", { class: "ccm-md-h1", key: i }, renderInline(line.slice(2))));
      } else if (line.startsWith("## ")) {
        elements.push(h("h2", { class: "ccm-md-h2", key: i }, renderInline(line.slice(3))));
      } else if (line.startsWith("### ")) {
        elements.push(h("h3", { class: "ccm-md-h3", key: i }, renderInline(line.slice(4))));
      } else if (line.startsWith("> ")) {
        elements.push(h("blockquote", { class: "ccm-md-quote", key: i }, renderInline(line.slice(2))));
      } else if (/^[-*]\s/.test(line)) {
        elements.push(h("div", { class: "ccm-md-li", key: i }, renderInline(line.replace(/^[-*]\s/, ""))));
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(h("div", { class: "ccm-md-li ccm-md-oli", key: i }, renderInline(line.replace(/^\d+\.\s/, ""))));
      } else if (line === "---" || line === "***") {
        elements.push(h("hr", { class: "ccm-md-hr", key: i }));
      } else if (line.trim() === "") {
      } else {
        elements.push(h("p", { class: "ccm-md-p", key: i }, renderInline(line)));
      }
    }
    if (inCode && codeLines.length > 0) {
      elements.push(renderCodeBlock(codeLines.join("\n"), codeLang, codeKey));
    }
    return elements.length > 0 ? elements : [h("span", { class: "ccm-muted" }, "(empty)")];
  }
  function renderCodeBlock(code, lang, key) {
    const codeId = `code-${key}-${Date.now()}`;
    return h("div", { class: "ccm-code-block", key: `code-${key}` }, [
      h("div", { class: "ccm-code-toolbar" }, [
        h("span", { class: "ccm-code-lang" }, lang || "code"),
        h("button", {
          class: "ccm-code-copy",
          onClick: (e) => {
            const btn = e.target;
            navigator.clipboard.writeText(code).then(() => {
              btn.textContent = "\u2713";
              setTimeout(() => {
                btn.textContent = "Copy";
              }, 1500);
            }).catch(() => {
            });
          }
        }, "Copy")
      ]),
      h("pre", { class: "ccm-code-pre" }, [
        h("code", { class: lang ? `language-${lang}` : "" }, code)
      ])
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
        codeMatch ? { type: "code", idx: codeMatch.index, m: codeMatch } : null,
        boldMatch ? { type: "bold", idx: boldMatch.index, m: boldMatch } : null,
        italicMatch ? { type: "italic", idx: italicMatch.index, m: italicMatch } : null,
        linkMatch ? { type: "link", idx: linkMatch.index, m: linkMatch } : null
      ].filter(Boolean);
      if (candidates.length === 0) {
        parts.push(remaining);
        break;
      }
      candidates.sort((a, b) => a.idx - b.idx);
      const first = candidates[0];
      if (first.idx > 0) parts.push(remaining.slice(0, first.idx));
      const k = keyCounter++;
      if (first.type === "code") {
        parts.push(h("code", { class: "ccm-inline-code", key: k }, first.m[1]));
        remaining = remaining.slice(first.idx + first.m[0].length);
      } else if (first.type === "bold") {
        parts.push(h("strong", { key: k }, first.m[1]));
        remaining = remaining.slice(first.idx + first.m[0].length);
      } else if (first.type === "italic") {
        parts.push(h("em", { key: k }, first.m[1]));
        remaining = remaining.slice(first.idx + first.m[0].length);
      } else if (first.type === "link") {
        parts.push(h("a", { class: "ccm-link", href: first.m[2], target: "_blank", rel: "noopener", key: k }, first.m[1]));
        remaining = remaining.slice(first.idx + first.m[0].length);
      }
    }
    return parts;
  }
  return {
    component: {
      setup() {
        ctx.onMounted(() => {
          console.log("[claude-code] onMounted called");
          loadRecentSessions();
          loadProjects();
          listSkills(exec).then((s) => {
            skillsList.value = s;
          }).catch(() => {
          });
          document.addEventListener("keydown", handleGlobalKeydown);
        });
        return {};
      },
      render() {
        return h("div", { class: "ccm-root" }, [
          renderHeader(),
          h("div", { class: "ccm-main" }, [
            sidebarOpen.value ? renderSidebar() : null,
            h("div", { class: "ccm-content" }, [
              view.value === "browse" ? renderBrowseView() : renderChat()
            ]),
            view.value === "chat" && changesPanelOpen.value && fileChanges.value.length > 0 ? renderChangesPanel() : null
          ]),
          renderStatusBar(),
          showProjectPicker.value ? renderProjectPicker() : null,
          showSkillsPanel.value ? renderSkillsPanel() : null
        ]);
      }
    }
  };
  function renderBrowseView() {
    const filtered = getFilteredSessions();
    return h("div", { class: "ccm-browse" }, [
      // Header bar (Claudix SessionsPage style)
      h("div", { class: "ccm-browse-header" }, [
        h("div", { class: "ccm-browse-header-left" }, [
          h("span", { class: "ccm-browse-title" }, "Sessions")
        ]),
        h("div", { class: "ccm-browse-header-right" }, [
          h("button", {
            class: `ccm-icon-btn ${browseSearchOpen.value ? "ccm-icon-btn-active" : ""}`,
            onClick: () => {
              browseSearchOpen.value = !browseSearchOpen.value;
              if (!browseSearchOpen.value) browseSearch.value = "";
            },
            title: "Search sessions"
          }, IconSearch(15)),
          h("button", {
            class: "ccm-icon-btn",
            onClick: () => loadRecentSessions(),
            title: "Refresh"
          }, IconRefresh(15)),
          h("button", {
            class: "ccm-primary-btn ccm-primary-btn-sm",
            onClick: startNewChat
          }, "+ New")
        ])
      ]),
      // Search bar (collapsible, like Claudix)
      browseSearchOpen.value ? h("div", { class: "ccm-browse-search" }, [
        h("input", {
          type: "text",
          class: "ccm-browse-search-input",
          placeholder: "Search sessions...",
          value: browseSearch.value,
          onInput: (e) => {
            browseSearch.value = e.target.value;
          },
          onKeydown: (e) => {
            if (e.key === "Escape") {
              browseSearchOpen.value = false;
              browseSearch.value = "";
            }
          }
        })
      ]) : null,
      // Content
      h("div", { class: "ccm-browse-content" }, [
        // Loading state
        loading.value ? h("div", { class: "ccm-browse-state" }, [
          h("div", { class: "ccm-spinner" }),
          h("span", null, "Loading sessions...")
        ]) : null,
        // Error state
        !loading.value && error.value ? h("div", { class: "ccm-browse-state" }, [
          h("span", { class: "ccm-browse-error" }, error.value),
          h("button", {
            class: "ccm-primary-btn ccm-primary-btn-sm",
            onClick: () => {
              error.value = null;
              loadRecentSessions();
            }
          }, "Retry")
        ]) : null,
        // Empty state
        !loading.value && !error.value && filtered.length === 0 ? h("div", { class: "ccm-browse-state" }, [
          h("div", { class: "ccm-browse-empty-icon" }, IconClaude(48)),
          h("span", null, browseSearch.value ? "No matching sessions" : "No sessions yet"),
          !browseSearch.value ? h("button", {
            class: "ccm-primary-btn",
            onClick: startNewChat
          }, "Start a conversation") : null
        ].filter(Boolean)) : null,
        // Session cards
        !loading.value && !error.value && filtered.length > 0 ? h(
          "div",
          { class: "ccm-browse-sessions" },
          filtered.map((s) => renderSessionCard(s))
        ) : null
      ])
    ]);
  }
  function renderSessionCard(s) {
    return h("div", {
      class: "ccm-session-card",
      onClick: () => openSession(s)
    }, [
      h("div", { class: "ccm-session-card-header" }, [
        h("span", { class: "ccm-session-card-title" }, s.firstPrompt.slice(0, 80) || "(empty)"),
        h("span", { class: "ccm-session-card-time" }, formatTime(s.lastTimestamp))
      ]),
      h("div", { class: "ccm-session-card-meta" }, [
        h("span", { class: "ccm-session-card-count" }, `${s.messageCount} messages`),
        h("span", { class: "ccm-tag" }, s.project.split("/").pop() || s.project),
        s.gitBranch ? h("span", { class: "ccm-tag" }, s.gitBranch) : null
      ].filter(Boolean))
    ]);
  }
  function renderProjectPicker() {
    const dir = pickerCurrentDir.value;
    const entries = pickerEntries.value;
    const detected = currentCwd.value;
    const segments = dir.split("/").filter(Boolean);
    const breadcrumbs = [
      h("span", {
        class: "ccm-picker-crumb",
        onClick: () => navigatePickerDir("/")
      }, "/")
    ];
    let accumulated = "";
    for (const seg of segments) {
      accumulated += "/" + seg;
      const path = accumulated;
      breadcrumbs.push(h("span", { class: "ccm-picker-crumb-sep" }, "/"));
      breadcrumbs.push(h("span", {
        class: "ccm-picker-crumb",
        onClick: () => navigatePickerDir(path)
      }, seg));
    }
    return h("div", { class: "ccm-picker-overlay" }, [
      h("div", { class: "ccm-picker-backdrop", onClick: () => {
        showProjectPicker.value = false;
      } }),
      h("div", { class: "ccm-picker-panel" }, [
        h("div", { class: "ccm-picker-header" }, [
          h("span", { class: "ccm-picker-title" }, "Select Project Directory"),
          h("button", {
            class: "ccm-icon-btn ccm-icon-btn-sm",
            onClick: () => {
              showProjectPicker.value = false;
            }
          }, IconX(14))
        ]),
        // Breadcrumb
        h("div", { class: "ccm-picker-breadcrumb" }, breadcrumbs),
        // Current CWD indicator
        detected ? h("div", { class: "ccm-picker-current" }, [
          IconFolder(14),
          h("span", null, `Current: ${detected}`)
        ]) : null,
        // Select current directory button
        h("div", { class: "ccm-picker-actions" }, [
          h("button", {
            class: "ccm-picker-action-btn",
            onClick: () => selectProjectPath(dir)
          }, [
            IconCheck(14),
            h("span", null, `Select "${dir.split("/").pop() || "/"}"`)
          ])
        ]),
        // Directory list
        h(
          "div",
          { class: "ccm-picker-list" },
          pickerLoading.value ? h("div", { class: "ccm-picker-empty" }, [
            h("span", { class: "ccm-spinner" })
          ]) : entries.length > 0 ? entries.map((entry) => h("div", {
            class: "ccm-picker-item",
            onClick: () => navigatePickerDir(entry.path)
          }, [
            IconFolder(14),
            h("div", { class: "ccm-picker-item-info" }, [
              h("span", { class: "ccm-picker-item-name" }, entry.name),
              h("span", { class: "ccm-picker-item-path" }, entry.path)
            ]),
            IconChevronRight(14)
          ])) : h("div", { class: "ccm-picker-empty" }, "No subdirectories")
        )
      ])
    ]);
  }
  function renderSkillsPanel() {
    const selected = skillsList.value.find((s) => s.id === selectedSkillId.value);
    return h("div", { class: "ccm-skills-overlay" }, [
      h("div", { class: "ccm-skills-backdrop", onClick: () => {
        showSkillsPanel.value = false;
        selectedSkillId.value = null;
      } }),
      h("div", { class: "ccm-skills-panel" }, [
        h("div", { class: "ccm-skills-header" }, [
          h("div", { class: "ccm-skills-header-left" }, [
            selected ? h("button", {
              class: "ccm-icon-btn ccm-icon-btn-sm",
              onClick: () => {
                selectedSkillId.value = null;
              },
              title: "Back to list"
            }, IconArrowLeft(14)) : null,
            h("span", { class: "ccm-skills-title" }, selected ? selected.name : "Skills")
          ]),
          h("button", {
            class: "ccm-icon-btn ccm-icon-btn-sm",
            onClick: () => {
              showSkillsPanel.value = false;
              selectedSkillId.value = null;
            }
          }, IconX(14))
        ]),
        selected ? renderSkillDetail(selected) : renderSkillsList()
      ])
    ]);
  }
  function renderSkillsList() {
    if (skillsList.value.length === 0) {
      return h("div", { class: "ccm-skills-empty" }, "No skills installed");
    }
    return h(
      "div",
      { class: "ccm-skills-list" },
      skillsList.value.map((skill) => h("div", {
        class: "ccm-skill-card",
        onClick: () => {
          selectedSkillId.value = skill.id;
        }
      }, [
        h("div", { class: "ccm-skill-card-header" }, [
          h("span", { class: "ccm-skill-icon" }, IconZap(14)),
          h("span", { class: "ccm-skill-name" }, skill.name)
        ]),
        h("div", { class: "ccm-skill-desc" }, skill.description || "No description"),
        skill.allowedTools.length > 0 ? h(
          "div",
          { class: "ccm-skill-tools" },
          skill.allowedTools.map((t) => h("span", { class: "ccm-skill-tool-tag" }, t))
        ) : null
      ]))
    );
  }
  function renderSkillDetail(skill) {
    return h("div", { class: "ccm-skill-detail" }, [
      h("div", { class: "ccm-skill-detail-desc" }, skill.description || "No description"),
      skill.allowedTools.length > 0 ? h("div", { class: "ccm-skill-detail-section" }, [
        h("div", { class: "ccm-skill-detail-label" }, "Allowed Tools"),
        h(
          "div",
          { class: "ccm-skill-tools" },
          skill.allowedTools.map((t) => h("span", { class: "ccm-skill-tool-tag" }, t))
        )
      ]) : null,
      h("div", { class: "ccm-skill-detail-actions" }, [
        h("button", {
          class: "ccm-primary-btn",
          onClick: () => useSkill(skill)
        }, "Use in Chat")
      ])
    ]);
  }
}
export {
  activate
};

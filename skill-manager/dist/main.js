// src/ui.ts
var CONFIG_PATH_SUFFIX = "/.dinotty/skill-manager-dirs.json";
var SOURCE_LABELS = {
  claude: "Claude",
  codex: "Codex",
  custom: "\u81EA\u5B9A\u4E49",
  cskills: "CSkills",
  lark: "Lark",
  git: "Git",
  "skills-sh": "skills.sh"
};
function activate(ctx) {
  const h = ctx.h;
  const skills = ctx.ref([]);
  const loading = ctx.ref(true);
  const tab = ctx.ref("installed");
  const sourceFilter = ctx.ref("all");
  const editingSkill = ctx.ref(null);
  const editContent = ctx.ref("");
  const editDirty = ctx.ref(false);
  const saving = ctx.ref(false);
  const deleting = ctx.ref(null);
  const showNewForm = ctx.ref(false);
  const newName = ctx.ref("");
  const newSource = ctx.ref("claude");
  const creating = ctx.ref(false);
  const syncing = ctx.ref(null);
  const syncingAll = ctx.ref(false);
  const searchQuery = ctx.ref("");
  const searchResults = ctx.ref([]);
  const searching = ctx.ref(false);
  const searchTotal = ctx.ref(0);
  const searchPage = ctx.ref(0);
  const installing = ctx.ref(null);
  const PAGE_SIZE = 20;
  const customDirs = ctx.ref([]);
  const showDirForm = ctx.ref(false);
  const newDirPath = ctx.ref("");
  const addingDir = ctx.ref(false);
  const updateAvailable = ctx.ref(new Set());
  const checkingUpdates = ctx.ref(false);
  const expandedSkill = ctx.ref(null);
  const skillDetails = ctx.ref({});
  const showDisabled = ctx.ref(true);
  async function sh(cmd) {
    const res = await ctx.exec.run(["sh", "-c", cmd]);
    if (res.code !== 0) throw new Error(res.stderr || `exit ${res.code}`);
    return res.stdout;
  }
  async function getHome() {
    return (await sh("echo -n $HOME")).trim();
  }
  async function loadCSkillsIndex() {
    try {
      const home = await getHome();
      const raw = await sh(`cat "${home}/.cskills/installed-skills.json" 2>/dev/null`);
      const data = JSON.parse(raw);
      if (data.skills) return data.skills;
    } catch {
    }
    return {};
  }
  async function loadLarkLock() {
    try {
      const home = await getHome();
      const raw = await sh(`cat "${home}/.agents/.skill-lock.json" 2>/dev/null`);
      const data = JSON.parse(raw);
      if (data.skills) return data.skills;
    } catch {
    }
    return {};
  }
  async function detectGitRemote(path) {
    try {
      const out = await sh(`cd "${path}" && git config --get remote.origin.url 2>/dev/null && git branch --show-current 2>/dev/null`);
      const lines = out.trim().split("\n");
      if (lines.length >= 2 && lines[0] && lines[1]) {
        return { remote: lines[0], branch: lines[1] };
      }
    } catch {
    }
    return null;
  }
  function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return { name: "", description: "", allowedTools: [] };
    const fm = match[1];
    const nameM = fm.match(/^name:\s*(.+)$/m);
    const name = nameM ? nameM[1].trim() : "";
    const descM = fm.match(/^description:\s*([\s\S]*?)(?=\n\w|\n---$|$)/m);
    let description = "";
    if (descM) {
      description = descM[1].replace(/^\|\s*\n/, "").replace(/\n\s{2,}/g, " ").trim();
    }
    const toolsM = fm.match(/^allowed-tools:\s*\n((?:\s+-\s+.+\n?)*)/m);
    let allowedTools = [];
    if (toolsM) {
      allowedTools = toolsM[1].match(/^\s+-\s+(.+)$/mg)?.map((s) => s.replace(/^\s+-\s+/, "").trim()) || [];
    } else {
      const inlineM = fm.match(/^allowed-tools:\s*\[([^\]]+)\]/m);
      if (inlineM) {
        allowedTools = inlineM[1].split(",").map((s) => s.trim());
      }
    }
    return { name, description, allowedTools };
  }
  async function loadCustomDirs() {
    try {
      const home = await getHome();
      const raw = await sh(`cat "${home}${CONFIG_PATH_SUFFIX}" 2>/dev/null`);
      const data = JSON.parse(raw);
      if (Array.isArray(data.customDirs)) return data.customDirs;
    } catch {
    }
    return [];
  }
  async function saveCustomDirs(dirs) {
    const home = await getHome();
    const configPath = `${home}${CONFIG_PATH_SUFFIX}`;
    await sh(`mkdir -p "${home}/.dinotty"`);
    const data = JSON.stringify({ customDirs: dirs }, null, 2).replace(/'/g, "'\\''");
    await sh(`printf '%s' '${data}' > "${configPath}"`);
  }
  async function loadDirSkills(dir, source, sourceLabel) {
    const cmd = `test -d "${dir}" || exit 0; find -L "${dir}" -mindepth 1 -maxdepth 1 -type d -exec sh -c 'for d; do n=$(basename "$d"); case "$n" in .*) continue ;; esac; [ -f "$d/SKILL.md" ] || continue; c=$(sed "s/'"'"'/'"'"'\\'"'"''"'"'/g" "$d/SKILL.md"); m=""; [ -f "$d/.skill-meta.json" ] && m=$(sed "s/'"'"'/'"'"'\\'"'"''"'"'/g" "$d/.skill-meta.json"); printf "SKILL:%s\\n%s\\nSKILL_END\\nMETA:%s\\nMETA_END\\n" "$n" "$c" "$m"; done' sh {} +`;
    let out;
    try {
      out = await sh(cmd);
    } catch {
      return [];
    }
    if (!out) return [];
    const result = [];
    const re = /SKILL:([^\n]+)\n([\s\S]*?)\nSKILL_END\nMETA:([\s\S]*?)\nMETA_END\n/g;
    let m;
    while ((m = re.exec(out)) !== null) {
      const id = m[1];
      const raw = m[2];
      const metaRaw = m[3];
      const { name, description, allowedTools } = parseFrontmatter(raw);
      let meta;
      if (metaRaw.trim()) {
        try {
          meta = JSON.parse(metaRaw);
        } catch {
        }
      }
      const entryPath = `${dir}/${id}`;
      result.push({
        id,
        name: name || id,
        description,
        allowedTools,
        path: entryPath,
        skillFile: `${entryPath}/SKILL.md`,
        raw,
        meta,
        source,
        sourceLabel
      });
    }
    return result;
  }
  async function loadCodexSkills(codexDir) {
    const result = [];
    let entries = [];
    try {
      const out = await sh(`ls -1 "${codexDir}" 2>/dev/null`);
      entries = out.split("\n").filter((d) => d.trim());
    } catch {
      return result;
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const entryPath = `${codexDir}/${entry}`;
      if (entry.endsWith(".md")) {
        try {
          const raw = await sh(`cat "${entryPath}"`);
          const { name, description, allowedTools } = parseFrontmatter(raw);
          const id = entry.replace(/\.md$/, "");
          result.push({
            id,
            name: name || id,
            description,
            allowedTools,
            path: entryPath,
            skillFile: entryPath,
            raw,
            source: "codex",
            sourceLabel: "Codex"
          });
        } catch {
        }
      }
    }
    const systemDir = `${codexDir}/.system`;
    try {
      const sysEntries = (await sh(`ls -1 "${systemDir}" 2>/dev/null`)).split("\n").filter((d) => d.trim());
      for (const entry of sysEntries) {
        if (entry.startsWith(".")) continue;
        const entryPath = `${systemDir}/${entry}`;
        const skillMdPath = `${entryPath}/SKILL.md`;
        try {
          const raw = await sh(`cat "${skillMdPath}" 2>/dev/null`);
          const { name, description, allowedTools } = parseFrontmatter(raw);
          result.push({
            id: `.system/${entry}`,
            name: name || entry,
            description,
            allowedTools,
            path: entryPath,
            skillFile: skillMdPath,
            raw,
            source: "codex",
            sourceLabel: "Codex",
            isSystem: true
          });
        } catch {
        }
      }
    } catch {
    }
    return result;
  }
  async function loadSkills() {
    loading.value = true;
    try {
      const home = await getHome();
      customDirs.value = await loadCustomDirs();
      const all = [];
      const claudeDir = `${home}/.claude/skills`;
      all.push(...await loadDirSkills(claudeDir, "claude", "Claude"));
      const codexDir = `${home}/.codex/skills`;
      all.push(...await loadCodexSkills(codexDir));
      for (const dir of customDirs.value) {
        const label = dir.split("/").pop() || dir;
        all.push(...await loadDirSkills(dir, "custom", label));
      }
      skills.value = all;
    } catch (e) {
      ctx.ui.notify("\u52A0\u8F7D\u5931\u8D25: " + e.message, "error");
    } finally {
      loading.value = false;
    }
  }
  function openEdit(skill) {
    if (skill.isSystem) {
      ctx.ui.notify("\u7CFB\u7EDF\u5185\u7F6E Skill \u4E0D\u53EF\u7F16\u8F91", "warn");
      return;
    }
    editingSkill.value = skill;
    editContent.value = skill.raw;
    editDirty.value = false;
  }
  function closeEdit() {
    if (editDirty.value) {
      ctx.ui.confirm("\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF0C\u786E\u5B9A\u653E\u5F03\uFF1F").then((ok) => {
        if (ok) {
          editingSkill.value = null;
          editDirty.value = false;
        }
      });
    } else {
      editingSkill.value = null;
    }
  }
  async function saveEdit() {
    if (!editingSkill.value) return;
    saving.value = true;
    try {
      const content = editContent.value;
      const escapedPath = editingSkill.value.skillFile.replace(/'/g, "'\\''");
      await sh(`printf '%s' '${content.replace(/'/g, "'\\''")}' > "${escapedPath}"`);
      ctx.ui.notify("\u5DF2\u4FDD\u5B58", "info");
      await loadSkills();
      editingSkill.value = null;
      editDirty.value = false;
    } catch (e) {
      ctx.ui.notify("\u4FDD\u5B58\u5931\u8D25: " + e.message, "error");
    } finally {
      saving.value = false;
    }
  }
  async function deleteSkill(skill) {
    if (skill.isSystem) {
      ctx.ui.notify("\u7CFB\u7EDF\u5185\u7F6E Skill \u4E0D\u53EF\u5220\u9664", "warn");
      return;
    }
    const ok = await ctx.ui.confirm(`\u786E\u5B9A\u5220\u9664 Skill "${skill.name}"\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`);
    if (!ok) return;
    deleting.value = skill.id;
    try {
      if (skill.source === "codex" && skill.path.endsWith(".md")) {
        await sh(`rm -f "${skill.path}"`);
      } else {
        await sh(`rm -rf "${skill.path}"`);
      }
      ctx.ui.notify("\u5DF2\u5220\u9664", "info");
      await loadSkills();
    } catch (e) {
      ctx.ui.notify("\u5220\u9664\u5931\u8D25: " + e.message, "error");
    } finally {
      deleting.value = null;
    }
  }
  async function createSkill() {
    const name = newName.value.trim();
    if (!name) return;
    const dirName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    creating.value = true;
    try {
      const home = await getHome();
      let skillDir;
      if (newSource.value === "claude") {
        skillDir = `${home}/.claude/skills/${dirName}`;
      } else if (newSource.value === "codex") {
        skillDir = `${home}/.codex/skills/${dirName}`;
      } else {
        if (customDirs.value.length === 0) {
          ctx.ui.notify("\u8BF7\u5148\u6DFB\u52A0\u81EA\u5B9A\u4E49\u76EE\u5F55", "warn");
          creating.value = false;
          return;
        }
        skillDir = `${customDirs.value[0]}/${dirName}`;
      }
      const template = `---
name: ${name}
description: |
  ${name} skill description.
allowed-tools:
  - Read
  - Bash
---

# ${name}

\u5728\u6B64\u7F16\u5199 Skill \u7684\u8BE6\u7EC6\u6307\u4EE4\u3002
`;
      await sh(`mkdir -p "${skillDir}"`);
      await sh(`printf '%s' '${template.replace(/'/g, "'\\''")}' > "${skillDir}/SKILL.md"`);
      ctx.ui.notify("\u5DF2\u521B\u5EFA", "info");
      newName.value = "";
      showNewForm.value = false;
      await loadSkills();
      const created = skills.value.find((s) => s.id === dirName);
      if (created) openEdit(created);
    } catch (e) {
      ctx.ui.notify("\u521B\u5EFA\u5931\u8D25: " + e.message, "error");
    } finally {
      creating.value = false;
    }
  }
  async function addCustomDir() {
    const dir = newDirPath.value.trim().replace(/\/+$/, "");
    if (!dir) return;
    addingDir.value = true;
    try {
      const resolved = dir.startsWith("~") ? await getHome() + dir.slice(1) : dir;
      const check = await sh(`test -d "${resolved}" && echo yes || echo no`);
      if (check.trim() !== "yes") {
        ctx.ui.notify(`\u76EE\u5F55\u4E0D\u5B58\u5728: ${resolved}`, "error");
        addingDir.value = false;
        return;
      }
      if (customDirs.value.includes(resolved)) {
        ctx.ui.notify("\u76EE\u5F55\u5DF2\u6DFB\u52A0", "warn");
        addingDir.value = false;
        return;
      }
      const dirs = [...customDirs.value, resolved];
      await saveCustomDirs(dirs);
      customDirs.value = dirs;
      newDirPath.value = "";
      showDirForm.value = false;
      ctx.ui.notify("\u5DF2\u6DFB\u52A0\u76EE\u5F55", "info");
      await loadSkills();
    } catch (e) {
      ctx.ui.notify("\u6DFB\u52A0\u5931\u8D25: " + e.message, "error");
    } finally {
      addingDir.value = false;
    }
  }
  async function removeCustomDir(dir) {
    const ok = await ctx.ui.confirm(`\u786E\u5B9A\u79FB\u9664\u76EE\u5F55 "${dir}"\uFF1F
Skills \u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664\u3002`);
    if (!ok) return;
    const dirs = customDirs.value.filter((d) => d !== dir);
    await saveCustomDirs(dirs);
    customDirs.value = dirs;
    await loadSkills();
  }
  async function searchSkillsSh(reset = true) {
    const q = searchQuery.value.trim();
    if (q.length < 2) return;
    searching.value = true;
    if (reset) {
      searchPage.value = 0;
      searchResults.value = [];
    }
    const offset = reset ? 0 : searchPage.value * PAGE_SIZE;
    try {
      const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await ctx.exec.run(["sh", "-c", `curl -sf "${url}"`]);
      if (res.code !== 0) throw new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25");
      const data = JSON.parse(res.stdout);
      const results = (data.skills || []).map((s) => ({
        key: s.key || `${s.directory}:${s.repoOwner}:${s.repoName}`,
        name: s.name,
        directory: s.directory,
        repoOwner: s.repoOwner,
        repoName: s.repoName,
        repoBranch: s.repoBranch || "main",
        installs: s.installs || 0,
        readmeUrl: s.readmeUrl
      }));
      searchTotal.value = data.totalCount || results.length;
      if (reset) {
        searchResults.value = results;
      } else {
        searchResults.value = [...searchResults.value, ...results];
      }
    } catch (e) {
      ctx.ui.notify("\u641C\u7D22\u5931\u8D25: " + e.message, "error");
    } finally {
      searching.value = false;
    }
  }
  async function installSkill(skill) {
    installing.value = skill.key;
    try {
      const home = await getHome();
      const skillDir = `${home}/.claude/skills/${skill.directory}`;
      const exists = await ctx.exec.run(["sh", "-c", `test -d "${skillDir}" && echo yes || echo no`]);
      if (exists.stdout.trim() === "yes") {
        ctx.ui.notify(`"${skill.name}" \u5DF2\u5B89\u88C5`, "warn");
        return;
      }
      const repoUrl = `https://github.com/${skill.repoOwner}/${skill.repoName}`;
      const branch = skill.repoBranch || "main";
      const parentDir = `${home}/.claude/skills`;
      await sh([
        `cd "${parentDir}"`,
        `git clone --depth 1 --filter=blob:none --sparse -b "${branch}" "${repoUrl}" ".${skill.directory}_tmp"`,
        `cd ".${skill.directory}_tmp"`,
        `git sparse-checkout set "${skill.directory}"`,
        `mv "${skill.directory}" "../${skill.directory}"`,
        `cd ..`,
        `rm -rf ".${skill.directory}_tmp"`
      ].join(" && "));
      const meta = {
        repoOwner: skill.repoOwner,
        repoName: skill.repoName,
        repoBranch: branch,
        directory: skill.directory,
        installedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const metaJson = JSON.stringify(meta, null, 2).replace(/'/g, "'\\''");
      await sh(`printf '%s' '${metaJson}' > "${skillDir}/.skill-meta.json"`);
      ctx.ui.notify(`\u5DF2\u5B89\u88C5 "${skill.name}"`, "info");
      await loadSkills();
    } catch (e) {
      ctx.ui.notify("\u5B89\u88C5\u5931\u8D25: " + e.message, "error");
    } finally {
      installing.value = null;
    }
  }
  function isInstalled(skill) {
    return skills.value.some((s) => s.id === skill.directory);
  }
  async function syncSkill(skill) {
    if (!skill.meta) return;
    syncing.value = skill.id;
    try {
      const { repoOwner, repoName, repoBranch, directory } = skill.meta;
      const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
      const parentDir = skill.path.replace(/\/[^/]+$/, "");
      const tmpDir = `${parentDir}/.${directory}_sync_tmp`;
      await sh([
        `rm -rf "${tmpDir}"`,
        `git clone --depth 1 --filter=blob:none --sparse -b "${repoBranch}" "${repoUrl}" "${tmpDir}"`,
        `cd "${tmpDir}"`,
        `git sparse-checkout set "${directory}"`,
        `rsync -a --exclude='.skill-meta.json' "${tmpDir}/${directory}/" "${skill.path}/"`,
        `rm -rf "${tmpDir}"`
      ].join(" && "));
      const newMeta = { ...skill.meta, installedAt: new Date().toISOString() };
      const metaJson = JSON.stringify(newMeta, null, 2).replace(/'/g, "'\\''");
      await sh(`printf '%s' '${metaJson}' > "${skill.path}/.skill-meta.json"`);
      ctx.ui.notify(`"${skill.name}" \u5DF2\u540C\u6B65`, "info");
      await loadSkills();
    } catch (e) {
      ctx.ui.notify("\u540C\u6B65\u5931\u8D25: " + e.message, "error");
    } finally {
      syncing.value = null;
    }
  }
  async function syncAllSkills() {
    const syncable = skills.value.filter((s) => s.meta);
    if (syncable.length === 0) return;
    syncingAll.value = true;
    let ok = 0, fail = 0;
    for (const skill of syncable) {
      try {
        await syncSkill(skill);
        ok++;
      } catch {
        fail++;
      }
    }
    syncingAll.value = false;
    ctx.ui.notify(`\u540C\u6B65\u5B8C\u6210\uFF1A${ok} \u6210\u529F${fail > 0 ? `\uFF0C${fail} \u5931\u8D25` : ""}`, fail > 0 ? "warn" : "info");
  }
  function getFilteredSkills() {
    if (sourceFilter.value === "all") return skills.value;
    return skills.value.filter((s) => s.source === sourceFilter.value);
  }
  function getSourceCounts() {
    const counts = { all: skills.value.length, claude: 0, codex: 0, custom: 0 };
    for (const s of skills.value) counts[s.source]++;
    return counts;
  }
  ctx.commands.register("skill-manager.open", () => {
    tab.value = "installed";
  });
  ctx.commands.register("skill-manager.new", () => {
    tab.value = "installed";
    showNewForm.value = true;
  });
  function renderEditor() {
    const skill = editingSkill.value;
    return h("div", { class: "sm-editor" }, [
      h("div", { class: "sm-editor-header" }, [
        h("div", { class: "sm-editor-title" }, [
          h("span", { class: "sm-editor-name" }, skill.name),
          h("span", { class: "sm-editor-path" }, skill.id),
          h("span", { class: `sm-source-badge sm-source-${skill.source}` }, skill.sourceLabel)
        ]),
        h("div", { class: "sm-editor-actions" }, [
          h("button", {
            class: "sm-btn sm-btn-primary sm-btn-sm",
            disabled: saving.value || !editDirty.value,
            onClick: saveEdit
          }, saving.value ? "\u4FDD\u5B58\u4E2D..." : "\u4FDD\u5B58"),
          h("button", {
            class: "sm-btn sm-btn-ghost sm-btn-sm",
            onClick: closeEdit
          }, "\u5173\u95ED")
        ])
      ]),
      h("textarea", {
        class: "sm-textarea",
        value: editContent.value,
        spellcheck: false,
        onInput: (e) => {
          editContent.value = e.target.value;
          editDirty.value = true;
        }
      })
    ]);
  }
  function renderNewForm() {
    if (!showNewForm.value) return null;
    const sourceOptions = [
      { value: "claude", label: "Claude" },
      { value: "codex", label: "Codex" },
      ...customDirs.value.length > 0 ? [{ value: "custom", label: customDirs.value[0].split("/").pop() || "\u81EA\u5B9A\u4E49" }] : []
    ];
    return h("div", { class: "sm-new-form" }, [
      h("select", {
        class: "sm-select",
        value: newSource.value,
        onChange: (e) => {
          newSource.value = e.target.value;
        }
      }, sourceOptions.map(
        (opt) => h("option", { key: opt.value, value: opt.value }, opt.label)
      )),
      h("input", {
        class: "sm-input",
        placeholder: "Skill \u540D\u79F0\uFF0C\u4F8B\u5982: my-workflow",
        value: newName.value,
        autofocus: true,
        onInput: (e) => {
          newName.value = e.target.value;
        },
        onKeydown: (e) => {
          if (e.key === "Enter") createSkill();
          if (e.key === "Escape") {
            showNewForm.value = false;
            newName.value = "";
          }
        }
      }),
      h("button", {
        class: "sm-btn sm-btn-primary sm-btn-sm",
        disabled: creating.value || !newName.value.trim(),
        onClick: createSkill
      }, creating.value ? "\u521B\u5EFA\u4E2D..." : "\u521B\u5EFA"),
      h("button", {
        class: "sm-btn sm-btn-ghost sm-btn-sm",
        onClick: () => {
          showNewForm.value = false;
          newName.value = "";
        }
      }, "\u53D6\u6D88")
    ]);
  }
  function renderDirManager() {
    return h("div", { class: "sm-dir-manager" }, [
      h("div", { class: "sm-dir-header" }, [
        h("span", { class: "sm-dir-title" }, "\u81EA\u5B9A\u4E49\u76EE\u5F55"),
        h("button", {
          class: "sm-btn sm-btn-ghost sm-btn-sm",
          onClick: () => {
            showDirForm.value = !showDirForm.value;
          }
        }, showDirForm.value ? "\u53D6\u6D88" : "+ \u6DFB\u52A0\u76EE\u5F55")
      ]),
      showDirForm.value ? h("div", { class: "sm-dir-form" }, [
        h("input", {
          class: "sm-input",
          placeholder: "\u76EE\u5F55\u8DEF\u5F84\uFF0C\u4F8B\u5982: ~/my-skills \u6216 /path/to/skills",
          value: newDirPath.value,
          onInput: (e) => {
            newDirPath.value = e.target.value;
          },
          onKeydown: (e) => {
            if (e.key === "Enter") addCustomDir();
            if (e.key === "Escape") {
              showDirForm.value = false;
              newDirPath.value = "";
            }
          }
        }),
        h("button", {
          class: "sm-btn sm-btn-primary sm-btn-sm",
          disabled: addingDir.value || !newDirPath.value.trim(),
          onClick: addCustomDir
        }, addingDir.value ? "\u6DFB\u52A0\u4E2D..." : "\u6DFB\u52A0")
      ]) : null,
      customDirs.value.length > 0 ? h("div", { class: "sm-dir-list" }, customDirs.value.map(
        (dir) => h("div", { key: dir, class: "sm-dir-item" }, [
          h("span", { class: "sm-dir-path" }, dir),
          h("button", {
            class: "sm-btn sm-btn-danger sm-btn-sm",
            onClick: () => removeCustomDir(dir)
          }, "\u79FB\u9664")
        ])
      )) : h("div", { class: "sm-dir-empty" }, '\u6682\u65E0\u81EA\u5B9A\u4E49\u76EE\u5F55\uFF0C\u70B9\u51FB"+ \u6DFB\u52A0\u76EE\u5F55"\u626B\u63CF\u989D\u5916\u7684 Skills \u76EE\u5F55')
    ]);
  }
  function renderSourceFilter() {
    const counts = getSourceCounts();
    const filters = [
      { value: "all", label: `\u5168\u90E8 (${counts.all})` },
      { value: "claude", label: `Claude (${counts.claude})` },
      { value: "codex", label: `Codex (${counts.codex})` },
      { value: "custom", label: `\u81EA\u5B9A\u4E49 (${counts.custom})` }
    ];
    return h("div", { class: "sm-source-filter" }, filters.map(
      (f) => h("button", {
        key: f.value,
        class: "sm-filter-btn" + (sourceFilter.value === f.value ? " sm-filter-active" : ""),
        onClick: () => {
          sourceFilter.value = f.value;
        }
      }, f.label)
    ));
  }
  function renderSkillCard(skill) {
    const isBusy = deleting.value === skill.id;
    const isSyncing = syncing.value === skill.id;
    return h("div", { key: `${skill.source}:${skill.id}`, class: "sm-card" + (skill.isSystem ? " sm-card-system" : "") }, [
      h("div", { class: "sm-card-info" }, [
        h("div", { class: "sm-card-header" }, [
          h("span", { class: "sm-card-name" }, skill.name),
          skill.id !== skill.name ? h("span", { class: "sm-card-dir" }, skill.id) : null,
          h("span", { class: `sm-source-badge sm-source-${skill.source}` }, skill.sourceLabel),
          skill.isSystem ? h("span", { class: "sm-badge-system" }, "\u7CFB\u7EDF") : null,
          skill.meta ? h("span", { class: "sm-card-repo" }, `${skill.meta.repoOwner}/${skill.meta.repoName}`) : null
        ].filter(Boolean)),
        skill.description ? h("div", { class: "sm-card-desc" }, skill.description) : null,
        skill.allowedTools.length ? h(
          "div",
          { class: "sm-card-tools" },
          skill.allowedTools.map(
            (t) => h("span", { key: t, class: "sm-tool-tag" }, t)
          )
        ) : null
      ].filter(Boolean)),
      h("div", { class: "sm-card-actions" }, [
        skill.meta && !skill.isSystem ? h("button", {
          class: "sm-btn sm-btn-ghost sm-btn-sm",
          disabled: isSyncing || syncingAll.value,
          onClick: () => syncSkill(skill)
        }, isSyncing ? "\u540C\u6B65\u4E2D..." : "\u540C\u6B65") : null,
        h("button", {
          class: "sm-btn sm-btn-ghost sm-btn-sm",
          onClick: () => openEdit(skill)
        }, "\u7F16\u8F91"),
        !skill.isSystem ? h("button", {
          class: "sm-btn sm-btn-danger sm-btn-sm",
          disabled: isBusy,
          onClick: () => deleteSkill(skill)
        }, isBusy ? "\u5220\u9664\u4E2D..." : "\u5220\u9664") : null
      ].filter(Boolean))
    ]);
  }
  function renderInstalled() {
    const filtered = getFilteredSkills();
    const syncableCount = skills.value.filter((s) => s.meta).length;
    return h("div", { class: "sm-installed" }, [
      h("div", { class: "sm-toolbar" }, [
        h("span", { class: "sm-count" }, `${filtered.length} \u4E2A Skills`),
        syncableCount > 0 ? h("button", {
          class: "sm-btn sm-btn-ghost sm-btn-sm",
          disabled: syncingAll.value || syncing.value !== null,
          onClick: syncAllSkills
        }, syncingAll.value ? "\u540C\u6B65\u4E2D..." : `\u5168\u90E8\u540C\u6B65 (${syncableCount})`) : null,
        h("button", {
          class: "sm-btn sm-btn-primary sm-btn-sm",
          onClick: () => {
            showNewForm.value = !showNewForm.value;
          }
        }, "+ \u65B0\u5EFA"),
        h("button", {
          class: "sm-btn sm-btn-ghost sm-btn-sm",
          onClick: loadSkills
        }, "\u5237\u65B0")
      ].filter(Boolean)),
      renderSourceFilter(),
      renderNewForm(),
      renderDirManager(),
      loading.value ? h("div", { class: "sm-loading" }, "\u52A0\u8F7D\u4E2D...") : filtered.length === 0 ? h("div", { class: "sm-empty" }, [
        h("div", { class: "sm-empty-icon" }, "\u26A1"),
        h("p", null, sourceFilter.value === "all" ? "\u8FD8\u6CA1\u6709\u5B89\u88C5\u4EFB\u4F55 Skill" : `\u6CA1\u6709 ${SOURCE_LABELS[sourceFilter.value]} \u6765\u6E90\u7684 Skill`),
        h("p", { class: "sm-empty-hint" }, '\u70B9\u51FB"\u65B0\u5EFA"\u521B\u5EFA\uFF0C\u6216\u5207\u6362\u5230"\u53D1\u73B0"\u4ECE skills.sh \u5B89\u88C5')
      ]) : h("div", { class: "sm-list" }, filtered.map(renderSkillCard))
    ]);
  }
  function renderDiscoverCard(skill) {
    const installed = isInstalled(skill);
    const busy = installing.value === skill.key;
    return h("div", { key: skill.key, class: "sm-card" }, [
      h("div", { class: "sm-card-info" }, [
        h("div", { class: "sm-card-header" }, [
          h("span", { class: "sm-card-name" }, skill.name),
          h("span", { class: "sm-card-dir" }, skill.directory),
          h("span", { class: "sm-card-repo" }, `${skill.repoOwner}/${skill.repoName}`),
          skill.installs > 0 ? h("span", { class: "sm-installs" }, `\u2193${skill.installs}`) : null,
          installed ? h("span", { class: "sm-badge-installed" }, "\u5DF2\u5B89\u88C5") : null
        ].filter(Boolean))
      ]),
      h("div", { class: "sm-card-actions" }, [
        installed ? h("button", { class: "sm-btn sm-btn-ghost sm-btn-sm", disabled: true }, "\u5DF2\u5B89\u88C5") : h("button", {
          class: "sm-btn sm-btn-primary sm-btn-sm",
          disabled: busy,
          onClick: () => installSkill(skill)
        }, busy ? "\u5B89\u88C5\u4E2D..." : "\u5B89\u88C5")
      ])
    ]);
  }
  function renderDiscover() {
    const hasMore = searchResults.value.length < searchTotal.value && searchResults.value.length > 0;
    return h("div", { class: "sm-discover" }, [
      h("div", { class: "sm-search-bar" }, [
        h("input", {
          class: "sm-input sm-search-input",
          placeholder: "\u641C\u7D22 skills.sh \u516C\u5171\u76EE\u5F55\uFF08\u81F3\u5C11 2 \u4E2A\u5B57\u7B26\uFF09...",
          value: searchQuery.value,
          onInput: (e) => {
            searchQuery.value = e.target.value;
          },
          onKeydown: (e) => {
            if (e.key === "Enter") searchSkillsSh(true);
          }
        }),
        h("button", {
          class: "sm-btn sm-btn-primary sm-btn-sm",
          disabled: searching.value || searchQuery.value.trim().length < 2,
          onClick: () => searchSkillsSh(true)
        }, searching.value ? "\u641C\u7D22\u4E2D..." : "\u641C\u7D22")
      ]),
      searchResults.value.length === 0 && !searching.value ? h("div", { class: "sm-empty" }, [
        h("div", { class: "sm-empty-icon" }, "\u{1F50D}"),
        h("p", null, "\u8F93\u5165\u5173\u952E\u8BCD\u641C\u7D22 skills.sh \u4E0A\u7684\u516C\u5171 Skills"),
        h("p", { class: "sm-empty-hint" }, "Powered by skills.sh")
      ]) : h("div", { class: "sm-list" }, [
        ...searchResults.value.map(renderDiscoverCard),
        hasMore ? h("button", {
          class: "sm-btn sm-btn-ghost sm-load-more",
          disabled: searching.value,
          onClick: () => {
            searchPage.value++;
            searchSkillsSh(false);
          }
        }, searching.value ? "\u52A0\u8F7D\u4E2D..." : "\u52A0\u8F7D\u66F4\u591A") : null
      ].filter(Boolean))
    ]);
  }
  return {
    component: {
      setup() {
        ctx.onMounted(() => loadSkills());
        return {};
      },
      render() {
        if (editingSkill.value) {
          return h("div", { class: "skill-manager" }, renderEditor());
        }
        return h("div", { class: "skill-manager" }, [
          h("div", { class: "sm-header" }, [
            h("h2", { class: "sm-title" }, "Skill Manager"),
            h("div", { class: "sm-tabs" }, [
              h("button", {
                class: "sm-tab" + (tab.value === "installed" ? " sm-tab-active" : ""),
                onClick: () => {
                  tab.value = "installed";
                }
              }, `\u5DF2\u5B89\u88C5 (${skills.value.length})`),
              h("button", {
                class: "sm-tab" + (tab.value === "discover" ? " sm-tab-active" : ""),
                onClick: () => {
                  tab.value = "discover";
                }
              }, "\u53D1\u73B0")
            ])
          ]),
          tab.value === "installed" ? renderInstalled() : renderDiscover()
        ]);
      }
    }
  };
}
export {
  activate
};

import type { PluginContext, PluginExports } from '../../plugin-api/index'

interface SkillMeta {
  repoOwner: string
  repoName: string
  repoBranch: string
  directory: string
  installedAt: string
}

interface CSkillsEntry {
  name: string
  author: string
  version: string
  registryUrl: string
  installedAt: string
  updatedAt: string
}

interface LarkEntry {
  source: string
  sourceType: string
  sourceUrl: string
  skillFolderHash: string
  installedAt: string
  updatedAt: string
}

type SkillSource = 'claude' | 'codex' | 'custom' | 'cskills' | 'lark' | 'git' | 'skills-sh'

interface Skill {
  id: string
  name: string
  description: string
  allowedTools: string[]
  path: string
  skillFile: string
  raw: string
  meta?: SkillMeta
  source: SkillSource
  sourceLabel: string
  isSystem?: boolean
  disabled?: boolean
  cskillsInfo?: CSkillsEntry
  larkInfo?: LarkEntry
  gitRemote?: string
  gitBranch?: string
  symlink?: boolean
}

interface SkillsShResult {
  key: string
  name: string
  directory: string
  repoOwner: string
  repoName: string
  repoBranch: string
  installs: number
  readmeUrl?: string
}

interface SkillDetail {
  files: { name: string; size: number }[]
  totalSize: string
  lastModified: string
}

const CONFIG_PATH_SUFFIX = '/.dinotty/skill-manager-dirs.json'

const SOURCE_LABELS: Record<SkillSource, string> = {
  claude: 'Claude',
  codex: 'Codex',
  custom: '自定义',
  cskills: 'CSkills',
  lark: 'Lark',
  git: 'Git',
  'skills-sh': 'skills.sh',
}

export function activate(ctx: PluginContext): PluginExports {
  const h = ctx.h

  const skills = ctx.ref<Skill[]>([])
  const loading = ctx.ref(true)
  const tab = ctx.ref<'installed' | 'discover'>('installed')
  const sourceFilter = ctx.ref<SkillSource | 'all'>('all')

  const editingSkill = ctx.ref<Skill | null>(null)
  const editContent = ctx.ref('')
  const editDirty = ctx.ref(false)
  const saving = ctx.ref(false)
  const deleting = ctx.ref<string | null>(null)
  const showNewForm = ctx.ref(false)
  const newName = ctx.ref('')
  const newSource = ctx.ref<SkillSource>('claude')
  const creating = ctx.ref(false)

  const syncing = ctx.ref<string | null>(null)
  const syncingAll = ctx.ref(false)
  const searchQuery = ctx.ref('')
  const searchResults = ctx.ref<SkillsShResult[]>([])
  const searching = ctx.ref(false)
  const searchTotal = ctx.ref(0)
  const searchPage = ctx.ref(0)
  const installing = ctx.ref<string | null>(null)
  const PAGE_SIZE = 20

  const customDirs = ctx.ref<string[]>([])
  const showDirForm = ctx.ref(false)
  const newDirPath = ctx.ref('')
  const addingDir = ctx.ref(false)

  const updateAvailable = ctx.ref<Set<string>>(new Set())
  const checkingUpdates = ctx.ref(false)
  const expandedSkill = ctx.ref<string | null>(null)
  const skillDetails = ctx.ref<Record<string, SkillDetail>>({})
  const showDisabled = ctx.ref(true)

  async function sh(cmd: string): Promise<string> {
    const res = await ctx.exec.run(['sh', '-c', cmd])
    if (res.code !== 0) throw new Error(res.stderr || `exit ${res.code}`)
    return res.stdout
  }

  async function getHome(): Promise<string> {
    return (await sh('echo -n $HOME')).trim()
  }

  async function loadCSkillsIndex(): Promise<Record<string, CSkillsEntry>> {
    try {
      const home = await getHome()
      const raw = await sh(`cat "${home}/.cskills/installed-skills.json" 2>/dev/null`)
      const data = JSON.parse(raw)
      if (data.skills) return data.skills
    } catch { /* no index */ }
    return {}
  }

  async function loadLarkLock(): Promise<Record<string, LarkEntry>> {
    try {
      const home = await getHome()
      const raw = await sh(`cat "${home}/.agents/.skill-lock.json" 2>/dev/null`)
      const data = JSON.parse(raw)
      if (data.skills) return data.skills
    } catch { /* no lock */ }
    return {}
  }

  async function detectGitRemote(path: string): Promise<{ remote: string; branch: string } | null> {
    try {
      const out = await sh(`cd "${path}" && git config --get remote.origin.url 2>/dev/null && git branch --show-current 2>/dev/null`)
      const lines = out.trim().split('\n')
      if (lines.length >= 2 && lines[0] && lines[1]) {
        return { remote: lines[0], branch: lines[1] }
      }
    } catch { /* not a git repo */ }
    return null
  }

  function parseFrontmatter(content: string): Pick<Skill, 'name' | 'description' | 'allowedTools'> {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return { name: '', description: '', allowedTools: [] }
    const fm = match[1]

    const nameM = fm.match(/^name:\s*(.+)$/m)
    const name = nameM ? nameM[1].trim() : ''

    const descM = fm.match(/^description:\s*([\s\S]*?)(?=\n\w|\n---$|$)/m)
    let description = ''
    if (descM) {
      description = descM[1].replace(/^\|\s*\n/, '').replace(/\n\s{2,}/g, ' ').trim()
    }

    const toolsM = fm.match(/^allowed-tools:\s*\n((?:\s+-\s+.+\n?)*)/m)
    let allowedTools: string[] = []
    if (toolsM) {
      allowedTools = toolsM[1].match(/^\s+-\s+(.+)$/mg)?.map(s => s.replace(/^\s+-\s+/, '').trim()) || []
    } else {
      const inlineM = fm.match(/^allowed-tools:\s*\[([^\]]+)\]/m)
      if (inlineM) {
        allowedTools = inlineM[1].split(',').map(s => s.trim())
      }
    }

    return { name, description, allowedTools }
  }

  async function loadCustomDirs(): Promise<string[]> {
    try {
      const home = await getHome()
      const raw = await sh(`cat "${home}${CONFIG_PATH_SUFFIX}" 2>/dev/null`)
      const data = JSON.parse(raw)
      if (Array.isArray(data.customDirs)) return data.customDirs
    } catch { /* no config */ }
    return []
  }

  async function saveCustomDirs(dirs: string[]) {
    const home = await getHome()
    const configPath = `${home}${CONFIG_PATH_SUFFIX}`
    await sh(`mkdir -p "${home}/.dinotty"`)
    const data = JSON.stringify({ customDirs: dirs }, null, 2).replace(/'/g, "'\\''")
    await sh(`printf '%s' '${data}' > "${configPath}"`)
  }

  async function loadDirSkills(
    dir: string,
    source: SkillSource,
    sourceLabel: string,
    cskillsIndex: Record<string, CSkillsEntry>,
    larkLock: Record<string, LarkEntry>,
  ): Promise<Skill[]> {
    const cmd = [
      `test -d "${dir}" || exit 0`,
      `find -L "${dir}" -mindepth 1 -maxdepth 1 -type d -exec sh -c '`,
      `for d; do`,
      `  n=$(basename "$d")`,
      `  case "$n" in .*) continue ;; esac`,
      `  [ -f "$d/SKILL.md" ] || continue`,
      `  c=$(sed "s/'/'\\\\''/g" "$d/SKILL.md")`,
      `  m=""`,
      `  [ -f "$d/.skill-meta.json" ] && m=$(sed "s/'/'\\\\''/g" "$d/.skill-meta.json")`,
      `  sym=""`,
      `  [ -L "${dir}/$n" ] && sym="yes"`,
      `  dis=""`,
      `  [ -f "$d/.disabled" ] && dis="yes"`,
      `  git=""`,
      `  [ -d "$d/.git" ] && git=$(cd "$d" && git config --get remote.origin.url 2>/dev/null && git branch --show-current 2>/dev/null | tr "\\n" "|")`,
      `  printf "SKILL:%s\\n%s\\nSKILL_END\\nMETA:%s\\nMETA_END\\nSYM:%s\\nDIS:%s\\nGIT:%s\\n" "$n" "$c" "$m" "$sym" "$dis" "$git"`,
      `done' sh {} +`,
    ].join(' ')
    let out: string
    try { out = await sh(cmd) } catch { return [] }
    if (!out) return []

    const result: Skill[] = []
    const re = /SKILL:([^\n]+)\n([\s\S]*?)\nSKILL_END\nMETA:([\s\S]*?)\nMETA_END\nSYM:([^\n]*)\nDIS:([^\n]*)\nGIT:([^\n]*)\n/g
    let m: RegExpExecArray | null
    while ((m = re.exec(out)) !== null) {
      const id = m[1]
      const raw = m[2]
      const metaRaw = m[3]
      const isSymlink = m[4].trim() === 'yes'
      const isDisabled = m[5].trim() === 'yes'
      const gitInfo = m[6].trim()
      const { name, description, allowedTools } = parseFrontmatter(raw)
      let meta: SkillMeta | undefined
      if (metaRaw.trim()) {
        try { meta = JSON.parse(metaRaw) } catch { /* ignore */ }
      }
      const entryPath = `${dir}/${id}`

      let detectedSource: SkillSource = source
      let detectedLabel: string = sourceLabel
      let cskillsInfo: CSkillsEntry | undefined
      let larkInfo: LarkEntry | undefined
      let gitRemote: string | undefined
      let gitBranch: string | undefined

      if (meta) {
        detectedSource = 'skills-sh'
        detectedLabel = 'skills.sh'
      } else if (cskillsIndex[id]) {
        detectedSource = 'cskills'
        detectedLabel = 'CSkills'
        cskillsInfo = cskillsIndex[id]
      } else if (larkLock[id]) {
        detectedSource = 'lark'
        detectedLabel = 'Lark'
        larkInfo = larkLock[id]
      } else if (gitInfo) {
        const parts = gitInfo.split('|').filter(Boolean)
        if (parts.length >= 2) {
          detectedSource = 'git'
          detectedLabel = 'Git'
          gitRemote = parts[0]
          gitBranch = parts[1]
        }
      }

      result.push({
        id,
        name: name || id,
        description,
        allowedTools,
        path: entryPath,
        skillFile: `${entryPath}/SKILL.md`,
        raw,
        meta,
        source: detectedSource,
        sourceLabel: detectedLabel,
        disabled: isDisabled,
        cskillsInfo,
        larkInfo,
        gitRemote,
        gitBranch,
        symlink: isSymlink,
      })
    }
    return result
  }

  async function loadCodexSkills(codexDir: string): Promise<Skill[]> {
    const result: Skill[] = []
    let entries: string[] = []
    try {
      const out = await sh(`ls -1 "${codexDir}" 2>/dev/null`)
      entries = out.split('\n').filter(d => d.trim())
    } catch { return result }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const entryPath = `${codexDir}/${entry}`
      if (entry.endsWith('.md')) {
        try {
          const raw = await sh(`cat "${entryPath}"`)
          const { name, description, allowedTools } = parseFrontmatter(raw)
          const id = entry.replace(/\.md$/, '')
          result.push({
            id,
            name: name || id,
            description,
            allowedTools,
            path: entryPath,
            skillFile: entryPath,
            raw,
            source: 'codex',
            sourceLabel: 'Codex',
          })
        } catch { /* skip */ }
      }
    }

    const systemDir = `${codexDir}/.system`
    try {
      const sysEntries = (await sh(`ls -1 "${systemDir}" 2>/dev/null`)).split('\n').filter(d => d.trim())
      for (const entry of sysEntries) {
        if (entry.startsWith('.')) continue
        const entryPath = `${systemDir}/${entry}`
        const skillMdPath = `${entryPath}/SKILL.md`
        try {
          const raw = await sh(`cat "${skillMdPath}" 2>/dev/null`)
          const { name, description, allowedTools } = parseFrontmatter(raw)
          result.push({
            id: `.system/${entry}`,
            name: name || entry,
            description,
            allowedTools,
            path: entryPath,
            skillFile: skillMdPath,
            raw,
            source: 'codex',
            sourceLabel: 'Codex',
            isSystem: true,
          })
        } catch { /* skip */ }
      }
    } catch { /* no system dir */ }

    return result
  }

  async function loadSkills() {
    loading.value = true
    try {
      const home = await getHome()
      customDirs.value = await loadCustomDirs()

      const cskillsIndex = await loadCSkillsIndex()
      const larkLock = await loadLarkLock()

      const all: Skill[] = []

      const claudeDir = `${home}/.claude/skills`
      all.push(...await loadDirSkills(claudeDir, 'claude', 'Claude', cskillsIndex, larkLock))

      const codexDir = `${home}/.codex/skills`
      all.push(...await loadCodexSkills(codexDir))

      for (const dir of customDirs.value) {
        const label = dir.split('/').pop() || dir
        all.push(...await loadDirSkills(dir, 'custom', label, cskillsIndex, larkLock))
      }

      skills.value = all
    } catch (e: any) {
      ctx.ui.notify('加载失败: ' + e.message, 'error')
    } finally {
      loading.value = false
    }
  }

  function openEdit(skill: Skill) {
    if (skill.isSystem) {
      ctx.ui.notify('系统内置 Skill 不可编辑', 'warn')
      return
    }
    editingSkill.value = skill
    editContent.value = skill.raw
    editDirty.value = false
  }

  function closeEdit() {
    if (editDirty.value) {
      ctx.ui.confirm('有未保存的修改，确定放弃？').then(ok => {
        if (ok) { editingSkill.value = null; editDirty.value = false }
      })
    } else {
      editingSkill.value = null
    }
  }

  async function saveEdit() {
    if (!editingSkill.value) return
    saving.value = true
    try {
      const content = editContent.value
      const escapedPath = editingSkill.value.skillFile.replace(/'/g, "'\\''")
      await sh(`printf '%s' '${content.replace(/'/g, "'\\''")}' > "${escapedPath}"`)
      ctx.ui.notify('已保存', 'info')
      await loadSkills()
      editingSkill.value = null
      editDirty.value = false
    } catch (e: any) {
      ctx.ui.notify('保存失败: ' + e.message, 'error')
    } finally {
      saving.value = false
    }
  }

  async function deleteSkill(skill: Skill) {
    if (skill.isSystem) {
      ctx.ui.notify('系统内置 Skill 不可删除', 'warn')
      return
    }
    const ok = await ctx.ui.confirm(`确定删除 Skill "${skill.name}"？此操作不可撤销。`)
    if (!ok) return
    deleting.value = skill.id
    try {
      if (skill.source === 'codex' && skill.path.endsWith('.md')) {
        await sh(`rm -f "${skill.path}"`)
      } else {
        await sh(`rm -rf "${skill.path}"`)
      }
      ctx.ui.notify('已删除', 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('删除失败: ' + e.message, 'error')
    } finally {
      deleting.value = null
    }
  }

  async function createSkill() {
    const name = newName.value.trim()
    if (!name) return
    const dirName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    creating.value = true
    try {
      const home = await getHome()
      let skillDir: string
      if (newSource.value === 'claude') {
        skillDir = `${home}/.claude/skills/${dirName}`
      } else if (newSource.value === 'codex') {
        skillDir = `${home}/.codex/skills/${dirName}`
      } else {
        if (customDirs.value.length === 0) {
          ctx.ui.notify('请先添加自定义目录', 'warn')
          creating.value = false
          return
        }
        skillDir = `${customDirs.value[0]}/${dirName}`
      }
      const template = `---\nname: ${name}\ndescription: |\n  ${name} skill description.\nallowed-tools:\n  - Read\n  - Bash\n---\n\n# ${name}\n\n在此编写 Skill 的详细指令。\n`
      await sh(`mkdir -p "${skillDir}"`)
      await sh(`printf '%s' '${template.replace(/'/g, "'\\''")}' > "${skillDir}/SKILL.md"`)
      ctx.ui.notify('已创建', 'info')
      newName.value = ''
      showNewForm.value = false
      await loadSkills()
      const created = skills.value.find(s => s.id === dirName)
      if (created) openEdit(created)
    } catch (e: any) {
      ctx.ui.notify('创建失败: ' + e.message, 'error')
    } finally {
      creating.value = false
    }
  }

  async function addCustomDir() {
    const dir = newDirPath.value.trim().replace(/\/+$/, '')
    if (!dir) return
    addingDir.value = true
    try {
      const resolved = dir.startsWith('~')
        ? (await getHome()) + dir.slice(1)
        : dir
      const check = await sh(`test -d "${resolved}" && echo yes || echo no`)
      if (check.trim() !== 'yes') {
        ctx.ui.notify(`目录不存在: ${resolved}`, 'error')
        addingDir.value = false
        return
      }
      if (customDirs.value.includes(resolved)) {
        ctx.ui.notify('目录已添加', 'warn')
        addingDir.value = false
        return
      }
      const dirs = [...customDirs.value, resolved]
      await saveCustomDirs(dirs)
      customDirs.value = dirs
      newDirPath.value = ''
      showDirForm.value = false
      ctx.ui.notify('已添加目录', 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('添加失败: ' + e.message, 'error')
    } finally {
      addingDir.value = false
    }
  }

  async function removeCustomDir(dir: string) {
    const ok = await ctx.ui.confirm(`确定移除目录 "${dir}"？\nSkills 文件不会被删除。`)
    if (!ok) return
    const dirs = customDirs.value.filter(d => d !== dir)
    await saveCustomDirs(dirs)
    customDirs.value = dirs
    await loadSkills()
  }

  async function searchSkillsSh(reset = true) {
    const q = searchQuery.value.trim()
    if (q.length < 2) return
    searching.value = true
    if (reset) { searchPage.value = 0; searchResults.value = [] }
    const offset = reset ? 0 : searchPage.value * PAGE_SIZE
    try {
      const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`
      const res = await ctx.exec.run(['sh', '-c', `curl -sf "${url}"`])
      if (res.code !== 0) throw new Error('网络请求失败')
      const data = JSON.parse(res.stdout)
      const results: SkillsShResult[] = (data.skills || []).map((s: any) => ({
        key: s.key || `${s.directory}:${s.repoOwner}:${s.repoName}`,
        name: s.name,
        directory: s.directory,
        repoOwner: s.repoOwner,
        repoName: s.repoName,
        repoBranch: s.repoBranch || 'main',
        installs: s.installs || 0,
        readmeUrl: s.readmeUrl,
      }))
      searchTotal.value = data.totalCount || results.length
      if (reset) {
        searchResults.value = results
      } else {
        searchResults.value = [...searchResults.value, ...results]
      }
    } catch (e: any) {
      ctx.ui.notify('搜索失败: ' + e.message, 'error')
    } finally {
      searching.value = false
    }
  }

  async function installSkill(skill: SkillsShResult) {
    installing.value = skill.key
    try {
      const home = await getHome()
      const skillDir = `${home}/.claude/skills/${skill.directory}`
      const exists = await ctx.exec.run(['sh', '-c', `test -d "${skillDir}" && echo yes || echo no`])
      if (exists.stdout.trim() === 'yes') {
        ctx.ui.notify(`"${skill.name}" 已安装`, 'warn')
        return
      }
      const repoUrl = `https://github.com/${skill.repoOwner}/${skill.repoName}`
      const branch = skill.repoBranch || 'main'
      const parentDir = `${home}/.claude/skills`
      await sh([
        `cd "${parentDir}"`,
        `git clone --depth 1 --filter=blob:none --sparse -b "${branch}" "${repoUrl}" ".${skill.directory}_tmp"`,
        `cd ".${skill.directory}_tmp"`,
        `git sparse-checkout set "${skill.directory}"`,
        `mv "${skill.directory}" "../${skill.directory}"`,
        `cd ..`,
        `rm -rf ".${skill.directory}_tmp"`,
      ].join(' && '))
      const meta: SkillMeta = {
        repoOwner: skill.repoOwner,
        repoName: skill.repoName,
        repoBranch: branch,
        directory: skill.directory,
        installedAt: new Date().toISOString(),
      }
      const metaJson = JSON.stringify(meta, null, 2).replace(/'/g, "'\\''")
      await sh(`printf '%s' '${metaJson}' > "${skillDir}/.skill-meta.json"`)
      ctx.ui.notify(`已安装 "${skill.name}"`, 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('安装失败: ' + e.message, 'error')
    } finally {
      installing.value = null
    }
  }

  function isInstalled(skill: SkillsShResult): boolean {
    return skills.value.some(s => s.id === skill.directory)
  }

  async function syncSkill(skill: Skill) {
    syncing.value = skill.id
    try {
      if (skill.meta) {
        const { repoOwner, repoName, repoBranch, directory } = skill.meta
        const repoUrl = `https://github.com/${repoOwner}/${repoName}`
        const parentDir = skill.path.replace(/\/[^/]+$/, '')
        const tmpDir = `${parentDir}/.${directory}_sync_tmp`
        await sh([
          `rm -rf "${tmpDir}"`,
          `git clone --depth 1 --filter=blob:none --sparse -b "${repoBranch}" "${repoUrl}" "${tmpDir}"`,
          `cd "${tmpDir}"`,
          `git sparse-checkout set "${directory}"`,
          `rsync -a --exclude='.skill-meta.json' "${tmpDir}/${directory}/" "${skill.path}/"`,
          `rm -rf "${tmpDir}"`,
        ].join(' && '))
        const newMeta: SkillMeta = { ...skill.meta, installedAt: new Date().toISOString() }
        const metaJson = JSON.stringify(newMeta, null, 2).replace(/'/g, "'\\''")
        await sh(`printf '%s' '${metaJson}' > "${skill.path}/.skill-meta.json"`)
      } else if (skill.source === 'cskills') {
        await sh(`cskills sync "${skill.id}" 2>&1`)
      } else if (skill.source === 'lark') {
        await sh(`cskills sync "${skill.id}" 2>&1`)
      } else if (skill.source === 'git' && skill.gitRemote && skill.gitBranch) {
        await sh(`cd "${skill.path}" && git fetch origin && git merge origin/${skill.gitBranch} 2>&1`)
      } else {
        ctx.ui.notify('此 Skill 不支持同步', 'warn')
        return
      }
      ctx.ui.notify(`"${skill.name}" 已同步`, 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('同步失败: ' + e.message, 'error')
    } finally {
      syncing.value = null
    }
  }

  async function syncAllSkills() {
    const syncable = skills.value.filter(s => s.meta || s.source === 'cskills' || s.source === 'lark' || s.source === 'git')
    if (syncable.length === 0) return
    syncingAll.value = true
    let ok = 0, fail = 0
    for (const skill of syncable) {
      try {
        await syncSkill(skill)
        ok++
      } catch {
        fail++
      }
    }
    syncingAll.value = false
    ctx.ui.notify(`同步完成：${ok} 成功${fail > 0 ? `，${fail} 失败` : ''}`, fail > 0 ? 'warn' : 'info')
  }

  async function disableSkill(skill: Skill) {
    try {
      await sh(`touch "${skill.path}/.disabled"`)
      ctx.ui.notify(`"${skill.name}" 已禁用`, 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('禁用失败: ' + e.message, 'error')
    }
  }

  async function enableSkill(skill: Skill) {
    try {
      await sh(`rm -f "${skill.path}/.disabled"`)
      ctx.ui.notify(`"${skill.name}" 已启用`, 'info')
      await loadSkills()
    } catch (e: any) {
      ctx.ui.notify('启用失败: ' + e.message, 'error')
    }
  }

  async function checkUpdates() {
    checkingUpdates.value = true
    const updates = new Set<string>()
    try {
      for (const skill of skills.value) {
        if (skill.source === 'cskills' && skill.cskillsInfo) {
          try {
            const out = await sh(`cskills info "${skill.id}" 2>/dev/null | grep -i version | head -1`)
            const match = out.match(/(\d+\.\d+\.\d+)/)
            if (match && match[1] !== skill.cskillsInfo.version) {
              updates.add(skill.id)
            }
          } catch { /* skip */ }
        } else if (skill.source === 'git' && skill.gitBranch) {
          try {
            const out = await sh(`cd "${skill.path}" && git fetch origin ${skill.gitBranch} 2>/dev/null && git log HEAD..origin/${skill.gitBranch} --oneline 2>/dev/null | head -1`)
            if (out.trim()) {
              updates.add(skill.id)
            }
          } catch { /* skip */ }
        }
      }
      updateAvailable.value = updates
      if (updates.size > 0) {
        ctx.ui.notify(`发现 ${updates.size} 个更新`, 'info')
      } else {
        ctx.ui.notify('所有 Skill 已是最新', 'info')
      }
    } catch (e: any) {
      ctx.ui.notify('检查更新失败: ' + e.message, 'error')
    } finally {
      checkingUpdates.value = false
    }
  }

  async function loadSkillDetail(skill: Skill) {
    if (skillDetails.value[skill.id]) return
    try {
      const out = await sh(`cd "${skill.path}" && find . -type f -exec stat -f "%N|%z|%m" {} + 2>/dev/null | head -20`)
      const files: { name: string; size: number }[] = []
      let totalSize = 0
      let lastModified = ''
      let lastModTime = 0
      for (const line of out.split('\n').filter(Boolean)) {
        const parts = line.split('|')
        if (parts.length >= 3) {
          const name = parts[0].replace(/^\.\//, '')
          const size = parseInt(parts[1], 10) || 0
          const modTime = parseInt(parts[2], 10) || 0
          files.push({ name, size })
          totalSize += size
          if (modTime > lastModTime) {
            lastModTime = modTime
            lastModified = new Date(modTime * 1000).toLocaleString('zh-CN')
          }
        }
      }
      const sizeStr = totalSize > 1024 * 1024
        ? (totalSize / 1024 / 1024).toFixed(1) + ' MB'
        : totalSize > 1024
          ? (totalSize / 1024).toFixed(1) + ' KB'
          : totalSize + ' B'
      skillDetails.value[skill.id] = { files, totalSize: sizeStr, lastModified }
    } catch { /* skip */ }
  }

  function getFilteredSkills(): Skill[] {
    let filtered = skills.value
    if (sourceFilter.value !== 'all') {
      filtered = filtered.filter(s => s.source === sourceFilter.value)
    }
    if (!showDisabled.value) {
      filtered = filtered.filter(s => !s.disabled)
    }
    return filtered
  }

  function getSourceCounts(): Record<SkillSource | 'all', number> {
    const counts: Record<string, number> = { all: skills.value.length, claude: 0, codex: 0, custom: 0, cskills: 0, lark: 0, git: 0, 'skills-sh': 0 }
    for (const s of skills.value) counts[s.source]++
    return counts as Record<SkillSource | 'all', number>
  }

  ctx.commands.register('skill-manager.open', () => { tab.value = 'installed' })
  ctx.commands.register('skill-manager.new', () => { tab.value = 'installed'; showNewForm.value = true })

  // ──────── Render ────────

  function renderEditor() {
    const skill = editingSkill.value!
    return h('div', { class: 'sm-editor' }, [
      h('div', { class: 'sm-editor-header' }, [
        h('div', { class: 'sm-editor-title' }, [
          h('span', { class: 'sm-editor-name' }, skill.name),
          h('span', { class: 'sm-editor-path' }, skill.id),
          h('span', { class: `sm-source-badge sm-source-${skill.source}` }, skill.sourceLabel),
        ]),
        h('div', { class: 'sm-editor-actions' }, [
          h('button', {
            class: 'sm-btn sm-btn-primary sm-btn-sm',
            disabled: saving.value || !editDirty.value,
            onClick: saveEdit,
          }, saving.value ? '保存中...' : '保存'),
          h('button', {
            class: 'sm-btn sm-btn-ghost sm-btn-sm',
            onClick: closeEdit,
          }, '关闭'),
        ]),
      ]),
      h('textarea', {
        class: 'sm-textarea',
        value: editContent.value,
        spellcheck: false,
        onInput: (e: Event) => {
          editContent.value = (e.target as HTMLTextAreaElement).value
          editDirty.value = true
        },
      }),
    ])
  }

  function renderNewForm() {
    if (!showNewForm.value) return null
    const sourceOptions: { value: SkillSource; label: string }[] = [
      { value: 'claude', label: 'Claude' },
      { value: 'codex', label: 'Codex' },
      ...(customDirs.value.length > 0 ? [{ value: 'custom' as SkillSource, label: customDirs.value[0].split('/').pop() || '自定义' }] : []),
    ]
    return h('div', { class: 'sm-new-form' }, [
      h('select', {
        class: 'sm-select',
        value: newSource.value,
        onChange: (e: Event) => { newSource.value = (e.target as HTMLSelectElement).value as SkillSource },
      }, sourceOptions.map(opt =>
        h('option', { key: opt.value, value: opt.value }, opt.label)
      )),
      h('input', {
        class: 'sm-input',
        placeholder: 'Skill 名称，例如: my-workflow',
        value: newName.value,
        autofocus: true,
        onInput: (e: Event) => { newName.value = (e.target as HTMLInputElement).value },
        onKeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') createSkill()
          if (e.key === 'Escape') { showNewForm.value = false; newName.value = '' }
        },
      }),
      h('button', {
        class: 'sm-btn sm-btn-primary sm-btn-sm',
        disabled: creating.value || !newName.value.trim(),
        onClick: createSkill,
      }, creating.value ? '创建中...' : '创建'),
      h('button', {
        class: 'sm-btn sm-btn-ghost sm-btn-sm',
        onClick: () => { showNewForm.value = false; newName.value = '' },
      }, '取消'),
    ])
  }

  function renderDirManager() {
    return h('div', { class: 'sm-dir-manager' }, [
      h('div', { class: 'sm-dir-header' }, [
        h('span', { class: 'sm-dir-title' }, '自定义目录'),
        h('button', {
          class: 'sm-btn sm-btn-ghost sm-btn-sm',
          onClick: () => { showDirForm.value = !showDirForm.value },
        }, showDirForm.value ? '取消' : '+ 添加目录'),
      ]),
      showDirForm.value
        ? h('div', { class: 'sm-dir-form' }, [
            h('input', {
              class: 'sm-input',
              placeholder: '目录路径，例如: ~/my-skills 或 /path/to/skills',
              value: newDirPath.value,
              onInput: (e: Event) => { newDirPath.value = (e.target as HTMLInputElement).value },
              onKeydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter') addCustomDir()
                if (e.key === 'Escape') { showDirForm.value = false; newDirPath.value = '' }
              },
            }),
            h('button', {
              class: 'sm-btn sm-btn-primary sm-btn-sm',
              disabled: addingDir.value || !newDirPath.value.trim(),
              onClick: addCustomDir,
            }, addingDir.value ? '添加中...' : '添加'),
          ])
        : null,
      customDirs.value.length > 0
        ? h('div', { class: 'sm-dir-list' }, customDirs.value.map(dir =>
            h('div', { key: dir, class: 'sm-dir-item' }, [
              h('span', { class: 'sm-dir-path' }, dir),
              h('button', {
                class: 'sm-btn sm-btn-danger sm-btn-sm',
                onClick: () => removeCustomDir(dir),
              }, '移除'),
            ])
          ))
        : h('div', { class: 'sm-dir-empty' }, '暂无自定义目录，点击"+ 添加目录"扫描额外的 Skills 目录'),
    ])
  }

  function renderSourceFilter() {
    const counts = getSourceCounts()
    const filters: { value: SkillSource | 'all'; label: string }[] = [
      { value: 'all', label: `全部 (${counts.all})` },
      { value: 'claude', label: `Claude (${counts.claude})` },
      { value: 'codex', label: `Codex (${counts.codex})` },
      { value: 'cskills', label: `CSkills (${counts.cskills})` },
      { value: 'lark', label: `Lark (${counts.lark})` },
      { value: 'git', label: `Git (${counts.git})` },
      { value: 'skills-sh', label: `skills.sh (${counts['skills-sh']})` },
      { value: 'custom', label: `自定义 (${counts.custom})` },
    ]
    return h('div', { class: 'sm-source-filter' }, filters.map(f =>
      h('button', {
        key: f.value,
        class: 'sm-filter-btn' + (sourceFilter.value === f.value ? ' sm-filter-active' : ''),
        onClick: () => { sourceFilter.value = f.value },
      }, f.label)
    ))
  }

  function renderSkillCard(skill: Skill) {
    const isBusy = deleting.value === skill.id
    const isSyncing = syncing.value === skill.id
    const isExpanded = expandedSkill.value === skill.id
    const hasUpdate = updateAvailable.value.has(skill.id)
    const detail = skillDetails.value[skill.id]
    const isSyncable = !!(skill.meta || skill.source === 'cskills' || skill.source === 'lark' || skill.source === 'git')
    const cardClass = 'sm-card'
      + (skill.isSystem ? ' sm-card-system' : '')
      + (skill.disabled ? ' sm-card-disabled' : '')
      + (isExpanded ? ' sm-card-expanded' : '')
    return h('div', { key: `${skill.source}:${skill.id}`, class: cardClass }, [
      h('div', {
        class: 'sm-card-info',
        onClick: () => {
          if (isExpanded) {
            expandedSkill.value = null
          } else {
            expandedSkill.value = skill.id
            loadSkillDetail(skill)
          }
        },
      }, [
        h('div', { class: 'sm-card-header' }, [
          h('span', { class: 'sm-card-name' }, skill.name),
          skill.id !== skill.name
            ? h('span', { class: 'sm-card-dir' }, skill.id)
            : null,
          h('span', { class: `sm-source-badge sm-source-${skill.source}` }, skill.sourceLabel),
          skill.isSystem ? h('span', { class: 'sm-badge-system' }, '系统') : null,
          skill.disabled ? h('span', { class: 'sm-badge-disabled' }, '已禁用') : null,
          hasUpdate ? h('span', { class: 'sm-badge-update' }, '有更新') : null,
          skill.symlink ? h('span', { class: 'sm-badge-symlink' }, 'symlink') : null,
          skill.meta
            ? h('span', { class: 'sm-card-repo' }, `${skill.meta.repoOwner}/${skill.meta.repoName}`)
            : null,
          skill.source === 'cskills' && skill.cskillsInfo
            ? h('span', { class: 'sm-card-repo' }, `v${skill.cskillsInfo.version}`)
            : null,
          skill.source === 'git' && skill.gitBranch
            ? h('span', { class: 'sm-card-repo' }, skill.gitBranch)
            : null,
        ].filter(Boolean)),
        skill.description
          ? h('div', { class: 'sm-card-desc' }, skill.description)
          : null,
        skill.allowedTools.length
          ? h('div', { class: 'sm-card-tools' },
              skill.allowedTools.map(t =>
                h('span', { key: t, class: 'sm-tool-tag' }, t)
              )
            )
          : null,
        isExpanded && detail
          ? h('div', { class: 'sm-card-detail' }, [
              h('div', { class: 'sm-detail-meta' }, [
                h('span', null, `大小: ${detail.totalSize}`),
                detail.lastModified ? h('span', null, `修改: ${detail.lastModified}`) : null,
                h('span', null, `文件: ${detail.files.length}`),
              ].filter(Boolean)),
              h('div', { class: 'sm-detail-files' },
                detail.files.map(f =>
                  h('span', { key: f.name, class: 'sm-detail-file' }, f.name)
                )
              ),
            ])
          : isExpanded
            ? h('div', { class: 'sm-card-detail' }, '加载中...')
            : null,
      ].filter(Boolean)),
      h('div', { class: 'sm-card-actions' }, [
        isSyncable && !skill.isSystem
          ? h('button', {
              class: 'sm-btn sm-btn-ghost sm-btn-sm',
              disabled: isSyncing || syncingAll.value,
              onClick: (e: Event) => { e.stopPropagation(); syncSkill(skill) },
            }, isSyncing ? '同步中...' : '同步')
          : null,
        !skill.isSystem
          ? h('button', {
              class: 'sm-btn sm-btn-ghost sm-btn-sm',
              onClick: (e: Event) => { e.stopPropagation(); skill.disabled ? enableSkill(skill) : disableSkill(skill) },
            }, skill.disabled ? '启用' : '禁用')
          : null,
        h('button', {
          class: 'sm-btn sm-btn-ghost sm-btn-sm',
          onClick: (e: Event) => { e.stopPropagation(); openEdit(skill) },
        }, '编辑'),
        !skill.isSystem
          ? h('button', {
              class: 'sm-btn sm-btn-danger sm-btn-sm',
              disabled: isBusy,
              onClick: (e: Event) => { e.stopPropagation(); deleteSkill(skill) },
            }, isBusy ? '删除中...' : '删除')
          : null,
      ].filter(Boolean)),
    ])
  }

  function renderInstalled() {
    const filtered = getFilteredSkills()
    const syncableCount = skills.value.filter(s => s.meta || s.source === 'cskills' || s.source === 'lark' || s.source === 'git').length
    const disabledCount = skills.value.filter(s => s.disabled).length
    return h('div', { class: 'sm-installed' }, [
      h('div', { class: 'sm-toolbar' }, [
        h('span', { class: 'sm-count' }, `${filtered.length} 个 Skills`),
        syncableCount > 0
          ? h('button', {
              class: 'sm-btn sm-btn-ghost sm-btn-sm',
              disabled: syncingAll.value || syncing.value !== null,
              onClick: syncAllSkills,
            }, syncingAll.value ? '同步中...' : `全部同步 (${syncableCount})`)
          : null,
        h('button', {
          class: 'sm-btn sm-btn-ghost sm-btn-sm',
          disabled: checkingUpdates.value,
          onClick: checkUpdates,
        }, checkingUpdates.value ? '检查中...' : '检查更新'),
        disabledCount > 0
          ? h('button', {
              class: 'sm-btn sm-btn-ghost sm-btn-sm' + (showDisabled.value ? '' : ' sm-btn-off'),
              onClick: () => { showDisabled.value = !showDisabled.value },
            }, showDisabled.value ? `已禁用 (${disabledCount})` : `隐藏已禁用`)
          : null,
        h('button', {
          class: 'sm-btn sm-btn-primary sm-btn-sm',
          onClick: () => { showNewForm.value = !showNewForm.value },
        }, '+ 新建'),
        h('button', {
          class: 'sm-btn sm-btn-ghost sm-btn-sm',
          onClick: loadSkills,
        }, '刷新'),
      ].filter(Boolean)),
      renderSourceFilter(),
      renderNewForm(),
      renderDirManager(),
      loading.value
        ? h('div', { class: 'sm-loading' }, '加载中...')
        : filtered.length === 0
          ? h('div', { class: 'sm-empty' }, [
              h('div', { class: 'sm-empty-icon' }, '⚡'),
              h('p', null, sourceFilter.value === 'all' ? '还没有安装任何 Skill' : `没有 ${SOURCE_LABELS[sourceFilter.value as SkillSource]} 来源的 Skill`),
              h('p', { class: 'sm-empty-hint' }, '点击"新建"创建，或切换到"发现"从 skills.sh 安装'),
            ])
          : h('div', { class: 'sm-list' }, filtered.map(renderSkillCard)),
    ])
  }

  function renderDiscoverCard(skill: SkillsShResult) {
    const installed = isInstalled(skill)
    const busy = installing.value === skill.key
    return h('div', { key: skill.key, class: 'sm-card' }, [
      h('div', { class: 'sm-card-info' }, [
        h('div', { class: 'sm-card-header' }, [
          h('span', { class: 'sm-card-name' }, skill.name),
          h('span', { class: 'sm-card-dir' }, skill.directory),
          h('span', { class: 'sm-card-repo' }, `${skill.repoOwner}/${skill.repoName}`),
          skill.installs > 0
            ? h('span', { class: 'sm-installs' }, `↓${skill.installs}`)
            : null,
          installed ? h('span', { class: 'sm-badge-installed' }, '已安装') : null,
        ].filter(Boolean)),
      ]),
      h('div', { class: 'sm-card-actions' }, [
        installed
          ? h('button', { class: 'sm-btn sm-btn-ghost sm-btn-sm', disabled: true }, '已安装')
          : h('button', {
              class: 'sm-btn sm-btn-primary sm-btn-sm',
              disabled: busy,
              onClick: () => installSkill(skill),
            }, busy ? '安装中...' : '安装'),
      ]),
    ])
  }

  function renderDiscover() {
    const hasMore = searchResults.value.length < searchTotal.value && searchResults.value.length > 0
    return h('div', { class: 'sm-discover' }, [
      h('div', { class: 'sm-search-bar' }, [
        h('input', {
          class: 'sm-input sm-search-input',
          placeholder: '搜索 skills.sh 公共目录（至少 2 个字符）...',
          value: searchQuery.value,
          onInput: (e: Event) => { searchQuery.value = (e.target as HTMLInputElement).value },
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') searchSkillsSh(true)
          },
        }),
        h('button', {
          class: 'sm-btn sm-btn-primary sm-btn-sm',
          disabled: searching.value || searchQuery.value.trim().length < 2,
          onClick: () => searchSkillsSh(true),
        }, searching.value ? '搜索中...' : '搜索'),
      ]),
      searchResults.value.length === 0 && !searching.value
        ? h('div', { class: 'sm-empty' }, [
            h('div', { class: 'sm-empty-icon' }, '🔍'),
            h('p', null, '输入关键词搜索 skills.sh 上的公共 Skills'),
            h('p', { class: 'sm-empty-hint' }, 'Powered by skills.sh'),
          ])
        : h('div', { class: 'sm-list' }, [
            ...searchResults.value.map(renderDiscoverCard),
            hasMore
              ? h('button', {
                  class: 'sm-btn sm-btn-ghost sm-load-more',
                  disabled: searching.value,
                  onClick: () => { searchPage.value++; searchSkillsSh(false) },
                }, searching.value ? '加载中...' : '加载更多')
              : null,
          ].filter(Boolean)),
    ])
  }

  return {
    component: {
      setup() {
        ctx.onMounted(() => loadSkills())
        return {}
      },
      render() {
        if (editingSkill.value) {
          return h('div', { class: 'skill-manager' }, renderEditor())
        }
        return h('div', { class: 'skill-manager' }, [
          h('div', { class: 'sm-header' }, [
            h('h2', { class: 'sm-title' }, 'Skill Manager'),
            h('div', { class: 'sm-tabs' }, [
              h('button', {
                class: 'sm-tab' + (tab.value === 'installed' ? ' sm-tab-active' : ''),
                onClick: () => { tab.value = 'installed' },
              }, `已安装 (${skills.value.length})`),
              h('button', {
                class: 'sm-tab' + (tab.value === 'discover' ? ' sm-tab-active' : ''),
                onClick: () => { tab.value = 'discover' },
              }, '发现'),
            ]),
          ]),
          tab.value === 'installed' ? renderInstalled() : renderDiscover(),
        ])
      },
    },
  }
}

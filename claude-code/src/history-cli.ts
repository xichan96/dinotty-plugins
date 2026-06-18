import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'

// --- Paths ---
const HOME = process.env.HOME || '/root'
const CLAUDE_DIR = path.join(HOME, '.claude')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

// --- Types ---
interface Project { path: string; encodedPath: string; sessionCount: number }
interface Session { id: string; project: string; encodedPath: string; firstPrompt: string; lastTimestamp: string; messageCount: number; gitBranch?: string }
interface Message { uuid: string; role: 'user' | 'assistant'; content: string; timestamp: string; model?: string; toolUses?: { name: string; summary: string }[] }
interface SearchResult { session: Session; match: string }

// --- Helpers ---
function readLines(filePath: string): string[] {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim())
  } catch { return [] }
}

function readSessionMeta(filePath: string, id: string, encodedPath: string): Session | null {
  const lines = readLines(filePath)
  if (lines.length === 0) return null

  let firstPrompt = ''
  let gitBranch = ''
  let firstTimestamp = ''
  let cwd = ''

  for (const line of lines.slice(0, 30)) {
    try {
      const obj = JSON.parse(line)
      if (!cwd && obj.cwd) cwd = obj.cwd
      if (obj.type === 'user' && typeof obj.message?.content === 'string') {
        firstPrompt = obj.message.content
        gitBranch = obj.gitBranch || ''
        firstTimestamp = obj.timestamp || ''
        if (obj.cwd) cwd = obj.cwd
        break
      }
    } catch { /* skip */ }
  }

  if (!cwd) {
    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (obj.cwd) { cwd = obj.cwd; break }
      } catch { /* skip */ }
    }
  }

  try {
    const last = JSON.parse(lines[lines.length - 1])
    if (last.type === 'last-prompt' && last.lastPrompt) {
      if (!firstPrompt) firstPrompt = last.lastPrompt
    }
  } catch { /* skip */ }

  let lastTimestamp = firstTimestamp
  if (!lastTimestamp) {
    try {
      const stat = fs.statSync(filePath)
      lastTimestamp = stat.mtime.toISOString()
    } catch { /* skip */ }
  }

  const messageCount = lines.filter(l => l.includes('"type":"user"')).length
  const projectPath = cwd || fallbackDecode(encodedPath)

  return {
    id,
    project: projectPath,
    encodedPath,
    firstPrompt: firstPrompt.slice(0, 200),
    lastTimestamp,
    messageCount,
    gitBranch: gitBranch || undefined,
  }
}

function fallbackDecode(encodedPath: string): string {
  return '/' + encodedPath.replace(/^-/, '').replace(/-/g, '/')
}

function parseMessage(obj: any): Message | null {
  if (obj.type === 'user') {
    if (typeof obj.message?.content !== 'string') return null
    return {
      uuid: obj.uuid || '',
      role: 'user',
      content: obj.message.content,
      timestamp: obj.timestamp || '',
    }
  }
  if (obj.type === 'assistant') {
    const content = obj.message?.content || []
    const textParts: string[] = []
    const toolUses: { name: string; summary: string }[] = []

    for (const block of content) {
      if (block.type === 'text') textParts.push(block.text)
      else if (block.type === 'tool_use') {
        toolUses.push({ name: block.name, summary: summarizeTool(block.name, block.input) })
      }
    }

    return {
      uuid: obj.uuid || '',
      role: 'assistant',
      content: textParts.join('\n'),
      timestamp: obj.timestamp || '',
      model: obj.message?.model,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
    }
  }
  return null
}

function summarizeTool(name: string, input: any): string {
  if (!input) return name
  switch (name) {
    case 'Bash': return (input.command || name).slice(0, 80)
    case 'Read': return input.file_path || name
    case 'Edit': return input.file_path || name
    case 'Write': return input.file_path || name
    case 'Grep': return input.pattern || name
    case 'Glob': return input.pattern || name
    case 'Agent': return (input.description || name).slice(0, 60)
    case 'WebFetch': return (input.url || name).slice(0, 60)
    case 'WebSearch': return (input.query || name).slice(0, 60)
    default: return name
  }
}

// --- Subcommands ---

function cmdListProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) { console.log('[]'); return }
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
  const projects: Project[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = path.join(PROJECTS_DIR, entry.name)
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
      if (files.length === 0) continue

      let projectPath = fallbackDecode(entry.name)
      for (const file of files) {
        const lines = readLines(path.join(dir, file))
        for (const line of lines.slice(0, 10)) {
          try {
            const obj = JSON.parse(line)
            if (obj.cwd) { projectPath = obj.cwd; break }
          } catch { /* skip */ }
        }
        if (projectPath !== fallbackDecode(entry.name)) break
      }

      projects.push({ path: projectPath, encodedPath: entry.name, sessionCount: files.length })
    } catch { /* skip */ }
  }

  projects.sort((a, b) => b.sessionCount - a.sessionCount)
  console.log(JSON.stringify(projects))
}

function cmdListSessions(encodedPath: string) {
  const dir = path.join(PROJECTS_DIR, encodedPath)
  if (!fs.existsSync(dir)) { console.log('[]'); return }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime)

  const sessions: Session[] = []
  for (const file of files) {
    const id = file.name.replace('.jsonl', '')
    if (id.length < 10) continue
    const meta = readSessionMeta(path.join(dir, file.name), id, encodedPath)
    if (meta) sessions.push(meta)
  }

  console.log(JSON.stringify(sessions))
}

function cmdReadSession(encodedPath: string, sessionId: string) {
  const filePath = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`)
  const lines = readLines(filePath)
  const messages: Message[] = []

  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      const msg = parseMessage(obj)
      if (msg) messages.push(msg)
    } catch { /* skip */ }
  }

  console.log(JSON.stringify(messages))
}

function cmdSearch(query: string) {
  if (!fs.existsSync(PROJECTS_DIR)) { console.log('[]'); return }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const results: SearchResult[] = []

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))

  for (const proj of projectDirs) {
    const dir = path.join(PROJECTS_DIR, proj.name)
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
      for (const file of files) {
        if (results.length >= 20) break
        const filePath = path.join(dir, file)
        const lines = readLines(filePath)
        let matchText = ''

        for (const line of lines) {
          if (!new RegExp(escaped, 'i').test(line)) continue
          try {
            const obj = JSON.parse(line)
            if (obj.type === 'user' && typeof obj.message?.content === 'string') {
              matchText = obj.message.content
            } else if (obj.type === 'assistant') {
              matchText = (obj.message?.content || [])
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join(' ')
            }
          } catch {
            matchText = line.slice(0, 100)
          }
          break
        }

        if (matchText) {
          const id = file.replace('.jsonl', '')
          const session = readSessionMeta(filePath, id, proj.name)
          if (session) results.push({ session, match: matchText.slice(0, 200) })
        }
      }
    } catch { /* skip */ }
  }

  console.log(JSON.stringify(results))
}

function cmdListRecent(limit: number = 30) {
  if (!fs.existsSync(PROJECTS_DIR)) { console.log('[]'); return }

  const all: Session[] = []
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = path.join(PROJECTS_DIR, entry.name)
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)

      for (const file of files) {
        const id = file.name.replace('.jsonl', '')
        if (id.length < 10) continue
        const meta = readSessionMeta(path.join(dir, file.name), id, entry.name)
        if (meta) all.push(meta)
      }
    } catch { /* skip */ }
  }

  all.sort((a, b) => {
    const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
    const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
    return tb - ta
  })

  console.log(JSON.stringify(all.slice(0, limit)))
}

function parseFrontmatter(raw: string): { name?: string; description?: string; allowedTools?: string[] } {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return {}

  const fm = fmMatch[1]
  const lines = fm.split('\n')
  const result: { name?: string; description?: string; allowedTools?: string[] } = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // name
    const nameMatch = line.match(/^name:\s*(.+)$/)
    if (nameMatch) {
      result.name = nameMatch[1].trim()
      i++
      continue
    }

    // description: inline or block scalar
    if (line.match(/^description:\s*\|/)) {
      // Block scalar: collect indented lines
      const blockLines: string[] = []
      i++
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
        const trimmed = lines[i].trim()
        if (trimmed) blockLines.push(trimmed)
        i++
      }
      result.description = blockLines.join(' ').slice(0, 200)
      continue
    }
    const descInlineMatch = line.match(/^description:\s*(.+)$/)
    if (descInlineMatch) {
      result.description = descInlineMatch[1].trim()
      i++
      continue
    }

    // allowed-tools: inline or YAML list
    if (line.match(/^allowed-tools:\s*\|/)) {
      const blockLines: string[] = []
      i++
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
        const trimmed = lines[i].trim().replace(/^-\s*/, '')
        if (trimmed) blockLines.push(trimmed)
        i++
      }
      result.allowedTools = blockLines
      continue
    }
    const toolsInlineMatch = line.match(/^allowed-tools:\s*(.+)$/)
    if (toolsInlineMatch) {
      result.allowedTools = toolsInlineMatch[1].split(',').map(t => t.trim()).filter(Boolean)
      i++
      continue
    }
    if (line.match(/^allowed-tools:\s*$/)) {
      // YAML list on following lines
      const tools: string[] = []
      i++
      while (i < lines.length && lines[i].match(/^\s*-\s/)) {
        const tool = lines[i].replace(/^\s*-\s*/, '').trim().split('#')[0].trim()
        if (tool) tools.push(tool)
        i++
      }
      result.allowedTools = tools
      continue
    }

    i++
  }

  return result
}

function cmdListSkills() {
  const skillsDir = path.join(CLAUDE_DIR, 'skills')
  if (!fs.existsSync(skillsDir)) { console.log('[]'); return }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  const skills: { id: string; name: string; description: string; allowedTools: string[] }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const skillDir = path.join(skillsDir, entry.name)
    const skillMd = path.join(skillDir, 'SKILL.md')
    try {
      const raw = fs.readFileSync(skillMd, 'utf-8')
      const meta = parseFrontmatter(raw)

      let description = meta.description || ''
      if (!description) {
        const afterFm = raw.replace(/^---\n[\s\S]*?\n---\n?/, '')
        const line = afterFm.split('\n').find(l => l.trim() && !l.startsWith('#'))
        if (line) description = line.trim().slice(0, 200)
      }

      skills.push({
        id: entry.name,
        name: meta.name || entry.name,
        description,
        allowedTools: meta.allowedTools || [],
      })
    } catch { /* skip */ }
  }

  console.log(JSON.stringify(skills))
}

function cmdClaudeCall(args: string[]) {
  const flag = args[0] // --new or --resume
  const sessionId = args[1]
  const prompt = args.slice(2).join(' ')

  if (!flag || !sessionId || !prompt) {
    console.error('Usage: claude-call --new|--resume <session-id> <prompt>')
    process.exit(1)
  }

  const claudeArgs = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits']
  if (flag === '--new') {
    claudeArgs.push('--session-id', sessionId, '--model', 'sonnet')
  } else {
    claudeArgs.push('--resume', sessionId)
  }

  execFile('claude', claudeArgs, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      console.error(stderr || err.message)
      process.exit(1)
      return
    }
    try {
      const data = JSON.parse(stdout)
      console.log(JSON.stringify({
        sessionId: data.session_id || sessionId,
        response: data.result || '',
        costUsd: data.cost_usd || 0,
      }))
    } catch {
      console.log(JSON.stringify({
        sessionId,
        response: stdout.trim(),
        costUsd: 0,
      }))
    }
  })
}

// --- Main ---
const [,, subcommand, ...args] = process.argv

switch (subcommand) {
  case 'list-projects':
    cmdListProjects()
    break
  case 'list-sessions':
    if (!args[0]) { console.error('Usage: list-sessions <encodedPath>'); process.exit(1) }
    cmdListSessions(args[0])
    break
  case 'read-session':
    if (!args[0] || !args[1]) { console.error('Usage: read-session <encodedPath> <sessionId>'); process.exit(1) }
    cmdReadSession(args[0], args[1])
    break
  case 'search':
    if (!args[0]) { console.error('Usage: search <query>'); process.exit(1) }
    cmdSearch(args.join(' '))
    break
  case 'list-recent':
    cmdListRecent(args[0] ? parseInt(args[0], 10) : 30)
    break
  case 'list-skills':
    cmdListSkills()
    break
  case 'claude-call':
    cmdClaudeCall(args)
    break
  default:
    console.error(`Unknown subcommand: ${subcommand}`)
    console.error('Available: list-projects, list-sessions, read-session, search, list-recent, list-skills, claude-call')
    process.exit(1)
}

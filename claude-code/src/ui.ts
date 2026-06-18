import type { PluginContext, PluginExports } from '../../plugin-api/index'
import type { Session, Message, Project, SearchResult } from './types'
import { listProjects, listSessions, readSession, searchSessions, listRecentSessions, listSkills } from './history'
import { createConversation, continueConversation } from './claude'
import {
  initIcons,
  IconSearch, IconRefresh, IconPlus, IconX, IconChevronRight, IconChevronDown,
  IconArrowLeft, IconSend, IconMenu, IconBrain, IconCopy, IconCheck,
  IconFolder, IconZap, IconHash, IconTerminal, IconFileText, IconPencil,
  IconEye, IconGlobe, IconSettings, IconMessageSquare, IconSquarePen, IconClaude,
} from './icons'

export function activate(ctx: PluginContext): PluginExports {
  const h = ctx.h
  initIcons(h)

  // --- State ---
  const view = ctx.ref<'browse' | 'chat'>('browse')
  const projects = ctx.ref<Project[]>([])
  const sessions = ctx.ref<Session[]>([])
  const selectedProject = ctx.ref<string | null>(null)
  const selectedProjectEncoded = ctx.ref<string | null>(null)
  const activeSession = ctx.ref<Session | null>(null)
  const messages = ctx.ref<Message[]>([])
  const searchQuery = ctx.ref('')
  const searchResults = ctx.ref<SearchResult[]>([])
  const searching = ctx.ref(false)
  const inputText = ctx.ref('')
  const sending = ctx.ref(false)
  const loading = ctx.ref(false)
  const costTotal = ctx.ref(0)
  const error = ctx.ref<string | null>(null)
  const sidebarOpen = ctx.ref(false)
  const sidebarTab = ctx.ref<'history' | 'search'>('history')
  const chatScrollRef = ctx.ref<HTMLElement | null>(null)
  const expandedTools = ctx.ref<Set<string>>(new Set())
  const recentSessions = ctx.ref<Session[]>([])
  const showCmdPalette = ctx.ref(false)
  const cmdFilter = ctx.ref('')
  const cmdSelectedIdx = ctx.ref(0)
  const skillsList = ctx.ref<{ id: string; name: string; description: string; allowedTools: string[] }[]>([])
  const showSkillsPanel = ctx.ref(false)
  const selectedSkillId = ctx.ref<string | null>(null)
  const browseSearch = ctx.ref('')
  const browseSearchOpen = ctx.ref(false)
  const permissionMode = ctx.ref<'default' | 'agent' | 'plan'>('default')
  const thinkingEnabled = ctx.ref(false)

  // --- Slash commands ---
  interface SlashCmd { name: string; desc: string; action: () => void }
  const slashCommands: SlashCmd[] = [
    { name: '/new', desc: 'Start a new conversation', action: startNewChat },
    { name: '/open', desc: 'Open Claude Code', action: () => { view.value = 'browse'; sidebarOpen.value = true; loadProjects() } },
    { name: '/history', desc: 'Show conversation history', action: () => { sidebarOpen.value = true; sidebarTab.value = 'history'; loadProjects() } },
    { name: '/search', desc: 'Search conversations', action: () => { sidebarOpen.value = true; sidebarTab.value = 'search' } },
    { name: '/skills', desc: 'List available skills', action: loadAndShowSkills },
    { name: '/clear', desc: 'Clear current messages', action: () => { messages.value = []; error.value = null } },
    { name: '/cost', desc: 'Show total cost', action: () => { error.value = costTotal.value > 0 ? `Total cost: $${costTotal.value.toFixed(4)}` : 'No cost yet' } },
    { name: '/help', desc: 'Show available commands', action: () => { error.value = null; showCmdPalette.value = true; cmdFilter.value = '' } },
  ]

  async function loadAndShowSkills() {
    try {
      skillsList.value = await listSkills(exec)
      selectedSkillId.value = null
      showSkillsPanel.value = true
    } catch (e: any) {
      error.value = `Failed to load skills: ${e.message}`
    }
  }

  function useSkill(skill: { id: string; name: string }) {
    showSkillsPanel.value = false
    selectedSkillId.value = null
    inputText.value = `/${skill.id} `
  }

  function getFilteredSessions(): Session[] {
    const q = browseSearch.value.trim().toLowerCase()
    if (!q) return recentSessions.value
    return recentSessions.value.filter(s =>
      (s.firstPrompt || '').toLowerCase().includes(q) ||
      (s.project || '').toLowerCase().includes(q) ||
      (s.gitBranch || '').toLowerCase().includes(q)
    )
  }

  function cyclePermissionMode() {
    const modes: Array<'default' | 'agent' | 'plan'> = ['default', 'agent', 'plan']
    const idx = modes.indexOf(permissionMode.value)
    permissionMode.value = modes[(idx + 1) % modes.length]
  }

  function getModeLabel(): string {
    switch (permissionMode.value) {
      case 'agent': return 'Agent'
      case 'plan': return 'Plan'
      default: return 'Default'
    }
  }

  function getModeIcon(): string {
    switch (permissionMode.value) {
      case 'agent': return '∞'
      case 'plan': return '☐'
      default: return '💬'
    }
  }

  function getFilteredCmds(): SlashCmd[] {
    const f = cmdFilter.value.toLowerCase()
    return f ? slashCommands.filter(c => c.name.includes(f) || c.desc.toLowerCase().includes(f)) : slashCommands
  }

  function execCmd(cmd: SlashCmd) {
    showCmdPalette.value = false
    cmdFilter.value = ''
    cmdSelectedIdx.value = 0
    inputText.value = ''
    cmd.action()
  }

  // --- Exec helper ---
  function exec(args: string[], options?: { timeout?: number; cwd?: string }) {
    return ctx.exec.run(args, options)
  }

  function encodePath(projectPath: string): string {
    // Same encoding Claude Code uses: /Users/talentc/rust/dinotty-plugins → -Users-talentc-rust-dinotty-plugins
    return projectPath.replace(/^\//, '').replace(/\//g, '-')
  }

  // --- Get active terminal's working directory ---
  async function getActiveCwd(): Promise<string | undefined> {
    try {
      const paneId = ctx.terminal.activePaneId()
      if (!paneId) return undefined
      const res = await fetch(`/api/workspace/list?pane_id=${encodeURIComponent(paneId)}`)
      if (!res.ok) return undefined
      const data = await res.json()
      return data.cwd || undefined
    } catch {
      return undefined
    }
  }

  // --- Data loading ---
  async function loadProjects() {
    try {
      projects.value = await listProjects(exec)
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function loadRecentSessions() {
    loading.value = true
    error.value = null
    console.log('[claude-code] loadRecentSessions: starting')
    try {
      const result = await exec(['list-recent', '30'], { timeout: 15_000 })
      console.log('[claude-code] list-recent result:', result.code, result.stdout?.length, result.stderr?.slice(0, 200))
      if (result.code !== 0) {
        throw new Error(result.stderr || 'list-recent failed')
      }
      const parsed = JSON.parse(result.stdout)
      console.log('[claude-code] parsed sessions:', parsed.length)
      recentSessions.value = parsed
    } catch (e: any) {
      console.error('[claude-code] loadRecentSessions error:', e.message)
      // Fallback: load sessions from each project
      try {
        if (projects.value.length === 0) {
          const projResult = await exec(['list-projects'], { timeout: 10_000 })
          if (projResult.code === 0) {
            projects.value = JSON.parse(projResult.stdout)
          }
        }
        const all: Session[] = []
        for (const p of projects.value.slice(0, 8)) {
          try {
            const sessResult = await exec(['list-sessions', p.encodedPath], { timeout: 10_000 })
            if (sessResult.code === 0) {
              const sess = JSON.parse(sessResult.stdout)
              all.push(...sess.slice(0, 5))
            }
          } catch { /* skip */ }
        }
        all.sort((a, b) => {
          const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
          const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
          return tb - ta
        })
        recentSessions.value = all.slice(0, 30)
        console.log('[claude-code] fallback loaded:', all.length, 'sessions')
      } catch (e2: any) {
        console.error('[claude-code] fallback error:', e2.message)
        error.value = `Failed to load sessions: ${e.message}`
      }
    } finally {
      loading.value = false
    }
  }

  async function selectProject(project: Project) {
    // Toggle: collapse if already expanded
    if (selectedProject.value === project.path) {
      selectedProject.value = null
      selectedProjectEncoded.value = null
      sessions.value = []
      return
    }
    selectedProject.value = project.path
    selectedProjectEncoded.value = project.encodedPath
    loading.value = true
    error.value = null
    try {
      sessions.value = await listSessions(exec, project.encodedPath)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function openSession(session: Session) {
    activeSession.value = session
    view.value = 'chat'
    sidebarOpen.value = false
    loading.value = true
    error.value = null
    messages.value = []
    expandedTools.value = new Set()
    try {
      messages.value = await readSession(exec, session.encodedPath, session.id)
      scrollToBottom()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  function startNewChat() {
    activeSession.value = null
    messages.value = []
    inputText.value = ''
    costTotal.value = 0
    error.value = null
    expandedTools.value = new Set()
    view.value = 'chat'
    sidebarOpen.value = false
  }

  async function doSearch() {
    const q = searchQuery.value.trim()
    if (!q) return
    searching.value = true
    error.value = null
    try {
      searchResults.value = await searchSessions(exec, q)
    } catch (e: any) {
      error.value = e.message
    } finally {
      searching.value = false
    }
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text || sending.value) return

    sending.value = true
    error.value = null

    const userMsg: Message = {
      uuid: 'pending-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    messages.value = [...messages.value, userMsg]
    inputText.value = ''
    scrollToBottom()

    try {
      const cwd = await getActiveCwd()
      if (activeSession.value) {
        const result = await continueConversation(exec, activeSession.value.id, text, { cwd })
        costTotal.value += result.costUsd
        messages.value = [...messages.value, {
          uuid: 'resp-' + Date.now(),
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
        }]
      } else {
        const result = await createConversation(exec, text, { cwd })
        costTotal.value += result.costUsd
        const projectPath = selectedProject.value || cwd || '.'
        activeSession.value = {
          id: result.sessionId,
          project: projectPath,
          encodedPath: encodePath(projectPath),
          firstPrompt: text,
          lastTimestamp: new Date().toISOString(),
          messageCount: 1,
        }
        messages.value = [...messages.value, {
          uuid: 'resp-' + Date.now(),
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
        }]
      }
      scrollToBottom()
    } catch (e: any) {
      error.value = e.message
      messages.value = messages.value.filter(m => !m.uuid.startsWith('pending-'))
    } finally {
      sending.value = false
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      const el = chatScrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }

  function toggleTool(msgId: string, toolIdx: number) {
    const key = `${msgId}-${toolIdx}`
    const next = new Set(expandedTools.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedTools.value = next
  }

  function formatTime(ts: string): string {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffSec = Math.floor(diffMs / 1000)
      if (diffSec < 60) return 'just now'
      const diffMin = Math.floor(diffSec / 60)
      if (diffMin < 60) return `${diffMin}m ago`
      const diffH = Math.floor(diffMin / 60)
      if (diffH < 24) return `${diffH}h ago`
      const diffD = Math.floor(diffH / 24)
      if (diffD < 7) return `${diffD}d ago`
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch { return ts }
  }

  // --- Commands ---
  ctx.commands.register('claude-code.open', () => {
    view.value = 'browse'
    sidebarOpen.value = true
    loadProjects()
  })
  ctx.commands.register('claude-code.new', () => startNewChat())
  ctx.commands.register('claude-code.search', () => {
    sidebarOpen.value = true
    sidebarTab.value = 'search'
    loadProjects()
  })

  ctx.commands.registerQuickPick('claude-code.quick', {
    title: 'Claude Code — Switch Session',
    async items() {
      const recent = await listRecentSessions(exec, 20)
      return recent.map(s => ({
        label: s.firstPrompt.slice(0, 60) || '(empty)',
        detail: `${s.project} · ${formatTime(s.lastTimestamp)}`,
        icon: '💬',
        action() { openSession(s) },
      }))
    },
  })

  // ===== Render =====

  function renderHeader() {
    return h('div', { class: 'ccm-header' }, [
      h('div', { class: 'ccm-header-left' }, [
        h('button', {
          class: 'ccm-icon-btn',
          onClick: () => { sidebarOpen.value = !sidebarOpen.value },
          title: 'Toggle sidebar',
        }, IconMenu()),
        h('span', { class: 'ccm-header-title' },
          activeSession.value
            ? (activeSession.value.firstPrompt?.slice(0, 60) || 'Session')
            : (view.value === 'chat' ? 'New Chat' : 'Claude Code')
        ),
      ]),
      h('div', { class: 'ccm-header-right' }, [
        costTotal.value > 0 ? h('span', { class: 'ccm-cost-badge' }, `$${costTotal.value.toFixed(3)}`) : null,
        h('button', {
          class: 'ccm-icon-btn',
          onClick: startNewChat,
          title: 'New conversation',
        }, IconPlus()),
      ].filter(Boolean)),
    ])
  }

  function renderSidebar() {
    if (!sidebarOpen.value) return null
    return h('div', { class: 'ccm-sidebar-overlay' }, [
      h('div', { class: 'ccm-sidebar' }, [
        h('div', { class: 'ccm-sidebar-header' }, [
          h('div', { class: 'ccm-sidebar-tabs' }, [
            h('button', {
              class: `ccm-sidebar-tab ${sidebarTab.value === 'history' ? 'ccm-sidebar-tab-active' : ''}`,
              onClick: () => { sidebarTab.value = 'history' },
            }, 'History'),
            h('button', {
              class: `ccm-sidebar-tab ${sidebarTab.value === 'search' ? 'ccm-sidebar-tab-active' : ''}`,
              onClick: () => { sidebarTab.value = 'search' },
            }, 'Search'),
          ]),
          h('button', {
            class: 'ccm-icon-btn ccm-icon-btn-sm',
            onClick: () => { sidebarOpen.value = false },
          }, IconX(14)),
        ]),
        sidebarTab.value === 'history' ? renderHistoryPanel() : renderSearchPanel(),
      ]),
      h('div', { class: 'ccm-sidebar-backdrop', onClick: () => { sidebarOpen.value = false } }),
    ])
  }

  function renderHistoryPanel() {
    return h('div', { class: 'ccm-sidebar-body' }, [
      loading.value ? h('div', { class: 'ccm-sidebar-loading' }, [
        h('span', { class: 'ccm-spinner' }),
      ]) : null,
      ...projects.value.map(p => h('div', { class: 'ccm-project-group' }, [
        h('div', {
          class: `ccm-project-header ${selectedProject.value === p.path ? 'ccm-project-header-active' : ''}`,
          onClick: () => selectProject(p),
        }, [
          h('span', { class: 'ccm-project-chevron' }, selectedProject.value === p.path ? IconChevronDown(12) : IconChevronRight(12)),
          h('span', { class: 'ccm-project-icon' }, IconFolder(14)),
          h('span', { class: 'ccm-project-label' }, p.path.split('/').pop() || p.path),
          h('span', { class: 'ccm-project-count' }, String(p.sessionCount)),
        ]),
        selectedProject.value === p.path ? h('div', { class: 'ccm-session-list' },
          sessions.value.map(s => h('div', {
            class: `ccm-session-row ${activeSession.value?.id === s.id ? 'ccm-session-row-active' : ''}`,
            onClick: () => openSession(s),
          }, [
            h('div', { class: 'ccm-session-text' }, s.firstPrompt.slice(0, 50) || '(empty)'),
            h('div', { class: 'ccm-session-info' }, [
              h('span', null, formatTime(s.lastTimestamp)),
              s.gitBranch ? h('span', { class: 'ccm-tag' }, s.gitBranch) : null,
            ].filter(Boolean)),
          ]))
        ) : null,
      ])),
    ])
  }

  function renderSearchPanel() {
    return h('div', { class: 'ccm-sidebar-body' }, [
      h('div', { class: 'ccm-search-input-wrap' }, [
        h('input', {
          type: 'text',
          class: 'ccm-search-field',
          placeholder: 'Search conversations...',
          value: searchQuery.value,
          onInput: (e: Event) => { searchQuery.value = (e.target as HTMLInputElement).value },
          onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') doSearch() },
        }),
      ]),
      searching.value ? h('div', { class: 'ccm-sidebar-loading' }, [
        h('span', { class: 'ccm-spinner' }),
      ]) : null,
      ...searchResults.value.map(r => h('div', {
        class: 'ccm-session-row',
        onClick: () => openSession(r.session),
      }, [
        h('div', { class: 'ccm-session-text' }, r.session.firstPrompt.slice(0, 50)),
        h('div', { class: 'ccm-search-snippet' }, r.match.slice(0, 80)),
        h('div', { class: 'ccm-session-info' }, [
          h('span', { class: 'ccm-tag' }, r.session.project.split('/').pop()),
          h('span', null, formatTime(r.session.lastTimestamp)),
        ]),
      ])),
    ])
  }

  function renderChat() {
    return h('div', { class: 'ccm-chat' }, [
      h('div', {
        class: 'ccm-messages',
        ref: (el: HTMLElement) => { chatScrollRef.value = el },
      }, [
        messages.value.length === 0 ? renderEmptyState() : null,
        ...messages.value.map((msg, i) => renderMessage(msg, i)),
        sending.value ? renderTypingIndicator() : null,
      ]),
      error.value ? h('div', { class: 'ccm-error-bar' }, [
        h('span', null, error.value),
        h('button', { class: 'ccm-error-close', onClick: () => { error.value = null } }, IconX(14)),
      ]) : null,
      renderInput(),
    ])
  }

  function renderEmptyState() {
    return h('div', { class: 'ccm-empty' }, [
      h('div', { class: 'ccm-empty-logo' }, IconClaude(48)),
      h('div', { class: 'ccm-empty-heading' }, activeSession.value ? 'Loading conversation...' : 'Start a new conversation'),
      h('div', { class: 'ccm-empty-sub' }, activeSession.value ? '' : 'Type a message below to chat with Claude Code'),
    ])
  }

  function renderTypingIndicator() {
    return h('div', { class: 'ccm-typing' }, [
      h('div', { class: 'ccm-typing-dot' }),
      h('div', { class: 'ccm-typing-dot' }),
      h('div', { class: 'ccm-typing-dot' }),
    ])
  }

  function renderMessage(msg: Message, index: number) {
    const isUser = msg.role === 'user'
    const prevRole = index > 0 ? messages.value[index - 1].role : null
    const showDivider = prevRole !== null && prevRole !== msg.role

    return h('div', { class: `ccm-message ${isUser ? 'ccm-message-user' : 'ccm-message-assistant'}` }, [
      showDivider ? h('div', { class: 'ccm-divider' }) : null,
      h('div', { class: 'ccm-message-gutter' }, [
        h('div', { class: `ccm-avatar ${isUser ? 'ccm-avatar-user' : 'ccm-avatar-assistant'}` },
          isUser ? 'U' : '✦'
        ),
      ]),
      h('div', { class: 'ccm-message-body' }, [
        h('div', { class: 'ccm-message-meta' }, [
          h('span', { class: 'ccm-message-role' }, isUser ? 'You' : 'Claude'),
          msg.model ? h('span', { class: 'ccm-model-tag' }, msg.model) : null,
          h('span', { class: 'ccm-message-time' }, formatTime(msg.timestamp)),
        ].filter(Boolean)),
        h('div', { class: 'ccm-message-content' }, renderMarkdown(msg.content)),
        msg.toolUses && msg.toolUses.length > 0
          ? h('div', { class: 'ccm-tools-section' },
              msg.toolUses.map((t, i) => renderToolCard(msg.uuid, t, i))
            )
          : null,
      ]),
    ])
  }

  function renderToolCard(msgId: string, tool: { name: string; summary: string }, index: number) {
    const key = `${msgId}-${index}`
    const expanded = expandedTools.value.has(key)

    return h('div', { class: `ccm-tool-card ${expanded ? 'ccm-tool-card-expanded' : ''}` }, [
      h('div', {
        class: 'ccm-tool-header',
        onClick: () => toggleTool(msgId, index),
      }, [
        h('span', { class: 'ccm-tool-icon' }, getToolIcon(tool.name)),
        h('span', { class: 'ccm-tool-name' }, tool.name),
        h('span', { class: 'ccm-tool-summary' }, tool.summary),
        h('span', { class: 'ccm-tool-chevron' }, expanded ? IconChevronDown(12) : IconChevronRight(12)),
      ]),
      expanded ? h('div', { class: 'ccm-tool-detail' }, [
        h('code', null, `${tool.name}: ${tool.summary}`),
      ]) : null,
    ])
  }

  function getToolIcon(name: string): any {
    switch (name) {
      case 'Bash': return IconTerminal(14)
      case 'Read': return IconEye(14)
      case 'Edit': case 'Write': return IconPencil(14)
      case 'Grep': case 'Glob': return IconSearch(14)
      case 'Agent': return IconZap(14)
      case 'WebFetch': case 'WebSearch': return IconGlobe(14)
      default: return IconSettings(14)
    }
  }

  function renderInput() {
    return h('div', { class: 'ccm-input-area' }, [
      showCmdPalette.value ? renderCommandPalette() : null,
      h('div', { class: 'ccm-input-container' }, [
        h('textarea', {
          class: 'ccm-input',
          placeholder: activeSession.value ? 'Continue the conversation...  (type / for commands)' : 'Ask Claude Code anything...  (type / for commands)',
          value: inputText.value,
          onInput: (e: Event) => {
            inputText.value = (e.target as HTMLTextAreaElement).value
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 200) + 'px'
            // Show command palette when input starts with /
            const text = inputText.value
            if (text.startsWith('/')) {
              showCmdPalette.value = true
              cmdFilter.value = text.slice(1)
              cmdSelectedIdx.value = 0
            } else {
              showCmdPalette.value = false
            }
          },
          onKeydown: (e: KeyboardEvent) => {
            const cmds = getFilteredCmds()
            if (showCmdPalette.value && cmds.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                cmdSelectedIdx.value = (cmdSelectedIdx.value + 1) % cmds.length
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                cmdSelectedIdx.value = (cmdSelectedIdx.value - 1 + cmds.length) % cmds.length
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                execCmd(cmds[cmdSelectedIdx.value])
                return
              }
              if (e.key === 'Escape') {
                showCmdPalette.value = false
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          },
          disabled: sending.value,
        }),
        h('div', { class: 'ccm-input-actions' }, [
          h('button', {
            class: 'ccm-send-btn',
            onClick: sendMessage,
            disabled: sending.value || !inputText.value.trim(),
            title: 'Send (Enter)',
          }, sending.value ? h('span', { class: 'ccm-spinner ccm-spinner-sm' }) : IconSend(16)),
        ]),
      ]),
      h('div', { class: 'ccm-input-hint' }, 'Shift+Enter for new line  |  / for commands'),
    ])
  }

  function renderCommandPalette() {
    const cmds = getFilteredCmds()
    if (cmds.length === 0) return null
    return h('div', { class: 'ccm-cmd-palette' }, [
      h('div', { class: 'ccm-cmd-header' }, [
        h('span', null, 'Commands'),
        h('button', { class: 'ccm-cmd-close', onClick: () => { showCmdPalette.value = false } }, IconX(14)),
      ]),
      h('div', { class: 'ccm-cmd-list' },
        cmds.map((cmd, i) => h('div', {
          class: `ccm-cmd-item ${i === cmdSelectedIdx.value ? 'ccm-cmd-item-active' : ''}`,
          onClick: () => execCmd(cmd),
          onMouseenter: () => { cmdSelectedIdx.value = i },
        }, [
          h('span', { class: 'ccm-cmd-name' }, cmd.name),
          h('span', { class: 'ccm-cmd-desc' }, cmd.desc),
        ]))
      ),
    ])
  }

  // ===== Markdown rendering =====

  function renderMarkdown(content: string): any[] {
    if (!content) return [h('span', { class: 'ccm-muted' }, '(no content)')]
    const lines = content.split('\n')
    const elements: any[] = []
    let inCode = false
    let codeLines: string[] = []
    let codeLang = ''
    let codeKey = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Code fence toggle
      if (line.startsWith('```')) {
        if (inCode) {
          elements.push(renderCodeBlock(codeLines.join('\n'), codeLang, codeKey++))
          codeLines = []
          codeLang = ''
          inCode = false
        } else {
          inCode = true
          codeLang = line.slice(3).trim()
        }
        continue
      }

      if (inCode) {
        codeLines.push(line)
        continue
      }

      // Block-level elements
      if (line.startsWith('# ')) {
        elements.push(h('h1', { class: 'ccm-md-h1', key: i }, renderInline(line.slice(2))))
      } else if (line.startsWith('## ')) {
        elements.push(h('h2', { class: 'ccm-md-h2', key: i }, renderInline(line.slice(3))))
      } else if (line.startsWith('### ')) {
        elements.push(h('h3', { class: 'ccm-md-h3', key: i }, renderInline(line.slice(4))))
      } else if (line.startsWith('> ')) {
        elements.push(h('blockquote', { class: 'ccm-md-quote', key: i }, renderInline(line.slice(2))))
      } else if (/^[-*]\s/.test(line)) {
        elements.push(h('div', { class: 'ccm-md-li', key: i }, renderInline(line.replace(/^[-*]\s/, ''))))
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(h('div', { class: 'ccm-md-li ccm-md-oli', key: i }, renderInline(line.replace(/^\d+\.\s/, ''))))
      } else if (line === '---' || line === '***') {
        elements.push(h('hr', { class: 'ccm-md-hr', key: i }))
      } else if (line.trim() === '') {
        // Skip blank lines — spacing is handled by CSS
      } else {
        elements.push(h('p', { class: 'ccm-md-p', key: i }, renderInline(line)))
      }
    }

    if (inCode && codeLines.length > 0) {
      elements.push(renderCodeBlock(codeLines.join('\n'), codeLang, codeKey))
    }

    return elements.length > 0 ? elements : [h('span', { class: 'ccm-muted' }, '(empty)')]
  }

  function renderCodeBlock(code: string, lang: string, key: number) {
    const codeId = `code-${key}-${Date.now()}`
    return h('div', { class: 'ccm-code-block', key: `code-${key}` }, [
      h('div', { class: 'ccm-code-toolbar' }, [
        h('span', { class: 'ccm-code-lang' }, lang || 'code'),
        h('button', {
          class: 'ccm-code-copy',
          onClick: (e: Event) => {
            const btn = e.target as HTMLElement
            navigator.clipboard.writeText(code).then(() => {
              btn.textContent = '✓'
              setTimeout(() => { btn.textContent = 'Copy' }, 1500)
            }).catch(() => {})
          },
        }, 'Copy'),
      ]),
      h('pre', { class: 'ccm-code-pre' }, [
        h('code', { class: lang ? `language-${lang}` : '' }, code),
      ]),
    ])
  }

  function renderInline(text: string): any[] {
    const parts: any[] = []
    let remaining = text
    let keyCounter = 0

    while (remaining.length > 0) {
      // Inline code `...`
      const codeMatch = remaining.match(/`([^`]+)`/)
      // Bold **...**
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
      // Italic *...*
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/)
      // Link [text](url)
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)

      const candidates = [
        codeMatch ? { type: 'code', idx: codeMatch.index!, m: codeMatch } : null,
        boldMatch ? { type: 'bold', idx: boldMatch.index!, m: boldMatch } : null,
        italicMatch ? { type: 'italic', idx: italicMatch.index!, m: italicMatch } : null,
        linkMatch ? { type: 'link', idx: linkMatch.index!, m: linkMatch } : null,
      ].filter(Boolean) as { type: string; idx: number; m: RegExpMatchArray }[]

      if (candidates.length === 0) {
        parts.push(remaining)
        break
      }

      candidates.sort((a, b) => a.idx - b.idx)
      const first = candidates[0]

      if (first.idx > 0) parts.push(remaining.slice(0, first.idx))

      const k = keyCounter++
      if (first.type === 'code') {
        parts.push(h('code', { class: 'ccm-inline-code', key: k }, first.m[1]))
        remaining = remaining.slice(first.idx + first.m[0].length)
      } else if (first.type === 'bold') {
        parts.push(h('strong', { key: k }, first.m[1]))
        remaining = remaining.slice(first.idx + first.m[0].length)
      } else if (first.type === 'italic') {
        parts.push(h('em', { key: k }, first.m[1]))
        remaining = remaining.slice(first.idx + first.m[0].length)
      } else if (first.type === 'link') {
        parts.push(h('a', { class: 'ccm-link', href: first.m[2], target: '_blank', rel: 'noopener', key: k }, first.m[1]))
        remaining = remaining.slice(first.idx + first.m[0].length)
      }
    }

    return parts
  }

  // ===== Main render =====

  return {
    component: {
      setup() {
        ctx.onMounted(() => {
          console.log('[claude-code] onMounted called')
          loadRecentSessions()
          loadProjects()
        })
        return {}
      },
      render() {
        return h('div', { class: 'ccm-root' }, [
          renderHeader(),
          h('div', { class: 'ccm-main' }, [
            renderSidebar(),
            view.value === 'browse' ? renderBrowseView() : renderChat(),
          ]),
          showSkillsPanel.value ? renderSkillsPanel() : null,
        ])
      },
    },
  }

  function renderBrowseView() {
    const filtered = getFilteredSessions()
    return h('div', { class: 'ccm-browse' }, [
      // Header bar (Claudix SessionsPage style)
      h('div', { class: 'ccm-browse-header' }, [
        h('div', { class: 'ccm-browse-header-left' }, [
          h('span', { class: 'ccm-browse-title' }, 'Sessions'),
        ]),
        h('div', { class: 'ccm-browse-header-right' }, [
          h('button', {
            class: `ccm-icon-btn ${browseSearchOpen.value ? 'ccm-icon-btn-active' : ''}`,
            onClick: () => { browseSearchOpen.value = !browseSearchOpen.value; if (!browseSearchOpen.value) browseSearch.value = '' },
            title: 'Search sessions',
          }, IconSearch(15)),
          h('button', {
            class: 'ccm-icon-btn',
            onClick: () => loadRecentSessions(),
            title: 'Refresh',
          }, IconRefresh(15)),
          h('button', {
            class: 'ccm-primary-btn ccm-primary-btn-sm',
            onClick: startNewChat,
          }, '+ New'),
        ]),
      ]),
      // Search bar (collapsible, like Claudix)
      browseSearchOpen.value ? h('div', { class: 'ccm-browse-search' }, [
        h('input', {
          type: 'text',
          class: 'ccm-browse-search-input',
          placeholder: 'Search sessions...',
          value: browseSearch.value,
          onInput: (e: Event) => { browseSearch.value = (e.target as HTMLInputElement).value },
          onKeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { browseSearchOpen.value = false; browseSearch.value = '' } },
        }),
      ]) : null,
      // Content
      h('div', { class: 'ccm-browse-content' }, [
        // Loading state
        loading.value ? h('div', { class: 'ccm-browse-state' }, [
          h('div', { class: 'ccm-spinner' }),
          h('span', null, 'Loading sessions...'),
        ]) : null,
        // Error state
        !loading.value && error.value ? h('div', { class: 'ccm-browse-state' }, [
          h('span', { class: 'ccm-browse-error' }, error.value),
          h('button', {
            class: 'ccm-primary-btn ccm-primary-btn-sm',
            onClick: () => { error.value = null; loadRecentSessions() },
          }, 'Retry'),
        ]) : null,
        // Empty state
        !loading.value && !error.value && filtered.length === 0
          ? h('div', { class: 'ccm-browse-state' }, [
              h('div', { class: 'ccm-browse-empty-icon' }, IconClaude(48)),
              h('span', null, browseSearch.value ? 'No matching sessions' : 'No sessions yet'),
              !browseSearch.value ? h('button', {
                class: 'ccm-primary-btn',
                onClick: startNewChat,
              }, 'Start a conversation') : null,
            ].filter(Boolean))
          : null,
        // Session cards
        !loading.value && !error.value && filtered.length > 0
          ? h('div', { class: 'ccm-browse-sessions' },
              filtered.map(s => renderSessionCard(s))
            )
          : null,
      ]),
    ])
  }

  function renderSessionCard(s: Session) {
    return h('div', {
      class: 'ccm-session-card',
      onClick: () => openSession(s),
    }, [
      h('div', { class: 'ccm-session-card-header' }, [
        h('span', { class: 'ccm-session-card-title' }, s.firstPrompt.slice(0, 80) || '(empty)'),
        h('span', { class: 'ccm-session-card-time' }, formatTime(s.lastTimestamp)),
      ]),
      h('div', { class: 'ccm-session-card-meta' }, [
        h('span', { class: 'ccm-session-card-count' }, `${s.messageCount} messages`),
        h('span', { class: 'ccm-tag' }, s.project.split('/').pop() || s.project),
        s.gitBranch ? h('span', { class: 'ccm-tag' }, s.gitBranch) : null,
      ].filter(Boolean)),
    ])
  }

  function renderSkillsPanel() {
    const selected = skillsList.value.find(s => s.id === selectedSkillId.value)
    return h('div', { class: 'ccm-skills-overlay' }, [
      h('div', { class: 'ccm-skills-panel' }, [
        h('div', { class: 'ccm-skills-header' }, [
          h('div', { class: 'ccm-skills-header-left' }, [
            selected ? h('button', {
              class: 'ccm-icon-btn ccm-icon-btn-sm',
              onClick: () => { selectedSkillId.value = null },
              title: 'Back to list',
            }, IconArrowLeft(14)) : null,
            h('span', { class: 'ccm-skills-title' }, selected ? selected.name : 'Skills'),
          ]),
          h('button', {
            class: 'ccm-icon-btn ccm-icon-btn-sm',
            onClick: () => { showSkillsPanel.value = false; selectedSkillId.value = null },
          }, IconX(14)),
        ]),
        selected ? renderSkillDetail(selected) : renderSkillsList(),
      ]),
      h('div', { class: 'ccm-skills-backdrop', onClick: () => { showSkillsPanel.value = false; selectedSkillId.value = null } }),
    ])
  }

  function renderSkillsList() {
    if (skillsList.value.length === 0) {
      return h('div', { class: 'ccm-skills-empty' }, 'No skills installed')
    }
    return h('div', { class: 'ccm-skills-list' },
      skillsList.value.map(skill => h('div', {
        class: 'ccm-skill-card',
        onClick: () => { selectedSkillId.value = skill.id },
      }, [
        h('div', { class: 'ccm-skill-card-header' }, [
          h('span', { class: 'ccm-skill-icon' }, IconZap(14)),
          h('span', { class: 'ccm-skill-name' }, skill.name),
        ]),
        h('div', { class: 'ccm-skill-desc' }, skill.description || 'No description'),
        skill.allowedTools.length > 0 ? h('div', { class: 'ccm-skill-tools' },
          skill.allowedTools.map(t => h('span', { class: 'ccm-skill-tool-tag' }, t))
        ) : null,
      ]))
    )
  }

  function renderSkillDetail(skill: { id: string; name: string; description: string; allowedTools: string[] }) {
    return h('div', { class: 'ccm-skill-detail' }, [
      h('div', { class: 'ccm-skill-detail-desc' }, skill.description || 'No description'),
      skill.allowedTools.length > 0 ? h('div', { class: 'ccm-skill-detail-section' }, [
        h('div', { class: 'ccm-skill-detail-label' }, 'Allowed Tools'),
        h('div', { class: 'ccm-skill-tools' },
          skill.allowedTools.map(t => h('span', { class: 'ccm-skill-tool-tag' }, t))
        ),
      ]) : null,
      h('div', { class: 'ccm-skill-detail-actions' }, [
        h('button', {
          class: 'ccm-primary-btn',
          onClick: () => useSkill(skill),
        }, 'Use in Chat'),
      ]),
    ])
  }
}

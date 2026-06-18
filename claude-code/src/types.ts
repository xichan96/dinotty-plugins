export interface Session {
  id: string
  project: string
  encodedPath: string
  firstPrompt: string
  lastTimestamp: string
  messageCount: number
  gitBranch?: string
}

export interface Message {
  uuid: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  model?: string
  toolUses?: ToolUse[]
}

export interface ToolUse {
  name: string
  summary: string
}

export interface Project {
  path: string
  encodedPath: string
  sessionCount: number
}

export interface SearchResult {
  session: Session
  match: string
}

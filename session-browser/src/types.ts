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
  filePath?: string
  oldString?: string
  newString?: string
  content?: string
  replaceAll?: boolean
}

export interface FileChange {
  filePath: string
  additions: number
  deletions: number
  toolType: 'Edit' | 'Write'
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

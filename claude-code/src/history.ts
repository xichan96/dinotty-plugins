import type { Session, Message, Project, SearchResult } from './types'

type ExecFn = (args: string[], options?: { timeout?: number }) => Promise<{ code: number; stdout: string; stderr: string }>

export async function listProjects(exec: ExecFn): Promise<Project[]> {
  const res = await exec(['list-projects'])
  if (res.code !== 0) throw new Error(res.stderr || 'list-projects failed')
  return JSON.parse(res.stdout)
}

export async function listSessions(exec: ExecFn, encodedPath: string): Promise<Session[]> {
  const res = await exec(['list-sessions', encodedPath])
  if (res.code !== 0) throw new Error(res.stderr || 'list-sessions failed')
  return JSON.parse(res.stdout)
}

export async function readSession(exec: ExecFn, encodedPath: string, sessionId: string): Promise<Message[]> {
  const res = await exec(['read-session', encodedPath, sessionId])
  if (res.code !== 0) throw new Error(res.stderr || 'read-session failed')
  return JSON.parse(res.stdout)
}

export async function searchSessions(exec: ExecFn, query: string): Promise<SearchResult[]> {
  const res = await exec(['search', query])
  if (res.code !== 0) throw new Error(res.stderr || 'search failed')
  return JSON.parse(res.stdout)
}

export async function listRecentSessions(exec: ExecFn, limit = 30): Promise<Session[]> {
  const res = await exec(['list-recent', String(limit)], { timeout: 15_000 })
  if (res.code !== 0) throw new Error(res.stderr || 'list-recent failed')
  return JSON.parse(res.stdout)
}

export interface SkillInfo { id: string; name: string; description: string; allowedTools: string[] }

export async function listSkills(exec: ExecFn): Promise<SkillInfo[]> {
  const res = await exec(['list-skills'])
  if (res.code !== 0) throw new Error(res.stderr || 'list-skills failed')
  return JSON.parse(res.stdout)
}

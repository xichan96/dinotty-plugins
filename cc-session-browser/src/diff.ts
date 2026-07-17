import type { Message, FileChange } from './types'

export interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  text: string
}

export const DIFF_MAX_LINES = 5000
export const DIFF_MAX_BYTES = 1024 * 1024

function utf8ByteLengthUpTo(value: string, limit: number): number {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes++
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index++
    } else bytes += 3
    if (bytes > limit) return limit + 1
  }
  return bytes
}

function lineCountUpTo(value: string, limit: number): number {
  let lines = 1
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10 && ++lines > limit) return limit + 1
  }
  return lines
}

export function isFullDiffSafe(oldString: string, newString: string): boolean {
  const oldBytes = utf8ByteLengthUpTo(oldString, DIFF_MAX_BYTES)
  if (oldBytes > DIFF_MAX_BYTES || utf8ByteLengthUpTo(newString, DIFF_MAX_BYTES - oldBytes) > DIFF_MAX_BYTES - oldBytes) return false
  const oldLines = lineCountUpTo(oldString, DIFF_MAX_LINES)
  return oldLines <= DIFF_MAX_LINES && lineCountUpTo(newString, DIFF_MAX_LINES - oldLines) <= DIFF_MAX_LINES - oldLines
}

export function aggregateFileChanges(messages: Message[]): FileChange[] {
  const map = new Map<string, FileChange>()

  for (const msg of messages) {
    if (!msg.toolUses) continue
    for (const tu of msg.toolUses) {
      if ((tu.name === 'Edit' || tu.name === 'Write') && tu.filePath) {
        const existing = map.get(tu.filePath)
        if (tu.name === 'Edit' && tu.oldString !== undefined && tu.newString !== undefined) {
          const stats = computeEditStats(tu.oldString, tu.newString)
          if (existing) {
            existing.additions += stats.additions
            existing.deletions += stats.deletions
          } else {
            map.set(tu.filePath, {
              filePath: tu.filePath,
              additions: stats.additions,
              deletions: stats.deletions,
              toolType: 'Edit',
            })
          }
        } else if (tu.name === 'Write' && tu.content !== undefined) {
          const stats = computeWriteStats(tu.content)
          if (existing) {
            existing.additions += stats.additions
            existing.deletions += stats.deletions
          } else {
            map.set(tu.filePath, {
              filePath: tu.filePath,
              additions: stats.additions,
              deletions: stats.deletions,
              toolType: 'Write',
            })
          }
        }
      }
    }
  }

  return Array.from(map.values())
}

function computeEditStats(oldString: string, newString: string): { additions: number; deletions: number } {
  const oldLines = oldString.split('\n')
  const newLines = newString.split('\n')
  return {
    additions: newLines.length,
    deletions: oldLines.length,
  }
}

function computeWriteStats(content: string): { additions: number; deletions: number } {
  const lines = content.split('\n')
  return {
    additions: lines.length,
    deletions: 0,
  }
}

export function computeEditDiff(oldString: string, newString: string): DiffLine[] {
  if (!isFullDiffSafe(oldString, newString)) {
    return [{ type: 'ctx', text: 'Diff summary only: content exceeds the safe comparison limit.' }]
  }
  const aLines = oldString.split('\n')
  const bLines = newString.split('\n')
  const n = aLines.length
  const m = bLines.length

  if (n === 0 && m === 0) return []

  // LCS DP
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0, j = 0

  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: 'ctx', text: aLines[i] })
      i++
      j++
      continue
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'del', text: aLines[i] })
      i++
    } else {
      result.push({ type: 'add', text: bLines[j] })
      j++
    }
  }

  while (i < n) {
    result.push({ type: 'del', text: aLines[i] })
    i++
  }

  while (j < m) {
    result.push({ type: 'add', text: bLines[j] })
    j++
  }

  return result
}

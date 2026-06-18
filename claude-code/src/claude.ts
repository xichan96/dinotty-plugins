type ExecFn = (args: string[], options?: { timeout?: number; cwd?: string }) => Promise<{ code: number; stdout: string; stderr: string }>

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export async function createConversation(
  exec: ExecFn,
  prompt: string,
  options?: { cwd?: string }
): Promise<{ sessionId: string; response: string; costUsd: number }> {
  const sessionId = generateUUID()
  const res = await exec(['claude-call', '--new', sessionId, prompt], { timeout: 300_000, cwd: options?.cwd })

  if (res.code !== 0) {
    throw new Error(res.stderr || `claude exited with code ${res.code}`)
  }

  try {
    const data = JSON.parse(res.stdout)
    return {
      sessionId: data.sessionId || sessionId,
      response: data.response || '',
      costUsd: data.costUsd || 0,
    }
  } catch {
    return { sessionId, response: res.stdout.trim(), costUsd: 0 }
  }
}

export async function continueConversation(
  exec: ExecFn,
  sessionId: string,
  prompt: string,
  options?: { cwd?: string }
): Promise<{ response: string; costUsd: number }> {
  const res = await exec(['claude-call', '--resume', sessionId, prompt], { timeout: 300_000, cwd: options?.cwd })

  if (res.code !== 0) {
    throw new Error(res.stderr || `claude exited with code ${res.code}`)
  }

  try {
    const data = JSON.parse(res.stdout)
    return {
      response: data.response || '',
      costUsd: data.costUsd || 0,
    }
  } catch {
    return { response: res.stdout.trim(), costUsd: 0 }
  }
}

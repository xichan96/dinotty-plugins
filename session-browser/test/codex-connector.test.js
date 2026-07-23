const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const esbuild = require('esbuild')

function loadCodexResponseParser() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/codex-connector.ts'), 'utf8')
  const names = [
    ['prefixes', /^export const CODEX_INJECTED_PREFIXES = \[[^]*?^\]/m],
    ['contentText', /^function contentText\([^]*?^\}/m],
    ['predicate', /^export function isCodexInjectedUserMessage\([^]*?^\}/m],
    ['parser', /^function parseResponseRecord\([^]*?^\}/m],
  ]
  const parts = names.map(([name, pattern]) => {
    const match = source.match(pattern)
    assert.ok(match, `missing ${name}`)
    return match[0]
  })
  const compiled = esbuild.transformSync([
    ...parts,
    'module.exports = { CODEX_INJECTED_PREFIXES, isCodexInjectedUserMessage, parseResponseRecord }',
  ].join('\n'), { loader: 'ts', format: 'cjs', target: 'node18' })
  const loaded = { exports: {} }
  Function('module', 'exports', 'require', compiled.code)(loaded, loaded.exports, require)
  return loaded.exports
}

function response(content, role = 'user') {
  return {
    type: 'response_item',
    timestamp: '2026-07-23T00:00:00.000Z',
    payload: {
      type: 'message',
      id: `message-${role}`,
      role,
      content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: content }],
    },
  }
}

test('Codex injected prefixes use tag boundaries and fail open for real input', () => {
  const { CODEX_INJECTED_PREFIXES, isCodexInjectedUserMessage } = loadCodexResponseParser()
  assert.equal(CODEX_INJECTED_PREFIXES.length, 6)
  for (const prefix of CODEX_INJECTED_PREFIXES) {
    assert.equal(isCodexInjectedUserMessage(`  ${prefix}>payload`), true, prefix)
    assert.equal(isCodexInjectedUserMessage(`${prefix} payload`), true, `${prefix} whitespace boundary`)
    assert.equal(isCodexInjectedUserMessage(`${prefix}-human`), false, `${prefix} tag boundary`)
  }
  assert.equal(isCodexInjectedUserMessage('<article>real pasted XML</article>'), false)
  assert.equal(isCodexInjectedUserMessage('Caveat: this is real prose'), false)
  assert.equal(isCodexInjectedUserMessage(['<environment_context>']), false)
})

test('Codex response parser explicitly tags only user messages and preserves content', () => {
  const { CODEX_INJECTED_PREFIXES, parseResponseRecord } = loadCodexResponseParser()
  const messages = []
  const pending = new Map()
  for (const prefix of CODEX_INJECTED_PREFIXES) parseResponseRecord(response(`${prefix}>fixture`), messages, pending)
  parseResponseRecord(response('<article>real pasted XML</article>'), messages, pending)
  parseResponseRecord(response('assistant answer', 'assistant'), messages, pending)

  assert.deepEqual(messages.slice(0, 6).map(message => message.isRealUser), Array(6).fill(false))
  assert.equal(messages[6].isRealUser, true)
  assert.equal(messages[6].content, '<article>real pasted XML</article>')
  assert.equal(Object.hasOwn(messages[7], 'isRealUser'), false)
})

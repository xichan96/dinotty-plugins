const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = __dirname
const source = path.join(root, 'windows-launcher.rs')
const output = path.join(root, '..', 'dist', 'cli-wrapper.exe')
const destination = path.join(root, 'windows-launcher.provenance.json')
const command = 'rustc --edition=2021 --target x86_64-pc-windows-msvc -C opt-level=s -C strip=symbols -o ../dist/cli-wrapper.exe windows-launcher.rs'

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function canonicalText(file) {
  return Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), 'utf8')
}

const compilerResult = spawnSync('rustc', ['--version'], {
  encoding: 'utf8',
  windowsHide: true,
})
if (compilerResult.status !== 0) {
  throw new Error(compilerResult.stderr || compilerResult.error?.message || 'Could not determine rustc version')
}

const provenance = {
  source: 'windows-launcher.rs',
  sourceEol: 'lf',
  output: '../dist/cli-wrapper.exe',
  target: 'x86_64-pc-windows-msvc',
  compiler: compilerResult.stdout.trim(),
  command,
  sourceSha256: sha256(canonicalText(source)),
  binarySha256: sha256(fs.readFileSync(output)),
}

fs.writeFileSync(destination, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')

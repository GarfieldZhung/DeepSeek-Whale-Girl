import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const ignored = new Set(['.git', 'node_modules', 'artifacts', 'archive', '.smoke-user-data', '.tmp', '.upstream'])
const ignoredPrefixes = ['release', 'dist', 'out']
const textExtensions = new Set(['.cjs', '.js', '.json', '.md', '.mjs', '.ps1', '.txt', '.yml', '.yaml', '.html', '.css'])
const checks = [
  ['疑似 API Key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['私钥内容', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['疑似 GitHub Token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ['Windows 用户绝对路径', /[A-Za-z]:\\Users\\[^\\\s]+\\/g],
]

async function collect(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || ignoredPrefixes.some((prefix) => entry.name === prefix || entry.name.startsWith(`${prefix}-`))) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await collect(target, files)
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(target)
  }
  return files
}

const findings = []
for (const file of await collect(root)) {
  const content = await readFile(file, 'utf8')
  for (const [label, pattern] of checks) {
    pattern.lastIndex = 0
    if (pattern.test(content)) findings.push(`${label}: ${path.relative(root, file)}`)
  }
}

if (findings.length) {
  console.error(`发布检查失败：\n${findings.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}
console.log('发布检查通过：未发现常见密钥、私钥或本机用户绝对路径。')


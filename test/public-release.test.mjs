import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('public build has no inbound HTTP service or exposed integration token', async () => {
  const [main, html] = await Promise.all([
    readFile('electron/main.cjs', 'utf8'),
    readFile('renderer/index.html', 'utf8'),
  ])
  assert.equal(main.includes("require('node:http')"), false)
  assert.equal(main.includes('.listen('), false)
  assert.equal(main.includes('X-Whale-Token'), false)
  assert.equal(html.includes('本地用量'), false)
  assert.equal(html.includes('integrationToken'), false)
})

test('GitHub release metadata excludes private data and documents artwork rights', async () => {
  const [ignore, readme, notices, manifest] = await Promise.all([
    readFile('.gitignore', 'utf8'),
    readFile('README.md', 'utf8'),
    readFile('THIRD_PARTY_NOTICES.md', 'utf8'),
    readFile('package.json', 'utf8').then(JSON.parse),
  ])
  for (const entry of ['node_modules/', 'release-*/', 'artifacts/', 'config.json', 'usage.json', '.env']) assert.ok(ignore.includes(entry), `missing ignore rule: ${entry}`)
  assert.match(readme, /MIT License \*\*不覆盖图片素材\*\*/)
  assert.match(notices, /not an official\s+DeepSeek product or endorsement/)
  assert.equal(manifest.build.files.some((entry) => entry.startsWith('archive/')), false)
})


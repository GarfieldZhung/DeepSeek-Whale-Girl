import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const modes = ['hover', 'swing', 'game', 'movie', 'running']

test('V1.5 animation archive keeps every 24-frame loop intact', async () => {
  for (const mode of modes) {
    const files = await readdir(path.join('archive', 'v1.5-animation-assets', 'sequences', mode))
    const originals = files.filter((name) => /^frame-\d{2}\.png$/.test(name)).sort()
    const inbetweens = files.filter((name) => /^inbetween-\d{2}\.png$/.test(name)).sort()
    assert.equal(originals.length, 12, `${mode} original frames`)
    assert.equal(inbetweens.length, 12, `${mode} in-between frames`)
    const loop = originals.flatMap((frame, index) => [frame, inbetweens[index]])
    assert.equal(loop.length, 24)
  }
})

test('V1.6 renderer uses static idle assets and does not load archived frame sequences', async () => {
  const renderer = await readFile(path.join('renderer', 'app.js'), 'utf8')
  assert.equal(renderer.includes('assets/whale/sequences'), false)
  assert.equal(renderer.includes('startIdleSequence'), false)
  assert.equal(/(?:frame|inbetween)-\d{2}\.png/.test(renderer), false)
  for (const mode of ['swing', 'game', 'movie', 'running']) {
    const files = await readdir(path.join('assets', 'whale'))
    assert.equal(files.includes(`whale-idle-${mode}.png`), true, `${mode} static idle asset`)
  }
  assert.equal(renderer.includes("actionWheel.addEventListener('click'"), true)
})

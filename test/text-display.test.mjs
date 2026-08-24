import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('pet chat and long answers are shown directly without truncation', async () => {
  const [app, styles, html, main] = await Promise.all([
    readFile('renderer/app.js', 'utf8'),
    readFile('renderer/styles.css', 'utf8'),
    readFile('renderer/index.html', 'utf8'),
    readFile('electron/main.cjs', 'utf8'),
  ])
  assert.equal(app.includes('result.answer.slice('), false)
  assert.match(app, /setPetState\('chat', \{ message: result\.answer \}\)/)
  assert.match(html, /<section class="pet-chat hidden no-drag" id="petChat"[^>]*>/)
  assert.match(html, /<button class="status-pill" id="statusPill"[^>]*>问问小鲸鱼<\/button>/)
  assert.equal(html.includes('id="monitorEnabled"'), false)
  assert.equal(html.includes('class="chat-box"'), false)
  assert.equal(main.includes("whale:test-monitor"), false)
  assert.equal(main.includes('restartMonitor'), false)
  assert.equal(html.includes('integrationToken'), false)
  assert.equal(html.includes('本地用量记账接口'), false)
  const bubbleRule = styles.match(/\.bubble\s*\{[^}]*\}/s)?.[0] || ''
  const bubbleTextRule = styles.match(/\.bubble\s*>\s*span\s*\{[^}]*\}/s)?.[0] || ''
  assert.equal(bubbleRule.includes('white-space:pre-wrap'), false)
  assert.equal(bubbleTextRule.includes('white-space:pre-wrap'), true)
  assert.match(app, /classList\.toggle\('is-short'/)
})

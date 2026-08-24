import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatRequest, parseChatResponse } from '../src/chat.mjs'

test('chat request uses fixed lightweight model and disables hidden thinking output', () => {
  const request = createChatRequest('怎么做蛋糕？')
  assert.equal(request.model, 'deepseek-v4-flash')
  assert.deepEqual(request.thinking, { type: 'disabled' })
  assert.equal(request.messages.at(-1).content, '怎么做蛋糕？')
})

test('chat response is sanitized and bounded', () => {
  const parsed = parseChatResponse({ model: 'deepseek-v4-flash', choices: [{ message: { content: '好呀～<script>坏东西</script>' } }] })
  assert.equal(parsed.answer.includes('<script>'), false)
  assert.throws(() => parseChatResponse({ choices: [] }), /有效回答/)
})

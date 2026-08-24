import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeModelText, sanitizePrompt } from '../src/security.mjs'

test('chat prompt is bounded and strips control characters', () => {
  assert.equal(sanitizePrompt('  你\u0000好  '), '你好')
  assert.throws(() => sanitizePrompt('x'.repeat(1201)), /1200/)
})

test('model output strips active embedded-content tags and stays bounded', () => {
  assert.equal(sanitizeModelText('<script>alert(1)</script>你好'), 'alert(1)你好')
  assert.equal(sanitizeModelText('x'.repeat(3000)).length, 2400)
})

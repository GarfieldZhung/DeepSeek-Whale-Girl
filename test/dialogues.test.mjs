import test from 'node:test'
import assert from 'node:assert/strict'
import { dialogueLibrary } from '../renderer/dialogues.js'

test('every character scene contains exactly ten dialogue lines', () => {
  for (const [scene, lines] of Object.entries(dialogueLibrary)) {
    assert.equal(lines.length, 10, `${scene} should contain ten lines`)
    assert.equal(new Set(lines).size, 10, `${scene} should not repeat lines`)
    assert.ok(lines.every((line) => typeof line === 'string' && line.trim().length >= 8), `${scene} lines should be meaningful`)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateCost, normalizeUsage, resolveRates } from '../src/pricing.mjs'
import { summarize } from '../src/summary.mjs'

test('normalizes DeepSeek response usage without double counting prompt tokens', () => {
  assert.deepEqual(normalizeUsage({
    prompt_tokens: 100,
    prompt_cache_hit_tokens: 70,
    prompt_cache_miss_tokens: 30,
    completion_tokens: 20,
  }), { hit: 70, miss: 30, output: 20, total: 120 })
})

test('derives misses when only aggregate prompt tokens are present', () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: 100, prompt_cache_hit_tokens: 65, completion_tokens: 10 }), {
    hit: 65, miss: 35, output: 10, total: 110,
  })
})

test('prices each token bucket independently', () => {
  const cost = calculateCost({ hit: 1_000_000, miss: 1_000_000, output: 1_000_000 }, { hit: 0.02, miss: 1, output: 2 })
  assert.equal(cost.totalCost, 3.02)
})

test('selects pro pricing by model name', () => {
  assert.equal(resolveRates('deepseek-v4-pro').family, 'pro')
  assert.equal(resolveRates('deepseek-v4-flash').family, 'flash')
})

test('summarizes records for today and month', () => {
  const now = new Date(2026, 7, 21, 12).getTime()
  const summary = summarize([{ timestamp: now, model: 'deepseek-v4-flash', usage: { hit: 100, miss: 50, output: 20 } }], undefined, now)
  assert.equal(summary.today.requests, 1)
  assert.equal(summary.today.total, 170)
  assert.equal(summary.month.requests, 1)
})

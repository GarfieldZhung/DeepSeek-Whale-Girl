export const DEFAULT_PRICING = Object.freeze({
  flash: Object.freeze({ hit: 0.02, miss: 1, output: 2 }),
  pro: Object.freeze({ hit: 0.025, miss: 3, output: 6 }),
})

export function normalizeUsage(input = {}) {
  const number = (...values) => {
    for (const value of values) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed)
    }
    return 0
  }

  const hit = number(input.hit, input.cacheHitTokens, input.prompt_cache_hit_tokens, input.cache_read_tokens)
  const explicitMiss = number(input.miss, input.cacheMissTokens, input.prompt_cache_miss_tokens, input.cache_write_tokens)
  const prompt = number(input.promptTokens, input.prompt_tokens, input.input_tokens)
  const miss = explicitMiss || Math.max(0, prompt - hit)
  const output = number(input.output, input.outputTokens, input.completion_tokens, input.output_tokens)

  return {
    hit,
    miss,
    output,
    total: hit + miss + output,
  }
}

export function modelFamily(model = '') {
  return /pro/i.test(model) ? 'pro' : 'flash'
}

export function calculateCost(usage, rates) {
  const normalized = normalizeUsage(usage)
  const safeRates = {
    hit: Math.max(0, Number(rates?.hit) || 0),
    miss: Math.max(0, Number(rates?.miss) || 0),
    output: Math.max(0, Number(rates?.output) || 0),
  }
  const hitCost = normalized.hit / 1_000_000 * safeRates.hit
  const missCost = normalized.miss / 1_000_000 * safeRates.miss
  const outputCost = normalized.output / 1_000_000 * safeRates.output
  return {
    ...normalized,
    hitCost,
    missCost,
    outputCost,
    totalCost: hitCost + missCost + outputCost,
  }
}

export function resolveRates(model, pricing = DEFAULT_PRICING) {
  const family = modelFamily(model)
  return { family, rates: pricing[family] || DEFAULT_PRICING[family] }
}

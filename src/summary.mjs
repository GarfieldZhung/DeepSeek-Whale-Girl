import { calculateCost, resolveRates } from './pricing.mjs'

function localDateKey(value = Date.now()) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function summarize(records = [], pricing, now = Date.now()) {
  const todayKey = localDateKey(now)
  const monthKey = todayKey.slice(0, 7)
  const base = () => ({ requests: 0, hit: 0, miss: 0, output: 0, total: 0, cost: 0 })
  const summary = { today: base(), month: base(), all: base(), days: [] }
  const dayMap = new Map()

  for (const record of records) {
    const timestamp = Number(record.timestamp) || now
    const key = localDateKey(timestamp)
    const { rates } = resolveRates(record.model, pricing)
    const cost = calculateCost(record.usage, record.rates || rates)
    const targets = [summary.all]
    if (key === todayKey) targets.push(summary.today)
    if (key.startsWith(monthKey)) targets.push(summary.month)
    if (!dayMap.has(key)) dayMap.set(key, base())
    targets.push(dayMap.get(key))
    for (const target of targets) {
      target.requests += 1
      target.hit += cost.hit
      target.miss += cost.miss
      target.output += cost.output
      target.total += cost.total
      target.cost += cost.totalCost
    }
  }

  summary.days = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, value]) => ({ date, ...value }))
  return summary
}

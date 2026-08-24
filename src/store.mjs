import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const EMPTY_DATA = Object.freeze({ version: 1, records: [], balanceHistory: [] })

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath
    this.queue = Promise.resolve()
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'))
      return {
        version: 1,
        records: Array.isArray(parsed.records) ? parsed.records : [],
        balanceHistory: Array.isArray(parsed.balanceHistory) ? parsed.balanceHistory : [],
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[store] resetting unreadable data:', error.message)
      return structuredClone(EMPTY_DATA)
    }
  }

  update(mutator) {
    this.queue = this.queue.then(async () => {
      const current = await this.read()
      const next = await mutator(current) || current
      await mkdir(path.dirname(this.filePath), { recursive: true })
      const tempPath = `${this.filePath}.${process.pid}.tmp`
      await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(tempPath, this.filePath)
      return next
    })
    return this.queue
  }
}

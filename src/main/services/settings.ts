import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { defaultSettings, validateSettings, type Settings } from '../../shared/types'
export class SettingsStore {
  value = { ...defaultSettings }
  constructor(private directory: string) {}
  async load(): Promise<void> {
    try {
      this.value = validateSettings(
        JSON.parse(await fs.readFile(join(this.directory, 'settings.json'), 'utf8'))
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('Settings could not be loaded; using defaults')
    }
  }
  async save(input: unknown): Promise<Settings> {
    const next = validateSettings(input)
    await fs.mkdir(this.directory, { recursive: true })
    const path = join(this.directory, 'settings.json')
    await fs.writeFile(`${path}.tmp`, JSON.stringify(next), { mode: 0o600 })
    await fs.rename(`${path}.tmp`, path)
    this.value = next
    return next
  }
}

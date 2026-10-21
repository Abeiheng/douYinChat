export interface Segment {
  text: string
  match: boolean
}
export function matchKeyword(text: string, keywords: string[]): Segment[] {
  const ranges: [number, number][] = []
  // Escaped literals preserve indices in the original string, including Unicode.
  const words = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))]
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const match of text.matchAll(new RegExp(escaped, 'giu'))) {
      ranges.push([match.index, match.index + match[0].length])
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  const result: Segment[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) result.push({ text: text.slice(cursor, start), match: false })
    result.push({ text: text.slice(start, end), match: true })
    cursor = end
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor), match: false })
  return result
}
export class ReminderGate {
  private last = new Map<string, number>()
  allow(room: string, cooldown: number, now = Date.now()): boolean {
    const previous = this.last.get(room)
    if (previous !== undefined && now - previous < cooldown * 1000) return false
    this.last.set(room, now)
    if (this.last.size > 100) this.last.delete(this.last.keys().next().value!)
    return true
  }
}

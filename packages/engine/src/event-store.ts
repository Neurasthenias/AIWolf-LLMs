import type { GameEvent } from "@aiwolf/shared/types"
import * as fs from "node:fs"
import * as path from "node:path"

export class FileEventStore {
  private dir: string

  constructor(baseDir = ".data/events") {
    this.dir = baseDir
    fs.mkdirSync(this.dir, { recursive: true })
  }

  private filePath(gameId: string): string {
    return path.join(this.dir, `${gameId}.jsonl`)
  }

  async append(gameId: string, events: GameEvent[]): Promise<void> {
    const lines = events.map(e => JSON.stringify(e) + "\n").join("")
    fs.appendFileSync(this.filePath(gameId), lines, "utf-8")
  }

  async load(gameId: string): Promise<GameEvent[]> {
    const fp = this.filePath(gameId)
    if (!fs.existsSync(fp)) return []
    const text = fs.readFileSync(fp, "utf-8")
    return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as GameEvent)
  }

  async loadFrom(gameId: string, afterEventId: string): Promise<GameEvent[]> {
    const events = await this.load(gameId)
    const idx = events.findIndex(e => e.id === afterEventId)
    return idx >= 0 ? events.slice(idx + 1) : []
  }

  async saveSnapshot(snapshot: { gameId: string; lastEventId: string; state: unknown }): Promise<void> {
    const fp = path.join(this.dir, `${snapshot.gameId}.snapshot.json`)
    fs.writeFileSync(fp, JSON.stringify(snapshot), "utf-8")
  }

  async loadLatestSnapshot(gameId: string): Promise<{ gameId: string; lastEventId: string; state: unknown } | null> {
    const fp = path.join(this.dir, `${gameId}.snapshot.json`)
    if (!fs.existsSync(fp)) return null
    return JSON.parse(fs.readFileSync(fp, "utf-8"))
  }

  async delete(gameId: string): Promise<void> {
    const fp = this.filePath(gameId)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    const sp = path.join(this.dir, `${gameId}.snapshot.json`)
    if (fs.existsSync(sp)) fs.unlinkSync(sp)
  }
}

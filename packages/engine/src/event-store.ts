import type { GameEvent } from "@aiwolf/shared/types"

export interface EventStore {
  append(gameId: string, events: GameEvent[]): Promise<void>
  load(gameId: string): Promise<GameEvent[]>
  loadFrom(gameId: string, afterEventId: string): Promise<GameEvent[]>
  loadLatestSnapshot?(gameId: string): Promise<unknown>
  saveSnapshot?(snapshot: unknown): Promise<void>
}

export class InMemoryEventStore implements EventStore {
  private events = new Map<string, GameEvent[]>()
  private snapshots = new Map<string, unknown>()

  async append(gameId: string, events: GameEvent[]): Promise<void> {
    const existing = this.events.get(gameId) ?? []
    existing.push(...events)
    this.events.set(gameId, existing)
  }

  async load(gameId: string): Promise<GameEvent[]> {
    return this.events.get(gameId) ?? []
  }

  async loadFrom(gameId: string, afterEventId: string): Promise<GameEvent[]> {
    const events = this.events.get(gameId) ?? []
    const idx = events.findIndex(e => e.id === afterEventId)
    return idx >= 0 ? events.slice(idx + 1) : []
  }

  async loadLatestSnapshot(gameId: string): Promise<unknown> {
    return this.snapshots.get(gameId)
  }

  async saveSnapshot(snapshot: unknown): Promise<void> {
    this.snapshots.set((snapshot as { gameId: string }).gameId, snapshot)
  }
}

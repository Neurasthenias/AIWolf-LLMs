import type { GameState, GameEvent, Command, Effect } from "@aiwolf/shared/types"
import { createGame, reduce, handleCommand, determineNextPhase, FileEventStore, replayState } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

interface RunningGame {
  state: GameState
  runtime: GameRuntime
}

export class GameRuntime {
  private commandQueue: Command[] = []
  private processing = false
  private effects: Map<string, { effect: Effect; createdAt: number }> = new Map()
  private eventStore: FileEventStore
  private eventSubscribers: Array<(event: GameEvent) => void> = []
  private aiProvider?: import("@aiwolf/ai").AIPipeline
  gameId: string

  constructor(gameId: string) {
    this.gameId = gameId
    this.eventStore = new FileEventStore()
  }

  // ── Public API ──

  onEvent(cb: (event: GameEvent) => void): () => void {
    this.eventSubscribers.push(cb)
    return () => { this.eventSubscribers = this.eventSubscribers.filter(s => s !== cb) }
  }

  async dispatch(command: Command): Promise<void> {
    this.commandQueue.push(command)
    if (!this.processing) await this.processQueue()
  }

  // ── Internal ──

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      // Keep processing until queue is empty
      while (this.commandQueue.length > 0) {
        const command = this.commandQueue.shift()!
        await this.processCommand(command)
      }
    } finally {
      this.processing = false
    }
  }

  private async processCommand(command: Command): Promise<void> {
    const state = this.getState()

    // Command → Events
    const events = handleCommand(command, state)
    if (events.length === 0) return

    // Reducer: events → new state + effects
    let currentState = state
    for (const event of events) {
      const result = reduce(currentState, event)
      currentState = result.newState

      // Collect effects
      for (const effect of result.effects) {
        this.effects.set(effect.id, { effect, createdAt: Date.now() })
      }

      // Persist event
      await this.eventStore.append(this.gameId, [event])

      // Notify subscribers
      for (const sub of this.eventSubscribers) {
        try { sub(event) } catch { /* subscriber error */ }
      }
    }

    // Update state
    this.saveState(currentState)

    // Run effects
    await this.runEffects()

    // Auto-advance zero-interaction phases (before next queue iteration)
    const autoAdvancePhases = new Set([
      "NIGHT_ANNOUNCE", "WOLF_INTEL", "SEER_RESULT", "WITCH_NOTIFY",
      "NIGHT_SETTLEMENT", "DAY_BREAK", "DEATH_ANNOUNCE", "SPEECH_PRE_THINK",
      "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT", "CHECK_WIN",
    ])
    const interactivePhases = new Set([
      "WOLF_PROPOSE", "SEER_CHOOSE", "WITCH_DECIDE",
      "SPEECH_TURN_ACTIVE", "VOTE_CAST", "COMMON_LAST_WORDS", "HUNTER_SHOOT",
    ])

    if (autoAdvancePhases.has(currentState.phase.subPhase)) {
      const next = determineNextPhase(currentState)
      if (next !== currentState.phase.subPhase && !interactivePhases.has(next)) {
        this.commandQueue.unshift({
          id: uuidv7(), version: "1.0", type: "phase:advance",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { to: next, round: currentState.phase.round },
        })
      }
    }
    this.processing = false
  }

  private async processCommand(command: Command): Promise<void> {
    const state = this.getState()

    // Command → Events
    const events = handleCommand(command, state)
    if (events.length === 0) return

    // Reducer: events → new state + effects
    let currentState = state
    for (const event of events) {
      const result = reduce(currentState, event)
      currentState = result.newState

      // Collect effects
      for (const effect of result.effects) {
        this.effects.set(effect.id, { effect, createdAt: Date.now() })
      }

      // Persist event
      await this.eventStore.append(this.gameId, [event])

      // Notify subscribers
      for (const sub of this.eventSubscribers) {
        try { sub(event) } catch { /* subscriber error shouldn't crash runtime */ }
      }
    }

    // Update state
    this.saveState(currentState)

    // Run effects (concurrent)
    await this.runEffects()

    // Auto-advance: only for zero-interaction phases
    const autoAdvancePhases = new Set([
      "NIGHT_ANNOUNCE", "WOLF_INTEL", "SEER_RESULT", "WITCH_NOTIFY",
      "NIGHT_SETTLEMENT", "DAY_BREAK", "DEATH_ANNOUNCE", "SPEECH_PRE_THINK",
      "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT", "CHECK_WIN",
    ])

    if (autoAdvancePhases.has(currentState.phase.subPhase)) {
      const next = determineNextPhase(currentState)
      if (next !== currentState.phase.subPhase && next !== "MVP_ANNOUNCE") {
        // Don't auto-advance into interactive phases — they wait for input
        const interactivePhases = new Set(["WOLF_PROPOSE", "SEER_CHOOSE", "WITCH_DECIDE", "SPEECH_TURN_ACTIVE", "VOTE_CAST", "COMMON_LAST_WORDS", "HUNTER_SHOOT"])
        if (!interactivePhases.has(next)) {
          const phaseCmd: Command = {
            id: uuidv7(), version: "1.0", type: "phase:advance",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { to: next, round: currentState.phase.round },
          }
          // Add back to queue (not recursive call) to avoid stack explosion
          this.commandQueue.unshift(phaseCmd)
        }
      }
    }
    // Continue processing queue (if more commands were added)
    if (this.commandQueue.length > 0) {
      return this.processQueue()
    }
  }

  private async runEffects(): Promise<void> {
    const pending = Array.from(this.effects.values())
    this.effects.clear()

    // Run effects concurrently
    await Promise.allSettled(pending.map(async ({ effect }) => {
      try {
        if (effect.type === "timer:start") {
          await this.runTimer(effect)
        } else if (effect.type === "persist:events") {
          // Already persisted above
        }
      } catch (err) {
        console.error(`[runtime] Effect ${effect.id} failed:`, (err as Error).message)
      }
    }))
  }

  private async runTimer(effect: Effect): Promise<void> {
    const phase = effect.payload.phase as string
    // In production, this would create a real timer. For MVP, we skip.
  }

  // ── State Management ──

  private gameStates = new Map<string, GameState>()

  getState(): GameState {
    return this.gameStates.get(this.gameId) ?? createGame({ roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 }, minPlayers: 6, maxPlayers: 6, rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" }, timeouts: { speech: 180, vote: 15, night: 15 } })
  }

  private saveState(state: GameState): void {
    this.gameStates.set(this.gameId, state)
  }

  // ── Metrics ──

  getMetrics() {
    return {
      gameId: this.gameId,
      queueLength: this.commandQueue.length,
      pendingEffects: this.effects.size,
      phase: this.getState().phase,
    }
  }
}

// ── Server-level game manager ──

const games = new Map<string, GameRuntime>()

export function getOrCreateGame(gameId: string): GameRuntime {
  if (!games.has(gameId)) {
    games.set(gameId, new GameRuntime(gameId))
  }
  return games.get(gameId)!
}

export function getGameMetrics() {
  return Array.from(games.values()).map(g => g.getMetrics())
}

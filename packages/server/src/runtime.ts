import type { GameState, GameEvent, Command, Effect } from "@aiwolf/shared/types"
import { createGame, reduce, handleCommand, determineNextPhase, FileEventStore } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const INTERACTIVE_PHASES = new Set([
  "WOLF_PROPOSE", "SEER_CHOOSE", "WITCH_DECIDE",
  "SPEECH_TURN_ACTIVE", "VOTE_CAST", "COMMON_LAST_WORDS", "HUNTER_SHOOT",
])

const AUTO_ADVANCE_PHASES = new Set([
  "ROLE_ASSIGNMENT",
  "NIGHT_ANNOUNCE", "WOLF_INTEL", "SEER_RESULT", "WITCH_NOTIFY",
  "NIGHT_SETTLEMENT", "DAY_BREAK", "DEATH_ANNOUNCE", "SPEECH_PRE_THINK",
  "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT", "CHECK_WIN",
])

export class GameRuntime {
  private commandQueue: Command[] = []
  private processing = false
  private effects: Map<string, { effect: Effect; createdAt: number }> = new Map()
  private eventStore: FileEventStore
  private eventSubscribers: Array<(event: GameEvent) => void> = []
  private aiPipeline?: import("@aiwolf/ai").AIPipeline
  private aiEventsFeed: GameEvent[] = []
  autoPlay = false
  gameId: string

  constructor(gameId: string) {
    this.gameId = gameId
    this.eventStore = new FileEventStore()
  }

  // ── AI Config ──

  private aiConfig?: import("@aiwolf/ai").AIProviderConfig

  setAIConfig(config: import("@aiwolf/ai").AIProviderConfig): void {
    this.aiConfig = config
  }

  getAIConfig(): import("@aiwolf/ai").AIProviderConfig | undefined {
    return this.aiConfig
  }

  // ── Public API ──

  initState(state: GameState): void {
    this.saveState(state)
  }

  onEvent(cb: (event: GameEvent) => void): () => void {
    this.eventSubscribers.push(cb)
    return () => { this.eventSubscribers = this.eventSubscribers.filter(s => s !== cb) }
  }

  async dispatch(command: Command): Promise<void> {
    this.commandQueue.push(command)
    if (!this.processing) await this.processQueue()
  }

  // ── State Management ──

  private gameStates = new Map<string, GameState>()

  getState(): GameState {
    return this.gameStates.get(this.gameId) ?? createGame({
      roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
      minPlayers: 6, maxPlayers: 6,
      rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
      timeouts: { speech: 180, vote: 15, night: 15 },
    })
  }

  private saveState(state: GameState): void {
    this.gameStates.set(this.gameId, state)
  }

  // ── Internal ──

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
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
      for (const effect of result.effects) {
        this.effects.set(effect.id, { effect, createdAt: Date.now() })
      }
      await this.eventStore.append(this.gameId, [event])
      this.aiEventsFeed.push(event)
      for (const sub of this.eventSubscribers) {
        try { sub(event) } catch { /* subscriber error */ }
      }
    }
    this.saveState(currentState)
    await this.runEffects()

    // If game is over, stop processing
    if (currentState.gameOver) return

    // Only auto-advance/AI-play when autoPlay is enabled
    if (!this.autoPlay) return

    // Auto-advance through non-interactive phases
    if (AUTO_ADVANCE_PHASES.has(currentState.phase.subPhase)) {
      const next = determineNextPhase(currentState)
      if (next === currentState.phase.subPhase || next === "MVP_ANNOUNCE") return

      // CHECK_WIN → RESULT_ANNOUNCE means game ended
      if (currentState.phase.subPhase === "CHECK_WIN" && next === "RESULT_ANNOUNCE") {
        await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "game:end",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { winner: this.computeWinner(currentState), mvp: "p1", svp: "p2" },
        })
        return
      }

      if (INTERACTIVE_PHASES.has(next)) {
        // Handle interactive chain synchronously
        await this.handleInteractiveChain(currentState, next)
      } else {
        // Queue non-interactive advance
        this.commandQueue.unshift({
          id: uuidv7(), version: "1.0", type: "phase:advance",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { to: next, round: currentState.phase.round },
        })
      }
    } else if (INTERACTIVE_PHASES.has(currentState.phase.subPhase)) {
      // We're already in an interactive phase (e.g., from a direct command)
      await this.handleInteractiveChain(currentState, currentState.phase.subPhase)
    }
  }

  // ── AI Interactive Phase Chain ──

  /** Process interactive phases sequentially until a non-interactive phase is reached */
  private async handleInteractiveChain(_initialState: GameState, firstPhase: string): Promise<void> {
    let currentState = this.getState()
    let nextPhase: string | null = firstPhase

    while (nextPhase && INTERACTIVE_PHASES.has(nextPhase) && !currentState.gameOver) {
      // Advance to this interactive phase
      const phaseCmd: Command = {
        id: uuidv7(), version: "1.0", type: "phase:advance",
        gameId: this.gameId, actorId: "system", timestamp: Date.now(),
        payload: { to: nextPhase, round: currentState.phase.round },
      }
      currentState = await this.dispatchInlineCmd(phaseCmd)

      // Generate AI actions for this phase
      await this.ensureAIPipeline()

      if (this.aiPipeline) {
        currentState = await this.runAIPhase(currentState, nextPhase)
      } else {
        currentState = await this.runRuleBasedPhase(currentState, nextPhase)
      }

      if (currentState.gameOver) break

      nextPhase = determineNextPhase(currentState)
      // If next is non-interactive, queue it and stop
      if (nextPhase && !INTERACTIVE_PHASES.has(nextPhase) && nextPhase !== "MVP_ANNOUNCE" && nextPhase !== currentState.phase.subPhase) {
        this.commandQueue.unshift({
          id: uuidv7(), version: "1.0", type: "phase:advance",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { to: nextPhase, round: currentState.phase.round },
        })
        break
      }
    }
  }

  // ── AI Phase Handlers ──

  private async runAIPhase(state: GameState, phase: string): Promise<GameState> {
    const pipeline = this.aiPipeline!
    const aiPlayers = Object.values(state.players).filter(p => p.isAI && p.isAlive)
    let s = state

    switch (phase) {
      case "WOLF_PROPOSE": {
        const wolves = aiPlayers.filter(p => p.role === "werewolf")
        const proposals: { wolfId: string; targetId: string }[] = []
        for (const wolf of wolves) {
          try {
            const { command } = await pipeline.generateAction(s, wolf.id, "wolf_kill", this.aiEventsFeed)
            const targetId = (command.payload as { targetId: string }).targetId
            if (targetId) proposals.push({ wolfId: wolf.id, targetId })
            s = await this.dispatchInlineCmd(command)
          } catch {
            const goods = Object.values(s.players).filter(p => p.isAlive && p.faction === "good")
            const t = goods.length > 0 ? goods[Math.floor(Math.random() * goods.length)]! : null
            if (t) proposals.push({ wolfId: wolf.id, targetId: t.id })
          }
        }
        // Save consensus to state (killed later in WITCH_DECIDE via night:witch_resolve)
        if (proposals.length > 0) {
          const tally: Record<string, number> = {}
          for (const p of proposals) { tally[p.targetId] = (tally[p.targetId] ?? 0) + 1 }
          const maxCount = Math.max(...Object.values(tally))
          const topIds = Object.entries(tally).filter(([, c]) => c === maxCount).map(([id]) => id)
          const targetId = topIds.sort()[0]!
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "night:wolf_proposal_resolved",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { targetId },
          })
        }
        return s
      }

      case "SEER_CHOOSE": {
        const seer = aiPlayers.find(p => p.role === "seer")
        if (seer) {
          try {
            const { command } = await pipeline.generateAction(s, seer.id, "seer_check", this.aiEventsFeed)
            const targetId = (command.payload as { targetId: string }).targetId
            const target = s.players[targetId]
            const result = target?.faction === "wolf" ? "wolf" : "good"
            s = await this.dispatchInlineCmd({
              ...command,
              type: "night:seer_check",
              payload: { ...command.payload as object, result },
            })
          } catch {
            const alive = Object.values(s.players).filter(p => p.isAlive && p.id !== seer.id)
            if (alive.length > 0) {
              const t = alive[Math.floor(Math.random() * alive.length)]!
              s = await this.dispatchInlineCmd({
                id: uuidv7(), version: "1.0", type: "night:seer_check",
                gameId: this.gameId, actorId: seer.id, timestamp: Date.now(),
                payload: { targetId: t.id, result: t.faction === "wolf" ? "wolf" : "good" },
              })
            }
          }
        }
        return s
      }

      case "WITCH_DECIDE": {
        const witch = aiPlayers.find(p => p.role === "witch")
        if (witch) {
          try {
            const { command } = await pipeline.generateAction(s, witch.id, "witch_action", this.aiEventsFeed)
            const payload = command.payload as { saveTargetId?: string; poisonTargetId?: string }
            const wolfKillTargetId = s.resolvedWolfTarget
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "night:witch_resolve",
              gameId: this.gameId, actorId: "system", timestamp: Date.now(),
              payload: { saveTargetId: payload.saveTargetId, poisonTargetId: payload.poisonTargetId, wolfKillTargetId },
            })
          } catch { /* no action */ }
        } else {
          const wolfKillTargetId = s.resolvedWolfTarget
          if (wolfKillTargetId) {
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "night:witch_resolve",
              gameId: this.gameId, actorId: "system", timestamp: Date.now(),
              payload: { wolfKillTargetId },
            })
          }
        }
        return s
      }

      case "SPEECH_TURN_ACTIVE": {
        // Process all AI speakers in seat order (skip human)
        const speakers = aiPlayers.sort((a, b) => a.seat - b.seat)
        for (const sp of speakers) {
          try {
            const { command } = await pipeline.generateAction(s, sp.id, "speech", this.aiEventsFeed)
            s = await this.dispatchInlineCmd(command)
          } catch {
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "speech:submit",
              gameId: this.gameId, actorId: sp.id, timestamp: Date.now(),
              payload: { content: fallbackSpeech(sp.role, sp.faction) },
            })
          }
          // Set this speaker as current so the UI updates
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:set_speaker",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { playerId: sp.id },
          })
        }
        return s
      }

      case "VOTE_CAST": {
        const voters = aiPlayers.filter(p => p.isAlive)
        for (const voter of voters) {
          try {
            const { command } = await pipeline.generateAction(s, voter.id, "vote", this.aiEventsFeed)
            s = await this.dispatchInlineCmd(command)
          } catch {
            const candidates = Object.values(s.players).filter(p => p.isAlive && p.id !== voter.id)
            let targetId: string | null = null
            if (candidates.length > 0) {
              if (voter.faction === "wolf") {
                const goods = candidates.filter(p => p.faction === "good")
                targetId = goods.length > 0 ? goods[Math.floor(Math.random() * goods.length)]!.id : candidates[Math.floor(Math.random() * candidates.length)]!.id
              } else {
                targetId = candidates[Math.floor(Math.random() * candidates.length)]!.id
              }
            }
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "vote:cast",
              gameId: this.gameId, actorId: voter.id, timestamp: Date.now(),
              payload: { targetId },
            })
          }
        }
        // Tally and exile
        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "vote:reveal",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { votes: Object.values(s.players).filter(p => p.isAlive).map(p => ({ playerId: p.id, targetId: p.voteTargetId ?? null })) },
        })
        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "vote:tally",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: {},
        })
        return s
      }

      default:
        return s
    }
  }

  // ── Rule-based fallback ──

  private async runRuleBasedPhase(state: GameState, phase: string): Promise<GameState> {
    const aiPlayers = Object.values(state.players).filter(p => p.isAI && p.isAlive)
    let s = state

    switch (phase) {
      case "WOLF_PROPOSE": {
        const goods = Object.values(s.players).filter(p => p.isAlive && p.faction === "good")
        if (goods.length > 0) {
          const t = goods[Math.floor(Math.random() * goods.length)]!
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "night:wolf_proposal_resolved",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { targetId: t.id },
          })
        }
        return s
      }
      case "SEER_CHOOSE": {
        const seer = aiPlayers.find(p => p.role === "seer")
        if (seer) {
          const alive = Object.values(s.players).filter(p => p.isAlive && p.id !== seer.id)
          if (alive.length > 0) {
            const t = alive[Math.floor(Math.random() * alive.length)]!
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "night:seer_check",
              gameId: this.gameId, actorId: seer.id, timestamp: Date.now(),
              payload: { targetId: t.id, result: t.faction === "wolf" ? "wolf" : "good" },
            })
          }
        }
        return s
      }
      case "WITCH_DECIDE": {
        const wolfKillTargetId = s.resolvedWolfTarget
        if (wolfKillTargetId) {
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "night:witch_resolve",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { wolfKillTargetId },
          })
        }
        return s
      }
      case "SPEECH_TURN_ACTIVE": {
        const speakers = aiPlayers.sort((a, b) => a.seat - b.seat)
        for (const speaker of speakers) {
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:submit",
            gameId: this.gameId, actorId: speaker.id, timestamp: Date.now(),
            payload: { content: fallbackSpeech(speaker.role, speaker.faction) },
          })
        }
        return s
      }
      case "VOTE_CAST": {
        for (const voter of aiPlayers) {
          const candidates = Object.values(s.players).filter(p => p.isAlive && p.id !== voter.id)
          let targetId: string | null = null
          if (candidates.length > 0) {
            if (voter.faction === "wolf") {
              // Wolves vote together against a random good player
              const goods = candidates.filter(p => p.faction === "good")
              targetId = goods.length > 0 ? goods[Math.floor(Math.random() * goods.length)]!.id : candidates[Math.floor(Math.random() * candidates.length)]!.id
            } else {
              // Good players vote randomly — they can't know who's a wolf
              targetId = candidates[Math.floor(Math.random() * candidates.length)]!.id
            }
          }
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "vote:cast",
            gameId: this.gameId, actorId: voter.id, timestamp: Date.now(),
            payload: { targetId },
          })
        }
        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "vote:reveal",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { votes: Object.values(s.players).filter(p => p.isAlive).map(p => ({ playerId: p.id, targetId: p.voteTargetId ?? null })) },
        })
        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "vote:tally",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: {},
        })
        return s
      }
      default:
        return s
    }
  }

  // ── Helpers ──

  private async ensureAIPipeline(): Promise<void> {
    if (this.aiPipeline) return
    if (!this.aiConfig) {
      const apiKey = process.env.OPENAI_API_KEY
      if (apiKey) {
        this.aiConfig = {
          apiKey,
          baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        }
      }
    }
    if (!this.aiConfig) return
    const { AIPipeline } = await import("@aiwolf/ai")
    this.aiPipeline = new AIPipeline(this.aiConfig)
    const state = this.getState()
    for (const [id, p] of Object.entries(state.players)) {
      this.aiPipeline.initPlayer(id, p.role, p.faction)
    }
    for (const event of this.aiEventsFeed) {
      for (const pid of Object.keys(state.players)) {
        this.aiPipeline.feedEvent(pid, event)
      }
    }
  }

  private async dispatchInlineCmd(command: Command): Promise<GameState> {
    const state = this.getState()
    const events = handleCommand(command, state)
    if (events.length === 0) return state
    let currentState = state
    for (const event of events) {
      const result = reduce(currentState, event)
      currentState = result.newState
      await this.eventStore.append(this.gameId, [event])
      this.aiEventsFeed.push(event)
      for (const sub of this.eventSubscribers) {
        try { sub(event) } catch { /* ok */ }
      }
    }
    this.saveState(currentState)
    return currentState
  }

  private computeWinner(state: GameState): string {
    const alive = Object.values(state.players).filter(p => p.isAlive)
    const aliveWolves = alive.filter(p => p.faction === "wolf").length
    const aliveGood = alive.filter(p => p.faction === "good").length
    return aliveWolves >= aliveGood ? "wolf" : "good"
  }

  private findNextSpeaker(state: GameState): string | null {
    const alive = Object.values(state.players).filter(p => p.isAlive)
    const currentIdx = state.currentSpeakerId
      ? alive.findIndex(p => p.id === state.currentSpeakerId)
      : -1
    const next = alive[(currentIdx + 1) % alive.length]
    return next?.id ?? null
  }

  // ── Effects ──

  private async runEffects(): Promise<void> {
    const pending = Array.from(this.effects.values())
    this.effects.clear()
    await Promise.allSettled(pending.map(async ({ effect }) => {
      try {
        if (effect.type === "timer:start" || effect.type === "persist:events") {
          // Timer/Persist placeholders
        }
      } catch (err) {
        console.error(`[runtime] Effect ${effect.id} failed:`, (err as Error).message)
      }
    }))
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

// ── Role-aware fallback speeches ──

const SPEECH_POOL: Record<string, string[]> = {
  werewolf: [
    "我是村民，目前信息还不够，想多听听后面玩家的发言。",
    "我偏向于先观察一轮，大家有什么线索可以分享一下。",
    "我觉得我们可以先理一理逻辑，从死者的身份开始分析。",
  ],
  villager: [
    "我是普通村民，没有特殊信息，但我会认真听每个人的发言。",
    "目前信息不多，希望大家能积极发言，特别是神职玩家。",
    "我暂时没有明确的怀疑对象，先听听后面的发言。",
  ],
  seer: [
    "昨晚我查验了一个人，但目前还不方便透露结果，先听听大家的看法。",
    "我是预言家，有查验信息，但现在公开还不是时候。",
  ],
  witch: [
    "这个局势下我们需要谨慎行事，我会根据情况做出判断。",
    "我掌握一些信息，但目前还不是公开的最佳时机。",
  ],
}

function fallbackSpeech(role: string, _faction: string): string {
  const pool = SPEECH_POOL[role] ?? SPEECH_POOL["villager"]!
  return pool[Math.floor(Math.random() * pool.length)]!
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

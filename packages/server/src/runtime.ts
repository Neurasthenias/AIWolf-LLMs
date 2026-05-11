import type { GameState, GameEvent, Command, Effect } from "@aiwolf/shared/types"
import { createGame, reduce, handleCommand, determineNextPhase, isPhaseComplete, FileEventStore } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const INTERACTIVE_PHASES = new Set([
  "ROLE_REVEAL", "WOLF_PROPOSE", "SEER_CHOOSE", "WITCH_DECIDE",
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
  private aiChainRunning = false
  private aiChainPendingPhase: string | null = null
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

    if (currentState.gameOver) return
    if (!this.autoPlay) return

    // Delegate to unified auto-flow logic
    await this.continueAutoFlow(currentState)
  }

  /** Unified auto-advance: handle non-interactive → advance, interactive → chain */
  private async continueAutoFlow(currentState: GameState): Promise<void> {
    const subPhase = currentState.phase.subPhase

    if (AUTO_ADVANCE_PHASES.has(subPhase)) {
      const next = determineNextPhase(currentState)
      if (next === subPhase || next === "MVP_ANNOUNCE") return

      if (subPhase === "CHECK_WIN" && next === "RESULT_ANNOUNCE") {
        await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "game:end",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { winner: this.computeWinner(currentState), mvp: "p1", svp: "p2" },
        })
        return
      }

      if (INTERACTIVE_PHASES.has(next)) {
        this.scheduleInteractiveChain(next)
      } else {
        this.commandQueue.unshift({
          id: uuidv7(), version: "1.0", type: "phase:advance",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { to: next, round: currentState.phase.round },
        })
      }
    } else if (INTERACTIVE_PHASES.has(subPhase)) {
      this.scheduleInteractiveChain(subPhase)
    }
  }

  private scheduleInteractiveChain(firstPhase: string): void {
    if (this.aiChainRunning) {
      this.aiChainPendingPhase = firstPhase
      return
    }
    this.aiChainRunning = true
    setImmediate(() => {
      this.handleInteractiveChain(this.getState(), firstPhase)
        .catch(err => {
          console.error("[runtime] AI chain error:", err)
        })
        .finally(() => {
          this.aiChainRunning = false
          const pending = this.aiChainPendingPhase
          this.aiChainPendingPhase = null
          if (pending) {
            this.continueAutoFlow(this.getState())
          }
        })
    })
  }

  // ── AI Interactive Phase Chain ──

  /** Process interactive phases sequentially until a non-interactive phase is reached */
  private async handleInteractiveChain(_initialState: GameState, firstPhase: string): Promise<void> {
    let currentState = this.getState()
    let nextPhase: string | null = firstPhase

    while (nextPhase && INTERACTIVE_PHASES.has(nextPhase) && !currentState.gameOver) {
      // Only advance if not already in this phase (avoids duplicate phase:transitioned)
      if (currentState.phase.subPhase !== nextPhase) {
        const phaseCmd: Command = {
          id: uuidv7(), version: "1.0", type: "phase:advance",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { to: nextPhase, round: currentState.phase.round },
        }
        currentState = await this.dispatchInlineCmd(phaseCmd)
      }

      // Generate AI actions for this phase
      await this.ensureAIPipeline()

      const stateBefore = currentState.lastEventSeq
      if (this.aiPipeline) {
        currentState = await this.runAIPhase(currentState, nextPhase)
      } else {
        currentState = await this.runRuleBasedPhase(currentState, nextPhase)
      }
      const madeProgress = currentState.lastEventSeq > stateBefore

      if (currentState.gameOver) break

      // Don't advance if phase is not yet complete
      if (!isPhaseComplete(currentState)) {
        // Stay in the same phase to process more AI actions (e.g. next speaker)
        // Only continue if we made progress (avoids infinite loop on human speaker)
        if (INTERACTIVE_PHASES.has(currentState.phase.subPhase) && madeProgress) {
          nextPhase = currentState.phase.subPhase
          continue
        }
        break
      }

      nextPhase = determineNextPhase(currentState)
      // If next is non-interactive, dispatch it and stop
      if (nextPhase && !INTERACTIVE_PHASES.has(nextPhase) && nextPhase !== "MVP_ANNOUNCE" && nextPhase !== currentState.phase.subPhase) {
        await this.dispatch({
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
      case "ROLE_REVEAL": {
        for (const p of aiPlayers) {
          if ((s.roleAcks ?? []).includes(p.id)) continue
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "role:acknowledge",
            gameId: this.gameId, actorId: p.id, timestamp: Date.now(),
            payload: {},
          })
        }
        return s
      }

      case "WOLF_PROPOSE": {
        // All alive wolves (AI + human) must propose before resolution
        const allWolves = Object.values(s.players).filter(p => p.isAlive && p.role === "werewolf")
        const aiWolves = allWolves.filter(p => p.isAI)

        // Generate proposals for AI wolves that haven't proposed yet
        for (const wolf of aiWolves) {
          const alreadyProposed = (s.wolfProposals ?? []).some(p => p.wolfId === wolf.id)
          if (alreadyProposed) continue
          try {
            const { command } = await pipeline.generateAction(s, wolf.id, "wolf_kill", this.aiEventsFeed)
            s = await this.dispatchInlineCmd(command)
          } catch {
            const goods = Object.values(s.players).filter(p => p.isAlive && p.faction === "good")
            const t = goods.length > 0 ? goods[Math.floor(Math.random() * goods.length)]! : null
            if (t) {
              s = await this.dispatchInlineCmd({
                id: uuidv7(), version: "1.0", type: "night:wolf_kill",
                gameId: this.gameId, actorId: wolf.id, timestamp: Date.now(),
                payload: { targetId: t.id },
              })
            }
          }
        }

        // Check if ALL alive wolves have proposed
        const proposals = s.wolfProposals ?? []
        const allProposed = allWolves.every(w => proposals.some(p => p.wolfId === w.id))
        if (!allProposed) return s // Wait for human wolves

        // Tally and resolve
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
        // Initialize speech queue once per phase
        if (!s.speechQueue || s.speechQueue.length === 0) {
          const queue = Object.values(s.players)
            .filter(p => p.isAlive)
            .sort((a, b) => a.seat - b.seat)
            .map(p => p.id)
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:init_speech_queue",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { queue },
          })
        }

        // Find next speaker who hasn't spoken yet
        const queue = s.speechQueue ?? []
        const done = new Set(s.speechDone ?? [])
        const nextSpeakerId = queue.find(id => !done.has(id))
        if (!nextSpeakerId) return s // All done

        const speaker = s.players[nextSpeakerId]
        if (!speaker || !speaker.isAlive) {
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:mark_speech_done",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { playerId: nextSpeakerId },
          })
          return s // Re-enter for next speaker
        }

        // Set as current speaker
        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "speech:set_speaker",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { playerId: nextSpeakerId },
        })

        // AI speaker: generate + mark done immediately
        if (speaker.isAI) {
          try {
            const { command } = await pipeline.generateAction(s, nextSpeakerId, "speech", this.aiEventsFeed)
            s = await this.dispatchInlineCmd(command)
          } catch {
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "speech:submit",
              gameId: this.gameId, actorId: nextSpeakerId, timestamp: Date.now(),
              payload: { content: fallbackSpeech(speaker.role, speaker.faction) },
            })
          }
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:mark_speech_done",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { playerId: nextSpeakerId },
          })
        }
        // Human speaker: wait — speech:submit will trigger chain re-entry

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
      case "ROLE_REVEAL": {
        for (const p of aiPlayers) {
          if ((s.roleAcks ?? []).includes(p.id)) continue
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "role:acknowledge",
            gameId: this.gameId, actorId: p.id, timestamp: Date.now(),
            payload: {},
          })
        }
        return s
      }

      case "WOLF_PROPOSE": {
        const allWolves = Object.values(s.players).filter(p => p.isAlive && p.role === "werewolf")
        const aiWolves = allWolves.filter(p => p.isAI)
        const goods = Object.values(s.players).filter(p => p.isAlive && p.faction === "good")

        // Generate proposals for AI wolves that haven't proposed yet
        for (const wolf of aiWolves) {
          const alreadyProposed = (s.wolfProposals ?? []).some(p => p.wolfId === wolf.id)
          if (alreadyProposed) continue
          if (goods.length > 0) {
            const t = goods[Math.floor(Math.random() * goods.length)]!
            s = await this.dispatchInlineCmd({
              id: uuidv7(), version: "1.0", type: "night:wolf_kill",
              gameId: this.gameId, actorId: wolf.id, timestamp: Date.now(),
              payload: { targetId: t.id },
            })
          }
        }

        // Check if ALL alive wolves have proposed
        const proposals = s.wolfProposals ?? []
        const allProposed = allWolves.every(w => proposals.some(p => p.wolfId === w.id))
        if (!allProposed) return s // Wait for human wolves

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
        // Initialize speech queue once per phase
        if (!s.speechQueue || s.speechQueue.length === 0) {
          const queue = Object.values(s.players)
            .filter(p => p.isAlive)
            .sort((a, b) => a.seat - b.seat)
            .map(p => p.id)
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:init_speech_queue",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { queue },
          })
        }

        const queue = s.speechQueue ?? []
        const done = new Set(s.speechDone ?? [])
        const nextSpeakerId = queue.find(id => !done.has(id))
        if (!nextSpeakerId) return s

        const speaker = s.players[nextSpeakerId]
        if (!speaker || !speaker.isAlive) {
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:mark_speech_done",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { playerId: nextSpeakerId },
          })
          return s
        }

        s = await this.dispatchInlineCmd({
          id: uuidv7(), version: "1.0", type: "speech:set_speaker",
          gameId: this.gameId, actorId: "system", timestamp: Date.now(),
          payload: { playerId: nextSpeakerId },
        })

        if (speaker.isAI) {
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:submit",
            gameId: this.gameId, actorId: nextSpeakerId, timestamp: Date.now(),
            payload: { content: fallbackSpeech(speaker.role, speaker.faction) },
          })
          s = await this.dispatchInlineCmd({
            id: uuidv7(), version: "1.0", type: "speech:mark_speech_done",
            gameId: this.gameId, actorId: "system", timestamp: Date.now(),
            payload: { playerId: nextSpeakerId },
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
        const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
        const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
        const isDeepSeek = process.env.OPENAI_PROVIDER === "deepseek" || baseURL.includes("deepseek") || model.startsWith("deepseek")
        const thinkingEnabled = process.env.AI_THINKING_ENABLED
          ? process.env.AI_THINKING_ENABLED === "true"
          : model === "deepseek-v4-flash"
        this.aiConfig = {
          apiKey,
          baseURL,
          model,
          provider: isDeepSeek ? "deepseek" : "openai-compatible",
          thinking: {
            enabled: thinkingEnabled,
            effort: process.env.AI_REASONING_EFFORT === "max" ? "max" : "high",
          },
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

  // ── Event Store Access ──

  async getEventsSince(fromSeq: number): Promise<GameEvent[]> {
    const all = await this.eventStore.load(this.gameId)
    return all.filter(e => e.seq > fromSeq)
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

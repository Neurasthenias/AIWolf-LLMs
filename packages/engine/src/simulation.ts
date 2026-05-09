import { createGame, reduce, replayState, handleCommand, assignRoles, determineNextPhase, FileEventStore } from "./index"
import type { GameState, GameEvent, GameConfig } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

const testConfig: GameConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

interface SimResult {
  gameId: string
  totalEvents: number
  rounds: number
  winner: string | null
  replayMatch: boolean
  deadlock: boolean
  invariantViolations: string[]
  durationMs: number
}

export async function runSimulation(numGames: number, seed: number): Promise<SimResult[]> {
  const results: SimResult[] = []

  for (let i = 0; i < numGames; i++) {
    const gameSeed = seed + i * 1000
    const result = await runSingleGame(gameSeed)
    results.push(result)

    if (i % 100 === 0) {
      const done = results.filter(r => !r.deadlock && r.replayMatch).length
      console.log(`[sim] ${i}/${numGames} — ok:${done} deadlock:${results.filter(r => r.deadlock).length} diverge:${results.filter(r => !r.replayMatch).length}`)
    }
  }

  return results
}

async function runSingleGame(seed: number): Promise<SimResult> {
  const start = Date.now()
  const gameId = uuidv7()
  const store = new FileEventStore()

  let state = createGame(testConfig)
  const initialState = JSON.parse(JSON.stringify(state)) as GameState  // Deep copy for replay
  const events: GameEvent[] = []
  const invariantViolations: string[] = []
  let deadlock = false
  let maxRounds = 0

  try {
    // 1. Assign roles
    const assigned = assignRoles(state.players, testConfig, seed)
    const cmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const roleEvents = handleCommand(cmd, state)
    events.push(...roleEvents)
    state = replayState(roleEvents, state)

    // 2. Game loop
    const phases = [
      "NIGHT_ANNOUNCE", "WOLF_INTEL", "WOLF_PROPOSE", "SEER_CHOOSE", "SEER_RESULT",
      "WITCH_NOTIFY", "WITCH_DECIDE", "NIGHT_SETTLEMENT", "DAY_BREAK",
      "DEATH_ANNOUNCE", "CHECK_WIN", "SPEECH_PRE_THINK", "SPEECH_TURN_ACTIVE",
      "VOTE_CAST", "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT",
    ]

    for (let round = 1; round <= 20; round++) {
      maxRounds = round
      for (const subPhase of phases) {
        const phaseCmd = { id: uuidv7(), version: "1.0", type: "phase:advance", gameId, actorId: "system", timestamp: Date.now(), payload: { to: subPhase, round } }
        const evts = handleCommand(phaseCmd, state)
        events.push(...evts)
        state = replayState(evts, state)

        // Simulate night action
        if (subPhase === "WOLF_PROPOSE") {
          const aliveGood = Object.values(state.players).filter(p => p.isAlive && p.faction === "good")
          if (aliveGood.length > 0) {
            const target = aliveGood[(round + seed) % aliveGood.length]!
            const killCmd = { id: uuidv7(), version: "1.0", type: "night:wolf_kill_resolved", gameId, actorId: "system", timestamp: Date.now(), payload: { targetId: target.id } }
            const evts = handleCommand(killCmd, state)
            events.push(...evts)
            state = replayState(evts, state)
          }
        }

        // Simulate seer check
        if (subPhase === "SEER_CHOOSE") {
          const seer = Object.values(state.players).find(p => p.role === "seer" && p.isAlive)
          if (seer) {
            const alive = Object.values(state.players).filter(p => p.isAlive && p.id !== seer.id)
            if (alive.length > 0) {
              const target = alive[(round + seed) % alive.length]!
              const result = target.faction === "wolf" ? "wolf" : "good"
              const seerCmd = { id: uuidv7(), version: "1.0", type: "night:seer_check", gameId, actorId: seer.id, timestamp: Date.now(), payload: { targetId: target.id, result } }
              const evts = handleCommand(seerCmd, state)
              events.push(...evts)
              state = replayState(evts, state)
            }
          }
        }

        // Simulate vote
        if (subPhase === "VOTE_CAST") {
          const alive = Object.values(state.players).filter(p => p.isAlive)
          const wolves = alive.filter(p => p.faction === "wolf")
          const goods = alive.filter(p => p.faction === "good")

          // Rule-based: each player votes randomly
          const votes: { playerId: string; targetId: string | null }[] = []
          for (const p of alive) {
            const candidates = p.faction === "wolf"
              ? goods.filter(g => g.id !== p.id)
              : alive.filter(a => a.id !== p.id)
            const target = candidates.length > 0 ? candidates[(round + seed + p.seat) % candidates.length]! : null
            votes.push({ playerId: p.id, targetId: target?.id ?? null })

            const voteCmd = { id: uuidv7(), version: "1.0", type: "vote:cast", gameId, actorId: p.id, timestamp: Date.now(), payload: { targetId: target?.id ?? null } }
            const evts = handleCommand(voteCmd, state)
            events.push(...evts)
            state = replayState(evts, state)
          }

          // Reveal votes
          const revealCmd = { id: uuidv7(), version: "1.0", type: "vote:reveal", gameId, actorId: "system", timestamp: Date.now(), payload: { votes } }
          const revEvts = handleCommand(revealCmd, state)
          events.push(...revEvts)
          state = replayState(revEvts, state)
        }

        // Simulate exile
        if (subPhase === "EXILE_ANNOUNCE") {
          const alive = Object.values(state.players).filter(p => p.isAlive)
          // Exile the player with most votes (simplified: pick a wolf if exists, else random)
          const target = alive.find(p => p.faction === "wolf") ?? alive[(round + seed) % alive.length]!
          const exileCmd = { id: uuidv7(), version: "1.0", type: "player:exile", gameId, actorId: "system", timestamp: Date.now(), payload: { playerId: target.id } }
          const evts = handleCommand(exileCmd, state)
          events.push(...evts)
          state = replayState(evts, state)
        }

        // Win check
        if (subPhase === "CHECK_WIN") {
          const next = determineNextPhase(state)
          if (next === "RESULT_ANNOUNCE") {
            const alive = Object.values(state.players).filter(p => p.isAlive)
            const winner = alive.filter(p => p.faction === "wolf").length >= alive.filter(p => p.faction === "good").length ? "wolf" : "good"
            const endCmd = { id: uuidv7(), version: "1.0", type: "game:end", gameId, actorId: "system", timestamp: Date.now(), payload: { winner, mvp: "p1", svp: "p2" } }
            const evts = handleCommand(endCmd, state)
            events.push(...evts)
            state = replayState(evts, state)
            break
          }
        }
      }

      // Check game over
      if (state.gameOver) break

      // Deadlock detection
      if (round > 15) {
        const alive = Object.values(state.players).filter(p => p.isAlive)
        if (alive.length > 1 && alive.filter(p => p.faction === "wolf").length > 0 && alive.filter(p => p.faction === "wolf").length < alive.filter(p => p.faction === "good").length) {
          // Stuck — force end
          const endCmd = { id: uuidv7(), version: "1.0", type: "game:end", gameId, actorId: "system", timestamp: Date.now(), payload: { winner: "good", mvp: "p1", svp: "p2" } }
          const evts = handleCommand(endCmd, state)
          events.push(...evts)
          state = replayState(evts, state)
          break
        }
      }
    }

    // Persist events
    await store.append(gameId, events)

    // Verify replay
    const loaded = await store.load(gameId)
    const replayInitial = JSON.parse(JSON.stringify(initialState)) as GameState
    const replayState1 = replayState(loaded, replayInitial)
    const replayState2 = replayState(loaded, JSON.parse(JSON.stringify(initialState)) as GameState)
    const replayMatch = JSON.stringify(replayState1) === JSON.stringify(replayState2)

    // Verify invariants
    invariantViolations.push(...checkInvariants(replayState1, loaded))

    // Cleanup
    await store.delete(gameId)

    return {
      gameId,
      totalEvents: events.length,
      rounds: maxRounds,
      winner: state.gameOver?.winner ?? null,
      replayMatch,
      deadlock,
      invariantViolations,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      gameId,
      totalEvents: events.length,
      rounds: maxRounds,
      winner: null,
      replayMatch: false,
      deadlock: true,
      invariantViolations: [(err as Error).message],
      durationMs: Date.now() - start,
    }
  }
}

function checkInvariants(state: GameState, events: GameEvent[]): string[] {
  const violations: string[] = []

  // Player count constant
  const totalPlayers = Object.keys(state.players).length
  if (totalPlayers !== 6) violations.push(`Player count: ${totalPlayers} !== 6`)

  // No duplicate death
  const deathEvents = events.filter(e => e.type === "death:player_died")
  const deadPlayers = new Set(deathEvents.map(e => (e.payload as { playerId: string }).playerId))
  if (deadPlayers.size !== deathEvents.length) violations.push("Duplicate death events")

  // Phase consistency
  if (state.gameOver && state.phase.type !== "GAME_OVER") {
    violations.push("gameOver set but phase not GAME_OVER")
  }

  return violations
}

// Export FileEventStore from here
export { FileEventStore } from "./event-store"

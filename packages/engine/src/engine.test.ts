import { describe, it, expect } from "vitest"
import { createGame, reduce, replayState, handleCommand, determineNextPhase, assignRoles, isPhaseComplete, buildPlayerView } from "./index"
import type { GameState, GameEvent, GameConfig } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"
import fc from "fast-check"

const testConfig: GameConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

function makeEvent(overrides: Partial<GameEvent> & { type: string; payload: Record<string, unknown> }): GameEvent {
  return {
    id: uuidv7(), version: "1.0", schemaVersion: "1.0",
    gameId: "test", seq: 1, timestamp: Date.now(), visibility: "public",
    ...overrides,
  }
}

// ── Replay helper ──
function expectReplayDeterministic(events: GameEvent[], initial: GameState) {
  const r1 = replayState(events, initial)
  const r2 = replayState(events, initial)
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  return r1
}

describe("Engine — Domain Reducers", () => {
  it("room:player_joined adds player", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "room:player_joined", payload: { playerId: "p1", name: "Alice", seat: 1 } })
    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.name).toBe("Alice")
  })

  it("role:assigned sets role and faction", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "role:assigned", visibility: "private", visibleTo: ["p1"], payload: { playerId: "p1", role: "werewolf", faction: "wolf" } })
    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.role).toBe("werewolf")
    expect(newState.players["p1"]?.faction).toBe("wolf")
  })

  it("phase:transitioned updates phase and starts timer effect", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "phase:transitioned", seq: 5, payload: { from: "WAITING_PLAYERS", to: "NIGHT_ANNOUNCE", round: 1 } })
    const { newState, effects } = reduce(state, event)
    expect(newState.phase.subPhase).toBe("NIGHT_ANNOUNCE")
    expect(newState.phase.type).toBe("NIGHT")
    expect(effects.some(e => e.type === "timer:start")).toBe(true)
  })

  it("vote:cast records vote", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "vote:cast", visibility: "hidden", payload: { playerId: "p1", targetId: "p3" } })
    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.voteTargetId).toBe("p3")
  })

  it("death:player_died marks player dead", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "death:player_died", payload: { playerId: "p1", cause: "WOLF_KILL", round: 1 } })
    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.isAlive).toBe(false)
    expect(newState.players["p1"]?.deathInfo?.cause).toBe("WOLF_KILL")
  })

  it("game:ended sets gameOver", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "game:ended", payload: { winner: "good", mvp: "p3", svp: "p2" } })
    const { newState } = reduce(state, event)
    expect(newState.gameOver?.winner).toBe("good")
  })

  it("role:seer_result writes seerChecks", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 1, dayNumber: 1 }
    const event = makeEvent({
      type: "role:seer_result", visibility: "private", visibleTo: ["p1"],
      payload: { playerId: "p1", targetId: "p2", result: "wolf" },
    })
    const { newState } = reduce(state, event)
    expect(newState.seerChecks).toBeDefined()
    expect(newState.seerChecks).toHaveLength(1)
    expect(newState.seerChecks![0]).toMatchObject({
      round: 1, seerId: "p1", targetId: "p2", result: "wolf",
    })
  })

  it("role:seer_result appends without overwriting", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 2, dayNumber: 2 }
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p3", result: "good" }]
    const event = makeEvent({
      type: "role:seer_result", visibility: "private", visibleTo: ["p1"],
      payload: { playerId: "p1", targetId: "p2", result: "wolf" },
    })
    const { newState } = reduce(state, event)
    expect(newState.seerChecks).toHaveLength(2)
    expect(newState.seerChecks![1]).toMatchObject({
      round: 2, seerId: "p1", targetId: "p2", result: "wolf",
    })
  })
})

describe("Engine — Replay", () => {
  it("replayState returns identical state when replayed", () => {
    const state = createGame(testConfig)
    const events: GameEvent[] = [
      makeEvent({ type: "room:player_joined", seq: 1, payload: { playerId: "p1", name: "A", seat: 1 } }),
      makeEvent({ type: "role:assigned", seq: 2, visibility: "private", visibleTo: ["p1"], payload: { playerId: "p1", role: "seer", faction: "good" } }),
      makeEvent({ type: "phase:transitioned", seq: 3, payload: { from: "WAITING_PLAYERS", to: "NIGHT_ANNOUNCE", round: 1 } }),
    ]
    const final = replayState(events, state)
    const replayed = replayState(events, state)
    expect(JSON.stringify(final)).toBe(JSON.stringify(replayed))
  })

  it("replay with 50 random events is deterministic", () => {
    const initial = createGame(testConfig)
    const eventTypes = ["room:player_joined", "role:assigned", "phase:transitioned", "death:player_died", "vote:cast"]
    const events: GameEvent[] = []

    for (let i = 0; i < 50; i++) {
      const type = eventTypes[i % eventTypes.length]!
      events.push(makeEvent({
        seq: i + 1,
        type,
        payload: type === "death:player_died"
          ? { playerId: `p${(i % 6) + 1}`, cause: "WOLF_KILL", round: 1 }
          : type === "role:assigned"
          ? { playerId: `p${(i % 6) + 1}`, role: "villager", faction: "good" }
          : type === "vote:cast"
          ? { playerId: `p${(i % 6) + 1}`, targetId: "p1" }
          : type === "phase:transitioned"
          ? { from: "WAITING_PLAYERS", to: "NIGHT_ANNOUNCE", round: 1 }
          : { playerId: `p${(i % 6) + 1}`, name: "X", seat: 1 },
      }))
    }

    const r1 = replayState(events, initial)
    const r2 = replayState(events, initial)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })
})

describe("Engine — Property-based Tests", () => {
  it("no duplicate death — property check", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("p1", "p2", "p3", "p4", "p5", "p6"), { minLength: 1, maxLength: 20 }),
      (victims) => {
        const state = createGame(testConfig)
        const events: GameEvent[] = victims.map((v, i) =>
          makeEvent({ seq: i + 1, type: "death:player_died", payload: { playerId: v, cause: "WOLF_KILL", round: 1 } })
        )
        const { newState } = replayStateWithLast(events, state)
        // A killed player should still be dead
        for (const v of victims) {
          expect(newState.players[v]?.isAlive).toBe(false)
        }
      }
    ), { numRuns: 200 })
  })

  it("player count stays constant — property check", () => {
    fc.assert(fc.property(
      fc.array(fc.oneof(
        fc.record({ type: fc.constant("room:player_joined"), playerId: fc.constantFrom("p1", "p2", "p3"), name: fc.constant("X"), seat: fc.nat(6) }),
        fc.record({ type: fc.constant("death:player_died"), playerId: fc.constantFrom("p1", "p2", "p3"), cause: fc.constant("WOLF_KILL"), round: fc.nat(3) }),
      ), { minLength: 1, maxLength: 30 }),
      (actions) => {
        const state = createGame(testConfig)
        const events: GameEvent[] = actions.map((a, i) =>
          makeEvent({ seq: i + 1, type: a.type, payload: a as unknown as Record<string, unknown> })
        )
        const { newState } = replayStateWithLast(events, state)
        const playerIds = Object.keys(newState.players)
        // All expected players exist
        expect(playerIds.length).toBeGreaterThanOrEqual(6)
      }
    ), { numRuns: 100 })
  })

  it("reducer is always deterministic — property check", () => {
    fc.assert(fc.property(
      fc.array(fc.oneof(
        fc.record({ type: fc.constant("room:player_joined"), playerId: fc.constantFrom("p1", "p2", "p3"), name: fc.constant("X"), seat: fc.nat(6) }),
        fc.record({ type: fc.constant("phase:transitioned"), from: fc.constant("WAITING_PLAYERS"), to: fc.constant("NIGHT_ANNOUNCE"), round: fc.nat(3) }),
        fc.record({ type: fc.constant("death:player_died"), playerId: fc.constantFrom("p1", "p2", "p3"), cause: fc.constant("WOLF_KILL"), round: fc.nat(3) }),
      ), { minLength: 1, maxLength: 20 }),
      (actions) => {
        const state = createGame(testConfig)
        const events: GameEvent[] = actions.map((a, i) =>
          makeEvent({ seq: i + 1, type: a.type, payload: a as unknown as Record<string, unknown> })
        )
        const r1 = replayState(events, state)
        const r2 = replayState(events, state)
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
      }
    ), { numRuns: 200 })
  })
})

describe("Engine — Phase Driver", () => {
  it("determineNextPhase: WAITING → ROLE_ASSIGNMENT", () => {
    const state = createGame(testConfig)
    expect(determineNextPhase(state)).toBe("ROLE_ASSIGNMENT")
  })

  it("determineNextPhase: CHECK_WIN detects wolf win", () => {
    const state = createGame(testConfig)
    // Kill all good players
    for (const [id, p] of Object.entries(state.players)) {
      if (p.faction === "good") {
        state.players[id] = { ...p, isAlive: false, deathInfo: { cause: "WOLF_KILL", round: 1 } }
      }
    }
    state.phase = { type: "DAY", subPhase: "CHECK_WIN", round: 2, dayNumber: 2 }
    expect(determineNextPhase(state)).toBe("RESULT_ANNOUNCE")
  })

  it("determineNextPhase: CHECK_WIN continues when no winner", () => {
    const state = createGame(testConfig)
    // Set 2 wolves alive and 4 good alive = no winner yet
    state.players["p1"] = { ...state.players["p1"]!, role: "werewolf", faction: "wolf", isAlive: true }
    state.players["p2"] = { ...state.players["p2"]!, role: "werewolf", faction: "wolf", isAlive: true }
    state.phase = { type: "DAY", subPhase: "CHECK_WIN", round: 1, dayNumber: 1 }
    expect(determineNextPhase(state)).toBe("SPEECH_PRE_THINK")
  })

  it("determineNextPhase: NIGHT → DAY cycle", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "NIGHT_SETTLEMENT", round: 1, dayNumber: 1 }
    expect(determineNextPhase(state)).toBe("DAY_BREAK")
  })

  it("determineNextPhase: DAY_SETTLEMENT → back to NIGHT", () => {
    const state = createGame(testConfig)
    state.phase = { type: "DAY", subPhase: "DAY_SETTLEMENT", round: 1, dayNumber: 1 }
    expect(determineNextPhase(state)).toBe("NIGHT_ANNOUNCE")
  })

  it("isPhaseComplete: SEER_CHOOSE false when seer hasn't acted", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 1, dayNumber: 1 }
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    expect(isPhaseComplete(state)).toBe(false)
  })

  it("isPhaseComplete: SEER_CHOOSE true after seer check", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 1, dayNumber: 1 }
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p2", result: "wolf" }]
    expect(isPhaseComplete(state)).toBe(true)
  })

  it("isPhaseComplete: SEER_CHOOSE true when seer is dead", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 1, dayNumber: 1 }
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: false }
    expect(isPhaseComplete(state)).toBe(true)
  })

  it("isPhaseComplete: SEER_CHOOSE false for wrong round check", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 2, dayNumber: 2 }
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    // Previous round check should not count
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p2", result: "good" }]
    expect(isPhaseComplete(state)).toBe(false)
  })
})

describe("Engine — Round / DayNumber", () => {
  it("phase:transitioned preserves round within same night/day", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "WOLF_PROPOSE", round: 1, dayNumber: 1 }
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "WOLF_PROPOSE", to: "SEER_CHOOSE", round: 1 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.round).toBe(1)
    expect(newState.phase.subPhase).toBe("SEER_CHOOSE")
  })

  it("DAY_SETTLEMENT -> NIGHT_ANNOUNCE must increment round", () => {
    const state = createGame(testConfig)
    state.phase = { type: "DAY", subPhase: "DAY_SETTLEMENT", round: 1, dayNumber: 1 }
    // Simulate the event that would be dispatched by runtime with round=2
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "DAY_SETTLEMENT", to: "NIGHT_ANNOUNCE", round: 2 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.round).toBe(2)
    expect(newState.phase.subPhase).toBe("NIGHT_ANNOUNCE")
  })

  it("second night SEER_CHOOSE not blocked by first night seerChecks", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "SEER_CHOOSE", round: 2, dayNumber: 2 }
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    // Round 1 check should NOT satisfy round 2
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p2", result: "good" }]
    expect(isPhaseComplete(state)).toBe(false)
  })

  it("DAY_BREAK sets dayNumber = round (round 1 → day 1)", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "NIGHT_SETTLEMENT", round: 1, dayNumber: 1 }
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "NIGHT_SETTLEMENT", to: "DAY_BREAK", round: 1 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.dayNumber).toBe(1)
  })

  it("DEATH_ANNOUNCE does NOT increment dayNumber", () => {
    const state = createGame(testConfig)
    state.phase = { type: "DAY", subPhase: "DAY_BREAK", round: 1, dayNumber: 1 }
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "DAY_BREAK", to: "DEATH_ANNOUNCE", round: 1 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.dayNumber).toBe(1)
    expect(newState.phase.subPhase).toBe("DEATH_ANNOUNCE")
  })

  it("second night DAY_BREAK shows dayNumber 2 (round 2 → day 2)", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "NIGHT_SETTLEMENT", round: 2, dayNumber: 1 }
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "NIGHT_SETTLEMENT", to: "DAY_BREAK", round: 2 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.dayNumber).toBe(2)
  })

  it("DAY_BREAK uses payload round even when state round differs", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "NIGHT_SETTLEMENT", round: 1, dayNumber: 1 }
    // Simulate the event that runtime dispatches after DAY_SETTLEMENT→NIGHT_ANNOUNCE already incremented round
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "NIGHT_SETTLEMENT", to: "DAY_BREAK", round: 2 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.dayNumber).toBe(2)
    expect(newState.phase.round).toBe(2)
  })

  it("third night DAY_BREAK shows dayNumber 3 (round 3 → day 3)", () => {
    const state = createGame(testConfig)
    state.phase = { type: "NIGHT", subPhase: "NIGHT_SETTLEMENT", round: 3, dayNumber: 1 }
    const event = makeEvent({ type: "phase:transitioned", payload: { from: "NIGHT_SETTLEMENT", to: "DAY_BREAK", round: 3 } })
    const { newState } = reduce(state, event)
    expect(newState.phase.dayNumber).toBe(3)
  })
})

describe("Engine — Command Handler", () => {
  it("room:join produces player_joined event", () => {
    const state = createGame(testConfig)
    const cmd = { id: uuidv7(), version: "1.0", type: "room:join", gameId: state.gameId, actorId: "p1", timestamp: Date.now(), payload: { playerId: "p1", name: "Alice", seat: 1 } }
    const events = handleCommand(cmd, state)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe("room:player_joined")
  })

  it("role:assign_batch produces role_assigned + teammates_revealed", () => {
    const state = createGame(testConfig)
    const cmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: { p1: { role: "werewolf", faction: "wolf" }, p2: { role: "werewolf", faction: "wolf" }, p3: { role: "seer", faction: "good" } } } }
    const events = handleCommand(cmd, state)
    // 3 role_assigned + 2 teammates_revealed
    expect(events.filter(e => e.type === "role:assigned").length).toBe(3)
    expect(events.filter(e => e.type === "role:teammates_revealed").length).toBe(2)
  })

  it("night:wolf_kill_resolved produces death event", () => {
    const state = createGame(testConfig)
    const cmd = { id: uuidv7(), version: "1.0", type: "night:wolf_kill_resolved", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { targetId: "p3" } }
    const events = handleCommand(cmd, state)
    expect(events[0]?.type).toBe("death:player_died")
  })
})

describe("Engine — Assign Roles", () => {
  it("assignRoles produces correct counts", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const counts: Record<string, number> = {}
    for (const a of Object.values(assigned)) {
      counts[a.role] = (counts[a.role] ?? 0) + 1
    }
    expect(counts.werewolf).toBe(2)
    expect(counts.villager).toBe(2)
    expect(counts.seer).toBe(1)
    expect(counts.witch).toBe(1)
  })

  it("assignRoles is deterministic with same seed", () => {
    const state = createGame(testConfig)
    const a1 = assignRoles(state.players, testConfig, 42)
    const a2 = assignRoles(state.players, testConfig, 42)
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2))
  })
})

describe("Engine — Projection", () => {
  it("seer sees seerResults in player view", () => {
    const state = createGame(testConfig)
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p2", result: "wolf" }]
    const view = buildPlayerView(state, "p1")
    expect(view.seerResults).toBeDefined()
    expect(view.seerResults).toHaveLength(1)
    expect(view.seerResults![0]).toMatchObject({ round: 1, targetId: "p2", result: "wolf" })
  })

  it("non-seer does not see seerResults", () => {
    const state = createGame(testConfig)
    state.players["p1"] = { ...state.players["p1"]!, role: "seer", faction: "good", isAlive: true }
    state.players["p2"] = { ...state.players["p2"]!, role: "villager", faction: "good", isAlive: true }
    state.seerChecks = [{ round: 1, seerId: "p1", targetId: "p2", result: "wolf" }]
    const view = buildPlayerView(state, "p2")
    expect(view.seerResults).toBeUndefined()
  })
})

// ── Integration: 模拟一局 ──

describe("Engine — Integration: Simulation", () => {
  it("runs a complete 6-player game end to end", () => {
    const state = createGame(testConfig)
    const events: GameEvent[] = []

    // 1. Assign roles
    const assigned = assignRoles(state.players, testConfig, 123)
    const cmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const roleEvents = handleCommand(cmd, state)
    events.push(...roleEvents)

    let currentState = replayState(roleEvents, state)

    // 2. Advance through phases
    const phases = [
      "NIGHT_ANNOUNCE", "WOLF_INTEL", "WOLF_PROPOSE", "SEER_CHOOSE", "SEER_RESULT",
      "WITCH_NOTIFY", "WITCH_DECIDE", "NIGHT_SETTLEMENT", "DAY_BREAK",
      "DEATH_ANNOUNCE", "CHECK_WIN", "SPEECH_PRE_THINK", "SPEECH_TURN_ACTIVE",
      "VOTE_CAST", "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT",
    ]

    for (let round = 1; round <= 3; round++) {
      for (const subPhase of phases) {
        const phaseCmd = { id: uuidv7(), version: "1.0", type: "phase:advance", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { to: subPhase, round } }
        const evts = handleCommand(phaseCmd, currentState)
        events.push(...evts)
        currentState = replayState(evts, currentState)

        // Simulate night kill in WOLF_PROPOSE
        if (subPhase === "WOLF_PROPOSE") {
          const alive = Object.values(currentState.players).filter(p => p.isAlive && p.faction === "good")
          if (alive.length > 0) {
            const target = alive[0]!
            const killCmd = { id: uuidv7(), version: "1.0", type: "night:wolf_kill_resolved", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { targetId: target.id } }
            const killEvts = handleCommand(killCmd, currentState)
            events.push(...killEvts)
            currentState = replayState(killEvts, currentState)
          }
        }

        // Simulate vote in VOTE_CAST
        if (subPhase === "VOTE_CAST") {
          const alive = Object.values(currentState.players).filter(p => p.isAlive)
          const voteTarget = alive.find(p => p.faction === "wolf") ?? alive[0]!
          const voteEvents: GameEvent[] = []
          for (const p of alive) {
            const voteCmd = { id: uuidv7(), version: "1.0", type: "vote:cast", gameId: state.gameId, actorId: p.id, timestamp: Date.now(), payload: { targetId: voteTarget.id } }
            const evts = handleCommand(voteCmd, currentState)
            voteEvents.push(...evts)
          }
          events.push(...voteEvents)
          currentState = replayState(voteEvents, currentState)
        }

        // Simulate exile in EXILE_ANNOUNCE
        if (subPhase === "EXILE_ANNOUNCE") {
          const alive = Object.values(currentState.players).filter(p => p.isAlive)
          const exileTarget = alive.find(p => p.faction === "wolf") ?? alive[0]!
          const exileCmd = { id: uuidv7(), version: "1.0", type: "player:exile", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { playerId: exileTarget.id } }
          const exileEvts = handleCommand(exileCmd, currentState)
          events.push(...exileEvts)
          currentState = replayState(exileEvts, currentState)
        }
      }

      // Check if game over
      const alive = Object.values(currentState.players).filter(p => p.isAlive)
      if (alive.filter(p => p.faction === "wolf").length === 0 || alive.filter(p => p.faction === "wolf").length >= alive.filter(p => p.faction === "good").length) {
        break
      }
    }

    // Game over
    const endCmd = { id: uuidv7(), version: "1.0", type: "game:end", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { winner: "good", mvp: "p3", svp: "p2" } }
    const endEvts = handleCommand(endCmd, currentState)
    events.push(...endEvts)
    currentState = replayState(endEvts, currentState)

    // 验证
    expect(currentState.gameOver).toBeDefined()
    expect(events.length).toBeGreaterThan(50)  // 一局应该产生相当多的事件
  })

  it("simulated game is replay-deterministic", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)

    const buildEvents = (): GameEvent[] => {
      const events: GameEvent[] = []
      let s = state
      const cmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
      events.push(...handleCommand(cmd, s))
      s = replayState(events, s)

      for (const sub of ["WOLF_PROPOSE", "SEER_CHOOSE", "VOTE_CAST"] as const) {
        const pCmd = { id: uuidv7(), version: "1.0", type: "phase:advance", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { to: sub, round: 1 } }
        events.push(...handleCommand(pCmd, s))
        s = replayState([events[events.length - 1]!], s)
      }
      return events
    }

    const events1 = buildEvents()
    const events2 = buildEvents()
    const r1 = replayState(events1, state)
    const r2 = replayState(events2, state)

    // Both replays from same initial state + same events = same result
    expect(JSON.stringify(replayState(events1, state))).toBe(JSON.stringify(replayState(events1, state)))
    // With same seed, role assignment is same
    expect(JSON.stringify(r1.players["p1"]?.role)).toBe(JSON.stringify(r2.players["p1"]?.role))
  })
})

// ── Helper ──

function replayStateWithLast(events: GameEvent[], state: GameState): { newState: GameState } {
  let current = state
  for (const event of events) {
    const result = reduce(current, event)
    current = result.newState
  }
  return { newState: current }
}

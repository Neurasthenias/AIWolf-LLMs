import { describe, it, expect } from "vitest"
import { GameRuntime } from "./runtime"
import { createGame, handleCommand, assignRoles, replayState } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const testConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" as const },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

describe("Server — GameRuntime", () => {
  it("creates runtime and dispatches command", async () => {
    const rt = new GameRuntime("test-1")
    const events: unknown[] = []
    rt.onEvent(e => events.push(e))

    const cmd = {
      id: uuidv7(), version: "1.0", type: "room:join",
      gameId: "test-1", actorId: "p1", timestamp: Date.now(),
      payload: { playerId: "p1", name: "Alice", seat: 1 },
    }

    await rt.dispatch(cmd)
    expect(events.length).toBeGreaterThan(0)
    expect((events[0] as Record<string, unknown>).type).toBe("room:player_joined")
  })

  it("dispatches role assignment and phase advance", async () => {
    const rt = new GameRuntime("test-2")
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)

    const roleCmd = {
      id: uuidv7(), version: "1.0", type: "role:assign_batch",
      gameId: "test-2", actorId: "system", timestamp: Date.now(),
      payload: { assignments: assigned },
    }

    await rt.dispatch(roleCmd)
    const s = rt.getState()
    expect(s.players["p1"]?.role).toBeDefined()
    expect(s.players["p1"]?.faction).toBeDefined()
  })

  it("command queue processes serially", async () => {
    const rt = new GameRuntime("test-3")
    const events: string[] = []
    rt.onEvent(e => events.push(e.type))

    // Fire many commands
    const promises: Promise<void>[] = []
    for (let i = 0; i < 20; i++) {
      const cmd = {
        id: uuidv7(), version: "1.0", type: "room:join",
        gameId: "test-3", actorId: `p${(i % 6) + 1}`, timestamp: Date.now(),
        payload: { playerId: `p${(i % 6) + 1}`, name: `P${i}`, seat: (i % 6) + 1 },
      }
      promises.push(rt.dispatch(cmd))
    }
    await Promise.all(promises)

    expect(events.length).toBeGreaterThan(0)
    // Event types should be in order (no race)
    expect(events.every(e => e === "room:player_joined")).toBe(true)
  })

  it("metrics reflect runtime state", async () => {
    const rt = new GameRuntime("test-4")
    const m = rt.getMetrics()
    expect(m.gameId).toBe("test-4")
    expect(m.queueLength).toBe(0)
    expect(m.phase).toBeDefined()
  })

  it("full game loop through runtime", async () => {
    const rt = new GameRuntime("test-5")
    const allEvents: unknown[] = []
    rt.onEvent(e => allEvents.push(e))

    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 123)

    // 1. Assign roles + start game
    await rt.dispatch({
      id: uuidv7(), version: "1.0", type: "role:assign_batch",
      gameId: "test-5", actorId: "system", timestamp: Date.now(),
      payload: { assignments: assigned },
    })

    // 2. Auto-advance through night → day
    // WOLF_PROPOSE needs a wolf action
    await rt.dispatch({
      id: uuidv7(), version: "1.0", type: "phase:advance",
      gameId: "test-5", actorId: "system", timestamp: Date.now(),
      payload: { to: "WOLF_PROPOSE", round: 1 },
    })

    // Wolf kills
    const s1 = rt.getState()
    const target = Object.values(s1.players).find(p => p.isAlive && p.faction === "good")
    await rt.dispatch({
      id: uuidv7(), version: "1.0", type: "night:wolf_kill_resolved",
      gameId: "test-5", actorId: "system", timestamp: Date.now(),
      payload: { targetId: target?.id ?? "p3" },
    })

    // Advance to voting
    await rt.dispatch({
      id: uuidv7(), version: "1.0", type: "phase:advance",
      gameId: "test-5", actorId: "system", timestamp: Date.now(),
      payload: { to: "VOTE_CAST", round: 1 },
    })

    // Vote
    const s2 = rt.getState()
    for (const p of Object.values(s2.players).filter(p => p.isAlive)) {
      await rt.dispatch({
        id: uuidv7(), version: "1.0", type: "vote:cast",
        gameId: "test-5", actorId: p.id, timestamp: Date.now(),
        payload: { targetId: "p3" },
      })
    }

    const finalState = rt.getState()
    expect(allEvents.length).toBeGreaterThan(5)
  }, 10000)
})

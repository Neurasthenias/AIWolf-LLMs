import { describe, it, expect } from "vitest"
import { createGame, reduce, replayState, handleCommand, assignRoles, FileEventStore, runSimulation } from "./index"
import type { GameState, GameEvent, GameConfig } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"
import fc from "fast-check"

const testConfig: GameConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

describe("Sprint 1.5 — Stability", () => {
  describe("FileEventStore", () => {
    it("append and load preserves all events", async () => {
      const store = new FileEventStore(".data/test")
      const events: GameEvent[] = [
        { id: "e1", version: "1.0", schemaVersion: "1.0", type: "room:player_joined", gameId: "g1", seq: 1, timestamp: 1, visibility: "public", payload: { playerId: "p1", name: "A", seat: 1 } },
        { id: "e2", version: "1.0", schemaVersion: "1.0", type: "phase:transitioned", gameId: "g1", seq: 2, timestamp: 2, visibility: "public", payload: { from: "WAITING_PLAYERS", to: "NIGHT_ANNOUNCE", round: 1 } },
      ]
      await store.append("g1", events)
      const loaded = await store.load("g1")
      expect(loaded).toHaveLength(2)
      expect(loaded[0]?.id).toBe("e1")
      expect(loaded[1]?.type).toBe("phase:transitioned")
      await store.delete("g1")
    })

    it("loadFrom returns events after given id", async () => {
      const store = new FileEventStore(".data/test")
      const e1 = { id: "e1", version: "1.0", schemaVersion: "1.0", type: "room:player_joined", gameId: "g2", seq: 1, timestamp: 1, visibility: "public" as const, payload: { playerId: "p1", name: "A", seat: 1 } }
      const e2 = { id: "e2", version: "1.0", schemaVersion: "1.0", type: "phase:transitioned", gameId: "g2", seq: 2, timestamp: 2, visibility: "public" as const, payload: { from: "WAITING", to: "NIGHT_ANNOUNCE", round: 1 } }
      await store.append("g2", [e1, e2])
      const after = await store.loadFrom("g2", "e1")
      expect(after).toHaveLength(1)
      expect(after[0]?.id).toBe("e2")
      await store.delete("g2")
    })

    it("snapshot save and load works", async () => {
      const store = new FileEventStore(".data/test")
      const snap = { gameId: "g3", lastEventId: "e5", state: { phase: "DAY" } }
      await store.saveSnapshot(snap)
      const loaded = await store.loadLatestSnapshot("g3")
      expect(loaded).toBeDefined()
      expect(loaded!.lastEventId).toBe("e5")
      await store.delete("g3")
    })
  })

  describe("Replay correctness with persistence", () => {
    it("replay from file equals in-memory replay", async () => {
      const store = new FileEventStore(".data/test")
      const state = createGame(testConfig)
      const initialState = JSON.parse(JSON.stringify(state)) as GameState
      const events: GameEvent[] = [
        { id: "e1", version: "1.0", schemaVersion: "1.0", type: "room:player_joined", gameId: state.gameId, seq: 1, timestamp: 1, visibility: "public", payload: { playerId: "p1", name: "A", seat: 1 } },
        { id: "e2", version: "1.0", schemaVersion: "1.0", type: "role:assigned", gameId: state.gameId, seq: 2, timestamp: 2, visibility: "private", visibleTo: ["p1"], payload: { playerId: "p1", role: "seer", faction: "good" } },
        { id: "e3", version: "1.0", schemaVersion: "1.0", type: "phase:transitioned", gameId: state.gameId, seq: 3, timestamp: 3, visibility: "public", payload: { from: "WAITING_PLAYERS", to: "NIGHT_ANNOUNCE", round: 1 } },
        { id: "e4", version: "1.0", schemaVersion: "1.0", type: "death:player_died", gameId: state.gameId, seq: 4, timestamp: 4, visibility: "public", payload: { playerId: "p2", cause: "WOLF_KILL", round: 1 } },
      ]

      await store.append(state.gameId, events)
      const loaded = await store.load(state.gameId)

      const memState = replayState(events, JSON.parse(JSON.stringify(initialState)) as GameState)
      const fileState = replayState(loaded, JSON.parse(JSON.stringify(initialState)) as GameState)
      expect(JSON.stringify(memState)).toBe(JSON.stringify(fileState))
      await store.delete(state.gameId)
    })
  })

  describe("Fuzz — invalid commands never crash", () => {
    it("random command sequence does not throw", () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          fc.record({ type: fc.constant("vote:cast"), playerId: fc.constantFrom("p1", "p2", "p3"), targetId: fc.constantFrom("p1", "p2", "p3", "p4", "p5", null) }),
          fc.record({ type: fc.constant("speech:submit"), playerId: fc.constantFrom("p1", "p2", "p3"), content: fc.constant("test") }),
          fc.record({ type: fc.constant("room:join"), playerId: fc.constant("p9"), name: fc.constant("X"), seat: fc.nat(10) }),
          fc.record({ type: fc.constant("phase:advance"), to: fc.constantFrom("NIGHT_ANNOUNCE", "DAY_BREAK", "VOTE_CAST", "WOLF_PROPOSE"), round: fc.nat(5) }),
        ), { minLength: 1, maxLength: 50 }),
        (actions) => {
          const state = createGame(testConfig)
          let current = state
          for (const a of actions) {
            const cmd = { id: uuidv7(), version: "1.0", type: a.type, gameId: state.gameId, actorId: a.playerId ?? "system", timestamp: Date.now(), payload: a as unknown as Record<string, unknown> }
            const events = handleCommand(cmd, current)
            for (const e of events) {
              const result = reduce(current, e)
              current = result.newState
            }
          }
          // Should reach here without throwing
          expect(current.gameId).toBe(state.gameId)
        }
      ), { numRuns: 500 })
    })
  })

  describe("Simulation", () => {
    it("100-game simulation — 0 deadlock, 0 replay divergence", async () => {
      const results = await runSimulation(100, 42)

      const deadlocked = results.filter(r => r.deadlock)
      const diverged = results.filter(r => !r.replayMatch)

      console.log(`Sim results: total=${results.length} deadlock=${deadlocked.length} replay_diverge=${diverged.length}`)
      console.log(`Winner distribution: wolf=${results.filter(r => r.winner === "wolf").length} good=${results.filter(r => r.winner === "good").length}`)
      console.log(`Avg events/game: ${Math.round(results.reduce((s, r) => s + r.totalEvents, 0) / results.length)}`)
      console.log(`Avg rounds/game: ${Math.round(results.reduce((s, r) => s + r.rounds, 0) / results.length)}`)
      console.log(`Invariant violations: ${results.reduce((s, r) => s + r.invariantViolations.length, 0)}`)

      expect(deadlocked.length).toBe(0)
      expect(diverged.length).toBe(0)
    }, 30000)
  })
})

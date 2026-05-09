import { describe, it, expect } from "vitest"
import { createGame } from "./index"
import { reduce } from "./reducer"
import { handleCommand } from "./command-handler"
import type { GameState, GameConfig } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

const testConfig: GameConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6,
  maxPlayers: 6,
  rules: {
    hasSheriff: false,
    witchSelfSave: false,
    lastWords: "first_night_and_first_vote",
  },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

function makeEvent(overrides: Partial<import("@aiwolf/shared/types").GameEvent> & { type: string; payload: Record<string, unknown> }): import("@aiwolf/shared/types").GameEvent {
  return {
    id: uuidv7(),
    version: "1.0",
    schemaVersion: "1.0",
    gameId: "test-game",
    seq: 1,
    timestamp: Date.now(),
    visibility: "public",
    ...overrides,
  }
}

describe("Engine", () => {
  it("createGame returns valid state", () => {
    const state = createGame(testConfig)
    expect(state.gameId).toBeDefined()
    expect(state.phase.type).toBe("WAITING")
    expect(Object.keys(state.players).length).toBe(6)
    expect(state.witchPotions.hasSave).toBe(true)
    expect(state.witchPotions.hasPoison).toBe(true)
  })

  it("assignRoles assigns correct counts", async () => {
    const state = createGame(testConfig)
    const mod = await import("./index")
    const assigned = mod.assignRoles(state.players, testConfig)

    const counts: Record<string, number> = {}
    for (const a of Object.values(assigned) as { role: string; faction: string }[]) {
      counts[a.role] = (counts[a.role] || 0) + 1
    }

    expect(counts.werewolf).toBe(2)
    expect(counts.villager).toBe(2)
    expect(counts.seer).toBe(1)
    expect(counts.witch).toBe(1)
  })

  it("reducer: room:player_joined updates state", () => {
    const state = createGame(testConfig)
    const event = makeEvent({
      type: "room:player_joined",
      payload: { playerId: "p1", name: "Alice", seat: 1 },
    })

    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.name).toBe("Alice")
  })

  it("reducer: role:assigned sets role", () => {
    const state = createGame(testConfig)
    const event = makeEvent({
      type: "role:assigned",
      payload: { playerId: "p1", role: "werewolf", faction: "wolf" },
      visibility: "private",
      visibleTo: ["p1"],
    })

    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.role).toBe("werewolf")
    expect(newState.players["p1"]?.faction).toBe("wolf")
  })

  it("reducer: death:player_died marks player dead", () => {
    const state = createGame(testConfig)
    const event = makeEvent({
      type: "death:player_died",
      payload: { playerId: "p1", cause: "WOLF_KILL", round: 1 },
    })

    const { newState } = reduce(state, event)
    expect(newState.players["p1"]?.isAlive).toBe(false)
    expect(newState.players["p1"]?.deathInfo?.cause).toBe("WOLF_KILL")
  })

  it("reducer: unknown event does not throw", () => {
    const state = createGame(testConfig)
    const event = makeEvent({
      type: "some:unknown_event",
      payload: {},
    })

    const { newState } = reduce(state, event)
    expect(newState.lastEventSeq).toBe(event.seq)
  })

  it("command: room:join generates correct event", () => {
    const state = createGame(testConfig)
    const command = {
      id: uuidv7(),
      version: "1.0",
      type: "room:join",
      gameId: state.gameId,
      actorId: "p1",
      timestamp: Date.now(),
      payload: { playerId: "p1", name: "Alice", seat: 1 },
    }

    const events = handleCommand(command, state)
    expect(events.length).toBe(1)
    expect(events[0]?.type).toBe("room:player_joined")
  })
})

describe("Reducer invariants", () => {
  it("event seq is always updated", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "phase:transitioned", seq: 42, payload: { from: "WAITING", to: "NIGHT_ANNOUNCE", round: 1 } })

    const { newState } = reduce(state, event)
    expect(newState.lastEventSeq).toBe(42)
  })

  it("reducer is deterministic — same input produces same output", () => {
    const state = createGame(testConfig)
    const event = makeEvent({ type: "death:player_died", payload: { playerId: "p1", cause: "WOLF_KILL", round: 1 } })

    const r1 = reduce(state, event)
    const r2 = reduce(state, event)

    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })
})

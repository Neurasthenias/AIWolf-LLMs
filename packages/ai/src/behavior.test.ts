import { describe, it, expect } from "vitest"
import { assignPersonality, personalityToPrompt, createMemory, updateMemory, memoryToPrompt } from "./index"
import type { GameEvent } from "@aiwolf/shared/types"

describe("AI — Personality", () => {
  it("assigns suitable personality for werewolf", () => {
    const p = assignPersonality("werewolf", "wolf", 42)
    expect(p.deception).toBeGreaterThanOrEqual(4)
    expect(p.name).toBeDefined()
  })

  it("assigns suitable personality for seer", () => {
    const p = assignPersonality("seer", "good", 7)
    expect(p.rationality).toBeGreaterThanOrEqual(6)
  })

  it("personalityToPrompt produces valid text", () => {
    const p = assignPersonality("villager", "good", 0)
    const text = personalityToPrompt(p)
    expect(text).toContain("性格")
    expect(text).toContain(p.name)
  })

  it("same seed produces same personality", () => {
    const p1 = assignPersonality("werewolf", "wolf", 42)
    const p2 = assignPersonality("werewolf", "wolf", 42)
    expect(p1.name).toBe(p2.name)
  })
})

describe("AI — Memory", () => {
  it("creates empty memory", () => {
    const mem = createMemory()
    expect(mem.beliefs).toEqual({})
    expect(mem.timeline).toEqual([])
  })

  it("updates memory from death event", () => {
    const mem = createMemory()
    const event: GameEvent = {
      id: "e1", version: "1.0", schemaVersion: "1.0", type: "death:player_died",
      gameId: "g1", seq: 1, timestamp: Date.now(), visibility: "public",
      payload: { playerId: "p2", cause: "WOLF_KILL", round: 1 },
    }
    const updated = updateMemory(mem, event, "p1")
    expect(updated.timeline).toHaveLength(1)
    expect(updated.timeline[0]?.description).toContain("p2")
  })

  it("updates memory from seer result", () => {
    const mem = createMemory()
    const event: GameEvent = {
      id: "e1", version: "1.0", schemaVersion: "1.0", type: "role:seer_result",
      gameId: "g1", seq: 1, timestamp: Date.now(), visibility: "private", visibleTo: ["p1"],
      payload: { playerId: "p1", targetId: "p3", result: "wolf" },
    }
    const updated = updateMemory(mem, event, "p1")
    expect(updated.beliefs["p3"]?.suspectedRole).toBe("werewolf")
    expect(updated.beliefs["p3"]?.confidence).toBe(10)
  })

  it("updates memory from teammates revealed", () => {
    const mem = createMemory()
    const event: GameEvent = {
      id: "e1", version: "1.0", schemaVersion: "1.0", type: "role:teammates_revealed",
      gameId: "g1", seq: 1, timestamp: Date.now(), visibility: "private", visibleTo: ["p1"],
      payload: { playerId: "p1", teammates: ["p3", "p5"] },
    }
    const updated = updateMemory(mem, event, "p1")
    expect(updated.beliefs["p3"]?.trustLevel).toBe(10)
    expect(updated.beliefs["p5"]?.trustLevel).toBe(10)
  })

  it("memoryToPrompt produces valid text", () => {
    const mem = createMemory()
    mem.timeline.push({ type: "death", description: "p2死亡", round: 1, timestamp: Date.now() })
    mem.beliefs["p3"] = { suspectedRole: "werewolf", confidence: 8, trustLevel: -5, notes: ["可疑"], lastUpdated: Date.now() }
    const text = memoryToPrompt(mem, "p1")
    expect(text).toContain("p2死亡")
    expect(text).toContain("p3")
  })

  it("memory excludes self from beliefs", () => {
    const mem = createMemory()
    mem.beliefs["p1"] = { suspectedRole: "villager", confidence: 10, trustLevel: 10, notes: [], lastUpdated: Date.now() }
    const text = memoryToPrompt(mem, "p1")
    expect(text).not.toContain("p1")
  })
})

describe("AI — Context with personality + memory", () => {
  it("buildContext accepts personality and memory", async () => {
    const { buildContext } = await import("./context/builder")
    const { createGame, assignRoles, replayState, handleCommand } = await import("@aiwolf/engine")
    const { v7: uuidv7 } = await import("uuid")

    const testConfig = {
      roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 } as Record<string, number>,
      minPlayers: 6, maxPlayers: 6,
      rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" as const },
      timeouts: { speech: 180, vote: 15, night: 15 },
    }

    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const events = handleCommand({ id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }, state)
    const hydrated = replayState(events, state)
    hydrated.phase = { type: "DAY", subPhase: "SPEECH_TURN_ACTIVE", round: 1, dayNumber: 1 }

    const personality = assignPersonality("seer", "good", 42)
    const memory = createMemory()
    memory.timeline.push({ type: "role", description: "我是预言家", round: 0, timestamp: Date.now() })

    const ctx = buildContext(hydrated, "p1", "speech", personality, memory)
    expect(ctx.systemPrompt).toContain("性格")
    expect(ctx.userPrompt).toContain("记忆")
    expect(ctx.userPrompt).toContain("预言家")
  })
})

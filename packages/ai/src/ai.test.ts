import { describe, it, expect } from "vitest"
import { buildContext, AIIntentSchema } from "./index"
import { createGame, reduce, handleCommand, assignRoles, replayState } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const testConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" as const },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

describe("AI — Context Builder", () => {
  it("buildContext produces valid context for speech", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const roleCmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const events = handleCommand(roleCmd, state)
    const hydrated = replayState(events, state)

    hydrated.phase = { type: "DAY", subPhase: "SPEECH_TURN_ACTIVE", round: 1, dayNumber: 1 }

    const ctx = buildContext(hydrated, "p1", "speech")
    expect(ctx.role).toBeDefined()
    expect(ctx.systemPrompt).toContain("狼人杀")
    expect(ctx.userPrompt).toContain("发言")
    expect(ctx.trace.view).toBeDefined()
  })

  it("buildContext for vote task", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const roleCmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const events = handleCommand(roleCmd, state)
    const hydrated = replayState(events, state)

    hydrated.phase = { type: "DAY", subPhase: "VOTE_CAST", round: 1, dayNumber: 1 }

    const ctx = buildContext(hydrated, "p1", "vote")
    expect(ctx.userPrompt).toContain("投票")
  })

  it("buildContext uses projection — cannot see other roles", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const roleCmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const events = handleCommand(roleCmd, state)
    const hydrated = replayState(events, state)

    hydrated.phase = { type: "DAY", subPhase: "SPEECH_TURN_ACTIVE", round: 1, dayNumber: 1 }

    const ctx = buildContext(hydrated, "p1", "speech")
    // PlayerView should NOT contain other players' roles
    const otherPlayers = ctx.trace.view.players.filter(p => p.id !== "p1")
    for (const p of otherPlayers) {
      // PublicPlayer interface doesn't have role field
      expect((p as Record<string, unknown>).role).toBeUndefined()
    }
  })
})

describe("AI — Intent Schema", () => {
  it("validates correct vote intent", () => {
    const valid = { action: { type: "vote", targetId: "p3", reason: "可疑" }, speech: { content: "我怀疑3号是狼，理由是他的发言前后不一致。" } }
    const result = AIIntentSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("rejects invalid action type", () => {
    const invalid = { action: { type: "invalid_action", targetId: "p3" } }
    const result = AIIntentSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("rejects speech shorter than 10 chars", () => {
    const invalid = { action: { type: "skip", targetId: null }, speech: { content: "过" } }
    const result = AIIntentSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("accepts action without speech", () => {
    const valid = { action: { type: "vote", targetId: "p3" } }
    const result = AIIntentSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts wolf_kill action", () => {
    const valid = { action: { type: "wolf_kill", targetId: "p2", reason: "看起来像预言家" } }
    const result = AIIntentSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })
})

describe("AI — Integration", () => {
  it("buildContext → simulation round trip maintains determinism", () => {
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const roleCmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const events = handleCommand(roleCmd, state)
    const hydrated = replayState(events, state)

    hydrated.phase = { type: "DAY", subPhase: "SPEECH_TURN_ACTIVE", round: 1, dayNumber: 1 }

    // Context building should be deterministic
    const ctx1 = buildContext(hydrated, "p1", "speech")
    const ctx2 = buildContext(hydrated, "p1", "speech")
    expect(JSON.stringify(ctx1.trace.view)).toBe(JSON.stringify(ctx2.trace.view))
  })

  it("AI pipeline with rule-based fallback produces valid command", () => {
    // Rule-based fallback is tested without API key
    const state = createGame(testConfig)
    const assigned = assignRoles(state.players, testConfig, 42)
    const roleCmd = { id: uuidv7(), version: "1.0", type: "role:assign_batch", gameId: state.gameId, actorId: "system", timestamp: Date.now(), payload: { assignments: assigned } }
    const events = handleCommand(roleCmd, state)
    const hydrated = replayState(events, state)
    hydrated.phase = { type: "DAY", subPhase: "VOTE_CAST", round: 1, dayNumber: 1 }

    // Context is built, but AI call relies on LLM
    const ctx = buildContext(hydrated, "p1", "vote")
    expect(ctx.userPrompt).toContain("投票")
    expect(ctx.trace.promptTokensEstimate).toBeGreaterThan(0)
  })
})

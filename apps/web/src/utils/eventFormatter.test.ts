import { describe, it, expect } from "vitest"
import { formatGameEvent } from "./eventFormatter"

const players = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
  { id: "p3", name: "Charlie" },
]

function makeEvent(type: string, payload: Record<string, unknown>, visibleTo?: string[]) {
  return { seq: 1, type, timestamp: Date.now(), payload, ...(visibleTo ? { visibleTo } : {}) }
}

describe("eventFormatter", () => {
  it("role:assigned shows Chinese role name", () => {
    const e = makeEvent("role:assigned", { playerId: "p1", role: "seer", faction: "good" }, ["p1"])
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.title).toBe("身份已发放")
    expect(r.detail).toBe("你获得身份：预言家")
    expect(r.tone).toBe("private")
  })

  it("phase:transitioned shows Chinese phase names", () => {
    const e = makeEvent("phase:transitioned", { from: "WOLF_PROPOSE", to: "SEER_CHOOSE" })
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.title).toBe("阶段切换")
    expect(r.detail).toBe("狼人行动 → 预言家查验")
    expect(r.tone).toBe("system")
  })

  it("role:seer_result shows target and faction", () => {
    const e = makeEvent("role:seer_result", { playerId: "p1", targetId: "p2", result: "wolf" }, ["p1"])
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.title).toBe("预言家查验结果")
    expect(r.detail).toBe("查验 Bob：狼人阵营")
    expect(r.tone).toBe("danger")
  })

  it("role:seer_result with good result uses good tone", () => {
    const e = makeEvent("role:seer_result", { playerId: "p1", targetId: "p2", result: "good" }, ["p1"])
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.detail).toBe("查验 Bob：好人阵营")
    expect(r.tone).toBe("good")
  })

  it("death:player_died shows Chinese cause", () => {
    const e = makeEvent("death:player_died", { playerId: "p3", cause: "VOTE_EXILE" })
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.title).toBe("玩家死亡")
    expect(r.detail).toBe("Charlie（投票放逐）")
    expect(r.tone).toBe("danger")
  })

  it("unknown event falls back to game event label", () => {
    const e = makeEvent("unknown:event", {})
    const r = formatGameEvent(e as any, players, "p1")
    expect(r.title).toContain("游戏事件")
    expect(r.tone).toBe("info")
  })
})

import type { GameState, GameConfig, RoleType, FactionType } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

// ── Public API ──

export function createGame(config: GameConfig): GameState {
  const gameId = uuidv7()
  const players: GameState["players"] = {}

  // 分配玩家占位
  for (let seat = 1; seat <= config.maxPlayers; seat++) {
    const id = `p${seat}`
    players[id] = {
      id,
      name: `Player ${seat}`,
      seat,
      role: "villager",     // 待随机分配
      faction: "good",
      isAlive: true,
      isAI: false,
      isHost: seat === 1,
    }
  }

  return {
    gameId,
    version: "1.0",
    phase: { type: "WAITING", subPhase: "WAITING_PLAYERS", round: 1, dayNumber: 1 },
    players,
    witchPotions: { hasSave: true, hasPoison: true },
    sheriffId: null,
    sheriffElectionDone: false,
    tieBreakCount: 0,
    startedAt: Date.now(),
    lastEventSeq: 0,
  }
}

// ── Reducer (Phase 1 — 最小可用) ──

export { reduce } from "./reducer"
export { handleCommand } from "./command-handler"
export { determineNextPhase } from "./phase-driver"

// ── Projection ──

export { buildPlayerView } from "./projection"

// ── 内部导出（测试用） ──

export function assignRoles(players: GameState["players"], config: GameConfig): Record<string, { role: RoleType; faction: FactionType }> {
  const roles: { role: RoleType; faction: FactionType }[] = []
  for (const [role, count] of Object.entries(config.roles)) {
    const faction: FactionType = role === "werewolf" ? "wolf" : "good"
    for (let i = 0; i < count; i++) roles.push({ role: role as RoleType, faction })
  }

  // Fisher-Yates shuffle with deterministic seed (for replay)
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j]!, roles[i]!]
  }

  const assigned: Record<string, { role: RoleType; faction: FactionType }> = {}
  const ids = Object.keys(players)
  ids.forEach((id, i) => { assigned[id] = roles[i]! })
  return assigned
}

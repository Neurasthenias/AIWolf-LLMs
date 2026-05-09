import type { RoleType, FactionType } from "@aiwolf/shared/types"
import type { GameState, GameConfig } from "@aiwolf/shared/types"

export function assignRoles(players: GameState["players"], config: GameConfig, seed?: number): Record<string, { role: RoleType; faction: FactionType }> {
  const roles: { role: RoleType; faction: FactionType }[] = []
  for (const [role, count] of Object.entries(config.roles) as [RoleType, number][]) {
    const faction: FactionType = role === "werewolf" ? "wolf" : "good"
    for (let i = 0; i < count; i++) roles.push({ role, faction })
  }

  // Fisher-Yates shuffle
  const random = seed != null ? seededRandom(seed) : Math.random
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j]!, roles[i]!]
  }

  const assigned: Record<string, { role: RoleType; faction: FactionType }> = {}
  const ids = Object.keys(players)
  ids.forEach((id, i) => { assigned[id] = roles[i]! })
  return assigned
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    return (s >>> 0) / 0xFFFFFFFF
  }
}

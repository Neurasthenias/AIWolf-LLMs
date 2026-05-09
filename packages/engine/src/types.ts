import type { PhaseType, SubPhaseType } from "@aiwolf/shared/types"

export interface PlayerView {
  scope: "public" | "player_private" | "spectator" | "judge" | "replay"
  playerId: string
  self: {
    id: string
    name: string
    seat: number
    role: string
    faction: string
    isAlive: boolean
  }
  players: PublicPlayer[]
  phase: {
    type: PhaseType
    subPhase: SubPhaseType
    round: number
    dayNumber: number
  }
  speeches: { playerId: string; content: string; timestamp: number }[]
}

export interface PublicPlayer {
  id: string
  name: string
  seat: number
  isAlive: boolean
  isAI: boolean
}

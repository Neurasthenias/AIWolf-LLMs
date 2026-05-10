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
    teammates?: string[]
  }
  players: PublicPlayer[]
  phase: {
    type: PhaseType
    subPhase: SubPhaseType
    round: number
    dayNumber: number
    currentSpeakerId?: string
  }
  speeches: { playerId: string; content: string; timestamp: number }[]
  voteResult?: { votes: Record<string, string | null>; exiledPlayerId?: string }
  deathAnnouncement?: { deaths: { playerId: string; cause: string }[]; isSafeNight: boolean }
  gameOver?: { winner: string; mvp: string; svp: string }
}

export interface PublicPlayer {
  id: string
  name: string
  seat: number
  isAlive: boolean
  isAI: boolean
}

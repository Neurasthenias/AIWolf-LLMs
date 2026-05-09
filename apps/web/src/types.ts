import type { PhaseType, SubPhaseType } from "@aiwolf/shared/types"

export interface PlayerView {
  scope: string
  playerId: string
  self: { id: string; name: string; seat: number; role: string; faction: string; isAlive: boolean; teammates?: string[] }
  players: { id: string; name: string; seat: number; isAlive: boolean; isAI: boolean }[]
  phase: { type: PhaseType; subPhase: SubPhaseType; round: number; dayNumber: number; currentSpeakerId?: string }
  speeches: { playerId: string; content: string; timestamp: number }[]
  voteResult?: { votes: Record<string, string | null>; exiledPlayerId?: string }
  deathAnnouncement?: { deaths: { playerId: string; cause: string }[]; isSafeNight: boolean }
  gameOver?: { winner: string; mvp: string; svp: string }
}

export interface GameEvent {
  seq: number; type: string; timestamp: number; payload: Record<string, unknown>
}

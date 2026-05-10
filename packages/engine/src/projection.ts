import type { GameState } from "@aiwolf/shared/types"
import type { PlayerView, PublicPlayer } from "./types"

export function buildPlayerView(state: GameState, playerId: string): PlayerView {
  const player = state.players[playerId]
  if (!player) throw new Error(`Player ${playerId} not found`)

  const publicPlayers: PublicPlayer[] = Object.values(state.players).map(p => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    isAlive: p.isAlive,
    isAI: p.isAI,
  }))

  return {
    scope: "player_private",
    playerId,
    self: {
      id: player.id,
      name: player.name,
      seat: player.seat,
      role: player.role,
      faction: player.faction,
      isAlive: player.isAlive,
      teammates: player.teammates,
    },
    players: publicPlayers,
    phase: {
      type: state.phase.type,
      subPhase: state.phase.subPhase,
      round: state.phase.round,
      dayNumber: state.phase.dayNumber,
      currentSpeakerId: state.currentSpeakerId,
    },
    speeches: state.speeches ?? [],
    voteResult: state.currentVoteTally,
    deathAnnouncement: state.latestDeathAnnouncement,
    gameOver: state.gameOver,
  }
}

export type { PlayerView }

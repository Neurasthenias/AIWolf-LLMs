import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"

export function reduceVote(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "vote:cast": {
      const { playerId, targetId } = event.payload as { playerId: string; targetId: string | null }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId]!,
              voteTargetId: targetId,
            },
          },
        },
        effects,
      }
    }
    case "vote:revealed": {
      const votes = event.payload.votes as { playerId: string; targetId: string | null }[]
      const updated = { ...state.players }
      for (const vote of votes) {
        if (updated[vote.playerId]) {
          updated[vote.playerId] = { ...updated[vote.playerId]!, voteTargetId: vote.targetId }
        }
      }
      return { newState: { ...state, players: updated }, effects }
    }
    case "vote:all_cast": {
      return { newState: state, effects }
    }
    default:
      return { newState: state, effects }
  }
}

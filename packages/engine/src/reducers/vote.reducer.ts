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
      // Compute tally from all alive players
      const tally: Record<string, number> = {}
      const voteMap: Record<string, string | null> = {}
      for (const [id, p] of Object.entries(updated)) {
        if (p.isAlive && p.voteTargetId !== undefined) {
          voteMap[id] = p.voteTargetId
          if (p.voteTargetId) {
            tally[p.voteTargetId] = (tally[p.voteTargetId] ?? 0) + 1
          }
        }
      }
      // Find max vote-getter (deterministic tie-break: first sorted ID)
      const maxVotes = Math.max(0, ...Object.values(tally))
      const topIds = Object.entries(tally).filter(([, c]) => c === maxVotes).map(([id]) => id)
      const exiledPlayerId = maxVotes > 0 ? topIds.sort()[0] : undefined
      return {
        newState: {
          ...state,
          players: updated,
          currentVoteTally: { votes: voteMap, exiledPlayerId },
        },
        effects,
      }
    }
    case "vote:all_cast": {
      return { newState: state, effects }
    }
    default:
      return { newState: state, effects }
  }
}

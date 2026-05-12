import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"

export function reduceRole(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "role:assigned": {
      const { playerId, role, faction } = event.payload as { playerId: string; role: string; faction: string }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId]!,
              role: role as GameState["players"][string]["role"],
              faction: faction as GameState["players"][string]["faction"],
            },
          },
        },
        effects,
      }
    }
    case "role:teammates_revealed": {
      const { playerId, teammates } = event.payload as { playerId: string; teammates: string[] }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: { ...state.players[playerId]!, teammates },
          },
        },
        effects,
      }
    }
    case "role:seer_result": {
      const { playerId, targetId, result } = event.payload as { playerId: string; targetId: string; result: "wolf" | "good" }
      return {
        newState: {
          ...state,
          seerChecks: [
            ...(state.seerChecks ?? []),
            { round: state.phase.round, seerId: playerId, targetId, result },
          ],
        },
        effects,
      }
    }
    case "role:witch_notified": {
      return { newState: state, effects }
    }
    default:
      return { newState: state, effects }
  }
}

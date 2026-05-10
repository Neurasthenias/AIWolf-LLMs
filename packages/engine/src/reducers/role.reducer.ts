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
      // Result stored in events, projection surfaces it to seer
      return { newState: state, effects }
    }
    case "role:witch_notified": {
      return { newState: state, effects }
    }
    default:
      return { newState: state, effects }
  }
}

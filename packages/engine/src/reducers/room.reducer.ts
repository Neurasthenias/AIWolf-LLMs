import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"

export function reduceRoom(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "room:player_joined": {
      const { playerId, name, seat } = event.payload as { playerId: string; name: string; seat: number }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: { ...state.players[playerId]!, name, seat },
          },
        },
        effects,
      }
    }
    case "room:player_left": {
      const { playerId } = event.payload as { playerId: string }
      const players = { ...state.players }
      delete players[playerId]
      return { newState: { ...state, players }, effects }
    }
    case "room:locked": {
      return { newState: { ...state }, effects }
    }
    default:
      return { newState: state, effects }
  }
}

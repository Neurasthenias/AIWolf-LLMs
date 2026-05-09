import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"

export function reduceDeath(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "death:player_died": {
      const { playerId, cause, killerId, round } = event.payload as {
        playerId: string; cause: string; killerId?: string; round: number
      }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId]!,
              isAlive: false,
              deathInfo: {
                cause: cause as GameState["players"][string]["deathInfo"]["cause"],
                round,
                killedBy: killerId,
              },
            },
          },
        },
        effects,
      }
    }
    case "death:day_break_announcement": {
      const { deaths, isSafeNight } = event.payload as {
        deaths: { playerId: string; cause: string }[]; isSafeNight: boolean
      }
      return {
        newState: {
          ...state,
          latestDeathAnnouncement: {
            deaths: deaths.map(d => ({ playerId: d.playerId, cause: d.cause as GameState["players"][string]["deathInfo"]["cause"] })),
            isSafeNight,
          },
        },
        effects,
      }
    }
    case "game:ended": {
      const { winner, mvp, svp } = event.payload as { winner: string; mvp: string; svp: string }
      return {
        newState: {
          ...state,
          gameOver: { winner: winner as GameState["gameOver"]["winner"], mvp, svp },
        },
        effects,
      }
    }
    default:
      return { newState: state, effects }
  }
}

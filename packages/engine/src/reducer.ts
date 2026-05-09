import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"

/**
 * Reducer — 纯函数
 * (state, event) → { newState, effects[] }
 */
export function reduce(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "room:player_joined": {
      const { playerId, name, seat } = event.payload as { playerId: string; name: string; seat: number }
      return {
        newState: {
          ...state,
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId]!,
              name,
              seat,
            },
          },
          lastEventSeq: event.seq,
        },
        effects,
      }
    }

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
          lastEventSeq: event.seq,
        },
        effects,
      }
    }

    case "phase:transitioned": {
      const { to, round } = event.payload as { from: string; to: string; round: number }
      const [phaseType, subPhase] = parsePhaseTo(to)
      return {
        newState: {
          ...state,
          phase: { type: phaseType, subPhase, round, dayNumber: state.phase.dayNumber },
          lastEventSeq: event.seq,
        },
        effects,
      }
    }

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
          lastEventSeq: event.seq,
        },
        effects,
      }
    }

    default:
      return { newState: { ...state, lastEventSeq: event.seq }, effects }
  }
}

function parsePhaseTo(phaseStr: string): [GameState["phase"]["type"], GameState["phase"]["subPhase"]] {
  const mapping: Record<string, [GameState["phase"]["type"], GameState["phase"]["subPhase"]]> = {
    "WAITING": ["WAITING", "WAITING_PLAYERS"],
    "NIGHT_ANNOUNCE": ["NIGHT", "NIGHT_ANNOUNCE"],
    "WOLF_INTEL": ["NIGHT", "WOLF_INTEL"],
    "WOLF_PROPOSE": ["NIGHT", "WOLF_PROPOSE"],
    "SEER_CHOOSE": ["NIGHT", "SEER_CHOOSE"],
    "WITCH_DECIDE": ["NIGHT", "WITCH_DECIDE"],
    "NIGHT_SETTLEMENT": ["NIGHT", "NIGHT_SETTLEMENT"],
    "DAY_BREAK": ["DAY", "DAY_BREAK"],
    "DEATH_ANNOUNCE": ["DAY", "DEATH_ANNOUNCE"],
    "SPEECH_PRE_THINK": ["DAY", "SPEECH_PRE_THINK"],
    "SPEECH_TURN_ACTIVE": ["DAY", "SPEECH_TURN_ACTIVE"],
    "VOTE_CAST": ["DAY", "VOTE_CAST"],
    "VOTE_REVEAL": ["DAY", "VOTE_REVEAL"],
    "EXILE_ANNOUNCE": ["DAY", "EXILE_ANNOUNCE"],
    "GAME_OVER": ["GAME_OVER", "RESULT_ANNOUNCE"],
  }
  return mapping[phaseStr] || ["WAITING", "WAITING_PLAYERS"]
}

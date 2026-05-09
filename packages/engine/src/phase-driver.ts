import type { GameState, SubPhaseType } from "@aiwolf/shared/types"

export function determineNextPhase(state: GameState): SubPhaseType {
  switch (state.phase.subPhase) {
    case "WAITING_PLAYERS":
      return "ROLE_ASSIGNMENT"
    case "ROLE_ASSIGNMENT":
      return "NIGHT_ANNOUNCE"
    case "NIGHT_ANNOUNCE":
      return "WOLF_INTEL"
    case "WOLF_INTEL":
      return "WOLF_PROPOSE"
    case "WOLF_PROPOSE":
      return "SEER_CHOOSE"
    case "SEER_CHOOSE":
      return "SEER_RESULT"
    case "SEER_RESULT":
      return "WITCH_NOTIFY"
    case "WITCH_NOTIFY":
      return "WITCH_DECIDE"
    case "WITCH_DECIDE":
      return "NIGHT_SETTLEMENT"
    case "NIGHT_SETTLEMENT":
      return "DAY_BREAK"
    case "DAY_BREAK":
      return "DEATH_ANNOUNCE"
    case "DEATH_ANNOUNCE":
      return "CHECK_WIN"
    case "SPEECH_PRE_THINK":
      return "SPEECH_TURN_ACTIVE"
    case "SPEECH_TURN_ACTIVE":
      return "VOTE_CAST"
    case "VOTE_CAST":
      return "VOTE_REVEAL"
    case "VOTE_REVEAL":
      return "EXILE_ANNOUNCE"
    case "EXILE_ANNOUNCE":
      return "DAY_SETTLEMENT"
    case "DAY_SETTLEMENT":
      return "NIGHT_ANNOUNCE"
    default:
      return state.phase.subPhase
  }
}

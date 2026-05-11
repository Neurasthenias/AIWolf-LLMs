import type { GameState, SubPhaseType } from "@aiwolf/shared/types"

export function isPhaseComplete(state: GameState): boolean {
  switch (state.phase.subPhase) {
    case "ROLE_REVEAL": return allPlayersAcked(state)
    case "WOLF_PROPOSE": return allWolvesProposed(state)
    case "SPEECH_TURN_ACTIVE": return allPlayersSpoke(state)
    case "VOTE_CAST": return allAliveVoted(state)
    default: return true
  }
}

export function determineNextPhase(state: GameState): SubPhaseType {
  switch (state.phase.subPhase) {
    case "WAITING_PLAYERS": return "ROLE_ASSIGNMENT"
    case "ROLE_ASSIGNMENT": return "ROLE_REVEAL"
    case "ROLE_REVEAL": return "NIGHT_ANNOUNCE"
    case "NIGHT_ANNOUNCE": return "WOLF_INTEL"
    case "WOLF_INTEL": return "WOLF_PROPOSE"
    case "WOLF_PROPOSE": return "SEER_CHOOSE"
    case "SEER_CHOOSE": return "SEER_RESULT"
    case "SEER_RESULT": return hasWitch(state) ? "WITCH_NOTIFY" : "NIGHT_SETTLEMENT"
    case "WITCH_NOTIFY": return "WITCH_DECIDE"
    case "WITCH_DECIDE": return "NIGHT_SETTLEMENT"
    case "NIGHT_SETTLEMENT": return "DAY_BREAK"
    case "DAY_BREAK": return "DEATH_ANNOUNCE"
    case "DEATH_ANNOUNCE": return "CHECK_WIN"
    case "CHECK_WIN":
      return checkWinCondition(state) ? "RESULT_ANNOUNCE" : "SPEECH_PRE_THINK"
    case "SPEECH_PRE_THINK": return "SPEECH_TURN_ACTIVE"
    case "SPEECH_TURN_ACTIVE": return "VOTE_CAST"
    case "VOTE_CAST": return "VOTE_REVEAL"
    case "VOTE_REVEAL": return "EXILE_ANNOUNCE"
    case "EXILE_ANNOUNCE": return "DAY_SETTLEMENT"
    case "DAY_SETTLEMENT": return "NIGHT_ANNOUNCE"
    case "RESULT_ANNOUNCE": return "MVP_ANNOUNCE"
    case "MVP_ANNOUNCE": return "MVP_ANNOUNCE"
    default: return state.phase.subPhase
  }
}

function allAliveVoted(state: GameState): boolean {
  return Object.values(state.players)
    .filter(p => p.isAlive)
    .every(p => p.voteTargetId !== undefined)
}

function hasWitch(state: GameState): boolean {
  return Object.values(state.players).some(p => p.role === "witch" && p.isAlive)
}

function allPlayersAcked(state: GameState): boolean {
  return Object.values(state.players).every(p => (state.roleAcks ?? []).includes(p.id))
}

function allPlayersSpoke(state: GameState): boolean {
  const aliveIds = Object.values(state.players).filter(p => p.isAlive).map(p => p.id)
  return aliveIds.every(id => (state.speechDone ?? []).includes(id))
}

function allWolvesProposed(state: GameState): boolean {
  const aliveWolves = Object.values(state.players).filter(p => p.isAlive && p.role === "werewolf")
  return aliveWolves.every(w => (state.wolfProposals ?? []).some(p => p.wolfId === w.id))
}

function checkWinCondition(state: GameState): boolean {
  const alive = Object.values(state.players).filter(p => p.isAlive)
  const aliveWolves = alive.filter(p => p.faction === "wolf").length
  const aliveGood = alive.filter(p => p.faction === "good").length
  return aliveWolves === 0 || aliveWolves >= aliveGood
}

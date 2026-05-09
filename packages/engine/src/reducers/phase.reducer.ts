import type { GameState, GameEvent, Effect, PhaseType, SubPhaseType } from "@aiwolf/shared/types"

const PHASE_MAP: Record<SubPhaseType, PhaseType> = {
  WAITING_PLAYERS: "WAITING", ROLE_ASSIGNMENT: "WAITING",
  NIGHT_ANNOUNCE: "NIGHT", WOLF_INTEL: "NIGHT", WOLF_PROPOSE: "NIGHT", WOLF_RESOLVE: "NIGHT",
  SEER_CHOOSE: "NIGHT", SEER_RESULT: "NIGHT", WITCH_NOTIFY: "NIGHT", WITCH_DECIDE: "NIGHT",
  GUARD_CHOOSE: "NIGHT", NIGHT_SETTLEMENT: "NIGHT",
  DAY_BREAK: "DAY", DEATH_ANNOUNCE: "DAY", CHECK_WIN: "DAY", COMMON_LAST_WORDS: "DAY",
  HUNTER_SHOOT: "DAY", SHERIFF_ELECTION: "DAY",
  SPEECH_PRE_THINK: "DAY", SPEECH_TURN_ACTIVE: "DAY", SPEECH_TURN_DONE: "DAY",
  VOTE_CAST: "DAY", VOTE_REVEAL: "DAY", TIE_BREAK_SPEECH: "DAY", TIE_BREAK_VOTE: "DAY",
  EXILE_ANNOUNCE: "DAY", DAY_SETTLEMENT: "DAY",
  RESULT_ANNOUNCE: "GAME_OVER", MVP_ANNOUNCE: "GAME_OVER",
}

export function reducePhase(state: GameState, event: GameEvent): { newState: GameState; effects: Effect[] } {
  const effects: Effect[] = []

  switch (event.type) {
    case "phase:transitioned": {
      const { to, round } = event.payload as { from: string; to: SubPhaseType; round: number }
      const phaseType = PHASE_MAP[to] ?? state.phase.type
      const newDayNumber = to === "DAY_BREAK" || to === "DEATH_ANNOUNCE"
        ? state.phase.dayNumber + 1
        : state.phase.dayNumber

      effects.push({
        id: crypto.randomUUID(),
        type: "timer:start",
        phaseId: to,
        gameId: state.gameId,
        createdAt: Date.now(),
        payload: { phase: to },
      })

      return {
        newState: {
          ...state,
          phase: { type: phaseType, subPhase: to, round, dayNumber: newDayNumber },
          // Reset vote state on phase transition
          ...(to === "VOTE_CAST" ? {} : { players: resetVotes(state.players) }),
        },
        effects,
      }
    }
    case "phase:timer_expired": {
      return {
        newState: state,
        effects: [
          {
            id: crypto.randomUUID(),
            type: "phase:force_next",
            phaseId: state.phase.subPhase,
            gameId: state.gameId,
            createdAt: Date.now(),
            payload: { expiredPhase: event.payload.phase },
          },
        ],
      }
    }
    default:
      return { newState: state, effects }
  }
}

function resetVotes(players: GameState["players"]): GameState["players"] {
  const updated = { ...players }
  for (const id of Object.keys(updated)) {
    updated[id] = { ...updated[id]!, voteTargetId: null }
  }
  return updated
}

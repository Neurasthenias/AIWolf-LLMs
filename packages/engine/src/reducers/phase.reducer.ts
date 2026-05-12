import type { GameState, GameEvent, Effect, PhaseType, SubPhaseType } from "@aiwolf/shared/types"

const PHASE_MAP: Record<SubPhaseType, PhaseType> = {
  WAITING_PLAYERS: "WAITING", ROLE_ASSIGNMENT: "WAITING", ROLE_REVEAL: "WAITING",
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
      const newDayNumber = to === "DAY_BREAK" ? round : state.phase.dayNumber

      effects.push({
        id: crypto.randomUUID(),
        type: "timer:start",
        phaseId: to,
        gameId: state.gameId,
        createdAt: Date.now(),
        payload: { phase: to },
      })

      const timeoutSec = state.config?.timeouts?.[timeoutKey(to)] ?? 0
      const phaseTimerDeadline = timeoutSec > 0 ? event.timestamp + timeoutSec * 1000 : undefined

      return {
        newState: {
          ...state,
          phase: { type: phaseType, subPhase: to, round, dayNumber: newDayNumber },
          ...(phaseTimerDeadline ? { phaseTimerDeadline } : { phaseTimerDeadline: undefined }),
          // Reset vote state on phase transition
          ...(to === "VOTE_CAST" ? {} : { players: resetVotes(state.players) }),
          // Reset wolf proposals at start of each night
          ...(to === "WOLF_INTEL" ? { wolfProposals: [], resolvedWolfTarget: undefined } : {}),
          // Reset speech state at start of each speech phase
          ...(to === "SPEECH_PRE_THINK" ? { speechQueue: [], speechDone: [] } : {}),
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
    case "speech:completed": {
      const { playerId, fullText } = event.payload as { playerId: string; fullText: string; duration: number }
      return {
        newState: {
          ...state,
          speeches: [...state.speeches, { playerId, content: fullText, timestamp: event.timestamp, round: state.phase.round }],
          speechDone: [...(state.speechDone ?? []), playerId],
        },
        effects,
      }
    }
    case "speech:speaker_changed": {
      const { playerId } = event.payload as { playerId: string }
      return {
        newState: { ...state, currentSpeakerId: playerId },
        effects: [],
      }
    }
    case "wolf:proposal_submitted": {
      const { playerId, targetId, reason } = event.payload as { playerId: string; targetId: string; reason?: string }
      return {
        newState: {
          ...state,
          wolfProposals: [...(state.wolfProposals ?? []), { wolfId: playerId, targetId, reason }],
        },
        effects,
      }
    }
    case "wolf:proposal_resolved": {
      const { targetId } = event.payload as { targetId: string }
      return {
        newState: {
          ...state,
          resolvedWolfTarget: targetId,
        },
        effects,
      }
    }
    case "witch:action_submitted": {
      const { saveTargetId, poisonTargetId } = event.payload as { playerId: string; saveTargetId?: string; poisonTargetId?: string }
      return {
        newState: {
          ...state,
          witchActions: { saveTargetId, poisonTargetId },
        },
        effects,
      }
    }
    case "role:acknowledged": {
      const { playerId } = event.payload as { playerId: string }
      return {
        newState: {
          ...state,
          roleAcks: [...(state.roleAcks ?? []), playerId],
        },
        effects: [],
      }
    }
    case "speech:queue_initialized": {
      const { queue } = event.payload as { queue: string[] }
      return {
        newState: { ...state, speechQueue: queue, speechDone: [] },
        effects: [],
      }
    }
    case "speech:player_done": {
      const { playerId } = event.payload as { playerId: string }
      return {
        newState: {
          ...state,
          speechDone: [...(state.speechDone ?? []), playerId],
        },
        effects: [],
      }
    }
    case "game:ended": {
      return {
        newState: {
          ...state,
          phase: { type: "GAME_OVER", subPhase: "RESULT_ANNOUNCE", round: state.phase.round, dayNumber: state.phase.dayNumber },
        },
        effects,
      }
    }
    default:
      return { newState: state, effects }
  }
}

function timeoutKey(subPhase: SubPhaseType): string {
  if (subPhase === "VOTE_CAST") return "vote"
  if (subPhase === "SPEECH_TURN_ACTIVE") return "speech"
  if (PHASE_MAP[subPhase] === "NIGHT") return "night"
  return subPhase.toLowerCase()
}

function resetVotes(players: GameState["players"]): GameState["players"] {
  const updated = { ...players }
  for (const id of Object.keys(updated)) {
    updated[id] = { ...updated[id]!, voteTargetId: null }
  }
  return updated
}

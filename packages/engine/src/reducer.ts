import type { GameState, GameEvent, Effect } from "@aiwolf/shared/types"
import type { ReducerResult } from "@aiwolf/shared/types"
import { reduceRoom } from "./reducers/room.reducer"
import { reduceRole } from "./reducers/role.reducer"
import { reducePhase } from "./reducers/phase.reducer"
import { reduceVote } from "./reducers/vote.reducer"
import { reduceDeath } from "./reducers/death.reducer"

const DOMAIN_REDUCERS = [reduceRoom, reduceRole, reducePhase, reduceVote, reduceDeath]

export function reduce(state: GameState, event: GameEvent): ReducerResult {
  let newState = state
  const allEffects: Effect[] = []

  for (const reducer of DOMAIN_REDUCERS) {
    const result = reducer(newState, event)
    newState = result.newState
    allEffects.push(...result.effects)
  }

  newState = { ...newState, lastEventSeq: event.seq }
  return { newState, effects: allEffects }
}

/** Replay: 从事件流重现完整 State */
export function replayState(events: GameEvent[], initialState: GameState): GameState {
  let state = initialState
  for (const event of events) {
    const result = reduce(state, event)
    state = result.newState
  }
  return state
}

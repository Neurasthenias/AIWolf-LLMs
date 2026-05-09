export { createGame } from "./create-game"
export { reduce, replayState } from "./reducer"
export { handleCommand } from "./command-handler"
export { determineNextPhase, isPhaseComplete } from "./phase-driver"
export { buildPlayerView } from "./projection"
export { InMemoryEventStore, type EventStore } from "./event-store"
export { assignRoles } from "./assign-roles"

export type {
  GameState, GameEvent, Command, Effect, ReducerResult,
  GameConfig, PlayerState, PhaseDetail, DeathAnnouncement,
} from "@aiwolf/shared/types"

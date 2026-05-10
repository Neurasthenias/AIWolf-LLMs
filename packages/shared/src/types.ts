// ── 基础类型 ──

export type RoleType = "werewolf" | "villager" | "seer" | "witch" | "hunter" | "guard"
export type FactionType = "good" | "wolf"
export type PhaseType = "WAITING" | "NIGHT" | "DAY" | "GAME_OVER"

export type SubPhaseType =
  | "WAITING_PLAYERS" | "ROLE_ASSIGNMENT"
  | "NIGHT_ANNOUNCE" | "WOLF_INTEL" | "WOLF_PROPOSE" | "WOLF_RESOLVE"
  | "SEER_CHOOSE" | "SEER_RESULT" | "WITCH_NOTIFY" | "WITCH_DECIDE"
  | "GUARD_CHOOSE" | "NIGHT_SETTLEMENT"
  | "DAY_BREAK" | "DEATH_ANNOUNCE" | "CHECK_WIN" | "COMMON_LAST_WORDS"
  | "HUNTER_SHOOT" | "SHERIFF_ELECTION"
  | "SPEECH_PRE_THINK" | "SPEECH_TURN_ACTIVE" | "SPEECH_TURN_DONE"
  | "VOTE_CAST" | "VOTE_REVEAL" | "TIE_BREAK_SPEECH" | "TIE_BREAK_VOTE"
  | "EXILE_ANNOUNCE" | "DAY_SETTLEMENT"
  | "RESULT_ANNOUNCE" | "MVP_ANNOUNCE"

export type DeathCause = "WOLF_KILL" | "VOTE_EXILE" | "WITCH_POISON" | "HUNTER_SHOT" | "GUARD_WITCH_SAME"

// ── Event ──

export interface GameEvent {
  id: string
  version: string
  schemaVersion: string
  type: string
  gameId: string
  seq: number
  timestamp: number
  causationId?: string
  correlationId?: string
  idempotencyKey?: string
  visibility: "public" | "private" | "hidden"
  visibleTo?: string[]
  payload: Record<string, unknown>
}

// ── Command ──

export interface Command {
  id: string
  version: string
  type: string
  gameId: string
  actorId: string
  timestamp: number
  idempotencyKey?: string
  payload: Record<string, unknown>
}

// ── State ──

export interface SpeechRecord {
  playerId: string
  content: string
  timestamp: number
  round: number
}

export interface VoteTally {
  votes: Record<string, string | null>
  exiledPlayerId?: string
}

export interface GameState {
  gameId: string
  version: string
  phase: PhaseDetail
  players: Record<string, PlayerState>
  witchPotions: { hasSave: boolean; hasPoison: boolean }
  sheriffId: string | null
  sheriffElectionDone: boolean
  tieBreakCount: number
  currentSpeakerId?: string
  phaseTimerDeadline?: number
  latestDeathAnnouncement?: DeathAnnouncement
  startedAt: number
  lastEventSeq: number
  gameOver?: { winner: FactionType; mvp: string; svp: string }
  speeches: SpeechRecord[]
  currentVoteTally?: VoteTally
  witchActions?: { saveTargetId?: string; poisonTargetId?: string }
  wolfProposals?: { wolfId: string; targetId: string }[]
  resolvedWolfTarget?: string
}

export interface PhaseDetail {
  type: PhaseType
  subPhase: SubPhaseType
  round: number
  dayNumber: number
}

export interface PlayerState {
  id: string
  name: string
  seat: number
  role: RoleType
  faction: FactionType
  isAlive: boolean
  isAI: boolean
  isHost: boolean
  deathInfo?: { cause: DeathCause; round: number; killedBy?: string }
  voteTargetId?: string | null
  teammates?: string[]
}

export interface DeathAnnouncement {
  deaths: { playerId: string; cause: DeathCause }[]
  isSafeNight: boolean
}

// ── Effect ──

export interface Effect {
  id: string
  type: string
  phaseId: string
  gameId: string
  createdAt: number
  timeoutMs?: number
  retry?: { maxRetries: number; backoffMs: number; backoffMultiplier: number }
  dedupeKey?: string
  payload: Record<string, unknown>
}

// ── Game Config ──

export interface GameConfig {
  template?: string
  roles: Record<RoleType, number>
  minPlayers: number
  maxPlayers: number
  rules: {
    hasSheriff: boolean
    witchSelfSave: boolean
    lastWords: "none" | "all" | "first_night_and_first_vote"
  }
  timeouts: Record<string, number>
}

// ── Reducer 返回值 ──

export interface ReducerResult {
  newState: GameState
  effects: Effect[]
}

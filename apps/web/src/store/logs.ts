import { create } from "zustand"

export interface GameSummary {
  gameId: string
  shortId?: string
  winner: string | null
  mvp: string
  svp: string
  totalEvents: number
  rounds: number
  durationMs: number
  deadPlayers: string[]
  roleAssignments: Record<string, string>
  error?: string
  source?: string
}

export interface TraceIntent {
  analysis?: {
    knownFacts: string[]
    privateFacts: string[]
    suspicions: { playerId: string; score: number; reason: string }[]
    strategy: string
    risk: string
  }
  action: { type: string; targetId: string | null; reason?: string }
  speech?: { content: string; tone: string }
}

export interface TraceEntry {
  gameId: string
  playerId: string
  task: string
  timestamp: number
  model?: string
  provider?: string
  thinkingEnabled?: boolean
  reasoningEffort?: "high" | "max"
  reasoningContentLength?: number
  finishReason?: string
  context: { systemPrompt: string; userPrompt: string }
  rawResponse: string
  reasoning: string
  parsedIntent: TraceIntent | null
  finalIntent?: TraceIntent | null
  parseError?: string
  fallbackReason?: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  latencyMs: number
  fallbackUsed: boolean
}

interface LogStore {
  games: GameSummary[]
  selectedGameId: string | null
  selectedSummary: GameSummary | null
  selectedEvents: Record<string, unknown>[]
  selectedTraces: TraceEntry[]
  loading: boolean
  fetchGames: () => Promise<void>
  selectGame: (gameId: string) => Promise<void>
}

export const useLogStore = create<LogStore>((set) => ({
  games: [],
  selectedGameId: null,
  selectedSummary: null,
  selectedEvents: [],
  selectedTraces: [],
  loading: false,

  fetchGames: async () => {
    set({ loading: true })
    try {
      const res = await fetch("http://localhost:3001/api/logs/games")
      const data = await res.json()
      set({ games: data.games ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  selectGame: async (gameId: string) => {
    set({ selectedGameId: gameId, loading: true })
    try {
      const res = await fetch(`http://localhost:3001/api/logs/games/${gameId}`)
      const data = await res.json()
      set({
        selectedSummary: data.summary,
        selectedEvents: data.events ?? [],
        selectedTraces: data.traces ?? [],
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },
}))

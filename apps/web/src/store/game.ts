import { create } from "zustand"
import { io, Socket } from "socket.io-client"
import type { PlayerView, GameEvent } from "../types"

interface GameStore {
  // Connection
  socket: Socket | null
  connected: boolean
  connecting: boolean
  gameId: string | null
  playerId: string | null
  playerName: string
  lastSeenSeq: number

  // Game state
  view: PlayerView | null
  events: GameEvent[]
  error: string | null
  actionPending: string | null

  // Actions
  connect: (url: string) => Promise<void>
  joinRoom: (gameId: string, playerId: string) => void
  setPlayerName: (name: string) => void
  sendSpeech: (content: string) => void
  sendVote: (targetId: string | null) => void
  sendAction: (actionType: string, targetId?: string) => void
  requestCatchup: () => void
  clearError: () => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  connected: false,
  connecting: false,
  gameId: null,
  playerId: null,
  playerName: "",
  lastSeenSeq: 0,
  view: null,
  events: [],
  error: null,
  actionPending: null,

  connect: (url: string) => {
    return new Promise<void>((resolve, reject) => {
      const existing = get().socket

      // Already connected to the same URL
      if (existing?.connected && get().connected) {
        resolve()
        return
      }

      // Clean up stale socket before reconnecting
      if (existing) {
        existing.off()
        existing.disconnect()
      }

      set({ connecting: true, connected: false, error: null })

      const socket = io(url, { transports: ["websocket"] })

      socket.on("connect", () => {
        set({ connected: true, connecting: false, socket })
        resolve()
      })

      socket.on("connect_error", (err) => {
        set({ connecting: false })
        reject(err)
      })

      socket.on("disconnect", () => {
        set({ connected: false, connecting: false })
      })

      socket.on("game:event", (event: GameEvent) => {
        set(s => {
          const nextSeq = Math.max(s.lastSeenSeq, event.seq)
          return { events: [...s.events, event], lastSeenSeq: nextSeq }
        })
      })

      socket.on("game:state_snapshot", (data: { seq: number; view: PlayerView }) => {
        set({ view: data.view, lastSeenSeq: Math.max(get().lastSeenSeq, data.seq) })
      })

      socket.on("game:player_view", (view: PlayerView) => {
        set({ view })
      })

      socket.on("game:error", (data: { message: string }) => {
        set({ error: data.message })
      })

      set({ socket })
    })
  },

  joinRoom: (gameId: string, playerId: string) => {
    const { socket, playerName } = get()
    if (!socket) return
    set({ gameId, playerId, lastSeenSeq: 0, events: [] })
    socket.emit("room:join", { gameId, playerId, playerName: playerName || `Player ${playerId}` })
  },

  setPlayerName: (name: string) => set({ playerName: name }),

  sendSpeech: (content: string) => {
    const { socket, gameId, playerId, actionPending } = get()
    if (!socket || !gameId || !playerId || actionPending) return
    set({ actionPending: "speech:submit", error: null })
    socket.emit("game:speech", { gameId, playerId, content }, (ack: { ok: boolean; error?: string }) => {
      if (ack?.ok) {
        set({ actionPending: null })
        get().requestCatchup()
      } else {
        set({ actionPending: null, error: ack?.error ?? "SPEECH_FAILED" })
      }
    })
  },

  sendVote: (targetId: string | null) => {
    const { socket, gameId, playerId, actionPending } = get()
    if (!socket || !gameId || !playerId || actionPending) return
    set({ actionPending: "vote:cast", error: null })
    socket.emit("game:vote", { gameId, playerId, targetId }, (ack: { ok: boolean; error?: string }) => {
      if (ack?.ok) {
        set({ actionPending: null })
        get().requestCatchup()
      } else {
        set({ actionPending: null, error: ack?.error ?? "VOTE_FAILED" })
      }
    })
  },

  sendAction: (actionType: string, targetId?: string) => {
    const { socket, gameId, playerId, actionPending } = get()
    if (!socket || !gameId || !playerId || actionPending) return
    set({ actionPending: actionType, error: null })
    socket.emit("game:action", { gameId, playerId, actionType, targetId }, (ack: { ok: boolean; error?: string }) => {
      if (ack?.ok) {
        set({ actionPending: null })
        get().requestCatchup()
      } else {
        set({ actionPending: null, error: ack?.error ?? "ACTION_FAILED" })
      }
    })
  },

  clearError: () => set({ error: null }),

  requestCatchup: () => {
    const { socket, gameId, playerId, lastSeenSeq } = get()
    if (!socket || !gameId || !playerId) return
    socket.emit("game:catchup", { gameId, playerId, fromSeq: lastSeenSeq })
  },

  reset: () => {
    const { socket } = get()
    socket?.off()
    socket?.disconnect()
    set({
      socket: null, connected: false, connecting: false,
      gameId: null, playerId: null, lastSeenSeq: 0,
      view: null, events: [], error: null, actionPending: null,
    })
  },
}))

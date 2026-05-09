import { create } from "zustand"
import { io, Socket } from "socket.io-client"
import type { PlayerView, GameEvent } from "../types"

interface GameStore {
  // Connection
  socket: Socket | null
  connected: boolean
  gameId: string | null
  playerId: string | null
  playerName: string

  // Game state
  view: PlayerView | null
  events: GameEvent[]
  error: string | null

  // Actions
  connect: (url: string) => void
  joinRoom: (gameId: string, playerId: string) => void
  setPlayerName: (name: string) => void
  sendSpeech: (content: string) => void
  sendVote: (targetId: string | null) => void
  sendAction: (actionType: string, targetId?: string) => void
  requestCatchup: () => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  connected: false,
  gameId: null,
  playerId: null,
  playerName: "",
  view: null,
  events: [],
  error: null,

  connect: (url: string) => {
    const socket = io(url, { transports: ["websocket"] })
    socket.on("connect", () => set({ connected: true }))
    socket.on("disconnect", () => set({ connected: false }))
    socket.on("game:event", (event: GameEvent) => {
      set(s => ({ events: [...s.events, event] }))
    })
    socket.on("game:state_snapshot", (data: { seq: number; view: PlayerView }) => {
      set({ view: data.view })
    })
    socket.on("game:player_view", (view: PlayerView) => {
      set({ view })
    })
    socket.on("game:error", (data: { message: string }) => {
      set({ error: data.message })
    })
    set({ socket })
  },

  joinRoom: (gameId: string, playerId: string) => {
    const { socket, playerName } = get()
    if (!socket) return
    set({ gameId, playerId })
    socket.emit("room:join", { gameId, playerId, playerName: playerName || `Player ${playerId}` })
  },

  setPlayerName: (name: string) => set({ playerName: name }),

  sendSpeech: (content: string) => {
    const { socket, gameId, playerId } = get()
    if (!socket || !gameId || !playerId) return
    socket.emit("game:speech", { gameId, playerId, content })
  },

  sendVote: (targetId: string | null) => {
    const { socket, gameId, playerId } = get()
    if (!socket || !gameId || !playerId) return
    socket.emit("game:vote", { gameId, playerId, targetId })
  },

  sendAction: (actionType: string, targetId?: string) => {
    const { socket, gameId, playerId } = get()
    if (!socket || !gameId || !playerId) return
    socket.emit("game:action", { gameId, playerId, actionType, targetId })
  },

  requestCatchup: () => {
    const { socket, gameId, playerId } = get()
    if (!socket || !gameId || !playerId) return
    socket.emit("game:catchup", { gameId, playerId, fromSeq: 0 })
  },

  reset: () => {
    const { socket } = get()
    socket?.disconnect()
    set({ socket: null, connected: false, gameId: null, playerId: null, view: null, events: [], error: null })
  },
}))

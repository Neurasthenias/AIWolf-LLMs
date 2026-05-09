import type { Server as HTTPServer } from "node:http"
import { Server as SocketServer } from "socket.io"
import type { GameState, GameEvent, Command } from "@aiwolf/shared/types"
import { getOrCreateGame } from "../runtime"
import { buildPlayerView } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

interface ClientState {
  gameId: string
  playerId: string
  lastSeenSeq: number
  role?: string
}

export function createGateway(httpServer: HTTPServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  const clients = new Map<string, ClientState>()

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`)

    socket.on("room:join", async (data: { gameId: string; playerId: string; playerName: string }) => {
      const { gameId, playerId, playerName } = data
      const runtime = getOrCreateGame(gameId)

      // Register client
      clients.set(socket.id, { gameId, playerId, lastSeenSeq: 0 })
      socket.join(gameId)

      // Dispatch join command
      const cmd: Command = {
        id: uuidv7(), version: "1.0", type: "room:join",
        gameId, actorId: playerId, timestamp: Date.now(),
        idempotencyKey: `${socket.id}:join`,
        payload: { playerId, name: playerName, seat: parseInt(playerId.slice(1)) },
      }
      await runtime.dispatch(cmd)

      // Subscribe to events → push to client
      const unsub = runtime.onEvent((event: GameEvent) => {
        const client = clients.get(socket.id)
        if (!client || event.gameId !== client.gameId) return

        // Visibility filter: only push events this player can see
        if (event.visibility === "private" && event.visibleTo && !event.visibleTo.includes(client.playerId)) {
          return
        }
        if (event.visibility === "hidden") return

        client.lastSeenSeq = event.seq
        socket.emit("game:event", {
          seq: event.seq,
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload,
        })
      })

      socket.on("disconnect", () => {
        unsub()
        clients.delete(socket.id)
        console.log(`[socket] client disconnected: ${socket.id}`)
      })
    })

    // Action commands from client
    socket.on("game:action", async (data: { gameId: string; playerId: string; actionType: string; targetId?: string }) => {
      const runtime = getOrCreateGame(data.gameId)
      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: data.actionType,
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload: { targetId: data.targetId },
      }
      await runtime.dispatch(cmd)
    })

    socket.on("game:speech", async (data: { gameId: string; playerId: string; content: string }) => {
      const runtime = getOrCreateGame(data.gameId)
      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: "speech:submit",
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload: { content: data.content },
      }
      await runtime.dispatch(cmd)
    })

    socket.on("game:vote", async (data: { gameId: string; playerId: string; targetId: string | null }) => {
      const runtime = getOrCreateGame(data.gameId)
      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: "vote:cast",
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload: { targetId: data.targetId },
      }
      await runtime.dispatch(cmd)
    })

    // Reconnect: request catch-up from last known seq
    socket.on("game:catchup", async (data: { gameId: string; playerId: string; fromSeq: number }) => {
      const runtime = getOrCreateGame(data.gameId)
      const client = clients.get(socket.id)
      if (client) client.lastSeenSeq = data.fromSeq

      // Push current state snapshot
      const state = runtime.getState()
      const view = buildPlayerView(state, data.playerId)
      socket.emit("game:state_snapshot", { seq: state.lastEventSeq, view })
    })

    // Request full player view
    socket.on("game:get_view", (data: { gameId: string; playerId: string }) => {
      const runtime = getOrCreateGame(data.gameId)
      const state = runtime.getState()
      const view = buildPlayerView(state, data.playerId)
      socket.emit("game:player_view", view)
    })
  })

  return io
}

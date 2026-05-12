import type { Server as HTTPServer } from "node:http"
import { Server as SocketServer } from "socket.io"
import type { GameState, GameEvent, Command } from "@aiwolf/shared/types"
import { getOrCreateGame } from "../runtime"
import type { GameRuntime } from "../runtime"
import { buildPlayerView } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

interface ClientState {
  gameId: string
  playerId: string
  lastSeenSeq: number
}

// ── Action validation ──

const ACTION_PHASE_MAP: Record<string, string> = {
  "role:acknowledge": "ROLE_REVEAL",
  "night:wolf_kill": "WOLF_PROPOSE",
  "night:seer_check": "SEER_CHOOSE",
  "night:witch_action": "WITCH_DECIDE",
  "speech:submit": "SPEECH_TURN_ACTIVE",
  "vote:cast": "VOTE_CAST",
}

const ACTION_ROLE_MAP: Record<string, string[]> = {
  "night:wolf_kill": ["werewolf"],
  "night:seer_check": ["seer"],
  "night:witch_action": ["witch"],
}

const TARGET_REQUIRED_ACTIONS = new Set([
  "night:wolf_kill",
  "night:seer_check",
])

function validateAction(
  client: ClientState | undefined,
  runtime: GameRuntime,
  data: { gameId: string; playerId: string; actionType: string; targetId?: string | null },
): string | null {
  if (!client) return "NOT_JOINED"
  if (client.gameId !== data.gameId) return "GAME_MISMATCH"
  if (client.playerId !== data.playerId) return "PLAYER_MISMATCH"

  const state = runtime.getState()
  const player = state.players[data.playerId]
  if (!player) return "PLAYER_NOT_FOUND"
  if (!player.isAlive) return "PLAYER_DEAD"

  const requiredRoles = ACTION_ROLE_MAP[data.actionType]
  if (requiredRoles && !requiredRoles.includes(player.role)) {
    return "ROLE_NOT_ALLOWED"
  }

  const requiredPhase = ACTION_PHASE_MAP[data.actionType]
  if (!requiredPhase) return "UNKNOWN_ACTION"
  if (requiredPhase && state.phase.subPhase !== requiredPhase) {
    return "WRONG_PHASE"
  }

  if (TARGET_REQUIRED_ACTIONS.has(data.actionType) && !data.targetId) {
    return "TARGET_REQUIRED"
  }

  if (data.actionType === "speech:submit" && state.currentSpeakerId && state.currentSpeakerId !== data.playerId) {
    return "NOT_YOUR_SPEECH_TURN"
  }
  if (data.actionType === "vote:cast" && player.voteTargetId !== undefined) {
    return "ALREADY_VOTED"
  }
  if (data.targetId) {
    const target = state.players[data.targetId]
    if (!target) return "TARGET_NOT_FOUND"
    if (!target.isAlive) return "TARGET_DEAD"
    if (data.targetId === data.playerId && data.actionType !== "night:witch_action") return "TARGET_SELF_NOT_ALLOWED"
    // Wolves cannot kill teammates
    if (data.actionType === "night:wolf_kill" && target.role === "werewolf") return "TARGET_IS_TEAMMATE"
  }

  return null
}

export function createGateway(httpServer: HTTPServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  const clients = new Map<string, ClientState>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function emitSnapshot(sock: any, runtime: GameRuntime, playerId: string): void {
    const state = runtime.getState()
    const view = buildPlayerView(state, playerId)
    sock.emit("game:state_snapshot", { seq: state.lastEventSeq, view })
  }

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
        // Push snapshot so frontend stays in sync without manual refresh
        emitSnapshot(socket, runtime, client.playerId)
      })

      socket.on("disconnect", () => {
        unsub()
        clients.delete(socket.id)
        console.log(`[socket] client disconnected: ${socket.id}`)
      })
    })

    // Action commands from client
    socket.on("game:action", async (data: { gameId: string; playerId: string; actionType: string; targetId?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const runtime = getOrCreateGame(data.gameId)
      const err = validateAction(clients.get(socket.id), runtime, data)
      if (err) {
        socket.emit("game:error", { message: err })
        ack?.({ ok: false, error: err })
        return
      }

      // Seer check result is computed at gateway level
      const payload: Record<string, unknown> = data.actionType === "night:seer_check"
        ? { targetId: data.targetId, result: (runtime.getState().players[data.targetId!]?.faction === "wolf" ? "wolf" : "good") }
        : { targetId: data.targetId }

      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: data.actionType,
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload,
      }
      await runtime.dispatch(cmd)
      ack?.({ ok: true })
      emitSnapshot(socket, runtime, data.playerId)
    })

    socket.on("game:speech", async (data: { gameId: string; playerId: string; content: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const runtime = getOrCreateGame(data.gameId)
      const err = validateAction(clients.get(socket.id), runtime, { ...data, actionType: "speech:submit" })
      if (err) {
        socket.emit("game:error", { message: err })
        ack?.({ ok: false, error: err })
        return
      }
      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: "speech:submit",
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload: { content: data.content },
      }
      await runtime.dispatch(cmd)
      ack?.({ ok: true })
      emitSnapshot(socket, runtime, data.playerId)
    })

    socket.on("game:vote", async (data: { gameId: string; playerId: string; targetId: string | null }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const runtime = getOrCreateGame(data.gameId)
      const err = validateAction(clients.get(socket.id), runtime, { ...data, actionType: "vote:cast" })
      if (err) {
        socket.emit("game:error", { message: err })
        ack?.({ ok: false, error: err })
        return
      }
      const cmd: Command = {
        id: uuidv7(), version: "1.0",
        type: "vote:cast",
        gameId: data.gameId, actorId: data.playerId, timestamp: Date.now(),
        payload: { targetId: data.targetId },
      }
      await runtime.dispatch(cmd)
      ack?.({ ok: true })
      emitSnapshot(socket, runtime, data.playerId)
    })

    // Reconnect: request catch-up from last known seq
    socket.on("game:catchup", async (data: { gameId: string; playerId: string; fromSeq: number }) => {
      const runtime = getOrCreateGame(data.gameId)
      const client = clients.get(socket.id)
      if (!client || client.gameId !== data.gameId || client.playerId !== data.playerId) {
        socket.emit("game:error", { message: "NOT_JOINED" })
        return
      }

      // Push incremental events since last seen seq
      if (data.fromSeq > 0) {
        const missedEvents = await runtime.getEventsSince(data.fromSeq)
        for (const event of missedEvents) {
          if (event.visibility === "hidden") continue
          if (event.visibility === "private" && event.visibleTo && !event.visibleTo.includes(data.playerId)) continue
          socket.emit("game:event", {
            seq: event.seq,
            type: event.type,
            timestamp: event.timestamp,
            payload: event.payload,
          })
        }
      }

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

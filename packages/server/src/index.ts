import Fastify from "fastify"
import { Server as SocketServer } from "socket.io"
import { getOrCreateGame, getGameMetrics } from "./runtime"
import { createGame, handleCommand, reduce, replayState, assignRoles, FileEventStore } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const app = Fastify({ logger: true })
const games = new Map<string, { runtime: ReturnType<typeof getOrCreateGame>; players: Set<string> }>()

// ── REST API ──

app.post("/api/rooms", async (_req, reply) => {
  const gameId = uuidv7()
  const runtime = getOrCreateGame(gameId)
  games.set(gameId, { runtime, players: new Set() })
  return reply.send({ roomCode: gameId.slice(0, 8), gameId })
})

app.get("/api/rooms/:gameId", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const game = games.get(gameId)
  if (!game) return reply.status(404).send({ error: "Room not found" })
  const state = game.runtime.getState()
  return reply.send({
    roomCode: gameId.slice(0, 8),
    playerCount: game.players.size,
    phase: state.phase,
  })
})

app.get("/api/metrics", async (_req, reply) => {
  return reply.send(getGameMetrics())
})

// ── Start ──

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
app.listen({ port: PORT }, (err, address) => {
  if (err) throw err
  console.log(`[server] Listening on ${address}`)
})

export { app }

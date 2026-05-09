import Fastify from "fastify"
import { createServer } from "node:http"
import { createGateway } from "./socket/gateway"
import { getOrCreateGame, getGameMetrics } from "./runtime"
import { v7 as uuidv7 } from "uuid"

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

const app = Fastify({ logger: false })
const httpServer = createServer(app.server)
const io = createGateway(httpServer)

// REST
app.post("/api/rooms", async (_req, reply) => {
  const gameId = uuidv7()
  getOrCreateGame(gameId)
  return reply.send({ roomCode: gameId.slice(0, 8), gameId })
})

app.get("/api/rooms/:gameId", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const runtime = getOrCreateGame(gameId)
  const state = runtime.getState()
  return reply.send({ roomCode: gameId.slice(0, 8), phase: state.phase, playerCount: Object.keys(state.players).length })
})

app.get("/api/metrics", async (_req, reply) => {
  return reply.send(getGameMetrics())
})

httpServer.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`)
})

export { app, io }

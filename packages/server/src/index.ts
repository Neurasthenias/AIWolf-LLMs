import Fastify from "fastify"
import { createServer } from "node:http"
import { createGateway } from "./socket/gateway"
import { getOrCreateGame, getGameMetrics } from "./runtime"
import { createGame, assignRoles, handleCommand, replayState } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"

const app = Fastify({ logger: false })
const httpServer = createServer(app.server)
const io = createGateway(httpServer)

// REST
app.post("/api/rooms", async (_req, reply) => {
  const gameId = uuidv7()
  getOrCreateGame(gameId)
  return reply.send({ roomCode: gameId.slice(0, 8), gameId })
})

app.post("/api/rooms/:gameId/start", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const runtime = getOrCreateGame(gameId)

  // Initialize game
  const tempState = createGame({
    roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
    minPlayers: 6, maxPlayers: 6,
    rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
    timeouts: { speech: 180, vote: 15, night: 15 },
  })

  const assigned = assignRoles(tempState.players, tempState.roles ??
    { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 } as any, Date.now())

  await runtime.dispatch({
    id: uuidv7(), version: "1.0", type: "role:assign_batch",
    gameId, actorId: "system", timestamp: Date.now(),
    payload: { assignments: assigned },
  })

  return reply.send({ started: true, gameId })
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

app.get("/api/config", async (_req, reply) => {
  const hasKey = !!process.env.OPENAI_API_KEY
  return reply.send({
    aiEnabled: hasKey,
    model: DEFAULT_MODEL,
    mode: hasKey ? "LLM" : "rule-based (no API key configured)",
    hint: hasKey ? "" : "Set OPENAI_API_KEY env var to enable LLM AI",
  })
})

httpServer.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`)
  if (!process.env.OPENAI_API_KEY) {
    console.log(`[server] ⚠️  No OPENAI_API_KEY set — AI will use rule-based fallback`)
    console.log(`[server]    Set OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL for LLM AI`)
  }
})

export { app, io }

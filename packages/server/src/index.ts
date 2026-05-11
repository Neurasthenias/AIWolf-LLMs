import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as path from "node:path"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { createGateway } from "./socket/gateway"
import { getOrCreateGame, getGameMetrics } from "./runtime"
import { assignRoles } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"
import { runAISimulation } from "./ai-simulation"

// Load .env
try {
  const envFile = readFileSync(".env", "utf-8")
  for (const line of envFile.split("\n")) {
    const [k, ...v] = line.split("=")
    if (k && v.length && !k.startsWith("#")) process.env[k!.trim()] = v.join("=").trim()
  }
} catch { /* .env not found, use system env */ }

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
const IS_DEEPSEEK = process.env.OPENAI_PROVIDER === "deepseek" || DEFAULT_BASE_URL.includes("deepseek") || DEFAULT_MODEL.startsWith("deepseek")
const THINKING_ENABLED = process.env.AI_THINKING_ENABLED ? process.env.AI_THINKING_ENABLED === "true" : DEFAULT_MODEL === "deepseek-v4-flash"
const REASONING_EFFORT = process.env.AI_REASONING_EFFORT === "max" ? "max" as const : "high" as const

const app = Fastify({ logger: false })
await app.register(cors, { origin: true })
const io = createGateway(app.server)

// REST
app.post("/api/rooms", async (_req, reply) => {
  const gameId = uuidv7()
  getOrCreateGame(gameId)
  return reply.send({ roomCode: gameId.slice(0, 8), gameId })
})

app.post("/api/rooms/:gameId/start", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const runtime = getOrCreateGame(gameId)
  runtime.autoPlay = true

  const config = {
    roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
    minPlayers: 6, maxPlayers: 6,
    rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" } as const,
    timeouts: { speech: 180, vote: 15, night: 15 },
  }

  const state = runtime.getState()
  const assigned = assignRoles(state.players, config, Date.now())

  // Respond immediately, then start the game loop
  reply.send({ started: true, gameId })

  await runtime.dispatch({
    id: uuidv7(), version: "1.0", type: "role:assign_batch",
    gameId, actorId: "system", timestamp: Date.now(),
    payload: { assignments: assigned },
  })
  await runtime.dispatch({
    id: uuidv7(), version: "1.0", type: "phase:advance",
    gameId, actorId: "system", timestamp: Date.now(),
    payload: { to: "ROLE_ASSIGNMENT", round: 1 },
  })
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

app.post("/api/simulate", async (req, reply) => {
  const hasKey = !!process.env.OPENAI_API_KEY
  const body = req.body as { count?: number } | undefined
  const count = Math.min(body?.count ?? 10, 50)

  const config = hasKey ? {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    provider: IS_DEEPSEEK ? "deepseek" as const : "openai-compatible" as const,
    thinking: {
      enabled: THINKING_ENABLED,
      effort: REASONING_EFFORT,
    },
  } : undefined

  const results = await runAISimulation(count, config)
  return reply.send({ count, results })
})

app.get("/api/simulate/results", async (_req, reply) => {
  const fs = await import("node:fs")
  const indexPath = ".data/games/index.json"
  if (fs.existsSync(indexPath)) {
    return reply.send(JSON.parse(fs.readFileSync(indexPath, "utf-8")))
  }
  return reply.send({ results: [] })
})

app.get("/api/config", async (_req, reply) => {
  const hasKey = !!process.env.OPENAI_API_KEY
  return reply.send({
    aiEnabled: hasKey,
    model: DEFAULT_MODEL,
    provider: IS_DEEPSEEK ? "deepseek" : "openai-compatible",
    thinkingEnabled: THINKING_ENABLED,
    reasoningEffort: REASONING_EFFORT,
    mode: hasKey ? "LLM" : "rule-based (no API key configured)",
    hint: hasKey ? "" : "Set OPENAI_API_KEY env var to enable LLM AI",
  })
})

// ── Data root (project root, works regardless of CWD) ──
const dataRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

// ── Log APIs ──

app.get("/api/logs/games", async (_req, reply) => {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const gamesDir = path.join(dataRoot, ".data", "games")
  const allGames: Record<string, unknown>[] = []

  if (!fs.existsSync(gamesDir)) return reply.send({ games: [] })

  for (const dir of fs.readdirSync(gamesDir)) {
    const indexPath = path.join(gamesDir, dir, "index.json")
    if (!fs.existsSync(indexPath)) continue
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
      for (const r of (index.results ?? [])) {
        allGames.push({ ...r, source: dir })
      }
    } catch { /* skip broken */ }
  }

  allGames.sort((a, b) => (b as Record<string,number>).durationMs - (a as Record<string,number>).durationMs)
  return reply.send({ games: allGames.slice(0, 100) })
})

app.get("/api/logs/games/:gameId", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const fs = await import("node:fs")
  const path = await import("node:path")
  const baseData = path.join(dataRoot, ".data")

  // Find summary file
  const gamesDir = path.join(baseData, "games")
  let summary: Record<string, unknown> | null = null
  if (fs.existsSync(gamesDir)) {
    for (const dir of fs.readdirSync(gamesDir)) {
      for (const f of fs.readdirSync(path.join(gamesDir, dir))) {
        if (f.startsWith(gameId) && f.endsWith(".summary.json")) {
          summary = JSON.parse(fs.readFileSync(path.join(gamesDir, dir, f), "utf-8"))
          break
        }
      }
      if (summary) break
    }
  }

  // Load events
  const events: unknown[] = []
  const eventsDir = path.join(baseData, "events")
  if (fs.existsSync(eventsDir)) {
    for (const f of fs.readdirSync(eventsDir)) {
      if (f.startsWith(gameId) && f.endsWith(".jsonl")) {
        const content = fs.readFileSync(path.join(eventsDir, f), "utf-8")
        for (const line of content.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try { events.push(JSON.parse(trimmed)) } catch { /* skip */ }
        }
        break
      }
    }
  }

  // Load traces — strict gameId match only, no cross-game fallback
  const traces: unknown[] = []
  const tracesDir = path.join(baseData, "traces")
  if (fs.existsSync(tracesDir)) {
    for (const f of fs.readdirSync(tracesDir)) {
      if (f.startsWith(gameId) && f.endsWith(".jsonl")) {
        loadTraceFile(path.join(tracesDir, f), traces)
      }
    }
  }

  return reply.send({ summary, events, traces })
})

app.get("/api/logs/games/:gameId/traces", async (req, reply) => {
  const { gameId } = req.params as { gameId: string }
  const fs = await import("node:fs")
  const path = await import("node:path")
  const traces: unknown[] = []
  const tracesDir = path.join(dataRoot, ".data", "traces")
  if (fs.existsSync(tracesDir)) {
    for (const f of fs.readdirSync(tracesDir)) {
      if (f.startsWith(gameId) && f.endsWith(".jsonl")) {
        const content = fs.readFileSync(path.join(tracesDir, f), "utf-8")
        for (const line of content.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try { traces.push(JSON.parse(trimmed)) } catch { /* skip */ }
        }
        break
      }
    }
  }
  return reply.send({ traces })
})

function loadTraceFile(filePath: string, traces: unknown[]): void {
  try {
    const content = readFileSync(filePath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try { traces.push(JSON.parse(trimmed)) } catch { /* skip */ }
    }
  } catch { /* skip broken file */ }
}

app.listen({ port: PORT }, () => {
  console.log(`[server] http://localhost:${PORT}`)
  if (!process.env.OPENAI_API_KEY) {
    console.log(`[server] ⚠️  No OPENAI_API_KEY set — AI will use rule-based fallback`)
    console.log(`[server]    Set OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL for LLM AI`)
  }
})

export { app, io }

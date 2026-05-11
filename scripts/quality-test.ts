/**
 * 10-game AI quality test — all 6 AI players, DeepSeek LLM, no rule-based fallback.
 * Simulates 6 players playing a real Werewolf game.
 */
import { getOrCreateGame } from "../packages/server/src/runtime"
import { createGame, assignRoles } from "../packages/engine/src/index"
import { v7 as uuidv7 } from "uuid"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env
const envPath = path.join(__dirname, "..", ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("="); if (eq === -1) continue
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
}

const apiKey = process.env.OPENAI_API_KEY!
const config = {
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1",
  model: process.env.OPENAI_MODEL || "deepseek-chat",
}

const GAME_CONFIG = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" } as const,
  timeouts: { speech: 180, vote: 15, night: 15 },
}

const SAVEDIR = ".data/games/quality-test"
fs.mkdirSync(SAVEDIR, { recursive: true })

console.log(`Starting 10-game AI quality test — model: ${config.model}`)
console.log(`Results will be saved to ${SAVEDIR}/\n`)

interface GameRecord {
  gameId: string
  winner: string
  rounds: number
  events: number
  durationS: number
  traceCount: number
  fallbackCount: number
  speechCount: number
  totalTokens: number
  error?: string
  roleAssignments: Record<string, string>
  timeline: string[]
}

const results: GameRecord[] = []

for (let g = 1; g <= 10; g++) {
  const gameId = uuidv7()
  const shortId = gameId.slice(0, 8)
  const startTime = Date.now()
  const timeline: string[] = []

  console.log(`\n── Game ${g}/10 (${shortId}) ──`)

  try {
    const runtime = getOrCreateGame(gameId)
    runtime.autoPlay = true
    runtime.setAIConfig(config)

    const state = createGame(GAME_CONFIG)
    // ALL players are AI (simulating 6 real players)
    for (const pid of Object.keys(state.players)) {
      state.players[pid] = { ...state.players[pid]!, isAI: true }
    }

    const assigned = assignRoles(state.players, GAME_CONFIG, Date.now() + g * 1000)
    const roles: Record<string, string> = {}
    for (const [pid, a] of Object.entries(assigned)) {
      roles[pid] = a.role
    }

    runtime.initState(state)
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

    // Wait for game completion (max 5 min)
    const maxWait = 300_000
    const waitStart = Date.now()
    let lastPhase = ""
    while (!runtime.getState().gameOver && Date.now() - waitStart < maxWait) {
      await new Promise(r => setTimeout(r, 500))
      const st = runtime.getState()
      const phaseLabel = `${st.phase.subPhase} R${st.phase.round}`
      if (phaseLabel !== lastPhase) {
        timeline.push(phaseLabel)
        lastPhase = phaseLabel
      }
    }

    const final = runtime.getState()
    const durS = ((Date.now() - startTime) / 1000).toFixed(1)

    // Read traces
    const traceDir = ".data/traces"
    let traceCount = 0, fallbackCount = 0, totalTokens = 0, speechCount = 0
    if (fs.existsSync(traceDir)) {
      for (const f of fs.readdirSync(traceDir)) {
        if (f.startsWith(gameId) && f.endsWith(".jsonl")) {
          const lines = fs.readFileSync(path.join(traceDir, f), "utf-8").split("\n").filter(Boolean)
          for (const line of lines) {
            try {
              const t = JSON.parse(line)
              traceCount++
              if (t.fallbackUsed) fallbackCount++
              totalTokens += t.usage?.totalTokens ?? 0
              if (t.task === "speech") speechCount++
            } catch { /* skip */ }
          }
        }
      }
    }

    const winner = final.gameOver?.winner ?? "unknown"
    const record: GameRecord = {
      gameId: shortId,
      winner,
      rounds: final.phase.round,
      events: final.lastEventSeq,
      durationS: Number(durS),
      traceCount,
      fallbackCount,
      speechCount,
      totalTokens,
      roleAssignments: roles,
      timeline,
    }

    results.push(record)
    console.log(`  ✅ ${winner}胜 | ${record.rounds}轮 ${record.events}事件 ${durS}s | traces:${traceCount} fallback:${fallbackCount} speeches:${speechCount} tokens:${totalTokens}`)

    // Save summary
    fs.writeFileSync(path.join(SAVEDIR, `${shortId}.json`), JSON.stringify(record, null, 2), "utf-8")

  } catch (err) {
    const errMsg = (err as Error).message
    console.log(`  ❌ FAILED: ${errMsg}`)
    results.push({
      gameId: shortId,
      winner: "error",
      rounds: 0, events: 0, durationS: 0,
      traceCount: 0, fallbackCount: 0, speechCount: 0, totalTokens: 0,
      error: errMsg,
      roleAssignments: {},
      timeline: [],
    })
  }
}

// Aggregate report
const success = results.filter(r => !r.error)
const failed = results.filter(r => r.error)
console.log(`\n${"=".repeat(50)}`)
console.log(`10-game quality report`)
console.log(`${"=".repeat(50)}`)
console.log(`Successful: ${success.length}/10`)
console.log(`Failed: ${failed.length}/10`)
if (success.length > 0) {
  console.log(`Winner distribution: wolf=${success.filter(r => r.winner === "wolf").length} good=${success.filter(r => r.winner === "good").length}`)
  console.log(`Avg rounds: ${(success.reduce((s,r) => s + r.rounds, 0) / success.length).toFixed(1)}`)
  console.log(`Avg events: ${(success.reduce((s,r) => s + r.events, 0) / success.length).toFixed(0)}`)
  console.log(`Avg duration: ${(success.reduce((s,r) => s + r.durationS, 0) / success.length).toFixed(1)}s`)
  console.log(`Avg traces/game: ${(success.reduce((s,r) => s + r.traceCount, 0) / success.length).toFixed(0)}`)
  console.log(`Avg speeches/game: ${(success.reduce((s,r) => s + r.speechCount, 0) / success.length).toFixed(0)}`)
  console.log(`Total fallback calls: ${success.reduce((s,r) => s + r.fallbackCount, 0)} (${(success.reduce((s,r) => s + r.fallbackCount, 0) / Math.max(1, success.reduce((s,r) => s + r.traceCount, 0)) * 100).toFixed(1)}%)`)
  console.log(`Total tokens: ${success.reduce((s,r) => s + r.totalTokens, 0)}`)

  // Individual game results
  console.log(`\nPer-game:`)
  for (const r of success) {
    console.log(`  ${r.gameId} ${r.winner === "wolf" ? "🐺" : "🏆"} ${r.winner} ${r.rounds}R ${r.events}E ${r.durationS}s traces:${r.traceCount} fb:${r.fallbackCount} sp:${r.speechCount}`)
  }
}

// Save index
fs.writeFileSync(path.join(SAVEDIR, "index.json"), JSON.stringify({
  timestamp: new Date().toISOString(),
  config: { model: config.model, baseURL: config.baseURL },
  summary: {
    total: 10,
    successful: success.length,
    failed: failed.length,
    wolfWins: success.filter(r => r.winner === "wolf").length,
    goodWins: success.filter(r => r.winner === "good").length,
    avgRounds: success.length > 0 ? success.reduce((s,r) => s + r.rounds, 0) / success.length : 0,
    avgDurationS: success.length > 0 ? success.reduce((s,r) => s + r.durationS, 0) / success.length : 0,
    totalTraces: success.reduce((s,r) => s + r.traceCount, 0),
    totalFallbacks: success.reduce((s,r) => s + r.fallbackCount, 0),
    totalSpeeches: success.reduce((s,r) => s + r.speechCount, 0),
    totalTokens: success.reduce((s,r) => s + r.totalTokens, 0),
  },
  results,
}, null, 2), "utf-8")

console.log(`\nResults saved to ${SAVEDIR}/index.json`)

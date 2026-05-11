import { getOrCreateGame } from "../packages/server/src/runtime"
import { createGame, assignRoles } from "../packages/engine/src/index"
import { v7 as uuidv7 } from "uuid"
import * as fs from "node:fs"
import { fileURLToPath } from "node:url"
import * as path from "node:path"

// Load .env manually
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env")
const envContent = fs.readFileSync(envPath, "utf-8")
for (const line of envContent.split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const eqIdx = trimmed.indexOf("=")
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const value = trimmed.slice(eqIdx + 1).trim()
  if (!process.env[key]) process.env[key] = value
}

const apiKey = process.env.OPENAI_API_KEY!
const config = {
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
}
console.log(`Starting AI simulation — model: ${config.model}, baseURL: ${config.baseURL}`)

const start = Date.now()
const gameId = uuidv7()
const runtime = getOrCreateGame(gameId)
runtime.autoPlay = true
runtime.setAIConfig(config)

const state = createGame({
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
  timeouts: { speech: 180, vote: 15, night: 15 },
})

for (const pid of Object.keys(state.players)) {
  state.players[pid] = { ...state.players[pid]!, isAI: true }
}

const assigned = assignRoles(state.players, {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
  timeouts: { speech: 180, vote: 15, night: 15 },
}, Date.now())

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

// Wait
const maxWait = 90000
const startWait = Date.now()
while (!runtime.getState().gameOver && Date.now() - startWait < maxWait) {
  await new Promise(r => setTimeout(r, 500))
}

const finalState = runtime.getState()
const durationMs = Date.now() - start
console.log(`\nDone in ${durationMs}ms`)
console.log(`Winner: ${finalState.gameOver?.winner}, Rounds: ${finalState.phase.round}, Events: ${finalState.lastEventSeq}`)
console.log(`Phase: ${finalState.phase.subPhase}`)
console.log("Players:")
for (const [id, p] of Object.entries(finalState.players)) {
  console.log(`  ${id}: ${p.role}/${p.faction} alive=${p.isAlive}`)
}

// Check traces
const traceDir = ".data/traces"
fs.mkdirSync(traceDir, { recursive: true })
const traceFiles = fs.readdirSync(traceDir)
console.log(`\nTrace files: ${traceFiles.length}`)
if (traceFiles.length > 0) {
  const latest = traceFiles.sort().pop()!
  const content = fs.readFileSync(path.join(traceDir, latest), "utf-8").split("\n").filter(Boolean)
  for (const line of content.slice(0, 5)) {
    const t = JSON.parse(line)
    console.log(`  [${t.playerId}] ${t.task} — fallback=${t.fallbackUsed} latency=${t.latencyMs}ms parseError=${t.parseError || "none"}`)
  }
  console.log(`  ... (${content.length} total traces)`)
}

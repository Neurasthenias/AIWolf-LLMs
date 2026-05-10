/**
 * 10-game AI quality test — all 6 AI players, DeepSeek LLM.
 * Run from project root: pnpm --filter @aiwolf/server exec tsx quality-test.ts
 * Or: cd packages/server && pnpm tsx quality-test.ts
 */
import { runAISimulation } from "./src/ai-simulation"
import * as fs from "node:fs"

const config = {
  apiKey: "sk-8005f49d1ba6429da3e77203fc5ebe90",
  baseURL: "https://api.deepseek.com/v1",
  model: "deepseek-v4-flash",
}

const SAVEDIR = "../../.data/games/quality-test"
fs.mkdirSync(SAVEDIR, { recursive: true })

console.log(`10-game AI quality test — model: ${config.model}\n`)

const startAll = Date.now()

const GAME_COUNT = 10
const results = await runAISimulation(GAME_COUNT, config, SAVEDIR)

const durAll = ((Date.now() - startAll) / 1000).toFixed(1)
const success = results.filter(r => !r.error)
const failed = results.filter(r => r.error)

console.log(`\n${"=".repeat(50)}`)
console.log(`10-game quality report (${durAll}s total)`)
console.log(`${"=".repeat(50)}`)
console.log(`Successful: ${success.length}/10 | Failed: ${failed.length}/10`)
if (success.length > 0) {
  console.log(`Winner: wolf=${success.filter(r => r.winner==="wolf").length} good=${success.filter(r => r.winner==="good").length}`)
  console.log(`Avg rounds: ${(success.reduce((s,r)=>s+r.rounds,0)/success.length).toFixed(1)}`)
  console.log(`Avg events: ${(success.reduce((s,r)=>s+r.totalEvents,0)/success.length).toFixed(0)}`)
  console.log(`Avg duration: ${(success.reduce((s,r)=>s+r.durationMs,0)/success.length/1000).toFixed(1)}s`)
  console.log()

  // Check trace quality
  const traceDir = "../../.data/traces"
  let totalTraces = 0, totalFallback = 0, totalSpeeches = 0, totalTokens = 0
  if (fs.existsSync(traceDir)) {
    for (const f of fs.readdirSync(traceDir)) {
      if (!f.endsWith(".jsonl")) continue
      try {
        for (const line of fs.readFileSync(`${traceDir}/${f}`, "utf-8").split("\n").filter(Boolean)) {
          const t = JSON.parse(line)
          totalTraces++
          if (t.fallbackUsed) totalFallback++
          if (t.task === "speech") totalSpeeches++
          totalTokens += t.usage?.totalTokens ?? 0
        }
      } catch {}
    }
  }
  console.log(`AI quality:`)
  console.log(`  Total traces: ${totalTraces} (${(totalTraces/success.length).toFixed(0)}/game)`)
  console.log(`  Fallbacks: ${totalFallback} (${(totalFallback/Math.max(1,totalTraces)*100).toFixed(1)}%)`)
  console.log(`  Speeches: ${totalSpeeches} (${(totalSpeeches/success.length).toFixed(0)}/game)`)
  console.log(`  Total tokens: ${totalTokens}`)

  console.log(`\nPer-game:`)
  for (const r of success) {
    console.log(`  ${r.shortId ?? r.gameId.slice(0,8)} ${r.winner==="wolf"?"🐺":"🏆"}${r.winner} ${r.rounds}R ${r.totalEvents}E ${(r.durationMs/1000).toFixed(1)}s`)
  }
}

for (const r of failed) {
  console.log(`  ❌ ${r.shortId ?? r.gameId.slice(0,8)}: ${r.error}`)
}

/**
 * CLI: Run 10 AI-powered Werewolf games and save results.
 * Usage: npx tsx scripts/run-ai-games.ts [count]
 */

import { readFileSync } from "node:fs"

// Load .env
try {
  const envFile = readFileSync(".env", "utf-8")
  for (const line of envFile.split("\n")) {
    const [k, ...v] = line.split("=")
    if (k && v.length && !k.startsWith("#")) process.env[k!.trim()] = v.join("=").trim()
  }
} catch { /* .env not found */ }

async function main() {
  const count = parseInt(process.argv[2] ?? "10", 10)

  const hasKey = !!process.env.OPENAI_API_KEY
  console.log(`AI mode: ${hasKey ? `LLM (${process.env.OPENAI_MODEL || "gpt-4o-mini"})` : "rule-based (no API key)"}`)
  console.log(`Running ${count} games...`)

  const { runAISimulation } = await import("../packages/server/src/ai-simulation")

  const config = hasKey ? {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  } : undefined

  const results = await runAISimulation(count, config)

  console.log(`\nDone. ${results.filter(r => !r.error).length}/${results.length} games completed.`)
  console.log(`Winner distribution: good=${results.filter(r => r.winner === "good").length} wolf=${results.filter(r => r.winner === "wolf").length}`)
}

main().catch(err => {
  console.error("Fatal:", err)
  process.exit(1)
})

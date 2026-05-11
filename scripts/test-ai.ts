/** Quick test: verify AI API key works by running 1 game */
import { readFileSync } from "node:fs"

try {
  const envFile = readFileSync(".env", "utf-8")
  for (const line of envFile.split("\n")) {
    const [k, ...v] = line.split("=")
    if (k && v.length && !k.startsWith("#")) process.env[k!.trim()] = v.join("=").trim()
  }
} catch {}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { console.log("No API key configured. Skipping AI test."); return }

  console.log(`Testing AI with model: ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`)

  const { runAISimulation } = await import("../packages/server/src/ai-simulation")

  const config = {
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  }

  console.log("Running 1 AI-powered game...")
  const results = await runAISimulation(1, config, ".data/games/ai-test")

  if (results[0]?.error) {
    console.log(`AI game FAILED: ${results[0].error}`)
  } else {
    console.log(`AI game SUCCESS: winner=${results[0]?.winner} rounds=${results[0]?.rounds} events=${results[0]?.totalEvents}`)
  }
}

main().catch(err => console.error("Fatal:", err.message))

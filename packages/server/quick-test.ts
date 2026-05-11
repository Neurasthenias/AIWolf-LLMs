import { runAISimulation } from "./src/ai-simulation"

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for quick-test.ts")
  process.exit(1)
}

const baseURL = process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1"
const model = process.env.OPENAI_MODEL || "deepseek-chat"
const isDeepSeek = process.env.OPENAI_PROVIDER === "deepseek" || baseURL.includes("deepseek") || model.startsWith("deepseek")
const config = {
  apiKey: process.env.OPENAI_API_KEY,
  baseURL,
  model,
  provider: isDeepSeek ? "deepseek" as const : "openai-compatible" as const,
  thinking: {
    enabled: process.env.AI_THINKING_ENABLED ? process.env.AI_THINKING_ENABLED === "true" : model === "deepseek-v4-flash",
    effort: process.env.AI_REASONING_EFFORT === "max" ? "max" as const : "high" as const,
  },
}

console.log("Starting 1-game AI test...")
const start = Date.now()

try {
  const results = await runAISimulation(1, config, "../../.data/games/quick-test")
  console.log(`Done in ${Date.now() - start}ms`)
  console.log(JSON.stringify(results[0], null, 2))
} catch (err) {
  console.error("FAILED:", (err as Error).message)
  process.exit(1)
}

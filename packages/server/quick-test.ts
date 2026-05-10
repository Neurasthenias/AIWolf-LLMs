import { runAISimulation } from "./src/ai-simulation"

const config = {
  apiKey: "sk-8005f49d1ba6429da3e77203fc5ebe90",
  baseURL: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
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

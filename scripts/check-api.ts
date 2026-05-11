import { readFileSync } from "node:fs"
import OpenAI from "openai"

// Load .env
try {
  const envFile = readFileSync(".env", "utf-8")
  for (const line of envFile.split("\n")) {
    const [k, ...v] = line.split("=")
    if (k && v.length && !k.startsWith("#")) process.env[k!.trim()] = v.join("=").trim()
  }
} catch {}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"

  if (!apiKey) {
    console.log("No OPENAI_API_KEY set. AI mode: rule-based only.")
    process.exit(0)
  }

  console.log(`Testing API key: ${apiKey.slice(0, 8)}... at ${baseURL} model=${model}`)

  const client = new OpenAI({ apiKey, baseURL, maxRetries: 1, timeout: 15000 })

  try {
    const start = Date.now()
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say 'hello' in exactly Chinese" }],
      max_tokens: 20,
    })
    const ms = Date.now() - start
    console.log(`API OK: ${res.choices[0]?.message?.content} (${ms}ms, ${res.usage?.total_tokens} tokens)`)
  } catch (err) {
    console.log(`API FAIL: ${(err as Error).message}`)
  }
}

main()

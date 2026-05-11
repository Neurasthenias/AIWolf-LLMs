import OpenAI from "openai"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

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

const endpoints = [
  { name: "DeepSeek", url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "SiliconFlow", url: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  { name: "阿里百炼", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { name: "月之暗面", url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { name: "智谱", url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { name: "零一万物", url: "https://api.lingyiwanwu.com/v1", model: "yi-large" },
]

for (const ep of endpoints) {
  const client = new OpenAI({ apiKey, baseURL: ep.url, timeout: 8000, maxRetries: 0 })
  const start = Date.now()
  try {
    const response = await client.chat.completions.create({
      model: ep.model,
      max_tokens: 20,
      messages: [{ role: "user", content: "Say hi." }],
    })
    const text = response.choices[0]?.message?.content?.trim()
    console.log(`[OK] ${ep.name} (${ep.model}) ${Date.now() - start}ms => "${text}"`)
  } catch (err) {
    const e = err as any
    const code = e.status || e.code || "?"
    console.log(`[${code}] ${ep.name}: ${e.message?.slice(0, 80)}`)
  }
}

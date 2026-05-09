import OpenAI from "openai"
import { z } from "zod"

/**
 * 用户配置的 AI Provider。
 * 在最终产品中，用户自行填入 API Key、Base URL、Model。
 */
export interface AIProviderConfig {
  apiKey: string
  baseURL?: string
  model: string
  temperature?: number
  maxTokens?: number
}

export const AIIntentSchema = z.object({
  action: z.object({
    type: z.enum(["vote", "wolf_kill", "seer_check", "witch_save", "witch_poison", "self_explode", "skip"]),
    targetId: z.string().nullable(),
    reason: z.string().optional(),
  }),
  speech: z.object({
    content: z.string().min(10).max(500),
    tone: z.string().optional(),
  }).optional(),
})

export type AIIntent = z.infer<typeof AIIntentSchema>

export class AIProvider {
  private client: OpenAI
  private model: string
  private temperature: number
  private maxTokens: number

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? "https://api.openai.com/v1",
      maxRetries: 2,
      timeout: 60000,
    })
    this.model = config.model
    this.temperature = config.temperature ?? 0.7
    this.maxTokens = config.maxTokens ?? 1024
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<{
    raw: string
    intent: AIIntent | null
    parseError?: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    latencyMs: number
  }> {
    const start = Date.now()

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    })

    const latencyMs = Date.now() - start
    const raw = response.choices[0]?.message?.content ?? ""
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    }

    // Parse structured output
    let intent: AIIntent | null = null
    let parseError: string | undefined
    try {
      const parsed = JSON.parse(raw)
      intent = AIIntentSchema.parse(parsed)
    } catch (err) {
      parseError = (err as Error).message
    }

    return { raw, intent, parseError, usage, latencyMs }
  }
}

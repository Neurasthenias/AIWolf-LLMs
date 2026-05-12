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
  provider?: "deepseek" | "openai-compatible"
  thinking?: {
    enabled: boolean
    effort?: "high" | "max"
  }
  temperature?: number
  maxTokens?: number
}

export interface AIRequestOptions {
  fastMode?: boolean
  maxTokens?: number
  thinkingEnabled?: boolean
  reasoningEffort?: "high" | "max"
}

export const AIIntentSchema = z.object({
  analysis: z.object({
    knownFacts: z.array(z.string()).default([]),
    privateFacts: z.array(z.string()).default([]),
    suspicions: z.array(z.object({
      playerId: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string(),
    })).default([]),
    strategy: z.string().default(""),
    risk: z.string().default(""),
  }).optional(),
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

const ACTION_CN_MAP: Record<string, string> = {
  "投票": "vote", "投": "vote",
  "击杀": "wolf_kill", "杀": "wolf_kill", "刀": "wolf_kill",
  "查验": "seer_check", "查": "seer_check",
  "救人": "witch_save", "救": "witch_save", "使用解药": "witch_save",
  "毒杀": "witch_poison", "毒": "witch_poison", "使用毒药": "witch_poison",
  "自爆": "self_explode",
  "跳过": "skip", "空过": "skip",
}

function normalizeActionType(type: string): string {
  return ACTION_CN_MAP[type] ?? type
}

export class AIProvider {
  private client: OpenAI
  private model: string
  private provider?: AIProviderConfig["provider"]
  private thinking?: AIProviderConfig["thinking"]
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
    this.provider = config.provider
    this.thinking = config.thinking
    this.temperature = config.temperature ?? 0.7
    this.maxTokens = config.maxTokens ?? 4096
  }

  async generate(systemPrompt: string, userPrompt: string, options?: AIRequestOptions): Promise<{
    raw: string
    reasoning: string
    intent: AIIntent | null
    parseError?: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    meta: {
      model: string
      provider: string
      thinkingEnabled: boolean
      reasoningEffort?: "high" | "max"
      reasoningContentLength: number
      finishReason?: string
    }
    latencyMs: number
  }> {
    const start = Date.now()
    const thinkingEnabled = options?.thinkingEnabled !== undefined
      ? options.thinkingEnabled
      : !!this.thinking?.enabled

    const maxTokens = options?.maxTokens ?? this.maxTokens

    const request: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }

    if (thinkingEnabled) {
      request.reasoning_effort = options?.reasoningEffort ?? this.thinking?.effort ?? "high"
      request.thinking = { type: "enabled" }
    } else {
      request.temperature = this.temperature
    }

    const reasoningEffort = thinkingEnabled
      ? (request.reasoning_effort as string | undefined)
      : undefined

    const response = await this.client.chat.completions.create(request as unknown as Parameters<typeof this.client.chat.completions.create>[0]) as any

    const latencyMs = Date.now() - start
    const msg = response.choices[0]?.message
    const raw = (msg as Record<string, unknown> | null | undefined)?.content as string ?? ""
    const reasoning = (msg as Record<string, unknown> | null | undefined)?.reasoning_content as string ?? ""
    const finishReason = response.choices[0]?.finish_reason ?? undefined
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    }
    const meta = {
      model: this.model,
      provider: this.provider ?? "openai-compatible",
      thinkingEnabled,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      reasoningContentLength: reasoning.length,
      ...(finishReason ? { finishReason } : {}),
    }

    // Parse structured output with Chinese action normalization
    let intent: AIIntent | null = null
    let parseError: string | undefined
    try {
      const parsed = JSON.parse(raw)
      // Normalize Chinese action types to English
      if (parsed?.action?.type) {
        parsed.action.type = normalizeActionType(parsed.action.type)
      }
      intent = AIIntentSchema.parse(parsed)
    } catch (err) {
      parseError = (err as Error).message
    }

    return {
      raw,
      intent,
      ...(parseError ? { parseError } : {}),
      usage,
      latencyMs,
      reasoning,
      meta,
    }
  }
}

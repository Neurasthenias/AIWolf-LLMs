import type { GameState, Command } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"
import { AIProvider, type AIProviderConfig, type AIIntent } from "./providers/openai"
import { buildContext } from "./context/builder"
import * as fs from "node:fs"

export interface AITrace {
  gameId: string
  playerId: string
  task: string
  timestamp: number
  context: Record<string, unknown>
  rawResponse: string
  parsedIntent: AIIntent | null
  parseError?: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  latencyMs: number
  fallbackUsed: boolean
}

/**
 * AI Pipeline — MVP: Context → Speak/Act
 */
export class AIPipeline {
  private provider: AIProvider
  private traceDir: string

  constructor(config: AIProviderConfig, traceDir = ".data/traces") {
    this.provider = new AIProvider(config)
    this.traceDir = traceDir
    fs.mkdirSync(traceDir, { recursive: true })
  }

  async generateAction(
    state: GameState,
    playerId: string,
    task: "speech" | "vote" | "wolf_kill" | "seer_check" | "witch_action" | "last_words"
  ): Promise<{ command: Command; trace: AITrace }> {
    const context = buildContext(state, playerId, task)
    const result = await this.provider.generate(context.systemPrompt, context.userPrompt)

    // Build trace
    const trace: AITrace = {
      gameId: state.gameId,
      playerId,
      task,
      timestamp: Date.now(),
      context: { systemPrompt: context.systemPrompt, userPrompt: context.userPrompt },
      rawResponse: result.raw,
      parsedIntent: result.intent,
      parseError: result.parseError,
      usage: result.usage,
      latencyMs: result.latencyMs,
      fallbackUsed: false,
    }

    // Fallback to rule-based if parse failed
    if (!result.intent) {
      trace.fallbackUsed = true
      const fallbackIntent = ruleBasedFallback(state, playerId, task)
      result.intent = fallbackIntent  // mutate for command generation
    }

    // Convert Intent to Command
    const command = intentToCommand(state.gameId, playerId, result.intent, task)
    this.saveTrace(trace)
    return { command, trace }
  }

  private saveTrace(trace: AITrace): void {
    const fp = `${this.traceDir}/${trace.gameId}.jsonl`
    fs.appendFileSync(fp, JSON.stringify(trace) + "\n", "utf-8")
  }
}

// ── Intent → Command ──

function intentToCommand(gameId: string, playerId: string, intent: AIIntent, task: string): Command {
  const base = {
    id: uuidv7(),
    version: "1.0",
    gameId,
    actorId: playerId,
    timestamp: Date.now(),
  }

  if (task === "speech" || task === "last_words") {
    return {
      ...base,
      type: "speech:submit",
      payload: { content: intent.speech?.content ?? "过" },
    }
  }

  if (intent.action.type === "vote") {
    return {
      ...base,
      type: "vote:cast",
      payload: { targetId: intent.action.targetId },
    }
  }

  if (intent.action.type === "wolf_kill") {
    return {
      ...base,
      type: "night:wolf_kill",
      payload: { targetId: intent.action.targetId, reason: intent.action.reason ?? "" },
    }
  }

  if (intent.action.type === "seer_check") {
    return {
      ...base,
      type: "night:seer_check",
      payload: { targetId: intent.action.targetId, result: "unknown" },
    }
  }

  if (intent.action.type === "witch_save" || intent.action.type === "witch_poison") {
    return {
      ...base,
      type: "night:witch_action",
      payload: {
        saveTargetId: intent.action.type === "witch_save" ? intent.action.targetId : undefined,
        poisonTargetId: intent.action.type === "witch_poison" ? intent.action.targetId : undefined,
      },
    }
  }

  // Default: skip
  return { ...base, type: "vote:cast", payload: { targetId: null } }
}

// ── Rule-based Fallback ──

function ruleBasedFallback(state: GameState, playerId: string, task: string): AIIntent {
  const player = state.players[playerId]!
  const alive = Object.values(state.players).filter(p => p.isAlive && p.id !== playerId)
  const randomTarget = alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)]! : null

  switch (task) {
    case "wolf_kill": {
      const goodTargets = alive.filter(p => p.faction === "good")
      const target = goodTargets.length > 0 ? goodTargets[Math.floor(Math.random() * goodTargets.length)]! : randomTarget
      return {
        action: { type: "wolf_kill", targetId: target?.id ?? null, reason: "随机选择" },
        speech: { content: "（规则引擎兜底）", tone: "neutral" },
      }
    }
    case "seer_check": {
      const unchecked = alive.filter(p => p.id !== playerId)
      const target = unchecked.length > 0 ? unchecked[Math.floor(Math.random() * unchecked.length)]! : null
      return {
        action: { type: "seer_check", targetId: target?.id ?? null, reason: "随机查验" },
      }
    }
    case "witch_action": {
      return { action: { type: "skip", targetId: null } }
    }
    case "vote": {
      const wolves = alive.filter(p => p.faction === "wolf")
      const target = wolves.length > 0 ? wolves[Math.floor(Math.random() * wolves.length)]! : randomTarget
      return {
        action: { type: "vote", targetId: target?.id ?? null, reason: "怀疑是狼" },
        speech: { content: "我怀疑" + (target?.id ?? "某人") + "是狼。", tone: "moderate" },
      }
    }
    case "speech": {
      return {
        action: { type: "skip", targetId: null },
        speech: { content: "这一轮信息量比较大，我需要消化一下。目前我倾向于跟着大家的分析走。", tone: "moderate" },
      }
    }
    case "last_words": {
      return {
        action: { type: "skip", targetId: null },
        speech: { content: "我被淘汰了，好人加油。", tone: "moderate" },
      }
    }
    default:
      return { action: { type: "skip", targetId: null } }
  }
}

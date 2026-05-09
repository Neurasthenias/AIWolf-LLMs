import type { GameEvent } from "@aiwolf/shared/types"

export interface AgentMemory {
  // 对其他玩家的信念
  beliefs: Record<string, PlayerBelief>

  // 自己的重要声明（需要保持一致）
  claims: Claim[]

  // 关键事件时间线
  timeline: MemoryEvent[]

  // 策略演进
  strategyHistory: StrategyRecord[]
}

export interface PlayerBelief {
  suspectedRole: string        // 怀疑是什么身份
  confidence: number           // 0-10 确信度
  trustLevel: number           // -10(极度怀疑) ~ 10(完全信任)
  notes: string[]              // 支持此判断的观察
  lastUpdated: number          // 最后更新时间戳
}

export interface Claim {
  type: "role_claim" | "information_claim" | "accusation" | "defense"
  content: string              // 我说了什么
  targetPlayerId?: string      // 指向谁
  timestamp: number
}

export interface MemoryEvent {
  type: string                 // 事件类型
  description: string          // 人类可读描述
  round: number
  timestamp: number
}

export interface StrategyRecord {
  strategy: string
  phase: string
  reason: string
  timestamp: number
}

export function createMemory(): AgentMemory {
  return {
    beliefs: {},
    claims: [],
    timeline: [],
    strategyHistory: [],
  }
}

/** 从事件流更新 Memory */
export function updateMemory(memory: AgentMemory, event: GameEvent, playerId: string): AgentMemory {
  const updated = { ...memory, timeline: [...memory.timeline] }

  switch (event.type) {
    case "speech:completed": {
      const { speakerId, content } = event.payload as { playerId: string; fullText: string; duration: number }
      const pid = event.payload.playerId as string
      updated.timeline.push({
        type: "speech",
        description: `${pid}发言: "${(content as string).slice(0, 50)}..."`,
        round: (event.payload as { round?: number }).round ?? 0,
        timestamp: event.timestamp,
      })
      break
    }
    case "death:player_died": {
      const { playerId: deadId, cause } = event.payload as { playerId: string; cause: string }
      updated.timeline.push({
        type: "death",
        description: `${deadId}死亡(${cause})`,
        round: (event.payload as { round: number }).round,
        timestamp: event.timestamp,
      })
      break
    }
    case "vote:revealed": {
      const votes = event.payload.votes as { playerId: string; targetId: string | null }[]
      updated.timeline.push({
        type: "vote",
        description: `投票结果: ${votes.map(v => `${v.playerId}→${v.targetId ?? "弃"}`).join(", ")}`,
        round: 0, timestamp: event.timestamp,
      })
      break
    }
    case "role:assigned": {
      const assigned = event.payload as { playerId: string; role: string }
      if (assigned.playerId === playerId) {
        updated.timeline.push({
          type: "role",
          description: `我获得了身份: ${assigned.role}`,
          round: 0, timestamp: event.timestamp,
        })
      }
      break
    }
    case "role:seer_result": {
      const result = event.payload as { playerId: string; targetId: string; result: string }
      if (result.playerId === playerId) {
        updated.timeline.push({
          type: "investigation",
          description: `查验${result.targetId}: ${result.result}`,
          round: 0, timestamp: event.timestamp,
        })
        if (!updated.beliefs[result.targetId]) {
          updated.beliefs[result.targetId] = createBelief()
        }
        updated.beliefs[result.targetId]!.suspectedRole = result.result === "wolf" ? "werewolf" : "villager"
        updated.beliefs[result.targetId]!.confidence = 10
        updated.beliefs[result.targetId]!.notes.push(`预言家查验确认: ${result.result}`)
        updated.beliefs[result.targetId]!.lastUpdated = event.timestamp
      }
      break
    }
    case "role:teammates_revealed": {
      const { playerId: mateId, teammates } = event.payload as { playerId: string; teammates: string[] }
      if (mateId === playerId) {
        updated.timeline.push({
          type: "teammates",
          description: `我的同伴: ${teammates.join(", ")}`,
          round: 0, timestamp: event.timestamp,
        })
        for (const tid of teammates) {
          if (!updated.beliefs[tid]) updated.beliefs[tid] = createBelief()
          updated.beliefs[tid]!.suspectedRole = "werewolf"
          updated.beliefs[tid]!.trustLevel = 10
          updated.beliefs[tid]!.confidence = 10
          updated.beliefs[tid]!.notes.push("这是我的狼同伴")
        }
      }
      break
    }
  }

  return updated
}

function createBelief(): PlayerBelief {
  return { suspectedRole: "unknown", confidence: 0, trustLevel: 0, notes: [], lastUpdated: Date.now() }
}

/** 格式化 Memory 为 Prompt 可注入文本 */
export function memoryToPrompt(memory: AgentMemory, playerId: string): string {
  const lines: string[] = []

  if (memory.timeline.length > 0) {
    lines.push("【我的记忆】")
    for (const e of memory.timeline.slice(-10)) {
      lines.push(`- D${e.round}: ${e.description}`)
    }
  }

  if (Object.keys(memory.beliefs).length > 0) {
    lines.push("\n【我对其他玩家的判断】")
    for (const [pid, belief] of Object.entries(memory.beliefs)) {
      if (pid === playerId) continue
      const trustIcon = belief.trustLevel > 5 ? "✅" : belief.trustLevel > 0 ? "👍" : belief.trustLevel < -5 ? "🔴" : "🤔"
      lines.push(`- ${pid}: ${trustIcon} 怀疑是${belief.suspectedRole}(确信度${belief.confidence}/10) ${belief.notes.slice(-2).join("; ")}`)
    }
  }

  if (memory.claims.length > 0) {
    lines.push("\n【我说过的重要的话（必须保持一致）】")
    for (const c of memory.claims.slice(-5)) {
      lines.push(`- ${c.type}: ${c.content}`)
    }
  }

  return lines.join("\n")
}

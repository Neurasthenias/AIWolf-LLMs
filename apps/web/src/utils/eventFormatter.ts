import type { GameEvent } from "../types"

const EVENT_LABELS: Record<string, string> = {
  "role:assigned": "身份已发放",
  "role:teammates_revealed": "队友已确认",
  "role:acknowledged": "身份已确认",
  "phase:transitioned": "阶段切换",
  "wolf:proposal_submitted": "狼人提交击杀建议",
  "wolf:proposal_resolved": "狼人达成击杀",
  "role:seer_result": "预言家查验结果",
  "witch:action_submitted": "女巫提交行动",
  "death:player_died": "玩家死亡",
  "speech:completed": "玩家发言",
  "vote:cast": "玩家投票",
  "vote:revealed": "公布投票",
  "game:ended": "游戏结束",
  "room:player_joined": "玩家加入",
  "room:locked": "房间已锁定",
  "speech:queue_initialized": "发言队列已初始化",
  "speech:player_done": "玩家发言完毕",
  "speech:speaker_changed": "发言者变更",
  "witch:saved": "女巫使用了救药",
  "death:day_break_announcement": "天亮公布死讯",
}

const PHASE_LABELS: Record<string, string> = {
  ROLE_REVEAL: "确认身份",
  NIGHT_ANNOUNCE: "天黑请闭眼",
  WOLF_INTEL: "狼人确认同伴",
  WOLF_PROPOSE: "狼人行动",
  WOLF_RESOLVE: "狼人决议",
  SEER_CHOOSE: "预言家查验",
  SEER_RESULT: "查验结果",
  WITCH_NOTIFY: "女巫通知",
  WITCH_DECIDE: "女巫行动",
  NIGHT_SETTLEMENT: "夜晚结算",
  DAY_BREAK: "天亮了",
  DEATH_ANNOUNCE: "公布死讯",
  CHECK_WIN: "判断胜负",
  SPEECH_PRE_THINK: "准备发言",
  SPEECH_TURN_ACTIVE: "发言阶段",
  VOTE_CAST: "投票阶段",
  VOTE_REVEAL: "公布投票",
  EXILE_ANNOUNCE: "放逐结果",
  DAY_SETTLEMENT: "白天结算",
  RESULT_ANNOUNCE: "公布结果",
  MVP_ANNOUNCE: "MVP公布",
}

const DEATH_CAUSE_LABELS: Record<string, string> = {
  WOLF_KILL: "狼人击杀",
  VOTE_EXILE: "投票放逐",
  WITCH_POISON: "女巫毒药",
  HUNTER_SHOT: "猎人开枪",
  GUARD_WITCH_SAME: "守救冲突",
}

const FACTION_LABELS: Record<string, string> = {
  wolf: "狼人阵营",
  good: "好人阵营",
}

function resolvePlayerName(id: string, players: { id: string; name: string }[]): string {
  return players.find(p => p.id === id)?.name ?? id
}

export interface FormattedEvent {
  title: string
  detail?: string
  tone: "info" | "good" | "danger" | "private" | "system"
}

export function formatGameEvent(
  event: GameEvent,
  players: { id: string; name: string }[],
  selfId: string,
): FormattedEvent {
  const label = EVENT_LABELS[event.type] ?? `游戏事件：${event.type}`
  const p = event.payload || {}

  switch (event.type) {
    case "role:assigned": {
      const roleCn: Record<string, string> = { seer: "预言家", werewolf: "狼人", witch: "女巫", villager: "平民" }
      const roleName = roleCn[p.role as string] ?? (p.role as string)
      return {
        title: label,
        detail: `你获得身份：${roleName}`,
        tone: event.visibleTo?.includes(selfId) ? "private" : "info",
      }
    }
    case "phase:transitioned": {
      const fromLabel = PHASE_LABELS[p.from as string] ?? (p.from as string)
      const toLabel = PHASE_LABELS[p.to as string] ?? (p.to as string)
      return {
        title: label,
        detail: `${fromLabel} → ${toLabel}`,
        tone: "system",
      }
    }
    case "wolf:proposal_submitted": {
      const name = resolvePlayerName(p.playerId as string, players)
      const target = resolvePlayerName(p.targetId as string, players)
      return {
        title: label,
        detail: `${name} 建议击杀 ${target}`,
        tone: "info",
      }
    }
    case "wolf:proposal_resolved": {
      const target = resolvePlayerName(p.targetId as string, players)
      return {
        title: label,
        detail: `击杀目标确定：${target}`,
        tone: "info",
      }
    }
    case "role:seer_result": {
      const targetName = resolvePlayerName(p.targetId as string, players)
      const resultText = FACTION_LABELS[p.result as string] ?? (p.result as string)
      return {
        title: label,
        detail: `查验 ${targetName}：${resultText}`,
        tone: p.result === "wolf" ? "danger" : "good",
      }
    }
    case "death:player_died": {
      const name = resolvePlayerName(p.playerId as string, players)
      const causeCn = DEATH_CAUSE_LABELS[p.cause as string] ?? (p.cause as string)
      return {
        title: label,
        detail: `${name}（${causeCn}）`,
        tone: "danger",
      }
    }
    case "vote:cast": {
      const voter = resolvePlayerName((p as { playerId?: string }).playerId as string, players)
      return {
        title: label,
        detail: `${voter} 已投票`,
        tone: "info",
      }
    }
    case "vote:revealed":
      return { title: label, tone: "system" }
    case "speech:completed": {
      const name = resolvePlayerName(p.playerId as string, players)
      return {
        title: label,
        detail: `${name} 完成发言`,
        tone: "info",
      }
    }
    case "witch:action_submitted":
      return { title: "女巫已行动", tone: "private" }
    case "witch:saved": {
      const name = resolvePlayerName(p.playerId as string, players)
      return {
        title: "女巫救药已使用",
        detail: `救下了 ${name}`,
        tone: "good",
      }
    }
    case "room:player_joined":
      return { title: label, tone: "info" }
    case "room:locked":
      return { title: label, tone: "system" }
    case "speech:queue_initialized":
      return { title: label, tone: "system" }
    case "speech:player_done": {
      const name = resolvePlayerName(p.playerId as string, players)
      return {
        title: label,
        detail: `${name}`,
        tone: "info",
      }
    }
    case "speech:speaker_changed": {
      const name = resolvePlayerName(p.playerId as string, players)
      return {
        title: label,
        detail: `${name}`,
        tone: "info",
      }
    }
    case "death:day_break_announcement":
      return { title: label, tone: "danger" }
    case "game:ended":
      return { title: label, tone: "system" }
    default:
      return { title: label, tone: "info" }
  }
}

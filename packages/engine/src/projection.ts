import type { GameState } from "@aiwolf/shared/types"
import type { PlayerGuidance, PlayerView, PublicPlayer } from "./types"

export function buildPlayerView(state: GameState, playerId: string): PlayerView {
  const player = state.players[playerId]
  if (!player) throw new Error(`Player ${playerId} not found`)

  const publicPlayers: PublicPlayer[] = Object.values(state.players).map(p => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    isAlive: p.isAlive,
    isAI: p.isAI,
  }))

  return {
    scope: "player_private",
    playerId,
    self: {
      id: player.id,
      name: player.name,
      seat: player.seat,
      role: player.role,
      faction: player.faction,
      isAlive: player.isAlive,
      ...(player.teammates ? { teammates: player.teammates } : {}),
    },
    players: publicPlayers,
    phase: {
      type: state.phase.type,
      subPhase: state.phase.subPhase,
      round: state.phase.round,
      dayNumber: state.phase.dayNumber,
      ...(state.currentSpeakerId ? { currentSpeakerId: state.currentSpeakerId } : {}),
      ...(state.phaseTimerDeadline ? { deadline: state.phaseTimerDeadline } : {}),
    },
    guidance: buildGuidance(state, playerId),
    speeches: state.speeches ?? [],
    voteResult: state.currentVoteTally,
    deathAnnouncement: state.latestDeathAnnouncement,
    gameOver: state.gameOver,
    ...(player.role === "werewolf" && state.wolfProposals ? {
      wolfConsensus: {
        proposals: state.wolfProposals.map(p => ({
          wolfId: p.wolfId,
          targetId: p.targetId,
          reason: p.reason ?? "",
        })),
        ...(state.resolvedWolfTarget ? { resolvedTarget: state.resolvedWolfTarget } : {}),
      },
    } : {}),
    ...(player.role === "seer" && state.seerChecks ? {
      seerResults: state.seerChecks
        .filter(c => c.seerId === playerId)
        .map(c => ({ round: c.round, targetId: c.targetId, result: c.result })),
    } : {}),
  }
}

export type { PlayerView }

function buildGuidance(state: GameState, playerId: string): PlayerGuidance {
  const player = state.players[playerId]
  const alivePlayers = Object.values(state.players).filter(p => p.isAlive)
  const waitingForVotes = alivePlayers.filter(p => p.voteTargetId === undefined).map(p => p.name)
  const wolfNames = alivePlayers.filter(p => p.role === "werewolf").map(p => p.name)
  const seerNames = alivePlayers.filter(p => p.role === "seer").map(p => p.name)
  const witchNames = alivePlayers.filter(p => p.role === "witch").map(p => p.name)
  const isAlive = !!player?.isAlive

  switch (state.phase.subPhase) {
    case "ROLE_REVEAL":
      return {
        title: "查看你的身份",
        description: "请确认你的身份、技能与胜利条件。确认后游戏将自动进入夜晚。",
        yourTurn: isAlive && !(state.roleAcks ?? []).includes(playerId),
        waitingFor: alivePlayers.filter(p => !(state.roleAcks ?? []).includes(p.id)).map(p => p.name),
        nextStep: "进入夜晚",
        progress: { current: 1, total: 5, label: "准备阶段" },
        allowedActions: [{ type: "role:acknowledge", label: "确认身份", requiresTarget: false }],
      }
    case "WOLF_PROPOSE":
      return {
        title: player?.role === "werewolf" ? "轮到狼人行动" : "夜晚行动中",
        description: player?.role === "werewolf" ? "请选择今晚要击杀的目标。目标会与狼队意见合并后进入夜晚结算。" : "狼人正在选择击杀目标。你当前无需操作，请等待夜晚继续推进。",
        yourTurn: isAlive && player?.role === "werewolf",
        waitingFor: player?.role === "werewolf" ? [] : wolfNames,
        nextStep: "预言家查验",
        progress: { current: 2, total: 5, label: "夜晚流程" },
        allowedActions: player?.role === "werewolf" ? [{ type: "night:wolf_kill", label: "击杀", requiresTarget: true }] : [],
      }
    case "SEER_CHOOSE":
      return {
        title: player?.role === "seer" ? "轮到预言家查验" : "预言家行动中",
        description: player?.role === "seer" ? "请选择一名玩家查验阵营。查验结果只有你能看到。" : "预言家正在查验玩家。你当前无需操作。",
        yourTurn: isAlive && player?.role === "seer",
        waitingFor: player?.role === "seer" ? [] : seerNames,
        nextStep: "女巫行动",
        progress: { current: 3, total: 5, label: "夜晚流程" },
        allowedActions: player?.role === "seer" ? [{ type: "night:seer_check", label: "查验", requiresTarget: true }] : [],
      }
    case "WITCH_DECIDE":
      return {
        title: player?.role === "witch" ? "轮到女巫行动" : "女巫行动中",
        description: player?.role === "witch" ? "请选择是否使用解药或毒药。若不行动，可以直接跳过。" : "女巫正在决定是否用药。你当前无需操作。",
        yourTurn: isAlive && player?.role === "witch",
        waitingFor: player?.role === "witch" ? [] : witchNames,
        nextStep: "夜晚结算",
        progress: { current: 4, total: 5, label: "夜晚流程" },
        allowedActions: player?.role === "witch" ? [{ type: "night:witch_action", label: "用药", requiresTarget: true }, { type: "night:witch_action", label: "不行动", requiresTarget: false }] : [],
      }
    case "SPEECH_TURN_ACTIVE": {
      const speaker = state.currentSpeakerId ? state.players[state.currentSpeakerId] : undefined
      const speechDone = state.speechDone ?? []
      const speechQueue = state.speechQueue ?? []
      const waiting = speechQueue.filter(id => !speechDone.includes(id) && id !== state.currentSpeakerId)
        .map(id => state.players[id]?.name ?? id)
      const doneCount = speechDone.length
      const total = speechQueue.length
      return {
        title: state.currentSpeakerId === playerId ? "轮到你发言" : "发言阶段",
        description: state.currentSpeakerId === playerId
          ? "结合死讯、发言和投票记录，说出你的判断。至少 10 个字。"
          : speaker ? `${speaker.name} 正在发言，请观察他的立场与矛盾点。` : "等待发言开始...",
        yourTurn: isAlive && state.currentSpeakerId === playerId,
        waitingFor: speaker ? [speaker.name] : [],
        nextStep: "投票放逐",
        progress: { current: doneCount, total: Math.max(total, doneCount + waiting.length + (state.currentSpeakerId ? 1 : 0)), label: "发言进度" },
        allowedActions: state.currentSpeakerId === playerId ? [{ type: "speech:submit", label: "发言", requiresTarget: false }] : [],
      }
    }
    case "VOTE_CAST":
      return {
        title: "投票阶段",
        description: isAlive ? "请选择你认为最像狼的玩家，或选择弃票。投票公开前其他玩家不会看到你的选择。" : "你已出局，等待存活玩家完成投票。",
        yourTurn: isAlive && player?.voteTargetId === undefined,
        waitingFor: waitingForVotes,
        nextStep: "公布投票结果",
        progress: { current: 3, total: 4, label: "白天流程" },
        allowedActions: isAlive ? [{ type: "vote:cast", label: "投票", requiresTarget: true }] : [],
      }
    case "RESULT_ANNOUNCE":
      return {
        title: "游戏结束",
        description: `${state.gameOver?.winner === "wolf" ? "狼人阵营" : "好人阵营"}获胜。可以查看日志复盘关键决策。`,
        yourTurn: false,
        waitingFor: [],
        nextStep: "复盘对局",
        progress: { current: 4, total: 4, label: "结算" },
        allowedActions: [],
      }
    default:
      return {
        title: phaseTitle(state.phase.subPhase),
        description: phaseDescription(state.phase.subPhase),
        yourTurn: false,
        waitingFor: [],
        nextStep: nextStepLabel(state.phase.subPhase),
        progress: phaseProgress(state.phase.subPhase),
        allowedActions: [],
      }
  }
}

function phaseTitle(subPhase: string): string {
  const map: Record<string, string> = {
    ROLE_ASSIGNMENT: "分配身份",
    ROLE_REVEAL: "确认身份",
    NIGHT_ANNOUNCE: "天黑请闭眼",
    WOLF_INTEL: "狼人确认同伴",
    SEER_RESULT: "预言家获得结果",
    WITCH_NOTIFY: "女巫收到夜晚信息",
    NIGHT_SETTLEMENT: "夜晚结算",
    DAY_BREAK: "天亮了",
    DEATH_ANNOUNCE: "公布死讯",
    CHECK_WIN: "判断胜负",
    SPEECH_PRE_THINK: "准备发言",
    VOTE_REVEAL: "公布投票",
    EXILE_ANNOUNCE: "公布放逐",
    DAY_SETTLEMENT: "白天结算",
  }
  return map[subPhase] ?? subPhase
}

function phaseDescription(subPhase: string): string {
  const map: Record<string, string> = {
    ROLE_ASSIGNMENT: "系统正在分配身份，并向每位玩家发送私有信息。",
    NIGHT_ANNOUNCE: "夜晚开始，各角色将按顺序行动。",
    WOLF_INTEL: "狼人正在确认队友信息。",
    SEER_RESULT: "预言家正在接收查验结果。",
    WITCH_NOTIFY: "女巫正在接收今晚死亡信息。",
    NIGHT_SETTLEMENT: "系统正在结算夜晚行动。",
    DAY_BREAK: "白天开始，马上公布昨晚情况。",
    DEATH_ANNOUNCE: "系统正在公布昨晚死讯。",
    CHECK_WIN: "系统正在检查是否已经满足胜利条件。",
    SPEECH_PRE_THINK: "AI 玩家正在整理发言策略。",
    VOTE_REVEAL: "投票结束，正在公开票型。",
    EXILE_ANNOUNCE: "系统正在公布被放逐玩家。",
    DAY_SETTLEMENT: "白天流程结束，即将进入下一夜。",
  }
  return map[subPhase] ?? "游戏正在推进，请稍候。"
}

function nextStepLabel(subPhase: string): string {
  const map: Record<string, string> = {
    ROLE_ASSIGNMENT: "进入夜晚",
    NIGHT_ANNOUNCE: "狼人行动",
    WOLF_INTEL: "狼人选择目标",
    SEER_RESULT: "女巫行动",
    WITCH_NOTIFY: "女巫决定",
    NIGHT_SETTLEMENT: "天亮",
    DAY_BREAK: "公布死讯",
    DEATH_ANNOUNCE: "判断胜负",
    CHECK_WIN: "发言阶段",
    SPEECH_PRE_THINK: "开始发言",
    VOTE_REVEAL: "公布放逐",
    EXILE_ANNOUNCE: "白天结算",
    DAY_SETTLEMENT: "进入夜晚",
  }
  return map[subPhase] ?? "下一阶段"
}

function phaseProgress(subPhase: string): PlayerGuidance["progress"] {
  if (["NIGHT_ANNOUNCE", "WOLF_INTEL", "SEER_RESULT", "WITCH_NOTIFY", "NIGHT_SETTLEMENT"].includes(subPhase)) {
    return { current: 1, total: 5, label: "夜晚流程" }
  }
  if (["DAY_BREAK", "DEATH_ANNOUNCE", "CHECK_WIN", "SPEECH_PRE_THINK", "VOTE_REVEAL", "EXILE_ANNOUNCE", "DAY_SETTLEMENT"].includes(subPhase)) {
    return { current: 1, total: 4, label: "白天流程" }
  }
  return { current: 1, total: 1, label: "游戏流程" }
}

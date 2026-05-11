import type { GameState } from "@aiwolf/shared/types"
import { buildPlayerView, type PlayerView } from "@aiwolf/engine"
import type { Personality } from "../personality"
import { personalityToPrompt } from "../personality"
import type { AgentMemory } from "../memory"
import { memoryToPrompt } from "../memory"

export interface AIContext {
  systemPrompt: string
  userPrompt: string
  role: string
  phase: string
  trace: {
    view: PlayerView
    promptTokensEstimate: number
  }
}

export function buildContext(
  state: GameState,
  playerId: string,
  task: "speech" | "vote" | "wolf_kill" | "seer_check" | "witch_action" | "last_words",
  personality?: Personality,
  memory?: AgentMemory,
): AIContext {
  const view = buildPlayerView(state, playerId)
  const role = view.self.role

  const systemPrompt = [
    loadSystemPrompt(),
    personality ? personalityToPrompt(personality) : "",
    loadRolePrompt(role),
    buildPhasePrompt(view, task),
  ].filter(Boolean).join("\n\n")

  const memoryText = memory ? memoryToPrompt(memory, playerId) : ""

  const userPrompt = [
    `【你的身份】${role}，阵营${view.self.faction}`,
    `【当前阶段】${view.phase.type} ${view.phase.subPhase} 第${view.phase.dayNumber}天`,
    `【存活玩家】${view.players.filter(p => p.isAlive).map(p => `${p.name}(${p.id})`).join("、")}`,
    `【当前任务】${taskDescription(task)}`,
    memoryText,
    ``,
    `请以 JSON 格式返回你的决策，必须是合法 json，不要输出 markdown：`,
    `{"analysis":{"knownFacts":["公开事实"],"privateFacts":["仅自己可见的信息"],"suspicions":[{"playerId":"p2","score":0.7,"reason":"怀疑理由"}],"strategy":"本轮策略","risk":"暴露或误伤风险"},"action":{"type":"...","targetId":"...","reason":"..."},"speech":{"content":"...","tone":"..."}}`,
  ].filter(Boolean).join("\n")

  return {
    systemPrompt,
    userPrompt,
    role,
    phase: view.phase.subPhase,
    trace: {
      view,
      promptTokensEstimate: (systemPrompt + userPrompt).length / 4,
    },
  }
}

function taskDescription(task: string): string {
  const map: Record<string, string> = {
    speech: "你需要进行一轮发言，分析局势，表达你的判断",
    vote: "你需要投票选择要放逐的玩家",
    wolf_kill: "你需要和狼同伴协商，选择今晚要击杀的目标",
    seer_check: "你需要选择今晚要查验的目标",
    witch_action: "你需要决定是否使用解药救人 / 毒药杀人",
    last_words: "你被淘汰了，请留下遗言",
  }
  return map[task] ?? task
}

// ── Prompt 加载（MVP: 硬编码，Phase 2 走文件） ──

function loadSystemPrompt(): string {
  return `你是狼人杀游戏中的一名AI玩家。你必须严格遵守 JSON 输出格式，只输出合法的 json 对象。

输出格式：
{
  "analysis": {
    "knownFacts": ["你基于公开信息确认的事实"],
    "privateFacts": ["仅自己知道、不能在公开发言中泄露的信息"],
    "suspicions": [{ "playerId": "玩家ID", "score": 0.0-1.0, "reason": "怀疑或信任理由" }],
    "strategy": "你这一轮的真实策略",
    "risk": "这次行动或发言可能带来的风险"
  },
  "action": { "type": "投票/击杀/查验/救人/毒杀/跳过", "targetId": "玩家ID或null", "reason": "简短理由" },
  "speech": { "content": "你的发言内容（150-400字）", "tone": "激进/温和/困惑" }
}

规则：
- 不能暴露自己的真实身份（除非是自爆狼人）
- 狼人不能暴露同伴
- 预言家只能报告真实的查验结果
- 公开发言只能使用自己合理可公开的信息，不能泄露 privateFacts
- 发言要引用上一轮可见事实，给出明确怀疑对象或信任对象
- 发言要像真人，不要像机器人`
}

function loadRolePrompt(role: string): string {
  const prompts: Record<string, string> = {
    werewolf: `【你是狼人】
- 你和同伴知道彼此身份
- 夜晚可以击杀一名玩家
- 白天必须伪装成好人，不能暴露身份
- 发言时要制造怀疑，引导票向
- 可以伪装成村民或预言家`,
    seer: `【你是预言家】
- 每晚可以查验一名玩家的身份（好人/狼人）
- 白天要帮助好人阵营分析局势
- 如果查验到狼人，要在发言中揭露
- 发言要有逻辑，不要情绪化`,
    witch: `【你是女巫】
- 你有一瓶解药（救人）和一瓶毒药（杀人）
- 解药和毒药各只能使用一次
- 不能自救
- 解药使用后不再收到死亡通知
- 可以适当暗示银水信息`,
    villager: `【你是村民】
- 没有特殊能力
- 通过发言和投票找出狼人
- 仔细分析每个玩家的发言
- 关注矛盾点和异常行为`,
  }
  return prompts[role] ?? prompts.villager!
}

function buildPhasePrompt(view: PlayerView, task: string): string {
  if (task === "speech") {
    return `当前是发言阶段，请发表你的看法。要求150-400字，包含逻辑推理和心路历程。`
  }
  return `当前需要你做出决策。请选择行动目标并说明理由。`
}

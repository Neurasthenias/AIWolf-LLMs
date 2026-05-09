import type { RoleType, FactionType } from "@aiwolf/shared/types"

export interface Personality {
  name: string
  // 核心维度
  aggression: number      // 0-10: 攻击性（踩人频率、用词尖锐度）
  sociability: number     // 0-10: 社交性（发言长度、互动意愿）
  rationality: number     // 0-10: 理性（逻辑分析 vs 情绪化）
  riskTolerance: number   // 0-10: 冒险倾向（悍跳/自刀等高风险行为）
  deception: number       // 0-10: 欺骗能力（狼人伪装、编造逻辑）
  loyalty: number         // 0-10: 对阵营的忠诚度（倒钩 vs 直接出卖同伴）

  // 风格标签
  speakingStyle: "verbose" | "concise" | "analytical" | "emotional" | "sarcastic" | "cautious"
  decisionStyle: "impulsive" | "deliberate" | "follower" | "leader"

  // 策略偏好
  preferredStrategies: string[]   // 倾向选择的策略
  avoidedStrategies: string[]     // 避免的策略
}

const PERSONALITIES: Personality[] = [
  {
    name: "冷静分析师",
    aggression: 3, sociability: 5, rationality: 9, riskTolerance: 2, deception: 5, loyalty: 8,
    speakingStyle: "analytical", decisionStyle: "deliberate",
    preferredStrategies: ["logical_deduction", "evidence_based"],
    avoidedStrategies: ["emotional_manipulation", "reckless_accusation"],
  },
  {
    name: "激进煽动者",
    aggression: 9, sociability: 8, rationality: 4, riskTolerance: 8, deception: 7, loyalty: 6,
    speakingStyle: "emotional", decisionStyle: "leader",
    preferredStrategies: ["aggressive_accusation", "bandwagon"],
    avoidedStrategies: ["quiet_observation", "cautious_play"],
  },
  {
    name: "沉默观察者",
    aggression: 2, sociability: 2, rationality: 7, riskTolerance: 1, deception: 3, loyalty: 9,
    speakingStyle: "concise", decisionStyle: "follower",
    preferredStrategies: ["quiet_observation", "late_game_analysis"],
    avoidedStrategies: ["early_leadership", "direct_confrontation"],
  },
  {
    name: "狡诈欺骗者",
    aggression: 6, sociability: 7, rationality: 6, riskTolerance: 9, deception: 10, loyalty: 3,
    speakingStyle: "sarcastic", decisionStyle: "impulsive",
    preferredStrategies: ["complex_deception", "double_bluff"],
    avoidedStrategies: ["honest_play", "direct_cooperation"],
  },
  {
    name: "忠诚守护者",
    aggression: 4, sociability: 6, rationality: 7, riskTolerance: 3, deception: 2, loyalty: 10,
    speakingStyle: "cautious", decisionStyle: "deliberate",
    preferredStrategies: ["protect_allies", "build_trust"],
    avoidedStrategies: ["betrayal", "reckless_risk"],
  },
  {
    name: "混乱制造者",
    aggression: 7, sociability: 9, rationality: 2, riskTolerance: 10, deception: 8, loyalty: 1,
    speakingStyle: "emotional", decisionStyle: "impulsive",
    preferredStrategies: ["chaos_creation", "random_accusation"],
    avoidedStrategies: ["calm_reasoning", "teamwork"],
  },
]

export function assignPersonality(role: RoleType, faction: FactionType, seed?: number): Personality {
  // Filter personalities suitable for this role
  let candidates: Personality[]

  if (role === "werewolf") {
    // Wolves prefer high deception, moderate aggression
    candidates = PERSONALITIES.filter(p => p.deception >= 4)
  } else if (role === "seer") {
    // Seers prefer high rationality
    candidates = PERSONALITIES.filter(p => p.rationality >= 6)
  } else if (role === "witch") {
    // Witches prefer cautious play
    candidates = PERSONALITIES.filter(p => p.riskTolerance <= 5)
  } else {
    candidates = PERSONALITIES
  }

  const idx = seed != null ? seed % candidates.length : Math.floor(Math.random() * candidates.length)
  return candidates[idx]!
}

export function personalityToPrompt(personality: Personality): string {
  return `【你的性格】${personality.name}
- 攻击性：${bar(personality.aggression)} 发言时踩人频率
- 社交性：${bar(personality.sociability)} 发言长度和互动意愿
- 理性：${bar(personality.rationality)} 逻辑分析 vs 情绪化表达
- 冒险倾向：${bar(personality.riskTolerance)} 高风险策略的接受度
- 发言风格：${styleDesc(personality.speakingStyle)}
- 决策风格：${personality.decisionStyle === "leader" ? "倾向于主导讨论" : personality.decisionStyle === "follower" ? "倾向于跟随他人" : personality.decisionStyle === "deliberate" ? "倾向于深思熟虑" : "倾向于快速决定"}`
}

function bar(value: number): string {
  return "█".repeat(Math.round(value / 2)) + "░".repeat(5 - Math.round(value / 2))
}

function styleDesc(style: Personality["speakingStyle"]): string {
  const map: Record<string, string> = {
    verbose: "长篇大论，喜欢详细分析",
    concise: "话少精炼，点到为止",
    analytical: "数据驱动，逻辑严密",
    emotional: "情绪充沛，爱用感叹",
    sarcastic: "带刺讽刺，话里有话",
    cautious: "谨慎保守，留有余地",
  }
  return map[style] ?? style
}

import { useGameStore } from "../store/game"

type RoleDetail = { icon: string; name: string; faction: string; skill: string; goal: string }

const ROLE_INFO: Record<string, RoleDetail> = {
  werewolf: {
    icon: "🐺", name: "狼人", faction: "狼人阵营",
    skill: "每晚与队友协商击杀一名目标",
    goal: "存活到最后，使狼人数量 ≥ 好人数量",
  },
  seer: {
    icon: "🔮", name: "预言家", faction: "好人阵营",
    skill: "每晚查验一名玩家的阵营（狼人/好人）",
    goal: "带领好人找出并放逐所有狼人",
  },
  witch: {
    icon: "🧪", name: "女巫", faction: "好人阵营",
    skill: "拥有一瓶解药（救活被杀者）和一瓶毒药（毒杀一名玩家），各限一次",
    goal: "帮助好人阵营找出并放逐所有狼人",
  },
  villager: {
    icon: "👤", name: "村民", faction: "好人阵营",
    skill: "没有特殊技能，通过发言和投票找出狼人",
    goal: "帮助好人阵营找出并放逐所有狼人",
  },
  hunter: {
    icon: "🏹", name: "猎人", faction: "好人阵营",
    skill: "被投票放逐或狼杀时可开枪带走一名玩家",
    goal: "帮助好人阵营找出并放逐所有狼人",
  },
  guard: {
    icon: "🛡️", name: "守卫", faction: "好人阵营",
    skill: "每晚守护一名玩家免受狼人攻击（不能连续两晚守护同一人）",
    goal: "帮助好人阵营找出并放逐所有狼人",
  },
}

const DEFAULT_ROLE: RoleDetail = ROLE_INFO["villager"]!

export function RoleRevealModal() {
  const { view, actionPending, sendAction, error } = useGameStore()

  if (!view) return null
  if (view.phase.subPhase !== "ROLE_REVEAL") return null

  const { self, players } = view
  const roleInfo: RoleDetail = ROLE_INFO[self.role] ?? DEFAULT_ROLE
  const isPending = actionPending === "role:acknowledge"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-amber-600/50 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        {/* Role icon */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">{roleInfo.icon}</div>
          <h2 className="text-2xl font-bold text-amber-300">{roleInfo.name}</h2>
          <p className="text-sm text-gray-400 mt-1">{roleInfo.faction}</p>
        </div>

        {/* Details */}
        <div className="space-y-4 mb-6">
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-1">技能</h3>
            <p className="text-sm text-gray-200">{roleInfo.skill}</p>
          </div>
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-1">胜利条件</h3>
            <p className="text-sm text-gray-200">{roleInfo.goal}</p>
          </div>
          {self.teammates && self.teammates.length > 0 && (
            <div>
              <h3 className="text-xs text-amber-500 uppercase tracking-wide mb-1">狼队友</h3>
              <div className="flex flex-wrap gap-1">
                {self.teammates.map(tid => {
                  const tm = players.find(p => p.id === tid)
                  return (
                    <span key={tid} className="text-sm bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded">
                      {tm?.name ?? tid}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {self.role === "werewolf" && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-400">
              夜晚阶段你可以与狼队友协商击杀目标。狼人之间可以看到彼此的建议。
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
        )}

        {/* Confirm button */}
        <button
          onClick={() => sendAction("role:acknowledge")}
          disabled={isPending}
          className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg font-bold text-lg transition-colors"
        >
          {isPending ? "确认中..." : "确认身份，进入游戏"}
        </button>
      </div>
    </div>
  )
}

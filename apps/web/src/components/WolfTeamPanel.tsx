import { useGameStore } from "../store/game"

export function WolfTeamPanel() {
  const { view } = useGameStore()

  if (!view) return null
  const { phase, self, wolfConsensus, players } = view

  // Only show during wolf phases for werewolf players
  const isWolfPhase = phase.subPhase === "WOLF_PROPOSE" || phase.subPhase === "WOLF_RESOLVE"
  if (!isWolfPhase || self.role !== "werewolf") return null

  const proposals = wolfConsensus?.proposals ?? []
  const resolvedTarget = wolfConsensus?.resolvedTarget

  // Build tally
  const tally: Record<string, number> = {}
  for (const p of proposals) {
    tally[p.targetId] = (tally[p.targetId] ?? 0) + 1
  }

  return (
    <div className="p-4 bg-gray-900/80 border border-amber-800/50 rounded-xl space-y-3">
      <h3 className="text-sm font-bold text-amber-400 flex items-center gap-1">
        🐺 狼队协商
        {resolvedTarget && <span className="text-xs text-green-400 ml-2">已达成共识</span>}
      </h3>

      {/* Target tally */}
      {Object.keys(tally).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">目标票数</p>
          {Object.entries(tally)
            .sort(([, a], [, b]) => b - a)
            .map(([tid, count]) => {
              const target = players.find(p => p.id === tid)
              const isResolved = tid === resolvedTarget
              return (
                <div key={tid} className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                  isResolved ? "bg-green-900/40 text-green-300" : "bg-gray-800 text-gray-300"
                }`}>
                  <span>{target?.name ?? tid}</span>
                  <span className="text-xs text-gray-500">{count}票{isResolved ? " ✓" : ""}</span>
                </div>
              )
            })}
        </div>
      )}

      {/* Individual proposals */}
      {proposals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">狼队友建议</p>
          {proposals.map((p, i) => {
            const wolf = players.find(pl => pl.id === p.wolfId)
            const target = players.find(pl => pl.id === p.targetId)
            return (
              <div key={i} className="text-xs text-gray-400 flex items-center gap-1">
                <span className="text-amber-500">{wolf?.name ?? p.wolfId}</span>
                <span>→</span>
                <span className="text-red-400">{target?.name ?? p.targetId}</span>
                {p.reason && <span className="text-gray-600">({p.reason})</span>}
              </div>
            )
          })}
        </div>
      )}

      {proposals.length === 0 && (
        <p className="text-xs text-gray-600">等待狼队成员提出目标...</p>
      )}

      {/* Tip */}
      <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">
        最终目标由多数票决定。真人狼人每轮限一次提案，提交后等待队友或共识。
      </p>
    </div>
  )
}

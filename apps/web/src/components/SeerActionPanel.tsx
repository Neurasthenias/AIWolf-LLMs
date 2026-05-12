import { useGameStore } from "../store/game"

export function SeerActionPanel() {
  const { view, sendAction, actionPending } = useGameStore()
  if (!view) return null

  const { self, players, phase } = view
  const isSeerPhase = phase.subPhase === "SEER_CHOOSE"
  const seerResults = view.seerResults ?? []
  const currentRoundResult = seerResults.find(r => r.round === phase.round)

  const aliveTargets = players.filter(p => p.isAlive && p.id !== self.id)

  if (!isSeerPhase || self.role !== "seer") return null

  return (
    <div className="p-4 bg-indigo-950/40 rounded border border-indigo-700 space-y-3">
      <h3 className="text-indigo-300 font-bold text-base">预言家查验</h3>
      <p className="text-sm text-gray-300">选择一名存活玩家，查看 TA 属于狼人阵营还是好人阵营</p>

      {currentRoundResult ? (
        <>
          <div className={`p-3 rounded border text-center ${
            currentRoundResult.result === "wolf"
              ? "bg-red-900/50 border-red-600 text-red-300"
              : "bg-green-900/50 border-green-600 text-green-300"
          }`}>
            <p className="font-bold">查验结果：{currentRoundResult.result === "wolf" ? "狼人阵营" : "好人阵营"}</p>
            <p className="text-sm text-gray-400 mt-1">
              {players.find(p => p.id === currentRoundResult.targetId)?.name ?? currentRoundResult.targetId}
            </p>
          </div>
          <p className="text-sm text-amber-400 text-center">查验完成，等待夜晚继续推进</p>
        </>
      ) : actionPending === "night:seer_check" ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-400 text-center">查验中...</p>
          {aliveTargets.map(p => (
            <button key={p.id} disabled className="w-full px-3 py-2 bg-gray-700 rounded text-sm opacity-50 cursor-not-allowed">
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {aliveTargets.map(p => (
            <button
              key={p.id}
              onClick={() => sendAction("night:seer_check", p.id)}
              className="w-full px-3 py-2 bg-indigo-900 rounded hover:bg-indigo-700 text-sm text-left"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

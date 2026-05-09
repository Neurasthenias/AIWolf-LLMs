import { useState } from "react"
import { useGameStore } from "../store/game"

export function GamePage() {
  const { view, sendSpeech, sendVote, sendAction, events, requestCatchup, playerId } = useGameStore()
  const [speechText, setSpeechText] = useState("")
  const [showReplay, setShowReplay] = useState(false)

  if (!view) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-400">等待游戏状态...</p>
          <button onClick={requestCatchup} className="px-4 py-2 bg-amber-600 rounded">刷新状态</button>
        </div>
      </div>
    )
  }

  const { self, players, phase, speeches, voteResult, deathAnnouncement, gameOver } = view
  const isNight = phase.type === "NIGHT"
  const isSpeaking = phase.subPhase === "SPEECH_TURN_ACTIVE"
  const isVoting = phase.subPhase === "VOTE_CAST"
  const isWolfPhase = phase.subPhase === "WOLF_PROPOSE" || phase.subPhase === "WOLF_RESOLVE"
  const isSeerPhase = phase.subPhase === "SEER_CHOOSE"
  const isWitchPhase = phase.subPhase === "WITCH_DECIDE"
  const canAct = (isWolfPhase && self.role === "werewolf") || (isSeerPhase && self.role === "seer") || (isWitchPhase && self.role === "witch")

  return (
    <div className={`min-h-screen ${isNight ? "bg-gray-950" : "bg-gray-900"} text-white`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div>
          <span className="text-amber-400 font-bold">🐺 AI 狼人杀</span>
          <span className="ml-4 text-sm text-gray-400">
            第{phase.dayNumber}天 · {phaseLabel(phase.type, phase.subPhase)}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-gray-800 px-2 py-1 rounded">
            {self.role === "werewolf" ? "🐺" : self.role === "seer" ? "🔮" : self.role === "witch" ? "🧪" : "👤"}
            {" "}{self.name || self.id}
          </span>
          <button onClick={() => setShowReplay(!showReplay)} className="text-xs bg-gray-800 px-2 py-1 rounded hover:bg-gray-700">
            📋 {showReplay ? "隐藏" : "日志"}
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-60px)]">
        {/* Main area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {/* Death announcement */}
          {deathAnnouncement && (
            <div className="p-3 bg-red-900/50 rounded border border-red-700">
              {deathAnnouncement.isSafeNight
                ? "☀️ 昨晚是平安夜"
                : `💀 昨晚死亡：${deathAnnouncement.deaths.map(d => `${players.find(p => p.id === d.playerId)?.name ?? d.playerId}`).join("、")}`}
            </div>
          )}

          {/* Game over */}
          {gameOver && (
            <div className="p-6 bg-amber-900/50 rounded border border-amber-600 text-center text-xl font-bold">
              🏆 {gameOver.winner === "good" ? "好人阵营" : "狼人阵营"}获胜！
              <div className="text-sm text-gray-400 mt-2">MVP: {gameOver.mvp} | SVP: {gameOver.svp}</div>
            </div>
          )}

          {/* Speeches */}
          <div className="space-y-2">
            {speeches.map((s, i) => {
              const speaker = players.find(p => p.id === s.playerId)
              return (
                <div key={i} className="p-3 bg-gray-800 rounded">
                  <span className="text-amber-400 text-sm font-bold">{speaker?.name ?? s.playerId}:</span>
                  <p className="text-gray-300 mt-1 text-sm">{s.content}</p>
                </div>
              )
            })}
          </div>

          {/* Vote result */}
          {voteResult && (
            <div className="p-3 bg-gray-800 rounded">
              <p className="text-sm font-bold text-gray-400">投票结果：</p>
              {Object.entries(voteResult.votes).map(([pid, target]) => {
                const voter = players.find(p => p.id === pid)
                const targetName = target ? players.find(p => p.id === target)?.name : "弃票"
                return (
                  <p key={pid} className="text-sm text-gray-300">
                    {voter?.name ?? pid} → {targetName}
                  </p>
                )
              })}
              {voteResult.exiledPlayerId && (
                <p className="text-red-400 mt-1">🗳️ {players.find(p => p.id === voteResult.exiledPlayerId)?.name} 被放逐</p>
              )}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-64 border-l border-gray-800 p-4 space-y-4 overflow-y-auto">
          {/* Player list */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2">玩家</h3>
            {players.map(p => (
              <div key={p.id} className={`flex items-center gap-2 py-1 text-sm ${!p.isAlive ? "text-red-400 line-through" : ""}`}>
                <span className="w-4">{p.isAlive ? "●" : "✕"}</span>
                <span>{p.name}</span>
                {p.id === playerId && <span className="text-amber-400 text-xs">(你)</span>}
                {p.isAI && <span className="text-xs text-gray-500">AI</span>}
              </div>
            ))}
          </div>

          {/* Phase info */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>阶段: {phase.subPhase}</p>
            <p>第{phase.round}轮</p>
            {self.teammates && self.teammates.length > 0 && (
              <p className="text-amber-500">同伴: {self.teammates.map(t => players.find(p => p.id === t)?.name ?? t).join(", ")}</p>
            )}
          </div>

          {/* Replay log */}
          {showReplay && (
            <div className="text-xs text-gray-500 max-h-40 overflow-y-auto space-y-1">
              <h3 className="text-gray-400 font-bold">事件日志</h3>
              {events.slice(-30).map((e, i) => (
                <p key={i}>#{e.seq} {e.type}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800">
        {/* Speech input */}
        {isSpeaking && self.isAlive && (
          <div className="flex gap-2">
            <input
              className="flex-1 p-3 rounded bg-gray-800 border border-gray-700 text-white"
              placeholder="输入你的发言（至少10字）..."
              value={speechText}
              onChange={e => setSpeechText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && speechText.length >= 10) { sendSpeech(speechText); setSpeechText("") } }}
            />
            <button
              onClick={() => { sendSpeech(speechText); setSpeechText("") }}
              disabled={speechText.length < 10}
              className="px-6 py-3 bg-amber-600 rounded font-bold disabled:opacity-50"
            >
              发言
            </button>
          </div>
        )}

        {/* Vote panel */}
        {isVoting && self.isAlive && (
          <div className="flex gap-2 flex-wrap">
            {players.filter(p => p.isAlive && p.id !== self.id).map(p => (
              <button key={p.id} onClick={() => sendVote(p.id)} className="px-3 py-2 bg-gray-700 rounded hover:bg-red-700 text-sm">
                🗳️ {p.name}
              </button>
            ))}
            <button onClick={() => sendVote(null)} className="px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 text-sm">
              弃票
            </button>
          </div>
        )}

        {/* Night action panel */}
        {canAct && (
          <div className="flex gap-2 flex-wrap">
            <p className="w-full text-xs text-amber-400 mb-1">
              {isWolfPhase ? "选择击杀目标" : isSeerPhase ? "选择查验目标" : "选择行动"}
            </p>
            {players.filter(p => p.isAlive && p.id !== self.id).map(p => (
              <button key={p.id} onClick={() => sendAction(
                isWolfPhase ? "night:wolf_kill" : isSeerPhase ? "night:seer_check" : "night:witch_action",
                p.id
              )} className="px-3 py-2 bg-red-900 rounded hover:bg-red-700 text-sm">
                {p.name}
              </button>
            ))}
            {isWitchPhase && (
              <button onClick={() => sendAction("night:witch_action")} className="px-3 py-2 bg-gray-700 rounded text-sm">
                不行动
              </button>
            )}
          </div>
        )}

        {/* Waiting state */}
        {!isSpeaking && !isVoting && !canAct && !gameOver && (
          <p className="text-center text-gray-500 text-sm">
            {isNight ? "🌙 夜晚阶段 — 等待中..." : "等待其他玩家..."}
          </p>
        )}
      </div>
    </div>
  )
}

function phaseLabel(type: string, sub: string): string {
  const map: Record<string, string> = {
    NIGHT_ANNOUNCE: "天黑请闭眼",
    WOLF_INTEL: "狼人确认同伴",
    WOLF_PROPOSE: "狼人请行动",
    SEER_CHOOSE: "预言家请验人",
    WITCH_DECIDE: "女巫请行动",
    NIGHT_SETTLEMENT: "夜晚结算",
    DAY_BREAK: "天亮了",
    DEATH_ANNOUNCE: "公布死讯",
    SPEECH_TURN_ACTIVE: "发言阶段",
    VOTE_CAST: "投票阶段",
    VOTE_REVEAL: "公布投票",
    EXILE_ANNOUNCE: "放逐结果",
  }
  return map[sub] ?? `${type}/${sub}`
}

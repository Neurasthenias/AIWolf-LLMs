import { useEffect, useState } from "react"
import { useLogStore, type GameSummary, type TraceEntry } from "../store/logs"

type Tab = "timeline" | "thoughts" | "events"

const ROLE_ICON: Record<string, string> = { werewolf: "🐺", villager: "👤", seer: "🔮", witch: "🧪", hunter: "🏹", guard: "🛡️" }
const ROLE_NAME: Record<string, string> = { werewolf: "狼人", villager: "村民", seer: "预言家", witch: "女巫", hunter: "猎人", guard: "守卫" }
const PHASE_NAME: Record<string, string> = {
  NIGHT_ANNOUNCE: "天黑", WOLF_INTEL: "狼人确认同伴", WOLF_PROPOSE: "狼人行动",
  SEER_CHOOSE: "预言家验人", SEER_RESULT: "预言家结果", WITCH_NOTIFY: "女巫通知",
  WITCH_DECIDE: "女巫行动", NIGHT_SETTLEMENT: "夜晚结算", DAY_BREAK: "天亮",
  DEATH_ANNOUNCE: "死讯", SPEECH_TURN_ACTIVE: "发言", VOTE_CAST: "投票",
  VOTE_REVEAL: "公布投票", EXILE_ANNOUNCE: "放逐", DAY_SETTLEMENT: "白天结算",
  RESULT_ANNOUNCE: "结果",
}
const TASK_ICON: Record<string, string> = { wolf_kill: "🔪", seer_check: "🔍", witch_action: "🧪", vote: "🗳️", speech: "💬", last_words: "💀" }
const TASK_NAME: Record<string, string> = { wolf_kill: "狼人击杀", seer_check: "预言家查验", witch_action: "女巫行动", vote: "投票", speech: "发言", last_words: "遗言" }

export function LogViewer({ onBack }: { onBack: () => void }) {
  const { games, selectedGameId, selectedSummary, selectedEvents, selectedTraces, loading, fetchGames, selectGame } = useLogStore()
  const [tab, setTab] = useState<Tab>("timeline")
  const [expandedTrace, setExpandedTrace] = useState<number | null>(null)

  useEffect(() => { fetchGames() }, [fetchGames])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col h-screen">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 text-sm">←</button>
        <span className="text-amber-400 font-bold text-sm">对局日志</span>
        <span className="text-xs text-gray-500">{games.length} 局</span>
        {selectedGameId && <span className="text-xs text-gray-500 ml-auto font-mono">{selectedGameId?.slice(0,12)}...</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Game List */}
        <div className="w-72 border-r border-gray-800 overflow-y-auto shrink-0">
          {loading && <p className="p-3 text-gray-500 text-xs">加载中...</p>}
          {games.map((g, idx) => (
            <button
              key={`${g.shortId ?? g.gameId}-${idx}`}
              onClick={() => selectGame(g.gameId)}
              className={`w-full text-left p-3 border-b border-gray-800/50 hover:bg-gray-800 transition-colors ${
                selectedGameId === g.gameId ? "bg-gray-800 border-l-2 border-l-amber-500" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] text-gray-400">{g.shortId ?? g.gameId.slice(0,8)}</span>
                <WinnerBadge winner={g.winner} />
              </div>
              <div className="flex gap-2 text-[11px] text-gray-500 mb-1">
                <span>{g.rounds}轮</span><span>{g.totalEvents}事件</span><span>{g.durationMs >= 1000 ? `${(g.durationMs/1000).toFixed(1)}s` : `${g.durationMs}ms`}</span>
              </div>
              {g.roleAssignments && (
                <div className="flex gap-0.5 text-xs">
                  {Object.entries(g.roleAssignments).slice(0,6).map(([pid, role]) => (
                    <span key={pid} className="opacity-70" title={`${pid}: ${ROLE_NAME[role] ?? role}`}>
                      {ROLE_ICON[role] ?? "❓"}
                    </span>
                  ))}
                </div>
              )}
              {g.error && <span className="text-[10px] text-red-500 block mt-1">Error</span>}
            </button>
          ))}
          {!loading && games.length === 0 && <p className="p-3 text-gray-500 text-xs">暂无数据</p>}
        </div>

        {/* Right: Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedSummary ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">选择左侧对局查看详情</div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-gray-800 shrink-0">
                {(["timeline", "thoughts", "events"] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 text-xs ${tab === t ? "border-b-2 border-amber-500 text-amber-400" : "text-gray-400 hover:text-gray-200"}`}>
                    {{ timeline: `时间线 (${selectedEvents.length})`, thoughts: `思维链 (${selectedTraces.length})`, events: "事件流" }[t]}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {tab === "timeline" && <TimelineView events={selectedEvents} summary={selectedSummary} />}
                {tab === "thoughts" && <ThoughtChain traces={selectedTraces} expanded={expandedTrace} setExpanded={setExpandedTrace} />}
                {tab === "events" && <EventsView events={selectedEvents} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WinnerBadge({ winner }: { winner: string | null }) {
  if (!winner) return <span className="text-[10px] px-1.5 bg-gray-700 rounded text-gray-400">?</span>
  return (
    <span className={`text-[10px] px-1.5 rounded ${winner === "wolf" ? "bg-red-900/70 text-red-300" : "bg-green-900/70 text-green-300"}`}>
      {winner === "wolf" ? "狼" : "好"}
    </span>
  )
}

// ══════ Timeline View ══════

function TimelineView({ events, summary }: { events: Record<string,unknown>[]; summary: GameSummary }) {
  // Group events by phase
  const phases: { name: string; events: Record<string,unknown>[] }[] = []
  let currentPhase = ""
  for (const e of events) {
    const type = e.type as string
    if (type === "phase:transitioned") {
      const to = (e.payload as Record<string,unknown>)?.to as string
      phases.push({ name: PHASE_NAME[to] ?? to, events: [] })
      currentPhase = to
    } else if (currentPhase) {
      phases[phases.length - 1]?.events.push(e)
    }
  }

  const roles = summary.roleAssignments ?? {}
  const isNight = (name: string) => name.includes("天黑") || name.includes("狼人") || name.includes("预言家") || name.includes("女巫") || name.includes("结算")

  return (
    <div className="space-y-6">
      {/* Game header */}
      <div className={`p-3 rounded-lg ${summary.winner === "wolf" ? "bg-red-900/20 border border-red-800" : "bg-green-900/20 border border-green-800"}`}>
        <div className="flex items-center gap-3">
          <span className="text-lg">{summary.winner === "wolf" ? "🐺" : "🏆"}</span>
          <div>
            <div className="font-bold text-sm">{summary.winner === "wolf" ? "狼人阵营获胜" : "好人阵营获胜"}</div>
            <div className="text-xs text-gray-400">{summary.rounds}轮 · {summary.totalEvents}事件 · {(summary.durationMs / 1000).toFixed(1)}s</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          {Object.entries(roles).map(([pid, role]) => (
            <span key={pid} className={`text-xs px-1.5 py-0.5 rounded ${summary.deadPlayers.includes(pid) ? "bg-red-900/50 text-red-300" : "bg-gray-700 text-gray-300"}`}>
              {ROLE_ICON[role] ?? "?"}{pid}
            </span>
          ))}
        </div>
      </div>

      {/* Phase timeline */}
      {phases.map((phase, pi) => {
        const night = isNight(phase.name)
        const speechEvents = phase.events.filter(e => e.type === "speech:completed")
        const deathEvents = phase.events.filter(e => e.type === "death:player_died")
        const voteEvents = phase.events.filter(e => e.type === "vote:cast" || e.type === "vote:revealed")
        const importantEvents = phase.events.filter(e =>
          !["speech:completed", "death:player_died", "vote:cast", "vote:revealed", "room:player_joined"].includes(e.type as string)
        )

        if (phase.events.length === 0 && phase.name !== "天黑" && phase.name !== "天亮" && phase.name !== "死讯" && phase.name !== "结果") return null

        return (
          <div key={pi} className="relative pl-6 border-l-2 border-gray-700">
            {/* Phase header */}
            <div className={`absolute -left-2 top-0 w-4 h-4 rounded-full ${night ? "bg-indigo-700" : "bg-amber-700"} border-2 border-gray-950`} />
            <div className={`text-xs font-bold mb-2 ${night ? "text-indigo-400" : "text-amber-400"}`}>
              {phase.name}
            </div>

            {/* Deaths */}
            {deathEvents.map((e, i) => {
              const pid = (e.payload as Record<string,unknown>)?.playerId as string
              const cause = (e.payload as Record<string,unknown>)?.cause as string
              return (
                <div key={i} className="ml-2 mb-1 text-xs text-red-400">
                  💀 {pid}({ROLE_NAME[roles[pid] ?? ""] ?? "?"}) 死亡 — {cause === "WOLF_KILL" ? "狼刀" : cause === "VOTE_EXILE" ? "放逐" : cause === "WITCH_POISON" ? "毒杀" : cause}
                </div>
              )
            })}

            {/* Speeches — compact */}
            {speechEvents.map((e, i) => {
              const pid = (e.payload as Record<string,unknown>)?.playerId as string
              const content = (e.payload as Record<string,unknown>)?.fullText as string ?? ""
              return (
                <div key={i} className="ml-2 mb-1 p-2 bg-gray-800/50 rounded text-xs">
                  <span className="text-amber-400">{pid}</span>
                  <span className="text-gray-500 ml-1">({ROLE_NAME[roles[pid] ?? ""] ?? "?"})</span>
                  <span className="text-gray-500 ml-1">{ROLE_ICON[roles[pid] ?? ""] ?? ""}</span>
                  <p className="text-gray-300 mt-0.5">{content}</p>
                </div>
              )
            })}

            {/* Votes */}
            {voteEvents.filter(e => e.type === "vote:revealed").map((e, i) => {
              const votes = (e.payload as Record<string,unknown>)?.votes as { playerId: string; targetId: string | null }[] | undefined
              return (
                <div key={i} className="ml-2 mb-1 text-xs text-gray-400">
                  <span className="text-gray-500">投票: </span>
                  {votes?.map(v => (
                    <span key={v.playerId} className="mr-2">
                      {v.playerId}→{v.targetId ?? "弃票"}
                    </span>
                  ))}
                </div>
              )
            })}

            {/* Other events */}
            {importantEvents.map((e, i) => (
              <div key={i} className="ml-2 mb-1 text-[11px] text-gray-500 font-mono">
                {(e.type as string).replace(/_/g, ".")}
                <span className="ml-2 text-gray-600">{JSON.stringify(e.payload).slice(0, 80)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ══════ Thought Chain ══════

function ThoughtChain({ traces, expanded, setExpanded }: {
  traces: TraceEntry[]
  events?: Record<string,unknown>[]
  expanded: number | null
  setExpanded: (i: number | null) => void
}) {
  if (traces.length === 0) return <EmptyTraces />

  // Match traces with game events to give context
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 mb-2">
        {traces.filter(t => !t.fallbackUsed).length}/{traces.length} 次 LLM 调用成功
        {" · "}总计 {traces.reduce((s, t) => s + t.usage.totalTokens, 0)} tokens
      </div>
      {traces.map((t, i) => {
        const isOpen = expanded === i
        const intent = t.parsedIntent
        return (
          <div key={i} className={`border rounded-lg transition-colors ${isOpen ? "border-amber-700 bg-gray-900" : "border-gray-800 hover:border-gray-700"}`}>
            {/* Header — always visible */}
            <button onClick={() => setExpanded(isOpen ? null : i)}
              className="w-full text-left p-3 flex items-center gap-3"
            >
              <span className="text-lg">{TASK_ICON[t.task] ?? "❓"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{t.playerId}</span>
                  <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{TASK_NAME[t.task] ?? t.task}</span>
                  {t.fallbackUsed && <span className="text-[10px] bg-red-900 px-1 rounded text-red-300">fallback</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {intent?.action?.type && <span className="text-amber-400">{intent.action.type}</span>}
                  {intent?.action?.targetId && <span className="ml-2">→ {intent.action.targetId}</span>}
                  {intent?.speech?.content && <span className="ml-2 text-gray-400 truncate max-w-[300px] inline-block align-bottom">"{intent.speech.content.slice(0,60)}{intent.speech.content.length > 60 ? "…" : ""}"</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-gray-400">{t.latencyMs}ms</div>
                <div className="text-[10px] text-gray-600">{t.usage.totalTokens} tk</div>
              </div>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-3 pb-3 border-t border-gray-800 space-y-3 text-xs">
                {/* Action & Speech */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {intent?.action && (
                    <div className="bg-gray-800 p-2 rounded">
                      <div className="text-gray-400 mb-1">🎯 行动决策</div>
                      <div className="text-amber-400 font-bold">{intent.action.type}</div>
                      <div className="text-gray-300">目标: {intent.action.targetId ?? "无"}</div>
                      {intent.action.reason && <div className="text-gray-400 mt-1">理由: {intent.action.reason}</div>}
                    </div>
                  )}
                  {intent?.speech?.content && (
                    <div className="bg-gray-800 p-2 rounded">
                      <div className="text-gray-400 mb-1">💬 发言</div>
                      <div className="text-gray-300">"{intent.speech.content}"</div>
                      <div className="text-gray-500 mt-1">语气: {intent.speech.tone}</div>
                    </div>
                  )}
                </div>

                {/* Reasoning (DeepSeek thinking process) */}
                {t.reasoning && (
                  <details className="text-gray-600">
                    <summary className="cursor-pointer hover:text-gray-400">🧠 模型思考过程 (reasoning)</summary>
                    <pre className="mt-1 p-2 bg-indigo-950 rounded max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] text-indigo-300">{t.reasoning}</pre>
                  </details>
                )}

                {/* Token & Timing */}
                <div className="flex gap-4 text-gray-500">
                  <span>P: {t.usage.promptTokens}</span>
                  <span>C: {t.usage.completionTokens}</span>
                  <span>T: {t.usage.totalTokens}</span>
                  <span>{t.latencyMs}ms</span>
                  {t.parseError && <span className="text-red-400">⚠ {t.parseError.slice(0, 80)}</span>}
                </div>

                {/* Raw & Prompt — collapsible */}
                <details className="text-gray-600">
                  <summary className="cursor-pointer hover:text-gray-400">原始 JSON 响应</summary>
                  <pre className="mt-1 p-2 bg-gray-950 rounded max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px]">{t.rawResponse}</pre>
                </details>
                <details className="text-gray-600">
                  <summary className="cursor-pointer hover:text-gray-400">System Prompt (前500字)</summary>
                  <pre className="mt-1 p-2 bg-gray-950 rounded max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px]">{t.context.systemPrompt.slice(0, 500)}</pre>
                </details>
                <details className="text-gray-600">
                  <summary className="cursor-pointer hover:text-gray-400">User Prompt</summary>
                  <pre className="mt-1 p-2 bg-gray-950 rounded max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px]">{t.context.userPrompt}</pre>
                </details>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmptyTraces() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500 space-y-3">
      <span className="text-4xl">🧠</span>
      <p className="text-sm">本局无 AI 思维链记录</p>
      <p className="text-xs text-gray-600">Rule-based 模式或 API 未配置时不生成 trace</p>
      <p className="text-xs text-gray-600">设置 OPENAI_API_KEY 启用 LLM AI 后重新运行对局</p>
    </div>
  )
}

// ══════ Events View (compact raw) ══════

function EventsView({ events }: { events: Record<string,unknown>[] }) {
  const [filter, setFilter] = useState("")
  const [visFilter, setVisFilter] = useState("")
  const visibleTypes = ["public", "private", "hidden"]

  const filtered = events.filter(e => {
    if (filter && !(e.type as string).toLowerCase().includes(filter.toLowerCase())) return false
    if (visFilter && (e.visibility as string) !== visFilter) return false
    return true
  })

  return (
    <div className="space-y-1">
      <div className="flex gap-2 mb-3">
        <input className="flex-1 p-1.5 rounded bg-gray-800 border border-gray-700 text-white text-xs" placeholder="过滤类型..." value={filter} onChange={e => setFilter(e.target.value)} />
        <select className="p-1.5 rounded bg-gray-800 border border-gray-700 text-white text-xs" value={visFilter} onChange={e => setVisFilter(e.target.value)}>
          <option value="">全部可见性</option>
          {visibleTypes.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="text-xs text-gray-500 mb-2">显示 {filtered.length}/{events.length} 条</div>
      {filtered.slice(-200).map((e, i) => (
        <div key={i} className="flex gap-2 text-[11px] p-1.5 rounded bg-gray-800/30 hover:bg-gray-800/60 font-mono">
          <span className="text-gray-600 w-8 shrink-0">{e.seq as number}</span>
          <span className={visColor(e.visibility as string) + " w-14 shrink-0"}>{e.visibility as string}</span>
          <span className="text-amber-400 shrink-0 w-40 truncate">{e.type as string}</span>
          <span className="text-gray-500 truncate">{JSON.stringify(e.payload)}</span>
        </div>
      ))}
    </div>
  )
}

function visColor(v: string) { return v === "public" ? "text-green-600" : v === "private" ? "text-amber-600" : "text-gray-600" }

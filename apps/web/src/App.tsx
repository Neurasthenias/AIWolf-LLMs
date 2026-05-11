import { useState } from "react"
import { useGameStore } from "./store/game"
import { GamePage } from "./pages/GamePage"
import { LogViewer } from "./pages/LogViewer"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001"
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001"

type Screen = "menu" | "join" | "game" | "logs"

export default function App() {
  const { connected, connecting, gameId, connect, joinRoom, playerName, setPlayerName, requestCatchup } = useGameStore()
  const [roomCode, setRoomCode] = useState("")
  const [mode, setMode] = useState<"menu" | "join">("menu")
  const [screen, setScreen] = useState<Screen>("menu")

  const ensureConnected = async () => {
    const store = useGameStore.getState()
    if (store.connected) return
    if (!store.socket) {
      await connect(SOCKET_URL)
    }
  }

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, { method: "POST" })
      const data = await res.json()
      await ensureConnected()
      joinRoom(data.gameId, "p1")
      await fetch(`${API_BASE}/api/rooms/${data.gameId}/start`, { method: "POST" })
      // Wait for server to process start + role assignment, then grab state
      await new Promise(r => setTimeout(r, 300))
      requestCatchup()
      setScreen("game")
    } catch {
      alert("无法连接服务器。请先启动: pnpm --filter @aiwolf/server dev")
    }
  }

  const handleJoin = async () => {
    if (!roomCode) return
    try {
      await ensureConnected()
      joinRoom(roomCode, "p1")
      setScreen("game")
    } catch {
      alert("无法连接服务器")
    }
  }

  if (screen === "logs") {
    return <LogViewer onBack={() => setScreen("menu")} />
  }

  if (screen === "game" && gameId && connected) {
    return <GamePage />
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-center text-amber-400">🐺 AI 狼人杀</h1>

        {mode === "menu" && (
          <div className="space-y-4">
            <input className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
              placeholder="你的名字" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            <button onClick={handleCreate} disabled={connecting}
              className="w-full p-3 rounded bg-amber-600 hover:bg-amber-500 font-bold disabled:opacity-50">
              {connecting ? "连接中..." : "创建房间（单人模式）"}
            </button>
            <button onClick={() => setMode("join")} className="w-full p-3 rounded bg-gray-700 hover:bg-gray-600">
              加入房间
            </button>
            <button onClick={() => setScreen("logs")} className="w-full p-3 rounded bg-gray-700 hover:bg-gray-600">
              📋 对局日志
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <input className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
              placeholder="房间号" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
            <button onClick={handleJoin} disabled={connecting}
              className="w-full p-3 rounded bg-amber-600 hover:bg-amber-500 font-bold disabled:opacity-50">
              {connecting ? "连接中..." : "加入"}
            </button>
            <button onClick={() => setMode("menu")} className="w-full p-3 rounded bg-gray-700">返回</button>
          </div>
        )}

        {!connected && !connecting && mode !== "menu" && (
          <p className="text-red-400 text-center text-sm">未连接到服务器</p>
        )}
      </div>
    </div>
  )
}

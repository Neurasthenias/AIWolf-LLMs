import { useState } from "react"
import { useGameStore } from "./store/game"
import { GamePage } from "./pages/GamePage"

export default function App() {
  const { connected, gameId, connect, joinRoom, playerName, setPlayerName, requestCatchup } = useGameStore()
  const [roomCode, setRoomCode] = useState("")
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu")

  const handleCreate = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/rooms", { method: "POST" })
      const data = await res.json()
      setRoomCode(data.gameId)
      if (!connected) connect("http://localhost:3001")
      setTimeout(async () => {
        joinRoom(data.gameId, "p1")
        // Start game
        await fetch(`http://localhost:3001/api/rooms/${data.gameId}/start`, { method: "POST" })
        setTimeout(() => requestCatchup(), 500)
      }, 500)
    } catch {
      alert("Cannot connect to server. Start server first: pnpm --filter @aiwolf/server dev")
    }
  }

  const handleJoin = () => {
    if (!roomCode) return
    if (!connected) connect("http://localhost:3001")
    setTimeout(() => joinRoom(roomCode, "p1"), 300)
  }

  if (gameId && connected) {
    return <GamePage />
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-center text-amber-400">🐺 AI 狼人杀</h1>

        {mode === "menu" && (
          <div className="space-y-4">
            <input
              className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
              placeholder="你的名字"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
            <button onClick={handleCreate} className="w-full p-3 rounded bg-amber-600 hover:bg-amber-500 font-bold">
              创建房间（单人模式）
            </button>
            <button onClick={() => setMode("join")} className="w-full p-3 rounded bg-gray-700 hover:bg-gray-600">
              加入房间
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <input
              className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
              placeholder="房间号"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value)}
            />
            <button onClick={handleJoin} className="w-full p-3 rounded bg-amber-600 hover:bg-amber-500 font-bold">
              加入
            </button>
            <button onClick={() => setMode("menu")} className="w-full p-3 rounded bg-gray-700">返回</button>
          </div>
        )}

        {!connected && mode !== "menu" && (
          <p className="text-red-400 text-center text-sm">未连接到服务器</p>
        )}
      </div>
    </div>
  )
}

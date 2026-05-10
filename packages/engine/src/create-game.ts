import type { GameState, GameConfig } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

export function createGame(config: GameConfig): GameState {
  const gameId = uuidv7()
  const players: GameState["players"] = {}

  for (let seat = 1; seat <= config.maxPlayers; seat++) {
    const id = `p${seat}`
    players[id] = {
      id,
      name: `Player ${seat}`,
      seat,
      role: "villager",
      faction: "good",
      isAlive: true,
      isAI: seat !== 1,
      isHost: seat === 1,
    }
  }

  return {
    gameId,
    version: "1.0",
    phase: { type: "WAITING", subPhase: "WAITING_PLAYERS", round: 1, dayNumber: 1 },
    players,
    witchPotions: { hasSave: true, hasPoison: true },
    sheriffId: null,
    sheriffElectionDone: false,
    tieBreakCount: 0,
    startedAt: Date.now(),
    lastEventSeq: 0,
    speeches: [],
  }
}

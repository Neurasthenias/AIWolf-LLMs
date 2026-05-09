import type { Command, GameEvent } from "@aiwolf/shared/types"
import type { GameState } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

export function handleCommand(command: Command, state: GameState): GameEvent[] {
  const base = {
    gameId: command.gameId,
    causationId: command.id,
    correlationId: command.id,
    timestamp: Date.now(),
    version: "1.0",
    schemaVersion: "1.0",
  }

  switch (command.type) {
    case "room:join":
      return [{
        ...base,
        id: uuidv7(),
        seq: state.lastEventSeq + 1,
        type: "room:player_joined",
        visibility: "public" as const,
        payload: command.payload,
      }]

    default:
      return []
  }
}

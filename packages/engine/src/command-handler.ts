import type { Command, GameEvent, GameState } from "@aiwolf/shared/types"
import { v7 as uuidv7 } from "uuid"

export function handleCommand(command: Command, state: GameState): GameEvent[] {
  const base = {
    gameId: command.gameId,
    causationId: command.id,
    correlationId: command.id,
    timestamp: Date.now(),
    version: "1.0",
    schemaVersion: "1.0",
    idempotencyKey: command.idempotencyKey,
  }

  switch (command.type) {
    // ── Room ──
    case "room:join":
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "room:player_joined", visibility: "public" as const,
        payload: command.payload,
      }]
    case "room:start":
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "room:locked", visibility: "public" as const,
        payload: {},
      }]

    // ── Role Assignment (batch) ──
    case "role:assign_batch": {
      const assignments = command.payload as { assignments: Record<string, { role: string; faction: string }> }
      let seq = state.lastEventSeq
      const roleEvents: GameEvent[] = []
      for (const [playerId, { role, faction }] of Object.entries(assignments.assignments)) {
        seq++
        roleEvents.push({
          ...base, id: uuidv7(), seq,
          type: "role:assigned", visibility: "private",
          visibleTo: [playerId],
          payload: { playerId, role, faction },
        })
      }
      // Teammates reveal for wolves
      const wolfIds = Object.entries(assignments.assignments)
        .filter(([, { role }]) => role === "werewolf")
        .map(([id]) => id)
      if (wolfIds.length > 1) {
        for (const id of wolfIds) {
          seq++
          roleEvents.push({
            ...base, id: uuidv7(), seq,
            type: "role:teammates_revealed", visibility: "private",
            visibleTo: [id],
            payload: { playerId: id, teammates: wolfIds.filter(t => t !== id) },
          })
        }
      }
      return roleEvents
    }

    // ── Phase Transition ──
    case "phase:advance": {
      const { to, round } = command.payload as { to: string; round: number }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "phase:transitioned", visibility: "public" as const,
        payload: { from: state.phase.subPhase, to, round },
      }]
    }

    // ── Night Actions ──
    case "night:wolf_kill":
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "wolf:proposal_submitted", visibility: "private",
        visibleTo: getWolfIds(state),
        payload: { playerId: command.actorId, targetId: (command.payload as { targetId: string }).targetId, reason: "" },
      }]
    case "night:wolf_kill_resolved": {
      const { targetId } = command.payload as { targetId: string }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "death:player_died", visibility: "public" as const,
        payload: { playerId: targetId, cause: "WOLF_KILL", round: state.phase.round },
      }]
    }
    case "night:seer_check": {
      const { targetId, result } = command.payload as { targetId: string; result: string }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "role:seer_result", visibility: "private",
        visibleTo: [command.actorId],
        payload: { playerId: command.actorId, targetId, result },
      }]
    }
    case "night:witch_action": {
      const { saveTargetId, poisonTargetId } = command.payload as { saveTargetId?: string; poisonTargetId?: string }
      const events: GameEvent[] = [
        {
          ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
          type: "witch:action_submitted", visibility: "private",
          visibleTo: [command.actorId],
          payload: { playerId: command.actorId, saveTargetId, poisonTargetId },
        },
      ]
      return events
    }

    // ── Speech ──
    case "speech:submit":
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "speech:completed", visibility: "public" as const,
        payload: { playerId: command.actorId, fullText: (command.payload as { content: string }).content, duration: 0 },
      }]

    // ── Vote ──
    case "vote:cast":
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "vote:cast", visibility: "hidden" as const,
        payload: { playerId: command.actorId, targetId: (command.payload as { targetId: string | null }).targetId },
      }]

    // ── Vote Reveal ──
    case "vote:reveal": {
      const { votes } = command.payload as { votes: { playerId: string; targetId: string | null }[] }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "vote:revealed", visibility: "public" as const,
        payload: { votes },
      }]
    }

    // ── Day Break Announcement ──
    case "death:announce": {
      const { deaths, isSafeNight } = command.payload as { deaths: { playerId: string; cause: string }[]; isSafeNight: boolean }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "death:day_break_announcement", visibility: "public" as const,
        payload: { deaths, isSafeNight },
      }]
    }

    // ── Exile ──
    case "player:exile": {
      const { playerId } = command.payload as { playerId: string }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "death:player_died", visibility: "public" as const,
        payload: { playerId, cause: "VOTE_EXILE", round: state.phase.round },
      }]
    }

    // ── End Game ──
    case "game:end": {
      const { winner, mvp, svp } = command.payload as { winner: string; mvp: string; svp: string }
      return [{
        ...base, id: uuidv7(), seq: state.lastEventSeq + 1,
        type: "game:ended", visibility: "public" as const,
        payload: { winner, mvp, svp, reason: "win_condition_met" },
      }]
    }

    default:
      return []
  }
}

function getWolfIds(state: GameState): string[] {
  return Object.values(state.players)
    .filter(p => p.role === "werewolf")
    .map(p => p.id)
}

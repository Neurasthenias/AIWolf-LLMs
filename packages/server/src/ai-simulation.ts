import { getOrCreateGame } from "./runtime"
import { createGame, assignRoles } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"
import * as fs from "node:fs"
import * as path from "node:path"
import type { AIProviderConfig } from "@aiwolf/ai"

export interface GameResult {
  gameId: string
  shortId?: string
  winner: string | null
  mvp: string
  svp: string
  totalEvents: number
  rounds: number
  durationMs: number
  deadPlayers: string[]
  roleAssignments: Record<string, string>
  error?: string
}

export async function runAISimulation(
  count: number,
  config?: AIProviderConfig,
  savedir = ".data/games",
): Promise<GameResult[]> {
  fs.mkdirSync(savedir, { recursive: true })
  const results: GameResult[] = []

  for (let i = 0; i < count; i++) {
    const start = Date.now()
    const gameId = uuidv7()
    console.log(`[sim:ai] Game ${i + 1}/${count} starting (${gameId.slice(0, 8)}...)`)

    try {
      const runtime = getOrCreateGame(gameId)
      runtime.autoPlay = true
      if (config) runtime.setAIConfig(config)

      // Create game state with all AI players
      const state = createGame({
        roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
        minPlayers: 6, maxPlayers: 6,
        rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
        timeouts: { speech: 180, vote: 15, night: 15 },
      })

      // Mark ALL players as AI (no human in simulation)
      for (const pid of Object.keys(state.players)) {
        state.players[pid] = { ...state.players[pid]!, isAI: true }
      }

      // Assign roles
      const assigned = assignRoles(state.players, {
        roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 },
        minPlayers: 6, maxPlayers: 6,
        rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" },
        timeouts: { speech: 180, vote: 15, night: 15 },
      }, Date.now() + i * 1000)

      // Save initial state
      runtime.initState(state)

      // Dispatch role assignment
      await runtime.dispatch({
        id: uuidv7(), version: "1.0", type: "role:assign_batch",
        gameId, actorId: "system", timestamp: Date.now(),
        payload: { assignments: assigned },
      })

      // Dispatch start → auto-advance will chain through the game
      await runtime.dispatch({
        id: uuidv7(), version: "1.0", type: "phase:advance",
        gameId, actorId: "system", timestamp: Date.now(),
        payload: { to: "ROLE_ASSIGNMENT", round: 1 },
      })

      // Wait for game to complete (poll state, max 60s for AI calls)
      const maxWait = config ? 60000 : 5000
      const startWait = Date.now()
      while (!runtime.getState().gameOver && Date.now() - startWait < maxWait) {
        await new Promise(r => setTimeout(r, 200))
      }

      const finalState = runtime.getState()
      const roleAssignments: Record<string, string> = {}
      for (const [id, p] of Object.entries(finalState.players)) {
        roleAssignments[id] = p.role
      }

      const result: GameResult = {
        gameId: gameId,
        shortId: gameId.slice(0, 8),
        winner: finalState.gameOver?.winner ?? null,
        mvp: finalState.gameOver?.mvp ?? "",
        svp: finalState.gameOver?.svp ?? "",
        totalEvents: finalState.lastEventSeq,
        rounds: finalState.phase.round,
        durationMs: Date.now() - start,
        deadPlayers: Object.values(finalState.players).filter(p => !p.isAlive).map(p => p.id),
        roleAssignments,
      }

      // Save summary
      fs.writeFileSync(
        path.join(savedir, `${gameId}.summary.json`),
        JSON.stringify(result, null, 2),
        "utf-8",
      )

      results.push(result)
      console.log(`[sim:ai] Game ${i + 1}/${count} done — winner: ${result.winner}, rounds: ${result.rounds}, events: ${result.totalEvents}, ${result.durationMs}ms`)
    } catch (err) {
      const error = (err as Error).message
      console.error(`[sim:ai] Game ${i + 1}/${count} FAILED: ${error}`)
      results.push({
        gameId: gameId,
        shortId: gameId.slice(0, 8),
        winner: null,
        mvp: "", svp: "",
        totalEvents: 0, rounds: 0,
        durationMs: Date.now() - start,
        deadPlayers: [],
        roleAssignments: {},
        error,
      })
    }
  }

  // Save aggregate index
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => !r.error).length,
    failed: results.filter(r => r.error).length,
    winnerDistribution: {
      good: results.filter(r => r.winner === "good").length,
      wolf: results.filter(r => r.winner === "wolf").length,
    },
    results,
  }
  fs.writeFileSync(path.join(savedir, "index.json"), JSON.stringify(summary, null, 2), "utf-8")
  console.log(`[sim:ai] Complete. ${summary.successful}/${summary.total} games saved to ${savedir}/`)

  return results
}

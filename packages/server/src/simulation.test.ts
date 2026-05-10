import { describe, it, expect } from "vitest"
import { runAISimulation } from "./ai-simulation"
import * as fs from "node:fs"

describe("AI Simulation", () => {
  it("runs 1 game to completion (rule-based, no API)", async () => {
    const results = await runAISimulation(1, undefined, ".data/games/test")
    expect(results).toHaveLength(1)
    expect(results[0]!.error).toBeUndefined()
    expect(results[0]!.winner).toBeDefined()
    expect(results[0]!.totalEvents).toBeGreaterThan(10)
    console.log(`Test game: winner=${results[0]!.winner} rounds=${results[0]!.rounds} events=${results[0]!.totalEvents}`)
  }, 30000)

  it("runs 10 games and saves data correctly", async () => {
    const savedir = ".data/games/10test"
    const results = await runAISimulation(10, undefined, savedir)

    expect(results).toHaveLength(10)
    // All games should have a winner
    expect(results.every(r => r.winner && !r.error)).toBe(true)

    // Check saved files
    const index = JSON.parse(fs.readFileSync(`${savedir}/index.json`, "utf-8"))
    expect(index.total).toBe(10)
    expect(index.successful).toBe(10)
    expect(index.failed).toBe(0)

    // Each game should have a summary file
    for (const r of results) {
      const summaryPath = `${savedir}/${r.gameId}.summary.json`
      expect(fs.existsSync(summaryPath)).toBe(true)
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"))
      expect(summary.winner).toBeDefined()
      expect(summary.totalEvents).toBeGreaterThan(10)
    }

    console.log(`10-game results: good=${index.winnerDistribution.good} wolf=${index.winnerDistribution.wolf}`)
  }, 60000)
})

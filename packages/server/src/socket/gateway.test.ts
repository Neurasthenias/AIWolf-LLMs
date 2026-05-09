import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer } from "node:http"
import { Server as SocketServer } from "socket.io"
import { io as ClientIO, Socket as ClientSocket } from "socket.io-client"
import { getOrCreateGame } from "../runtime"
import { createGame, assignRoles } from "@aiwolf/engine"
import { v7 as uuidv7 } from "uuid"
import { createGateway } from "./gateway"

const TEST_PORT = 3099

describe("Socket.IO — Integration", () => {
  let httpServer: ReturnType<typeof createServer>
  let io: SocketServer

  beforeAll(async () => {
    httpServer = createServer()
    io = createGateway(httpServer)
    await new Promise<void>(resolve => httpServer.listen(TEST_PORT, resolve))
  })

  afterAll(() => {
    io.close()
    httpServer.close()
  })

  function createClient(): ClientSocket {
    return ClientIO(`http://localhost:${TEST_PORT}`, {
      transports: ["websocket"],
      forceNew: true,
    })
  }

  it("client joins room and receives event", async () => {
    const gameId = uuidv7()
    const runtime = getOrCreateGame(gameId)

    const client = createClient()
    const events: unknown[] = []

    await new Promise<void>((resolve) => {
      client.on("connect", () => {
        client.emit("room:join", { gameId, playerId: "p1", playerName: "Alice" })
        // Dispatch AFTER client subscribes
        setTimeout(async () => {
          await runtime.dispatch({
            id: uuidv7(), version: "1.0", type: "phase:advance",
            gameId, actorId: "system", timestamp: Date.now(),
            payload: { to: "NIGHT_ANNOUNCE", round: 1 },
          })
          setTimeout(resolve, 200)
        }, 100)
      })
      client.on("game:event", (event) => {
        events.push(event)
      })
    })

    expect(events.length).toBeGreaterThan(0)
    client.close()
  })

  it("two clients see same public events", async () => {
    const gameId = uuidv7()
    const runtime = getOrCreateGame(gameId)

    const client1 = createClient()
    const client2 = createClient()
    const events1: unknown[] = []
    const events2: unknown[] = []

    await new Promise<void>((resolve) => {
      let connected = 0
      const onConnect = () => {
        connected++
        if (connected === 2) {
          client1.emit("room:join", { gameId, playerId: "p1", playerName: "Alice" })
          client2.emit("room:join", { gameId, playerId: "p2", playerName: "Bob" })

          // Dispatch a public event
          setTimeout(async () => {
            await runtime.dispatch({
              id: uuidv7(), version: "1.0", type: "phase:advance",
              gameId, actorId: "system", timestamp: Date.now(),
              payload: { to: "NIGHT_ANNOUNCE", round: 1 },
            })
            setTimeout(resolve, 200)
          }, 100)
        }
      }

      client1.on("connect", onConnect)
      client2.on("connect", onConnect)
      client1.on("game:event", (e) => events1.push(e))
      client2.on("game:event", (e) => events2.push(e))
    })

    expect(events1.length).toBeGreaterThan(0)
    expect(events2.length).toBeGreaterThan(0)
    // Both should see the phase transition
    expect(events1.some((e: any) => e.type === "phase:transitioned")).toBe(true)
    expect(events2.some((e: any) => e.type === "phase:transitioned")).toBe(true)

    client1.close()
    client2.close()
  })

  it("private events are filtered per player", async () => {
    const gameId = uuidv7()
    const runtime = getOrCreateGame(gameId)
    const state = createGame({ roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 }, minPlayers: 6, maxPlayers: 6, rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" }, timeouts: { speech: 180, vote: 15, night: 15 } })
    const assigned = assignRoles(state.players, testConfig, 42)

    // p1 = seer, p2 = werewolf
    const client1 = createClient()
    const client2 = createClient()
    const events1: any[] = []
    const events2: any[] = []

    await new Promise<void>((resolve) => {
      let connected = 0
      const onConnect = () => {
        connected++
        if (connected === 2) {
          client1.emit("room:join", { gameId, playerId: "p1", playerName: "Alice" })
          client2.emit("room:join", { gameId, playerId: "p2", playerName: "Bob" })

          setTimeout(async () => {
            // Dispatch private seer result visible only to p1
            await runtime.dispatch({
              id: uuidv7(), version: "1.0", type: "night:seer_check",
              gameId, actorId: "p1", timestamp: Date.now(),
              payload: { targetId: "p3", result: "wolf" },
            })
            setTimeout(resolve, 200)
          }, 100)
        }
      }

      client1.on("connect", onConnect)
      client2.on("connect", onConnect)
      client1.on("game:event", (e: any) => events1.push(e))
      client2.on("game:event", (e: any) => events2.push(e))
    })

    // p1 (seer) should see the seer result
    expect(events1.some((e: any) => e.type === "role:seer_result")).toBe(true)
    // p2 (player, not seer) should NOT see the seer result
    expect(events2.some((e: any) => e.type === "role:seer_result")).toBe(false)

    client1.close()
    client2.close()
  })

  it("reconnect via catchup restores player view", async () => {
    const gameId = uuidv7()
    const runtime = getOrCreateGame(gameId)

    // Pre-populate with events
    await runtime.dispatch({
      id: uuidv7(), version: "1.0", type: "room:join",
      gameId, actorId: "p1", timestamp: Date.now(),
      payload: { playerId: "p1", name: "Alice", seat: 1 },
    })
    await runtime.dispatch({
      id: uuidv7(), version: "1.0", type: "phase:advance",
      gameId, actorId: "system", timestamp: Date.now(),
      payload: { to: "NIGHT_ANNOUNCE", round: 1 },
    })

    const client = createClient()
    let view: any = null

    await new Promise<void>((resolve) => {
      client.on("connect", () => {
        client.emit("room:join", { gameId, playerId: "p1", playerName: "Alice" })
        // Simulate reconnect by requesting catchup
        setTimeout(() => {
          client.emit("game:catchup", { gameId, playerId: "p1", fromSeq: 0 })
        }, 100)
      })
      client.on("game:state_snapshot", (v) => {
        view = v
        resolve()
      })
    })

    expect(view).toBeDefined()
    expect(view.view).toBeDefined()
    expect(view.view.self.id).toBe("p1")

    client.close()
  })
})

const testConfig = {
  roles: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 } as Record<string, number>,
  minPlayers: 6, maxPlayers: 6,
  rules: { hasSheriff: false, witchSelfSave: false, lastWords: "first_night_and_first_vote" as const },
  timeouts: { speech: 180, vote: 15, night: 15 },
}

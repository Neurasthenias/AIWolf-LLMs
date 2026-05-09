# AI狼人杀 — Effect 运行时规范

> 版本：v1.0 | Phase 1 基线 | 2026-05-09

---

## 1. Runtime 目标

Effect Runtime 是 Reducer 与外部世界的唯一桥梁。它的目标是：

1. **保持 Reducer 确定性** — 副作用全部外移，Event 顺序可重现
2. **隔离故障** — 单个 Effect 失败不污染 GameState
3. **支持取消** — Phase 切换时安全终止旧 Effect
4. **Replay 兼容** — 回放模式下跳过副作用，只重放 Event

---

## 2. Runtime 边界

```
                    ┌─ Effect Runtime ─┐
                    │                  │
dispatchCommand() ──│→ Reducer (PURE) ─│→ { newState, effects[] }
                    │       ↓          │
                    │  effects[]       │
                    │       ↓          │
                    │  runEffects()    │──→ Timer / AI / Socket / DB
                    │       ↓          │
                    │  产生的新 Event   │──→ 重新进入 Command Bus ↺
                    └──────────────────┘
```

**原则**：
- Runtime 不能直接修改 `GameState`
- Runtime 只能通过 `dispatchCommand()` 注入新 Event
- Reducer 内部不执行任何 I/O

---

## 3. 调度模型：串行 Event + 并发 Effect

```
时间轴：

Command A ──→ Reducer ──→ effects[a1, a2]
                              │
Command B ──→ Reducer ──→ effects[b1]     ← 等待 A 的 Event 先落地
                              │
Command C ──→ Reducer ──→ effects[c1]     ← 等待 B 的 Event 先落地

effects 内部并发：
  a1(Timer) ═══╗
  a2(AI)    ═══╬══ 并发执行
  b1(Socket)═══╝
```

**关键决定**：`dispatchCommand()` **必须串行**。多个 Command 不能并发进入 Reducer，否则 Event 顺序不可重现。Effect 可以并发执行。

```typescript
// 全局锁
let dispatchLock = false

async function dispatchCommand(state: GameState, command: Command) {
  if (dispatchLock) throw new Error("Another dispatch in progress")
  dispatchLock = true
  try {
    // 1. Handler → Events（串行）
    const events = handleCommand(command, state)

    // 2. Reducer → Effects（串行、确定性）
    const { newState, effects } = reduce(state, events)

    // 3. 持久化事件（串行）
    await eventStore.append(gameId, events)

    // 4. 执行 Effect（并发）
    await Promise.allSettled(effects.map(e => runEffect(e, newState)))

    return { newState, events, effects }
  } finally {
    dispatchLock = false
  }
}
```

---

## 4. Effect 生命周期

```
创建 ──→ 排队 ──→ 执行中 ──→ 完成
                      │
                      ├──→ 失败（重试）
                      ├──→ 取消（Phase 切换）
                      └──→ 超时（降级）
```

```typescript
interface EffectBase {
  id: string
  type: string
  phaseId: string         // 创建时的 Phase ID（用于 stale check）
  gameId: string
  createdAt: number
  timeoutMs?: number
  retry?: RetryPolicy
  dedupeKey?: string

  // 状态（Runtime 维护）
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "stale"
  startedAt?: number
  completedAt?: number
  error?: string
}

interface RetryPolicy {
  maxRetries: number
  backoffMs: number       // 初始退避
  backoffMultiplier: number
}
```

---

## 5. Timer Runtime

```typescript
type TimerEffect = EffectBase & {
  type: "timer:start"
  duration: number        // ms
  onExpire: GameEvent     // 超时时生成的 Event
}

// 执行
async function runTimer(effect: TimerEffect, state: GameState): Promise<void> {
  await sleep(effect.duration)

  // stale check
  if (state.phase.id !== effect.phaseId) return  // Phase 已变，丢弃

  // 将超时 Event 注入 Command Bus
  await dispatchCommand(state, {
    type: "__internal",
    actorId: "system",
    payload: { event: effect.onExpire },
    // ...
  })
}
```

**Phase 切换时取消所有 Timer**：

```typescript
function onPhaseChange(oldPhase: string, newPhase: string): void {
  cancelEffects(e => e.type === "timer:start" && e.phaseId === oldPhase)
}
```

---

## 6. AI Runtime

```typescript
type AIRequestEffect = EffectBase & {
  type: "ai:request"
  playerId: string
  task: "speech" | "vote" | "wolf_kill" | "seer_check" | "witch_action" | "last_words" | "hunter_shoot"
  context: AIContext       // 已通过 Projection 过滤
  budgetLevel: "primary" | "fallback" | "light"
}

async function runAI(effect: AIRequestEffect, state: GameState): Promise<void> {
  // 1. stale check
  if (state.phase.id !== effect.phaseId) {
    effect.status = "stale"
    return
  }

  // 2. 选择模型
  const provider = selectProvider(effect.budgetLevel)

  // 3. 调用 LLM（异步，不阻塞主循环）
  const response = await withTimeout(
    provider.generate(effect.context),
    effect.timeoutMs || 60000
  )

  // 4. 解析
  const intent = parseAIResponse(response)

  // 5. 注入 Command Bus（人类和 AI 同路径）
  await dispatchCommand(state, {
    type: "ai:intent",
    actorId: effect.playerId,
    payload: intent,
    causationId: effect.id,
    // ...
  })
}
```

**关键约束**：
- AI 调用不在 `dispatchCommand()` 内部 → 不阻塞事件循环
- 同玩家的 AI 请求严格串行（新的取消旧的）
- `phaseId` 检查防止晚到响应污染状态

---

## 7. Broadcast Runtime

```typescript
type BroadcastEffect = EffectBase & {
  type: "socket:broadcast" | "socket:whisper"
  eventType: string
  payload: unknown
  playerId?: string       // whisper 时指定
}

async function runBroadcast(effect: BroadcastEffect, state: GameState): Promise<void> {
  const message: ServerMessage = {
    type: effect.eventType,
    id: effect.id,
    gameId: effect.gameId,
    timestamp: Date.now(),
    payload: effect.payload,
  }

  if (effect.type === "socket:broadcast") {
    io.to(effect.gameId).emit(message.type, message)
  } else {
    io.to(effect.playerId!).emit(message.type, message)
  }
}

// 失败处理：忽略（客户端下次重连补发事件）
// 客户端通过 seenMessageIds 去重
```

---

## 8. Persist Runtime

```typescript
type PersistEffect = EffectBase & {
  type: "persist:events" | "persist:snapshot"
  events?: GameEvent[]
  snapshot?: GameSnapshot
}

async function runPersist(effect: PersistEffect, state: GameState): Promise<void> {
  if (effect.type === "persist:events" && effect.events) {
    await eventStore.append(effect.gameId, effect.events)
  }
  if (effect.type === "persist:snapshot" && effect.snapshot) {
    await eventStore.saveSnapshot(effect.snapshot)
  }
}
```

---

## 9. Cancellation Model

```typescript
// 取消指定 Effect
function cancelEffect(effectId: string): void

// 按条件取消
function cancelEffects(predicate: (e: EffectBase) => boolean): void

// 取消场景
const cancellationRules = {
  // Phase 切换 → 取消所有旧 Phase 的 Timer 和 AI 请求
  phaseChange: (oldPhaseId: string) => {
    cancelEffects(e =>
      (e.type === "timer:start" || e.type === "ai:request") &&
      e.phaseId === oldPhaseId
    )
  },

  // 同一玩家新 AI 请求 → 取消旧请求
  duplicateAIRequest: (playerId: string, newEffectId: string) => {
    cancelEffects(e =>
      e.type === "ai:request" &&
      e.playerId === playerId &&
      e.id !== newEffectId
    )
  },

  // 房间销毁 → 取消所有
  roomDestroy: (gameId: string) => {
    cancelEffects(e => e.gameId === gameId)
  }
}
```

---

## 10. Retry & Idempotency

| Effect 类型 | 重试策略 | 幂等键 |
|-------------|----------|--------|
| Timer | 不重试 | — |
| AI Request | 最多 2 次（切换备用模型） | `ai:{playerId}:{task}:{phaseId}` |
| Broadcast | 不重试（客户端重连补发） | — |
| Persist | 最多 3 次（exponential backoff） | `persist:{gameId}:{lastEventId}` |

```typescript
async function runEffectWithRetry(effect: EffectBase, state: GameState): Promise<void> {
  if (effect.dedupeKey && recentlyProcessed.has(effect.dedupeKey)) {
    return  // 幂等跳过
  }

  let lastError: Error | null = null
  const maxRetries = effect.retry?.maxRetries || 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await runEffect(effect, state)
      recentlyProcessed.add(effect.dedupeKey, { ttl: 60000 })
      return
    } catch (err) {
      lastError = err as Error
      if (attempt < maxRetries) {
        await sleep(effect.retry!.backoffMs * Math.pow(effect.retry!.backoffMultiplier, attempt))
      }
    }
  }

  effect.status = "failed"
  effect.error = lastError?.message
}
```

---

## 11. Replay 兼容性

回放模式下，Runtime 行为切换：

```typescript
const REPLAY_MODE: boolean = process.env.REPLAY === "true"

function buildEffectRuntime() {
  if (REPLAY_MODE) {
    return {
      // 回放模式：跳过所有副作用
      runTimer: () => Promise.resolve(),
      runAI: () => Promise.resolve(),
      runBroadcast: () => Promise.resolve(),
      runPersist: () => Promise.resolve(),
    }
  }
  return {
    runTimer,
    runAI,
    runBroadcast,
    runPersist,
  }
}
```

回放时只执行 `reduce(state, events)` 链，不触发副作用。Timer Event 直接从事件流读取（不是真实时钟）。

---

## 12. 不变量（Runtime Invariants）

这些规则在测试中自动断言，任何违反视为 Bug：

1. **只有 Event 可以改变 State** — Timer/AI/Socket/DB 都不能直接修改 GameState
2. **Reducer 内部零 I/O** — 无 await、无网络、无文件
3. **dispatchCommand 串行** — 同时最多一个 Command 在处理
4. **Event 顺序确定性** — 相同 seed + 相同 Command 序列 → 相同 Event 序列
5. **Phase 切换取消旧 Effect** — 无泄漏 Timer / AI 请求
6. **AI 响应带 phaseId stale check** — 晚到响应不污染状态
7. **Broadcast 幂等** — 同一 dedupeKey 不重复推送
8. **回放与实时一致** — `replayState(events) === 实时运行得到的 State`

---

## 13. Runtime 配置

```typescript
interface RuntimeConfig {
  // Timer
  timerTickInterval: number      // Timer 检查间隔 ms（默认 1000）

  // AI
  aiDefaultTimeout: number       // AI 调用超时 ms（默认 60000）
  aiFallbackModel: string        // 备用模型
  aiMaxRetries: number           // 最大重试次数

  // Persist
  persistBatchSize: number       // 批量写入事件数（默认 50）
  snapshotInterval: number       // Snapshot 间隔事件数（默认 50）

  // Cleanup
  maxPendingEffects: number      // 最大待处理 Effect 数（默认 1000）
  effectGCTimeout: number        // 完成/失败 Effect 保留时间 ms（默认 60000）
}
```

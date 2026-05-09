# AI狼人杀 — 引擎公共 API

> 版本：v1.0 | Phase 1 基线 | 2026-05-09

---

## 1. 设计约束

- Engine 包是 **Headless** 的——不依赖 Socket、React、DB
- 所有方法是 **纯数据进、纯数据出**——输入 State/Event/Command，输出 State/Effects
- Engine 不执行副作用——Effect 交给 Server 层的 Effect Runtime
- 所有方法必须可以在 CLI、Test、Replay、Server 中无差异调用

---

## 2. 核心 API

### 2.1 游戏生命周期

```typescript
// 创建新游戏（返回初始 State）
function createGame(config: GameConfig): GameState

// 分发 Command（人类/AI 同路径）
function dispatchCommand(state: GameState, command: Command): { newState: GameState; events: GameEvent[]; effects: Effect[] }

// 订阅事件流（回调模式）
function subscribe(state: GameState, eventTypes: string[]): AsyncIterable<GameEvent>

// 获取当前状态
function getState(gameId: string): GameState
```

### 2.2 回放

```typescript
// 加载历史对局事件流
function loadEvents(gameId: string): Promise<GameEvent[]>

// 从事件流重现 State（纯函数，可验证）
function replayState(events: GameEvent[], fromSnapshot?: GameSnapshot): GameState

// 从某个 eventId 之后回放（支持快进）
function replayFrom(events: GameEvent[], afterEventId: string): GameState
```

### 2.3 模拟

```typescript
// 自动运行 N 局（蒙特卡洛/压测用）
function simulate(config: GameConfig, options: SimulateOptions): Promise<SimulationResult[]>

interface SimulateOptions {
  numGames: number
  aiStrategy: "rule_based" | "llm"    // Rule-based 用于压测，LLM 用于质测
  seed?: number                        // 确定性 seed
  parallel?: number                    // 并发局数
  onEvent?: (gameId: string, event: GameEvent) => void  // 回调
}

interface SimulationResult {
  gameId: string
  events: GameEvent[]
  winner: FactionType
  roundCount: number
  mvp: string
  svp: string
  error?: string
  aiTraceIds?: string[]     // 关联的 Prompt Trace ID
}
```

### 2.4 Snapshot

```typescript
// 创建快照
function createSnapshot(state: GameState, lastEventId: string): GameSnapshot

// 从快照恢复
function restoreFromSnapshot(snapshot: GameSnapshot, validateChecksum?: boolean): GameState
```

---

## 3. 辅助 API

```typescript
// Projection：构建玩家视角
function buildPlayerView(state: GameState, playerId: string): PlayerView

// 判断胜负
function checkWinCondition(state: GameState): { isOver: boolean; winner?: FactionType }

// 选举 MVP/SVP
function electMVP(state: GameState, events: GameEvent[]): { mvp: string; svp: string }

// Token Budget 查询
function estimateTokens(config: GameConfig, playerCount: number): { perCall: number; perGame: number }

// 验证配置合法性
function validateConfig(config: GameConfig): ValidationResult
```

---

## 4. 使用示例

### 4.1 CLI 模拟

```bash
node packages/engine/cli.js simulate --template=6_player --rounds=100 --seed=42
```

### 4.2 Server 端集成

```typescript
// 创建房间
const state = createGame(config)
await eventStore.append(state.gameId, [])

// 处理玩家投票
const command: Command = {
  id: uuidv7(), type: "vote:cast", gameId, actorId: "p1",
  timestamp: Date.now(), payload: { targetId: "p3" }, version: "1.0"
}
const { newState, events, effects } = dispatchCommand(state, command)

// 持久化事件
await eventStore.append(gameId, events)

// 执行副作用
await effectRuntime.run(effects)

// 广播给客户端
io.to(gameId).emit("game:events_batch", { events })
```

### 4.3 测试

```typescript
// 蒙特卡洛压测
const results = await simulate(
  { template: "6_player", roles: { werewolf: 2, villager: 2, seer: 1, witch: 1 } },
  { numGames: 1000, aiStrategy: "rule_based", seed: 42, parallel: 10 }
)

// 断言
expect(results.every(r => !r.error)).toBe(true)
expect(results.filter(r => r.winner === "wolf").length).toBeGreaterThan(0)
expect(results.filter(r => r.winner === "good").length).toBeGreaterThan(0)

// 不变量检查
for (const result of results) {
  const deaths = result.events.filter(e => e.type === "death:player_died").length
  const totalPlayers = 6
  expect(deaths + countAlive(result.events)).toBe(totalPlayers)
}
```

---

## 5. 不应存在的 API（防止滥用）

以下行为 **禁止** 通过 Engine API 实现，必须是 Engine 内部逻辑：

- ❌ 直接修改 `GameState.players[id].isAlive` → 只能通过 `dispatchCommand()` → Reducer
- ❌ 跳过 Validator 直接插入事件 → 只能通过 Command Handler 生成事件
- ❌ Engine 层调用 LLM → AI 调用是 Effect，由 Server 层执行
- ❌ Engine 层 emit Socket 事件 → Socket 是 Effect，由 Server 层执行

---

## 6. API 稳定性承诺

Phase 1 冻结后，以下接口 **不兼容修改**（只增不减）：
- `createGame(config)` — config 可扩展，不删字段
- `dispatchCommand(state, command)` — command 可新增类型，不删
- `replayState(events)` — 旧事件通过 upcast 兼容
- `buildPlayerView(state, playerId)` — PlayerView 可新增字段，不删

新增功能通过 **新接口** 暴露，不修改已有接口签名。

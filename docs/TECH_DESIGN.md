# AI狼人杀 — 技术方案设计

> 版本：v1.0-draft | 2026-05-09 | Phase 1

---

## 1. 文档导航

本方案是 `REQUIREMENTS.md` 的技术落地。阅读前需熟悉需求文档的架构约束：

- **不可变原则**（§4.5 of DEVELOPMENT.md）：Reducer 纯函数、AI 只出 Intent、Effect 显式、Engine Headless
- **模块依赖边界**（§4.4 of DEVELOPMENT.md）：engine 禁依赖 ai/server，前端禁依赖 engine
- **事件溯源**：`GameState = reduce(events)`，不直接改 state
- **Functional Core / Imperative Shell**：Reducer 纯函数 + Effect Runtime 副作用

---

## 2. 项目结构

```
/aiwolf
├─ packages/
│   ├─ shared/          ← 共享类型 + Zod Schema（Event、Intent、State、Config）
│   ├─ protocol/        ← 协议定义（Event types、Command types、Socket payloads）
│   ├─ engine/          ← 游戏引擎（Headless、纯逻辑）
│   │   ├─ src/
│   │   │   ├─ state-machine/   ← 状态机实现
│   │   │   ├─ roles/           ← 角色行为
│   │   │   ├─ reducer/         ← Reducer（纯函数）
│   │   │   ├─ commands/        ← Command 定义 + Validator
│   │   │   ├─ projection/      ← buildPlayerView()
│   │   │   └─ index.ts         ← 引擎公开 API
│   │   └─ cli/                 ← CLI 模拟/回放工具
│   ├─ ai/              ← AI Pipeline（依赖 engine）
│   │   ├─ src/
│   │   │   ├─ providers/       ← LLM Provider 统一接口
│   │   │   ├─ pipeline/        ← Think→Plan→Speak→Act
│   │   │   ├─ context/         ← Context Builder + Token Budget
│   │   │   ├─ memory/          ← AI 自维护记忆
│   │   │   ├─ prompts/         ← Prompt 模板（/roles, /phases, /system, /fewshots）
│   │   │   └─ budget/          ← AI 预算控制
│   ├─ server/          ← Fastify + Socket.IO
│   │   ├─ src/
│   │   │   ├─ command-bus/     ← Command Bus 统一入口
│   │   │   ├─ effect-runtime/  ← Effect Scheduler
│   │   │   ├─ rooms/           ← 房间管理
│   │   │   ├─ socket/          ← Socket.IO 事件处理
│   │   │   └─ api/             ← REST API
│   ├─ web/             ← React 前端（仅依赖 shared Payload 类型）
│   └─ devtools/        ← Event Viewer / State Inspector / Replay Runner

├─ prompts/             ← 全局 Prompt 模板（独立于代码仓库）
├─ docs/                ← 项目文档
│   ├─ REQUIREMENTS.md
│   ├─ ANALYSIS.md
│   ├─ DEVELOPMENT.md
│   ├─ STATE_MACHINE_SPEC.md
│   ├─ GAME_PROTOCOL.md
│   ├─ ENGINE_API.md
│   └─ TECH_DESIGN.md（本文档）
├─ turbo.json           ← Turborepo 配置
├─ package.json         ← pnpm workspace root
└─ tsconfig.json
```

---

## 3. 技术栈选择

| 层 | 技术 | 版本 | 理由 |
|----|------|------|------|
| 运行时 | Node.js | 22 LTS | 稳定 LTS |
| 包管理 | pnpm + Turborepo | latest | monorepo 管理 |
| 语言 | TypeScript | 5.x strict | 类型安全 |
| 后端框架 | Fastify | 5.x | TS 原生支持、Schema 强、WS 插件成熟 |
| WebSocket | Socket.IO | 4.x | 房间管理、自动重连 |
| 前端框架 | React | 19.x | SPA |
| 前端构建 | Vite | 6.x | 快速 HMR |
| CSS | Tailwind CSS | 4.x | 原子化 CSS |
| 状态管理 | Jotai | 2.x | 轻量原子化 |
| 数据验证 | Zod | 3.x | 全栈 Schema 验证 |
| ORM | Drizzle ORM | latest | 轻量、TS 原生 |
| 数据库 | SQLite（开发）→ PostgreSQL（生产） | — | 渐进式 |
| KV 存储 | SQLite 内存表（MVP）→ Redis | — | 房间会话 |
| 测试 | Vitest | 2.x | Vite 集成、快 |
| AI | OpenAI / Anthropic SDK | latest | LLM 调用 |
| TTS | edge-tts（P4） | — | 免费方案 |
| STT | Web Speech API（前端） | — | 浏览器原生 |

---

## 4. 开发顺序（Phase 1）

按依赖图排：

```
Sprint 0: 基础设施
    ↓
Sprint 1: packages/shared + packages/protocol（Event/Command/State Schema）
    ↓
Sprint 1: packages/engine（Reducer + State Machine + Projection）
    ↓
Sprint 2: packages/ai（Pipeline + Providers + Context + Memory）
    ↓
Sprint 3: packages/server（Command Bus + Effect Runtime + Room + Socket）
    ↓
Sprint 4: packages/web（React UI）
    ↓
Sprint 5: 集成 + 测试 + 打磨
```

---

## 5. 运行时架构

```
┌─────────────────────────────────────┐
│          INPUT SOURCES               │
│  Socket.IO │ REST API │ CLI │ Test   │
└─────────────┬───────────────────────┘
              │ Command { type, payload, playerId }
              ▼
┌─────────────────────────────────────┐
│         Command Bus                  │
│  join_room │ submit_speech │ ...     │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│      Command Validator               │
│  权限校验 │ 时机校验 │ 格式校验       │
└─────────────┬───────────────────────┘
              │ validated
              ▼
┌─────────────────────────────────────┐
│         Engine (Pure)                │
│  Reducer(state, event) →             │
│    { newState, effects[] }           │
└─────────────┬───────────────────────┘
              │ effects[]
              ▼
┌─────────────────────────────────────┐
│       Effect Runtime                 │
│  ┌───────┐ ┌─────┐ ┌────────┐ ┌────┐│
│  │ Timer │ │ AI  │ │Socket  │ │DB  ││
│  └───┬───┘ └──┬──┘ └───┬────┘ └──┬─┘│
│      │        │        │         │   │
│      ▼        ▼        ▼         ▼   │
│  Event    Intent   Broadcast  Persist │
└──────┬───────────────────────────────┘
       │ 产生的 Event / Intent 重新进入 Command Bus
       └──→ Command Bus（循环）
```

### AI 单次决策流程

```
Phase Start
    ↓
Effect: { type: "ai:request", playerId: "p3", task: "speech" }
    ↓
Effect Runtime 调度
    ↓
Context Builder 组装上下文（Token Budget 控制）
    ↓
LLM Provider 调用（主力模型 / 降级备用）
    ↓
Response Parser 解析（Zod 校验）
    ↓
生成 Intent { type: "speech", playerId: "p3", content: "..." }
    ↓
dispatchCommand(intent)
    ↓
Command Validator 校验
    ↓
Reducer 处理 → New State + Effects（Broadcast 发言内容）
```

---

## 7. 关键架构缺口（必须 Phase 1 完成）

### 7.1 Event Store 接口

Engine 不关心存储，只负责 `reduce(state, event)`。Server 层负责持久化。

```typescript
interface EventStore {
  // 追加事件（原子写入）
  append(gameId: string, events: GameEvent[]): Promise<void>

  // 加载全量事件
  load(gameId: string): Promise<GameEvent[]>

  // 从某个 eventId 之后加载（断线补发/增量回放）
  loadFrom(gameId: string, afterEventId: string): Promise<GameEvent[]>

  // Snapshot
  saveSnapshot(snapshot: GameSnapshot): Promise<void>
  loadLatestSnapshot(gameId: string): Promise<GameSnapshot | null>
}
```

**MVP 实现**：SQLite 单表 `events(id, game_id, seq, type, payload_json, ts)` + 内存缓存最近 1000 条。PostgreSQL 迁移时只换实现不换接口。

### 7.2 Effect Contract 标准化

```typescript
// 所有 Effect 统一基类
interface EffectBase {
  id: string              // UUID v7
  type: EffectType
  createdAt: number       // Unix timestamp ms
  dedupeKey?: string      // 幂等键
  correlationId: string   // 关联 ID（同一因果链共享）
  causationId: string     // 触发此 Effect 的 Event/Command ID
  timeout?: number        // 超时 ms
  retry?: RetryPolicy
}

type Effect =
  | TimerEffect      // { duration, onExpire }
  | BroadcastEffect  // { roomId, event, payload }
  | WhisperEffect    // { playerId, event, payload }
  | AIRequestEffect  // { playerId, task, context }
  | PersistEffect    // { events[], snapshot? }
  | LogEffect        // { level, message, data }
  | TTSEffect        // { text, playerId }
```

**运行时规则**：

| 场景 | 策略 |
|------|------|
| Effect 超时 | 标记为 FAILED，不阻塞其他 Effect |
| Phase 切换 | 取消旧 Phase 的 Timer + 未完成的 AI Request |
| 重复 Effect（同 dedupeKey） | 跳过 |
| AI 请求晚到（Phase 已结束） | stale check：丢弃，记录日志 |
| AI 并发（同一玩家双重请求） | 严格串行，新请求取消旧请求 |
| Socket 广播失败 | 忽略（客户端下次重连补发） |

### 7.3 Command → Handler → Events → Reducer 分层

避免 Reducer 膨胀为业务脚本：

```
Command { type: "start_game", playerId: "p1" }
       │
       ▼
CommandHandler.handle(command, state)
       │
       ├─ 生成 Events[]:
       │   room:locked
       │   game:created
       │   roles:assigned (×6)
       │   phase:started
       │
       ▼
Reducer.reduceEach(state, events)
       │
       └─ 返回: { newState, effects[] }
```

**原则**：
- **CommandHandler**：命令 → 事件列表（业务逻辑、校验、多事件编排）
- **Reducer**：事件 → 新状态（纯函数，不包含业务判断）
- **CommandHandler 可调用 Inject（只读查询）**，但不能直接改 State

### 7.4 Phase Driver

狼人杀是阶段驱动游戏，Phase 推进必须由显式的 Phase Driver 管理，不能散落在 Reducer 的 if/else 中。

```typescript
class PhaseDriver {
  // 判断当前 Phase 是否完成（所有操作已提交）
  isPhaseComplete(state: GameState): boolean

  // 生成 Phase 结束事件
  completePhase(state: GameState): GameEvent[]

  // 确定下一 Phase（条件驱动）
  determineNextPhase(state: GameState): PhaseType
}
```

**触发时机**：每次 Reducer 执行后，Phase Driver 检查 `isPhaseComplete()`。

**示例**：
```
投票阶段 all votes received
  → Phase Driver.isPhaseComplete() = true
  → Phase Driver.completePhase() → vote:all_cast 事件
  → Phase Driver.determineNextPhase() → "天黑了" 或 "平票PK"
  → phase:transitioned 事件
```

### 7.5 Reducer 按 Domain 拆分

```typescript
// 而非单一 switch(event.type) { case ... case ... case ... }

const gameReducer = combineReducers({
  room: roomReducer,         // 房间状态（锁定、玩家进出）
  phase: phaseReducer,       // 阶段切换
  vote: voteReducer,         // 投票收集 & 开票
  death: deathReducer,       // 死亡处理 & 遗言触发
  role: roleReducer,         // 角色能力（查验、用药、守护）
  sheriff: sheriffReducer,   // 警长系统（P2）
})

// combineReducers 实现
function combineReducers(reducers: Record<string, SubReducer>) {
  return (state: GameState, event: GameEvent) => {
    let newState = state
    let allEffects: Effect[] = []
    for (const [domain, reducer] of Object.entries(reducers)) {
      const { state: domainState, effects } = reducer(newState[domain], event)
      newState = { ...newState, [domain]: domainState }
      allEffects = [...allEffects, ...effects]
    }
    return { newState, effects: allEffects }
  }
}
```

### 7.6 AI Context Builder 必须走 Projection

AI 的 Context 只能包含 `buildPlayerView(state, aiPlayerId)` 的结果。防止 AI "作弊"获取不该知道的信息。

```typescript
async function buildAIContext(state: GameState, playerId: string): Promise<AIContext> {
  const view = buildPlayerView(state, playerId)  // ← 强制 Projection

  return {
    systemPrompt: loadPrompt("system"),
    rolePrompt: loadPrompt(`roles/${view.role}`),
    persona: loadPersona(playerId),
    publicState: view.publicState,               // 存活名单、轮次、天气
    privateState: view.privateState,             // 该玩家的身份、记忆、查验结果
    recentSpeeches: view.visibleSpeeches,        // 该玩家可见的发言（所有存活者发言）
    memory: loadMemory(playerId),                // 该玩家自维护记忆
    task: determineTask(state.phase, playerId),
  }
}
```

### 7.7 Prompt 独立于代码

```
/aiwolf/prompts/          ← 独立目录，不放在 packages/ai/src 内
  /system/                ← 系统 Prompt
    base.txt              ← 狼人杀规则 & 输出格式约束
  /roles/                 ← 角色 Prompt
    werewolf.txt
    seer.txt
    witch.txt
    villager.txt
    hunter.txt             ← Phase 3
  /phases/                ← 阶段 Prompt
    night.txt
    day_discuss.txt
    day_vote.txt
    last_words.txt
  /fewshots/              ← Few-shot examples
    werewolf_claim.md
    seer_reveal.md
    villager_analysis.md
  /judge/                 ← 裁判 Prompt
    scoring.txt
```

**原则**：代码只负责 `loadPrompt(path)` + 变量替换。Prompt 修改不走代码部署，热更新。

### 7.8 结构化日志（Observability Runtime）

```typescript
// 统一日志结构
logger.info("event:applied", {
  traceId: string,          // 全链路追踪 ID
  gameId: string,
  round: number,
  phase: PhaseType,
  eventType: string,
  playerId?: string,
  duration?: number,        // Reducer 耗时 ms
})

logger.info("ai:call", {
  traceId: string,
  gameId: string,
  playerId: string,
  task: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  parseDurationMs: number,
})
```

**Phase 1 最低要求**：所有 LLM 调用和 Phase 切换必须有结构化日志。

### 7.9 AI Pipeline MVP 降级

为防止成本和延迟爆炸，MVP 阶段不做显式的 Think/Plan 层：

```
MVP:  Context → Speak/Act（Think/Plan 隐式在 LLM 内完成）
v0.2: Context → Think → Speak/Act（Think 显式但 Plan 仍隐式）
v1.0: Context → Think → Plan → Speak → Act（全四层）
```

**理由**：
- 显式四层 = 每轮 4 次 LLM 调用 = 成本 ×4 + 延迟 ×4
- 让模型隐式推理更稳定（避免 Prompt Debug 地狱）
- 先验证核心体验（发言+投票），再拆细推理

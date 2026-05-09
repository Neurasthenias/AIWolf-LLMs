# AI狼人杀 — 游戏协议

> 版本：v1.0 | Phase 1 基线 | 2026-05-09

---

## 1. 协议分层

```
┌─────────────────────────────┐
│  External（外部）             │
│  SocketEnvelope / REST       │  前端、CLI、Bot 可见
├─────────────────────────────┤
│  Internal（内部）             │
│  Command / Intent            │  引擎接收、AI 输出
├─────────────────────────────┤
│  Core（核心）                 │
│  Event / State               │  引擎内部、Reducer、Replay、DB
└─────────────────────────────┘
```

**原则**：Core 层定义系统的"真相"。External 层是 Core 的脱敏投影。

---

## 2. Event（事件 — 系统唯一真相源）

### 2.1 Event 基类

```typescript
interface GameEvent {
  // 身份
  id: string              // UUID v7，全局唯一
  version: string         // 协议版本 "1.0"
  schemaVersion: string   // Schema 版本 "1.0"（用于 upcastEvent）
  type: string            // 事件类型标识
  gameId: string          // 所属对局

  // 溯源
  seq: number             // 事件序号（单调递增）
  timestamp: number       // 产生时间戳（ms）
  causationId?: string    // 触发此事件的 Command/Event ID
  correlationId?: string  // 同一因果链共享

  // 幂等
  idempotencyKey?: string // 相同 key 只处理一次（断线重试防重）

  // 可见性
  visibility: "public" | "private" | "hidden"
  visibleTo?: string[]    // playerId[]，private 时有效

  // 负载
  payload: Record<string, unknown>
}
```

### 2.2 事件类型目录

#### 房间事件
```typescript
type RoomEvent =
  | { type: "room:created"; payload: { roomCode: string; config: GameConfig; hostId: string } }
  | { type: "room:player_joined"; payload: { playerId: string; name: string; seat: number } }
  | { type: "room:player_left"; payload: { playerId: string; seat: number } }
  | { type: "room:locked"; payload: {} }
```

#### 身份事件（private）
```typescript
type RoleEvent =
  | { type: "role:assigned"; payload: { playerId: string; role: RoleType; faction: FactionType }; visibleTo: [playerId] }
  | { type: "role:teammates_revealed"; payload: { playerId: string; teammates: string[] }; visibleTo: [playerId, ...teammates] }
  | { type: "role:seer_result"; payload: { playerId: string; targetId: string; result: "good" | "wolf" }; visibleTo: [playerId] }
  | { type: "role:witch_notified"; payload: { playerId: string; killedPlayerId: string | null; hasSavePotion: boolean; hasPoisonPotion: boolean }; visibleTo: [playerId] }
```

#### 游戏阶段事件（public）
```typescript
type PhaseEvent =
  | { type: "phase:transitioned"; payload: { from: PhaseType; to: PhaseType; round: number } }
  | { type: "phase:timer_started"; payload: { phase: PhaseType; duration: number; deadline: number } }
  | { type: "phase:timer_expired"; payload: { phase: PhaseType; playerId?: string } }
```

#### 夜晚事件
```typescript
type NightEvent =
  | { type: "wolf:proposal_submitted"; payload: { playerId: string; targetId: string; reason: string }; visibleTo: [playerId] }
  | { type: "wolf:kill_resolved"; payload: { targetIds: string[] } }
  | { type: "seer:check_submitted"; payload: { playerId: string; targetId: string }; visibleTo: [playerId] }
  | { type: "witch:action_submitted"; payload: { playerId: string; saveTargetId?: string; poisonTargetId?: string }; visibleTo: [playerId] }
  | { type: "witch:action_resolved"; payload: { savedPlayerId?: string; poisonedPlayerId?: string; isSafeNight: boolean } }
```

#### 发言事件（public）
```typescript
type SpeechEvent =
  | { type: "speech:turn_started"; payload: { playerId: string; seat: number; timeLimit: number } }
  | { type: "speech:chunk"; payload: { playerId: string; content: string; isLast: boolean } }
  | { type: "speech:completed"; payload: { playerId: string; fullText: string; duration: number } }
  | { type: "speech:timeout"; payload: { playerId: string } }
  | { type: "speech:last_words_started"; payload: { playerId: string; timeLimit: number } }
  | { type: "speech:last_words_completed"; payload: { playerId: string; content: string } }
```

#### 自爆事件（public）
```typescript
type SelfExplodeEvent =
  | { type: "self_explode:triggered"; payload: { playerId: string } }
```

#### 投票事件
```typescript
type VoteEvent =
  | { type: "vote:phase_started"; payload: { candidates: string[]; timeLimit: number } }
  | { type: "vote:cast"; payload: { playerId: string; targetId: string | null }; visibility: "hidden" }
  | { type: "vote:all_cast"; payload: {} }
  | { type: "vote:revealed"; payload: { votes: { playerId: string; targetId: string | null }[] } }
  | { type: "vote:tie"; payload: { tiedPlayerIds: string[] } }
  | { type: "vote:tie_break_speech_started"; payload: { playerIds: string[]; timeLimit: number } }
  | { type: "vote:tie_break_completed"; payload: { votes: { playerId: string; targetId: string | null }[] } }
  | { type: "vote:timeout"; payload: { playerId: string } }
```

#### 死亡事件（public）
```typescript
type DeathEvent =
  | { type: "death:player_died"; payload: { playerId: string; cause: DeathCause; killerId?: string; round: number } }
  | { type: "death:day_break_announcement"; payload: { deaths: { playerId: string; cause: DeathCause }[]; isSafeNight: boolean } }
```

#### 猎人事件（public）
```typescript
type HunterEvent =
  | { type: "hunter:shoot_enabled"; payload: { playerId: string; timeLimit: number }; visibleTo: [playerId] }
  | { type: "hunter:shot"; payload: { playerId: string; targetId: string } }
```

#### 终局事件（public）
```typescript
type EndGameEvent =
  | { type: "game:ended"; payload: { winner: FactionType; mvp: string; svp: string; reason: string } }
```

#### 合并类型
```typescript
type AllGameEvents =
  | RoomEvent | RoleEvent | PhaseEvent | NightEvent
  | SpeechEvent | SelfExplodeEvent | VoteEvent
  | DeathEvent | HunterEvent | EndGameEvent
```

### 2.3 事件版本升级（Upcast）

```typescript
// 协议升级时，旧版本事件通过 upcast 转换
function upcastEvent(event: { version: string; schemaVersion: string; [k: string]: unknown }): GameEvent {
  if (event.version === "1.0") return event as GameEvent

  // 未来版本迁移示例
  if (event.version === "0.9") {
    return migrateV09toV10(event)
  }

  throw new Error(`Unknown event version: ${event.version}`)
}
```

### 2.4 GameState（Reducer 输入 & 输出）

```typescript
interface GameState {
  // 身份
  gameId: string
  version: string

  // 当前阶段
  phase: PhaseDetail

  // 玩家状态（只存 Reducer 运行时需要的字段）
  players: Record<string, PlayerState>

  // 药水
  witchPotions: {
    hasSave: boolean
    hasPoison: boolean
  }

  // 警长
  sheriffId: string | null
  sheriffElectionDone: boolean

  // 平票计数
  tieBreakCount: number

  // 元数据
  startedAt: number
  lastEventSeq: number
}

interface PhaseDetail {
  type: PhaseType
  subPhase: SubPhaseType
  round: number           // 第几轮（天）
  dayNumber: number       // 第几天
}

interface PlayerState {
  id: string
  name: string
  seat: number
  role: RoleType
  faction: FactionType
  isAlive: boolean
  isAI: boolean
  isHost: boolean

  // 死亡信息（isAlive=false 时有效）
  deathInfo?: {
    cause: DeathCause
    round: number
    killedBy?: string
  }

  // 已投票（投票阶段有效）
  voteTargetId?: string | null  // null = 弃票
}
```

---

## 3. Command（命令 — 系统输入）

### 3.1 Command 基类

```typescript
interface Command {
  id: string              // UUID v7
  version: string         // "1.0"
  type: string
  gameId: string
  actorId: string         // 谁发出的
  timestamp: number
  idempotencyKey?: string
  payload: Record<string, unknown>
}
```

### 3.2 命令类型

```typescript
type AllCommands =
  // 房间
  | { type: "room:create"; actorId: string; payload: { config: GameConfig } }
  | { type: "room:join"; actorId: string; payload: { roomCode: string; playerName: string } }
  | { type: "room:leave"; actorId: string; payload: {} }
  | { type: "room:kick"; actorId: string; payload: { targetPlayerId: string } }
  | { type: "room:start"; actorId: string; payload: {} }

  // 夜晚操作
  | { type: "night:wolf_kill"; actorId: string; payload: { targetId: string; reason: string } }
  | { type: "night:seer_check"; actorId: string; payload: { targetId: string } }
  | { type: "night:witch_action"; actorId: string; payload: { saveTargetId?: string; poisonTargetId?: string } }

  // 发言
  | { type: "speech:submit"; actorId: string; payload: { content: string } }
  | { type: "speech:last_words"; actorId: string; payload: { content: string } }

  // 自爆
  | { type: "self_explode"; actorId: string; payload: {} }

  // 投票
  | { type: "vote:cast"; actorId: string; payload: { targetId: string | null } }

  // 猎人开枪
  | { type: "hunter:shoot"; actorId: string; payload: { targetId: string } }

  // AI Intent（与 Command 同构，由 AI Pipeline 生成）
  | { type: "ai:intent"; actorId: string; payload: { intentType: string; targetId?: string; speechContent?: string } }
```

### 3.3 Command Validation 规则

```typescript
// Command Handler 中的校验逻辑
const commandValidationRules: Record<string, (cmd: Command, state: GameState) => ValidationResult> = {
  "speech:submit": (cmd, state) => {
    if (state.phase.subPhase !== "SPEECH_TURN_ACTIVE") return fail("不在发言阶段")
    if (state.players[cmd.actorId].isAlive === false) return fail("已死亡")
    if (state.currentSpeakerId !== cmd.actorId) return fail("不是你的发言轮次")
    return pass()
  },
  "vote:cast": (cmd, state) => {
    if (state.phase.subPhase !== "VOTE_CAST") return fail("不在投票阶段")
    if (state.players[cmd.actorId].isAlive === false) return fail("已死亡")
    if (cmd.payload.targetId && state.players[cmd.payload.targetId].isAlive === false) return fail("目标已死亡")
    return pass()
  },
  // ... 其余校验
}
```

---

## 4. Intent（AI 输出 — 与 Command 同构）

```typescript
// AI Pipeline 输出统一的 Intent 结构
interface AIIntent {
  // 结构化操作（与 Command 同构，走同一 Validator）
  action: {
    type: string            // "vote" | "wolf_kill" | "seer_check" | "witch_save" | "witch_poison" | "guard" | "self_explode" | "hunter_shoot" | "skip"
    targetId: string | null
    reason: string
  }

  // 自然语言发言（可选，发言任务时必填）
  speech?: {
    content: string         // 150-400 字
    tone: string            // "aggressive" | "moderate" | "passive" | "confused"
  }

  // 内部推理（MVP 不生成，v1.0 启用）
  reasoning?: {
    beliefs: Record<string, { role: string; confidence: number }>
    suspicion: Record<string, { level: number; reason: string }>
    strategyEvaluation: string
  }
}
```

---

## 5. Socket 协议（外部通信）

### 5.1 信封

```typescript
// 所有 Socket 消息统一信封
interface ClientMessage {
  type: string
  id: string              // UUID，用于确认
  gameId?: string
  idempotencyKey?: string
  payload: Record<string, unknown>
}

interface ServerMessage {
  type: string
  id: string
  gameId?: string
  timestamp: number
  payload: Record<string, unknown>
}
```

### 5.2 完整消息清单

```typescript
// 客户端 → 服务端
type ClientToServer =
  | { type: "room:create"; payload: { config: GameConfig } }
  | { type: "room:join"; payload: { code: string; name: string } }
  | { type: "room:leave"; payload: {} }
  | { type: "room:kick"; payload: { targetId: string } }
  | { type: "room:start"; payload: {} }
  | { type: "game:action"; payload: { actionType: string; targetId?: string } }  // 夜晚操作
  | { type: "game:speech"; payload: { content: string } }
  | { type: "game:vote"; payload: { targetId: string | null } }
  | { type: "game:self_explode"; payload: {} }

// 服务端 → 客户端
type ServerToClient =
  | { type: "room:state"; payload: RoomState }
  | { type: "game:state_snapshot"; payload: GameState }        // 重连时全量
  | { type: "game:events_batch"; payload: { events: GameEvent[] } }  // 增量事件
  | { type: "game:role_assigned"; payload: { role: RoleType; faction: FactionType } }
  | { type: "game:phase_changed"; payload: { phase: PhaseDetail; timeLimit?: number } }
  | { type: "game:speech_chunk"; payload: { playerId: string; content: string; isLast: boolean } }
  | { type: "game:vote_open"; payload: { candidates: string[]; timeLimit: number } }
  | { type: "game:vote_result"; payload: { votes: Record<string, string | null> } }
  | { type: "game:player_died"; payload: { playerId: string; cause: string } }
  | { type: "game:ended"; payload: { winner: string; mvp: string; svp: string } }
  | { type: "game:error"; payload: { code: string; message: string } }
```

---

## 6. 类型常量

```typescript
type RoleType = "werewolf" | "villager" | "seer" | "witch" | "hunter" | "guard"
type FactionType = "good" | "wolf"
type PhaseType = "WAITING" | "NIGHT" | "DAY" | "GAME_OVER"
type SubPhaseType =
  | "NIGHT_ANNOUNCE" | "WOLF_INTEL" | "WOLF_PROPOSE" | "WOLF_RESOLVE"
  | "SEER_CHOOSE" | "SEER_RESULT" | "WITCH_NOTIFY" | "WITCH_DECIDE"
  | "GUARD_CHOOSE" | "NIGHT_SETTLEMENT"
  | "DAY_BREAK" | "DEATH_ANNOUNCE" | "COMMON_LAST_WORDS"
  | "HUNTER_SHOOT" | "SHERIFF_ELECTION"
  | "SPEECH_PRE_THINK" | "SPEECH_TURN_ACTIVE" | "SPEECH_TURN_DONE"
  | "VOTE_CAST" | "VOTE_REVEAL" | "TIE_BREAK_SPEECH" | "TIE_BREAK_VOTE"
  | "EXILE_ANNOUNCE" | "DAY_SETTLEMENT"
  | "RESULT_ANNOUNCE" | "MVP_ANNOUNCE"

type DeathCause = "WOLF_KILL" | "VOTE_EXILE" | "WITCH_POISON" | "HUNTER_SHOT" | "GUARD_WITCH_SAME"
```

---

> 冻结说明：本文档定义的所有 Event/Command/State/Socket 类型为 Phase 1 基线。新增类型通过版本升级（upcast）兼容，不修改现有类型字段。

# AI狼人杀 — 玩家视图规范

> 版本：v1.0 | Phase 1 基线 | 2026-05-09

---

## 1. 设计原则

`buildPlayerView(state, playerId)` 是系统的**信息隔离层**。所有外部消费者——AI、Socket、Replay、DevTools——必须通过 Projection 获取状态，不能直接访问 `GameState`。

---

## 2. View 分类

```typescript
type ViewScope = "public" | "player_private" | "spectator" | "judge" | "replay"

// public        — 大厅/观战者可见（存活名单、发言、死讯、投票结果）
// player_private — 特定玩家可见（自己的身份、查验结果、药水通知、狼同伴）
// spectator      — 观战者，比 public 多能看到一些延迟信息
// judge          — 裁判模式，全知（Phase 3）
// replay         — 回放模式，时间可控的全知视图
```

---

## 3. PlayerView 结构

```typescript
interface PlayerView {
  scope: ViewScope
  playerId: string

  // 自己
  self: {
    id: string
    name: string
    seat: number
    role: RoleType              // 只有自己知道
    faction: FactionType
    isAlive: boolean
    teammates?: string[]        // 狼人可见同伴
    privateInfo?: {             // 角色专属私有信息
      seerResults?: { targetId: string; result: "good" | "wolf" }[]
      witchNotification?: { killedPlayerId: string | null; hasSave: boolean; hasPoison: boolean }
    }
  }

  // 公开玩家列表
  players: PublicPlayer[]

  // 当前阶段
  phase: {
    type: PhaseType
    subPhase: SubPhaseType
    round: number
    dayNumber: number
    currentSpeakerId?: string
    timeRemaining?: number
  }

  // 本轮可见发言（所有存活者发言，按顺序）
  speeches: SpeechRecord[]

  // 投票结果（仅开票后可见）
  voteResult?: {
    votes: Record<string, string | null>
    exiledPlayerId?: string
    isTie: boolean
  }

  // 死亡公告
  deathAnnouncement?: {
    deaths: { playerId: string; cause: string }[]
    isSafeNight: boolean
  }

  // 遗言（可见的遗言内容）
  lastWords?: { playerId: string; content: string }[]
}

interface PublicPlayer {
  id: string
  name: string
  seat: number
  isAlive: boolean
  isAI: boolean
  // 注意：role 不在此结构——玩家不能看到其他人的身份
}
```

---

## 4. 可见性规则（核心）

| 信息 | 自己 | 狼人（同队） | 狼人（非同队） | 预言家 | 女巫 | 村民 | 死者 |
|------|------|------------|-------------|--------|------|------|------|
| 身份 | ✅ | ✅(仅同伴) | ❌ | ❌ | ❌ | ❌ | ✅(死后公开) |
| 狼同伴 | — | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| 查验结果 | — | — | — | ✅ | ❌ | ❌ | — |
| 女巫通知 | — | — | — | — | ✅ | ❌ | — |
| 公开发言 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 投票（暗投期间） | ✅(自己的) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 投票（开票后） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 死讯 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 身份（死后） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 5. Projection 不变量

```typescript
// 这些规则在 buildPlayerView 中强制，测试自动验证

const invariants = {
  // 1. 不包含任何未授权的 private event
  noUnauthorizedPrivateEvent: (view: PlayerView, state: GameState) => {
    const authorizedIds = getAuthorizedPlayerIds(state, view.playerId)
    // 所有 player_private 事件的 visibleTo 必须在 authorizedIds 中
  },

  // 2. 不包含 hidden visibility event 的内容
  noHiddenEventContent: (view: PlayerView) => {
    // vote:cast(hidden) 在开票前不在任何 PlayerView 中
  },

  // 3. 不包含未来事件（时间戳检查）
  noFutureEvents: (view: PlayerView, lastEventSeq: number) => {
    // view 中所有信息的来源事件 seq ≤ lastEventSeq
  },

  // 4. Replay 一致性：相同 Event 序列 → 相同 Projection
  replayDeterminism: (events: GameEvent[], playerId: string) => {
    const view1 = replayAndBuildView(events, playerId)
    const view2 = replayAndBuildView(events, playerId)
    // view1 === view2
  },

  // 5. AI Context 必须完全由 Projection 派生
  aiContextFromProjection: (aiContext: AIContext, view: PlayerView) => {
    // aiContext 中的所有信息必须来自 view
    // 不能从 GameState 直接读取
  }
}
```

---

## 6. 实现

```typescript
function buildPlayerView(state: GameState, playerId: string, scope: ViewScope = "player_private"): PlayerView {
  const player = state.players[playerId]
  const isAlive = player.isAlive

  return {
    scope,
    playerId,

    self: buildSelfView(state, playerId),

    players: Object.values(state.players).map(p => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      isAlive: p.isAlive,
      isAI: p.isAI,
    })),

    phase: {
      type: state.phase.type,
      subPhase: state.phase.subPhase,
      round: state.phase.round,
      dayNumber: state.phase.dayNumber,
      currentSpeakerId: state.phase.subPhase === "SPEECH_TURN_ACTIVE" ? state.currentSpeakerId : undefined,
      timeRemaining: state.phaseTimerDeadline ? state.phaseTimerDeadline - Date.now() : undefined,
    },

    speeches: getVisibleSpeeches(state, playerId),
    voteResult: state.phase.subPhase === "VOTE_REVEAL" || state.phase.subPhase === "EXILE_ANNOUNCE"
      ? buildVoteResult(state)
      : undefined,
    deathAnnouncement: state.latestDeathAnnouncement,
    lastWords: getVisibleLastWords(state, playerId),
  }
}
```

---

## 7. 不同 Scope 的差异

| 能力 | public | player_private | spectator | judge |
|------|--------|---------------|-----------|-------|
| 看到自己身份 | ❌ | ✅ | ❌ | ✅ |
| 看到狼同伴 | ❌ | ✅(狼人) | ❌ | ✅ |
| 看到查验结果 | ❌ | ✅(预言家) | ❌ | ✅ |
| 看到暗投 | ❌ | ❌ | ❌ | ✅ |
| 看到全量事件 | ❌ | ❌ | ❌ | ✅ |
| 时间可控（快进/暂停） | ❌ | ❌ | ✅ | ✅ |

---

> 本文档定义的信息隔离边界是 AI 防作弊、Socket 安全、Replay 一致性的基础。任何绕过 `buildPlayerView` 直接访问 `GameState` 的行为视为 Bug。

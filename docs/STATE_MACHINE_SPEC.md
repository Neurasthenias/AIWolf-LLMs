# AI狼人杀 — 状态机规格

> 版本：v1.0 | Phase 1 基线 | 2026-05-09

---

## 1. 状态定义

状态 = Phase + SubPhase。每个状态定义：
- 允许的 Command
- 产生的 Event
- 超时策略
- 中断行为
- 转移条件

### 1.1 状态清单

```
WAITING          — 等待玩家加入
  └─ WAITING_PLAYERS

GAME_START       — 游戏初始化
  └─ ROLE_ASSIGNMENT

NIGHT            — 夜晚阶段
  ├─ NIGHT_ANNOUNCE
  ├─ WOLF_INTEL
  ├─ WOLF_PROPOSE
  ├─ WOLF_RESOLVE（条件：有分歧时）
  ├─ SEER_CHOOSE
  ├─ SEER_RESULT
  ├─ WITCH_NOTIFY
  ├─ WITCH_DECIDE
  ├─ GUARD_CHOOSE（Phase 3）
  └─ NIGHT_SETTLEMENT

DAY              — 白天阶段
  ├─ DAY_BREAK
  ├─ DEATH_ANNOUNCE
  ├─ CHECK_WIN
  ├─ COMMON_LAST_WORDS（条件触发）
  ├─ HUNTER_SHOOT（条件触发）
  ├─ SHERIFF_ELECTION（条件触发，Phase 3）
  ├─ SPEECH_PRE_THINK
  ├─ SPEECH_TURN_ACTIVE（循环：每个存活玩家一次）
  ├─ SPEECH_TURN_DONE
  ├─ VOTE_CAST
  ├─ VOTE_REVEAL
  ├─ TIE_BREAK_SPEECH（条件触发）
  ├─ TIE_BREAK_VOTE（条件触发）
  ├─ EXILE_ANNOUNCE
  ├─ HUNTER_SHOOT（条件触发）
  ├─ COMMON_LAST_WORDS（条件触发）
  └─ DAY_SETTLEMENT

GAME_OVER        — 游戏结束
  ├─ RESULT_ANNOUNCE
  └─ MVP_ANNOUNCE
```

---

## 2. 每个状态的详细定义

### 2.1 WAITING → WAITING_PLAYERS

| 属性 | 值 |
|------|-----|
| **允许 Command** | `room:join`, `room:leave`, `room:kick`（房主） |
| **允许 Command（房主）** | `room:start`（人数≥最低要求时） |
| **生成 Event** | `room:player_joined`, `room:player_left` |
| **超时** | 无 |
| **转移** | `room:start` → GAME_START |

---

### 2.2 GAME_START → ROLE_ASSIGNMENT

| 属性 | 值 |
|------|-----|
| **输入** | 玩家列表 + GameConfig |
| **生成 Event** | `room:locked`, `role:assigned`（×玩家数）, `role:teammates_revealed`（狼人）, `phase:transitioned(to=NIGHT)` |
| **超时** | 无（纯引擎计算） |
| **转移** | 自动 → NIGHT_ANNOUNCE |

---

### 2.3 NIGHT → 各子阶段

#### NIGHT_ANNOUNCE

| 属性 | 值 |
|------|-----|
| **生成 Event** | `phase:transitioned(sub=NIGHT_ANNOUNCE)`, `phase:timer_started(2s)` |
| **转移** | timer → WOLF_INTEL |

#### WOLF_INTEL

| 属性 | 值 |
|------|-----|
| **生成 Event** | `role:teammates_revealed`（向每个狼人推送同伴信息） |
| **超时** | 无（纯数据推送） |
| **转移** | 自动 → WOLF_PROPOSE |

#### WOLF_PROPOSE

| 属性 | 值 |
|------|-----|
| **允许 Command** | `night:wolf_kill`（仅狼人） |
| **生成 Event** | `wolf:proposal_submitted` |
| **超时** | 15s（真人）/ 5s（AI） |
| **超时行为** | 未提交的狼人 → AI 自动随机选择 |
| **转移** | 所有狼人提交 → WOLF_RESOLVE 或 NIGHT_SETTLEMENT（全票一致时） |

#### WOLF_RESOLVE（条件：有分歧）

| 属性 | 值 |
|------|-----|
| **允许 Command** | `night:wolf_kill`（仅狼人） |
| **生成 Event** | `wolf:proposal_submitted` |
| **超时** | 10s |
| **超时行为** | 多数决 |
| **转移** | 所有狼人提交 → SEER_CHOOSE |

#### SEER_CHOOSE

| 属性 | 值 |
|------|-----|
| **允许 Command** | `night:seer_check` |
| **超时** | 10s |
| **超时行为** | 随机查验 |
| **转移** | 提交 → SEER_RESULT |

#### SEER_RESULT

| 属性 | 值 |
|------|-----|
| **生成 Event** | `role:seer_result`（private to seer） |
| **超时** | 无 |
| **转移** | 自动 → WITCH_NOTIFY（有女巫）/ NIGHT_SETTLEMENT |

#### WITCH_NOTIFY

| 属性 | 值 |
|------|-----|
| **生成 Event** | `role:witch_notified`（private to witch） |
| **超时** | 无 |
| **转移** | 自动 → WITCH_DECIDE |

#### WITCH_DECIDE

| 属性 | 值 |
|------|-----|
| **允许 Command** | `night:witch_action` |
| **超时** | 15s |
| **超时行为** | 不操作（不救不毒） |
| **转移** | 提交 / 超时 → NIGHT_SETTLEMENT |

#### NIGHT_SETTLEMENT

| 属性 | 值 |
|------|-----|
| **计算** | 狼刀 + 女巫救/毒 + 守卫守 → 确定死亡名单 |
| **生成 Event** | `wolf:kill_resolved`, `witch:action_resolved`, `death:player_died`（×死亡人数） |
| **转移** | 自动 → DAY_BREAK |

---

### 2.4 DAY → 各子阶段

#### DAY_BREAK

| 属性 | 值 |
|------|-----|
| **生成 Event** | `phase:transitioned(sub=DAY_BREAK)`, `phase:timer_started(2s)` |
| **转移** | timer → DEATH_ANNOUNCE |

#### DEATH_ANNOUNCE

| 属性 | 值 |
|------|-----|
| **生成 Event** | `death:day_break_announcement` |
| **转移** | 自动 → CHECK_WIN |

#### CHECK_WIN

| 属性 | 值 |
|------|-----|
| **判断** | 狼人存活 ≥ 好人生存？→ 狼胜；狼人全灭？→ 好胜 |
| **转移** | 胜负分出 → GAME_OVER；否则 → COMMON_LAST_WORDS 或 HUNTER_SHOOT 或 SPEECH_PRE_THINK |

#### COMMON_LAST_WORDS（条件触发）

| 属性 | 值 |
|------|-----|
| **条件** | 首夜死亡 / 首轮被票 / 非最后轮被刀 |
| **允许 Command** | `speech:last_words` |
| **超时** | 60s |
| **转移** | 提交/超时 → 下一状态 |

#### HUNTER_SHOOT（条件触发）

| 属性 | 值 |
|------|-----|
| **条件** | 猎人在 EXILE 阶段被票出，且死亡原因 ≠ 毒杀 |
| **允许 Command** | `hunter:shoot` |
| **超时** | 15s |
| **超时行为** | 不开枪 |
| **转移** | 提交/超时 → COMMON_LAST_WORDS 或 CHECK_WIN 或 SPEECH_PRE_THINK |

#### SPEECH_PRE_THINK

| 属性 | 值 |
|------|-----|
| **行为** | 触发所有存活 AI 的预思考 Effect（异步，不阻塞） |
| **超时** | 无 |
| **转移** | 自动 → SPEECH_TURN_ACTIVE（开始第一人发言） |

#### SPEECH_TURN_ACTIVE（循环）

| 属性 | 值 |
|------|-----|
| **允许 Command** | `speech:submit`, `self_explode` |
| **超时** | 180s（真人）/ 60s（AI） |
| **超时行为** | 自动过麦，记录 `speech:timeout` |
| **转移** | 发言完成 → 下一人 → SPEECH_TURN_ACTIVE；全部发言完 → VOTE_CAST |
| **中断** | `self_explode` → 终止发言循环 → NIGHT_ANNOUNCE |

#### VOTE_CAST

| 属性 | 值 |
|------|-----|
| **允许 Command** | `vote:cast` |
| **超时** | 15s |
| **超时行为** | 弃票 |
| **转移** | 所有人投票 → VOTE_REVEAL |

#### VOTE_REVEAL

| 属性 | 值 |
|------|-----|
| **生成 Event** | `vote:revealed`（同时公布所有投票） |
| **转移** | 平票 → TIE_BREAK_SPEECH；否则 → EXILE_ANNOUNCE |

#### TIE_BREAK_SPEECH（条件触发）

| 属性 | 值 |
|------|-----|
| **条件** | 投票平票 |
| **允许 Command** | `speech:submit`（仅平票者） |
| **超时** | 60s/人 |
| **转移** | 全部发言完 → TIE_BREAK_VOTE |

#### TIE_BREAK_VOTE（条件触发）

| 属性 | 值 |
|------|-----|
| **允许 Command** | `vote:cast`（仅非平票者投票） |
| **超时** | 15s |
| **转移** | 仍平票 → DAY_SETTLEMENT（无人出局）；否则 → EXILE_ANNOUNCE |

#### EXILE_ANNOUNCE

| 属性 | 值 |
|------|-----|
| **生成 Event** | `death:player_died(cause=VOTE_EXILE)` |
| **转移** | 被票者是猎人且非毒杀 → HUNTER_SHOOT；需要遗言 → COMMON_LAST_WORDS；否则 → CHECK_WIN |

---

### 2.5 GAME_OVER → 各子阶段

#### RESULT_ANNOUNCE

| 属性 | 值 |
|------|-----|
| **生成 Event** | `game:ended` |

#### MVP_ANNOUNCE

| 属性 | 值 |
|------|-----|
| **生成 Event** | `game:ended`（含 mvp/svp） |
| **转移** | 终态 |

---

## 3. 转移图（ASCII）

```
WAITING ──room:start──→ GAME_START ──auto──→ NIGHT_ANNOUNCE
                                                   │
          ┌────────────────────────────────────────┘
          ▼
    WOLF_INTEL → WOLF_PROPOSE → [WOLF_RESOLVE?] → SEER_CHOOSE
                                                     │
          ┌──────────────────────────────────────────┘
          ▼
    SEER_RESULT → WITCH_NOTIFY → WITCH_DECIDE → NIGHT_SETTLEMENT
                                                      │
          ┌───────────────────────────────────────────┘
          ▼
     DAY_BREAK → DEATH_ANNOUNCE → CHECK_WIN ──win?──→ GAME_OVER
                      │                              │
                      ▼                              │
               [LAST_WORDS?]                         │
                │       │                            │
                ├─yes──→ LAST_WORDS ──→               │
                │                            │        │
                ▼                            ▼        │
          [HUNTER_SHOOT?]                    │        │
           │       │                         │        │
           ├─yes──→ HUNTER_SHOOT ──→         │        │
           │                            │     │        │
           ▼                            ▼     ▼        │
     SPEECH_PRE_THINK → SPEECH_LOOP(N人) → VOTE_CAST
                                               │
          ┌────────────────────────────────────┘
          ▼
     VOTE_REVEAL ──tie?──→ TIE_BREAK_SPEECH → TIE_BREAK_VOTE
          │                       │                  │
          │                       └──still tie?──────┤
          ▼                                          ▼
     EXILE_ANNOUNCE                            DAY_SETTLEMENT
          │                                          │
          ├──[HUNTER?]──→ HUNTER_SHOOT               │
          ├──[LAST_WORDS?]──→ LAST_WORDS              │
          ▼                                          ▼
     CHECK_WIN ──no──→ NIGHT_ANNOUNCE（回到顶部）
```

---

## 4. 中断表

| 中断事件 | 触发时机 | 效果 |
|----------|----------|------|
| `self_explode` | SPEECH_TURN_ACTIVE 任意时刻 | 终止发言循环 → 直接进入 NIGHT_ANNOUNCE（狼人数-1） |
| 玩家断线 | 任何阶段 | 240s 等待重连；超时 → AI 接管，游戏继续 |
| LLM 失败 | AI 操作阶段 | 切换备用模型；仍失败 → Rule-based 兜底 |

---

## 5. Phase Driver 伪代码

```typescript
class PhaseDriver {
  isPhaseComplete(state: GameState): boolean {
    switch (state.phase.subPhase) {
      case "WOLF_PROPOSE": return allWolvesSubmitted(state)
      case "SPEECH_TURN_ACTIVE": return currentSpeakerDone(state) && noMoreSpeakers(state)
      case "VOTE_CAST": return allAlivePlayersVoted(state)
      // ...
    }
  }

  determineNextPhase(state: GameState): SubPhaseType {
    switch (state.phase.subPhase) {
      case "WOLF_PROPOSE":
        return hasDisagreement(state) ? "WOLF_RESOLVE" : "SEER_CHOOSE"
      case "DEATH_ANNOUNCE":
        return "CHECK_WIN"
      case "CHECK_WIN":
        return isGameOver(state) ? "RESULT_ANNOUNCE" : this.determineDayFlow(state)
      // ...
    }
  }
}
```

---

> 状态机规格与 `GAME_PROTOCOL.md` 的 Event/Command 定义配套。所有转移行为通过 Reducer + Phase Driver 实现，不散落在业务代码中。

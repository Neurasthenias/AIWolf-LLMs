# 开源 AI 狼人杀项目分析报告

> 分析日期：2026-05-09 | 共分析 8 个项目

---

## 一、项目总览

| # | 项目 | Stars | 语言 | 前端 | AI模型 | 多玩家 | 首版日期 |
|---|------|-------|------|------|--------|--------|----------|
| 1 | **wolfcha** (oil-oil) | 551 | TypeScript | Next.js 16 网页 | 多LLM | ❌ 纯AI对战 | 2026-01 |
| 2 | **AIWolfGame** (hikariming) | 54 | Python | CLI终端 | 12种模型 | ❌ 纯AI模拟 | 2025-02 |
| 3 | **werewolf_arena** (Google) | 46 | Python+TS | 交互式回放器 | 多LLM评测 | ❌ Benchmarks | 2024-06 |
| 4 | **LLM-Werewolf** (WhatRUHuh) | 9 | Python | Tkinter GUI | 5+种LLM | ❌ 单人 | 2025-03 |
| 5 | **AgentWereWolf** (yingyingxia) | ? | Python | 有前端目录 | LLM | ✅ 多人 | 2024-? |
| 6 | **AIWolf-LLMs** (uglyghost123) | 0 | Python | CLI终端 | ChatGLM | ❌ 纯AI | 2025-? |
| 7 | **AI-WerewolfGame** (chou109) | 0 | Java+Vue3 | Vue 3 网页 | 未实现 | ✅ 有架构 | 2025-? |
| 8 | **WolfMind** (KeLuoJun) | 4 | Python+Vue | FastAPI+Vue3 | 多LLM | ❌ 纯AI | 2025-11 |

---

## 二、逐项目分析

### 1. wolfcha — ⭐ 最佳参考项目

**技术栈**：Next.js 16 + TypeScript + Tailwind CSS 4 + Jotai + Supabase + ZenMux(LLM统一接口)

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **Phase Manager 架构** | 游戏阶段被抽象为独立类（NightPhase、DayDiscussPhase、VotePhase等），每个 phase 有 onEnter/onComplete 钩子，通过 PhaseManager 串联。极其清晰的状态管理 |
| **AI 流式发言** | `generateAISpeechStream()` 使用 SSE 流式生成，前端打字机效果展示。非阻塞，体验好 |
| **双层角色扮演** | Layer1: "虚拟玩家"有性格背景；Layer2: 用该性格扮演狼人杀角色。这让 AI 发言有辨识度 |
| **AI模型竞技场** | 不同位置可配置不同 LLM 模型（DeepSeek/Qwen/Gemini/Kimi），暗藏"图灵测试" |
| **ZenMux 统一接口** | 抽象所有 LLM 提供商为统一调用层，便于切换模型 |
| **Supabase 后端** | 实时数据库 + 认证，无需自建后端服务器 |
| **DiceBear 头像** | AI 玩家自动生成差异化头像 |
| **Jotai 状态管理** | 轻量原子化状态，比 Redux/Zustand 更适合此类场景 |
| **代码质量** | TypeScript 全栈，类型安全，模块化清晰 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **不支持人类玩家** | 纯 AI vs AI 竞品。Roadmap 写了"Multiplayer Mode"但尚未实现 |
| **房间/社交系统缺失** | 无房间创建、邀请好友、断线重连 |
| **无 TTS** | 纯文字交互，没有语音 |
| **AI 记忆策略** | 虽然发言有上下文，但未看到跨轮次的深层记忆管理 |
| **策略深度** | AI 主要靠 prompt 驱动，没有结构化的策略知识库 |
| **未开源关键配置** | `.env` 配置不完整，LLM API 接口需要自行理解源码配置 |

---

### 2. AIWolfGame (hikariming) — 👑 策略系统最完整

**技术栈**：Python CLI + 12种 LLM 兼容

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **完整的游戏引擎** | 支持 6-12 人局，多种预设配置，狼人/村民/预言家/女巫/猎人/白痴/守卫/骑士 |
| **结构化角色系统** | 每个角色有独立的行为逻辑和提示词，通过 `ai_players.py` 统一管理 |
| **MVP/SVP 评选** | 局后自动评选胜方MVP和败方SVP——对调试AI行为极有用 |
| **平票处理机制** | 平票时进入补充发言阶段，符合真实规则 |
| **多模型横向对比** | 内置 evaluation 模式，可以跑 N 局统计各模型胜率 |
| **配置化设计** | AI 模型配置集中在 `config/ai_config.json`，角色配置在 `config/game_config.json` |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **无前端** | 纯 CLI 运行，`print()` 输出游戏日志 |
| **无多人支持** | 纯 AI 模拟，无 WebSocket/房间系统 |
| **AI 无记忆** | 每轮 LLM 调用都是独立的，靠"发言历史文本"模拟记忆，无结构化 Memory Store |
| **无流式输出** | 发言生成完成后一次性输出，等待时间长 |
| **策略硬编码在 Prompt** | 角色 prompt 直接写在 `game_config.json` 中，难以扩展为知识库 |
| **无 TTS** | 没有语音相关功能 |

---

### 3. Google werewolf_arena — 🧪 研究框架

**技术栈**：Python 引擎 + TypeScript 交互式回放器

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **学术级评估框架** | 标准的 benchmark 设计：控制变量、多模型对比、统计报告 |
| **交互式回放器** | Web UI 可以逐轮查看每个 AI 的"私人推理"和"公开发言"，对调试极有价值 |
| **Prompt 工程设计** | 发言分为"思考（private）"和"发言（public）"两层，AI 先思考再发言 |
| **投票机制** | 每个玩家提交"我想投谁"，允许多次修改，最终统一开票 |
| **State 模型** | Pydantic 模型严控数据结构，类型安全 |
| **游戏日志** | 结构化 JSON 日志，完整记录每局 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **已归档（Archived）** | 2024年7月后不再维护 |
| **非游戏产品** | 设计目标是评测 LLM 推理能力，不是给人玩的 |
| **无多人** | 纯研究工具 |
| **角色少** | 只支持基础角色（狼人/村民/预言家/守卫），无女巫/猎人 |
| **发言回合不灵活** | 固定发言顺序，无真实狼人杀的动态发言 |

---

### 4. LLM-AI-Werewolf-Game (WhatRUHuh) — 🎨 体验打磨最好

**技术栈**：Python Tkinter + ttkbootstrap + pygame + edge-tts

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **TTS 集成** | 使用 `edge-tts`（免费）为 AI 发言生成语音，对用户体验提升巨大 |
| **音效系统** | `pygame` 播放狼嚎、投票等氛围音效 |
| **主题切换** | 白天/黑夜自动切换 GUI 配色，沉浸感强 |
| **多 LLM 支持** | Gemini/OpenAI/Zhipu/Cohere/Anthropic 等多种模型 |
| **模块化设计** | GameLogicHandler、UIHandler、SpeechHandler、VoteHandler 职责分离清晰 |
| **可配置** | 玩家数量、角色比例均可调 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **Tkinter 局限** | 桌面 GUI，无法跨设备、无法多人、界面美感有限 |
| **SpeechHandler 过于庞大** | 79KB 单文件，所有发言 prompt 和 LLM 调用混在一起，难以维护 |
| **无记忆系统** | AI 无跨轮次记忆，依赖完整发言历史传给 LLM |
| **无多人** | 单人桌面应用 |
| **同步阻塞** | LLM 调用是同步的，发言阶段 UI 会卡住 |

---

### 5. AgentWereWolf (yingyingxia666) — 🏗️ Agent 架构最佳

**技术栈**：Python + Agent 架构 + 可能的 Web 前端

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **Agent 系统设计** | 每个 AI 玩家有独立的 `memory`、`decision`、`strategy`、`information` 模块，职责分离极其清晰 |
| **显式的 Agent Architecture** | `agent/memory.py`（存储/检索记忆）、`agent/decision.py`（生成发言+行动）、`agent/strategy.py`（策略选择）、`agent/information.py`（信息管理） |
| **Phase Manager** | `game/phases/` 按阶段拆分（night.py、day_discuss.py、day_vote.py），状态管理清晰 |
| **内存管理** | Agent 有 `generate_reflection()` 和 `format_memory_for_prompt()` 方法——这正好是我们需求文档中的"AI 自维护记忆" |
| **WebSocket + HTTP 并存** | 有房间管理和实时通信的后端 |
| **LLM 配置灵活** | `llms_config/` 目录管理多模型配置 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **Star 极少** | GitHub 可见度低，社区验证不足 |
| **文档缺失** | README 简洁，代码注释不足 |
| **项目成熟度未知** | 无法从公开信息判断完成度 |
| **前端不完整** | 有 `static/` 目录但未确认是否完整可用 |

---

### 6. AIWolf-LLMs (uglyghost123, Gitee) — ⚠️ 学习反面案例

**技术栈**：纯 Python CLI，~900行代码

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **快速原型** | 900行实现完整游戏循环，适合理解基础逻辑 |
| **Prompt 模板分离** | `prompt/` 目录独立存放角色 prompt |

**不足之处（重点）**：

| 弱点 | 详细 |
|------|------|
| **API Key 硬编码** | `"api_key": "87b69e293d184d08886ba0eb8d2cd2cf.xxxxxxxxx"` 直接写在源码中——安全事故 |
| **无配置文件** | 角色配置硬编码在 `main.py` 中 |
| **死代码** | `ui.py` 和 `database.py` 从未被调用 |
| **无记忆** | AI 完全无状态 |
| **单一模型** | 仅支持 ChatGLM |
| **无架构设计** | 少量函数堆砌，无分层**

---

### 7. AI-WerewolfGame (chou109) — 🏛️ 架构过度设计

**技术栈**：Spring Boot 2.5 + Vue 3 + MySQL + Redis + JWT

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **完整的企业级 infra** | JWT 认证、Swagger 文档、MyBatis-Plus ORM、Redis 缓存——基础设施完善 |
| **配置通过 JSON** | 游戏配置（`9p_standard.json`）与代码分离 |
| **Prompt 模板系统** | `templates/` 目录存放 judge_prompt、player_prompt、角色策略 txt |
| **语音接口设计** | `voice/` 目录有语音相关配置，说明考虑了语音功能 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **游戏引擎完全缺失** | `src/judge/`、`src/player/` 等关键目录只有 JSON 配置，无一行代码。项目只是一个空壳 |
| **过度工程** | 为不存在逻辑搭建了完整的企业级基础设施（JWT、Redis、MyBatis-Plus） |
| **Java 技术栈偏重** | Spring Boot 对游戏类项目过于厚重 |

---

### 8. WolfMind (KeLuoJun) — 🧠 三段式决策 + 记忆力

**技术栈**：Python + AgentScope + FastAPI + Vue 3

**可取之处**：

| 亮点 | 详细 |
|------|------|
| **三段式决策** | **心声（内心独白）→ 表现（行为表现）→ 发言（自然语言）**。这个分层设计解决了 AI "思考"与"表现"分离的问题，非常契合我们的需求 |
| **Agent 记忆** | 跨轮次记忆管理，保存玩家的经验 |
| **玩家画像** | AI 维护对其他玩家的判断模型（"对手建模"） |
| **异步并行** | 投票/反思环节用 `asyncio` 并行调用 + 节流，降低 LLM 瞬时压力 |
| **Web 控制台** | FastAPI + Vue 3 提供可视化管理界面和实时日志 |
| **经验知识库** | Agent 的"经验"可跨局保存和学习 |
| **多模型支持** | DashScope/OpenAI/Ollama，支持每玩家独立模型 |
| **数据分析** | 心理分析、社交网络分析——对研究 AI 行为有价值 |

**不足之处**：

| 弱点 | 详细 |
|------|------|
| **主力框架 AgentScope** | AgentScope 是阿里开源的多智能体框架，学习成本高，不如直接用 LLM API |
| **无多人** | 9 个 AI 纯对抗，无人类参与 |
| **项目早期** | Star 4，提交历史短 |
| **文档稀疏** | README 是亮点罗列，缺少架构图和实现细节 |
| **未真实验证** | "自主学习"和"策略优化"的具体效果未经验证 |

---

## 三、共性规律

### 3.1 做得好的（应该采纳）

| 模式                     | 来源                      | 我们怎么用                             |
| ---------------------- | ----------------------- | --------------------------------- |
| **Phase Manager 架构**   | wolfcha, AgentWereWolf  | 游戏阶段抽象为独立模块，onEnter/onComplete 钩子 |
| **AI 三段式决策**           | WolfMind (心声→表现→发言)     | 正好匹配我们的"持续思考+发言"设计                |
| **流式发言生成**             | wolfcha (SSE 流式)        | 减少等待感，打字机效果                       |
| **Agent Memory Store** | AgentWereWolf, WolfMind | AI 维护结构化记忆，非后端统一摘要                |
| **AI 模型竞技场**           | wolfcha (不同位置不同模型)      | 可扩展为 AI 难度等级                      |
| **TTS 集成**             | Tkinter 项目 (edge-tts)   | 免费方案，AI 发言语音化                     |
| **交互式回放器**             | Google werewolf_arena   | 调试 AI 行为的利器                       |
| **MVP/SVP 评选**         | AIWolfGame              | 评估 AI 表现的自动指标                     |
| **二阶段投票**              | Google (先表态后开票)         | 更真实的投票体验                          |

### 3.2 做得不好的（应该避免）

| 反模式 | 表现 | 我们的对策 |
|--------|------|-----------|
| **硬编码配置** | AIWolf-LLMs 的 API Key/角色配置硬编码 | 全部用配置文件 + 环境变量 |
| **无记忆系统** | 大多数项目 AI 无状态，完全依赖每次传入完整历史 | Agent Memory Store + 自维护摘要 |
| **同步阻塞** | Tkinter 项目 LLM 调用阻塞 UI | 全部异步 + WebSocket 推送 |
| **无多人支持** | 8 个项目中有 7 个不支持人类玩家 | 核心需求，必须支持 |
| **死代码/空壳** | chou109 和 AIWolf-LLMs 的大量未实现/未使用代码 | 按 Phase 迭代，不超前搭架子 |
| **单一模型锁死** | 多个项目只支持一种 LLM | 抽象 LLM 接口，支持多模型 |
| **Prompt 与代码耦合** | SpeechHandler.py 79KB 单文件 | Prompt 模板独立文件 |
| **无策略深度** | 大部分项目 AI 靠 prompt 自由发挥 | 策略知识库 + 运行时动态调整 |

---

## 四、对我们的架构建议

基于上述分析，我们的项目有明确的差异化优势：**人类+AI混合、多人支持、TTS、策略系统**。以下是具体建议：

### 4.1 借鉴 wolfcha 的 Phase Manager

```typescript
// 推荐结构
class GamePhaseManager {
  phases: Map<PhaseType, GamePhase>
  
  async transition(next: PhaseType) {
    await this.currentPhase.onComplete()
    this.currentPhase = this.phases.get(next)
    await this.currentPhase.onEnter()
  }
}

// 每个 phase 独立
class NightWerewolfPhase extends GamePhase {
  async onEnter() { /* 启动狼人协商 */ }
  async onComplete() { /* 收集决策结果 */ }
}
```

### 4.2 借鉴 WolfMind 的三段式决策 + AgentWereWolf 的 Agent 模块

```
我们的 AI Pipeline：

Context Builder → 
  ├─ 公共上下文（发言历史+局势）
  ├─ 私有上下文（身份+记忆+策略）
  └─ Persona 注入

Stage 1: 心声（内心独白）→ AI 自己分析当前局势
Stage 2: 表现（行为决定）→ 确定发言策略和投票倾向  
Stage 3: 发言（自然语言）→ 生成150-400字带逻辑的发言

每轮结束后 → Memory Manager 触发记忆更新
```

### 4.3 借鉴 Tkinter 项目的 TTS 实现

```typescript
// Edge TTS 集成
class TTSService {
  async speak(text: string, playerId: string): Promise<AudioBuffer> {
    // 调用 edge-tts CLI 或 API
    // 返回音频流
  }
}
```

### 4.4 借鉴 Google werewolf_arena 的可视化回放

```
后期可选功能：
- 每局结束后生成交互式回放页面
- 展示每个AI的"私人推理"vs"公开发言"
- 帮助玩家理解AI的行为逻辑
```

### 4.5 避免的坑

1. **不要从 Spring Boot + Vue 开始**（chou109 的教训）——Node.js 更适合游戏类项目
2. **不要等到有完整前端再做后端**——先用 CLI + WebSocket 验证 AI 核心逻辑
3. **不要所有 prompt 写在一个文件**——拆分为角色/阶段/任务维度
4. **不要把策略硬编码在 prompt 里**——策略应该是可配置、可扩展的知识结构

---

## 五、各项目技术路线定位

```
                    AI 智能度
                       ↑
         WolfMind ●    │    ● wolfcha
         三段式决策      │    流式+双层层角色扮演
                       │
         AgentWereWolf ●   ● AIWolfGame
         Agent架构+记忆    │    完整引擎+评估
                       │
  ──────────────────────────────→ 产品化程度
         ● Tkinter项目    │
         TTS+GUI        │    ● Google Arena
                       │    研究框架
         ● AIWolf-LLMs  │    ● chou109
         基础原型       │    有壳无核
```

我们的定位：**右上角** — 高 AI 智能度 + 高产品化程度

---

> 下一步：根据此分析更新技术方案，开始 Phase 1 MVP 设计

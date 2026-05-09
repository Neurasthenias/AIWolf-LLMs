# AI狼人杀 — 开发总流程

> 版本：v1.0 | 2026-05-09

---

## 一、流程总览

```
Phase 0: 需求定义   →  REQUIREMENTS.md   ✅ 已完成
Phase 1: 技术方案   →  TECH_DESIGN.md    ← 下一步
Phase 2: MVP 开发   →  可运行 v0.1
Phase 3: 验证打磨   →  v0.1 稳定
Phase 4: 社交扩展   →  v0.2 多人
Phase 5: 完整版     →  v1.0
```

每阶段产出明确、可验证的交付物。前一阶段完成后不轻易回退。

---

## 二、Phase 0：需求定义（已完成）

**产物**：`REQUIREMENTS.md`

**内容**：
- 游戏规则（角色、胜负、流程）
- 功能需求（房间、游戏、AI、语音、UI、容错、菜单）
- AI 系统设计（上下文、持续思考、决策、策略、记忆、Persona）
- 技术架构（技术栈、系统架构、状态机、数据模型、时间模型、API协议）
- 开发路线图

**验收**：团队对齐了"要做什么"，需求文档能支撑技术方案设计。

---

## 三、Phase 1：技术方案设计（即将开始）

**产物**：`TECH_DESIGN.md`

### 3.1 输入

- `REQUIREMENTS.md`
- `ANALYSIS.md`（开源项目分析）
- 技术栈选择：React + Node.js + Socket.IO + SQLite → PostgreSQL

### 3.2 要解决的问题

| 维度 | 解决什么 |
|------|----------|
| **项目结构** | 目录树、monorepo 是否必要、包管理、共享类型定义 |
| **模块接口** | 每个模块的输入/输出/依赖明确定义 |
| **数据流** | Socket.IO 每条消息的 payload schema、REST API 的 request/response 格式 |
| **状态机实现** | 类设计、序列化方案、与模板 JSON 的关系 |
| **AI Pipeline** | Prompt 模板文件组织、LLM 调用封装（含备用模型切换）、流式处理策略 |
| **数据库** | 表结构（ER 图）、索引设计、迁移方案（SQLite → PostgreSQL 路径） |
| **前端组件树** | 页面路由、组件层级、Jotai atoms 定义、页面间状态流转 |
| **交互流程** | 每个菜单页面的交互步骤、状态切换、边界处理（如投票倒计时、发言超时） |
| **测试架构** | 框架选型、Mock 策略（如何 Mock LLM API）、CI 流水线设计 |
| **开发顺序** | Phase 1 内部模块的依赖图 → 先做引擎、再做通信、最后做前端 |

### 3.3 交付物清单

- [ ] 项目目录结构 & 初始化脚本
- [ ] 数据库 ER 图 + DDL
- [ ] 状态机类图 + 接口定义
- [ ] Socket.IO 消息 payload schema
- [ ] REST API 接口文档（含 request/response 示例）
- [ ] AI Pipeline 架构图 + Prompt 模板组织方案
- [ ] 前端路由 & 组件树 & Jotai atoms 定义
- [ ] 菜单页交互流程图
- [ ] 测试架构 & CI 方案
- [ ] Phase 1 模块依赖图 & 开发顺序

### 3.4 验收标准

技术方案完成后，一个不熟悉项目的开发者拿到 `TECH_DESIGN.md` 能够：
1. 理解整体架构
2. 知道从哪里开始编码
3. 知道每个模块的接口是什么
4. 知道前后端如何通信

---

## 四、Phase 2：MVP 开发

**产物**：可运行代码，v0.1

### 4.1 目标

1 真人 + 5 AI，6 人局，从创建房间到胜负判定完整跑通。

### 4.1.1 MVP 明确不做

| 不做 | 原因 | 后续 |
|------|------|------|
| 多房间并发 | 单房先跑通，并发是运维问题 | Phase 4 |
| 持久账号系统 | UUID 游客即可 | Phase 4 |
| 复杂权限系统 | 房主/普通玩家两级足够 | Phase 4 |
| RAG 策略检索 | AI 质量先靠 Prompt 内置策略 | Phase 5 |
| 长期跨局 Memory | 先单局短期记忆 | Phase 5 |
| 观战模式 | 事件流已有基础，UI 后补 | Phase 5 |
| 复杂 UI 动画 | 阶段切换动效已足够 | Phase 4 |
| TTS 语音播报 | v0.1 先文字 | Phase 4 |
| DSL 可视化编辑器 | JSON 配置已够用 | Phase 5 |
| 移动端适配 | 先 Web | Phase 5 |
| OAuth/社交登录 | 游客即可开始 | Phase 4 |
| AI 难度选择 | 先单一难度调优 | Phase 4 |

**砍掉这些，MVP 才真的是 MVP。**

### 4.2 现实时间表

考虑到 Debug、状态一致性、AI Prompt 调优的时间消耗：

| Sprint | 乐观 | 现实 |
|--------|------|------|
| Sprint 0（基础设施） | 1-2天 | 2-3天 |
| Sprint 1（引擎+事件） | 3-4天 | 1-2周 |
| Sprint 2（AI Pipeline） | 2-3天 | 1周 |
| Sprint 3（后端服务） | 2天 | 3-5天 |
| Sprint 4（前端） | 3-4天 | 1周 |
| Sprint 5（集成打磨） | 2天 | 1周 |
| **合计** | **13-18天** | **5-7周** |

### 4.2 开发流程

```
按依赖顺序，共 6 个增量交付：

Sprint 0: 基础设施（1-2天）
  ├─ Monorepo 初始化（pnpm workspace / Turborepo）
  ├─ TypeScript project references 配置
  ├─ ESLint + Prettier + Husky（pre-commit hook）
  ├─ `/packages/shared` — 共享类型（Event、Intent、State、Zod Schema）
  ├─ `/packages/protocol` — 协议定义（Event/Command/Socket Payload，独立包）
  ├─ Deterministic Random（`seedrandom`）
  ├─ Logger 基础设施
  ├─ Config System（环境变量 + JSON config loader）
  ├─ Test Harness（Vitest + Mock 策略）
  └─ 交付物：monorepo 骨架可运行，所有包能互相引用
      验收：`pnpm build` 全绿 + `pnpm test` 可运行

Sprint 1: 游戏引擎 + 事件系统（3-4天）
  ├─ **Event Schema 定义**（Domain/System/AI/UI/Audit 五层事件）
  ├─ **Command Schema 定义**（所有操作的 Intent 类型）
  ├─ **STATE_MACHINE_SPEC.md 编写**（所有状态/子阶段/合法转移/超时/中断行为）
  ├─ Reducer 实现：`(state, event) → { newState, effects[] }`
  ├─ Effect System（Timer/Socket Broadcast/TTS/AI Pipeline 均为 Effect）
  ├─ Intent Validator（校验 AI 和人类的操作合法性）
  ├─ 角色行为逻辑（狼人/预言家/女巫/村民）
  ├─ 胜负判定 + 死亡原因追踪
  ├─ Rule-based AI（随机决策，用于验证引擎）
  ├─ 单元测试（状态机全覆盖 + 所有转移路径）
  ├─ **蒙特卡洛模拟**（1000 局 Rule-based AI → 卡死率 = 0%）
  └─ 交付物：Headless Engine 包，可通过 CLI 独立运行模拟
      验收：`npm test` 全绿 + 1000 局蒙特卡洛零卡死 + `cli.js simulate` 可用

Sprint 2: AI Pipeline（2-3天）
  ├─ LLM 调用封装（含备用模型 + 重试 + 超时 + Fail Policy）
  ├─ AI Provider 统一层（`/providers/openai.ts`, `deepseek.ts`）
  ├─ Context Builder（公共/私有上下文组装 + Token Budget 控制）
  ├─ Structured AI Pipeline: Think → Plan → Speak → Act 四层
  ├─ Prompt Manager（模板选择 + 策略注入）
  ├─ Response Parser（提取行动/发言/投票 + JSON Schema 校验）
  ├─ Memory Manager（AI 自维护记忆）
  ├─ **AI Prompt Trace**（记录所有 LLM 调用的 prompt/response）
  └─ 交付物：引擎 + AI 可在终端跑出有质量的 AI 发言

Sprint 3: 后端服务（2天）
  ├─ Express + Socket.IO 服务启动
  ├─ 房间 CRUD（创建/加入/离开）
  ├─ 游戏状态推送（gamestate → 所有客户端）
  ├─ 事件处理（speech/vote/night_action/self_explode）
  ├─ 容错机制（断线接管 + 数据补发、LLM 失败降级、超时处理）
  └─ 交付物：后端可接受前端连接 + 完整游戏流程
      验收：两个浏览器窗口连上同一房间，看到同步的游戏状态

Sprint 4: 前端 MVP（3-4天）
  ├─ 项目脚手架（React + Vite + Tailwind + Jotai）
  ├─ 首页 + 房间页（创建/加入/等待）
  ├─ 游戏页面（聊天面板 + 投票面板 + 角色卡 + 状态栏 + 夜晚操作）
  ├─ 阶段切换动效（天黑/天亮）
  ├─ Socket.IO 客户端封装
  └─ 交付物：Web 端完整可玩
      验收：单人开 6 人局从头到尾无阻断

Sprint 5: 集成 & 打磨（2天）
  ├─ 前后端联调修复
  ├─ 真人操作超时处理 + 倒计时 UI
  ├─ AI 发言打字机效果
  ├─ 游戏结束展示 MVP/SVP
  ├─ 集成测试（6 AI 自动对战 × 20局）
  └─ 交付物：v0.1 稳定版本
      验收：20 局 AI 自动对战 + LLM 裁判评审通过（均分 ≥ 7）
```

### 4.3 技术规范

| 规范 | 工具 |
|------|------|
| 代码风格 | ESLint + Prettier |
| 类型检查 | TypeScript strict mode |
| 提交信息 | Conventional Commits（`feat:` `fix:` `test:`） |
| 分支策略 | `main` + feature 分支，Sprint 完成后 squash merge |

### 4.4 模块依赖边界（不可违反）

| 模块 | 允许依赖 | 禁止依赖 |
|------|----------|----------|
| `shared` | 无外部依赖 | — |
| `protocol` | `shared` | — |
| `engine` | `shared`, `protocol` | `ai`, `server`, `web`, Socket, DB |
| `ai` | `engine`, `shared`, `protocol` | `server`, `web` |
| `server` | `engine`, `ai`, `shared`, `protocol` | `web` |
| `web` | `shared`, `protocol` 的 Socket Payload 类型 | `engine`, `ai`, `server` |

**环依赖检测**：CI 中加入 `madge --circular` 检查。

### 4.5 不可变架构原则

这些原则写入 `ARCHITECTURE.md`，任何 PR 违反直接拒绝：

1. **Reducer 永远纯函数** — `(state, event) → { state, effects[] }`，不允许副作用
2. **GameState 不允许外部 mutable 修改** — 所有状态变化必须来自 Event
3. **AI 永远不直接改状态** — AI 只输出 Intent，经 Validator 校验后由引擎执行
4. **所有外部输入必须经过 Command Validator** — 人类和 AI 同路径
5. **所有 Effect 必须显式声明** — 不允许 `io.emit()` 散落在 Reducer 中
6. **Engine 不依赖 UI/Socket/DB** — Headless，可 CLI 独立运行
7. **事件命名统一** — 使用 `domain:action_past_tense` 格式（`vote:cast`、`player:died`），不允许同义异名
8. **所有协议带 version** — Event、Command、State、Prompt 全部带 version 字段

---

## 五、Phase 3：验证打磨

**产物**：v0.1 稳定版（无新功能上线前）

### 5.1 验证内容

- [ ] 状态机所有分支路径覆盖（单元测试）
- [ ] AI 一致性回归（20 局 AI vs AI → LLM 裁判自动评分 ≥ 7）
- [ ] 真人玩家体验测试（邀请 2-3 人试玩）
- [ ] 性能基线（首屏 < 3s、消息延迟 < 200ms）

### 5.2 打磨内容

- [ ] 根据试玩反馈调整 AI 策略/发言质量
- [ ] 修复断线重连、超时等边界 bug
- [ ] UI 小修小补（排版、动画）

---

## 六、Phase 4：社交扩展（v0.2）

### 6.1 新增功能

- 多人房间（2-6 真人 + AI 补齐）
- TTS 语音播报 AI 发言
- Persona 系统上线
- UI 美化（角色卡插画）

### 6.2 技术重点

- 多人同步 → Socket.IO room 机制
- TTS → Edge TTS 流式推送
- **先做 Rule-based AI 验证引擎**：用脚本 AI（随机投票 + 简单逻辑）跑通完整流程，确认状态机无 Bug，再加入 LLM

### 6.3 确定性回放

- 每局记录 random seed + model + prompt version + 完整事件流
- 支持精确回放任何一局
- 支持回归测试：改 prompt 后用相同 seed 重跑，对比 AI 行为差异

---

## 七、Phase 5：完整版（v1.0）

### 7.1 新增功能

- 猎人、守卫角色
- 9人局 / 12人局模板
- 可视化工作流编辑器
- 策略知识库 RAG 扩展
- 游戏回放（基于事件流重放）
- 移动端适配
- 观战模式（基于事件流推送）

---

## 八、文档体系

```
E:\狼人杀\
├─ REQUIREMENTS.md    ← 需求文档（做什么）
├─ ANALYSIS.md        ← 开源项目分析（别人怎么做）
├─ DEVELOPMENT.md     ← 开发总流程（本文档）
├─ STATE_MACHINE_SPEC.md ← 状态机规格（状态/事件/转移/超时/中断）[Phase 1 产出]
├─ TECH_DESIGN.md     ← 技术方案（怎么做）           [Phase 1 产出]
├─ GAME_PROTOCOL.md   ← 游戏协议（Event Schema + Socket Schema + State Schema + Command Schema）[Phase 1 产出]
├─ ENGINE_API.md      ← 引擎公共 API（createGame/dispatchCommand/subscribeEvents/replay/simulate）[Phase 1 产出]
├─ EFFECT_RUNTIME.md  ← Effect 运行时规范（执行模型/取消/重试/去重/顺序）[Phase 1 产出]
├─ PROMPT_SPEC.md     ← Prompt 规范（模板 + 变量 + JSON Schema + 解析规则）[Phase 2 产出]
├─ AI_BEHAVIOR.md     ← AI 行为手册（Persona + 策略原则 + 发言风格）[Phase 2 产出]
├─ OBSERVABILITY.md   ← 可观测性规范（埋点指标 + 日志格式 + 监控看板）[Phase 2 产出]
├─ ARCHITECTURE.md    ← 架构决策记录（为什么这么做）   [Phase 2 产出]
├─ CHANGELOG.md       ← 版本变更记录                  [v0.1 出]
└─ README.md          ← 项目简介 + 快速开始            [v0.1 出]
```

| 文档 | 阶段 | 回答的问题 |
|------|------|-----------|
| REQUIREMENTS.md | Phase 0 | 做什么？ |
| ANALYSIS.md | Phase 0 | 别人怎么做？有什么坑？ |
| DEVELOPMENT.md | Phase 0 | 怎么组织开发？ |
| STATE_MACHINE_SPEC.md | Phase 1 | 所有状态长什么样？怎么转移？ |
| TECH_DESIGN.md | Phase 1 | 怎么做？结构、接口、数据流 |
| GAME_PROTOCOL.md | Phase 1 | 事件长什么样？前后端怎么通信？ |
| ENGINE_API.md | Phase 1 | 引擎有哪些公开方法？怎么调用？ |
| EFFECT_RUNTIME.md | Phase 1 | Effect 怎么执行/取消/重试？ |
| PROMPT_SPEC.md | Phase 2 | Prompt 怎么写？输入输出格式？ |
| OBSERVABILITY.md | Phase 2 | 埋什么指标？日志格式是什么？ |
| AI_BEHAVIOR.md | Phase 2 | AI 怎么说话？怎么推理？ |
| ARCHITECTURE.md | Phase 2 | 为什么这么设计？关键决策记录 |
| CHANGELOG.md | 每版本 | 改了什么？ |
| README.md | v0.1 | 怎么跑起来？ |

---

## 九、技术栈细化建议

基于需求文档中的架构设计，在技术方案阶段建议评估以下选型：

| 当前文档 | 建议替换/增强 | 理由 |
|----------|-------------|------|
| Express | **Fastify** | TypeScript 支持更好，Schema 验证更强，WebSocket 更友好 |
| 无 schema 验证 | **Zod** | 验证 Socket payload、REST request、AI response，防止 AI 乱输出炸游戏 |
| 裸 SQL / Knex | **Drizzle ORM** | 轻量、TS 类型强、SQLite→PostgreSQL 迁移平滑 |
| LLM 调用散落各处 | **统一 AI Provider 层** | `/providers/openai.ts`、`deepseek.ts`、`anthropic.ts`，统一 `generateSpeech()` / `generateAction()` 接口 |
| 直接 mutable state | **Event Sourcing** | `GameState = reduce(events)`，支撑回放、Debug、断线恢复 |

### 9.1 Phase 2 先做 Rule-based AI

在引入 LLM 之前，先用脚本 AI（随机投票 + 简单策略）跑通完整游戏流程。目的：

- 验证状态机和事件系统无 Bug
- 隔离"引擎问题"和"LLM 问题"
- 建立 AI 行为基线（Rule-based AI 的 LLM 裁判评分作为基线，对比 LLM AI 的提升）

---

## 十、流程原则

1. **文档先行**：先写清楚再动手，避免返工
2. **增量交付**：每个 Sprint 产出可验证的东西，不是半成品
3. **引擎优先**：游戏逻辑是最核心的，前端和通信都围绕引擎
4. **Headless 引擎**：引擎不依赖 Socket/React/DB，可 CLI 独立运行
5. **事件溯源**：`GameState = reduce(events)`，不直接修改 mutable state
6. **Command Bus 统一入口**：Socket、CLI、Bot、Spectator 复用同一 Command 层
7. **Reducer 纯函数 + Effect 显式**：`reduce(state, event) → { state, effects[] }`
8. **AI 只输出 Intent**：AI 不能直接修改 GameState，Intent 经过 Validator 才执行
9. **尽早集成**：Sprint 3 起前后端联调，不等到最后
10. **测试驱动状态机**：单元测试 + 蒙特卡洛模拟（1000局）确保零卡死
11. **确定性可复现**：seed + model + prompt version + 完整事件流
12. **先规则后 LLM**：用 Rule-based AI 验证引擎，再引入 LLM
13. **版本化**：Event/Prompt/State/Protocol 全部带 version 字段
14. **可观测性**：AI Prompt Trace 必须可用，否则无法 Debug
15. **MVP 不做通用平台**：工作流编辑器、插件系统、分布式 Actor 等延后到 Phase 3+；先做出能稳定跑完一局的引擎
16. **引擎 API 文档化**：`createGame() / dispatchCommand() / subscribeEvents() / replay() / simulate()` 对外统一接口
17. **配置显式化**：所有可变参数（超时、人数、角色、AI 模型）不进代码，走配置文件或环境变量，在事件流中记录配置 hash，保证回放可复现
18. **早期部署**：Phase 2 结束前产出 Docker 镜像和部署脚本。本地能跑和部署运行是两件事，越早暴露问题越好

# 🐺 AI 狼人杀 · AIWolf-LLMs

> 一个人也能玩的狼人杀 —— 6 名 AI 玩家，6 种人格，零组织成本，随时开局。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-black)](https://fastify.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101)](https://socket.io/)
[![OpenAI SDK](https://img.shields.io/badge/LLM-OpenAI%20Compatible-412991)](https://platform.openai.com/)

---

## 这是什么？

**AIWolf-LLMs** 是一个由大语言模型驱动的狼人杀社交推理游戏平台。你不需要凑齐 6-12 个真人朋友 —— 只需打开浏览器，创建房间，AI 玩家就会以各自独特的人格、记忆和策略加入对局。支持 1 个真人 + 5 个 AI，也支持多真人混排。

**为什么做这个？** 狼人杀很好玩，但凑人太难。现有的 AI 桌游对手要么发言随机、前后矛盾，要么毫无个性。我们想要的是：**有记忆、有人格、会撒谎、能自洽的 AI 玩家**。

---

## 核心亮点

- **🎭 6 种 AI 人格** —— 冷静分析师、激进煽动者、狡诈欺骗者、沉默观察者、忠诚守护者、混乱制造者。每个人格有独立的理性度、攻击性、欺骗倾向和风险偏好，且与角色身份联动匹配
- **🧠 AI 记忆系统** —— 每个 AI 维护信念网络（对每个玩家的怀疑度、信任评分）、发言历史（一致性自检）、关键事件时间线和策略演化轨迹，不会"说完就忘"
- **🔐 信息隔离 ** —— 基于玩家身份构建差异化信息视窗：狼人可见队友，预言家可见查验结果，村民仅获公开信息。从架构层面防止作弊和信息泄露
- **📜 事件溯源架构** —— 所有游戏状态由不可变事件序列派生，支持完整回放、审计和确定性复现
- **🌐 实时 Web 交互** —— React 前端 + Socket.IO 实时推送，发言、投票、夜间行动流畅自然
- **🔄 全自动模拟** —— 支持 6 AI 批量对战，一键跑多局统计胜负分布

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript 5.7（strict 模式） |
| 运行时 | Node.js 22 LTS |
| 包管理 | pnpm workspaces + Turborepo |
| 后端 | Fastify 5（REST）+ Socket.IO 4（实时） |
| 前端 | React 19 + Vite 6 + Tailwind CSS 4 + Zustand |
| AI | OpenAI SDK（兼容 DeepSeek / GPT / 任意 OpenAI 兼容 API） |
| 校验 | Zod 3（全栈 Schema 校验） |
| 数据库 | Drizzle ORM + SQLite |
| 测试 | Vitest 2 + fast-check（基于属性的随机测试） |

### 架构简图

```
Input (REST / Socket / CLI)
        │
   ┌────▼────┐
   │CommandBus│  ← 真人与 AI 走同一条命令通道
   └────┬────┘
        │
   ┌────▼────────┐
   │CommandHandler│
   └────┬────────┘
        │  Events[]
   ┌────▼────┐
   │ Reducer │  纯函数：(state, events) → {newState, effects[]}
   └────┬────┘
        │
   ┌────▼─────────┐
   │Effect Runtime│  Timer / AI 调用 / Socket 广播 / 持久化
   └────┬─────────┘
        │  新事件回流 CommandBus  循环 ↻
```

---

## 快速开始

### 1. 环境准备

```bash
# 确保已安装 Node.js 22+ 和 pnpm 11+
node -v   # >= 22
pnpm -v   # >= 11
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 LLM API Key：

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1    # 或 https://api.deepseek.com/v1
OPENAI_MODEL=gpt-4o-mini                       # 或 deepseek-chat
PORT=3001
```

### 4. 启动服务

```bash
# 同时启动后端（3001）和前端（5174）
pnpm dev
```

浏览器访问 `http://localhost:5174`，创建房间即可开始游戏。

---

## 项目结构

```
狼人杀/
├── packages/
│   ├── shared/       # 共享类型（事件、命令、状态、角色）
│   ├── protocol/     # 协议定义（Socket 负载 Schema）
│   ├── engine/       # 无头游戏引擎（纯逻辑，零外部依赖）
│   ├── ai/           # AI Pipeline（Provider / 人格 / 记忆 / 上下文构建）
│   ├── server/       # Fastify + Socket.IO 服务端 + GameRuntime
│   └── ...           # 更多子包
├── apps/
│   └── web/          # React SPA 前端
├── docs/             # 需求 / 技术设计 / 竞品分析 / 开发路线
├── .data/            # 游戏事件日志 & AI 追踪记录（JSONL）
└── .env.example      # 环境变量模板
```

---

## 命令速查

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 同时启动前后端开发服务 |
| `pnpm --filter @aiwolf/server dev` | 仅启动后端（端口 3001） |
| `pnpm --filter @aiwolf/web dev` | 仅启动前端（端口 5174） |
| `pnpm --filter @aiwolf/engine test` | 运行引擎测试 |
| `pnpm --filter @aiwolf/server simulate` | 运行 AI 批量模拟 |

---

## 游戏规则

标准 6 人局：**2 狼人 + 1 预言家 + 1 女巫 + 1 猎人 + 1 村民**。

流程：**夜晚**（狼人刀人 → 预言家查验 → 女巫用药/毒）→ **白天**（公布死讯 → 轮流发言 → 投票放逐）→ 循环直至一方获胜。

详细规则见 [REQUIREMENTS.md](docs/REQUIREMENTS.md#2-游戏规则)。

---

## 开发路线

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 需求分析 + 竞品调研（8 个项目） | ✅ 完成 |
| Phase 1 | 技术设计（状态机 / Event Sourcing / AI Pipeline） | ✅ 完成 |
| Phase 2 | MVP 开发（引擎 + AI + 前后端） | 🚧 进行中 |
| Phase 3+ | TTS 语音 / 更多角色 / 工作流编辑器 / 社交功能 | 📋 计划中 |

---

## 致谢

竞品分析阶段参考了 [wolfcha](https://github.com/oil-oil/wolfcha)、[AIWolfGame](https://github.com/hikariming/AIWolfGame) 等优秀开源项目，详见 [ANALYSIS.md](docs/ANALYSIS.md)。

---

*Made with ❤️ for the Werewolf community.*

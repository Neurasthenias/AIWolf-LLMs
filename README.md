# 🐺 AI 狼人杀 · AIWolf-LLMs

> 一个人也能玩的狼人杀 —— 6 种 AI 人格，零组织成本，随时开局。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-black)](https://fastify.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101)](https://socket.io/)
[![OpenAI SDK](https://img.shields.io/badge/LLM-OpenAI%20Compatible-412991)](https://platform.openai.com/)

---

## 这是什么？

LLM 驱动的狼人杀平台。OpenAI 兼容 API 即可驱动 AI 玩家，支持 1 真人 + 5 AI 或多人混排。目标是**有记忆、有人格、会撒谎、能自洽的 AI 对手**，解决"凑不齐人就没法玩"的核心痛点。

---

## 核心亮点

- **🎭 6 种 AI 人格** —— 冷静分析师、激进煽动者、狡诈欺骗者等，各有独立理性度、攻击性、欺骗倾向和风险偏好，且与角色联动匹配
- **🧠 记忆系统** —— 信念网络、发言历史、事件时间线、策略轨迹，告别"说完就忘"
- **🔐 信息隔离** —— 基于身份的差异化视窗：狼人见队友，预言家见查验，村民仅获公开信息
- **📜 事件溯源** —— 全部状态由不可变事件派生，支持完整回放与确定性复现
- **🔄 批量模拟** —— 6 AI 全自动对战，一键统计胜负分布

---

## 技术栈

TypeScript 5.7 · Node.js 22 · pnpm monorepo + Turborepo · Fastify 5 + Socket.IO 4 · React 19 + Vite 6 + Tailwind CSS 4 + Zustand · OpenAI SDK（兼容 DeepSeek / GPT）· Zod 3 · Drizzle ORM + SQLite · Vitest 2 + fast-check

```
Input → CommandBus → CommandHandler → Events[] → Reducer → Effect Runtime → 新事件回流 ↻
         ↑ 真人与 AI 走同一条通道      纯函数                   Timer / AI / Socket / DB
```

---

## 快速开始

```bash
# Node.js 22+ 和 pnpm 11+
pnpm install
cp .env.example .env   # 填入 OPENAI_API_KEY
pnpm dev               # 后端 :3001 + 前端 :5174
```

---

## 项目结构

```
├── packages/
│   ├── engine/       # 无头引擎（纯逻辑，零依赖）
│   ├── ai/           # AI Pipeline（Provider / 人格 / 记忆 / 上下文）
│   ├── server/       # Fastify + Socket.IO + GameRuntime
│   └── shared/       # 共享类型 & 协议
├── apps/web/         # React SPA 前端
└── docs/             # 需求 / 技术设计 / 竞品分析
```

---

## 游戏规则

标准 6 人局：2 狼人 + 预言家 + 女巫 + 猎人 + 村民。夜晚（刀人 → 查验 → 用药）→ 白天（发言 → 投票放逐）→ 循环至胜负分晓。详见 [REQUIREMENTS.md](docs/REQUIREMENTS.md)。

---

## 开发路线

| 阶段 | 状态 |
|------|------|
| Phase 0-1 — 需求 & 技术设计（含 8 项目竞品分析） | ✅ |
| Phase 2 — MVP 开发（引擎 + AI + 前后端） | 🚧 |
| Phase 3+ — TTS / 更多角色 / 社交功能 | 📋 |

---

竞品参考：[wolfcha](https://github.com/oil-oil/wolfcha) · [AIWolfGame](https://github.com/hikariming/AIWolfGame) —— 详见 [ANALYSIS.md](docs/ANALYSIS.md)

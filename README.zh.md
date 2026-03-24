[English](README.md) | [日本語](README.ja.md) | **中文**

# PixelVault — 个人 AI 画廊

多模型 AI 图像与视频生成平台，支持永久归档、盲投竞技场和故事板创作。

**在线演示:** [https://pixelvault-seven.vercel.app/](https://pixelvault-seven.vercel.app/)

---

## 功能特性

- **多模型 AI 生成** — 6 个供应商提供 11 个图像模型 + 10 个视频模型
- **竞技场（盲投）** — 并排对比输出，ELO 排名系统
- **故事板** — AI 生成漫画风格叙事序列
- **画廊** — 公开信息流，支持搜索、筛选和无限滚动
- **个人主页** — 带统计信息的个人图库，支持 R2 联动彻底删除
- **提示词增强** — LLM 驱动的提示词优化（OpenAI / Gemini / DeepSeek）
- **逆向工程** — 分析已有图像，提取生成参数
- **BYOK（自带密钥）** — 加密的 API 密钥管理，解锁高级模型
- **永久存储** — 所有生成内容存储在 Cloudflare R2
- **积分系统** — 新用户赠送免费积分，按模型分级计费
- **多语言** — 英语、日语、中文（`/en`、`/ja`、`/zh`）
- **移动优先** — 响应式布局 + 底部标签导航

---

## AI 模型

### 图像模型

| 模型 | 供应商 | 等级 | 积分 |
|------|--------|------|------|
| GPT-Image 1.5 | OpenAI | 高级 | 3 |
| Gemini Pro Image | Google | 高级 | 2 |
| FLUX 2 Pro | Fal | 高级 | 2 |
| Seedream 4.5 | Replicate | 高级 | 2 |
| Ideogram 3 | Replicate | 标准 | 2 |
| Recraft V3 | Replicate | 标准 | 2 |
| Gemini Flash | Google | 标准 | 1 |
| FLUX 2 Dev | Fal | 标准 | 1 |
| FLUX 2 Schnell | Fal | 经济 | 1 |
| Animagine XL 4.0 | HuggingFace | 经济 | 1 |
| Stable Diffusion XL | HuggingFace | 经济 | 1 |

### 视频模型

| 模型 | 供应商 | 等级 | 积分 |
|------|--------|------|------|
| Kling V3 Pro | Fal | 高级 | 5 |
| Veo 3 | Google | 高级 | 5 |
| Sora 2 | OpenAI | 高级 | 5 |
| Seedance Pro | Replicate | 高级 | 4 |
| MiniMax Hailuo | Fal | 标准 | 3 |
| Luma Ray 2 | Fal | 标准 | 3 |
| Pika 2.2 | Replicate | 标准 | 3 |
| Kling V2 | Fal | 经济 | 2 |
| Wan 2.2 | Fal | 经济 | 2 |
| HunyuanVideo | HuggingFace | 经济 | 2 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 语言 | TypeScript (strict) |
| 样式 | Tailwind CSS + shadcn/ui |
| 认证 | Clerk |
| 数据库 | PostgreSQL (Neon) via Prisma 7 |
| 存储 | Cloudflare R2 |
| AI 供应商 | HuggingFace, Google Gemini, OpenAI, Fal, Replicate |
| 校验 | Zod |
| 测试 | Vitest (97 个测试) |
| 部署 | Vercel |

---

## 项目结构

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/              # 登录、注册
│   │   └── (main)/
│   │       ├── studio/          # 图像和视频生成
│   │       ├── gallery/         # 公开画廊 + 详情视图
│   │       ├── arena/           # 盲投对决 + 排行榜
│   │       ├── storyboard/      # AI 故事板创作
│   │       └── profile/         # 个人图库 + 统计
│   └── api/
│       ├── generate/            # POST — AI 生成 → R2 → DB
│       ├── arena/               # 竞技场对战 + 投票
│       ├── api-keys/            # BYOK 密钥管理
│       ├── models/              # 模型列表 + 健康检查
│       ├── admin/               # 管理员模型配置 CRUD
│       ├── credits/             # 用户积分
│       └── webhooks/clerk/      # Clerk user.created 同步
│
├── components/
│   ├── ui/                      # shadcn/ui 原子组件（无状态）
│   ├── business/                # 有状态业务 UI（使用 hooks，不直接调 API）
│   └── layout/                  # Navbar, MobileTabBar
│
├── hooks/                       # 客户端状态管理
├── services/                    # 服务端业务逻辑
├── constants/                   # 配置、枚举、路由
├── types/                       # Zod schemas + TypeScript 类型
├── lib/                         # 数据库、API 客户端、工具函数
└── messages/                    # i18n (en, ja, zh)
```

---

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 数据库（推荐 Neon）
- Cloudflare R2 存储桶
- Clerk 账户
- 至少一个 AI 供应商的 API 密钥

### 环境变量

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# 数据库
DATABASE_URL=postgresql://...

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=

# AI 供应商（至少需要一个）
HUGGINGFACE_API_KEY=hf_...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
FAL_KEY=...
REPLICATE_API_TOKEN=r8_...
```

### 安装和运行

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

---

## 开发进度

| 阶段 | 状态 | 描述 |
|------|------|------|
| Phase 1 | 已完成 | MVP — 核心生成流程 |
| Phase 2 | 已完成 | 持久化 — Prisma + Cloudflare R2 |
| Phase 3 | 已完成 | 用户系统 + 积分 |
| Phase 4 | 已完成 | 画廊、个人主页、故事板、竞技场 |
| Phase 5 | 已完成 | UX 优化、安全加固、视频生成 |

---

## 安全性

- AES-256-GCM 加密存储 API 密钥
- 令牌桶限流（生成 10 req/min，视频 5 req/min）
- 图片上传校验（最大 10MB，MIME 类型检查）
- 错误信息脱敏（不泄露内部细节）
- Webhook 重放保护
- 仅服务端扣减积分
- 不通过 `NEXT_PUBLIC_` 暴露 AI 密钥或数据库凭证

---

## 架构原则

- **禁止魔法值** — 所有配置集中在 `src/constants/`
- **严格 TypeScript** — 禁用 `any`，通过 Zod schema 定义类型
- **分层架构** — constants → types → services → hooks → components
- **精简 API 路由** — 仅做认证检查 + Zod 校验 + 调用 service
- **服务端积分逻辑** — 永远不信任客户端传来的积分值

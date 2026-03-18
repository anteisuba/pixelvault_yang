CLAUDE.md — Personal AI Gallery Project Rules

這個文件是 Claude Code 的「行為規範」。每次啟動新對話時，Claude Code 會自動讀取並遵守這些規則。

🎯 項目概覽
Personal AI Gallery — 支持多 AI 模型的圖片生成 & 永久歸檔平台。

🎨 设计语言（必须遵守）

参考：Anthropic.com 的 Warm Editorial 风格

色彩系统：

- 背景：#faf9f5（米白，非纯白）
- 主文字：#141413（近黑，非纯黑）
- 次要文字：#b0aea5
- 区块分隔：#e8e6dc
- 主强调色：#d97757（terracotta 橙）
- 次强调色：#6a9bcc
- 三级强调色：#788c5d

字体：

- 标题：Space Grotesk（或你实际用的）
- 正文：Lora / 系统衬线体
- 标题与正文必须是 sans + serif 配对

布局：

- 内容最大宽度 1200px
- 正文列宽 ≤720px
- Section 间距 80-128px
- 留白宁多勿少

动效：

- 仅用 fade-in + translate-up，duration 300-600ms
- easing: ease-out
- 禁止 bounce、spring、视差滚动、粒子效果

绝对禁止的视觉风格：

- ❌ 蓝紫渐变、霓虹光效
- ❌ 重投影卡片
- ❌ 纯白 #ffffff 背景
- ❌ Inter/Roboto 等通用字体
- ❌ generic AI 美学（深色 + 蓝光 + 科技感）

🔥 当前任务焦点

- ✅ Hero section 重构：已改為左右分欄 + 獨立指標條 + Gallery Preview 獨立 section
- ✅ Landing page 整体节奏：section 間距 80-128px、動畫分段延遲、CTA 層次清晰
- ✅ 移动端响应式：已修復 LocaleSwitcher 任意值、MobileTabBar 字號/觸控、Navbar 間距、Hero 小屏間距
- ✅ Gallery 頁面實現（GalleryFeed + GalleryGrid + ImageCard + use-gallery hook + API）
- Profile 頁面實現（Phase 3 未完成）

Web (Next.js 16, App Router + Turbopack)
支持 Stable Diffusion XL、Animagine XL 4.0（動漫風格）、Gemini 3.1 Flash Image
AI 提供商：HuggingFace Inference API、Google Gemini API
用戶系統 (Clerk) + 積分系統 + 圖片永久存儲 (Cloudflare R2)
數據庫：Prisma 7 + PostgreSQL (Neon)，使用 PrismaPg Driver Adapter

🚫 絕對禁止事項 (Hard Rules)

禁止 Magic Values：不得在組件或邏輯代碼中硬編碼字符串/數字

❌ model === 'dall-e-3'
✅ model === AI_MODELS.DALLE_3（從 @/constants/models.ts 引入）

禁止使用 any：所有類型必須明確定義

❌ const data: any = response
✅ 使用 interface、zod schema 或具體類型

禁止在組件內直接 fetch：所有 API 請求必須封裝

❌ fetch('/api/generate', {...}) 寫在組件 onClick 裡
✅ 調用 @/lib/api-client.ts 中封裝的函數

禁止在 API Route 寫業務邏輯：API Route 只做三件事

驗證身份 (Auth check)
校驗入參 (Zod parse)
調用 Service

禁止使用 Tailwind 任意值（除非已在 config 定義）

❌ w-[256px]
✅ w-64 或在 tailwind.config.ts 中定義 extend

✅ 必須遵守的規範
代碼架構
新功能開發順序（必須按此順序）：

1. constants/ → 先定義所有配置變量
2. types/ → 定義數據結構和接口類型
3. services/ → 寫後端業務邏輯（如涉及後端）
4. hooks/ → 寫前端狀態邏輯
5. components/ → 最後組裝 UI
   TypeScript

所有文件使用 .ts / .tsx，不使用 .js
所有 props 必須定義 interface，命名為 XxxProps
API 請求/響應使用 zod schema 驗證，並從 schema 推導類型：

ts const schema = z.object({...})
type MyType = z.infer<typeof schema>
組件規範

UI 組件 (components/ui/)：無狀態、無業務邏輯、純展示
業務組件 (components/business/)：可使用 hooks，但不直接調用 API
佈局組件 (components/layout/)：頁面骨架、導航欄

命名規範
類型規範例子組件文件PascalCaseImageCard.tsxHookcamelCase + use前綴useGenerateImage.tsServicecamelCase + Service後綴image.service.ts常量SCREAMING_SNAKE_CASEAI_MODELS, ROUTES類型/接口PascalCaseGenerateRequest
導入順序（必須按此順序，空行分隔）
ts// 1. React / Next.js
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 2. 第三方庫
import { z } from 'zod'
import { useUser } from '@clerk/nextjs'

// 3. 內部常量/類型
import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import type { GenerateRequest } from '@/types'

// 4. 內部組件/服務/hooks
import { Button } from '@/components/ui/button'
import { useGenerateImage } from '@/hooks/use-generate'

// 5. 樣式（如需要）
import styles from './styles.module.css'

📁 目錄結構（實際）
src/
├── app/
│ ├── layout.tsx # 根佈局
│ ├── page.tsx # 根頁面（重定向到 /en/sign-in）
│ └── [locale]/
│ │ ├── layout.tsx # locale 佈局
│ │ ├── (auth)/
│ │ │ ├── sign-in/[[...sign-in]]/page.tsx
│ │ │ └── sign-up/[[...sign-up]]/page.tsx
│ │ └── (main)/
│ │ ├── layout.tsx # 包含 Navbar 的佈局
│ │ └── studio/page.tsx # 創作台（需登錄）✅
│ └── api/
│ ├── generate/route.ts # POST 圖片生成 → AI → R2 → DB
│ ├── credits/route.ts # GET 當前用戶積分
│ └── webhooks/clerk/route.ts # Clerk user.created 同步
│
├── components/
│ ├── ui/ # shadcn/ui 原子組件（button, select, textarea）
│ ├── business/
│ │ ├── GenerateForm.tsx # 生成表單（prompt + 模型選擇 + 圖片預覽）
│ │ └── ModelSelector.tsx # 模型下拉選擇器
│ └── layout/
│ └── Navbar.tsx # 頂部導航（Logo + 積分 + UserButton）
│
├── hooks/
│ ├── use-generate.ts # 圖片生成狀態管理
│ └── use-credits.ts # 用戶積分查詢
│
├── services/
│ ├── generation.service.ts # Generation CRUD（createGeneration, getUserGenerations, getPublicGenerations）
│ ├── user.service.ts # User CRUD + 積分操作（deductCredits, addCredits）
│ └── storage/
│ └── r2.ts # Cloudflare R2 上傳（fetchAsBuffer, uploadToR2, generateStorageKey）
│
├── lib/
│ ├── db.ts # Prisma 單例（PrismaPg Driver Adapter）
│ ├── api-client.ts # 前端 API 請求封裝
│ ├── utils.ts # cn() 等工具函數
│ └── generated/prisma/ # Prisma 自動生成的 Client
│
├── constants/
│ ├── models.ts # AI 模型枚舉（SDXL, Animagine, Gemini）
│ ├── routes.ts # 路由常量
│ └── config.ts # 全局配置（積分數量等）
│
├── types/
│ └── index.ts # TypeScript 型別 + Zod Schema
│
└── middleware.ts # Clerk 路由保護

尚未實現的頁面/組件：

- profile/page.tsx — 個人中心
- MobileTabBar.tsx — 移動端底部導航（與新導航連貫）

🔐 安全規範

NEXT*PUBLIC* 前綴僅用於：Clerk 公鑰、CDN 域名、App URL
所有 AI API Keys、數據庫密碼嚴禁加 NEXT*PUBLIC* 前綴
API Route 必須先用 auth() from Clerk 驗證身份再處理請求
積分扣除邏輯必須在服務端執行，不信任客戶端傳來的積分數值

💡 當 Claude Code 不確定時

優先查閱 src/constants/ 看有沒有已定義的變量
優先複用 src/components/ui/ 的已有組件
不確定架構時，遵循「先 Service，後 Hook，最後 UI」的順序
遇到類型問題時，用 zod 定義 schema 再推導類型，不使用 as 強轉

📋 當前開發狀態

✅ Phase 1: MVP（核心生成功能）— 已完成
✅ Phase 2: 持久化存儲（Prisma + R2）— 已完成
🔧 Phase 3: 用戶系統 + 積分 — 大部分完成

- ✅ Clerk 登錄/註冊 + Navbar UserButton
- ✅ Clerk Webhook 同步 user.created
- ✅ 積分扣除/增加服務端邏輯 + GET /api/credits
- ✅ 路由保護中間件
- ✅ Gallery 頁面已實現（GalleryFeed + GalleryGrid + ImageCard + use-gallery + API）
- ❌ Profile 頁面未實現
⬜ Phase 4: UI 優化 + Gallery + 部署

- ✅ Hero section 重構（左右分欄、Gallery Preview 獨立 section、節奏間距）
- ✅ 移動端響應式驗收（LocaleSwitcher、MobileTabBar、Navbar、HomepageShell 小屏適配）
- ✅ ImageCard + GalleryGrid 瀑布流組件
- ❌ MobileTabBar 與新導航連貫

🗄️ 數據庫模型

- User: id(UUID), clerkId, email, credits(默認100), generations[]
- Generation: id(UUID), outputType(IMAGE/VIDEO/AUDIO), status(PENDING/COMPLETED/FAILED),
  url, storageKey, mimeType, width, height, duration, prompt, negativePrompt,
  model, provider, creditsCost, isPublic, userId

🤖 AI 模型配置
| 模型 ID | 名稱 | 積分 | 提供商 |
|---------|------|------|--------|
| sdxl | Stable Diffusion XL | 1 | HuggingFace |
| animagine-xl-4.0 | Animagine XL 4.0 | 1 | HuggingFace |
| gemini-3.1-flash-image-preview | Gemini 3.1 Flash Image | 2 | Google Gemini |

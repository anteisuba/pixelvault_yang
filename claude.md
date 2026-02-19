CLAUDE.md — Personal AI Gallery Project Rules

這個文件是 Claude Code 的「行為規範」。每次啟動新對話時，Claude Code 會自動讀取並遵守這些規則。

🎯 項目概覽
Personal AI Gallery — 支持多 AI 模型的圖片生成 & 永久歸檔平台。

Web (Next.js) + Mobile (Capacitor) 共用一套代碼
支持 DALL-E 3、FLUX.1、Stable Diffusion 3.5
用戶系統 (Clerk) + 積分系統 + 圖片永久存儲 (Cloudflare R2)

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

📁 目錄結構（完整版）
src/
├── app/
│ └── [locale]/
│ ├── (auth)/
│ │ ├── sign-in/page.tsx
│ │ └── sign-up/page.tsx
│ ├── (main)/
│ │ ├── studio/page.tsx # 創作台（需登錄）
│ │ ├── gallery/page.tsx # 作品集（公開）
│ │ └── profile/page.tsx # 個人中心（需登錄）
│ ├── api/
│ │ ├── generate/route.ts # POST 生成圖片
│ │ ├── images/route.ts # GET 圖片列表
│ │ └── webhooks/clerk/route.ts # Clerk 用戶同步
│ └── layout.tsx
│
├── components/
│ ├── ui/ # shadcn/ui 原子組件
│ ├── business/
│ │ ├── ImageCard.tsx
│ │ ├── GenerateForm.tsx
│ │ ├── ModelSelector.tsx
│ │ └── GalleryGrid.tsx
│ └── layout/
│ ├── Navbar.tsx
│ └── MobileTabBar.tsx
│
├── hooks/
│ ├── use-generate.ts
│ ├── use-gallery.ts
│ └── use-credits.ts
│
├── services/
│ ├── image.service.ts
│ ├── user.service.ts
│ └── storage/
│ └── r2.ts
│
├── lib/
│ ├── db.ts # Prisma singleton
│ ├── utils.ts
│ └── api-client.ts
│
├── constants/
│ ├── models.ts # AI 模型枚舉
│ ├── routes.ts # 路由常量
│ └── config.ts # 全局配置（積分數量等）
│
├── types/
│ └── index.ts
│
└── env.mjs # T3 環境變量校驗

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

Phase 1: MVP（核心生成功能）
Phase 2: 持久化存儲
Phase 3: 用戶系統 + 積分
Phase 4: UI 優化 + 移動端打包

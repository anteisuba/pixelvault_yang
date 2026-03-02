# Personal AI Gallery

AI 圖片生成 Web 應用 — 輸入文字描述，生成精美圖片，永久存儲到個人相冊。

## 功能特點

- **AI 圖片生成** — 輸入 prompt 即時生成圖片
- **多模型支持** — Stable Diffusion XL、Animagine XL 4.0（動漫風格）、Gemini 3.1 Flash Image
- **永久存儲** — 生成結果自動上傳到 Cloudflare R2，寫入 PostgreSQL
- **用戶認證** — Clerk 登錄／註冊，保護創作台路由
- **積分系統** — 每次生成消耗積分（1-2 積分），服務端校驗
- **響應式 UI** — shadcn/ui 組件庫 + Tailwind CSS

## 技術棧

| 分類    | 技術                               |
| ------- | ---------------------------------- |
| 框架    | Next.js 16 (App Router, Turbopack) |
| 語言    | TypeScript (strict mode)           |
| UI      | shadcn/ui + Tailwind CSS 4         |
| AI 服務 | HuggingFace Inference API / Google Gemini API |
| 認證    | Clerk                              |
| 資料庫  | Prisma 7 (PrismaPg Driver Adapter) + PostgreSQL (Neon) |
| 存儲    | Cloudflare R2                      |
| 驗證    | Zod 4                              |

## 快速開始

### 環境需求

- Node.js 18.17+
- npm
- PostgreSQL 資料庫（推薦 Neon）
- Cloudflare R2 Bucket
- Clerk 帳號
- HuggingFace Access Token
- Google Gemini API Key（可選）

### 安裝與啟動

```bash
# 安裝依賴
npm install

# 配置環境變數
cp .env.local.example .env.local
# 編輯 .env.local，填入所有必填變數

# 執行資料庫 migration
npx prisma migrate dev

# 啟動開發伺服器
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000) 即可使用。

### 環境變數

| 變數 | 說明 | 必填 |
| ---- | ---- | ---- |
| `DATABASE_URL` | PostgreSQL 連接字串（Neon） | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 公鑰 | Yes |
| `CLERK_SECRET_KEY` | Clerk 私鑰 | Yes |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhook 簽名密鑰 | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/en/sign-in` | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/en/sign-up` | Yes |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/en/studio` | Yes |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/en/studio` | Yes |
| `HF_API_TOKEN` | HuggingFace Access Token | Yes |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key | No |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID | Yes |
| `R2_ACCESS_KEY_ID` | R2 Access Key | Yes |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key | Yes |
| `R2_BUCKET_NAME` | R2 Bucket 名稱 | Yes |
| `NEXT_PUBLIC_STORAGE_BASE_URL` | R2 公開域名 | Yes |

## 專案結構

```
src/
├── app/
│   ├── layout.tsx              # 根佈局
│   ├── page.tsx                # 根頁面（重定向到 /en/sign-in）
│   ├── [locale]/
│   │   ├── layout.tsx          # locale 佈局
│   │   ├── (auth)/
│   │   │   ├── sign-in/[[...sign-in]]/   # Clerk 登錄頁
│   │   │   └── sign-up/[[...sign-up]]/   # Clerk 註冊頁
│   │   └── (main)/
│   │       ├── layout.tsx      # 包含 Navbar 的佈局
│   │       └── studio/         # 創作台（需登錄）
│   └── api/
│       ├── generate/           # POST 圖片生成 → AI → R2 → DB
│       ├── credits/            # GET 當前用戶積分
│       └── webhooks/clerk/     # Clerk user.created 同步
├── components/
│   ├── business/               # GenerateForm, ModelSelector
│   ├── layout/                 # Navbar
│   └── ui/                     # shadcn/ui 基礎組件（button, select, textarea）
├── constants/                  # models, routes, config
├── hooks/                      # useGenerateImage, useCredits
├── lib/
│   ├── db.ts                   # Prisma 單例（PrismaPg Driver Adapter）
│   ├── api-client.ts           # 前端 API 請求封裝
│   ├── utils.ts                # cn() 等工具函數
│   └── generated/prisma/       # Prisma 生成的 Client
├── middleware.ts               # Clerk 路由保護
├── services/
│   ├── generation.service.ts   # Generation CRUD
│   ├── user.service.ts         # User CRUD + 積分操作
│   └── storage/r2.ts           # Cloudflare R2 上傳
└── types/                      # TypeScript 型別 + Zod Schema
```

## AI 模型

| 模型 | 積分 | 提供商 | 說明 |
|------|------|--------|------|
| Stable Diffusion XL | 1 | HuggingFace | 高解析度通用圖片生成 |
| Animagine XL 4.0 | 1 | HuggingFace | 高品質動漫風格圖片 |
| Gemini 3.1 Flash Image | 2 | Google Gemini | Google 最新圖片生成模型 |

## 資料庫模型

- **User** — clerkId, email, credits (默認 100)
- **Generation** — prompt, model, provider, outputType (IMAGE/VIDEO/AUDIO), status (PENDING/COMPLETED/FAILED), url, storageKey, creditsCost, isPublic

## 開發進度

- [x] **Phase 1** — MVP（圖片生成核心功能）
  - AI 圖片生成（HuggingFace SDXL / Animagine XL 4.0 / Gemini）
  - 多模型選擇、Prompt 輸入、響應式 UI
- [x] **Phase 2** — 資料庫 + 存儲
  - Prisma 7 + PostgreSQL (Neon) — Generation / User 表
  - Cloudflare R2 永久存儲，自動生成 storage key
  - generation.service / user.service / r2 storage service
- [x] **Phase 3** — 用戶認證 + 積分系統（大部分完成）
  - Clerk 登錄／註冊頁面 + Navbar UserButton
  - Clerk Webhook 同步 user.created 到資料庫
  - 積分 deduct / add 服務端邏輯 + GET /api/credits
  - 路由保護（/en/studio 需登錄）
- [ ] **Phase 4** — Gallery + UI 優化 + 部署
  - 公開 Gallery 頁面（瀑布流）
  - 個人 Profile 頁面
  - Vercel 部署
  - 移動端打包（Capacitor）

## 部署後待處理

詳見 [TODO.md](./TODO.md)

## License

MIT

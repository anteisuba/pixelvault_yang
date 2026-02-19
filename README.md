# Personal AI Gallery 🎨

AI 圖片生成 Web 應用 — 輸入文字描述，生成精美圖片，永久存儲到個人相冊。

## ✨ 功能特點

- 🖼️ **AI 圖片生成** — 輸入 prompt 即時生成圖片
- 🤖 **多模型支持** — Stable Diffusion XL、Animagine XL 4.0（動漫風格）
- 💾 **永久存儲** — 生成結果自動上傳到 Cloudflare R2，寫入 PostgreSQL
- 🔐 **用戶認證** — Clerk 登錄／註冊，保護創作台路由
- 💰 **積分系統** — 每次生成消耗積分，服務端校驗
- 🌍 **國際化** — 支持多語言（next-intl）
- 🎨 **精美 UI** — shadcn/ui 組件庫 + 響應式設計

## 🛠️ 技術棧

| 分類    | 技術                               |
| ------- | ---------------------------------- |
| 框架    | Next.js 16 (App Router, Turbopack) |
| 語言    | TypeScript (strict mode)           |
| UI      | shadcn/ui + Tailwind CSS           |
| AI 服務 | HuggingFace Inference API / SiliconFlow |
| 認證    | Clerk                              |
| 資料庫  | Prisma 7 + PostgreSQL (Neon)       |
| 存儲    | Cloudflare R2                      |
| 驗證    | Zod                                |

## 🚀 快速開始

### 環境需求

- Node.js 18.17+
- npm
- PostgreSQL 資料庫（推薦 Neon）
- Cloudflare R2 Bucket
- Clerk 帳號

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
| `DATABASE_URL` | PostgreSQL 連接字串（Neon） | ✅ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 公鑰 | ✅ |
| `CLERK_SECRET_KEY` | Clerk 私鑰 | ✅ |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhook 簽名密鑰 | ✅ |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/en/sign-in` | ✅ |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/en/sign-up` | ✅ |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/en/studio` | ✅ |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/en/studio` | ✅ |
| `HF_API_TOKEN` | HuggingFace Access Token | ✅ |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key | ❌ |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID | ✅ |
| `R2_ACCESS_KEY_ID` | R2 Access Key | ✅ |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key | ✅ |
| `R2_BUCKET_NAME` | R2 Bucket 名稱 | ✅ |
| `NEXT_PUBLIC_STORAGE_BASE_URL` | R2 公開域名 | ✅ |

## 📁 專案結構

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/
│   │   │   ├── sign-in/   # Clerk 登錄頁
│   │   │   └── sign-up/   # Clerk 註冊頁
│   │   └── (main)/
│   │       └── studio/    # 創作台（需登錄）
│   └── api/
│       ├── generate/      # POST 圖片生成 → AI → R2 → DB
│       └── webhooks/clerk/ # Clerk user.created 同步
├── components/
│   ├── business/          # GenerateForm, ModelSelector
│   ├── layout/            # Navbar
│   └── ui/                # shadcn/ui 基礎組件
├── constants/             # models, routes, config
├── hooks/                 # useGenerateImage
├── lib/
│   ├── db.ts              # Prisma 單例（Driver Adapter）
│   └── generated/prisma/  # Prisma 生成的 Client
├── middleware.ts           # Clerk 路由保護
├── services/
│   ├── generation.service.ts  # Generation CRUD
│   ├── user.service.ts        # User CRUD + 積分操作
│   └── storage/r2.ts          # Cloudflare R2 上傳
└── types/                 # TypeScript 型別 + Zod Schema
```

## 📋 開發進度

- [x] **Phase 1** — MVP（圖片生成核心功能）
  - AI 圖片生成（HuggingFace SDXL / Animagine XL 4.0）
  - 多模型選擇、Prompt 輸入、響應式 UI
- [x] **Phase 2** — 資料庫 + 存儲
  - Prisma 7 + PostgreSQL (Neon) — Generation / User 表
  - Cloudflare R2 永久存儲，自動生成 storage key
  - generation.service / user.service / r2 storage service
- [x] **Phase 3** — 用戶認證 + 積分系統
  - Clerk 登錄／註冊頁面 + Navbar UserButton
  - Clerk Webhook 同步 user.created 到資料庫
  - 積分 deduct / add 服務端邏輯
  - 路由保護（/en/studio 需登錄）
- [ ] **Phase 4** — Gallery + 部署優化
  - 公開 Gallery 頁面
  - Vercel 部署
  - 移動端打包（Capacitor）

## ⚠️ 部署後待處理

詳見 [TODO.md](./TODO.md)

## 📄 License

MIT

# Personal AI Gallery 🎨

AI 圖片生成 Web 應用 — 輸入文字描述，生成精美圖片。

## ✨ 功能特點

- 🖼️ **AI 圖片生成** — 輸入 prompt 即時生成圖片
- 🤖 **多模型支持** — Stable Diffusion XL、Animagine XL 4.0（動漫風格）
- 🌍 **國際化** — 支持多語言（next-intl）
- 🎨 **精美 UI** — shadcn/ui 組件庫 + 響應式設計

## 🛠️ 技術棧

| 分類    | 技術                               |
| ------- | ---------------------------------- |
| 框架    | Next.js 16 (App Router, Turbopack) |
| 語言    | TypeScript (strict mode)           |
| UI      | shadcn/ui + Tailwind CSS           |
| AI 服務 | HuggingFace Inference API          |
| 驗證    | Zod                                |
| 認證    | Clerk（Phase 3）                   |
| 資料庫  | Prisma + PostgreSQL（Phase 2）     |
| 存儲    | Cloudflare R2（Phase 2）           |

## 🚀 快速開始

### 環境需求

- Node.js 18.17+
- npm

### 安裝與啟動

```bash
# 安裝依賴
npm install

# 配置環境變數
cp .env.local.example .env.local
# 編輯 .env.local，填入 HuggingFace API Token

# 啟動開發伺服器
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000) 即可使用。

### 環境變數

| 變數                                | 說明                                                                       | 必填    |
| ----------------------------------- | -------------------------------------------------------------------------- | ------- |
| `HF_API_TOKEN`                      | HuggingFace Access Token（[申請](https://huggingface.co/settings/tokens)） | ✅      |
| `SILICONFLOW_API_KEY`               | SiliconFlow API Key                                                        | ❌      |
| `DATABASE_URL`                      | PostgreSQL 連接字串                                                        | Phase 2 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 公鑰                                                                 | Phase 3 |

## 📁 專案結構

```
src/
├── app/
│   ├── [locale]/(main)/studio/  # Studio 頁面
│   └── api/generate/            # 圖片生成 API
├── components/
│   ├── business/                # 業務組件（GenerateForm, ModelSelector）
│   └── ui/                      # shadcn/ui 基礎組件
├── constants/                   # 常量（models, routes, config）
├── hooks/                       # React Hooks（useGenerateImage）
├── lib/                         # 工具函數（api-client, utils）
├── services/                    # 服務層（Phase 2）
└── types/                       # TypeScript 型別定義 + Zod Schema
```

## 📋 開發進度

- [x] **Phase 1** — MVP（圖片生成核心功能）
- [ ] **Phase 2** — 資料庫 + 存儲 + 積分系統
- [ ] **Phase 3** — 用戶認證 + Gallery 展示
- [ ] **Phase 4** — 部署 + 優化

## 📄 License

MIT

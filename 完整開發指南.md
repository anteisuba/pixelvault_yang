# Personal AI Gallery — 從零開始完整指南

> 適用工具：Claude Code (命令行) + Google IDE (Firebase Studio / IDX)
> 經驗假設：有 React/Next.js 基礎
>
> **當前狀態：Phase 1-3 已完成（核心生成 + 存儲 + 用戶系統），Phase 4 Gallery/部署待開發**
> **實際使用的 AI 模型：SDXL、Animagine XL 4.0（HuggingFace）、Gemini 3.1 Flash Image（Google）**

---

## 🚀 PHASE 0：環境準備（第一天，約 2 小時）

### Step 0.1 — 安裝必要工具

```bash
# 確認 Node.js 版本（需要 18.17+）
node -v

# 如果版本太低，用 nvm 升級
nvm install 20
nvm use 20

# 安裝 Claude Code（如果還沒裝）
npm install -g @anthropic-ai/claude-code

# 確認安裝成功
claude --version
```

### Step 0.2 — 創建 Next.js 項目

```bash
# 使用官方腳手架，選擇 App Router
npx create-next-app@latest personal-ai-gallery \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd personal-ai-gallery
```

**create-next-app 問答選項：**
- Would you like to use TypeScript? → **Yes**
- Would you like to use ESLint? → **Yes**
- Would you like to use Tailwind CSS? → **Yes**
- Would you like to use `src/` directory? → **Yes**
- Would you like to use App Router? → **Yes**
- Would you like to customize the import alias? → **Yes** (`@/*`)

### Step 0.3 — 安裝所有依賴（一次性）

```bash
# UI 組件庫 shadcn/ui 初始化
npx shadcn@latest init
# 選擇：Default style, Zinc color, CSS variables: Yes

# 安裝常用 shadcn 組件
npx shadcn@latest add button input textarea select card dialog skeleton toast

# 數據庫 ORM（Prisma 7 + PrismaPg Driver Adapter）
npm install prisma @prisma/client @prisma/adapter-pg pg

# 身份認證 Clerk
npm install @clerk/nextjs

# AI SDK（openai SDK 備用，主要用 HuggingFace 和 Gemini 原生 API）
npm install openai

# 圖片存儲 (AWS S3 兼容，用於 Cloudflare R2)
npm install @aws-sdk/client-s3

# 環境變量校驗
npm install @t3-oss/env-nextjs zod

# 多語言
npm install next-intl

# Webhook 驗證（Clerk Webhook 用）
npm install svix

# 主題切換
npm install next-themes

# 工具庫
npm install clsx tailwind-merge lucide-react class-variance-authority sonner radix-ui

# 初始化 Prisma
npx prisma init
```

### Step 0.4 — 放入 CLAUDE.md

```bash
# 把之前生成的 CLAUDE.md 放到項目根目錄
cp ~/Downloads/CLAUDE.md ./CLAUDE.md
```

### Step 0.5 — 啟動 Claude Code

```bash
# 在項目根目錄啟動
claude

# Claude Code 會自動讀取 CLAUDE.md 的規範
# 你現在可以用自然語言指揮它寫代碼了
```

---

## 📦 PHASE 1：MVP 核心跑通（第 2-4 天）

**目標：** 用戶能輸入 Prompt，選擇模型，看到生成的圖片（暫時不存數據庫）

### Step 1.1 — 設置環境變量

創建 `.env.local`（從以下模板複製）：

```bash
# 數據庫（Phase 2 再配置，先留空）
DATABASE_URL="postgresql://..."

# Clerk 認證（Phase 3 再配置，先留空）
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""

# AI Keys（現在就要配置）
HF_API_TOKEN="hf_..."          # HuggingFace Access Token（SDXL / Animagine）
SILICONFLOW_API_KEY="sk-..."   # SiliconFlow API Key（備用）
# Google Gemini API 通過 Google Cloud 配置

# 存儲（Phase 2 再配置，先留空）
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
NEXT_PUBLIC_STORAGE_BASE_URL=""

# 通用
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 1.2 — 創建目錄結構

```bash
# 一鍵創建所有目錄
mkdir -p src/constants src/types src/services/storage \
         src/hooks src/lib \
         src/components/ui src/components/business src/components/layout
```

### Step 1.3 — Claude Code 任務指令（按順序執行）

打開 Claude Code，**按以下順序**給它發指令：

---

**指令 1：創建常量文件** ✅ 已完成
```
已創建的文件：

1. src/constants/models.ts
   - AI_MODELS 枚舉：sdxl, animagine-xl-4.0, gemini-3.1-flash-image-preview
   - MODEL_OPTIONS 數組：每個模型包含 id, label, cost, provider, description, available
   - HF_MODEL_MAP：HuggingFace 模型 ID 映射

2. src/constants/routes.ts
   - ROUTES 對象（studio, gallery, profile, credits 等）

3. src/constants/config.ts
   - 全局配置（積分數量等）
```

---

**指令 2：創建類型定義**
```
根據 CLAUDE.md 規範和 constants/models.ts，創建 src/types/index.ts，包含：
- GenerateRequest 接口（prompt, modelId, aspectRatio）
- GenerateResponse 接口（success, data: { imageUrl, prompt, model }）
- ImageRecord 接口（對應數據庫的 Image 表結構）
- ModelOption 接口（對應 MODEL_OPTIONS 的元素類型）
使用 zod 定義 GenerateRequestSchema 並推導 GenerateRequest 類型。
```

---

**指令 3：創建 API Client**
```
創建 src/lib/api-client.ts，封裝以下函數：
- generateImageAPI(params: GenerateRequest): Promise<GenerateResponse>
  - 調用 POST /api/generate
  - 包含錯誤處理

創建 src/lib/utils.ts，包含：
- cn() 函數（合併 tailwind class，使用 clsx + tailwind-merge）
```

---

**指令 4：創建生成圖片的 API Route** ✅ 已完成
```
已創建 src/app/api/generate/route.ts：

功能（實際實現）：
1. Clerk auth() 身份驗證
2. Zod 校驗請求體
3. 查詢模型積分消耗，先扣除積分
4. 根據 modelId 路由到 AI 提供商：
   - sdxl / animagine-xl-4.0 → HuggingFace Inference API
   - gemini-3.1-flash-image-preview → Google Gemini API
5. 上傳圖片到 Cloudflare R2
6. 寫入 Generation 記錄到數據庫
7. 返回完整 GenerationRecord
```

---

**指令 5：創建 useGenerateImage Hook**
```
創建 src/hooks/use-generate.ts：

功能：
- isGenerating: boolean 狀態
- error: string | null 狀態
- generatedImageUrl: string | null 狀態
- generate(params: GenerateRequest) 函數
  - 調用 api-client 的 generateImageAPI
  - 管理 loading/error/success 狀態

從 src/types 導入類型，從 src/lib/api-client 導入 API 函數。
```

---

**指令 6：創建 UI 組件**
```
創建 src/components/business/ModelSelector.tsx：
- 使用 shadcn/ui 的 Select 組件
- 從 src/constants/models.ts 導入 MODEL_OPTIONS
- Props: { value: string, onChange: (value: string) => void }
- 只顯示 available: true 的模型

創建 src/components/business/GenerateForm.tsx：
- 使用 useGenerateImage hook
- 包含：ModelSelector + Textarea（輸入 prompt）+ 生成按鈕
- 生成中顯示 loading 狀態
- 生成完成後顯示圖片（帶漸入動畫）
- 顯示錯誤信息
```

---

**指令 7：創建首頁**
```
修改 src/app/[locale]/(main)/studio/page.tsx（先創建這個路由結構）：
- 頁面標題：Personal AI Gallery
- 居中佈局，最大寬度 2xl
- 嵌入 GenerateForm 組件

同時創建基本的 src/app/layout.tsx 和 src/app/[locale]/layout.tsx。

暫時先做英文版（locale 先固定用 en），多語言 Phase 3 再完善。
```

---

### Step 1.4 — 測試 Phase 1

```bash
npm run dev
# 打開 http://localhost:3000
# 測試：輸入 prompt，選模型，點擊生成，應該能看到圖片
```

---

## 🗄️ PHASE 2：持久化存儲（第 5-7 天）

**目標：** 生成的圖片永久保存到 R2，記錄存入數據庫

### Step 2.1 — 配置數據庫（Neon 免費版）

1. 去 [neon.tech](https://neon.tech) 注冊，創建數據庫
2. 複製 Connection String 到 `.env.local` 的 `DATABASE_URL`

### Step 2.2 — 配置 Prisma Schema

```bash
# 用 Claude Code 生成 schema
```

**實際 Prisma Schema（已完成）：**
```
數據庫：PostgreSQL + PrismaPg Driver Adapter

枚舉：
- OutputType: IMAGE, VIDEO, AUDIO
- GenerationStatus: PENDING, COMPLETED, FAILED

User 模型：
- id: UUID (primary key)
- clerkId: String（唯一）
- email: String（唯一）
- credits: Int（默認 100）
- createdAt, updatedAt
- generations: Generation[]（一對多）

Generation 模型（原計劃中的 Image 改為更通用的 Generation）：
- id: UUID (primary key)
- createdAt: DateTime
- outputType: OutputType（支持未來擴展到視頻/音頻）
- status: GenerationStatus
- url: String（R2 永久鏈接）
- storageKey: String（R2 文件路徑）
- mimeType: String?
- prompt: String
- negativePrompt: String?
- model: String
- provider: String
- width: Int（默認 1024）
- height: Int（默認 1024）
- duration: Float?（視頻用）
- creditsCost: Int（默認 1）
- isPublic: Boolean（默認 true）
- userId: String（外鍵 → User）
- 索引：userId, (outputType + isPublic + createdAt DESC)
```

```bash
# 執行數據庫遷移
npx prisma migrate dev --name init

# 生成 Prisma Client
npx prisma generate
```

### Step 2.3 — 配置 Cloudflare R2

1. 去 [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. 創建 Bucket：`personal-ai-gallery`
3. 創建 API Token（需要 Object Read & Write 權限）
4. 開啟 Bucket 的 Public Access
5. 把所有 R2 相關值填入 `.env.local`

**Claude Code 指令：**
```
創建 src/services/storage/r2.ts：
- 使用 @aws-sdk/client-s3（R2 兼容 S3 接口）
- 配置 endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- 實現 uploadImageFromUrl(url: string, key: string) 函數：
  1. 從給定 URL 下載圖片（用 fetch）
  2. 上傳到 R2 bucket
  3. 返回公開訪問的永久 URL（NEXT_PUBLIC_STORAGE_BASE_URL + key）
- 實現 generateStorageKey() 函數：生成唯一文件名（日期+nanoid）
```

```
已創建 src/lib/db.ts：
- Prisma 單例，使用 PrismaPg Driver Adapter
```

```
已創建 src/services/generation.service.ts（原計劃的 image.service.ts）：
- createGeneration() — 存儲完成的生成記錄到數據庫
- getUserGenerations() — 分頁查詢用戶生成歷史
- getPublicGenerations() — 分頁查詢公開 Gallery 圖片
- getGenerationById() — 單條查詢

API Route 已整合：generate/route.ts 調用 AI → R2 上傳 → 數據庫寫入
```

### Step 2.4 — 創建圖片列表 API

```
創建 src/app/api/images/route.ts（GET 請求）：
- 支持分頁（page, limit 查詢參數，默認 limit=20）
- 只返回 isPublic: true 的圖片
- 返回格式：{ data: ImageRecord[], total: number, hasMore: boolean }
```

---

## 👤 PHASE 3：用戶系統 + 積分（第 8-10 天）

**目標：** 登錄才能生成，每次扣積分

### Step 3.1 — 配置 Clerk

1. 去 [clerk.com](https://clerk.com) 注冊，創建 Application
2. 開啟 Google/GitHub 登錄
3. 把 Keys 填入 `.env.local`

**Claude Code 指令：**
```
配置 Clerk 到 Next.js 項目：

1. 修改 src/app/layout.tsx，用 ClerkProvider 包裹
2. 創建 src/middleware.ts，保護 /studio 和 /profile 路由
   - 公開路由：/, /gallery, /sign-in, /sign-up, /api/images（GET）
   - 保護路由：/studio, /profile, /api/generate（POST）

3. 創建 src/app/[locale]/(auth)/sign-in/page.tsx
   使用 Clerk 的 <SignIn /> 組件

4. 創建 src/app/[locale]/(auth)/sign-up/page.tsx
   使用 Clerk 的 <SignUp /> 組件

5. 創建 src/app/api/webhooks/clerk/route.ts
   監聽 user.created 事件，在數據庫創建對應 User 記錄（初始 10 積分）
```

### Step 3.2 — 積分系統

```
修改 src/services/user.service.ts，添加：
- getUserCredits(clerkId: string): Promise<number>
- deductCredits(clerkId: string, amount: number): Promise<void>
  - 如果積分不足，拋出自定義錯誤 InsufficientCreditsError
- addCredits(clerkId: string, amount: number): Promise<void>

修改 src/app/api/generate/route.ts，添加：
1. 用 auth() from @clerk/nextjs/server 獲取當前用戶
2. 查詢該 model 的 cost（從 MODEL_OPTIONS 中取）
3. 調用 UserService.deductCredits()
4. 如果積分不足，返回 402 狀態碼

創建 src/hooks/use-credits.ts：
- 獲取當前用戶積分的 hook
- 在 Studio 頁面頂部顯示剩餘積分
```

---

## 🎨 PHASE 4：UI 優化 + 畫廊頁（第 11-14 天）

### Step 4.1 — 畫廊頁

```
創建 src/hooks/use-gallery.ts：
- 調用 GET /api/images
- 支持無限滾動（IntersectionObserver）
- 返回：images, isLoading, hasMore, loadMore

創建 src/components/business/ImageCard.tsx：
- 顯示圖片縮略圖
- hover 效果：顯示 prompt 預覽和下載按鈕
- 點擊打開 Modal 顯示大圖詳情

創建 src/components/business/GalleryGrid.tsx：
- CSS Masonry 瀑布流佈局（使用 CSS columns 實現）
- 響應式：4列（桌面）→ 3列（平板）→ 2列（手機）
- 整合 use-gallery hook

創建 src/app/[locale]/(main)/gallery/page.tsx
```

### Step 4.2 — 導航欄

```
創建 src/components/layout/Navbar.tsx：
- 左側：Logo（鏈接到首頁）
- 右側：用戶登錄狀態（Clerk 的 <UserButton />）+ 積分顯示
- 響應式：手機端隱藏文字，只顯示圖標

創建 src/components/layout/MobileTabBar.tsx：
- 手機端底部 Tab Bar（僅在移動端顯示）
- 4個 Tab：Gallery、Studio、Profile、Credits
- 使用 ROUTES 常量，不硬編碼路徑
```

---

## 📱 PHASE 5：移動端打包（第 15-16 天）

### Step 5.1 — 配置 Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/haptics @capacitor/share

# 初始化 Capacitor
npx cap init "Personal AI Gallery" "com.yourname.aigallery"

# 構建 Next.js（靜態輸出）
npm run build

# 添加平台
npx cap add ios
npx cap add android
```

**修改 `next.config.ts`：**
```js
// 添加靜態輸出支持
output: 'export',
images: { unoptimized: true }
```

### Step 5.2 — 移動端特性

**Claude Code 指令：**
```
創建 src/hooks/use-haptics.ts：
- 封裝 @capacitor/haptics
- 提供 triggerSuccess() 和 triggerError() 函數
- 在非移動端優雅降級（no-op）

修改 src/components/business/GenerateForm.tsx：
- 生成成功後調用 triggerSuccess()
- 生成失敗後調用 triggerError()

修改 src/components/business/ImageCard.tsx：
- 在移動端長按圖片時，使用 @capacitor/share 調用系統分享/保存
```

```bash
# 同步代碼到 native 項目
npx cap sync

# 打開 Xcode（iOS）
npx cap open ios

# 打開 Android Studio
npx cap open android
```

---

## 🌏 PHASE 6：多語言（選做）

```
使用 next-intl 配置三語言支持（zh/en/ja）：
1. 創建 messages/zh.json、messages/en.json、messages/ja.json
2. 配置 src/i18n.ts 和 src/middleware.ts（合併 Clerk 和 i18n 的 middleware）
3. 修改所有頁面使用 useTranslations() 替換硬編碼文字
4. 在 Navbar 添加語言切換器
```

---

## 🔧 常用 Claude Code 對話技巧

### 開始一個功能前：
```
我要開始開發 [功能名]，請先：
1. 讀取 CLAUDE.md 確認規範
2. 查看 src/constants/ 有哪些已定義的常量
3. 告訴我你打算創建哪些文件，我確認後再開始寫代碼
```

### 代碼 Review 時：
```
請 Review 剛才寫的代碼，檢查：
1. 有沒有違反 CLAUDE.md 的規範？
2. 有沒有 Magic Values？
3. 有沒有用到 any 類型？
4. 邏輯有沒有放錯層（比如業務邏輯寫在組件裡）？
```

### 遇到 Bug 時：
```
我遇到了以下錯誤：
[粘貼錯誤信息]

相關文件：[文件路徑]
請幫我診斷原因，並提出修復方案，修復前先告訴我你的思路。
```

---

## ✅ 每個 Phase 完成的驗收標準

| Phase | 驗收標準 | 狀態 |
|-------|---------|------|
| Phase 1 | 輸入 Prompt 能生成圖片，顯示在頁面上 | ✅ 已完成 |
| Phase 2 | 圖片存入 R2，數據庫有記錄，F5 刷新不消失 | ✅ 已完成 |
| Phase 3 | 未登錄無法訪問 /studio，登錄後每次生成扣積分 | ✅ 大部分完成（Gallery/Profile 頁面待建） |
| Phase 4 | 畫廊瀑布流展示，點擊圖片有詳情彈窗 | ⬜ 待開發 |
| Phase 5 | 打包成 App 可在手機運行，生成成功有震動 | ⬜ 選做 |

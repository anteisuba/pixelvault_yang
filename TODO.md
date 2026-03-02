# TODO

## Phase 3 剩餘項目

- [ ] Gallery 頁面（公開作品集）
  - 創建 `src/app/[locale]/(main)/gallery/page.tsx`
  - 創建 `src/components/business/GalleryGrid.tsx`（瀑布流佈局）
  - 創建 `src/components/business/ImageCard.tsx`（圖片卡片 + hover 效果）
  - 創建 `src/hooks/use-gallery.ts`（無限滾動 + 分頁）
  - 創建 `GET /api/images` API Route（分頁查詢 isPublic: true 的 generation）
  - 注意：generation.service.ts 已有 `getPublicGenerations()` 方法

- [ ] Profile 個人中心頁面
  - 創建 `src/app/[locale]/(main)/profile/page.tsx`
  - 顯示用戶生成歷史（getUserGenerations）
  - 顯示積分餘額

## Phase 4 項目

- [ ] UI 優化
  - 創建 `src/components/layout/MobileTabBar.tsx`（移動端底部導航）
  - 圖片詳情彈窗（點擊 ImageCard → Modal 大圖 + prompt + 模型資訊）
  - 首頁 Landing Page（目前根路徑直接重定向到 sign-in）

- [ ] 部署
  - Vercel 部署配置
  - 環境變數設定

- [ ] 移動端打包（Capacitor，選做）

## 部署後立即處理

- [ ] Clerk Webhook 設定
  1. Clerk Dashboard → Webhooks → Add Endpoint
  2. URL: `https://你的域名/api/webhooks/clerk`
  3. 勾選事件: `user.created`
  4. 複製 Signing Secret 填入環境變數: `CLERK_WEBHOOK_SECRET=whsec_xxx`
  5. Vercel 環境變數也要加上 `CLERK_WEBHOOK_SECRET`

## 已知問題 / 改進

- [ ] `use-credits.ts` 中直接使用 `fetch()` 而非 `api-client.ts` 封裝，違反規範
- [ ] 根頁面 (`src/app/page.tsx`) 直接重定向到 `/en/sign-in`，應改為 Landing Page 或根據登錄狀態重定向

# TODO

## 部署後立即處理
- [ ] Clerk Webhook 設定
  1. Clerk Dashboard → Webhooks → Add Endpoint
  2. URL: https://你的域名/api/webhooks/clerk
  3. 勾選事件: user.created
  4. 複製 Signing Secret 填入環境變數: CLERK_WEBHOOK_SECRET=whsec_xxx
  5. Vercel 環境變數也要加上 CLERK_WEBHOOK_SECRET

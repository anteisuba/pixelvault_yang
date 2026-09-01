# Release Checklist — P0 不过打回

Ship / push / 部署前逐项过。

## P0（必须全过）

- [ ] 全量 vitest 绿（pre-push 钩子 ~4.5min，不跳过、不 --no-verify）
- [ ] 全量 tsc 绿（后台跑 + 显式捕获 exit code，~4 分钟）
- [ ] `npm run lint && npm run build` 绿（dev server 跑着时不 build）
- [ ] GitHub CI 绿：`ci.yml`（type check + lint + unit tests）
- [ ] `npx playwright test e2e/mobile.spec.ts --project=mobile` 绿
- [ ] 公开体验上线前，在正确的 Clerk **Production instance** 启用 Restricted 或 Waitlist、注册 Smart Bot Protection，并验证邮箱校验与一次真实注册；仓库使用 Clerk 预构建 `<SignIn />` / `<SignUp />`，无需自建 CAPTCHA DOM
- [ ] 生产已配置 Upstash Redis、`INTERNAL_CALLBACK_SECRET` 和 `EXECUTION_WORKER_BASE_URL`；内部签名防重放在生产缺 Redis 时会 fail closed
- [ ] 首次部署保持 `PLATFORM_GENERATION_ENABLED=false`；确认 Clerk 门禁、全局日预算告警、Provider/Worker/Redis 健康后再显式改为 `true`
- [ ] 核对免费体验保护值符合当次活动：全局每天 500 个免费位、每用户每天 20 次、**每用户最多 4 个活动 Job（2026-07-28 由 2 提到 4，且只在平台掏钱时生效——BYOK 不再受这道闸约束）**
- [ ] 核对失控速率闸（`RUNAWAY_GENERATION_GUARD`，2026-07-28 新增）：每账户 **500/小时 + 1500/天**，对所有路径生效（含 BYOK）。⚠ 这两个数是推的不是量的；上线后若有人反映「有东西在反复发起生成，已暂停」而并没有循环，说明定低了，**先看日志分布再调**

## P1（应过）

- [ ] 视觉回归 `e2e/visual.spec.ts` 绿；基线按 OS 分套（-win32/-darwin）
- [ ] Vercel 部署后 `deploy-check.yml`（Production smoke）通过
- [ ] `docs/status.md` 已更新；完成的 plans/ 任务包已删（结论沉淀进 references/）

## P2（加分）

- [ ] 部署后手动点过主路径（生成一张图端到端）
- [ ] `health-monitor.yml` 无新告警

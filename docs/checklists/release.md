# Release Checklist — P0 不过打回

发布前执行本地 P0；推送后核对该次 CI，部署后核对 Production 冒烟。发布后的证据不是发布前的循环前置条件。

## P0（必须全过）

- [ ] 全量 vitest 绿（pre-push 钩子，不跳过、不 --no-verify）
- [ ] 全量 tsc 绿（后台跑 + 显式捕获 exit code，~4 分钟）
- [ ] `npm run lint && npm run build` 绿（dev server 跑着时不 build）
- [ ] 推送后 GitHub CI 绿：`ci.yml`（lint/tsc、app 与 Worker 测试、audit + 迁移重放、build；main 上部署 execution worker）
- [ ] `npx playwright test e2e/mobile.spec.ts --project=mobile` 绿
- [ ] 公开体验上线前，在正确的 Clerk **Production instance** 启用 Restricted 或 Waitlist、注册 Smart Bot Protection，并验证邮箱校验与一次真实注册；仓库使用 Clerk 预构建 `<SignIn />` / `<SignUp />`，无需自建 CAPTCHA DOM
- [ ] 生产已配置 Upstash Redis、`INTERNAL_CALLBACK_SECRET` 和 `EXECUTION_WORKER_BASE_URL`；内部签名防重放在生产缺 Redis 时会 fail closed
- [ ] 生产 `PLATFORM_GENERATION_ENABLED` 取值符合预期（缺省 fail closed）；改为 `true` 前确认 Clerk 门禁、Provider/Worker/Redis 健康
- [ ] 核对平台掏钱路径的闸：每用户最多 4 个活动 Job（`PLATFORM_GENERATION_GUARD`，BYOK 不受约束）；`RUNNER_MONTHLY_LIMIT` 符合当期预算
- [ ] 核对失控速率闸（`RUNAWAY_GENERATION_GUARD`，2026-07-28 新增）：每账户 **500/小时 + 1500/天**，对所有路径生效（含 BYOK）。⚠ 这两个数是推的不是量的；上线后若有人反映「有东西在反复发起生成，已暂停」而并没有循环，说明定低了，**先看日志分布再调**

## P1（应过）

- [ ] 视觉回归 `e2e/visual.spec.ts` 绿；基线按 OS 分套（目前只提交了 -win32；其他 OS 先生成本机基线并在报告里说明）
- [ ] Vercel 部署后 `deploy-check.yml`（Production smoke）通过
- [ ] `docs/status.md` 已更新；稳定结论已沉淀进现有 references/

## P2（加分）

- [ ] 部署后手动点过主路径（生成一张图端到端）
- [ ] `health-monitor.yml` 无新告警

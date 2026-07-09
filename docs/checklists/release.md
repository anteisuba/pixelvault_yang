# Release Checklist — P0 不过打回

Ship / push / 部署前逐项过。

## P0（必须全过）

- [ ] 全量 vitest 绿（pre-push 钩子 ~4.5min，不跳过、不 --no-verify）
- [ ] 全量 tsc 绿（后台跑 + 显式捕获 exit code，~4 分钟）
- [ ] `npm run lint && npm run build` 绿（dev server 跑着时不 build）
- [ ] GitHub CI 绿：`ci.yml`（type check + lint + unit tests）
- [ ] `npx playwright test e2e/mobile.spec.ts --project=mobile` 绿

## P1（应过）

- [ ] 视觉回归 `e2e/visual.spec.ts` 绿；基线按 OS 分套（-win32/-darwin）
- [ ] Vercel 部署后 `deploy-check.yml`（Production smoke）通过
- [ ] `docs/status.md` 已更新；完成的 plans/ 任务包已删 / 归档 / 沉淀

## P2（加分）

- [ ] 部署后手动点过主路径（生成一张图端到端）
- [ ] `health-monitor.yml` 无新告警

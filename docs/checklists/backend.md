# Backend Checklist — P0 不过打回

Service / API route / provider 改动完成后逐项过，报告里逐条给结论。

## P0（必须全过）

- [ ] service 文件首行 `import 'server-only'`
- [ ] API route 只做三件事：`auth()` → Zod `.safeParse()` → call service
- [ ] 全程无 `.parse()`、无 `any`；schema 在 `src/types/`
- [ ] 所有外部调用 `withRetry()` 包裹
- [ ] 日志走 `src/lib/logger.ts`，无 `console.log`
- [ ] 对应 `.test.ts` 五段齐全：401 → 400 → service mock → success → 500
- [ ] credit 扣减只在服务端
- [ ] 无机密进 `NEXT_PUBLIC_`
- [ ] `npx vitest run` 相关文件绿；**声称完成前全量 vitest 绿**

## P1（应过）

- [ ] per-provider circuit breaker 接入（新 provider 必须）
- [ ] 用户 prompt 过 `prompt-guard.ts`；LLM 输出过 `llm-output-validator.ts`
- [ ] 错误信息可诊断（带上下文，不吞错、不静默降级）
- [ ] 高引用模块（`src/types/index.ts` / `user.service.ts` / `models.ts` / `r2.ts` 等）先 grep 影响面
- [ ] 加模型四件套同步：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter

## P2（加分）

- [ ] 失败形态有日志证据可复查
- [ ] 幂等 / 重复提交场景考虑过

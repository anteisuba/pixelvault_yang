# Scene · Service / 业务逻辑（service-change.md）

> 覆盖：`src/services/**` 的业务逻辑新增与修改。route 层走 `api-endpoint.md`；schema 变更走 `db-migration.md`；接模型走 `new-model.md`。对应 checklist：`checklists/backend.md`。

## 专属 5 问（开工硬门）

1. **扩现有 service 还是新建？**——先 `grep` exports 和调用方，确认没有已有 80% 的现成引擎（复用大于重造）；新建按 `<name>.service.ts` + 首行 `server-only` + named functions。
2. **影响面多大？**——对照高风险模块表（`references/backend.md`：types/index 333 · user.service 141 · generate-image orchestrator · models.ts 99 · r2.ts 55）；被引用 >5 处只做向后兼容修改。
3. **数据边界在哪？**——碰 Prisma 的哪些模型？ownership（userId）校验在本函数落还是上游已保证（写清楚，不默认）？需要改 schema → 停，走 `db-migration.md`。
4. **外部调用与韧性怎么配？**——有外部 API → `withRetry()` + per-provider breaker；有 LLM → 入口过 `prompt-guard`、出口过 `llm-output-validator`；logger 记什么上下文（可诊断性）。
5. **测试边界 case 清单？**——空输入 / 越权 / 不存在 / 失败路径 / 幂等，逐个列出再写测试（测边界不是测 happy path）。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`references/backend.md`（分层 + service 纪律）→ `forbidden.md` 后端/数据库节 → `references/domains/<域>.md` → `src/services/CLAUDE.md`；碰 DB 加 `references/database.md`。
3. **先读再写**：grep exports / 调用方 / 相似实现，把复用结论写进报告。
4. 起点：`templates/service.md` 骨架（未落地前抄同 service 目录里最规范的邻居）。
5. 实现：typed in/out（Zod in `@/types`）· logger · withRetry · credit 只在服务端 · 失败大声暴露（不吞错不静默降级）。
6. 自检：`checklists/backend.md` 逐项 + 同目录 `.test.ts` 覆盖第 5 问列出的边界。
7. 交付报告：改动清单 + 复用/影响面结论 + 测试结果 + 手动验证步骤。

## 必读清单

`references/backend.md` · `forbidden.md`（后端/数据库节）· `references/domains/<域>.md` · `src/services/CLAUDE.md`；涉及生成链路加 `references/providers.md`

## 禁改范围默认值

不动 `prisma/schema.prisma`（走 db-migration）· 不动 route 鉴权语义（走 api-endpoint）· 不绕过 adapter 直调 provider · 不把「属性」建模成「类型」（长期建模优先，拿不准先问）。

## 验证命令

`npx vitest run <相关目录>` 迭代 → **全量 vitest 才算绿** → 全量 tsc（后台 + exit code）→ 涉及生成链路时端到端生成一次实测。
